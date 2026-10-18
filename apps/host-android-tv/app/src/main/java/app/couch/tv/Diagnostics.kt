package app.couch.tv

import android.content.Context
import android.os.Build
import app.couch.tv.net.PlayerView
import app.couch.tv.protocol.TransportKind
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter

/**
 * Crash reporting + opt-in latency history (M6), all kept on the device.
 *
 * Native core crashes (SIGSEGV/SIGABRT) cannot be caught in-process, so a marker
 * file is written while a game runs and deleted on a clean exit: if it still exists
 * at the next start, the core crashed and we can tell the user which one.
 */
class Diagnostics(private val context: Context) {
    private val dir = File(context.filesDir, "diagnostics").apply { mkdirs() }
    private val marker = File(dir, "playing.json")
    private val json = Json { ignoreUnknownKeys = true }

    @Serializable
    data class Session(val gameId: String, val title: String, val system: String, val core: String, val startedAt: Long)

    @Serializable
    data class LatencyRecord(val system: String, val core: String, val minutes: Double, val soc: String, val players: List<PlayerLatency>)

    @Serializable
    data class PlayerLatency(val transport: String, val p50: Double?, val p95: Double?, val jitter: Double?, val lossPct: Double?)

    fun installJvmHandler() {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            runCatching {
                val sw = StringWriter().also { e.printStackTrace(PrintWriter(it)) }
                File(dir, "crash-${System.currentTimeMillis()}.txt").writeText("thread ${t.name}\n${Build.MODEL} Android ${Build.VERSION.RELEASE}\n$sw")
            }
            previous?.uncaughtException(t, e)
        }
    }

    fun gameStarted(s: Session) = marker.writeText(json.encodeToString(Session.serializer(), s))

    fun gameEnded() {
        marker.delete()
    }

    /** The game that was running when the process died, if any (consumed). */
    fun takeUncleanExit(): Session? {
        if (!marker.exists()) return null
        val s = runCatching { json.decodeFromString(Session.serializer(), marker.readText()) }.getOrNull()
        marker.delete()
        // Ignore stale markers (e.g. the user force-stopped the app days ago).
        return s?.takeIf { System.currentTimeMillis() - it.startedAt < 24 * 3600_000L }
    }

    fun recordLatency(system: String, core: String, ms: Long, players: List<PlayerView>) {
        val soc = if (Build.VERSION.SDK_INT >= 31) Build.SOC_MODEL else Build.HARDWARE
        fun r(v: Double) = if (v.isNaN()) null else Math.round(v * 10) / 10.0
        val rec = LatencyRecord(system, core, Math.round(ms / 6000.0) / 10.0, soc, players.map {
            PlayerLatency(if (it.local) "TV controller" else TransportKind.label(it.transport), r(it.oneWayP50), r(it.oneWayP95), r(it.jitterMs), r(it.lossPct))
        })
        File(dir, "latency-sessions.jsonl").appendText(json.encodeToString(LatencyRecord.serializer(), rec) + "\n")
    }

    fun latencyHistory(): List<LatencyRecord> = File(dir, "latency-sessions.jsonl").takeIf { it.exists() }?.readLines()
        ?.mapNotNull { runCatching { json.decodeFromString(LatencyRecord.serializer(), it) }.getOrNull() }?.takeLast(20) ?: emptyList()

    fun crashCount(): Int = dir.listFiles { f -> f.name.startsWith("crash-") }?.size ?: 0
}
