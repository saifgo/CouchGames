package app.couch.tv.ui

import android.os.Build
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.EaseOut
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import app.couch.tv.ProRules
import app.couch.tv.R
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.BringIntoViewSpec
import androidx.compose.foundation.gestures.LocalBringIntoViewSpec
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.animation.core.snap
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.SportsEsports
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.material.icons.rounded.WifiOff
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Border
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.Glow
import androidx.tv.material3.Icon
import androidx.compose.ui.graphics.Shape
import androidx.tv.material3.IconButton
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import app.couch.tv.library.Game
import app.couch.tv.library.Systems
import app.couch.tv.net.PlayerView
import app.couch.tv.net.SessionView
import app.couch.tv.protocol.PLAYER_COLORS
import java.util.Date
import kotlinx.coroutines.delay

private val Line = Color.White.copy(alpha = .1f)
/** Button caps are neutral: the label says which button, colour is kept for state. */
private val BtnKey = Color(0xFF312A23)
private val PanelShape = RoundedCornerShape(10.dp)
/** Digits that don't jump around as they change (clock, counters). */
private val Tabular = TextStyle(fontFeatureSettings = "tnum")

/**
 * TV overscan safe area (Android TV guidance: 48 dp at the sides, 27 dp top and bottom).
 * Backgrounds may bleed into it; text and controls stay inside.
 */
val SafeX = 48.dp
val SafeY = 27.dp

/** 10-foot type: nothing a guest reads is smaller than this. */
private val Small = 14.sp
private val Body = 16.sp

/** Wheels keep the focused item in the middle, like the web host's centred scroll. */
@OptIn(ExperimentalFoundationApi::class)
private val CenterSpec = object : BringIntoViewSpec {
    override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float =
        offset - (containerSize - size) / 2f
}

// ---------- backdrop ----------

/** The background: near-black, lit from the top in the focused system's colour, with the game's snapshot faint behind. */
@Composable
fun Backdrop(game: Game?, onlineArt: Boolean, accent: Color) {
    Box(
        Modifier.fillMaxSize().drawBehind {
            drawRect(Bg)
            drawRect(
                Brush.radialGradient(
                    0f to accent.copy(alpha = .16f), 1f to Color.Transparent,
                    center = Offset(size.width / 2, 0f), radius = size.maxDimension * .7f,
                ),
            )
        },
    ) {
        val reduce = rememberReduceMotion()
        if (game != null && onlineArt && thumbnailUrl(game) != null) {
            androidx.compose.runtime.key(game.id) {
                val fade = remember { Animatable(if (reduce) 1f else 0f) }
                LaunchedEffect(Unit) { fade.animateTo(1f, tween(800)) }
                // blur() needs Android 12; older devices get a fainter, sharp image instead.
                val strength = if (Build.VERSION.SDK_INT >= 31) .2f else .1f
                Art(
                    game, onlineArt,
                    Modifier.fillMaxSize().graphicsLayer { alpha = fade.value * strength }.blur(28.dp),
                    kind = "Named_Snaps", shape = RectangleShape,
                )
            }
        }
    }
}

// ---------- top bar ----------

@Composable
private fun rememberClock(): String {
    val context = LocalContext.current
    val fmt = remember { android.text.format.DateFormat.getTimeFormat(context) }
    val now by produceState(fmt.format(Date())) {
        while (true) {
            value = fmt.format(Date())
            delay(5_000)
        }
    }
    return now
}

@Composable
fun TopBar(onSettings: () -> Unit) {
    val clock = rememberClock()
    // Logo, clock, settings. The console you're on shows in the platform wheel, players in the lobby.
    Row(
        Modifier.fillMaxWidth().padding(start = SafeX, end = SafeX - 8.dp, top = SafeY, bottom = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Logo()
        Spacer(Modifier.weight(1f))
        Text(clock, fontSize = Body, style = Tabular)
        IconButton(onClick = onSettings) { Icon(Icons.Default.Settings, contentDescription = "Settings") }
    }
}

// ---------- preview, details, players ----------

/** The big screen: the focused game's snapshot, fading in when the focus moves. */
@Composable
fun Preview(
    game: Game?,
    onlineArt: Boolean,
    accent: Color,
    modifier: Modifier,
    loading: app.couch.tv.library.LoadProgress? = null,
    needsStoragePermission: Boolean = false,
) {
    Box(modifier, contentAlignment = Alignment.Center) {
        val reduce = rememberReduceMotion()
        val shape = RoundedCornerShape(8.dp)
        Box(
            Modifier
                .aspectRatio(4f / 3f, matchHeightConstraintsFirst = true)
                .shadow(16.dp, shape)
                .border(1.dp, Color.White.copy(alpha = .14f), shape)
                .clip(shape)
                .background(Color.Black),
        ) {
            if (game != null) {
                androidx.compose.runtime.key(game.id) {
                    val fade = remember { Animatable(if (reduce) 1f else 0f) }
                    LaunchedEffect(Unit) { fade.animateTo(1f, tween(260, easing = EaseOut)) }
                    Art(
                        game, onlineArt, Modifier.fillMaxSize().graphicsLayer { alpha = fade.value },
                        kind = "Named_Snaps", shape = RectangleShape, pixelated = true,
                    )
                }
            } else {
                Column(
                    Modifier.fillMaxSize().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    if (loading != null && !loading.finished) {
                        Spinner(accent, 48.dp, 5.dp)
                        Text("Loading your library…", fontSize = 24.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                        Text(
                            "${loading.done} of ${loading.total} consoles" + if (loading.loading.isNotEmpty()) " · now ${loadingNames(loading.loading)}" else "",
                            fontSize = Small, color = Muted, textAlign = TextAlign.Center,
                        )
                    } else {
                        // The only setup text on the screen, so it lives in one place.
                        Text("No games yet", fontSize = 24.sp, fontWeight = FontWeight.Bold)
                        Text(
                            if (needsStoragePermission) "Put your own ROMs in roms/<system>/ folders (for example roms/snes/) on a USB drive. Then choose \"Add game folder\" at the bottom of the screen and pick the roms folder."
                            else "Copy your own ROMs into roms/<system>/ (for example roms/snes/) in your game folder. Then choose Refresh. More folders: Settings → Add game folder.",
                            fontSize = Small, lineHeight = 20.sp, color = Muted, textAlign = TextAlign.Center,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun InfoPanel(modifier: Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier
            .clip(PanelShape)
            .background(Panel.copy(alpha = .92f))
            .border(1.dp, Line, PanelShape)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        content = content,
    )
}

/** Game title in the details panel: the same heavy upright sans as the logo. */
@Composable
private fun PanelTitle(text: String, maxLines: Int = 3) {
    Text(
        text, fontSize = 24.sp, lineHeight = 28.sp, fontWeight = FontWeight.ExtraBold,
        maxLines = maxLines, overflow = TextOverflow.Ellipsis,
    )
}

/**
 * What a guest needs to pick a game: its name, its console, how many can play.
 * Maker, size and where the file lives are in the game's detail dialog.
 */
@Composable
fun Details(game: Game?, favourite: Boolean, gamepad: Boolean, accent: Color, modifier: Modifier) {
    val sys = game?.let { Systems.byId(it.system) }
    val reduce = rememberReduceMotion()
    InfoPanel(modifier) {
        if (game != null && sys != null) {
            androidx.compose.runtime.key(game.id) {
                val slide = remember { Animatable(if (reduce) 0f else 1f) }
                LaunchedEffect(Unit) { slide.animateTo(0f, tween(350)) }
                Column(
                    Modifier.weight(1f).graphicsLayer {
                        translationX = slide.value * 18.dp.toPx()
                        alpha = 1f - slide.value
                    },
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    PanelTitle(game.title)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            sys.name, fontSize = Body, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold,
                            color = lerp(accent, Color.White, .3f), maxLines = 2, overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        if (favourite) Icon(Icons.Rounded.Star, contentDescription = "Favourite", tint = Accent, modifier = Modifier.size(18.dp))
                    }
                    Text(if (sys.maxPlayers > 1) "1 to ${sys.maxPlayers} players" else "1 player", fontSize = Body, color = Muted)
                    Spacer(Modifier.weight(1f))
                    PressPlay(gamepad)
                }
            }
        } else {
            PanelTitle("Welcome")
            Text("Your phones are the controllers. Add a game to get started.", fontSize = Body, lineHeight = 22.sp, color = Muted)
        }
    }
}

@Composable
private fun PressPlay(gamepad: Boolean) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("Press", fontWeight = FontWeight.SemiBold, fontSize = Body)
        // A TV remote has OK, not A. A/B only once a game controller has joined.
        Kbd(if (gamepad) "A" else "OK", Accent, Color(0xFF1C1814))
        Text("to play", fontWeight = FontWeight.SemiBold, fontSize = Body)
    }
}

/** A button cap: a circle for one letter, a pill for "OK". */
@Composable
private fun Kbd(label: String, bg: Color = BtnKey, fg: Color = Color.White, size: Dp = 26.dp, fontSize: TextUnit = 13.sp) {
    Box(
        Modifier.height(size).widthIn(min = size).clip(RoundedCornerShape(50)).background(bg).padding(horizontal = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, fontWeight = FontWeight.ExtraBold, fontSize = fontSize, color = fg)
    }
}

@Composable
private fun KeyIcon(icon: ImageVector, bg: Color = BtnKey, size: Dp = 26.dp) {
    Box(Modifier.size(size).clip(CircleShape).background(bg), contentAlignment = Alignment.Center) {
        Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(size * .65f))
    }
}

@Composable
fun PlayersPanel(view: SessionView, joinUrl: String?, maxPlayers: Int, accent: Color, modifier: Modifier, free: Boolean = false) {
    InfoPanel(modifier) {
        Lobby(view, joinUrl, maxPlayers, accent, free)
    }
}

/**
 * Join panel. While slots are open the QR code takes all the height it can, so a phone can scan
 * it from the sofa. Once the room is full it shrinks and the players' names take over.
 */
@Composable
fun ColumnScope.Lobby(view: SessionView, joinUrl: String?, maxPlayers: Int, accent: Color, free: Boolean = false) {
    val qr = remember(joinUrl) { joinUrl?.let { qrBitmap(it) } }
    val full = view.players.size >= maxPlayers
    when {
        full && maxPlayers > 4 -> {
            // Eight players in: nobody else can join, so the room needs names, not a QR code.
            JoinHeader("Room full")
            RoomCode(view.room, 28.sp)
            Spacer(Modifier.weight(1f))
            SlotGrid(view, maxPlayers)
        }
        full -> {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                QrBox(qr, accent, Modifier.size(88.dp))
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    JoinHeader("Room full")
                    RoomCode(view.room, 28.sp)
                }
            }
            Spacer(Modifier.weight(1f))
            SlotGrid(view, maxPlayers)
            // Couch Free: the seats Pro adds, faded and locked.
            if (free && maxPlayers < ProRules.PRO_PLAYERS) {
                Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (slot in maxPlayers until ProRules.PRO_PLAYERS) LockedSlot(Modifier.weight(1f))
                }
            }
        }
        else -> {
            Row(Modifier.weight(1f).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                QrBox(qr, accent, Modifier.fillMaxHeight())
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    JoinHeader("Scan to join")
                    // No labels: the code and the address explain themselves.
                    Box(Modifier.padding(top = 2.dp)) { RoomCode(view.room, 36.sp) }
                    if (joinUrl != null) {
                        Text(
                            joinUrl.removePrefix("http://").substringBefore("?"),
                            fontSize = Small, fontWeight = FontWeight.SemiBold, lineHeight = 18.sp, maxLines = 2, overflow = TextOverflow.Ellipsis,
                        )
                    } else {
                        Text("No network. Connect this TV to Wi-Fi or Ethernet.", fontSize = Small, lineHeight = 18.sp, color = Bad, maxLines = 3)
                    }
                }
            }
            Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Top) {
                // Couch Free shows all 8 seats: its own, then the ones Pro adds, faded and locked.
                val seats = if (free) maxOf(maxPlayers, ProRules.PRO_PLAYERS) else maxPlayers
                val named = seats <= 4
                for (slot in 0 until maxPlayers) Slot(slot, view.players.firstOrNull { it.slot == slot }, named, Modifier.weight(1f))
                for (slot in maxPlayers until seats) LockedSlot(Modifier.weight(1f))
                if (named && seats < 4) Spacer(Modifier.weight((4 - seats).toFloat()))
            }
        }
    }
}

@Composable
private fun JoinHeader(text: String) {
    Text(text, fontSize = 18.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
}

@Composable
private fun RoomCode(room: String, size: TextUnit) {
    Text(
        room.ifEmpty { "····" }, fontWeight = FontWeight.Black, fontSize = size,
        letterSpacing = .08.em, color = Accent, maxLines = 1,
    )
}

@Composable
private fun QrBox(qr: androidx.compose.ui.graphics.ImageBitmap?, accent: Color, modifier: Modifier) {
    val shape = RoundedCornerShape(6.dp)
    Box(
        modifier.aspectRatio(1f, matchHeightConstraintsFirst = true)
            .clip(shape).background(Color.White).padding(4.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (qr != null) Image(qr, contentDescription = "QR code to join", Modifier.fillMaxSize())
        else Icon(Icons.Rounded.WifiOff, contentDescription = "No network", tint = Color(0xFF555555), modifier = Modifier.size(32.dp))
    }
}

/** A seat Couch Pro adds: a faded circle with a lock. */
@Composable
private fun LockedSlot(modifier: Modifier) {
    Box(modifier, contentAlignment = Alignment.TopCenter) {
        Box(
            Modifier.size(28.dp).graphicsLayer { alpha = .35f }.clip(CircleShape).background(Color.White.copy(alpha = .12f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Rounded.Lock, contentDescription = "Locked: CouchPad Pro", tint = Color.White, modifier = Modifier.size(14.dp))
        }
    }
}

@Composable
private fun SlotAvatar(slot: Int, p: PlayerView?, size: Dp) {
    val c = hexColor(p?.color ?: PLAYER_COLORS[slot % PLAYER_COLORS.size])
    if (p != null) {
        Box(Modifier.size(size).clip(CircleShape).background(c), contentAlignment = Alignment.Center) {
            DeviceIcon(p, size * .6f)
        }
    } else {
        Box(
            Modifier.size(size).drawBehind {
                drawCircle(c.copy(alpha = .7f), style = Stroke(1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 4f))))
            },
            contentAlignment = Alignment.Center,
        ) { Text("${slot + 1}", fontWeight = FontWeight.Black, fontSize = Small, color = c) }
    }
}

/** One open or taken seat while the room is filling: avatar, connection dot, name. */
@Composable
private fun Slot(slot: Int, p: PlayerView?, named: Boolean, modifier: Modifier) {
    val reduce = rememberReduceMotion()
    val pop = remember(p != null) { Animatable(if (p != null && !reduce) .6f else 1f) }
    LaunchedEffect(p != null) { pop.animateTo(1f, spring(dampingRatio = .45f, stiffness = 500f)) }
    Column(
        modifier.graphicsLayer {
            scaleX = pop.value
            scaleY = pop.value
            alpha = if (p != null && !p.connected) .55f else 1f
        },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Box {
            SlotAvatar(slot, p, 28.dp)
            if (p != null) Box(Modifier.align(Alignment.TopEnd).size(8.dp).clip(CircleShape).background(quality(p)))
        }
        if (named) {
            Text(
                p?.name ?: "", fontSize = Small, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                color = if (p?.connected == true) Color.White else Muted,
            )
        }
    }
}

/** The full room: two columns of name chips. */
@Composable
private fun SlotGrid(view: SessionView, maxPlayers: Int) {
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        for (start in 0 until maxPlayers step 2) {
            Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                for (slot in start until start + 2) {
                    if (slot < maxPlayers) SlotChip(slot, view.players.firstOrNull { it.slot == slot }, Modifier.weight(1f))
                    else Spacer(Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun SlotChip(slot: Int, p: PlayerView?, modifier: Modifier) {
    Row(
        modifier.graphicsLayer { alpha = if (p != null && !p.connected) .55f else 1f }
            .clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = .06f))
            .padding(start = 3.dp, end = 10.dp, top = 3.dp, bottom = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        SlotAvatar(slot, p, 26.dp)
        Text(
            p?.name ?: "P${slot + 1}", fontSize = Small, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
            color = if (p?.connected == true) Color.White else Muted, modifier = Modifier.weight(1f),
        )
        if (p != null) Box(Modifier.size(8.dp).clip(CircleShape).background(quality(p)))
    }
}

// ---------- platform wheel ----------

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun PlatformWheel(rows: List<HomeRow>, activeKey: String?, accent: Color, onPick: (String) -> Unit) {
    if (rows.isEmpty()) return
    BoxWithConstraints(
        Modifier.fillMaxWidth()
            .background(Bg.copy(alpha = .78f))
            .drawBehind {
                val w = 1.dp.toPx()
                drawLine(Line, Offset(0f, 0f), Offset(size.width, 0f), w)
                drawLine(Line, Offset(0f, size.height), Offset(size.width, size.height), w)
            },
    ) {
        val itemW = 132.dp
        val side = ((maxWidth - itemW) / 2).coerceAtLeast(0.dp)
        val state = remember { LazyListState(rows.indexOfFirst { it.key == activeKey }.coerceAtLeast(0)) }
        CompositionLocalProvider(LocalBringIntoViewSpec provides CenterSpec) {
            LazyRow(
                state = state,
                contentPadding = PaddingValues(horizontal = side, vertical = 3.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                itemsIndexed(rows, key = { _, r -> r.key }) { _, r ->
                    PlatformItem(r, r.key == activeKey, Modifier.width(itemW)) { onPick(r.key) }
                }
            }
        }
    }
}

@Composable
private fun PlatformItem(r: HomeRow, active: Boolean, modifier: Modifier, onPick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val c = r.accent ?: Color.White
    Surface(
        onClick = onPick,
        modifier = modifier.onFocusChanged {
            focused = it.isFocused
            if (it.isFocused) onPick()
        },
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(6.dp)),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = Color.Transparent, contentColor = Color.White,
            focusedContainerColor = Color.Transparent, focusedContentColor = Color.White,
            pressedContainerColor = Color.Transparent, pressedContentColor = Color.White,
        ),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.12f),
    ) {
        Column(
            Modifier.fillMaxWidth().padding(vertical = 4.dp).graphicsLayer { alpha = if (focused) 1f else if (active) .85f else .4f },
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            val logo = systemLogo(r.key)
            Box {
                if (logo != null) {
                    Image(
                        painterResource(logo),
                        contentDescription = r.title,
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.size(width = 118.dp, height = 30.dp),
                    )
                } else {
                    Text(r.label, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = c, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (r.locked) {
                    Icon(
                        Icons.Rounded.Lock, contentDescription = "Needs CouchPad Pro", tint = Accent,
                        modifier = Modifier.align(Alignment.TopEnd).offset(x = 6.dp, y = (-4).dp).size(14.dp),
                    )
                }
            }
            // The selected stop gets a short bar in its colour: where you are, without a glow.
            Box(
                Modifier.padding(top = 4.dp).width(28.dp).height(3.dp).clip(RoundedCornerShape(50))
                    .background(if (active) c else Color.Transparent),
            )
        }
    }
}

/** Logo for a system's wheel stop (scripts/build-logos.mjs), or null for All / Recent / Favourites. */
@DrawableRes
fun systemLogo(id: String): Int? = when (id) {
    "nes" -> R.drawable.logo_nes
    "snes" -> R.drawable.logo_snes
    "genesis" -> R.drawable.logo_genesis
    "gb" -> R.drawable.logo_gb
    "gbc" -> R.drawable.logo_gbc
    "gba" -> R.drawable.logo_gba
    "psx" -> R.drawable.logo_psx
    "n64" -> R.drawable.logo_n64
    "psp" -> R.drawable.logo_psp
    "nds" -> R.drawable.logo_nds
    "ps2" -> R.drawable.logo_ps2
    "atari2600" -> R.drawable.logo_atari2600
    else -> null
}

/** The console's default Couch cover (packages/systems/scripts/build-covers.ts), or null for an unknown system. */
@DrawableRes
fun systemCover(id: String): Int? = when (id) {
    "nes" -> R.drawable.cover_nes
    "snes" -> R.drawable.cover_snes
    "genesis" -> R.drawable.cover_genesis
    "gb" -> R.drawable.cover_gb
    "gbc" -> R.drawable.cover_gbc
    "gba" -> R.drawable.cover_gba
    "psx" -> R.drawable.cover_psx
    "n64" -> R.drawable.cover_n64
    "psp" -> R.drawable.cover_psp
    "nds" -> R.drawable.cover_nds
    "ps2" -> R.drawable.cover_ps2
    "atari2600" -> R.drawable.cover_atari2600
    "pce" -> R.drawable.cover_pce
    else -> null
}

// ---------- cover wheel ----------

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun CoverWheel(
    key: String,
    games: List<Game>,
    current: Game?,
    onlineArt: Boolean,
    accent: Color,
    firstCard: FocusRequester,
    needsStoragePermission: Boolean,
    onFocus: (Game) -> Unit,
    onOpen: (Game) -> Unit,
    onEmpty: () -> Unit,
    /** Bumped to re-centre the wheel on [current] (after games were added). */
    jump: Int = 0,
    /** Just-added games: they get a "New" badge and a pulsing frame. */
    newIds: Set<String> = emptySet(),
) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        // Smaller covers leave the height to the lobby's QR code. The focused game's title is
        // shown large in the details panel instead of at caption size under every cover.
        val cardW = 72.dp
        val side = ((maxWidth - cardW) / 2).coerceAtLeast(0.dp)
        val state = remember(key, jump) { LazyListState(games.indexOf(current).coerceAtLeast(0)) }
        CompositionLocalProvider(LocalBringIntoViewSpec provides CenterSpec) {
            LazyRow(
                state = state,
                contentPadding = PaddingValues(start = side, end = side, top = 26.dp, bottom = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(18.dp),
                verticalAlignment = Alignment.Bottom,
            ) {
                if (games.isEmpty()) {
                    item(key = "empty") {
                        EmptyCard(if (needsStoragePermission) "Add game folder" else "Refresh", cardW, Modifier.focusRequester(firstCard), onEmpty)
                    }
                }
                itemsIndexed(games, key = { _, g -> g.id }) { _, g ->
                    val isCurrent = g == current
                    CoverCard(
                        g, isCurrent, onlineArt, accent, cardW,
                        if (isCurrent) Modifier.focusRequester(firstCard) else Modifier,
                        onFocus, onOpen,
                        isNew = g.id in newIds,
                    )
                }
            }
        }
    }
}

@Composable
private fun CoverCard(
    g: Game,
    current: Boolean,
    onlineArt: Boolean,
    accent: Color,
    width: Dp,
    modifier: Modifier,
    onFocus: (Game) -> Unit,
    onOpen: (Game) -> Unit,
    isNew: Boolean = false,
) {
    var focused by remember { mutableStateOf(false) }
    val c = Systems.byId(g.system)?.accent?.let(::hexColor) ?: accent
    // Grow from the bottom edge, like the web host (Card's own scale grows from the centre).
    val reduce = rememberReduceMotion()
    val scale by animateFloatAsState(
        if (focused) 1.28f else 1f,
        if (reduce) snap() else spring(dampingRatio = .55f, stiffness = 500f),
        label = "scale",
    )
    val shape = RoundedCornerShape(4.dp)
    Column(Modifier.width(width), horizontalAlignment = Alignment.CenterHorizontally) {
        Card(
            onClick = { onOpen(g) },
            modifier = modifier
                .width(width)
                .aspectRatio(3f / 4f)
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                    translationY = -(scale - 1f) * 12.dp.toPx()
                    transformOrigin = TransformOrigin(.5f, 1f)
                }
                .onFocusChanged {
                    focused = it.isFocused
                    if (it.isFocused) onFocus(g)
                },
            shape = CardDefaults.shape(shape),
            colors = CardDefaults.colors(containerColor = Color(0xFF26211B)),
            scale = CardDefaults.scale(focusedScale = 1f),
            border = CardDefaults.border(focusedBorder = Border(BorderStroke(3.dp, Accent), shape = shape)),
            glow = CardDefaults.glow(focusedGlow = Glow.None),
        ) {
            Box(Modifier.fillMaxSize()) {
                Art(g, onlineArt, Modifier.fillMaxSize(), shape = shape)
                if (!focused && !current) Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .4f)))
                if (isNew) NewMark(c, shape)
            }
        }
    }
}

/** Pulsing frame and "New" badge on a just-added cover. */
@Composable
private fun NewMark(color: Color, shape: Shape) {
    val reduce = rememberReduceMotion()
    val pulse by rememberInfiniteTransition(label = "new").animateFloat(
        initialValue = 1f,
        targetValue = if (reduce) 1f else .25f,
        animationSpec = infiniteRepeatable(tween(550), RepeatMode.Reverse),
        label = "newPulse",
    )
    Box(Modifier.fillMaxSize().border(3.dp, color.copy(alpha = pulse), shape))
    Text(
        "NEW",
        color = Color.Black,
        fontSize = 8.sp,
        fontWeight = FontWeight.ExtraBold,
        modifier = Modifier
            .padding(3.dp)
            .background(color, RoundedCornerShape(50))
            .padding(horizontal = 5.dp, vertical = 1.dp),
    )
}

/** Short "Added …" banner shown at the top of the home screen after adding games. */
@Composable
fun AddedBanner(text: String, accent: Color, modifier: Modifier = Modifier) {
    Row(
        modifier
            .background(Color(0xE61C1814), RoundedCornerShape(50))
            .border(2.dp, accent, RoundedCornerShape(50))
            .padding(horizontal = 18.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(Icons.Rounded.Check, contentDescription = null, tint = accent, modifier = Modifier.size(18.dp))
        Text(text, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

@Composable
private fun EmptyCard(label: String, width: Dp, modifier: Modifier, onClick: () -> Unit) {
    Column(Modifier.width(width), horizontalAlignment = Alignment.CenterHorizontally) {
        Surface(
            onClick = onClick,
            modifier = modifier.width(width).aspectRatio(3f / 4f),
            shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(6.dp)),
            colors = ClickableSurfaceDefaults.colors(
                containerColor = Color.Transparent, contentColor = Color.White,
                focusedContainerColor = Color.White.copy(alpha = .12f), focusedContentColor = Color.White,
            ),
            scale = ClickableSurfaceDefaults.scale(focusedScale = 1.12f),
        ) {
            Box(
                Modifier.fillMaxSize().drawBehind {
                    drawRoundRect(
                        Color.White.copy(alpha = .3f),
                        cornerRadius = androidx.compose.ui.geometry.CornerRadius(6.dp.toPx()),
                        style = Stroke(2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 8f))),
                    )
                },
                contentAlignment = Alignment.Center,
            ) {
                Column(Modifier.padding(4.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(30.dp))
                    Text(label, fontSize = Small, lineHeight = 17.sp, textAlign = TextAlign.Center, maxLines = 3)
                }
            }
        }
    }
}

// ---------- hint bar ----------

@Composable
fun Hints(
    hiddenCount: Int,
    needsStoragePermission: Boolean,
    accent: Color,
    view: SessionView,
    server: app.couch.tv.library.ServerState?,
    serverLoad: app.couch.tv.library.LoadProgress?,
    onGrantStorage: () -> Unit,
    onServer: () -> Unit,
    onRefresh: () -> Unit,
    onPlayers: () -> Unit,
    gamepad: Boolean = false,
    slotsOpen: Boolean = true,
) {
    Row(
        Modifier.fillMaxWidth()
            .background(Bg.copy(alpha = .85f))
            .drawBehind { drawLine(Line, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }
            // The bar's background runs to the screen edge; its content stays inside the overscan margin.
            .padding(start = SafeX, end = SafeX, top = 6.dp, bottom = SafeY),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        // A TV remote has OK and Back; show A/B only once a game controller is in the room.
        if (gamepad) {
            Hint({ Kbd("A") }, "Select")
            Hint({ Kbd("B") }, "Back")
        } else {
            Hint({ Kbd("OK") }, "Select")
            Hint({ KeyIcon(Icons.AutoMirrored.Rounded.ArrowBack) }, "Back")
        }
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(18.dp), verticalAlignment = Alignment.CenterVertically) {
            if (slotsOpen) {
                Hint({ KeyIcon(Icons.Rounded.SportsEsports) }, "Controller? Press any button to join", Modifier.weight(1f, fill = false))
            }
            if (hiddenCount > 0) {
                Text(
                    "$hiddenCount game${if (hiddenCount > 1) "s" else ""} hidden: this device is too slow for their system (Settings).",
                    fontSize = Small, color = Muted, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false),
                )
            }
        }
        val away = view.players.count { !it.connected }
        if (view.players.isNotEmpty()) Pill(if (away > 0) "Players · $away away" else "Players", if (away > 0) Bad else accent, onPlayers)
        if (server != null && serverLoad == null) Pill(server.label, accent, onServer, dot = if (server.healthy) Good else Bad)
        if (needsStoragePermission) Pill("Add game folder", accent, onGrantStorage)
        when {
            serverLoad == null -> Pill("Refresh" + (server?.savedAt?.let { " · ${age(it)}" } ?: ""), accent, onRefresh, icon = Icons.Rounded.Refresh)
            // A failed load says which consoles, and pressing it tries again.
            serverLoad.finished && serverLoad.failed.isNotEmpty() ->
                Pill("${loadingNames(serverLoad.failed)} did not load · Retry", Bad, onRefresh, icon = Icons.Rounded.Warning)
            else -> LoadingPill(serverLoad, accent)
        }
    }
}

/** "Loading N64, SNES… 4/13" with a spinner and a bar while the server's consoles load. */
@Composable
private fun LoadingPill(p: app.couch.tv.library.LoadProgress, accent: Color) {
    val fraction by animateFloatAsState(p.done.toFloat() / p.total.coerceAtLeast(1), tween(300), label = "load")
    val label = if (!p.finished) "Loading ${loadingNames(p.loading).ifEmpty { "library" }}… ${p.done}/${p.total}" else "Library up to date"
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = .06f))
            .border(1.dp, Color.White.copy(alpha = .18f), RoundedCornerShape(50))
            .padding(horizontal = 14.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (!p.finished) Spinner(accent, 14.dp, 2.dp) else Icon(Icons.Rounded.Check, contentDescription = null, tint = Good, modifier = Modifier.size(16.dp))
        Text(label, fontSize = Small, maxLines = 1)
        Box(Modifier.width(70.dp).height(4.dp).clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = .15f))) {
            Box(Modifier.fillMaxHeight().fillMaxWidth(fraction).background(if (p.finished && p.failed.isEmpty()) Good else accent))
        }
    }
}

/** A turning arc: something is happening, not stuck. */
@Composable
fun Spinner(color: Color, size: androidx.compose.ui.unit.Dp, stroke: androidx.compose.ui.unit.Dp) {
    val angle by rememberInfiniteTransition(label = "spin").animateFloat(
        0f, 360f, infiniteRepeatable(tween(900, easing = LinearEasing), RepeatMode.Restart), label = "angle",
    )
    Canvas(Modifier.size(size)) {
        val w = stroke.toPx()
        drawArc(Color.White.copy(alpha = .2f), 0f, 360f, false, style = androidx.compose.ui.graphics.drawscope.Stroke(w))
        drawArc(color, angle, 100f, false, style = androidx.compose.ui.graphics.drawscope.Stroke(w, cap = androidx.compose.ui.graphics.StrokeCap.Round))
    }
}

private fun loadingNames(ids: List<String>) =
    ids.joinToString(", ") { app.couch.tv.library.Systems.byId(it)?.shortName ?: it }

private fun age(at: Long): String {
    val m = (System.currentTimeMillis() - at) / 60_000
    return when {
        m < 1 -> "now"
        m < 60 -> "$m min"
        m < 60 * 24 -> "${m / 60} h"
        else -> "${m / 60 / 24} d"
    }
}

@Composable
private fun Hint(key: @Composable () -> Unit, label: String, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        key()
        Text(label, fontSize = Small, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun Pill(label: String, accent: Color, onClick: () -> Unit, dot: Color? = null, icon: ImageVector? = null) {
    val shape = RoundedCornerShape(50)
    Surface(
        onClick = onClick,
        shape = ClickableSurfaceDefaults.shape(shape),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = Color.White.copy(alpha = .06f), contentColor = Color.White,
            focusedContainerColor = Color.White, focusedContentColor = Color(0xFF1C1814),
        ),
        border = ClickableSurfaceDefaults.border(
            border = Border(BorderStroke(1.dp, Color.White.copy(alpha = .18f)), shape = shape),
            focusedBorder = Border(BorderStroke(1.dp, Color.White), shape = shape),
        ),
    ) {
        Row(
            Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            // A status dot (server health) or an icon, then the label.
            if (dot != null) Box(Modifier.size(9.dp).clip(CircleShape).background(dot))
            if (icon != null) Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp))
            Text(label, fontSize = Small, maxLines = 1)
        }
    }
}
