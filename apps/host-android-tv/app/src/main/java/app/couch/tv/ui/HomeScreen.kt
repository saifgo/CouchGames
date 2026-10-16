package app.couch.tv.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.Text
import app.couch.tv.library.Game
import app.couch.tv.library.Systems
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
)

/** libretro-thumbnails URL by No-Intro file name (same rule as the web host). */
fun thumbnailUrl(g: Game, kind: String = "Named_Boxarts"): String? {
    val dir = THUMB_DIRS[g.system] ?: return null
    val name = g.file.nameWithoutExtension.replace(Regex("[&*/:`<>?\\\\|]"), "_")
    return "https://thumbnails.libretro.com/${android.net.Uri.encode(dir)}/$kind/${android.net.Uri.encode(name)}.png"
}

@Composable
fun Art(game: Game, online: Boolean, modifier: Modifier = Modifier, kind: String = "Named_Boxarts") {
    val url = if (online) thumbnailUrl(game, kind) else null
    if (url == null) {
        GeneratedArt(game, modifier)
        return
    }
    SubcomposeAsyncImage(
        model = url,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = modifier.clip(RoundedCornerShape(14.dp)),
        loading = { GeneratedArt(game, Modifier.fillMaxSize()) },
        error = { GeneratedArt(game, Modifier.fillMaxSize()) },
    )
}

data class HomeRow(val key: String, val title: String, val accent: Color?, val games: List<Game>)

@Composable
fun HomeScreen(
    rows: List<HomeRow>,
    hiddenCount: Int,
    view: SessionView,
    joinUrl: String?,
    maxPlayers: Int,
    onlineArt: Boolean,
    needsStoragePermission: Boolean,
    onGrantStorage: () -> Unit,
    onOpen: (Game) -> Unit,
    onSettings: () -> Unit,
    onRefresh: () -> Unit,
) {
    var focused by remember { mutableStateOf<Game?>(null) }
    val hero = focused ?: rows.firstOrNull()?.games?.firstOrNull()
    val first = remember { FocusRequester() }

    Box(Modifier.fillMaxSize().background(Bg)) {
        Row(Modifier.fillMaxSize()) {
            LazyColumn(
                Modifier.weight(1f).fillMaxHeight(),
                contentPadding = PaddingValues(start = 48.dp, top = 28.dp, bottom = 48.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                item {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        Text("▲● Couch", fontSize = 26.sp, fontWeight = FontWeight.ExtraBold, color = Accent)
                        view.players.forEach { PlayerChip(it) }
                        Spacer(Modifier.weight(1f))
                        if (needsStoragePermission && rows.isNotEmpty()) Button(onClick = onGrantStorage) { Text("Allow USB folders", maxLines = 1) }
                        Button(onClick = onRefresh) { Text("⟳ Refresh", maxLines = 1) }
                        Button(onClick = onSettings, modifier = Modifier.padding(end = 24.dp)) { Text("⚙", maxLines = 1) }
                    }
                }
                if (needsStoragePermission && rows.isEmpty()) {
                    item {
                        Column(Modifier.clip(RoundedCornerShape(16.dp)).background(Panel).padding(20.dp)) {
                            Text("Allow access to your ROM folders", fontSize = 22.sp, fontWeight = FontWeight.Bold)
                            Text("Couch looks for games in roms/<system>/ on USB drives and in Documents or Download.", color = Muted)
                            Button(onClick = onGrantStorage, modifier = Modifier.padding(top = 12.dp)) { Text("Allow") }
                        }
                    }
                }
                if (hero != null) {
                    item {
                        Row(Modifier.height(260.dp), horizontalArrangement = Arrangement.spacedBy(28.dp), verticalAlignment = Alignment.CenterVertically) {
                            Art(hero, onlineArt, Modifier.width(190.dp).aspectRatio(3f / 4f))
                            Column {
                                val sys = Systems.byId(hero.system)
                                Text(sys?.name?.uppercase() ?: "", color = hexColor(sys?.accent ?: "#ffffff"), fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                Text(hero.title, fontSize = 40.sp, fontWeight = FontWeight.ExtraBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                Text("Up to ${sys?.maxPlayers ?: 1} players · ${hero.file.name}", color = Muted)
                                Button(onClick = { onOpen(hero) }, modifier = Modifier.padding(top = 14.dp).focusRequester(first)) {
                                    Text("▶  Play", fontSize = 20.sp)
                                }
                            }
                        }
                    }
                }
                for (row in rows) {
                    item(key = row.key) {
                        Column {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                if (row.accent != null) Box(Modifier.size(6.dp, 20.dp).clip(RoundedCornerShape(3.dp)).background(row.accent))
                                Text("  ${row.title}  ", fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                                Text("${row.games.size}", color = Muted)
                            }
                            LazyRow(contentPadding = PaddingValues(vertical = 12.dp, horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                                items(row.games, key = { row.key + it.id }) { g ->
                                    Card(
                                        onClick = { onOpen(g) },
                                        modifier = Modifier.width(150.dp).aspectRatio(3f / 4f).onFocusChanged { if (it.isFocused) focused = g },
                                        scale = CardDefaults.scale(focusedScale = 1.08f),
                                    ) { Art(g, onlineArt, Modifier.fillMaxSize()) }
                                }
                            }
                        }
                    }
                }
                if (rows.isEmpty()) {
                    item {
                        Column(Modifier.padding(top = 40.dp)) {
                            Text("No games yet", fontSize = 36.sp, fontWeight = FontWeight.Bold)
                            Text(
                                "Copy your own ROMs into roms/<system>/ (for example roms/snes/) on a USB drive, or in Documents or Download on this device. Then choose Refresh.",
                                color = Muted,
                                fontSize = 18.sp,
                            )
                        }
                    }
                }
                if (hiddenCount > 0) {
                    item { Text("$hiddenCount game(s) hidden: this device is too slow for their system (change in Settings).", color = Muted) }
                }
            }
            Lobby(view, joinUrl, maxPlayers, compact = view.players.isNotEmpty())
        }
    }
    LaunchedEffect(hero != null) { if (hero != null) runCatching { first.requestFocus() } }
}

@Composable
fun Lobby(view: SessionView, joinUrl: String?, maxPlayers: Int, compact: Boolean) {
    val qr = remember(joinUrl) { joinUrl?.let { qrBitmap(it) } }
    Column(
        Modifier.padding(24.dp).width(if (compact) 260.dp else 320.dp).clip(RoundedCornerShape(22.dp))
            .background(Brush.verticalGradient(listOf(Panel, Panel.copy(alpha = .85f)))).padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (qr != null) Image(qr, contentDescription = "QR code to join", Modifier.size(if (compact) 150.dp else 210.dp).clip(RoundedCornerShape(12.dp)))
        Text("Scan with your phone, or open", color = Muted, fontSize = 13.sp)
        Text(joinUrl?.removePrefix("http://")?.substringBefore("?") ?: "no network", fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
        Text("and enter", color = Muted, fontSize = 13.sp)
        Text(view.room.toCharArray().joinToString(" "), color = Accent, fontWeight = FontWeight.Black, fontSize = if (compact) 34.sp else 46.sp)
        for (slot in 0 until maxPlayers) {
            val p = view.players.firstOrNull { it.slot == slot }
            if (p != null) PlayerChip(p, detailed = !compact)
            else Text("P${slot + 1}  open slot", color = Muted.copy(alpha = .6f), modifier = Modifier.fillMaxWidth().padding(start = 12.dp))
        }
    }
}
