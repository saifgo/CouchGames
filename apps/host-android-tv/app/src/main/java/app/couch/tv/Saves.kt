package app.couch.tv

import android.content.ContentUris
import android.content.Context
import android.net.Uri
import androidx.tvprovider.media.tv.TvContractCompat
import androidx.tvprovider.media.tv.WatchNextProgram
import app.couch.tv.library.Game
import java.io.File

/** Save states, SRAM and the Android TV "Continue playing" row. */
class Saves(private val context: Context) {
    private fun dir(gameId: String) = File(context.filesDir, "saves/$gameId").apply { mkdirs() }

    fun stateFile(gameId: String, slot: String) = File(dir(gameId), "$slot.state")
    fun sramFile(gameId: String) = File(dir(gameId), "game.srm")

    fun write(gameId: String, slot: String, data: ByteArray) = stateFile(gameId, slot).writeBytes(data)
    fun read(gameId: String, slot: String): ByteArray? = stateFile(gameId, slot).takeIf { it.exists() }?.readBytes()

    /** Numbered slots that hold a save, with timestamps. */
    fun slots(gameId: String): Map<Int, Long> =
        (0 until 4).mapNotNull { i -> stateFile(gameId, "slot$i").takeIf { it.exists() }?.let { i to it.lastModified() } }.toMap()

    fun hasAuto(gameId: String) = stateFile(gameId, "auto").exists()

    /** Publishes/updates the game in the TV home screen's "Play next / Continue" row. */
    fun publishWatchNext(game: Game, systemName: String) {
        runCatching {
            val existing = context.contentResolver.query(TvContractCompat.WatchNextPrograms.CONTENT_URI, arrayOf("_id", TvContractCompat.WatchNextPrograms.COLUMN_INTERNAL_PROVIDER_ID), null, null, null)
            var id: Long? = null
            existing?.use { c ->
                while (c.moveToNext()) if (c.getString(1) == game.id) id = c.getLong(0)
            }
            val program = WatchNextProgram.Builder()
                .setType(TvContractCompat.PreviewPrograms.TYPE_GAME)
                .setWatchNextType(TvContractCompat.WatchNextPrograms.WATCH_NEXT_TYPE_CONTINUE)
                .setLastEngagementTimeUtcMillis(System.currentTimeMillis())
                .setTitle(game.title)
                .setDescription(systemName)
                .setInternalProviderId(game.id)
                .setIntentUri(Uri.parse("couch://game/${game.id}"))
                .build()
            if (id != null) {
                context.contentResolver.update(TvContractCompat.buildWatchNextProgramUri(id!!), program.toContentValues(), null, null)
            } else {
                context.contentResolver.insert(TvContractCompat.WatchNextPrograms.CONTENT_URI, program.toContentValues())
                    ?.let { ContentUris.parseId(it) }
            }
        } // No TV provider on phones/tablets: silently skipped.
    }
}
