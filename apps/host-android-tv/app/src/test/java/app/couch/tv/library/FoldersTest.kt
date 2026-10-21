package app.couch.tv.library

import org.junit.Assert.assertEquals
import org.junit.Test

class FoldersTest {
    @Test
    fun cueTracksListsFileNamesOnly() {
        val cue = """
            FILE "Game (Track 1).bin" BINARY
              TRACK 01 MODE2/2352
            FILE "sub\Game (Track 2).bin" BINARY
              TRACK 02 AUDIO
            FILE track3.wav WAVE
        """.trimIndent()
        assertEquals(listOf("Game (Track 1).bin", "Game (Track 2).bin", "track3.wav"), Folders.cueTracks(cue))
    }

    @Test
    fun gameIdIsStable() {
        // Save files are named by this id: it must match what older versions computed.
        assertEquals(Library.gameId("nes", "240pee.nes", 40976), Library.gameId("nes", "240pee.nes", 40976))
        assertEquals(12, Library.gameId("snes", "a.sfc", 1).length)
    }
}
