package app.couch.tv.emu

import android.content.Context
import android.os.Build
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.ZipInputStream

/**
 * Downloads libretro cores on first use (ADR-004: cores are separate programs,
 * never packaged in the APK) from the libretro buildbot into app storage.
 * A core can also be side-loaded: put `<core>_libretro_android.so` in
 * Android/data/app.couch.tv/files/cores/.
 */
class Cores(private val context: Context) {
    private val dir = File(context.filesDir, "cores").apply { mkdirs() }
    private val sideload = File(context.getExternalFilesDir(null), "cores")

    val abi: String = Build.SUPPORTED_ABIS.firstOrNull { it in setOf("arm64-v8a", "armeabi-v7a", "x86_64", "x86") } ?: "arm64-v8a"

    fun file(core: String) = File(dir, "${core}_libretro_android.so")

    fun installed(core: String): Boolean = file(core).length() > 0 || File(sideload, "${core}_libretro_android.so").exists()

    /** Path for LibretroDroid; copies a side-loaded core into private storage (it must be executable there). */
    fun path(core: String): String {
        val side = File(sideload, "${core}_libretro_android.so")
        if (side.exists() && side.length() != file(core).length()) side.copyTo(file(core), overwrite = true)
        return file(core).absolutePath
    }

    suspend fun ensure(core: String, onProgress: (Float) -> Unit = {}): String = withContext(Dispatchers.IO) {
        if (installed(core)) return@withContext path(core)
        val url = URL("https://buildbot.libretro.com/nightly/android/latest/$abi/${core}_libretro_android.so.zip")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 30_000
        }
        try {
            if (conn.responseCode != 200) error("Core download failed (HTTP ${conn.responseCode}) for $core")
            val total = conn.contentLengthLong.coerceAtLeast(1)
            val tmp = File(dir, "${core}.download")
            ZipInputStream(CountingStream(conn.inputStream) { onProgress((it.toFloat() / total).coerceAtMost(1f)) }).use { zip ->
                var entry = zip.nextEntry
                while (entry != null) {
                    if (entry.name.endsWith(".so")) {
                        tmp.outputStream().use { zip.copyTo(it) }
                        break
                    }
                    entry = zip.nextEntry
                }
            }
            check(tmp.length() > 0) { "Archive for $core contained no .so" }
            tmp.renameTo(file(core))
            file(core).absolutePath
        } finally {
            conn.disconnect()
        }
    }

    fun delete(core: String) = file(core).delete()

    private class CountingStream(private val inner: java.io.InputStream, private val cb: (Long) -> Unit) : java.io.InputStream() {
        private var n = 0L
        override fun read(): Int = inner.read().also { if (it >= 0) cb(++n) }
        override fun read(b: ByteArray, off: Int, len: Int): Int = inner.read(b, off, len).also {
            if (it > 0) {
                n += it
                cb(n)
            }
        }
        override fun close() = inner.close()
    }
}
