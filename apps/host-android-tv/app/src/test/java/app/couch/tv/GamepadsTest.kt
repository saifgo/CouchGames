package app.couch.tv

import android.view.KeyEvent
import app.couch.tv.emu.Gamepads
import app.couch.tv.protocol.Button
import org.junit.Assert.assertEquals
import org.junit.Test

class GamepadsTest {
    @Test
    fun faceButtonsMapByPosition() {
        // Android BUTTON_A is the bottom face button = RetroPad B (bottom on a SNES pad).
        assertEquals(Button.B, Gamepads.bitFor(KeyEvent.KEYCODE_BUTTON_A))
        assertEquals(Button.A, Gamepads.bitFor(KeyEvent.KEYCODE_BUTTON_B))
        assertEquals(Button.Y, Gamepads.bitFor(KeyEvent.KEYCODE_BUTTON_X))
        assertEquals(Button.X, Gamepads.bitFor(KeyEvent.KEYCODE_BUTTON_Y))
    }

    @Test
    fun otherButtons() {
        assertEquals(Button.L, Gamepads.bitFor(KeyEvent.KEYCODE_BUTTON_L1))
        assertEquals(Button.R2, Gamepads.bitFor(KeyEvent.KEYCODE_BUTTON_R2))
        assertEquals(Button.L3, Gamepads.bitFor(KeyEvent.KEYCODE_BUTTON_THUMBL))
        assertEquals(Button.START, Gamepads.bitFor(KeyEvent.KEYCODE_BUTTON_START))
        assertEquals(Button.SELECT, Gamepads.bitFor(KeyEvent.KEYCODE_BUTTON_SELECT))
        assertEquals(Button.SELECT, Gamepads.bitFor(KeyEvent.KEYCODE_BACK))
        assertEquals(Button.MENU, Gamepads.bitFor(KeyEvent.KEYCODE_BUTTON_MODE))
        assertEquals(Button.UP, Gamepads.bitFor(KeyEvent.KEYCODE_DPAD_UP))
        assertEquals(-1, Gamepads.bitFor(KeyEvent.KEYCODE_VOLUME_UP))
    }

    @Test
    fun sticksHaveADeadZone() {
        assertEquals(0, Gamepads.stick(.1f))
        assertEquals(0, Gamepads.stick(-.14f))
        assertEquals(127, Gamepads.stick(1f))
        assertEquals(-127, Gamepads.stick(-1.2f))
        assertEquals(64, Gamepads.stick(.5f))
    }

    @Test
    fun shortNames() {
        assertEquals("Xbox pad", Gamepads.shortName("Xbox Wireless Controller"))
        assertEquals("PlayStation pad", Gamepads.shortName("DualSense Wireless Controller"))
        assertEquals("PlayStation pad", Gamepads.shortName("Wireless Controller"))
        assertEquals("Controller", Gamepads.shortName(null))
        assertEquals("8BitDo pad", Gamepads.shortName("8BitDo SN30 Pro"))
    }
}
