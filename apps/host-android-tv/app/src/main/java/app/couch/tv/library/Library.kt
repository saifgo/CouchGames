package app.couch.tv.library

import android.content.Context
import android.os.Environment
import android.os.storage.StorageManager
import java.io.File
import java.security.MessageDigest

data class Game(
    val id: String,
    val system: String,
    val title: String,
    val file: File,
    /** Companion files (cue tracks), passed next to the main file. */
    val extra: List<File>,
    val size: Long,
    val root: String,
)

/**
 * Finds ROMs in the same `roms/<system>/` layout as the web host:
 *  - <USB or SD volume>/roms
 *  - internal storage Documents/roms, Download/roms, roms
 *  - the app's own external files dir (no permission needed; adb push target)
 */
class Library(private val context: Context) {

    /** The app's own roms/<system>/ folders (no permission needed): created so the layout is ready for copying. */
    fun ensureAppFolders(): File? {
        val base = context.getExternalFilesDir(null)?.let { File(it, "roms") } ?: return null
        for (sys in Systems.all) File(base, sys.id).mkdirs()
        File(base, "bios").mkdirs()
        return base
    }

    fun roots(): List<File> {
        val roots = linkedSetOf<File>()
        context.getExternalFilesDir(null)?.let { roots += File(it, "roms") }
        val ext = Environment.getExternalStorageDirectory()
        roots += File(ext, "roms")
        roots += File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), "roms")
        roots += File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "roms")
        // Removable volumes (USB sticks, SD cards).
        val sm = context.getSystemService(StorageManager::class.java)
        for (v in sm.storageVolumes) {
            val dir = if (android.os.Build.VERSION.SDK_INT >= 30) v.directory else null
            if (dir != null && v.isRemovable) roots += File(dir, "roms")
        }
        return roots.filter { it.isDirectory }
    }

    fun scan(): List<Game> {
        val out = mutableListOf<Game>()
        val seen = HashSet<String>()
        for (root in roots()) {
            for (sys in Systems.all) {
                val dir = File(root, sys.id)
                val files = dir.listFiles() ?: continue
                for (f in files.sortedBy { it.name.lowercase() }) {
                    if (!f.isFile) continue
                    val ext = "." + f.extension.lowercase()
                    if (ext !in sys.extensions) continue
                    val id = sha1("${sys.id}/${f.name}/${f.length()}").take(12)
                    if (!seen.add(id)) continue // same game on two volumes
                    val extra = if (ext == ".cue") cueTracks(f) else emptyList()
                    out += Game(id, sys.id, titleFromFilename(f.name), f, extra, f.length(), root.path)
                }
            }
        }
        return out
    }

    /** First BIOS directory found (roms/bios), else an app-private one. */
    fun biosDir(): File = roots().map { File(it, "bios") }.firstOrNull { it.isDirectory }
        ?: File(context.getExternalFilesDir(null) ?: context.filesDir, "roms/bios").apply { mkdirs() }

    /**
     * Core "system" directory in internal storage (cores write caches/config there, as in
     * Lemuroid), refreshed with the user's BIOS files from roms/bios.
     */
    fun systemDir(): File {
        val dir = File(context.filesDir, "system").apply { mkdirs() }
        biosDir().listFiles()?.filter { it.isFile }?.forEach { src ->
            val dst = File(dir, src.name)
            if (dst.length() != src.length()) runCatching { src.copyTo(dst, overwrite = true) }
        }
        return dir
    }

    private fun cueTracks(cue: File): List<File> =
        runCatching {
            Regex("^\\s*FILE\\s+\"?([^\"\\r\\n]+?)\"?\\s+\\w+\\s*$", setOf(RegexOption.MULTILINE, RegexOption.IGNORE_CASE))
                .findAll(cue.readText())
                .map { File(cue.parentFile, it.groupValues[1]) }
                .filter { it.exists() }
                .toList()
        }.getOrDefault(emptyList())

    private fun sha1(s: String): String =
        MessageDigest.getInstance("SHA-1").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }
}
