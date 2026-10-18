package app.couch.tv

import app.couch.tv.library.RemoteLibrary
import app.couch.tv.library.SERVER_ROOT
import app.couch.tv.library.ServerState
import app.couch.tv.library.StorageStatus
import app.couch.tv.library.StoreInfo
import app.couch.tv.library.Systems
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.BeforeClass
import org.junit.Test
import java.io.File

class RemoteLibraryTest {
    companion object {
        @BeforeClass
        @JvmStatic
        fun loadSystems() = Systems.loadJson(File("src/main/assets/systems.json").readText())
    }

    @Test
    fun normalizesWhatPeopleType() {
        val n = RemoteLibrary::normalizeServer
        assertEquals("", n("  "))
        assertEquals("", n("https://"))
        assertEquals("http://192.168.1.20:8787", n("192.168.1.20:8787"))
        assertEquals("https://couch.example.com", n("https://couch.example.com/"))
        assertEquals("https://couch.example.com", n(" HTTPS://couch.example.com/c/?r=ABCD "))
        assertEquals("http://laptop.local:8787", n("http://laptop.local:8787?x=1"))
    }

    @Test
    fun parsesTheServerLibrary() {
        val body = """
            {"roms":[
              {"id":"abc123","system":"n64","file":"Super Mario 64 (USA).z64","title":"Super Mario 64","size":8388608,
               "mtimeMs":0,"source":"user","url":"/roms/n64/Super%20Mario%2064%20(USA).z64","extra":[],"canonical":null},
              {"id":"def456","system":"psx","file":"Disc.cue","title":"Disc","size":55,"source":"user",
               "url":"/roms/psx/Disc.cue","extra":["/roms/psx/Disc%20(Track%201).bin"]},
              {"id":"bad1","system":"dreamcast","file":"x.cdi","title":"x","size":1,"url":"/roms/dreamcast/x.cdi"},
              {"id":"bad2","system":"nes","file":"..","title":"x","size":1,"url":"/roms/nes/.."}
            ]}
        """.trimIndent()
        val cache = File("build/tmp/cache")
        val games = RemoteLibrary.parseLibrary(body, "https://couch.example.com", cache)
        assertEquals(listOf("srv-abc123", "srv-def456"), games.map { it.id })
        val mario = games[0]
        assertEquals(SERVER_ROOT, mario.root)
        assertEquals(File(cache, "n64/Super Mario 64 (USA).z64"), mario.file)
        assertEquals("https://couch.example.com", mario.remote!!.server)
        assertEquals("/roms/n64/Super%20Mario%2064%20(USA).z64", mario.remote!!.url)
        assertEquals(listOf(File(cache, "psx/Disc (Track 1).bin")), games[1].extra)
    }

    @Test
    fun statusChipLabels() {
        val s3 = StorageStatus(ok = true, games = 32, store = StoreInfo("s3", bucket = "couche-roms", prefix = ""))
        val ok = ServerState("https://c.example", reachable = true, games = 32, error = null, storage = s3)
        assertEquals("S3 · 32 games", ok.label)
        assertTrue(ok.healthy)
        val broken = ok.copy(storage = s3.copy(ok = false, error = "The secret key is wrong"))
        assertEquals("S3 · not connected", broken.label)
        assertFalse(broken.healthy)
        assertTrue(broken.detail.contains("secret key"))
        val offline = ServerState("https://c.example", reachable = false, games = 0, error = "timeout", storage = null)
        assertEquals("Server · offline", offline.label)
        assertFalse(offline.healthy)
        // Older servers have no /api/storage: reachable is enough.
        assertTrue(ServerState("http://x", true, 3, null, null).healthy)
    }
}
