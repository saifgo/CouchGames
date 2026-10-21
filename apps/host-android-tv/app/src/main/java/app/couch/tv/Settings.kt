package app.couch.tv

import android.content.Context
import androidx.core.content.edit

/** Host settings (SharedPreferences). */
class Settings(context: Context) {
    private val p = context.getSharedPreferences("couch", Context.MODE_PRIVATE)

    var hostName: String
        get() = p.getString("hostName", "Living room")!!
        set(v) = p.edit { putString("hostName", v) }
    var maxPlayers: Int
        get() = p.getInt("maxPlayers", 4)
        set(v) = p.edit { putInt("maxPlayers", v) }
    /** Measured tier (0 = not measured yet). */
    var measuredTier: Int
        get() = p.getInt("measuredTier", 0)
        set(v) = p.edit { putInt("measuredTier", v) }
    var measuredRatio: Float
        get() = p.getFloat("measuredRatio", 0f)
        set(v) = p.edit { putFloat("measuredRatio", v) }
    /** User override of the tier (0 = use measured). */
    var tierOverride: Int
        get() = p.getInt("tierOverride", 0)
        set(v) = p.edit { putInt("tierOverride", v) }
    var ps2Experimental: Boolean
        get() = p.getBoolean("ps2Experimental", false)
        set(v) = p.edit { putBoolean("ps2Experimental", v) }
    var latencyOverlay: Boolean
        get() = p.getBoolean("latencyOverlay", false)
        set(v) = p.edit { putBoolean("latencyOverlay", v) }
    /** Couch server whose library (roms/ folder or S3 bucket) this TV also shows; "" = none. */
    var serverUrl: String
        get() = p.getString("serverUrl", "")!!
        set(v) = p.edit { putString("serverUrl", v) }
    var onlineArt: Boolean
        get() = p.getBoolean("onlineArt", true)
        set(v) = p.edit { putBoolean("onlineArt", v) }
    /** Home screen theme (ui/Themes.kt ThemeId key): midnight (default), pixel, neon. */
    var theme: String
        get() = p.getString("theme", "midnight")!!
        set(v) = p.edit { putString("theme", v) }

    var telemetry: Boolean
        get() = p.getBoolean("telemetry", false)
        set(v) = p.edit { putBoolean("telemetry", v) }
    var onboardingDone: Boolean
        get() = p.getBoolean("onboardingDone", false)
        set(v) = p.edit { putBoolean("onboardingDone", v) }

    /** Last answer from Google Play about Couch Pro (kept so Pro works offline). */
    var proOwned: Boolean
        get() = p.getBoolean("proOwned", false)
        set(v) = p.edit { putBoolean("proOwned", v) }
    /** Debug builds: Pro without a purchase, for testing. */
    var proDebug: Boolean
        get() = p.getBoolean("proDebug", false)
        set(v) = p.edit { putBoolean("proDebug", v) }
    /** When the "Go Pro" card last showed before a game. */
    var lastProNag: Long
        get() = p.getLong("lastProNag", 0L)
        set(v) = p.edit { putLong("lastProNag", v) }

    fun core(system: String): String? = p.getString("core.$system", null)
    fun setCore(system: String, core: String) = p.edit { putString("core.$system", core) }

    val effectiveTier get() = if (tierOverride > 0) tierOverride else measuredTier.coerceAtLeast(1)

    fun recents(): List<String> = p.getString("recents", "")!!.split('|').filter { it.isNotEmpty() }
    fun touchRecent(id: String) = p.edit { putString("recents", (listOf(id) + recents().filter { it != id }).take(20).joinToString("|")) }
    fun favourites(): Set<String> = p.getStringSet("favs", emptySet())!!
    fun toggleFavourite(id: String): Boolean {
        val f = favourites().toMutableSet()
        val on = f.add(id) || run { f.remove(id); false }
        p.edit { putStringSet("favs", f) }
        return on
    }
}
