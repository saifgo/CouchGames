package app.couch.tv.ui

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.KeyEvent
import app.couch.tv.protocol.Button
import app.couch.tv.protocol.InputState

/**
 * Phones drive the TV UI by injecting the same key events a TV remote sends, so
 * Compose-for-TV focus handling just works. Bottom face button (RetroPad B) or
 * START = select, right face (RetroPad A) or SELECT = back (same rule as the web host).
 */
class PhoneNavigator(private val activity: Activity, private val onMenu: (slot: Int) -> Unit) {
    @Volatile var enabled = true
    private val main = Handler(Looper.getMainLooper())
    private val prev = LongArray(8)
    private val held = IntArray(8)
    private val nextRepeat = LongArray(8)

    init {
        main.post(object : Runnable {
            override fun run() {
                val now = SystemClock.uptimeMillis()
                for (slot in 0 until 8) {
                    if (enabled && held[slot] != 0 && now >= nextRepeat[slot]) {
                        nextRepeat[slot] = now + 110
                        key(held[slot])
                    }
                }
                main.postDelayed(this, 30)
            }
        })
    }

    fun feed(slot: Int, s: InputState) {
        if (slot !in 0 until 8) return
        var bits = s.buttons
        if (s.ly < -80) bits = bits or (1L shl Button.UP)
        if (s.ly > 80) bits = bits or (1L shl Button.DOWN)
        if (s.lx < -80) bits = bits or (1L shl Button.LEFT)
        if (s.lx > 80) bits = bits or (1L shl Button.RIGHT)
        val pressed = bits and prev[slot].inv()
        prev[slot] = bits
        if (pressed and (1L shl Button.MENU) != 0L) main.post { onMenu(slot) }
        if (!enabled) {
            held[slot] = 0
            return
        }
        val dir = when {
            bits and (1L shl Button.UP) != 0L -> KeyEvent.KEYCODE_DPAD_UP
            bits and (1L shl Button.DOWN) != 0L -> KeyEvent.KEYCODE_DPAD_DOWN
            bits and (1L shl Button.LEFT) != 0L -> KeyEvent.KEYCODE_DPAD_LEFT
            bits and (1L shl Button.RIGHT) != 0L -> KeyEvent.KEYCODE_DPAD_RIGHT
            else -> 0
        }
        if (dir != held[slot]) {
            held[slot] = dir
            if (dir != 0) {
                key(dir)
                nextRepeat[slot] = SystemClock.uptimeMillis() + 380
            }
        }
        if (pressed and ((1L shl Button.B) or (1L shl Button.START)) != 0L) key(KeyEvent.KEYCODE_DPAD_CENTER)
        if (pressed and ((1L shl Button.A) or (1L shl Button.SELECT)) != 0L) key(KeyEvent.KEYCODE_BACK)
    }

    private fun key(code: Int) = main.post {
        val t = SystemClock.uptimeMillis()
        activity.dispatchKeyEvent(KeyEvent(t, t, KeyEvent.ACTION_DOWN, code, 0))
        activity.dispatchKeyEvent(KeyEvent(t, t, KeyEvent.ACTION_UP, code, 0))
    }
}
