package app.couch.tv.emu

import android.hardware.input.InputManager
import android.os.Build
import android.os.SystemClock
import android.os.VibrationEffect
import android.util.SparseArray
import android.util.SparseBooleanArray
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import app.couch.tv.net.HostSession
import app.couch.tv.net.Player
import app.couch.tv.protocol.Button
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Game controllers paired with the TV (Bluetooth or USB) become players, exactly like phones:
 * the first button press seats the controller in the first free slot, and its state then goes
 * through the same path as phone input (emulator pads, UI navigation, Home menu).
 *
 * Buttons are mapped by position, as RetroArch does: Android's BUTTON_A is the bottom face
 * button, which is RetroPad B (bottom on a SNES pad); BUTTON_B (right) is RetroPad A, and so on.
 * START + SELECT together (or the Guide / PS button, when Android passes it on) opens the menu.
 *
 * Called on the main thread from the activity's dispatch methods; no allocation per event.
 */
class Gamepads(private val session: HostSession) : InputManager.InputDeviceListener {
    private class Pad(val clientId: String, val name: String, val rxAxis: Int, val ryAxis: Int) {
        var player: Player? = null
        var keyBits = 0L
        var axisBits = 0L
        var lx = 0
        var ly = 0
        var rx = 0
        var ry = 0
        var l2 = 0
        var r2 = 0
        var rejectedAt = 0L
    }

    private val pads = SparseArray<Pad>()
    private val notPads = SparseBooleanArray()

    init {
        session.onLocalRumble = { p, strong, weak, ms -> rumble(p, max(strong, weak), ms) }
    }

    /** Vibrates the controller seated as [p], if it has motors. */
    private fun rumble(p: Player, amplitude: Int, durationMs: Int) {
        for (i in 0 until pads.size()) {
            if (pads.valueAt(i).player !== p) continue
            val dev = InputDevice.getDevice(pads.keyAt(i)) ?: return
            runCatching {
                @Suppress("DEPRECATION")
                val vib = if (Build.VERSION.SDK_INT >= 31) dev.vibratorManager.defaultVibrator else dev.vibrator
                if (!vib.hasVibrator()) return
                if (amplitude <= 0) vib.cancel()
                else vib.vibrate(VibrationEffect.createOneShot(durationMs.toLong().coerceAtLeast(1), amplitude.coerceIn(1, 255)))
            }
            return
        }
    }

    /** True when the event came from a game controller and was used. */
    fun onKey(e: KeyEvent): Boolean {
        val bit = bitFor(e.keyCode)
        if (bit < 0) return false
        val pad = pad(e.deviceId) ?: return false
        when (e.action) {
            KeyEvent.ACTION_DOWN -> {
                if (e.repeatCount > 0) return true
                pad.keyBits = pad.keyBits or (1L shl bit)
            }
            KeyEvent.ACTION_UP -> pad.keyBits = pad.keyBits and (1L shl bit).inv()
            else -> return true
        }
        push(pad)
        return true
    }

    /** Sticks, triggers and hat d-pads. */
    fun onMotion(e: MotionEvent): Boolean {
        if (e.source and InputDevice.SOURCE_JOYSTICK != InputDevice.SOURCE_JOYSTICK || e.action != MotionEvent.ACTION_MOVE) return false
        val pad = pad(e.deviceId) ?: return false
        pad.lx = stick(e.getAxisValue(MotionEvent.AXIS_X))
        pad.ly = stick(e.getAxisValue(MotionEvent.AXIS_Y))
        pad.rx = stick(e.getAxisValue(pad.rxAxis))
        pad.ry = stick(e.getAxisValue(pad.ryAxis))
        val lt = max(e.getAxisValue(MotionEvent.AXIS_LTRIGGER), e.getAxisValue(MotionEvent.AXIS_BRAKE))
        val rt = max(e.getAxisValue(MotionEvent.AXIS_RTRIGGER), e.getAxisValue(MotionEvent.AXIS_GAS))
        pad.l2 = (lt * 255).roundToInt().coerceIn(0, 255)
        pad.r2 = (rt * 255).roundToInt().coerceIn(0, 255)
        val hx = e.getAxisValue(MotionEvent.AXIS_HAT_X)
        val hy = e.getAxisValue(MotionEvent.AXIS_HAT_Y)
        var bits = 0L
        if (hx < -.5f) bits = bits or (1L shl Button.LEFT)
        if (hx > .5f) bits = bits or (1L shl Button.RIGHT)
        if (hy < -.5f) bits = bits or (1L shl Button.UP)
        if (hy > .5f) bits = bits or (1L shl Button.DOWN)
        if (lt > .5f) bits = bits or (1L shl Button.L2)
        if (rt > .5f) bits = bits or (1L shl Button.R2)
        pad.axisBits = bits
        push(pad)
        return true
    }

    private fun push(pad: Pad) {
        var p = pad.player
        // Not seated yet, or removed from the TV's Players screen since: (re)join.
        if (p == null || session.players.getOrNull(p.slot) !== p) {
            val now = SystemClock.uptimeMillis()
            if (now - pad.rejectedAt < 2000) return
            p = session.joinLocal(pad.clientId, pad.name)
            if (p == null) {
                pad.rejectedAt = now // every slot taken
                pad.player = null
                return
            }
            pad.player = p
        }
        var bits = pad.keyBits or pad.axisBits
        val startSelect = (1L shl Button.START) or (1L shl Button.SELECT)
        if (bits and startSelect == startSelect) bits = bits or (1L shl Button.MENU)
        val s = p.input
        synchronized(p) {
            s.buttons = bits
            s.lx = pad.lx; s.ly = pad.ly; s.rx = pad.rx; s.ry = pad.ry
            s.l2 = pad.l2; s.r2 = pad.r2
        }
        session.localInput(p)
    }

    private fun pad(deviceId: Int): Pad? {
        pads.get(deviceId)?.let { return it }
        if (notPads.get(deviceId)) return null
        val dev = InputDevice.getDevice(deviceId)
        if (dev == null || !isGamepad(dev)) {
            notPads.put(deviceId, true)
            return null
        }
        val hasZ = dev.getMotionRange(MotionEvent.AXIS_Z) != null
        return Pad(
            clientId = "pad:" + dev.descriptor,
            name = shortName(dev.name),
            rxAxis = if (hasZ) MotionEvent.AXIS_Z else MotionEvent.AXIS_RX,
            ryAxis = if (hasZ) MotionEvent.AXIS_RZ else MotionEvent.AXIS_RY,
        ).also { pads.put(deviceId, it) }
    }

    override fun onInputDeviceAdded(deviceId: Int) {
        notPads.delete(deviceId)
    }

    override fun onInputDeviceChanged(deviceId: Int) {
        notPads.delete(deviceId)
    }

    override fun onInputDeviceRemoved(deviceId: Int) {
        notPads.delete(deviceId)
        val pad = pads.get(deviceId) ?: return
        pads.remove(deviceId)
        pad.player?.let { session.localGone(it) }
    }

    companion object {
        /** Real game controllers only: TV remotes are d-pad/keyboard devices without face buttons. */
        fun isGamepad(dev: InputDevice): Boolean {
            if (dev.isVirtual) return false
            val gamepad = dev.sources and InputDevice.SOURCE_GAMEPAD == InputDevice.SOURCE_GAMEPAD
            val joystick = dev.sources and InputDevice.SOURCE_JOYSTICK == InputDevice.SOURCE_JOYSTICK
            if (!gamepad && !joystick) return false
            return dev.hasKeys(KeyEvent.KEYCODE_BUTTON_A)[0] || dev.getMotionRange(MotionEvent.AXIS_X, InputDevice.SOURCE_JOYSTICK) != null
        }

        /** Android key code → RetroPad bit (by position), or -1 when we don't use the key. */
        fun bitFor(keyCode: Int): Int = when (keyCode) {
            KeyEvent.KEYCODE_BUTTON_A -> Button.B
            KeyEvent.KEYCODE_BUTTON_B -> Button.A
            KeyEvent.KEYCODE_BUTTON_X -> Button.Y
            KeyEvent.KEYCODE_BUTTON_Y -> Button.X
            KeyEvent.KEYCODE_BUTTON_L1 -> Button.L
            KeyEvent.KEYCODE_BUTTON_R1 -> Button.R
            KeyEvent.KEYCODE_BUTTON_L2 -> Button.L2
            KeyEvent.KEYCODE_BUTTON_R2 -> Button.R2
            KeyEvent.KEYCODE_BUTTON_THUMBL -> Button.L3
            KeyEvent.KEYCODE_BUTTON_THUMBR -> Button.R3
            KeyEvent.KEYCODE_BUTTON_START -> Button.START
            KeyEvent.KEYCODE_BUTTON_SELECT, KeyEvent.KEYCODE_BACK -> Button.SELECT
            KeyEvent.KEYCODE_BUTTON_MODE -> Button.MENU
            KeyEvent.KEYCODE_DPAD_UP -> Button.UP
            KeyEvent.KEYCODE_DPAD_DOWN -> Button.DOWN
            KeyEvent.KEYCODE_DPAD_LEFT -> Button.LEFT
            KeyEvent.KEYCODE_DPAD_RIGHT -> Button.RIGHT
            else -> -1
        }

        fun stick(v: Float): Int = if (abs(v) < .15f) 0 else (v * 127).roundToInt().coerceIn(-127, 127)

        /** Player names are 16 characters at most: "Xbox Wireless Controller" → "Xbox pad". */
        fun shortName(name: String?): String {
            val n = name.orEmpty().lowercase()
            return when {
                "xbox" in n || "microsoft" in n -> "Xbox pad"
                "dualsense" in n || "dualshock" in n || "playstation" in n || "sony" in n || n == "wireless controller" -> "PlayStation pad"
                "shield" in n || "nvidia" in n -> "Shield pad"
                "8bitdo" in n -> "8BitDo pad"
                "pro controller" in n || "joy-con" in n || "nintendo" in n -> "Switch pad"
                "stadia" in n -> "Stadia pad"
                else -> "Controller"
            }
        }
    }
}
