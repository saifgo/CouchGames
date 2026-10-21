package app.couch.tv

import app.couch.tv.library.Systems
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class ProRulesTest {
    @Test
    fun freeIsLimitedProIsNot() {
        assertEquals(2, ProRules.players(pro = false, chosen = 8))
        assertEquals(8, ProRules.players(pro = true, chosen = 8))
        assertTrue(ProRules.systemAllowed(false, "snes"))
        assertFalse(ProRules.systemAllowed(false, "n64"))
        assertTrue(ProRules.systemAllowed(true, "n64"))
        assertTrue(ProRules.saveSlotAllowed(false, 0))
        assertFalse(ProRules.saveSlotAllowed(false, 1))
        assertTrue(ProRules.saveSlotAllowed(true, 3))
        assertFalse(ProRules.remoteLibrary(false))
    }

    @Test
    fun reminderAtMostOncePerInterval() {
        val t = 1_000_000_000_000L
        assertTrue(ProRules.shouldNag(false, 0, t))
        assertFalse(ProRules.shouldNag(false, t, t + 60_000))
        assertTrue(ProRules.shouldNag(false, t, t + ProRules.NAG_INTERVAL_MS))
        assertFalse(ProRules.shouldNag(true, 0, t))
    }

    @Test
    fun freeSystemsExistAndMasterSystemUsesGearsystem() {
        Systems.loadJson(File("src/main/assets/systems.json").readText())
        for (id in ProRules.FREE_SYSTEMS) assertTrue(id, Systems.byId(id) != null)
        val genesis = Systems.byId("genesis")!!
        assertEquals(listOf("gearsystem"), genesis.coresFor("Alex Kidd (USA).SMS"))
        assertEquals("clownmdemu", genesis.coresFor("Sonic.md").first())
    }
}
