package app.couch.tv.library

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/** A game inside a folder the user picked with the system folder picker. */
data class FolderGame(val tree: Uri, val docId: String, val dirDocId: String)

/**
 * Game folders picked with the system folder picker (Storage Access Framework), so Couch needs
 * no "All files access" permission. The picked folder can be a `roms/` folder, its parent, or
 * one system folder (e.g. `roms/snes`). The persisted URI grants are the list of folders.
 *
 * Emulator cores need a real file path, so a game is copied into the cache the first time it
 * is played (like Couch server games). Old copies are evicted past [cacheLimitBytes].
 */
class Folders(private val context: Context) {
    private val resolver = context.contentResolver
    private val cacheRoot = File(context.externalCacheDir ?: context.cacheDir, "folder-roms")
    private val cacheLimitBytes = 4L * 1024 * 1024 * 1024

    private data class Entry(val docId: String, val name: String, val isDir: Boolean, val size: Long)

    fun list(): List<Uri> = resolver.persistedUriPermissions.filter { it.isReadPermission }.map { it.uri }

    fun add(tree: Uri) = resolver.takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION)

    fun remove(tree: Uri) = runCatching { resolver.releasePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION) }

    /** Folder name shown in Settings, e.g. "roms". */
    fun label(tree: Uri): String {
        val root = DocumentsContract.getTreeDocumentId(tree)
        val name = runCatching {
            resolver.query(DocumentsContract.buildDocumentUriUsingTree(tree, root), arrayOf(Document.COLUMN_DISPLAY_NAME), null, null, null)
                ?.use { if (it.moveToFirst()) it.getString(0) else null }
        }.getOrNull()
        // Document ids look like "primary:roms" or "1A2B-3C4D:games/roms".
        val volume = root.substringBefore(':').let { if (it == "primary") "This TV" else "USB drive" }
        return "${name ?: root.substringAfter(':')} · $volume"
    }

    /** Games in every picked folder. BIOS files in a `bios/` folder next to the systems are copied to [systemDir]. */
    fun scan(systemDir: File): List<Game> {
        val out = mutableListOf<Game>()
        for (tree in list()) {
            runCatching { scanTree(tree, systemDir, out) }
                .onFailure { android.util.Log.w("Couch", "folder $tree: ${it.message}") }
        }
        return out
    }

    private fun scanTree(tree: Uri, systemDir: File, out: MutableList<Game>) {
        val rootId = DocumentsContract.getTreeDocumentId(tree)
        val rootName = rootId.substringAfterLast('/').substringAfter(':').lowercase()
        // Picked a single system folder (e.g. roms/snes).
        Systems.byId(rootName)?.let { sys -> return addGames(tree, rootId, sys, out) }
        var base = children(tree, rootId)
        var baseId = rootId
        base.firstOrNull { it.isDir && it.name.equals("roms", ignoreCase = true) }?.let {
            baseId = it.docId
            base = children(tree, it.docId)
        }
        for (dir in base.filter { it.isDir }) {
            val name = dir.name.lowercase()
            if (name == "bios") copyBios(tree, dir.docId, systemDir)
            Systems.byId(name)?.let { addGames(tree, dir.docId, it, out) }
        }
        if (baseId != rootId) children(tree, rootId).firstOrNull { it.isDir && it.name.equals("bios", true) }?.let { copyBios(tree, it.docId, systemDir) }
    }

    private fun addGames(tree: Uri, dirId: String, sys: SystemDef, out: MutableList<Game>) {
        for (f in children(tree, dirId).filter { !it.isDir }.sortedBy { it.name.lowercase() }) {
            val ext = "." + f.name.substringAfterLast('.', "").lowercase()
            if (ext !in sys.extensions) continue
            val id = Library.gameId(sys.id, f.name, f.size)
            out += Game(id, sys.id, titleFromFilename(f.name), File(cacheRoot, "$id/${f.name}"), emptyList(), f.size, FOLDER_ROOT, folder = FolderGame(tree, f.docId, dirId))
        }
    }

    private fun copyBios(tree: Uri, dirId: String, systemDir: File) {
        for (f in children(tree, dirId).filter { !it.isDir }) {
            val dst = File(systemDir, f.name)
            if (dst.length() != f.size) runCatching { copy(tree, f.docId, dst) {} }
        }
    }

    /** Copies the game (and the tracks a .cue lists) into the cache; progress 0..1. */
    suspend fun ensureLocal(game: Game, onProgress: (Float) -> Unit = {}) = withContext(Dispatchers.IO) {
        val g = game.folder ?: return@withContext
        val main = game.file
        val files = mutableListOf(main)
        if (main.length() != game.size) {
            copy(g.tree, g.docId, main) { n -> onProgress(n.toFloat() / game.size.coerceAtLeast(1)) }
        }
        if (main.extension.equals("cue", ignoreCase = true)) {
            val wanted = cueTracks(main.readText())
            val siblings = children(g.tree, g.dirDocId).filter { !it.isDir }
            val tracks = wanted.mapNotNull { w -> siblings.firstOrNull { it.name.equals(w, ignoreCase = true) } }
            val total = tracks.sumOf { it.size }.coerceAtLeast(1)
            var done = 0L
            for (t in tracks) {
                val dst = File(main.parentFile, t.name)
                files += dst
                if (dst.length() != t.size) copy(g.tree, t.docId, dst) { n -> onProgress((done + n).toFloat() / total) }
                done += t.size
            }
        }
        val now = System.currentTimeMillis()
        files.forEach { it.setLastModified(now) } // most recently played stays cached
        evict(keep = files.toSet())
    }

    private fun copy(tree: Uri, docId: String, dst: File, onBytes: (Long) -> Unit) {
        dst.parentFile?.mkdirs()
        val tmp = File(dst.path + ".part")
        val input = resolver.openInputStream(DocumentsContract.buildDocumentUriUsingTree(tree, docId)) ?: error("Could not open ${dst.name}")
        input.use { inp ->
            tmp.outputStream().use { out ->
                val buf = ByteArray(256 * 1024)
                var n = 0L
                while (true) {
                    val read = inp.read(buf)
                    if (read < 0) break
                    out.write(buf, 0, read)
                    n += read
                    onBytes(n)
                }
            }
        }
        if (dst.exists()) dst.delete()
        check(tmp.renameTo(dst)) { "Could not save ${dst.name}" }
    }

    private fun children(tree: Uri, parentId: String): List<Entry> {
        val uri = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentId)
        val cols = arrayOf(Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME, Document.COLUMN_MIME_TYPE, Document.COLUMN_SIZE)
        return resolver.query(uri, cols, null, null, null)?.use { c ->
            buildList {
                while (c.moveToNext()) {
                    add(Entry(c.getString(0), c.getString(1) ?: "", c.getString(2) == Document.MIME_TYPE_DIR, if (c.isNull(3)) 0 else c.getLong(3)))
                }
            }
        }.orEmpty()
    }

    private fun evict(keep: Set<File>) {
        val all = cacheRoot.walkTopDown().filter { it.isFile }.sortedBy { it.lastModified() }.toList()
        var total = all.sumOf { it.length() }
        for (f in all) {
            if (total <= cacheLimitBytes) break
            if (f in keep) continue
            total -= f.length()
            f.delete()
        }
    }

    companion object {
        /** [Game.root] for games from picked folders. */
        const val FOLDER_ROOT = "folder"

        /** File names listed by FILE lines in a .cue sheet. */
        fun cueTracks(cue: String): List<String> =
            Regex("^\\s*FILE\\s+\"?([^\"\\r\\n]+?)\"?\\s+\\w+\\s*$", setOf(RegexOption.MULTILINE, RegexOption.IGNORE_CASE))
                .findAll(cue).map { it.groupValues[1].substringAfterLast('/').substringAfterLast('\\') }.toList()
    }
}
