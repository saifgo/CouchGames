package app.couch.tv.library

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder

/**
 * Games from a Couch server (the same /api/library the web host uses), so a library in
 * the server's roms/ folder or S3 bucket plays on this TV too. The TV never holds S3
 * credentials: the server streams the files. A game is downloaded into the app's cache
 * the first time it is played; old downloads are evicted past [cacheLimitBytes].
 */
class RemoteLibrary(context: Context, private val cacheLimitBytes: Long = 8L shl 30) {
    private val cacheRoot = File(context.externalCacheDir ?: context.cacheDir, "server-roms")

    /** Games from the server, or the reason it could not be reached. */
    suspend fun fetch(server: String): Result<List<Game>> = withContext(Dispatchers.IO) {
        runCatching { parseLibrary(get("$server/api/library"), server, cacheRoot) }
    }

    /** The server's ROM storage check (/api/storage), null when the server is too old to have it. */
    suspend fun storage(server: String): StorageStatus? = withContext(Dispatchers.IO) {
        runCatching { json.decodeFromString(StorageStatus.serializer(), get("$server/api/storage")) }.getOrNull()
    }

    /** Downloads the game (and its cue tracks) if needed; progress 0..1 over all files. */
    suspend fun ensureLocal(game: Game, onProgress: (Float) -> Unit = {}) = withContext(Dispatchers.IO) {
        val r = game.remote ?: return@withContext
        val files = listOf(r.url to game.file) + r.extra.zip(game.extra)
        val missing = files.filterIndexed { i, (_, f) -> if (i == 0) f.length() != game.size else f.length() == 0L }
        var done = 0
        for ((url, file) in missing) {
            download("${r.server}$url", file) { p -> onProgress((done + p) / missing.size) }
            done++
        }
        val now = System.currentTimeMillis()
        files.forEach { it.second.setLastModified(now) } // most recently played stays cached
        evict(keep = files.map { it.second }.toSet())
    }

    /** Copies the system's BIOS files from the server's /bios/ into [systemDir] when missing there. */
    suspend fun ensureBios(server: String, system: String, systemDir: File) = withContext(Dispatchers.IO) {
        for (b in Systems.byId(system)?.bios.orEmpty()) {
            val dst = File(systemDir, b.file)
            if (dst.length() > 0) continue
            runCatching { download("$server/bios/${b.file.encodePath()}", dst) {} } // 404: the server has none
        }
    }

    private fun evict(keep: Set<File>) {
        val all = cacheRoot.walkTopDown().filter { it.isFile }.sortedBy { it.lastModified() }.toMutableList()
        var total = all.sumOf { it.length() }
        for (f in all) {
            if (total <= cacheLimitBytes) break
            if (f in keep) continue
            total -= f.length()
            f.delete()
        }
    }

    private fun get(url: String): String {
        val conn = open(url)
        try {
            if (conn.responseCode != 200) error("HTTP ${conn.responseCode} from $url")
            return conn.inputStream.bufferedReader().readText()
        } finally {
            conn.disconnect()
        }
    }

    private fun download(url: String, dst: File, onProgress: (Float) -> Unit) {
        val conn = open(url)
        try {
            if (conn.responseCode != 200) error("HTTP ${conn.responseCode} downloading ${dst.name}")
            val total = conn.contentLengthLong.coerceAtLeast(1)
            dst.parentFile?.mkdirs()
            val tmp = File(dst.path + ".part")
            conn.inputStream.use { input ->
                tmp.outputStream().use { out ->
                    val buf = ByteArray(256 * 1024)
                    var n = 0L
                    while (true) {
                        val r = input.read(buf)
                        if (r < 0) break
                        out.write(buf, 0, r)
                        n += r
                        onProgress((n.toFloat() / total).coerceAtMost(1f))
                    }
                }
            }
            check(tmp.renameTo(dst) || (tmp.copyTo(dst, overwrite = true).exists() && tmp.delete())) { "Could not save ${dst.name}" }
        } finally {
            conn.disconnect()
        }
    }

    private fun open(url: String) = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = 8_000
        readTimeout = 30_000
    }

    companion object {
        private val json = Json { ignoreUnknownKeys = true }

        /**
         * What the user typed → "scheme://host[:port]". Accepts a bare host, a trailing slash,
         * or a full page / join URL copied from the TV (".../c/?r=ABCD"). "" when empty.
         */
        fun normalizeServer(input: String): String {
            var s = input.trim()
            if (s.isEmpty()) return ""
            if (!Regex("^[a-zA-Z][a-zA-Z0-9+.-]*://").containsMatchIn(s)) s = "http://$s"
            val scheme = s.substringBefore("://").lowercase()
            val authority = s.substringAfter("://").substringBefore('/').substringBefore('?').substringBefore('#')
            return if (authority.isEmpty()) "" else "$scheme://$authority"
        }

        /** /api/library JSON → games; skips unknown systems and unsafe file names. */
        fun parseLibrary(body: String, server: String, cacheRoot: File): List<Game> {
            val roms = json.decodeFromString(LibraryResponse.serializer(), body).roms
            return roms.mapNotNull { e ->
                val sys = Systems.byId(e.system) ?: return@mapNotNull null
                if (!safeName(e.file)) return@mapNotNull null
                val dir = File(cacheRoot, sys.id)
                val extraNames = e.extra.map { URLDecoder.decode(it.substringAfterLast('/'), "UTF-8") }
                if (!extraNames.all(::safeName)) return@mapNotNull null
                Game(
                    id = "srv-${e.id}",
                    system = sys.id,
                    title = e.title,
                    file = File(dir, e.file),
                    extra = extraNames.map { File(dir, it) },
                    size = e.size,
                    root = SERVER_ROOT,
                    remote = RemoteGame(server, e.url, e.extra),
                )
            }
        }

        private fun safeName(name: String) = name.isNotEmpty() && name != "." && name != ".." && '/' !in name && '\\' !in name

        private fun String.encodePath() = java.net.URLEncoder.encode(this, "UTF-8").replace("+", "%20")
    }
}

const val SERVER_ROOT = "couch-server"

/** Where a server game lives: URL paths are relative to [server]. */
data class RemoteGame(val server: String, val url: String, val extra: List<String>)

@Serializable
private data class LibraryResponse(val roms: List<LibraryEntry>)

@Serializable
private data class LibraryEntry(
    val id: String,
    val system: String,
    val file: String,
    val title: String,
    val size: Long,
    val url: String,
    val extra: List<String> = emptyList(),
)

/** Subset of the server's /api/storage report shown on the TV. */
@Serializable
data class StorageStatus(
    val ok: Boolean,
    val error: String? = null,
    val games: Int = 0,
    val misplacedTotal: Int = 0,
    val store: StoreInfo,
)

@Serializable
data class StoreInfo(val kind: String, val bucket: String? = null, val prefix: String? = null, val path: String? = null)

/** The Couch server as the home screen shows it (chip in the hint bar, Settings row). */
data class ServerState(
    val url: String,
    val reachable: Boolean,
    val games: Int,
    val error: String?,
    val storage: StorageStatus?,
) {
    /** Reachable, and its ROM storage (S3 or folder) is connected when the server reports it. */
    val healthy get() = reachable && storage?.ok != false

    private val kind get() = if (storage?.store?.kind == "s3") "S3" else "Server"

    val label: String
        get() = when {
            !reachable -> "Server · offline"
            storage?.ok == false -> "$kind · not connected"
            else -> "$kind · $games game${if (games == 1) "" else "s"}"
        }

    /** One line for Settings: what is wrong, or where the games come from. */
    val detail: String
        get() = when {
            !reachable -> "Can't reach $url: ${error ?: "no answer"}"
            storage?.ok == false -> "Server reached, but its ROM storage fails: ${storage.error ?: "unknown error"}"
            else -> buildString {
                append("$games game${if (games == 1) "" else "s"}")
                storage?.store?.let { s -> append(if (s.kind == "s3") " from S3 bucket ${s.bucket}/${s.prefix.orEmpty()}" else " from the server's ROM folder") }
                if ((storage?.misplacedTotal ?: 0) > 0) append(" · ${storage!!.misplacedTotal} file(s) in the wrong place (see the web page)")
                append(" · downloaded when first played")
            }
        }
}
