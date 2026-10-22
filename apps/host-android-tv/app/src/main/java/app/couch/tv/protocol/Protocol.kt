package app.couch.tv.protocol

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Kotlin port of packages/protocol (wire format v1). Byte-for-byte identical to
 * the TypeScript codec: verified by ProtocolGoldenTest against
 * packages/protocol/vectors/golden.json.
 */
const val PROTOCOL_VERSION = 1

object MsgType {
    const val INPUT = 0x01
    const val INPUT_ECHO = 0x02
    const val HELLO = 0x10
    const val WELCOME = 0x11
    const val LEAVE = 0x12
    const val SLOT = 0x13
    const val SKIN = 0x14
    const val RUMBLE = 0x15
    const val MENU = 0x16
    const val PING = 0x17
    const val PONG = 0x18
    const val STATS = 0x19
    const val ROSTER = 0x1a
    const val ERROR = 0x1b
    const val HOST_STATE = 0x1c
}

/** RetroPad ids: bit i of the buttons mask is libretro joypad id i. */
object Button {
    const val B = 0
    const val Y = 1
    const val SELECT = 2
    const val START = 3
    const val UP = 4
    const val DOWN = 5
    const val LEFT = 6
    const val RIGHT = 7
    const val A = 8
    const val X = 9
    const val L = 10
    const val R = 11
    const val L2 = 12
    const val R2 = 13
    const val L3 = 14
    const val R3 = 15
    const val MENU = 16
}

object MenuAction {
    const val OPEN = 1
    const val RESUME = 2
    const val SAVE_STATE = 3
    const val LOAD_STATE = 4
    const val QUIT = 5
    const val RESET = 6
}

object TransportKind {
    const val UNKNOWN = 0
    const val WEBRTC_P2P = 1
    const val WEBRTC_RELAY = 2
    const val WS_LAN = 3
    const val WS_RELAY = 4
    const val BT_HID = 5

    fun label(k: Int) = when (k) {
        WEBRTC_P2P -> "WebRTC P2P"
        WEBRTC_RELAY -> "WebRTC TURN"
        WS_LAN -> "WebSocket LAN"
        WS_RELAY -> "WebSocket relay"
        BT_HID -> "Bluetooth HID"
        else -> "unknown"
    }
}

val PLAYER_COLORS = listOf("#f7c948", "#f47c5b", "#3ebfa5", "#9b8cf5", "#5aa9f0", "#8ccb5e", "#f28ac0", "#e8dcc0")

const val INPUT_PACKET_SIZE = 18
const val INPUT_PACKET_SIZE_GYRO = 24
const val ECHO_PACKET_SIZE = 12

/** Full controller state. Mutable and reused: the hot path allocates nothing. */
class InputState {
    var seq = 0
    var clientTimeMs = 0L
    var buttons = 0L
    var lx = 0
    var ly = 0
    var rx = 0
    var ry = 0
    var l2 = 0
    var r2 = 0
    var hasGyro = false
    var gx = 0
    var gy = 0
    var gz = 0

    fun copyFrom(o: InputState) {
        seq = o.seq; clientTimeMs = o.clientTimeMs; buttons = o.buttons
        lx = o.lx; ly = o.ly; rx = o.rx; ry = o.ry; l2 = o.l2; r2 = o.r2
        hasGyro = o.hasGyro; gx = o.gx; gy = o.gy; gz = o.gz
    }

    fun pressed(button: Int) = (buttons shr button) and 1L == 1L

    fun clear() {
        buttons = 0; lx = 0; ly = 0; rx = 0; ry = 0; l2 = 0; r2 = 0
    }
}

data class InputEcho(var seq: Int = 0, var clientTimeMs: Long = 0, var hostTimeMs: Long = 0)

private fun clampI8(v: Int) = v.coerceIn(-127, 127)
private fun clampU8(v: Int) = v.coerceIn(0, 255)
private fun clampI16(v: Int) = v.coerceIn(-32767, 32767)

object Codec {
    /** Encodes INPUT into [out] (≥ 24 bytes). Returns the byte length. */
    fun encodeInputInto(s: InputState, out: ByteArray): Int {
        val b = ByteBuffer.wrap(out).order(ByteOrder.LITTLE_ENDIAN)
        b.put(0, MsgType.INPUT.toByte())
        b.put(1, PROTOCOL_VERSION.toByte())
        b.putShort(2, (s.seq and 0xffff).toShort())
        b.putInt(4, s.clientTimeMs.toInt())
        b.putInt(8, s.buttons.toInt())
        b.put(12, clampI8(s.lx).toByte())
        b.put(13, clampI8(s.ly).toByte())
        b.put(14, clampI8(s.rx).toByte())
        b.put(15, clampI8(s.ry).toByte())
        b.put(16, clampU8(s.l2).toByte())
        b.put(17, clampU8(s.r2).toByte())
        if (!s.hasGyro) return INPUT_PACKET_SIZE
        b.putShort(18, clampI16(s.gx).toShort())
        b.putShort(20, clampI16(s.gy).toShort())
        b.putShort(22, clampI16(s.gz).toShort())
        return INPUT_PACKET_SIZE_GYRO
    }

    /** Decodes INPUT from bytes[offset, offset+len) into [out]. False for wrong type/version/length. */
    fun decodeInputInto(bytes: ByteArray, offset: Int, len: Int, out: InputState): Boolean {
        if (len != INPUT_PACKET_SIZE && len != INPUT_PACKET_SIZE_GYRO) return false
        if (bytes[offset].toInt() != MsgType.INPUT || bytes[offset + 1].toInt() != PROTOCOL_VERSION) return false
        val b = ByteBuffer.wrap(bytes, offset, len).slice().order(ByteOrder.LITTLE_ENDIAN)
        out.seq = b.getShort(2).toInt() and 0xffff
        out.clientTimeMs = b.getInt(4).toLong() and 0xffffffffL
        out.buttons = b.getInt(8).toLong() and 0xffffffffL
        out.lx = b.get(12).toInt()
        out.ly = b.get(13).toInt()
        out.rx = b.get(14).toInt()
        out.ry = b.get(15).toInt()
        out.l2 = b.get(16).toInt() and 0xff
        out.r2 = b.get(17).toInt() and 0xff
        if (len == INPUT_PACKET_SIZE_GYRO) {
            out.hasGyro = true
            out.gx = b.getShort(18).toInt()
            out.gy = b.getShort(20).toInt()
            out.gz = b.getShort(22).toInt()
        } else {
            out.hasGyro = false; out.gx = 0; out.gy = 0; out.gz = 0
        }
        return true
    }

    fun encodeEchoInto(e: InputEcho, out: ByteArray): Int {
        val b = ByteBuffer.wrap(out).order(ByteOrder.LITTLE_ENDIAN)
        b.put(0, MsgType.INPUT_ECHO.toByte())
        b.put(1, PROTOCOL_VERSION.toByte())
        b.putShort(2, (e.seq and 0xffff).toShort())
        b.putInt(4, e.clientTimeMs.toInt())
        b.putInt(8, e.hostTimeMs.toInt())
        return ECHO_PACKET_SIZE
    }

    fun decodeEchoInto(bytes: ByteArray, out: InputEcho): Boolean {
        if (bytes.size != ECHO_PACKET_SIZE || bytes[0].toInt() != MsgType.INPUT_ECHO || bytes[1].toInt() != PROTOCOL_VERSION) return false
        val b = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        out.seq = b.getShort(2).toInt() and 0xffff
        out.clientTimeMs = b.getInt(4).toLong() and 0xffffffffL
        out.hostTimeMs = b.getInt(8).toLong() and 0xffffffffL
        return true
    }

    /** RFC 1982: true when 16-bit [a] is newer than [b]. */
    fun seqNewer(a: Int, b: Int): Boolean {
        val d = (a - b) and 0xffff
        return d != 0 && d < 0x8000
    }

    /** Signed difference of two u32 ms clocks, wrap-safe. */
    fun u32Diff(a: Long, b: Long): Int = (a - b).toInt()

    fun u32Now(nowMs: Double): Long = nowMs.toLong() and 0xffffffffL

    /* ---------------------------------------------------- control */

    val json = Json {
        encodeDefaults = true
        explicitNulls = true
        ignoreUnknownKeys = true
    }

    fun encodeControl(m: ControlMsg): ByteArray {
        val out: ByteArray
        when (m) {
            is ControlMsg.Leave -> out = ByteArray(2)
            is ControlMsg.Rumble -> {
                out = ByteArray(6)
                val b = ByteBuffer.wrap(out).order(ByteOrder.LITTLE_ENDIAN)
                b.put(2, clampU8(m.strong).toByte()); b.put(3, clampU8(m.weak).toByte())
                b.putShort(4, m.durationMs.coerceIn(0, 0xffff).toShort())
            }
            is ControlMsg.Menu -> {
                out = ByteArray(4); out[2] = m.action.toByte(); out[3] = clampU8(m.arg).toByte()
            }
            is ControlMsg.Ping -> {
                out = ByteArray(8)
                val b = ByteBuffer.wrap(out).order(ByteOrder.LITTLE_ENDIAN)
                b.putShort(2, (m.id and 0xffff).toShort()); b.putInt(4, m.hostTimeMs.toInt())
            }
            is ControlMsg.Pong -> {
                out = ByteArray(12)
                val b = ByteBuffer.wrap(out).order(ByteOrder.LITTLE_ENDIAN)
                b.putShort(2, (m.id and 0xffff).toShort()); b.putInt(4, m.hostTimeMs.toInt()); b.putInt(8, m.clientTimeMs.toInt())
            }
            is ControlMsg.Stats -> {
                out = ByteArray(10)
                val b = ByteBuffer.wrap(out).order(ByteOrder.LITTLE_ENDIAN)
                b.putShort(2, Math.round(m.rttMs * 10).coerceIn(0, 0xffff).toShort())
                b.putShort(4, Math.round(m.jitterMs * 10).coerceIn(0, 0xffff).toShort())
                b.putShort(6, Math.round(m.lossPermille).coerceIn(0, 1000).toShort())
                b.put(8, m.transport.toByte()); b.put(9, m.slot.toByte())
            }
            else -> {
                val body = when (m) {
                    is ControlMsg.Hello -> json.encodeToString(HelloBody.serializer(), m.body)
                    is ControlMsg.Welcome -> json.encodeToString(WelcomeBody.serializer(), m.body)
                    is ControlMsg.Slot -> json.encodeToString(SlotBody.serializer(), m.body)
                    is ControlMsg.Skin -> json.encodeToString(SkinBody.serializer(), m.body)
                    is ControlMsg.Roster -> json.encodeToString(RosterBody.serializer(), m.body)
                    is ControlMsg.Error -> json.encodeToString(ErrorBody.serializer(), m.body)
                    is ControlMsg.HostState -> json.encodeToString(HostStateBody.serializer(), m.body)
                    else -> error("unreachable")
                }.encodeToByteArray()
                out = ByteArray(2 + body.size)
                body.copyInto(out, 2)
            }
        }
        out[0] = m.type.toByte()
        out[1] = PROTOCOL_VERSION.toByte()
        return out
    }

    class ProtocolError(msg: String) : Exception(msg)

    fun decodeControl(bytes: ByteArray): ControlMsg {
        if (bytes.size < 2) throw ProtocolError("message too short")
        val type = bytes[0].toInt() and 0xff
        val version = bytes[1].toInt() and 0xff
        if (version != PROTOCOL_VERSION) throw ProtocolError("unsupported protocol version $version")
        val b = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        fun need(n: Int) {
            if (bytes.size != n) throw ProtocolError("type 0x${type.toString(16)} expects $n bytes, got ${bytes.size}")
        }
        fun text() = bytes.decodeToString(2, bytes.size)
        return try {
            when (type) {
                MsgType.LEAVE -> { need(2); ControlMsg.Leave }
                MsgType.RUMBLE -> { need(6); ControlMsg.Rumble(b.get(2).toInt() and 0xff, b.get(3).toInt() and 0xff, b.getShort(4).toInt() and 0xffff) }
                MsgType.MENU -> { need(4); ControlMsg.Menu(b.get(2).toInt() and 0xff, b.get(3).toInt() and 0xff) }
                MsgType.PING -> { need(8); ControlMsg.Ping(b.getShort(2).toInt() and 0xffff, b.getInt(4).toLong() and 0xffffffffL) }
                MsgType.PONG -> {
                    need(12)
                    ControlMsg.Pong(b.getShort(2).toInt() and 0xffff, b.getInt(4).toLong() and 0xffffffffL, b.getInt(8).toLong() and 0xffffffffL)
                }
                MsgType.STATS -> {
                    need(10)
                    ControlMsg.Stats(
                        (b.getShort(2).toInt() and 0xffff) / 10.0, (b.getShort(4).toInt() and 0xffff) / 10.0,
                        (b.getShort(6).toInt() and 0xffff).toDouble(), b.get(8).toInt() and 0xff, b.get(9).toInt() and 0xff,
                    )
                }
                MsgType.HELLO -> ControlMsg.Hello(json.decodeFromString(HelloBody.serializer(), text()))
                MsgType.WELCOME -> ControlMsg.Welcome(json.decodeFromString(WelcomeBody.serializer(), text()))
                MsgType.SLOT -> ControlMsg.Slot(json.decodeFromString(SlotBody.serializer(), text()))
                MsgType.SKIN -> ControlMsg.Skin(json.decodeFromString(SkinBody.serializer(), text()))
                MsgType.ROSTER -> ControlMsg.Roster(json.decodeFromString(RosterBody.serializer(), text()))
                MsgType.ERROR -> ControlMsg.Error(json.decodeFromString(ErrorBody.serializer(), text()))
                MsgType.HOST_STATE -> ControlMsg.HostState(json.decodeFromString(HostStateBody.serializer(), text()))
                else -> throw ProtocolError("unknown control type 0x${type.toString(16)}")
            }
        } catch (e: ProtocolError) {
            throw e
        } catch (e: Exception) {
            throw ProtocolError("invalid body: ${e.message}")
        }
    }

    fun hex(bytes: ByteArray, len: Int = bytes.size): String = buildString { for (i in 0 until len) append("%02x".format(bytes[i])) }

    fun fromHex(s: String): ByteArray = ByteArray(s.length / 2) { s.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
}

/* Field order matches JSON.stringify output of the TypeScript codec exactly. */
@Serializable data class Caps(val vibrate: Boolean, val gyro: Boolean, val ios: Boolean)
@Serializable data class HelloBody(val clientId: String, val name: String, val wantSlot: Int?, val caps: Caps)
@Serializable data class WelcomeBody(val slot: Int, val color: String, val name: String, val skin: String, val hostName: String)
@Serializable data class SlotBody(val slot: Int, val color: String)
@Serializable data class SkinBody(val skin: String, val gameTitle: String?)
@Serializable data class RosterEntry(val slot: Int, val name: String, val color: String, val connected: Boolean)
@Serializable data class RosterBody(val players: List<RosterEntry>)
@Serializable data class ErrorBody(val code: String, val message: String)
@Serializable data class HostStateBody(val screen: String, val paused: Boolean, val saveSlots: List<Int>)

sealed class ControlMsg(val type: Int) {
    data class Hello(val body: HelloBody) : ControlMsg(MsgType.HELLO)
    data class Welcome(val body: WelcomeBody) : ControlMsg(MsgType.WELCOME)
    data object Leave : ControlMsg(MsgType.LEAVE)
    data class Slot(val body: SlotBody) : ControlMsg(MsgType.SLOT)
    data class Skin(val body: SkinBody) : ControlMsg(MsgType.SKIN)
    data class Rumble(val strong: Int, val weak: Int, val durationMs: Int) : ControlMsg(MsgType.RUMBLE)
    data class Menu(val action: Int, val arg: Int) : ControlMsg(MsgType.MENU)
    data class Ping(val id: Int, val hostTimeMs: Long) : ControlMsg(MsgType.PING)
    data class Pong(val id: Int, val hostTimeMs: Long, val clientTimeMs: Long) : ControlMsg(MsgType.PONG)
    data class Stats(val rttMs: Double, val jitterMs: Double, val lossPermille: Double, val transport: Int, val slot: Int) : ControlMsg(MsgType.STATS)
    data class Roster(val body: RosterBody) : ControlMsg(MsgType.ROSTER)
    data class Error(val body: ErrorBody) : ControlMsg(MsgType.ERROR)
    data class HostState(val body: HostStateBody) : ControlMsg(MsgType.HOST_STATE)
}
