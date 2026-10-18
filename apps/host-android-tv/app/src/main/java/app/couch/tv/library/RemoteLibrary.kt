package app.couch.tv.library

import android.content.Context
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.Dns
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.net.Inet4Address
import java.net.URLDecoder
import java.util.concurrent.TimeUnit

/**
 * Games from a Couch server (the same /api/library the web host uses), so a library in
 * the server's roms/ folder or S3 bucket plays on this TV too. The TV never holds S3
 * credentials: the server streams the files. A game is downloaded into the app's cache
 * the first time it is played; old downloads are evicted past [cacheLimitBytes].
 *
 * The list is loaded one console at a time (progress on the home screen) and saved, so
 * the app opens with the saved list and only asks the server again on Refresh.
 */
class RemoteLibrary(context: Context, private val cacheLimitBytes: Long = 8L shl 30) {
    private val cacheRoot = File(context.externalCacheDir ?: context.cacheDir, "server-roms")
    private val savedFile = File(context.filesDir, "server-library.json")

    /**
     * IPv4 addresses first: a TV box whose IPv6 route is broken otherwise waits for each
     * IPv6 connect to time out (browsers race both, so the page still opens there).
     * OkHttp falls back to the next address when one fails, and follows http ↔ https redirects.
     */
    private val http = OkHttpClient.Builder()
        .dns(object : Dns {
            override fun lookup(hostname: String) = Dns.SYSTEM.lookup(hostname).sortedBy { if (it is Inet4Address) 0 else 1 }
        })
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .build()

    /**
     * Finds the server for what the user typed (or saved), trying the likely variants in
     * order (see [candidates]): the address that answered, or a plain-language reason.
     * Only asks /api/health, which answers at once (the library can take a while on S3).
     */
    suspend fun connect(input: String): Result<String> = withContext(Dispatchers.IO) {
        var first: Throwable? = null
        for (server in candidates(input)) {
            try {
                val (body, finalUrl) = getFollowing("$server/api/health")
                if ("\"ok\"" !in body) throw HttpStatus(404) // some other site answered
                // Redirected (e.g. http → https): keep the address that really serves the API.
                return@withContext Result.success(normalizeServer(finalUrl).ifEmpty { server })
            } catch (e: Throwable) {
                if (first == null) first = e
            }
        }
        val tried = candidates(input).firstOrNull() ?: input
        Result.failure(ServerError(explain(first ?: IllegalArgumentException("empty address"), tried), first))
    }

    /**
     * Loads the server's games console by console, [parallel] at a time. [onProgress] and
     * [onGames] (games so far, catalog order) run on the caller's thread. `fresh` makes the
     * server list its storage again instead of using its own copy. Fails only when no
     * console loaded; the list is saved (see [saved]) when every console loaded.
     */
    suspend fun load(
        server: String,
        fresh: Boolean,
        parallel: Int = 3,
        onProgress: (LoadProgress) -> Unit = {},
        onGames: (List<Game>) -> Unit = {},
    ): Result<List<Game>> {
        val ids = Systems.all.map { it.id }
        val bySystem = mutableMapOf<String, List<LibraryEntry>>()
        val loading = mutableListOf<String>()
        val failed = mutableListOf<String>()
        var done = 0
        var firstError: Throwable? = null
        fun collect() = ids.flatMap { bySystem[it].orEmpty() }
        fun report() = onProgress(LoadProgress(done, ids.size, loading.toList(), failed.toList()))
        val queue = ArrayDeque(ids)
        report()
        // Workers share the caller's (main) thread; only the requests run on IO.
        coroutineScope {
            repeat(parallel) {
                launch {
                    while (true) {
                        val id = queue.removeFirstOrNull() ?: break
                        loading += id
                        report()
                        try {
                            val body = withContext(Dispatchers.IO) { get("$server/api/library?system=$id" + if (fresh) "&fresh" else "") }
                            // An older server ignores ?system= and sends everything: keep this console's games.
                            bySystem[id] = entries(body).filter { it.system == id }
                            onGames(toGames(collect(), server, cacheRoot))
                        } catch (e: Throwable) {
                            if (e is CancellationException) throw e
                            if (firstError == null) firstError = e
                            failed += id
                        }
                        loading -= id
                        done++
                        report()
                    }
                }
            }
        }
        if (failed.size == ids.size) return Result.failure(ServerError(explain(firstError!!, server), firstError))
        val all = collect()
        if (failed.isEmpty()) {
            val storage = storage(server)
            withContext(Dispatchers.IO) {
                runCatching { savedFile.writeText(json.encodeToString(SavedLibrary.serializer(), SavedLibrary(server, System.currentTimeMillis(), all, storage))) }
            }
        }
        return Result.success(toGames(all, server, cacheRoot))
    }

    /** The list saved by the last complete [load] from [server], or null. */
    suspend fun saved(server: String): Saved? = withContext(Dispatchers.IO) {
        val s = runCatching { json.decodeFromString(SavedLibrary.serializer(), savedFile.readText()) }.getOrNull() ?: return@withContext null
        if (normalizeServer(s.server) != normalizeServer(server)) return@withContext null
        Saved(s.server, toGames(s.roms, s.server, cacheRoot), s.at, s.storage)
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

    private fun get(url: String): String = getFollowing(url).first

    /** GET: body + final URL (after redirects). */
    private fun getFollowing(url: String): Pair<String, String> {
        http.newCall(Request.Builder().url(url).build()).execute().use { r ->
            if (r.code != 200) throw HttpStatus(r.code)
            return r.body!!.string() to r.request.url.toString()
        }
    }

    private fun download(url: String, dst: File, onProgress: (Float) -> Unit) {
        http.newCall(Request.Builder().url(url).build()).execute().use { r ->
            if (r.code != 200) error("HTTP ${r.code} downloading ${dst.name}")
            val body = r.body!!
            val total = body.contentLength().coerceAtLeast(1)
            dst.parentFile?.mkdirs()
            val tmp = File(dst.path + ".part")
            body.byteStream().use { input ->
                tmp.outputStream().use { out ->
                    val buf = ByteArray(256 * 1024)
                    var n = 0L
                    while (true) {
                        val read = input.read(buf)
                        if (read < 0) break
                        out.write(buf, 0, read)
                        n += read
                        onProgress((n.toFloat() / total).coerceAtMost(1f))
                    }
                }
            }
            check(tmp.renameTo(dst) || (tmp.copyTo(dst, overwrite = true).exists() && tmp.delete())) { "Could not save ${dst.name}" }
        }
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

        /**
         * Addresses to try for what the user typed, in order:
         *  - no scheme: https first for domain names, http first for LAN-style addresses
         *    (an IP, a .local name, or an explicit port: a laptop running the server)
         *  - https://<domain>:<port>: also without the port. Coolify's domain field is written
         *    "https://couch.example.com:8787" (= proxy to container port 8787), but the public
         *    address people open in a browser has no port.
         */
        fun candidates(input: String): List<String> {
            val n = normalizeServer(input)
            if (n.isEmpty()) return emptyList()
            val hasScheme = Regex("^\\s*[a-zA-Z][a-zA-Z0-9+.-]*://").containsMatchIn(input)
            val authority = n.substringAfter("://")
            val host = authority.substringBefore(':')
            val isIp = Regex("""^\d+(\.\d+){3}$""").matches(host)
            val lanStyle = ':' in authority || host.endsWith(".local") || isIp
            val base = when {
                hasScheme -> listOf(n)
                lanStyle -> listOf("http://$authority", "https://$authority")
                else -> listOf("https://$authority", "http://$authority")
            }
            val isDomain = !isIp && '.' in host
            val out = mutableListOf<String>()
            for (u in base) {
                out += u
                if (u.startsWith("https://") && ':' in authority && isDomain) out += "https://$host"
            }
            return out.distinct()
        }

        /** Exception → sentence a person can act on (shown in Settings and on the home chip). */
        fun explain(e: Throwable, server: String): String {
            val hostPort = server.substringAfter("://")
            return when (e) {
                is ServerError -> e.message ?: "Server error"
                is java.net.SocketTimeoutException ->
                    if (e.message.orEmpty().contains("connect", ignoreCase = true) || e.message == null)
                        "No answer from $hostPort. Use the exact address from your browser's address bar (on Coolify: without :8787), and check that this TV box is online."
                    else "The server at $hostPort accepted the connection but did not answer in time. Try again in a moment."
                is java.net.UnknownHostException -> "Can't find $hostPort: check the spelling, and that this TV box has internet access."
                is java.net.ConnectException -> "$hostPort refused the connection: nothing is listening on that address and port."
                is javax.net.ssl.SSLException, is java.security.cert.CertificateException ->
                    "This TV box does not trust the HTTPS certificate of $hostPort (older Android versions miss newer certificates). Update the box, or use the server's http:// LAN address."
                is HttpStatus ->
                    if (e.code == 404) "$hostPort answers, but it is not a Couch server. Check the address."
                    else "$hostPort answered with HTTP ${e.code}."
                else -> e.message ?: e.javaClass.simpleName
            }
        }

        /** /api/library JSON → games; skips unknown systems and unsafe file names. */
        fun parseLibrary(body: String, server: String, cacheRoot: File): List<Game> = toGames(entries(body), server, cacheRoot)

        internal fun entries(body: String): List<LibraryEntry> = json.decodeFromString(LibraryResponse.serializer(), body).roms

        internal fun toGames(roms: List<LibraryEntry>, server: String, cacheRoot: File): List<Game> =
            roms.mapNotNull { e ->
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

        private fun safeName(name: String) = name.isNotEmpty() && name != "." && name != ".." && '/' !in name && '\\' !in name

        private fun String.encodePath() = java.net.URLEncoder.encode(this, "UTF-8").replace("+", "%20")
    }
}

const val SERVER_ROOT = "couch-server"

/** Library load progress: consoles done of [total], the ones loading now, the ones that failed. */
data class LoadProgress(val done: Int, val total: Int, val loading: List<String>, val failed: List<String>) {
    val finished get() = done >= total
}

/** A saved server list: where from, its games, when it was loaded, the storage status then. */
data class Saved(val server: String, val games: List<Game>, val at: Long, val storage: StorageStatus?)

class HttpStatus(val code: Int) : Exception("HTTP $code")

/** Connection failure with a message meant for people; [cause] keeps the technical one. */
class ServerError(message: String, cause: Throwable?) : Exception(message, cause)

/** Where a server game lives: URL paths are relative to [server]. */
data class RemoteGame(val server: String, val url: String, val extra: List<String>)

@Serializable
private data class SavedLibrary(val server: String, val at: Long, val roms: List<LibraryEntry>, val storage: StorageStatus? = null)

@Serializable
internal data class LibraryResponse(val roms: List<LibraryEntry>)

@Serializable
internal data class LibraryEntry(
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
    /** When the shown list was loaded (it is kept until Refresh); null while loading. */
    val savedAt: Long? = null,
    /** Consoles that did not load on the last attempt. */
    val failed: Int = 0,
) {
    /** Reachable, and its ROM storage (S3 or folder) is connected when the server reports it. */
    val healthy get() = reachable && storage?.ok != false && failed == 0

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
            !reachable -> error ?: "No answer from $url"
            storage?.ok == false -> "Server reached, but its ROM storage fails: ${storage.error ?: "unknown error"}"
            else -> buildString {
                append("$games game${if (games == 1) "" else "s"}")
                storage?.store?.let { s -> append(if (s.kind == "s3") " from S3 bucket ${s.bucket}/${s.prefix.orEmpty()}" else " from the server's ROM folder") }
                if (failed > 0) append(" · $failed console${if (failed == 1) "" else "s"} did not load (Refresh to retry)")
                if ((storage?.misplacedTotal ?: 0) > 0) append(" · ${storage!!.misplacedTotal} file(s) in the wrong place (see the web page)")
                append(" · downloaded when first played")
            }
        }
}
