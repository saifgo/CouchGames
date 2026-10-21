package app.couch.tv.emu

import android.content.Context
import android.content.pm.ApplicationInfo
import android.os.Build
import java.io.File

/**
 * Emulator cores ship inside the app as native libraries (Google Play does not allow downloading
 * executable code). The build bundles every core in the systems catalog (see `fetchCores` in
 * app/build.gradle.kts) and the installer extracts them to [ApplicationInfo.nativeLibraryDir].
 *
 * Debug builds can also load a side-loaded core from Android/data/<package>/files/cores/ to try
 * a newer build without reinstalling.
 */
class Cores(private val context: Context) {
    private val nativeDir = File(context.applicationInfo.nativeLibraryDir)
    private val debuggable = context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
    private val sideload = File(context.getExternalFilesDir(null), "cores")
    private val sideloadCopy = File(context.filesDir, "cores-sideload")

    val abi: String = Build.SUPPORTED_ABIS.firstOrNull { it in setOf("arm64-v8a", "armeabi-v7a", "x86_64") } ?: "arm64-v8a"

    init {
        // Older versions downloaded cores into files/cores; they are bundled now: free the space.
        Thread { File(context.filesDir, "cores").deleteRecursively() }.start()
    }

    private fun bundled(core: String) = File(nativeDir, "lib${core}_libretro_android.so")

    private fun sideloaded(core: String) = File(sideload, "${core}_libretro_android.so").takeIf { debuggable && it.exists() }

    fun installed(core: String): Boolean = sideloaded(core) != null || bundled(core).exists()

    /** Path for LibretroDroid. Throws if this device's CPU has no build of [core]. */
    fun ensure(core: String): String {
        sideloaded(core)?.let { side ->
            // Copied to private storage: files under Android/data can't be loaded as code.
            val dst = File(sideloadCopy.apply { mkdirs() }, side.name)
            if (side.length() != dst.length()) side.copyTo(dst, overwrite = true)
            return dst.absolutePath
        }
        val lib = bundled(core)
        check(lib.exists()) { "The $core emulator is not available for this device ($abi)" }
        return lib.absolutePath
    }
}
