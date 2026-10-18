package app.couch.tv.ui

import android.os.Build
import android.os.Environment
import androidx.compose.animation.core.Animatable
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
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

private val Mono = FontFamily.Monospace
private val Script = FontFamily.Cursive
private val Line = Color.White.copy(alpha = .1f)
private val BtnA = Color(0xFF2FA84F)
private val BtnB = Color(0xFFD23A3A)
private val PanelShape = RoundedCornerShape(10.dp)

/** Wheels keep the focused item in the middle, like the web host's centred scroll. */
@OptIn(ExperimentalFoundationApi::class)
private val CenterSpec = object : BringIntoViewSpec {
    override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float =
        offset - (containerSize - size) / 2f
}

private fun glow(c: Color, alpha: Float = .6f, blur: Float = 22f) = TextStyle(shadow = Shadow(c.copy(alpha = alpha), Offset.Zero, blur))

/** 2-px dark lines every 4 px, like a CRT. */
private fun DrawScope.scanlines(alpha: Float) = drawRect(
    Brush.verticalGradient(
        0f to Color.Black.copy(alpha = alpha), .5f to Color.Black.copy(alpha = alpha),
        .5f to Color.Transparent, 1f to Color.Transparent,
        startY = 0f, endY = 4f, tileMode = TileMode.Repeated,
    ),
)

// ---------- backdrop ----------

@Composable
fun Backdrop(game: Game?, onlineArt: Boolean, accent: Color) {
    Box(
        Modifier.fillMaxSize().drawBehind {
            drawRect(
                Brush.radialGradient(
                    0f to lerp(Color(0xFF1A0B33), accent, .22f), .55f to Color(0xFF0B0618), 1f to Color(0xFF05030B),
                    center = Offset(size.width / 2, 0f), radius = size.maxDimension,
                ),
            )
        },
    ) {
        if (game != null && onlineArt && thumbnailUrl(game) != null) {
            androidx.compose.runtime.key(game.id) {
                val fade = remember { Animatable(0f) }
                LaunchedEffect(Unit) { fade.animateTo(1f, tween(800)) }
                // blur() needs Android 12; older devices get a fainter, sharp image instead.
                val strength = if (Build.VERSION.SDK_INT >= 31) .35f else .14f
                Art(
                    game, onlineArt,
                    Modifier.fillMaxSize().graphicsLayer { alpha = fade.value * strength }.blur(28.dp),
                    kind = "Named_Snaps", shape = RectangleShape,
                )
            }
        }
        PerspectiveGrid(accent)
        Box(Modifier.fillMaxSize().drawBehind { scanlines(.12f) })
    }
}

/** The synthwave floor: a perspective grid that runs toward the viewer. */
@Composable
private fun PerspectiveGrid(accent: Color) {
    val t = rememberInfiniteTransition(label = "grid")
    val phase by t.animateFloat(0f, 1f, infiniteRepeatable(tween(3000, easing = LinearEasing)), label = "phase")
    val line = lerp(accent, Color(0xFFFF2FD0), .45f)
    // Own layer, so the animation only redraws the grid.
    Canvas(Modifier.fillMaxSize().graphicsLayer()) {
        val top = size.height * .52f
        val h = size.height - top
        val cx = size.width / 2
        val stroke = 1.5.dp.toPx()
        val n = 9
        for (i in 0 until n) {
            val p = (i + phase) / n
            val y = top + h * p * p
            drawLine(line.copy(alpha = .24f * p), Offset(0f, y), Offset(size.width, y), stroke)
        }
        val fade = Brush.verticalGradient(listOf(Color.Transparent, line.copy(alpha = .24f)), top, size.height)
        for (k in -14..14) {
            val xb = cx + k * size.width / 9f
            val xt = cx + k * size.width / 9f * .18f
            drawLine(fade, Offset(xt, top), Offset(xb, size.height), stroke)
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
fun TopBar(title: String, position: String, view: SessionView, accent: Color, onSettings: () -> Unit) {
    val clock = rememberClock()
    Row(
        Modifier.fillMaxWidth().padding(start = 28.dp, end = 20.dp, top = 8.dp, bottom = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("▲● ", color = Accent, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
            Text("Couch", fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
        }
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.Bottom) {
            Text(
                title, fontSize = 22.sp, fontWeight = FontWeight.Light, letterSpacing = .04.em,
                maxLines = 1, overflow = TextOverflow.Ellipsis, style = glow(accent),
                modifier = Modifier.weight(1f, fill = false),
            )
            Text("  $position", fontSize = 11.sp, fontFamily = Mono, color = Muted, modifier = Modifier.padding(bottom = 4.dp))
        }
        view.players.forEach { MiniChip(it) }
        Text(clock, fontSize = 15.sp, fontFamily = Mono)
        IconButton(onClick = onSettings) { Icon(Icons.Default.Settings, contentDescription = "Settings") }
    }
}

@Composable
private fun MiniChip(p: PlayerView) {
    val c = hexColor(p.color)
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(Color(0x990A0614)).padding(start = 3.dp, end = 9.dp, top = 3.dp, bottom = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(Modifier.size(20.dp).shadow(6.dp, CircleShape, ambientColor = c, spotColor = c).clip(CircleShape).background(c), contentAlignment = Alignment.Center) {
            Text(p.name.take(1).uppercase(), fontWeight = FontWeight.Black, fontSize = 11.sp, color = Color.White)
        }
        Text(p.name, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, color = if (p.connected) Color.White else Muted)
        Box(Modifier.size(7.dp).clip(CircleShape).background(quality(p)))
    }
}

// ---------- preview, details, players ----------

/** The big "screen": the game's snapshot in a glowing CRT frame. Switches on like an old TV. */
@Composable
fun Preview(game: Game?, onlineArt: Boolean, accent: Color, modifier: Modifier, loading: app.couch.tv.library.LoadProgress? = null) {
    Box(modifier, contentAlignment = Alignment.Center) {
        val on = remember(game?.id) { Animatable(0.04f) }
        LaunchedEffect(game?.id) { on.animateTo(1f, spring(dampingRatio = .65f, stiffness = 420f)) }
        val shape = RoundedCornerShape(6.dp)
        Box(
            Modifier
                .aspectRatio(4f / 3f, matchHeightConstraintsFirst = true)
                .graphicsLayer {
                    scaleY = on.value
                    scaleX = .9f + .1f * on.value
                    alpha = on.value.coerceIn(0f, 1f)
                }
                .shadow(26.dp, shape, ambientColor = accent, spotColor = accent)
                .border(2.dp, lerp(accent, Color.White, .3f), shape)
                .clip(shape)
                .background(Color.Black),
        ) {
            if (game != null) {
                Art(game, onlineArt, Modifier.fillMaxSize(), kind = "Named_Snaps", shape = RectangleShape, pixelated = true)
            } else {
                Column(
                    Modifier.fillMaxSize().padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterVertically),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    if (loading != null && !loading.finished) {
                        Spinner(accent, 54.dp, 5.dp)
                        Text("Loading your library…", fontSize = 26.sp, fontWeight = FontWeight.Bold)
                        Text(
                            "${loading.done} of ${loading.total} consoles" + if (loading.loading.isNotEmpty()) " · now ${loadingNames(loading)}" else "",
                            color = Muted, textAlign = TextAlign.Center,
                        )
                    } else {
                        Text("No games yet", fontSize = 30.sp, fontWeight = FontWeight.Bold)
                        Text("Your phones are the controllers. Add a game to get started.", color = Muted, textAlign = TextAlign.Center)
                    }
                }
            }
            Box(
                Modifier.fillMaxSize().drawBehind {
                    scanlines(.22f)
                    drawRect(Brush.radialGradient(.55f to Color.Transparent, 1f to Color.Black.copy(alpha = .55f), center = center, radius = size.maxDimension * .62f))
                },
            )
        }
    }
}

@Composable
private fun GlassPanel(accent: Color, modifier: Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier
            .shadow(18.dp, PanelShape)
            .clip(PanelShape)
            .background(Brush.linearGradient(listOf(Color(0xD1140A26), Color(0xE0080412))))
            .border(1.dp, accent.copy(alpha = .35f), PanelShape)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp),
        content = content,
    )
}

@Composable
private fun ScriptTitle(text: String, accent: Color) {
    Column {
        Text(
            text, fontFamily = Script, fontSize = 30.sp, lineHeight = 32.sp, maxLines = 2, overflow = TextOverflow.Ellipsis,
            color = lerp(accent, Color(0xFFFF3D6E), .25f), style = glow(accent, .55f, 18f),
        )
        Box(Modifier.fillMaxWidth().padding(top = 3.dp, bottom = 4.dp).height(1.dp).background(Line))
    }
}

private fun lastPlayed(index: Int) = when {
    index == 0 -> "Most recent"
    index > 0 -> "Recently"
    else -> "Never"
}

private fun storedOn(g: Game): String =
    if (g.root == app.couch.tv.library.SERVER_ROOT) "Couch server"
    else if (g.root.startsWith(Environment.getExternalStorageDirectory().path) || g.root.startsWith("/data")) "This TV" else "USB drive"

@Composable
fun Details(game: Game?, recentIndex: Int, favourite: Boolean, needsStoragePermission: Boolean, accent: Color, modifier: Modifier) {
    val sys = game?.let { Systems.byId(it.system) }
    GlassPanel(accent, modifier) {
        if (game != null && sys != null) {
            androidx.compose.runtime.key(game.id) {
                val slide = remember { Animatable(1f) }
                LaunchedEffect(Unit) { slide.animateTo(0f, tween(350)) }
                Column(
                    Modifier.weight(1f).graphicsLayer {
                        translationX = slide.value * 18.dp.toPx()
                        alpha = 1f - slide.value
                    },
                ) {
                    ScriptTitle(game.title, accent)
                    Fact("Platform", sys.name)
                    Fact("Maker", "${sys.maker}, ${sys.year}")
                    Fact("Play Mode", if (sys.maxPlayers > 1) "Multiplayer (1–${sys.maxPlayers})" else "Single Player")
                    Fact("Stored on", storedOn(game))
                    Fact("Last Played", lastPlayed(recentIndex))
                    Fact("Size", "%.1f MB".format(game.size / 1024.0 / 1024.0))
                    if (favourite) Fact("Favourite", "★★★★★", Accent)
                    Spacer(Modifier.weight(1f))
                    PressPlay(accent)
                }
            }
        } else {
            ScriptTitle("Welcome", accent)
            Text(
                if (needsStoragePermission) "Couch needs your permission to read ROM folders. Choose \"Allow USB folders\" at the bottom of the screen."
                else "Copy your own ROMs into roms/<system>/ (for example roms/snes/) on a USB drive, or in Documents or Download on this device. Then choose Refresh.",
                fontFamily = Mono, fontSize = 12.sp, lineHeight = 19.sp, color = Muted,
            )
        }
    }
}

@Composable
private fun Fact(label: String, value: String, color: Color = Color.White) {
    Row(Modifier.padding(vertical = 1.dp)) {
        Text("$label:", fontFamily = Mono, fontSize = 12.sp, color = Muted, modifier = Modifier.width(92.dp))
        Text(value, fontFamily = Mono, fontSize = 12.sp, color = color, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun PressPlay(accent: Color) {
    val t = rememberInfiniteTransition(label = "press")
    val a by t.animateFloat(1f, .45f, infiniteRepeatable(tween(700), RepeatMode.Reverse), label = "a")
    Row(
        Modifier.fillMaxWidth().graphicsLayer { alpha = a },
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val style = glow(accent, .9f, 14f)
        Text("PRESS ", fontFamily = Mono, fontWeight = FontWeight.Bold, fontSize = 13.sp, letterSpacing = .2.em, color = accent, style = style)
        Kbd("A", BtnA, 20.dp, 11.sp)
        Text(" TO PLAY", fontFamily = Mono, fontWeight = FontWeight.Bold, fontSize = 13.sp, letterSpacing = .2.em, color = accent, style = style)
    }
}

@Composable
private fun Kbd(label: String, bg: Color, size: Dp = 20.dp, fontSize: TextUnit = 11.sp) {
    Box(Modifier.size(size).shadow(6.dp, CircleShape, ambientColor = bg, spotColor = bg).clip(CircleShape).background(bg), contentAlignment = Alignment.Center) {
        Text(label, fontFamily = Mono, fontWeight = FontWeight.ExtraBold, fontSize = fontSize, color = Color.White)
    }
}

@Composable
fun PlayersPanel(view: SessionView, joinUrl: String?, maxPlayers: Int, accent: Color, modifier: Modifier) {
    GlassPanel(accent, modifier) {
        ScriptTitle("Players", accent)
        Lobby(view, joinUrl, maxPlayers, accent)
    }
}

/** Join panel: QR + room code + player slots. */
@Composable
fun ColumnScope.Lobby(view: SessionView, joinUrl: String?, maxPlayers: Int, accent: Color) {
    val qr = remember(joinUrl) { joinUrl?.let { qrBitmap(it) } }
    val joined = view.players.size
    val pulse by rememberInfiniteTransition(label = "live").animateFloat(1f, .35f, infiniteRepeatable(tween(800), RepeatMode.Reverse), label = "p")
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        Box(Modifier.size(7.dp).graphicsLayer { alpha = pulse }.clip(CircleShape).background(Good))
        Text(
            if (joined > 0) "$joined/$maxPlayers players ready" else "SCAN TO JOIN",
            fontFamily = Mono, fontSize = 11.sp, letterSpacing = .08.em, maxLines = 1,
        )
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(
            Modifier.size(84.dp).shadow(14.dp, RoundedCornerShape(6.dp), ambientColor = accent, spotColor = accent)
                .clip(RoundedCornerShape(6.dp)).background(Color.White).padding(3.dp),
            contentAlignment = Alignment.Center,
        ) {
            if (qr != null) Image(qr, contentDescription = "QR code to join", Modifier.fillMaxSize()) else Text("…", color = Color.DarkGray)
        }
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text("Scan with your phone or open", fontFamily = Mono, fontSize = 9.sp, color = Muted, lineHeight = 11.sp)
            Text(
                joinUrl?.removePrefix("http://")?.substringBefore("?") ?: "no network",
                fontFamily = Mono, fontSize = 11.sp, lineHeight = 13.sp, modifier = Modifier.padding(bottom = 3.dp),
            )
            Text("room code", fontFamily = Mono, fontSize = 9.sp, color = Muted)
            Text(
                view.room.ifEmpty { "····" }, fontFamily = Mono, fontWeight = FontWeight.Black, fontSize = 26.sp,
                letterSpacing = .18.em, color = Accent, style = glow(Accent, .6f, 20f), maxLines = 1,
            )
            Text("🎮 or press a button on a controller", fontFamily = Mono, fontSize = 9.sp, color = Muted, lineHeight = 11.sp)
        }
    }
    Spacer(Modifier.weight(1f))
    val perRow = 4
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        for (start in 0 until maxPlayers step perRow) {
            Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                for (slot in start until start + perRow) {
                    if (slot < maxPlayers) Slot(slot, view.players.firstOrNull { it.slot == slot }, Modifier.weight(1f))
                    else Spacer(Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun Slot(slot: Int, p: PlayerView?, modifier: Modifier) {
    val c = hexColor(p?.color ?: PLAYER_COLORS[slot % PLAYER_COLORS.size])
    val shape = RoundedCornerShape(7.dp)
    val pop = remember(p != null) { Animatable(if (p != null) .6f else 1f) }
    LaunchedEffect(p != null) { pop.animateTo(1f, spring(dampingRatio = .45f, stiffness = 500f)) }
    Box(
        modifier
            .graphicsLayer {
                scaleX = pop.value
                scaleY = pop.value
                alpha = when {
                    p == null -> .5f
                    !p.connected -> .55f
                    else -> 1f
                }
            }
            .clip(shape)
            .background(if (p != null) c.copy(alpha = .14f) else Color.White.copy(alpha = .04f))
            .border(1.dp, if (p != null) c.copy(alpha = .55f) else Line, shape)
            .padding(vertical = 4.dp, horizontal = 2.dp),
    ) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            val avatar = Modifier.size(22.dp)
            if (p != null) {
                Box(avatar.shadow(8.dp, CircleShape, ambientColor = c, spotColor = c).clip(CircleShape).background(c), contentAlignment = Alignment.Center) {
                    DeviceIcon(p, 14.dp)
                }
            } else {
                Box(
                    avatar.drawBehind {
                        drawCircle(c, style = Stroke(1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 4f))))
                    },
                    contentAlignment = Alignment.Center,
                ) { Text("${slot + 1}", fontWeight = FontWeight.Black, fontSize = 11.sp, color = c) }
            }
            Text(p?.name ?: "P${slot + 1}", fontSize = 9.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (p != null) Box(Modifier.align(Alignment.TopEnd).padding(1.dp).size(5.dp).clip(CircleShape).background(quality(p)))
    }
}

// ---------- platform wheel ----------

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun PlatformWheel(rows: List<HomeRow>, activeKey: String?, accent: Color, onPick: (String) -> Unit) {
    if (rows.isEmpty()) return
    val edge = lerp(accent, Color.White.copy(alpha = .2f), .6f).copy(alpha = .5f)
    BoxWithConstraints(
        Modifier.fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Color(0xBF06030E), Color(0xE606030E))))
            .drawBehind {
                val w = 1.dp.toPx()
                drawLine(edge, Offset(0f, 0f), Offset(size.width, 0f), w)
                drawLine(edge, Offset(0f, size.height), Offset(size.width, size.height), w)
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
            if (logo != null) {
                // Console logo; a soft glow in the console's colour when focused or selected.
                Image(
                    painterResource(logo),
                    contentDescription = r.title,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.size(width = 118.dp, height = 30.dp).drawBehind {
                        if (focused || active) {
                            drawCircle(
                                Brush.radialGradient(listOf(c.copy(alpha = if (focused) .45f else .25f), Color.Transparent), radius = size.width * .55f),
                                radius = size.width * .55f,
                            )
                        }
                    },
                )
            } else {
                Text(
                    r.label.uppercase(), fontSize = 20.sp, fontWeight = FontWeight.Black, fontStyle = FontStyle.Italic,
                    letterSpacing = .04.em, color = c, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    style = if (focused || active) glow(c, .8f, 20f) else TextStyle.Default,
                )
            }
            Text(r.sub, fontFamily = Mono, fontSize = 9.sp, color = if (focused) Color.White else Muted, maxLines = 1)
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
) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val cardW = 80.dp
        val side = ((maxWidth - cardW) / 2).coerceAtLeast(0.dp)
        val state = remember(key) { LazyListState(games.indexOf(current).coerceAtLeast(0)) }
        CompositionLocalProvider(LocalBringIntoViewSpec provides CenterSpec) {
            LazyRow(
                state = state,
                contentPadding = PaddingValues(start = side, end = side, top = 28.dp, bottom = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(18.dp),
                verticalAlignment = Alignment.Bottom,
            ) {
                if (games.isEmpty()) {
                    item(key = "empty") {
                        EmptyCard(if (needsStoragePermission) "Allow folders" else "Refresh", cardW, Modifier.focusRequester(firstCard), onEmpty)
                    }
                }
                itemsIndexed(games, key = { _, g -> g.id }) { _, g ->
                    val isCurrent = g == current
                    CoverCard(
                        g, isCurrent, onlineArt, accent, cardW,
                        if (isCurrent) Modifier.focusRequester(firstCard) else Modifier,
                        onFocus, onOpen,
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
) {
    var focused by remember { mutableStateOf(false) }
    val c = Systems.byId(g.system)?.accent?.let(::hexColor) ?: accent
    // Grow from the bottom edge, like the web host (Card's own scale grows from the centre).
    val scale by animateFloatAsState(if (focused) 1.3f else 1f, spring(dampingRatio = .55f, stiffness = 500f), label = "scale")
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
            colors = CardDefaults.colors(containerColor = Color(0xFF111111)),
            scale = CardDefaults.scale(focusedScale = 1f),
            border = CardDefaults.border(focusedBorder = Border(BorderStroke(2.dp, lerp(c, Color.White, .2f)), shape = shape)),
            glow = CardDefaults.glow(focusedGlow = Glow(c.copy(alpha = .75f), 14.dp)),
        ) {
            Box(Modifier.fillMaxSize()) {
                Art(g, onlineArt, Modifier.fillMaxSize(), shape = shape)
                if (!focused && !current) Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .4f)))
            }
        }
        Text(
            g.title, fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center,
            fontWeight = if (focused) FontWeight.SemiBold else FontWeight.Normal,
            color = if (focused) Color.White else Muted,
            modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
        )
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
            ) { Text("＋", fontSize = 34.sp) }
        }
        Text(label, fontSize = 10.sp, color = Muted, modifier = Modifier.padding(top = 6.dp))
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
) {
    Row(
        Modifier.fillMaxWidth()
            .background(Color(0xD904020A))
            .drawBehind { drawLine(Line, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }
            .padding(horizontal = 28.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Hint("A", BtnA, "Select")
        Hint("B", BtnB, "Back")
        Hint("✚", Color(0xFF444444), "Browse")
        if (hiddenCount > 0) {
            Text(
                "$hiddenCount game${if (hiddenCount > 1) "s" else ""} hidden: this device is too slow for their system (Settings).",
                fontSize = 11.sp, color = Muted, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false),
            )
        }
        Spacer(Modifier.weight(1f))
        val away = view.players.count { !it.connected }
        if (view.players.isNotEmpty()) Pill(if (away > 0) "Players · $away away" else "Players", if (away > 0) Bad else accent, onPlayers)
        if (server != null && serverLoad == null) Pill("●  ${server.label}", accent, onServer, dot = if (server.healthy) Good else Bad)
        if (needsStoragePermission) Pill("Allow USB folders", accent, onGrantStorage)
        if (serverLoad != null) LoadingPill(serverLoad, accent) else Pill("⟳  Refresh" + (server?.savedAt?.let { " · ${age(it)}" } ?: ""), accent, onRefresh)
    }
}

/** "Loading N64, SNES… 4/13" with a spinner and a bar while the server's consoles load. */
@Composable
private fun LoadingPill(p: app.couch.tv.library.LoadProgress, accent: Color) {
    val fraction by animateFloatAsState(p.done.toFloat() / p.total.coerceAtLeast(1), tween(300), label = "load")
    val label = when {
        !p.finished -> "Loading ${loadingNames(p).ifEmpty { "library" }}… ${p.done}/${p.total}"
        p.failed.isNotEmpty() -> "⚠  ${p.failed.size} console${if (p.failed.size > 1) "s" else ""} did not load"
        else -> "✓  Library up to date"
    }
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = .06f))
            .border(1.dp, Color.White.copy(alpha = .18f), RoundedCornerShape(50))
            .padding(horizontal = 12.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (!p.finished) Spinner(accent, 12.dp, 2.dp)
        Text(label, fontSize = 11.sp, maxLines = 1)
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

private fun loadingNames(p: app.couch.tv.library.LoadProgress) =
    p.loading.joinToString(", ") { app.couch.tv.library.Systems.byId(it)?.shortName ?: it }

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
private fun Hint(key: String, bg: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Kbd(key, bg, 18.dp, 10.sp)
        Text(label, fontSize = 12.sp)
    }
}

@Composable
private fun Pill(label: String, accent: Color, onClick: () -> Unit, dot: Color? = null) {
    val shape = RoundedCornerShape(50)
    Surface(
        onClick = onClick,
        shape = ClickableSurfaceDefaults.shape(shape),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = Color.White.copy(alpha = .06f), contentColor = Color.White,
            focusedContainerColor = Color.White, focusedContentColor = Color(0xFF0B0D12),
        ),
        border = ClickableSurfaceDefaults.border(
            border = Border(BorderStroke(1.dp, Color.White.copy(alpha = .18f)), shape = shape),
            focusedBorder = Border(BorderStroke(1.dp, Color.White), shape = shape),
        ),
        glow = ClickableSurfaceDefaults.glow(focusedGlow = Glow(accent.copy(alpha = .7f), 10.dp)),
    ) {
        if (dot == null) {
            Text(label, fontSize = 11.sp, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp))
        } else {
            // Coloured status dot (first character of the label) + text.
            Text(
                androidx.compose.ui.text.buildAnnotatedString {
                    pushStyle(androidx.compose.ui.text.SpanStyle(color = dot))
                    append(label.take(1))
                    pop()
                    append(label.drop(1))
                },
                fontSize = 11.sp,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            )
        }
    }
}
