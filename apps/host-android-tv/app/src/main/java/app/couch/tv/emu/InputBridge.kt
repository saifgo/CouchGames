package app.couch.tv.emu

import android.view.KeyEvent
import app.couch.tv.protocol.Button
import app.couch.tv.protocol.InputState
import com.swordfish.libretrodroid.GLRetroView
import com.swordfish.libretrodroid.LibretroDroid

/**
 * Phone state → LibretroDroid. LibretroDroid maps Android gamepad key codes to
 * RetroPad ids (input.cpp: BUTTON_A→A, BUTTON_B→B, …), polled by the core at
 * its next retro_run. We only send what changed, per port.
 */
class InputBridge {
    @Volatile var view: GLRetroView? = null
    private val last = Array(8) { InputState() }
    @Volatile var enabled = true

    private val keyFor = IntArray(16).also {
        it[Button.B] = KeyEvent.KEYCODE_BUTTON_B
        it[Button.Y] = KeyEvent.KEYCODE_BUTTON_Y
        it[Button.SELECT] = KeyEvent.KEYCODE_BUTTON_SELECT
        it[Button.START] = KeyEvent.KEYCODE_BUTTON_START
        it[Button.UP] = KeyEvent.KEYCODE_DPAD_UP
        it[Button.DOWN] = KeyEvent.KEYCODE_DPAD_DOWN
        it[Button.LEFT] = KeyEvent.KEYCODE_DPAD_LEFT
        it[Button.RIGHT] = KeyEvent.KEYCODE_DPAD_RIGHT
        it[Button.A] = KeyEvent.KEYCODE_BUTTON_A
        it[Button.X] = KeyEvent.KEYCODE_BUTTON_X
        it[Button.L] = KeyEvent.KEYCODE_BUTTON_L1
        it[Button.R] = KeyEvent.KEYCODE_BUTTON_R1
        it[Button.L2] = KeyEvent.KEYCODE_BUTTON_L2
        it[Button.R2] = KeyEvent.KEYCODE_BUTTON_R2
        it[Button.L3] = KeyEvent.KEYCODE_BUTTON_THUMBL
        it[Button.R3] = KeyEvent.KEYCODE_BUTTON_THUMBR
    }

    /** Hot path, called from network threads; GLRetroView queues onto the GL thread. */
    fun apply(port: Int, s: InputState) {
        val v = view ?: return
        if (!enabled || port !in last.indices) return
        val prev = last[port]
        synchronized(prev) {
            val changed = s.buttons xor prev.buttons
            if (changed != 0L) {
                for (id in 0 until 16) {
                    if ((changed shr id) and 1L == 0L) continue
                    val down = (s.buttons shr id) and 1L == 1L
                    v.sendKeyEvent(if (down) KeyEvent.ACTION_DOWN else KeyEvent.ACTION_UP, keyFor[id], port)
                }
            }
            if (s.lx != prev.lx || s.ly != prev.ly) v.sendMotionEvent(LibretroDroid.MOTION_SOURCE_ANALOG_LEFT, s.lx / 127f, s.ly / 127f, port)
            if (s.rx != prev.rx || s.ry != prev.ry) v.sendMotionEvent(LibretroDroid.MOTION_SOURCE_ANALOG_RIGHT, s.rx / 127f, s.ry / 127f, port)
            prev.copyFrom(s)
        }
    }

    /** Release everything on every port (menu opened, game exits, player leaves). */
    fun releaseAll() {
        val empty = InputState()
        for (port in last.indices) apply(port, empty)
    }

    fun reset() {
        for (s in last) synchronized(s) { s.clear() }
    }
}
