package app.couch.tv.protocol

import kotlin.math.abs
import kotlin.math.ceil

/** Port of packages/protocol/src/stats.ts. */
class Ring(val capacity: Int) {
    private val buf = DoubleArray(capacity)
    private var n = 0
    private var head = 0
    val size get() = n

    fun push(v: Double) {
        buf[head] = v
        head = (head + 1) % capacity
        if (n < capacity) n++
    }

    fun clear() {
        n = 0; head = 0
    }

    fun values(): DoubleArray {
        val out = DoubleArray(n)
        val start = (head - n + capacity) % capacity
        for (i in 0 until n) out[i] = buf[(start + i) % capacity]
        return out
    }
}

data class Summary(val n: Int, val p50: Double, val p95: Double, val p99: Double, val max: Double)

fun summarize(values: DoubleArray): Summary {
    if (values.isEmpty()) return Summary(0, Double.NaN, Double.NaN, Double.NaN, Double.NaN)
    val s = values.sortedArray()
    fun pct(p: Double) = s[(ceil(p / 100 * s.size).toInt() - 1).coerceIn(0, s.size - 1)]
    return Summary(s.size, pct(50.0), pct(95.0), pct(99.0), s.last())
}

/** NTP-style offset estimator; offset = clientClock - hostClock from the lowest-RTT sample. */
class ClockSync {
    private val rtts = DoubleArray(8)
    private val offsets = DoubleArray(8)
    private var count = 0
    private var idx = 0
    var srtt = Double.NaN
        private set
    var offset = 0.0
        private set
    var synced = false
        private set

    fun onPong(hostT0: Long, clientT1: Long, hostNow: Long) {
        val rtt = Codec.u32Diff(hostNow, hostT0).toDouble()
        if (rtt < 0 || rtt > 10_000) return
        val off = Codec.u32Diff(clientT1, hostT0) - rtt / 2
        rtts[idx] = rtt
        offsets[idx] = off
        idx = (idx + 1) % rtts.size
        if (count < rtts.size) count++
        srtt = if (srtt.isNaN()) rtt else srtt + (rtt - srtt) / 8
        var best = 0
        for (i in 1 until count) if (rtts[i] < rtts[best]) best = i
        offset = offsets[best]
        synced = true
    }

    fun oneWay(clientTimeMs: Long, hostNowMs: Long): Double = Codec.u32Diff(hostNowMs, clientTimeMs) + offset

    fun reset() {
        count = 0; idx = 0; srtt = Double.NaN; offset = 0.0; synced = false
    }
}

/** Per-link input statistics; NaN transit = clock not synced (track loss only). */
class LinkStats(window: Int = 600) {
    val latency = Ring(window)
    var jitter = 0.0
        private set
    var received = 0
        private set
    var lost = 0
        private set
    private var lastSeq = -1
    private var lastTransit = Double.NaN

    fun onPacket(seq: Int, transitMs: Double): Boolean {
        if (lastSeq >= 0) {
            if (!Codec.seqNewer(seq, lastSeq)) return false
            val gap = (seq - lastSeq) and 0xffff
            if (gap > 1) lost += gap - 1
        }
        lastSeq = seq
        received++
        if (transitMs.isNaN()) return true
        if (!lastTransit.isNaN()) jitter += (abs(transitMs - lastTransit) - jitter) / 16
        lastTransit = transitMs
        latency.push(transitMs)
        return true
    }

    val lossPermille get() = if (received + lost == 0) 0.0 else lost * 1000.0 / (received + lost)

    fun reset() {
        latency.clear(); jitter = 0.0; received = 0; lost = 0; lastSeq = -1; lastTransit = Double.NaN
    }
}
