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
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.foundation.layout.absoluteOffset
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
private val BtnKey = Color(0xFF2A303C)
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
    // Themes paint a flat pattern per console instead of the blurred screenshot.
    when (val look = LocalLook.current) {
        // Own layer: animations elsewhere on the screen don't redraw the wall.
        is HomeLook.Pixel -> { Box(Modifier.fillMaxSize().graphicsLayer().drawBehind(look.p.backdrop)); return }
        is HomeLook.Neon -> {
            val wall = remember(look.n) { neonWall(look.n) }
            Box(Modifier.fillMaxSize().graphicsLayer().drawBehind(wall)) {
                // Neon drawings of the console on the wall either side of the cover row (behind the
                // covers, so a long row simply passes in front of them).
                if (hasNeonMotif(look.sys)) {
                    val m = Modifier.padding(bottom = 74.dp).size(width = 120.dp, height = 112.dp)
                    NeonMotif(look.sys!!, 0, m.align(Alignment.BottomStart).padding(start = 18.dp))
                    NeonMotif(look.sys!!, 1, m.align(Alignment.BottomEnd).padding(end = 18.dp))
                }
            }
            return
        }
        HomeLook.Midnight -> Unit
    }
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
    val look = LocalLook.current
    // Logo, clock, settings. The console you're on shows in the platform wheel, players in the lobby.
    Box(
        Modifier.fillMaxWidth().drawBehind {
            when (look) {
                is HomeLook.Pixel -> {
                    look.p.bar(this)
                    drawRect(look.p.line, Offset(0f, size.height), androidx.compose.ui.geometry.Size(size.width, .25f * Rem.toPx()))
                }
                else -> Unit
            }
        },
    ) {
        Row(
            Modifier.fillMaxWidth().padding(start = SafeX, end = SafeX - 8.dp, top = SafeY, bottom = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            when (look) {
                HomeLook.Midnight -> Logo()
                is HomeLook.Pixel -> Logo(mark = look.p.accent, ink = look.p.barInk, font = look.p.head)
                is HomeLook.Neon -> Logo(mark = look.n.n2, ink = Color.White, script = look.n.n1)
            }
            Spacer(Modifier.weight(1f))
            when (look) {
                HomeLook.Midnight -> Text(clock, fontSize = Body, style = Tabular)
                is HomeLook.Pixel -> ThemedText(clock, style = look.p.head.style(Body).merge(Tabular), color = look.p.barInk)
                is HomeLook.Neon -> NeonText(clock, TiltNeon.style(Body).merge(Tabular), look.n.n2)
            }
            ThemedIconButton(onClick = onSettings) { Icon(Icons.Default.Settings, contentDescription = "Settings") }
        }
        if (look is HomeLook.Neon && look.sys != null && Systems.byId(look.sys) != null) {
            // The console's logo lit in a sign hanging over the middle of the bar.
            NeonMarquee(
                look.sys, Systems.byId(look.sys)!!.name, look.n,
                Modifier.align(Alignment.TopCenter).padding(top = SafeY - 4.dp).size(width = Rem * 34f, height = 44.dp),
            )
        }
    }
}

/** The top bar's settings button, in the theme's colours. */
@Composable
private fun ThemedIconButton(onClick: () -> Unit, content: @Composable () -> Unit) {
    when (val look = LocalLook.current) {
        HomeLook.Midnight -> IconButton(onClick = onClick) { content() }
        is HomeLook.Pixel -> IconButton(
            onClick = onClick,
            shape = androidx.tv.material3.IconButtonDefaults.shape(RectangleShape),
            colors = androidx.tv.material3.IconButtonDefaults.colors(
                containerColor = Color.Transparent, contentColor = look.p.barInk,
                focusedContainerColor = look.p.focus, focusedContentColor = look.p.onAccent,
            ),
        ) { content() }
        is HomeLook.Neon -> IconButton(
            onClick = onClick,
            modifier = Modifier.drawBehind {
                tubeGlow(look.n.n1, size.minDimension / 2)
                drawCircle(look.n.n1, size.minDimension / 2 - 1.dp.toPx(), style = Stroke(2.dp.toPx()))
            },
            colors = androidx.tv.material3.IconButtonDefaults.colors(
                containerColor = Color.Transparent, contentColor = Color.White,
                focusedContainerColor = look.n.n1, focusedContentColor = Color.Black,
            ),
        ) { content() }
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
    val look = LocalLook.current
    Box(modifier, contentAlignment = Alignment.Center) {
        val reduce = rememberReduceMotion()
        val shape = when (look) {
            HomeLook.Midnight -> RoundedCornerShape(8.dp)
            is HomeLook.Pixel -> RectangleShape
            is HomeLook.Neon -> RoundedCornerShape(Rem)
        }
        val frame = when (look) {
            HomeLook.Midnight -> Modifier.shadow(16.dp, shape).border(1.dp, Color.White.copy(alpha = .14f), shape)
            // The console's bezel, drawn outside the screen (fits in the preview's padding).
            is HomeLook.Pixel -> Modifier.drawBehind { rings(look.p.screen) }.border(1.dp, Color.Black, shape)
            is HomeLook.Neon -> Modifier.drawBehind { tubeGlow(look.n.n1, Rem.toPx()) }
        }
        Box(
            Modifier
                .aspectRatio(4f / 3f, matchHeightConstraintsFirst = true)
                .then(frame)
                .clip(shape)
                .background(Color.Black)
                .drawWithContent {
                    drawContent()
                    if (look is HomeLook.Neon) {
                        // Scanlines and the tube's inner glow.
                        val step = 4f; val line = 2f
                        var y = 0f
                        while (y < size.height) { drawRect(Color.Black.copy(alpha = .22f), Offset(0f, y), androidx.compose.ui.geometry.Size(size.width, line)); y += step }
                        tubeInner(look.n.n1, Rem.toPx())
                    }
                },
        ) {
            if (game != null) {
                androidx.compose.runtime.key(game.id) {
                    val fade = remember { Animatable(if (reduce) 1f else 0f) }
                    LaunchedEffect(Unit) { fade.animateTo(1f, tween(260, easing = EaseOut)) }
                    Art(
                        game, onlineArt, Modifier.fillMaxSize().graphicsLayer { alpha = fade.value },
                        kind = "Named_Snaps", shape = RectangleShape, pixelated = true,
                        colorFilter = if (look is HomeLook.Pixel && look.p.lcdPreview) LcdGreen else null,
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
private fun InfoPanel(modifier: Modifier, players: Boolean = false, content: @Composable ColumnScope.() -> Unit) {
    val look = LocalLook.current
    val skin = when (look) {
        HomeLook.Midnight -> Modifier.clip(PanelShape).background(Panel.copy(alpha = .92f)).border(1.dp, Line, PanelShape)
        is HomeLook.Pixel -> {
            val p = look.p
            val r = p.radius * Rem.value
            val shape = RoundedCornerShape(r.dp)
            val frame = if (players) p.playersFrame ?: p.frame else p.frame
            // Pixel frames are drawn inside the panel (CSS inset shadows), over its 1 dp border.
            Modifier.clip(shape).drawBehind { p.panel(this); insets(frame, r.dp.toPx()) }.border(1.dp, p.line, shape)
        }
        is HomeLook.Neon -> {
            val tube = if (players) look.n.n2 else look.n.n1
            val r = 1.1f * Rem.value
            val shape = RoundedCornerShape(r.dp)
            Modifier
                .drawBehind { tubeGlow(tube, r.dp.toPx()) }
                .clip(shape)
                .background(NeonColors.panel)
                .drawBehind {
                    tubeInner(tube, r.dp.toPx())
                    // Mounting screws in the top corners.
                    val s = .3f * Rem.toPx(); val inset = .6f * Rem.toPx() + s
                    for (x in listOf(inset, size.width - inset)) {
                        drawCircle(Brush.radialGradient(listOf(Color(0xFF9A9AA0), Color(0xFF3A3A40)), Offset(x, inset), s), s, Offset(x, inset))
                    }
                }
        }
    }
    val ink = when (look) {
        HomeLook.Midnight -> androidx.tv.material3.LocalContentColor.current
        is HomeLook.Pixel -> look.p.text
        is HomeLook.Neon -> Color.White
    }
    CompositionLocalProvider(androidx.tv.material3.LocalContentColor provides ink) {
        Column(
            modifier.then(skin).padding(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
            content = content,
        )
    }
}

/** Game title in the details panel: the same heavy upright sans as the logo. */
@Composable
private fun PanelTitle(text: String, maxLines: Int = 3) {
    when (val look = LocalLook.current) {
        HomeLook.Midnight -> Text(
            text, fontSize = 24.sp, lineHeight = 28.sp, fontWeight = FontWeight.ExtraBold,
            maxLines = maxLines, overflow = TextOverflow.Ellipsis,
        )
        is HomeLook.Pixel -> {
            val p = look.p
            var style = p.head.style(24.sp, 28.sp)
            if (p.titleItalic) style = style.copy(fontStyle = FontStyle.Italic)
            if (p.titleShadow != null) {
                val (d, c) = p.titleShadow
                val px = with(androidx.compose.ui.platform.LocalDensity.current) { (Rem * d).toPx() }
                style = style.copy(shadow = Shadow(c, Offset(px, px), 0f))
            }
            if (p.titleBrush != null) style = style.copy(brush = p.titleBrush)
            ThemedText(text, style = style, color = if (p.titleBrush != null) Color.Unspecified else p.title, maxLines = maxLines, overflow = TextOverflow.Ellipsis)
        }
        // A script neon sign: bigger glyphs on the same line height.
        is HomeLook.Neon -> NeonText(
            text, TextStyle(fontFamily = ThemeFonts.neonderthaw, fontSize = 33.sp, lineHeight = 28.sp, lineHeightStyle = FixedLine), look.n.n1,
            maxLines = maxLines, overflow = TextOverflow.Ellipsis,
        )
    }
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
                    val look = LocalLook.current
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        val m = Modifier.weight(1f, fill = false)
                        when (look) {
                            HomeLook.Midnight -> Text(
                                sys.name, fontSize = Body, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold,
                                color = lerp(accent, Color.White, .3f), maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = m,
                            )
                            is HomeLook.Pixel -> ThemedText(
                                sys.name, style = look.p.head.style(Body, 20.sp), color = look.p.accent,
                                maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = m,
                            )
                            is HomeLook.Neon -> ThemedText(
                                sys.name.uppercase(), style = TiltNeon.style(Body, 20.sp).copy(letterSpacing = .1.em),
                                color = look.n.n2, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = m, glow = look.n.n2.copy(alpha = .6f),
                            )
                        }
                        val star = when (look) { HomeLook.Midnight -> Accent; is HomeLook.Pixel -> look.p.accent; is HomeLook.Neon -> look.n.n2 }
                        if (favourite) Icon(Icons.Rounded.Star, contentDescription = "Favourite", tint = star, modifier = Modifier.size(18.dp))
                    }
                    val players = if (sys.maxPlayers > 1) "1 to ${sys.maxPlayers} players" else "1 player"
                    when (look) {
                        HomeLook.Midnight -> Text(players, fontSize = Body, color = Muted)
                        is HomeLook.Pixel -> ThemedText(players, style = look.p.body.style(Body), color = look.p.muted)
                        is HomeLook.Neon -> ThemedText(players, style = TiltNeon.style(Body), color = NeonColors.muted)
                    }
                    Spacer(Modifier.weight(1f))
                    PressPlay(gamepad)
                }
            }
        } else {
            PanelTitle("Welcome")
            val look = LocalLook.current
            ThemedText(
                "Your phones are the controllers. Add a game to get started.",
                style = look.body.style(Body, 22.sp), color = if (look is HomeLook.Pixel) look.p.muted else if (look is HomeLook.Neon) NeonColors.muted else Muted,
            )
        }
    }
}

@Composable
private fun PressPlay(gamepad: Boolean) {
    val look = LocalLook.current
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val word: @Composable (String) -> Unit = { w ->
            when (look) {
                HomeLook.Midnight -> Text(w, fontWeight = FontWeight.SemiBold, fontSize = Body)
                // Body font (VT323 for Silkscreen): the wide pixel fonts would not fit the panel on one line.
                is HomeLook.Pixel -> ThemedText(w, style = (if (look.p.body.family == ThemeFonts.silkscreen) Vt323 else look.p.body).style(Body), color = look.p.text, maxLines = 1)
                is HomeLook.Neon -> ThemedText(w.uppercase(), style = TiltNeon.style(Body).copy(letterSpacing = .08.em), color = Color.White)
            }
        }
        word("Press")
        // A TV remote has OK, not A. A/B only once a game controller has joined.
        Kbd(if (gamepad) "A" else "OK", Accent, Color(0xFF1A1405), role = KeyRole.Play)
        word("to play")
    }
}

/** What a button cap stands for, so themes can colour it like the console's own buttons. */
private enum class KeyRole { Play, Ok, Back, Other }

/** A button cap: a circle for one letter, a pill for "OK". */
@Composable
private fun Kbd(
    label: String,
    bg: Color = BtnKey,
    fg: Color = Color.White,
    size: Dp = 26.dp,
    fontSize: TextUnit = 13.sp,
    role: KeyRole = KeyRole.Other,
) {
    val look = LocalLook.current
    val pill = RoundedCornerShape(50)
    when (look) {
        HomeLook.Midnight -> Box(
            Modifier.height(size).widthIn(min = size).clip(pill).background(bg).padding(horizontal = 6.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(label, fontWeight = FontWeight.ExtraBold, fontSize = fontSize, color = fg)
        }
        is HomeLook.Pixel -> {
            val p = look.p
            if (role == KeyRole.Play) {
                // The press-play cap: a pixel "plus" cut from a square in the accent colour.
                Box(
                    Modifier.height(size).widthIn(min = size).clip(PixelCross).background(p.accent).padding(horizontal = 6.dp),
                    contentAlignment = Alignment.Center,
                ) { ThemedText(label, style = p.head.style(fontSize), color = p.onAccent) }
            } else {
                // Hint bar caps: square outlines in the bar's ink.
                val ink = androidx.tv.material3.LocalContentColor.current
                Box(
                    Modifier.height(size).widthIn(min = size).border(2.dp, ink, RectangleShape).padding(horizontal = 6.dp),
                    contentAlignment = Alignment.Center,
                ) { ThemedText(label, style = p.head.style(fontSize), color = ink) }
            }
        }
        is HomeLook.Neon -> {
            val c = when (role) { KeyRole.Back -> look.n.back; KeyRole.Other -> look.n.n1; else -> look.n.ok }
            val pulse = if (role == KeyRole.Play) neonPulse() else 0f
            Box(
                Modifier.height(size).widthIn(min = size)
                    .drawBehind {
                        val r = size.toPx() / 2
                        drawIntoGlow(c, r, .7f * Rem.toPx() * (1f + pulse * 1.3f))
                    }
                    .border(2.dp, c, pill)
                    .padding(horizontal = 6.dp),
                contentAlignment = Alignment.Center,
            ) { ThemedText(label, style = TiltNeon.style(fontSize), color = Color.White, glow = c) }
        }
    }
}

/** A glowing pill behind a neon button cap. */
private fun DrawScope.drawIntoGlow(c: Color, radius: Float, blur: Float) = softGlow(c.copy(alpha = .75f), radius, blur)

/** Pixel "plus" cap shape (pixel.css press-play kbd clip-path). */
private val PixelCross = androidx.compose.foundation.shape.GenericShape { s, _ ->
    val w = s.width; val h = s.height
    moveTo(0f, h * .25f); lineTo(w * .25f, h * .25f); lineTo(w * .25f, 0f); lineTo(w * .75f, 0f); lineTo(w * .75f, h * .25f); lineTo(w, h * .25f)
    lineTo(w, h * .75f); lineTo(w * .75f, h * .75f); lineTo(w * .75f, h); lineTo(w * .25f, h); lineTo(w * .25f, h * .75f); lineTo(0f, h * .75f); close()
}

@Composable
private fun KeyIcon(icon: ImageVector, bg: Color = BtnKey, size: Dp = 26.dp, role: KeyRole = KeyRole.Other) {
    when (val look = LocalLook.current) {
        HomeLook.Midnight -> Box(Modifier.size(size).clip(CircleShape).background(bg), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(size * .65f))
        }
        is HomeLook.Pixel -> {
            val ink = androidx.tv.material3.LocalContentColor.current
            Box(Modifier.size(size).border(2.dp, ink, RectangleShape), contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription = null, tint = ink, modifier = Modifier.size(size * .65f))
            }
        }
        is HomeLook.Neon -> {
            val c = if (role == KeyRole.Back) look.n.back else look.n.n2
            Box(
                Modifier.size(size).drawBehind { drawIntoGlow(c, size.toPx() / 2, .6f * Rem.toPx()) }.border(2.dp, c, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(size * .65f))
            }
        }
    }
}

@Composable
fun PlayersPanel(view: SessionView, joinUrl: String?, maxPlayers: Int, accent: Color, modifier: Modifier, free: Boolean = false) {
    InfoPanel(modifier, players = true) {
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
                        val look = LocalLook.current
                        val url = joinUrl.removePrefix("http://").substringBefore("?")
                        if (look == HomeLook.Midnight) {
                            Text(url, fontSize = Small, fontWeight = FontWeight.SemiBold, lineHeight = 18.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        } else {
                            ThemedText(
                                url, style = look.body.style(Small, 18.sp), maxLines = 2, overflow = TextOverflow.Ellipsis,
                                color = if (look is HomeLook.Pixel) look.p.muted else NeonColors.muted,
                            )
                        }
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
    when (val look = LocalLook.current) {
        HomeLook.Midnight -> Text(text, fontSize = 18.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        is HomeLook.Pixel -> ThemedText(text, style = look.p.head.style(18.sp), color = look.p.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
        is HomeLook.Neon -> ThemedText(
            text.uppercase(), style = TiltNeon.style(18.sp).copy(letterSpacing = .1.em), color = look.n.n2,
            maxLines = 1, overflow = TextOverflow.Ellipsis, glow = look.n.n2.copy(alpha = .6f),
        )
    }
}

@Composable
private fun RoomCode(room: String, size: TextUnit) {
    val code = room.ifEmpty { "····" }
    when (val look = LocalLook.current) {
        HomeLook.Midnight -> Text(code, fontWeight = FontWeight.Black, fontSize = size, letterSpacing = .08.em, color = Accent, maxLines = 1)
        is HomeLook.Pixel -> ThemedText(code, style = look.p.head.style(size).copy(letterSpacing = .08.em), color = look.p.accent, maxLines = 1)
        is HomeLook.Neon -> NeonText(code, TiltNeon.style(size).copy(letterSpacing = .08.em), look.n.n2, maxLines = 1)
    }
}

@Composable
private fun QrBox(qr: androidx.compose.ui.graphics.ImageBitmap?, accent: Color, modifier: Modifier) {
    val look = LocalLook.current
    val shape = if (look is HomeLook.Pixel) RectangleShape else RoundedCornerShape(6.dp)
    Box(
        modifier.aspectRatio(1f, matchHeightConstraintsFirst = true)
            .then(if (look is HomeLook.Neon) Modifier.drawBehind { softGlow(look.n.n2.copy(alpha = .8f), 6.dp.toPx(), 1.1f * Rem.toPx()) } else Modifier)
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
            Icon(Icons.Rounded.Lock, contentDescription = "Locked: Couch Pro", tint = Color.White, modifier = Modifier.size(14.dp))
        }
    }
}

@Composable
private fun SlotAvatar(slot: Int, p: PlayerView?, size: Dp) {
    val c = hexColor(p?.color ?: PLAYER_COLORS[slot % PLAYER_COLORS.size])
    val look = LocalLook.current
    // Arcade Pixel Art seats are square; Neon seats are lit rings.
    val pixel = look is HomeLook.Pixel
    if (p != null) {
        val m = when (look) {
            is HomeLook.Neon -> Modifier.drawBehind { softGlow(c.copy(alpha = .7f), size.toPx() / 2, .5f * Rem.toPx()) }.border(2.dp, c, CircleShape)
            is HomeLook.Pixel -> Modifier.background(c)
            HomeLook.Midnight -> Modifier.clip(CircleShape).background(c)
        }
        Box(Modifier.size(size).then(m), contentAlignment = Alignment.Center) {
            DeviceIcon(p, size * .6f)
        }
    } else {
        val ring = if (look is HomeLook.Neon) c.copy(alpha = .45f) else c.copy(alpha = .7f)
        Box(
            Modifier.size(size).drawBehind {
                val dash = Stroke(1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 4f)))
                if (pixel) drawRect(ring, style = dash) else drawCircle(ring, style = dash)
            },
            contentAlignment = Alignment.Center,
        ) {
            if (look == HomeLook.Midnight) Text("${slot + 1}", fontWeight = FontWeight.Black, fontSize = Small, color = c)
            else ThemedText("${slot + 1}", style = look.head.style(Small), color = c)
        }
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
            val look = LocalLook.current
            val on = if (look is HomeLook.Pixel) look.p.text else Color.White
            val off = if (look is HomeLook.Pixel) look.p.muted else Muted
            ThemedText(
                p?.name ?: "", style = if (look == HomeLook.Midnight) TextStyle(fontSize = Small, fontWeight = FontWeight.SemiBold) else look.body.style(Small),
                maxLines = 1, overflow = TextOverflow.Ellipsis, color = if (p?.connected == true) on else off,
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
    val look = LocalLook.current
    BoxWithConstraints(
        Modifier.fillMaxWidth()
            .drawBehind {
                val w = 1.dp.toPx()
                when (look) {
                    HomeLook.Midnight -> {
                        drawRect(Bg.copy(alpha = .78f))
                        drawLine(Line, Offset(0f, 0f), Offset(size.width, 0f), w)
                        drawLine(Line, Offset(0f, size.height), Offset(size.width, size.height), w)
                    }
                    is HomeLook.Pixel -> {
                        look.p.strip(this)
                        drawLine(look.p.line, Offset(0f, 0f), Offset(size.width, 0f), w)
                        drawLine(look.p.line, Offset(0f, size.height), Offset(size.width, size.height), w)
                    }
                    is HomeLook.Neon -> {
                        drawRect(NeonColors.strip)
                        // Tubes along both edges.
                        for (y in listOf(0f, size.height)) {
                            tubeLine(look.n.n1, y)
                            drawLine(look.n.n1, Offset(0f, y), Offset(size.width, y), w)
                        }
                    }
                }
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
    val look = LocalLook.current
    val pixel = look as? HomeLook.Pixel
    // Pixel: the focused stop gets the console's fill, or a square frame in the focus colour.
    val focusFill = pixel?.p?.platformFocusFill ?: Color.Transparent
    Surface(
        onClick = onPick,
        modifier = modifier
            .onFocusChanged {
                focused = it.isFocused
                if (it.isFocused) onPick()
            }
            .then(
                if (pixel != null && pixel.p.platformFocusFill == null) Modifier.drawWithContent {
                    drawContent()
                    val w = 2.dp.toPx()
                    if (focused) drawRect(pixel.p.focus, Offset(w / 2, w / 2), androidx.compose.ui.geometry.Size(size.width - w, size.height - w), style = Stroke(w))
                } else Modifier,
            ),
        shape = ClickableSurfaceDefaults.shape(if (pixel != null) RectangleShape else RoundedCornerShape(6.dp)),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = Color.Transparent, contentColor = Color.White,
            focusedContainerColor = focusFill, focusedContentColor = Color.White,
            pressedContainerColor = Color.Transparent, pressedContentColor = Color.White,
        ),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.12f),
    ) {
        Column(
            Modifier.fillMaxWidth().padding(vertical = 4.dp).graphicsLayer {
                // Neon dims the tube itself (unlit logos), not the whole stop.
                alpha = if (look is HomeLook.Neon || focused) 1f else if (active) .85f else .4f
            },
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            val logo = systemLogo(r.key)
            val slot = Modifier.size(width = 118.dp, height = 30.dp)
            Box {
                when {
                    pixel != null && hasPixelIcon(r.key) -> Box(slot, contentAlignment = Alignment.Center) { PixelIcon(r.key, 30.dp, description = r.title) }
                    look is HomeLook.Neon && logo != null ->
                        if (focused) GlowLogo(logo, look.n.n1, slot, flicker = true, description = r.title)
                        else Image(
                            painterResource(logo), contentDescription = r.title, contentScale = ContentScale.Fit, modifier = slot,
                            colorFilter = if (active) unlitFilter(1f, .75f, .3f) else unlitFilter(.75f, .3f),
                        )
                    logo != null -> Image(
                        painterResource(logo),
                        contentDescription = r.title,
                        contentScale = ContentScale.Fit,
                        modifier = slot,
                    )
                    pixel != null -> ThemedText(r.label, style = pixel.p.head.style(20.sp), color = c, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    look is HomeLook.Neon ->
                        if (focused) {
                            val flick = neonFlicker()
                            NeonText(r.label, TiltNeon.style(20.sp), r.accent ?: look.n.n1, Modifier.graphicsLayer { alpha = flick }, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        } else ThemedText(
                            r.label, style = TiltNeon.style(20.sp), maxLines = 1, overflow = TextOverflow.Ellipsis,
                            color = if (active) lerp(r.accent ?: look.n.n1, Color.Black, .3f) else NeonColors.unlit,
                        )
                    else -> Text(r.label, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = c, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (r.locked) {
                    Icon(
                        Icons.Rounded.Lock, contentDescription = "Needs Couch Pro", tint = Accent,
                        modifier = Modifier.align(Alignment.TopEnd).offset(x = 6.dp, y = (-4).dp).size(14.dp),
                    )
                }
            }
            // The selected stop gets a short bar in its colour: where you are, without a glow.
            val bar = when (look) {
                HomeLook.Midnight -> c
                is HomeLook.Pixel -> look.p.accent
                is HomeLook.Neon -> look.n.n2
            }
            Box(
                Modifier.padding(top = 4.dp).width(28.dp).height(3.dp).clip(if (pixel != null) RectangleShape else RoundedCornerShape(50))
                    .background(if (active) bar else Color.Transparent),
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
    val look = LocalLook.current
    val shape = when (look) {
        HomeLook.Midnight -> RoundedCornerShape(4.dp)
        is HomeLook.Pixel -> RectangleShape
        is HomeLook.Neon -> RoundedCornerShape(Rem * .3f)
    }
    // Arrow over the focused cover: blinks (Pixel) or bobs (Neon).
    val blink = if (focused && look is HomeLook.Pixel) pixelBlink() else 1f
    val bob = if (focused && look is HomeLook.Neon) neonPulse(1200) else 0f
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
                .drawWithContent {
                    // Frames and arrows sit outside the cover's box, so they take no space.
                    val rem = size.width / 10f
                    when (look) {
                        is HomeLook.Neon -> if (focused) tubeGlow(look.n.n1, .3f * rem)
                        else -> Unit
                    }
                    drawContent()
                    when (look) {
                        is HomeLook.Pixel -> if (focused) {
                            val o = .3f * rem; val w = .25f * rem
                            drawRect(look.p.focus, Offset(-o - w / 2, -o - w / 2), androidx.compose.ui.geometry.Size(size.width + 2 * o + w, size.height + 2 * o + w), style = Stroke(w))
                            if (blink > .5f) drawPath(pixelArrow(size.width / 2, -1.6f * rem, 1.5f * rem, 1f * rem), look.p.focus)
                        }
                        is HomeLook.Neon ->
                            if (focused) arrowAbove(look.n.n2, -1.5f * rem + bob * .3f * rem, 1f * rem, .5f * rem, glow = true)
                            else drawRoundRect(Color.White.copy(alpha = .15f), cornerRadius = androidx.compose.ui.geometry.CornerRadius(.3f * rem), style = Stroke(1.dp.toPx()))
                        HomeLook.Midnight -> Unit
                    }
                }
                .onFocusChanged {
                    focused = it.isFocused
                    if (it.isFocused) onFocus(g)
                },
            shape = CardDefaults.shape(shape),
            colors = CardDefaults.colors(containerColor = if (look == HomeLook.Midnight) Color(0xFF111111) else Color.Transparent),
            scale = CardDefaults.scale(focusedScale = 1f),
            border = if (look == HomeLook.Midnight) CardDefaults.border(focusedBorder = Border(BorderStroke(3.dp, Accent), shape = shape))
            else CardDefaults.border(border = Border.None, focusedBorder = Border.None),
            glow = CardDefaults.glow(focusedGlow = Glow.None),
        ) {
            Box(Modifier.fillMaxSize()) {
                if (look is HomeLook.Pixel) {
                    // The console's media (cartridge, CD case, UMD…) with the cover art inside it.
                    val media = pixelMedia(g.system)
                    Canvas(Modifier.fillMaxSize()) { media.body(this, size.width / 10f) }
                    Box(Modifier.fillMaxSize().padding(media.padding(width)), contentAlignment = Alignment.Center) {
                        if (media.round) Art(g, onlineArt, Modifier.fillMaxWidth().aspectRatio(1f), shape = CircleShape, pixelated = true)
                        else Art(g, onlineArt, Modifier.fillMaxSize(), shape = RectangleShape, pixelated = true)
                    }
                    media.deco?.let { deco -> Canvas(Modifier.fillMaxSize()) { deco(this, size.width / 10f) } }
                } else {
                    Art(g, onlineArt, Modifier.fillMaxSize(), shape = shape)
                }
                if (!focused && !current) Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .4f)))
                if (isNew) NewMark(c, shape)
            }
        }
    }
}

/** On/off once a second (CSS `steps(1)` blink). */
@Composable
private fun pixelBlink(): Float {
    if (rememberReduceMotion()) return 1f
    val v by rememberInfiniteTransition(label = "blink").animateFloat(
        0f, 1f, infiniteRepeatable(tween(1000, easing = LinearEasing), RepeatMode.Restart), label = "b",
    )
    return if (v < .5f) 1f else 0f
}

/** The pixel theme's stepped arrow (pixel.css clip-path), [w] × [h] at ([cx], [top]). */
private fun pixelArrow(cx: Float, top: Float, w: Float, h: Float) = androidx.compose.ui.graphics.Path().apply {
    val l = cx - w / 2
    fun p(x: Float, y: Float) = Offset(l + x * w, top + y * h)
    val pts = listOf(p(0f, 0f), p(1f, 0f), p(1f, .25f), p(.83f, .25f), p(.83f, .5f), p(.67f, .5f), p(.67f, .75f), p(.5f, .75f), p(.5f, 1f), p(.33f, .75f), p(.33f, .5f), p(.17f, .5f), p(.17f, .25f), p(0f, .25f))
    moveTo(pts[0].x, pts[0].y)
    for (q in pts.drop(1)) lineTo(q.x, q.y)
    close()
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
            .background(Color(0xE60A0C12), RoundedCornerShape(50))
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
    val look = LocalLook.current
    val ink = when (look) {
        HomeLook.Midnight -> androidx.tv.material3.LocalContentColor.current
        is HomeLook.Pixel -> look.p.hintsInk ?: look.p.barInk
        is HomeLook.Neon -> Color.White
    }
    CompositionLocalProvider(androidx.tv.material3.LocalContentColor provides ink) {
    Row(
        Modifier.fillMaxWidth()
            .drawBehind {
                val w = 1.dp.toPx()
                when (look) {
                    HomeLook.Midnight -> {
                        drawRect(Bg.copy(alpha = .85f))
                        drawLine(Line, Offset(0f, 0f), Offset(size.width, 0f), w)
                    }
                    is HomeLook.Pixel -> {
                        val bg = look.p.hintsBg
                        if (bg != null) drawRect(bg) else look.p.bar(this)
                        drawRect(look.p.line, Offset(0f, -.25f * Rem.toPx()), androidx.compose.ui.geometry.Size(size.width, .25f * Rem.toPx()))
                    }
                    is HomeLook.Neon -> {
                        drawRect(NeonColors.strip)
                        tubeLine(look.n.n1, 0f)
                        drawLine(look.n.n1, Offset(0f, 0f), Offset(size.width, 0f), w)
                    }
                }
            }
            // The bar's background runs to the screen edge; its content stays inside the overscan margin.
            .padding(start = SafeX, end = SafeX, top = 6.dp, bottom = SafeY),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        // A TV remote has OK and Back; show A/B only once a game controller is in the room.
        if (gamepad) {
            Hint({ Kbd("A", role = KeyRole.Ok) }, "Select")
            Hint({ Kbd("B", role = KeyRole.Back) }, "Back")
        } else {
            Hint({ Kbd("OK", role = KeyRole.Ok) }, "Select")
            Hint({ KeyIcon(Icons.AutoMirrored.Rounded.ArrowBack, role = KeyRole.Back) }, "Back")
        }
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(18.dp), verticalAlignment = Alignment.CenterVertically) {
            if (slotsOpen) {
                Hint({ KeyIcon(Icons.Rounded.SportsEsports) }, "Controller? Press any button to join", Modifier.weight(1f, fill = false), long = true)
            }
            if (hiddenCount > 0) {
                ThemedText(
                    "$hiddenCount game${if (hiddenCount > 1) "s" else ""} hidden: this device is too slow for their system (Settings).",
                    style = look.body.style(Small), color = if (look is HomeLook.Midnight) Muted else ink.copy(alpha = .75f),
                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false),
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
private fun Hint(key: @Composable () -> Unit, label: String, modifier: Modifier = Modifier, long: Boolean = false) {
    val look = LocalLook.current
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        key()
        when (look) {
            HomeLook.Midnight -> Text(label, fontSize = Small, maxLines = 1, overflow = TextOverflow.Ellipsis)
            // Long hints use the console's body font: the pixel heading fonts are too wide to fit.
            is HomeLook.Pixel -> ThemedText(label, style = (if (long) look.p.body else look.p.head).style(Small), maxLines = 1, overflow = TextOverflow.Ellipsis)
            is HomeLook.Neon -> ThemedText(label, style = TiltNeon.style(Small).copy(letterSpacing = .06.em), maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun Pill(label: String, accent: Color, onClick: () -> Unit, dot: Color? = null, icon: ImageVector? = null) {
    val look = LocalLook.current
    val shape = if (look is HomeLook.Pixel) RectangleShape else RoundedCornerShape(50)
    val ink = androidx.tv.material3.LocalContentColor.current
    // Pixel: outlined in the bar's ink, filled with the focus colour. Neon: a tube in the second colour.
    val (line, fg, focusBg, focusFg) = when (look) {
        HomeLook.Midnight -> listOf(Color.White.copy(alpha = .18f), Color.White, Color.White, Color(0xFF0B0D12))
        is HomeLook.Pixel -> listOf(ink, ink, look.p.focus, look.p.onAccent)
        is HomeLook.Neon -> listOf(look.n.n2, look.n.n2, look.n.n2, Color.Black)
    }
    Surface(
        onClick = onClick,
        modifier = if (look is HomeLook.Neon) Modifier.drawBehind { softGlow(look.n.n2.copy(alpha = .45f), size.height / 2, .6f * Rem.toPx()) } else Modifier,
        shape = ClickableSurfaceDefaults.shape(shape),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = if (look == HomeLook.Midnight) Color.White.copy(alpha = .06f) else if (look is HomeLook.Neon) NeonColors.strip else Color.Transparent,
            contentColor = fg,
            focusedContainerColor = focusBg, focusedContentColor = focusFg,
        ),
        border = ClickableSurfaceDefaults.border(
            border = Border(BorderStroke(1.dp, line), shape = shape),
            focusedBorder = Border(BorderStroke(1.dp, if (look == HomeLook.Midnight) Color.White else focusBg), shape = shape),
        ),
    ) {
        Row(
            Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            // A status dot (server health) or an icon, then the label.
            if (dot != null) Box(Modifier.size(9.dp).clip(if (look is HomeLook.Pixel) RectangleShape else CircleShape).background(dot))
            if (icon != null) Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp))
            if (look == HomeLook.Midnight) Text(label, fontSize = Small, maxLines = 1)
            else ThemedText(label, style = look.head.style(Small), maxLines = 1)
        }
    }
}
