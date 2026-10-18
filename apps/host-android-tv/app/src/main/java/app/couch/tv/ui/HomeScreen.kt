package app.couch.tv.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import app.couch.tv.library.Game
import app.couch.tv.net.SessionView
import coil3.compose.SubcomposeAsyncImage

private val THUMB_DIRS = mapOf(
    "nes" to "Nintendo - Nintendo Entertainment System",
    "snes" to "Nintendo - Super Nintendo Entertainment System",
    "genesis" to "Sega - Mega Drive - Genesis",
    "gb" to "Nintendo - Game Boy",
    "gbc" to "Nintendo - Game Boy Color",
    "gba" to "Nintendo - Game Boy Advance",
    "psx" to "Sony - PlayStation",
    "n64" to "Nintendo - Nintendo 64",
    "psp" to "Sony - PlayStation Portable",
    "nds" to "Nintendo - Nintendo DS",
    "ps2" to "Sony - PlayStation 2",
    "atari2600" to "Atari - 2600",
    "pce" to "NEC - PC Engine - TurboGrafx 16",
)

/** libretro-thumbnails URL by No-Intro file name (same rule as the web host). */
fun thumbnailUrl(g: Game, kind: String = "Named_Boxarts"): String? {
    val dir = THUMB_DIRS[g.system] ?: return null
    val name = g.file.nameWithoutExtension.replace(Regex("[&*/:`<>?\\\\|]"), "_")
    return "https://thumbnails.libretro.com/${android.net.Uri.encode(dir)}/$kind/${android.net.Uri.encode(name)}.png"
}

@Composable
fun Art(
    game: Game,
    online: Boolean,
    modifier: Modifier = Modifier,
    kind: String = "Named_Boxarts",
    shape: Shape = RoundedCornerShape(14.dp),
    pixelated: Boolean = false,
) {
    val url = if (online) thumbnailUrl(game, kind) else null
    if (url == null) {
        GeneratedArt(game, modifier, shape)
        return
    }
    SubcomposeAsyncImage(
        model = url,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        filterQuality = if (pixelated) FilterQuality.None else FilterQuality.Low,
        modifier = modifier.clip(shape),
        loading = { GeneratedArt(game, Modifier.fillMaxSize(), shape) },
        error = { GeneratedArt(game, Modifier.fillMaxSize(), shape) },
    )
}

/** A stop on the platform wheel: every game, recents, favourites, then one per system. */
data class HomeRow(
    val key: String,
    /** Short name on the wheel. */
    val label: String,
    /** Full name for the header. */
    val title: String,
    val sub: String,
    val accent: Color?,
    val games: List<Game>,
)

/**
 * Big Box-style home (same layout as the web host): a big preview with a details panel and the
 * players panel on top, then a platform wheel and a cover wheel along the bottom.
 */
@Composable
fun HomeScreen(
    rows: List<HomeRow>,
    hiddenCount: Int,
    server: app.couch.tv.library.ServerState?,
    serverLoad: app.couch.tv.library.LoadProgress?,
    view: SessionView,
    joinUrl: String?,
    maxPlayers: Int,
    onlineArt: Boolean,
    recents: List<String>,
    favourites: Set<String>,
    needsStoragePermission: Boolean,
    onGrantStorage: () -> Unit,
    onOpen: (Game) -> Unit,
    onSettings: () -> Unit,
    onServer: () -> Unit,
    onRefresh: () -> Unit,
    onPlayers: () -> Unit,
) {
    var platformKey by rememberSaveable { mutableStateOf("all") }
    var focusedId by rememberSaveable { mutableStateOf<String?>(null) }
    val platform = rows.firstOrNull { it.key == platformKey } ?: rows.firstOrNull()
    val games = platform?.games.orEmpty()
    val game = games.firstOrNull { it.id == focusedId } ?: games.firstOrNull()
    val sys = game?.let { app.couch.tv.library.Systems.byId(it.system) }
    val target = sys?.accent?.let(::hexColor) ?: platform?.accent ?: Accent
    val accent by animateColorAsState(target, tween(600), label = "sys")
    val firstCard = remember { FocusRequester() }

    Box(Modifier.fillMaxSize()) {
        Backdrop(game, onlineArt, accent)
        Column(Modifier.fillMaxSize()) {
            TopBar(
                title = platform?.title ?: "Couch",
                position = if (game != null) "${games.indexOf(game) + 1} / ${games.size}" else "0 / 0",
                view = view,
                accent = accent,
                onSettings = onSettings,
            )
            Row(
                Modifier.weight(1f).fillMaxWidth().padding(start = 28.dp, end = 28.dp, top = 4.dp, bottom = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Preview(game, onlineArt, accent, Modifier.weight(1f).fillMaxHeight(), loading = serverLoad)
                Details(
                    game = game,
                    recentIndex = game?.let { recents.indexOf(it.id) } ?: -1,
                    favourite = game?.id in favourites,
                    needsStoragePermission = needsStoragePermission,
                    accent = accent,
                    modifier = Modifier.width(270.dp).fillMaxHeight(),
                )
                PlayersPanel(view, joinUrl, maxPlayers, accent, Modifier.width(250.dp).fillMaxHeight())
            }
            PlatformWheel(rows, platform?.key, accent) { key ->
                if (key != platformKey) {
                    platformKey = key
                    focusedId = null
                }
            }
            CoverWheel(
                key = platform?.key ?: "none",
                games = games,
                current = game,
                onlineArt = onlineArt,
                accent = accent,
                firstCard = firstCard,
                needsStoragePermission = needsStoragePermission,
                onFocus = { focusedId = it.id },
                onOpen = onOpen,
                onEmpty = if (needsStoragePermission) onGrantStorage else onRefresh,
            )
            Hints(hiddenCount, needsStoragePermission, accent, view, server, serverLoad, onGrantStorage, onServer, onRefresh, onPlayers)
        }
    }
    LaunchedEffect(rows.isNotEmpty()) { runCatching { firstCard.requestFocus() } }
}
