package app.couch.tv.library

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** Mirrors packages/systems (exported to assets/systems.json at build time). */
@Serializable
data class BiosFile(val file: String, val required: Boolean, val note: String)

@Serializable
data class AndroidCores(val cores: List<String>, val experimental: Boolean = false)

@Serializable
data class SystemDef(
    val id: String,
    val name: String,
    val shortName: String,
    val maker: String,
    val year: Int,
    val extensions: List<String>,
    val skin: String,
    val maxPlayers: Int,
    val tier: Int,
    val accent: String,
    val android: AndroidCores,
    val bios: List<BiosFile>,
)

@Serializable
private data class SystemsFile(val version: Int, val systems: List<SystemDef>)

object Systems {
    lateinit var all: List<SystemDef>
        private set

    fun load(context: Context) {
        val json = Json { ignoreUnknownKeys = true }
        all = json.decodeFromString(SystemsFile.serializer(), context.assets.open("systems.json").bufferedReader().readText()).systems
    }

    fun byId(id: String): SystemDef? = all.firstOrNull { it.id == id }
}

/** Pretty title from a ROM filename (same rules as titleFromFilename in @couch/systems). */
fun titleFromFilename(file: String): String {
    var t = file.substringBeforeLast('.')
    t = t.replace(Regex("\\s*[(\\[][^)\\]]*[)\\]]"), "")
    t = t.replace('_', ' ').replace(Regex("\\s{2,}"), " ").trim()
    Regex("^(.*), (The|A|An)$", RegexOption.IGNORE_CASE).find(t)?.let { t = "${it.groupValues[2]} ${it.groupValues[1]}" }
    return t.ifEmpty { file }
}
