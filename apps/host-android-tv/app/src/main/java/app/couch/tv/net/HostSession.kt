package app.couch.tv.net

import android.content.Context
import android.os.SystemClock
import app.couch.tv.protocol.Caps
import app.couch.tv.protocol.ClockSync
import app.couch.tv.protocol.Codec
import app.couch.tv.protocol.ControlMsg
import app.couch.tv.protocol.ErrorBody
import app.couch.tv.protocol.HostStateBody
import app.couch.tv.protocol.InputEcho
import app.couch.tv.protocol.InputState
import app.couch.tv.protocol.LinkStats
import app.couch.tv.protocol.PLAYER_COLORS
import app.couch.tv.protocol.RosterBody
import app.couch.tv.protocol.RosterEntry
import app.couch.tv.protocol.SkinBody
import app.couch.tv.protocol.SlotBody
import app.couch.tv.protocol.TransportKind
import app.couch.tv.protocol.WelcomeBody
import app.couch.tv.protocol.summarize
import io.ktor.websocket.Frame
import io.ktor.websocket.WebSocketSession
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlin.random.Random

class Player(
    val clientId: String,
    @Volatile var slot: Int,
    @Volatile var name: String,
    @Volatile var color: String,
    @Volatile var peer: PhonePeer?,
    var caps: Caps,
    /** A game controller paired with the TV (no phone, no network). */
    val local: Boolean = false,
) {
    /** Latest full input state, written in place by the hot path. */
    val input = InputState()
    val clock = ClockSync()
    val stats = LinkStats(600)
    /** Per-player decode/echo buffers: phones arrive on different threads. */
    internal val scratch = InputState()
    internal val echo = InputEcho()
    internal val echoBuf = ByteArray(12)
    @Volatile var connected = true
    @Volatile var lastSeen = SystemClock.elapsedRealtime()
}

data class PlayerView(
    val slot: Int,
    val name: String,
    val color: String,
    val connected: Boolean,
    val transport: Int,
    val rttMs: Double,
    val oneWayP50: Double,
    val oneWayP95: Double,
    val jitterMs: Double,
    val lossPct: Double,
    /** A game controller paired with the TV. */
    val local: Boolean = false,
    /** The phone is an iPhone/iPad (picks the lobby icon). */
    val ios: Boolean = false,
)

data class SessionView(val room: String, val players: List<PlayerView>)

/** One phone connected to our LAN server: WebSocket always, WebRTC when it opens. */
class PhonePeer(val id: Int, private val ws: WebSocketSession, val remote: String) {
    @Volatile var clientId: String? = null
    @Volatile var rtc: RtcPeer? = null
    val transport get() = if (rtc?.usable == true) TransportKind.WEBRTC_P2P else TransportKind.WS_LAN

    fun sendCtrl(bytes: ByteArray) {
        if (rtc?.sendCtrl(bytes) == true) return
        val f = ByteArray(bytes.size + 1)
        f[0] = 1
        bytes.copyInto(f, 1)
        ws.outgoing.trySend(Frame.Binary(true, f))
    }

    fun sendInput(bytes: ByteArray, len: Int) {
        if (rtc?.sendInput(bytes, len) == true) return
        val f = ByteArray(len + 1)
        f[0] = 0
        bytes.copyInto(f, 1, 0, len)
        ws.outgoing.trySend(Frame.Binary(true, f)) // dropped if the socket is backed up
    }

    fun sendText(text: String) {
        ws.outgoing.trySend(Frame.Text(text))
    }
}

/**
 * Port of apps/host-web/src/net/host-session.ts for the Android host, which is
 * its own signaling server (phones join with `direct: true`).
 */
class HostSession(private val context: Context, var hostName: String) {
    val room: String = generateRoomCode()
    var maxPlayers = 4
    /** What a phone sees when every slot is taken (Couch Free explains the 2-player limit). */
    @Volatile var roomFullText: () -> String = { "All $maxPlayers player slots are taken" }
    val players = arrayOfNulls<Player>(8)
    private val peers = HashMap<Int, PhonePeer>()
    private var nextPeer = 1
    private var pingId = 0
    private var skin = "modern"
    private var gameTitle: String? = null
    private var hostState = HostStateBody("library", false, emptyList())
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val _view = MutableStateFlow(SessionView(room, emptyList()))
    val view: StateFlow<SessionView> = _view

    /** Hot path listener (emulator input bridge / UI navigation). Called on network threads. */
    @Volatile var onInput: ((Player) -> Unit)? = null
    @Volatile var onMenu: ((slot: Int, action: Int, arg: Int) -> Unit)? = null
    @Volatile var onJoinLeave: ((Player, joined: Boolean) -> Unit)? = null
    /** Rumble for a TV controller (phones get it over the network). */
    @Volatile var onLocalRumble: ((Player, strong: Int, weak: Int, durationMs: Int) -> Unit)? = null

    init {
        scope.launch {
            while (isActive) {
                delay(1000)
                tick()
            }
        }
        scope.launch {
            while (isActive) {
                delay(1000)
                publish()
            }
        }
    }

    private fun now() = Codec.u32Now(SystemClock.elapsedRealtimeNanos() / 1e6)

    /* ------------------------------------------------- socket plumbing */

    @Synchronized
    fun attach(ws: WebSocketSession, remote: String): PhonePeer {
        val p = PhonePeer(nextPeer++, ws, remote)
        if (nextPeer > 0xffff) nextPeer = 1
        peers[p.id] = p
        return p
    }

    fun detach(peer: PhonePeer) {
        peer.rtc?.close()
        peer.rtc = null
        val player: Player?
        synchronized(this) {
            peers.remove(peer.id)
            player = players.firstOrNull { it?.peer === peer }
            if (player != null) {
                player.peer = null
                player.connected = false
                player.lastSeen = SystemClock.elapsedRealtime()
                player.input.clear()
            }
        }
        if (player != null) {
            onInput?.invoke(player)
            onJoinLeave?.invoke(player, false)
            sendRoster()
            publish()
        }
    }

    /** JSON text frames: join / signal / ping (packages/protocol/src/signaling.ts). */
    fun onText(peer: PhonePeer, text: String) {
        val msg = runCatching { Codec.json.parseToJsonElement(text).jsonObject }.getOrNull() ?: return
        when (msg["t"]?.jsonPrimitive?.content) {
            "ping" -> peer.sendText(buildJsonObject { put("t", "pong"); put("at", msg["at"]!!.jsonPrimitive.content.toDouble()) }.toString())
            "join" -> {
                val r = msg["room"]?.jsonPrimitive?.content?.trim()?.uppercase()
                if (r != room) {
                    peer.sendText(buildJsonObject { put("t", "error"); put("code", "no-room"); put("message", "No TV with that code") }.toString())
                    return
                }
                peer.clientId = msg["clientId"]?.jsonPrimitive?.content
                peer.sendText(
                    buildJsonObject {
                        put("t", "joined"); put("room", room); put("peer", peer.id); put("hostName", hostName)
                        put("iceServers", buildJsonArray { }); put("direct", true)
                    }.toString(),
                )
            }
            "signal" -> onSignal(peer, msg["data"]!!.jsonObject)
        }
    }

    private fun onSignal(peer: PhonePeer, data: JsonObject) {
        when (data["kind"]?.jsonPrimitive?.content) {
            "offer" -> {
                peer.rtc?.close()
                val rtc = RtcPeer(
                    context,
                    sendSignal = { kind, payload ->
                        peer.sendText(
                            buildJsonObject {
                                put("t", "signal"); put("from", 0)
                                put("data", buildJsonObject {
                                    put("kind", kind)
                                    for ((k, v) in payload) when (v) {
                                        is String -> put(k, v)
                                        is Int -> put(k, v)
                                        null -> put(k, kotlinx.serialization.json.JsonNull)
                                        else -> put(k, v.toString())
                                    }
                                })
                            }.toString(),
                        )
                    },
                    onInput = { bytes, len -> onInputBytes(peer, bytes, 0, len) },
                    onCtrl = { onCtrl(peer, it) },
                    onUsable = { usable ->
                        players.firstOrNull { it?.peer === peer }?.let { p ->
                            p.stats.reset() // new path, new statistics
                        }
                        publish()
                    },
                )
                peer.rtc = rtc
                rtc.onOffer(data["sdp"]!!.jsonPrimitive.content)
            }
            "candidate" -> peer.rtc?.onCandidate(
                data["candidate"]!!.jsonPrimitive.content,
                data["sdpMid"]?.jsonPrimitive?.contentOrNullSafe(),
                data["sdpMLineIndex"]?.jsonPrimitive?.intOrNull,
            )
        }
    }

    /** Binary frames from the WebSocket: [u8 channel][payload]. */
    fun onBinary(peer: PhonePeer, bytes: ByteArray) {
        if (bytes.size < 2) return
        if (bytes[0].toInt() == 0) onInputBytes(peer, bytes, 1, bytes.size - 1)
        else onCtrl(peer, bytes.copyOfRange(1, bytes.size))
    }

    /* --------------------------------------------------------- hot path */

    private fun onInputBytes(peer: PhonePeer, bytes: ByteArray, off: Int, len: Int) {
        val p = players.firstOrNull { it?.peer === peer } ?: return
        val t = now()
        synchronized(p) {
            val s = p.scratch
            if (!Codec.decodeInputInto(bytes, off, len, s)) return
            val transit = if (p.clock.synced) p.clock.oneWay(s.clientTimeMs, t) else Double.NaN
            if (!p.stats.onPacket(s.seq, transit)) return
            p.input.copyFrom(s)
            p.lastSeen = SystemClock.elapsedRealtime()
            p.echo.seq = s.seq
            p.echo.clientTimeMs = s.clientTimeMs
            p.echo.hostTimeMs = t
            Codec.encodeEchoInto(p.echo, p.echoBuf)
            peer.sendInput(p.echoBuf, 12)
        }
        onInput?.invoke(p)
    }

    /* ---------------------------------------------------------- control */

    private fun onCtrl(peer: PhonePeer, bytes: ByteArray) {
        val msg = try {
            Codec.decodeControl(bytes)
        } catch (_: Codec.ProtocolError) {
            return
        }
        when (msg) {
            is ControlMsg.Hello -> onHello(peer, msg)
            is ControlMsg.Pong -> players.firstOrNull { it?.peer === peer }?.clock?.onPong(msg.hostTimeMs, msg.clientTimeMs, now())
            is ControlMsg.Menu -> players.firstOrNull { it?.peer === peer }?.let { onMenu?.invoke(it.slot, msg.action, msg.arg) }
            is ControlMsg.Leave -> players.firstOrNull { it?.peer === peer }?.let { removePlayer(it.slot) }
            else -> Unit
        }
    }

    private fun onHello(peer: PhonePeer, msg: ControlMsg.Hello) {
        val b = msg.body
        val name = b.name.ifBlank { "Player" }.take(16)
        val player: Player
        synchronized(this) {
            val slot = pickSlot(b.clientId, b.wantSlot)
            if (slot < 0) {
                peer.sendCtrl(Codec.encodeControl(ControlMsg.Error(ErrorBody("room-full", roomFullText()))))
                return
            }
            val existing = players[slot]
            player = if (existing != null && existing.clientId == b.clientId) {
                existing.also {
                    it.peer = peer; it.name = name; it.connected = true; it.caps = b.caps
                    it.clock.reset(); it.stats.reset(); it.lastSeen = SystemClock.elapsedRealtime()
                }
            } else {
                Player(b.clientId, slot, name, PLAYER_COLORS[slot], peer, b.caps).also { players[slot] = it }
            }
        }
        peer.sendCtrl(Codec.encodeControl(ControlMsg.Welcome(WelcomeBody(player.slot, player.color, name, skin, hostName))))
        peer.sendCtrl(Codec.encodeControl(ControlMsg.Skin(SkinBody(skin, gameTitle))))
        peer.sendCtrl(Codec.encodeControl(ControlMsg.HostState(hostState)))
        scope.launch {
            repeat(5) {
                ping(player)
                delay(200)
            }
        }
        onJoinLeave?.invoke(player, true)
        sendRoster()
        publish()
    }

    /** Same device back → its slot; else the slot it asks for; else the first free; else the longest-away one. Call under the lock. */
    private fun pickSlot(clientId: String, wantSlot: Int?): Int {
        var slot = players.indexOfFirst { it?.clientId == clientId }
        if (slot < 0 && wantSlot != null && wantSlot in 0 until maxPlayers && players[wantSlot] == null) slot = wantSlot
        if (slot < 0) slot = (0 until maxPlayers).firstOrNull { players[it] == null } ?: -1
        if (slot < 0) {
            slot = (0 until maxPlayers).filter { players[it]?.connected == false }
                .minByOrNull { players[it]!!.lastSeen } ?: -1
        }
        return slot
    }

    /* ------------------------------------------- controllers paired with the TV */

    /** A TV game controller pressed a button: seat it like a phone. Null when every slot is taken. */
    fun joinLocal(clientId: String, name: String): Player? {
        val player = synchronized(this) {
            val slot = pickSlot(clientId, null)
            if (slot < 0) return null
            val existing = players[slot]
            if (existing != null && existing.clientId == clientId) {
                existing.also { it.name = name; it.connected = true; it.lastSeen = SystemClock.elapsedRealtime() }
            } else {
                Player(clientId, slot, name, PLAYER_COLORS[slot], null, Caps(vibrate = false, gyro = false, ios = false), local = true).also { players[slot] = it }
            }
        }
        onJoinLeave?.invoke(player, true)
        sendRoster()
        publish()
        return player
    }

    /** Hot path for TV controllers (main thread): [Player.input] was just updated. */
    fun localInput(p: Player) {
        p.lastSeen = SystemClock.elapsedRealtime()
        onInput?.invoke(p)
    }

    /** The controller was switched off or unplugged: keep its slot for a while, like a phone. */
    fun localGone(p: Player) {
        if (players.getOrNull(p.slot) !== p) return
        p.connected = false
        p.lastSeen = SystemClock.elapsedRealtime()
        p.input.clear()
        onInput?.invoke(p)
        onJoinLeave?.invoke(p, false)
        sendRoster()
        publish()
    }

    /* ----------------------------------------------------------- public */

    fun setSkin(skin: String, title: String?) {
        this.skin = skin
        gameTitle = title
        broadcast(Codec.encodeControl(ControlMsg.Skin(SkinBody(skin, title))))
    }

    fun setHostState(screen: String, paused: Boolean, saveSlots: List<Int>) {
        hostState = HostStateBody(screen, paused, saveSlots)
        broadcast(Codec.encodeControl(ControlMsg.HostState(hostState)))
    }

    fun rumble(slot: Int, strong: Int, weak: Int, durationMs: Int) {
        val p = players.getOrNull(slot) ?: return
        if (p.local) {
            onLocalRumble?.invoke(p, strong, weak, durationMs)
            return
        }
        p.peer?.sendCtrl(Codec.encodeControl(ControlMsg.Rumble(strong, weak, durationMs)))
    }

    fun swapSlots(a: Int, b: Int) {
        if (a == b) return
        synchronized(this) {
            val pa = players[a]
            val pb = players[b]
            players[a] = pb
            players[b] = pa
            pb?.let { it.slot = a; it.color = PLAYER_COLORS[a]; it.peer?.sendCtrl(Codec.encodeControl(ControlMsg.Slot(SlotBody(a, it.color)))) }
            pa?.let { it.slot = b; it.color = PLAYER_COLORS[b]; it.peer?.sendCtrl(Codec.encodeControl(ControlMsg.Slot(SlotBody(b, it.color)))) }
        }
        sendRoster()
        publish()
    }

    fun removePlayer(slot: Int) {
        val p = synchronized(this) { players[slot].also { players[slot] = null } } ?: return
        p.peer?.sendCtrl(Codec.encodeControl(ControlMsg.Leave))
        p.input.clear()
        onInput?.invoke(p)
        onJoinLeave?.invoke(p, false)
        sendRoster()
        publish()
    }

    /**
     * Frees the slots of phones that left (they are kept 5 minutes for a reconnect), then moves
     * everyone up so the players fill P1, P2, … in their current order. Fixes "P1 left and the
     * game only listens to P1". Returns how many away players were removed.
     */
    fun tidySlots(): Int {
        val away = synchronized(this) { players.filter { it != null && !it.connected }.map { it!!.slot } }
        for (slot in away) removePlayer(slot)
        val moved = mutableListOf<Player>()
        synchronized(this) {
            val list = players.filterNotNull().sortedBy { it.slot }
            players.fill(null)
            list.forEachIndexed { i, p ->
                players[i] = p
                if (p.slot != i) {
                    p.slot = i
                    p.color = PLAYER_COLORS[i]
                    moved += p
                }
            }
        }
        for (p in moved) p.peer?.sendCtrl(Codec.encodeControl(ControlMsg.Slot(SlotBody(p.slot, p.color))))
        if (moved.isNotEmpty()) {
            sendRoster()
            publish()
        }
        return away.size
    }

    /* --------------------------------------------------------- periodic */

    private fun ping(p: Player) {
        p.peer?.sendCtrl(Codec.encodeControl(ControlMsg.Ping(pingId++ and 0xffff, now())))
    }

    private fun tick() {
        val nowMs = SystemClock.elapsedRealtime()
        for (p in players) {
            if (p == null) continue
            if (!p.connected) {
                if (nowMs - p.lastSeen > 5 * 60_000) synchronized(this) { players[p.slot] = null }
                continue
            }
            ping(p)
            p.peer?.sendCtrl(
                Codec.encodeControl(
                    ControlMsg.Stats(if (p.clock.srtt.isNaN()) 0.0 else p.clock.srtt, p.stats.jitter, p.stats.lossPermille, p.peer?.transport ?: 0, p.slot),
                ),
            )
        }
    }

    private fun sendRoster() {
        val list = players.filterNotNull().map { RosterEntry(it.slot, it.name, it.color, it.connected) }
        broadcast(Codec.encodeControl(ControlMsg.Roster(RosterBody(list))))
    }

    private fun broadcast(bytes: ByteArray) {
        for (p in players) p?.peer?.sendCtrl(bytes)
    }

    fun publish() {
        _view.value = SessionView(
            room,
            players.filterNotNull().map {
                val s = summarize(it.stats.latency.values())
                PlayerView(
                    it.slot, it.name, it.color, it.connected,
                    if (it.local) TransportKind.BT_HID else it.peer?.transport ?: 0,
                    it.clock.srtt, s.p50, s.p95, it.stats.jitter, it.stats.lossPermille / 10, it.local, it.caps.ios,
                )
            }.sortedBy { it.slot },
        )
    }

    companion object {
        private const val ALPHABET = "ABCDEFGHJKMNPQRSTWXYZ"
        fun generateRoomCode() = (1..4).map { ALPHABET[Random.nextInt(ALPHABET.length)] }.joinToString("")
    }
}

private fun kotlinx.serialization.json.JsonPrimitive.contentOrNullSafe(): String? = if (isString) content else null
