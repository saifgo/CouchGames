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
import androidx.compose.ui.Alignment
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
    val contain = kind != "Named_Boxarts"
    if (url == null) {
        DefaultCover(game, modifier, shape, contain)
        return
    }
    SubcomposeAsyncImage(
        model = url,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        filterQuality = if (pixelated) FilterQuality.None else FilterQuality.Low,
        modifier = modifier.clip(shape),
        loading = { DefaultCover(game, Modifier.fillMaxSize(), shape, contain) },
        error = { DefaultCover(game, Modifier.fillMaxSize(), shape, contain) },
    )
}

/** A stop on the platform wheel: every game, recents, favourites, then one per system. */
data class HomeRow(
    val key: String,
    /** Short name on the wheel. */
    val label: String,
    /** Full name (logo description). */
    val title: String,
    val sub: String,
    val accent: Color?,
    val games: List<Game>,
    /** Its games need Couch Pro: the wheel stop shows a lock. */
    val locked: Boolean = false,
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
    free: Boolean,
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
    /** A dialog is on top. When it closes, focus goes back to the covers (not wherever it fell). */
    overlayOpen: Boolean = false,
    /** Games found in a folder the user just added, with when (a new value triggers the jump). */
    justAdded: Pair<Long, List<Game>>? = null,
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
    // Set when a cover gains focus, so the start-up focus request knows it has landed.
    val coverFocused = remember { mutableStateOf(false) }
    // After adding games: their console is opened, the first one focused, and a banner says so.
    var addedText by remember { mutableStateOf<String?>(null) }
    var addedIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var jump by remember { mutableStateOf(0) }

    // Remote vs game controller: a controller that pressed a button has joined as a TV player.
    val gamepad = view.players.any { it.local }
    val slotsOpen = view.players.size < maxPlayers

    Box(Modifier.fillMaxSize()) {
        Backdrop(game, onlineArt, accent)
        // Text and controls stay inside the TV overscan margins (SafeX / SafeY); the wheels and
        // the hint bar's background run to the edges.
        Column(Modifier.fillMaxSize()) {
            TopBar(onSettings = onSettings)
            Row(
                Modifier.weight(1f).fillMaxWidth().padding(start = SafeX, end = SafeX, top = 4.dp, bottom = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Preview(
                    game, onlineArt, accent, Modifier.weight(1f).fillMaxHeight(),
                    loading = serverLoad, needsStoragePermission = needsStoragePermission,
                )
                Details(
                    game = game,
                    favourite = game?.id in favourites,
                    gamepad = gamepad,
                    accent = accent,
                    modifier = Modifier.width(200.dp).fillMaxHeight(),
                )
                // The join panel gets the width: its QR code has to scan from the sofa.
                PlayersPanel(view, joinUrl, maxPlayers, accent, Modifier.width(350.dp).fillMaxHeight(), free)
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
                onFocus = { focusedId = it.id; coverFocused.value = true },
                onOpen = onOpen,
                onEmpty = if (needsStoragePermission) onGrantStorage else onRefresh,
                jump = jump,
                newIds = addedIds,
            )
            Hints(
                hiddenCount, needsStoragePermission, accent, view, server, serverLoad, onGrantStorage, onServer, onRefresh, onPlayers,
                gamepad = gamepad, slotsOpen = slotsOpen,
            )
        }
        addedText?.let { AddedBanner(it, accent, Modifier.align(Alignment.TopCenter).padding(top = 64.dp)) }
    }
    LaunchedEffect(justAdded?.first) {
        val fresh = justAdded?.second ?: return@LaunchedEffect
        val ids = fresh.mapTo(HashSet()) { it.id }
        // "All Games" is sorted by title, so this is the first new game in wheel order.
        val shown = rows.firstOrNull { it.key == "all" }?.games.orEmpty().filter { it.id in ids }
        val first = shown.firstOrNull()
        val what = if (fresh.size == 1) "\"${fresh[0].title}\"" else "${fresh.size} games"
        addedIds = ids
        addedText = if (first != null) {
            val oneSystem = shown.all { it.system == first.system }
            platformKey = if (oneSystem) first.system else "all"
            focusedId = first.id
            jump++
            "Added $what to ${if (oneSystem) app.couch.tv.library.Systems.byId(first.system)?.name ?: "your library" else "your library"}"
        } else {
            "Added $what, but ${if (fresh.size == 1) "its system is" else "their systems are"} hidden on this TV (see Settings)"
        }
        if (first != null) {
            // Let the wheel recompose on the new console first, so the request lands on the new cover.
            coverFocused.value = false
            for (i in 0 until 40) {
                kotlinx.coroutines.delay(50)
                runCatching { firstCard.requestFocus() }
                if (coverFocused.value && focusedId == first.id) break
            }
        }
        kotlinx.coroutines.delay(4500)
        addedText = null
        addedIds = emptySet()
    }
    LaunchedEffect(rows.isNotEmpty(), overlayOpen) {
        if (overlayOpen) return@LaunchedEffect
        // The cover row may not be laid out on the first frames; keep trying briefly so the
        // remote starts on the games, not on whatever took focus first (the Settings button).
        coverFocused.value = false
        repeat(40) {
            runCatching { firstCard.requestFocus() }
            kotlinx.coroutines.delay(50)
            if (coverFocused.value) return@LaunchedEffect
        }
    }
}
