package app.couch.tv

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.SystemClock

/**
 * Device performance tier 1–5 (ADR-001 / M4): which systems this TV can run.
 * A 250 ms single-thread micro-benchmark (integer + float + memory work, a
 * crude stand-in for an interpreter/dynarec core) compared with the reference
 * Snapdragon 888 we measured on, plus RAM. Users can override in Settings.
 *
 * Tier → systems (see @couch/systems `tier`):
 *   1 NES/GB/GBC/Genesis · 2 +SNES/GBA · 3 +PS1 · 4 +N64/PSP/NDS · 5 +PS2
 */
object DeviceTier {
    /** Iterations/ms on the Galaxy S21 (Snapdragon 888 big core), measured 2026-10-16. */
    const val REFERENCE_SCORE = 498.0

    data class Result(val score: Double, val ratio: Double, val ramGb: Double, val soc: String, val tier: Int)

    fun measure(context: Context): Result {
        // Warm-up so the governor ramps the core.
        work(40)
        val score = (0 until 3).maxOf { work(250) }
        val ratio = REFERENCE_SCORE / score
        val mem = ActivityManager.MemoryInfo().also { (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(it) }
        val ramGb = mem.totalMem / 1e9
        val soc = if (Build.VERSION.SDK_INT >= 31) "${Build.SOC_MANUFACTURER} ${Build.SOC_MODEL}" else Build.HARDWARE
        val tier = when {
            ratio <= 1.4 && ramGb >= 5.5 -> 5
            ratio <= 2.5 && ramGb >= 2.5 -> 4
            ratio <= 4.0 -> 3
            ratio <= 7.0 -> 2
            else -> 1
        }
        return Result(score, ratio, ramGb, soc, tier)
    }

    /** Returns iterations per millisecond. */
    private fun work(ms: Long): Double {
        val mem = IntArray(1 shl 16)
        var acc = 0x1234567
        var f = 1.0001
        var iters = 0L
        val end = SystemClock.elapsedRealtimeNanos() + ms * 1_000_000
        while (SystemClock.elapsedRealtimeNanos() < end) {
            for (i in 0 until 1000) {
                acc = acc * 1103515245 + 12345
                val idx = (acc ushr 16) and 0xffff
                mem[idx] = mem[idx] + (acc and 0xff)
                f = f * 1.0000001 + (acc and 7) * 1e-9
            }
            iters += 1000
        }
        if (f == 0.0 && mem[0] == 42) println(acc) // keep the JIT honest
        return iters / ms.toDouble() / 1000.0
    }
}
