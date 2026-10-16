package app.couch.tv.net

import android.content.Context
import org.webrtc.DataChannel
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import java.nio.ByteBuffer

object Rtc {
    @Volatile private var factory: PeerConnectionFactory? = null

    fun factory(context: Context): PeerConnectionFactory = factory ?: synchronized(this) {
        factory ?: run {
            PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(context.applicationContext).createInitializationOptions())
            PeerConnectionFactory.builder().createPeerConnectionFactory().also { factory = it }
        }
    }
}

/**
 * Answering side of the phone's WebRTC link: the phone offers, we answer.
 * Two pre-negotiated DataChannels, exactly like packages/net/src/rtc.ts:
 *  id 0 "input": unordered, 0 retransmits; id 1 "ctrl": ordered, reliable.
 */
class RtcPeer(
    context: Context,
    private val sendSignal: (kind: String, payload: Map<String, Any?>) -> Unit,
    private val onInput: (ByteArray, Int) -> Unit,
    private val onCtrl: (ByteArray) -> Unit,
    private val onUsable: (Boolean) -> Unit,
) {
    private val pc: PeerConnection
    private val input: DataChannel
    private val ctrl: DataChannel
    private val pendingCandidates = mutableListOf<IceCandidate>()
    private var remoteSet = false
    private val inScratch = ByteArray(64)
    @Volatile var usable = false
        private set

    init {
        val config = PeerConnection.RTCConfiguration(emptyList()).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        }
        pc = Rtc.factory(context).createPeerConnection(config, object : PeerConnection.Observer {
            override fun onSignalingChange(s: PeerConnection.SignalingState?) = Unit
            override fun onIceConnectionChange(s: PeerConnection.IceConnectionState?) {
                when (s) {
                    PeerConnection.IceConnectionState.DISCONNECTED, PeerConnection.IceConnectionState.FAILED, PeerConnection.IceConnectionState.CLOSED -> setUsable(false)
                    PeerConnection.IceConnectionState.CONNECTED, PeerConnection.IceConnectionState.COMPLETED ->
                        if (input.state() == DataChannel.State.OPEN) setUsable(true)
                    else -> Unit
                }
            }
            override fun onIceConnectionReceivingChange(b: Boolean) = Unit
            override fun onIceGatheringChange(s: PeerConnection.IceGatheringState?) = Unit
            override fun onIceCandidate(c: IceCandidate) =
                sendSignal("candidate", mapOf("candidate" to c.sdp, "sdpMid" to c.sdpMid, "sdpMLineIndex" to c.sdpMLineIndex))
            override fun onIceCandidatesRemoved(c: Array<out IceCandidate>?) = Unit
            override fun onAddStream(s: MediaStream?) = Unit
            override fun onRemoveStream(s: MediaStream?) = Unit
            override fun onDataChannel(dc: DataChannel?) = Unit
            override fun onRenegotiationNeeded() = Unit
            override fun onAddTrack(r: RtpReceiver?, s: Array<out MediaStream>?) = Unit
        }) ?: error("could not create PeerConnection")
        input = pc.createDataChannel("input", DataChannel.Init().apply { negotiated = true; id = 0; ordered = false; maxRetransmits = 0 })
        ctrl = pc.createDataChannel("ctrl", DataChannel.Init().apply { negotiated = true; id = 1; ordered = true })
        input.registerObserver(observer { buf ->
            val n = buf.data.remaining().coerceAtMost(inScratch.size)
            buf.data.get(inScratch, 0, n)
            onInput(inScratch, n)
        })
        ctrl.registerObserver(observer { buf ->
            val bytes = ByteArray(buf.data.remaining())
            buf.data.get(bytes)
            onCtrl(bytes)
        })
    }

    private fun observer(onMsg: (DataChannel.Buffer) -> Unit) = object : DataChannel.Observer {
        override fun onBufferedAmountChange(previous: Long) = Unit
        override fun onStateChange() {
            if (input.state() == DataChannel.State.OPEN) setUsable(true)
            else if (input.state() == DataChannel.State.CLOSED) setUsable(false)
        }
        override fun onMessage(buffer: DataChannel.Buffer) = onMsg(buffer)
    }

    private fun setUsable(v: Boolean) {
        if (usable == v) return
        usable = v
        onUsable(v)
    }

    fun onOffer(sdp: String) {
        pc.setRemoteDescription(object : SimpleSdp() {
            override fun onSetSuccess() {
                synchronized(pendingCandidates) {
                    remoteSet = true
                    pendingCandidates.forEach { pc.addIceCandidate(it) }
                    pendingCandidates.clear()
                }
                pc.createAnswer(object : SimpleSdp() {
                    override fun onCreateSuccess(desc: SessionDescription) {
                        pc.setLocalDescription(object : SimpleSdp() {
                            override fun onSetSuccess() = sendSignal("answer", mapOf("sdp" to desc.description))
                        }, desc)
                    }
                }, MediaConstraints())
            }
        }, SessionDescription(SessionDescription.Type.OFFER, sdp))
    }

    fun onCandidate(candidate: String, sdpMid: String?, sdpMLineIndex: Int?) {
        val c = IceCandidate(sdpMid ?: "0", sdpMLineIndex ?: 0, candidate)
        synchronized(pendingCandidates) {
            if (remoteSet) pc.addIceCandidate(c) else pendingCandidates += c
        }
    }

    /** Unreliable send; dropped (never queued) when the channel is backed up. */
    fun sendInput(bytes: ByteArray, len: Int): Boolean {
        if (!usable || input.bufferedAmount() > 256) return false
        return input.send(DataChannel.Buffer(ByteBuffer.wrap(bytes, 0, len), true))
    }

    fun sendCtrl(bytes: ByteArray): Boolean {
        if (!usable || ctrl.state() != DataChannel.State.OPEN) return false
        return ctrl.send(DataChannel.Buffer(ByteBuffer.wrap(bytes), true))
    }

    fun close() {
        usable = false
        runCatching { input.unregisterObserver(); ctrl.unregisterObserver() }
        runCatching { pc.dispose() }
    }

    private open class SimpleSdp : SdpObserver {
        override fun onCreateSuccess(desc: SessionDescription) = Unit
        override fun onSetSuccess() = Unit
        override fun onCreateFailure(error: String?) = Unit
        override fun onSetFailure(error: String?) = Unit
    }
}
