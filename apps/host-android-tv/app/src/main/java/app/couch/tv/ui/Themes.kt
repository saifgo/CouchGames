package app.couch.tv.ui

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.layout.layout
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.couch.tv.R

/**
 * Home screen themes, ported from the web host (apps/host-web/src/themes/pixel.css and neon.css).
 *
 * RULE: a theme never changes layout. Sizes, paddings and positions come from HomeParts.kt and are
 * the same for every theme and every console. Themes only change colours, fonts (on fixed line
 * heights), backgrounds and frames drawn behind or over a component, which take no space.
 */
enum class ThemeId(val key: String, val label: String) {
    Midnight("midnight", "Midnight"),
    Pixel("pixel", "Arcade Pixel Art"),
    Neon("neon", "Neon Arcade");

    companion object {
        fun of(key: String?): ThemeId = entries.firstOrNull { it.key == key } ?: Midnight
    }
}

/** The web theme's rem at 1080p (1.45 % of the screen height), in dp: frame widths keep their proportion. */
val Rem = 7.83.dp

/** A painter for a background, bar or panel fill. */
typealias Fill = DrawScope.() -> Unit

// ---------- fonts (res/font, SIL OFL; see docs/LICENSES.md) ----------

object ThemeFonts {
    val pressStart = FontFamily(Font(R.font.press_start_2p))
    val vt323 = FontFamily(Font(R.font.vt323))
    val silkscreen = FontFamily(Font(R.font.silkscreen), Font(R.font.silkscreen_bold, FontWeight.Bold))
    @OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)
    val pixelify = FontFamily(
        Font(R.font.pixelify_sans, FontWeight.Normal, variationSettings = FontVariation.Settings(FontVariation.weight(400))),
        Font(R.font.pixelify_sans, FontWeight.Bold, variationSettings = FontVariation.Settings(FontVariation.weight(700))),
    )
    val jersey = FontFamily(Font(R.font.jersey_10))
    val tiltNeon = FontFamily(Font(R.font.tilt_neon))
    val neonderthaw = FontFamily(Font(R.font.neonderthaw))
}

/**
 * A font with the size factor the web gets from `font-size-adjust` (same x-height as the default
 * font), so pixel fonts read at the same size.
 */
@Immutable
data class ThemeFont(val family: FontFamily, val scale: Float)

private val PressStart = ThemeFont(ThemeFonts.pressStart, .67f)
val Vt323 = ThemeFont(ThemeFonts.vt323, 1.3f)
private val Pixelify = ThemeFont(ThemeFonts.pixelify, 1.12f)
private val PixelifyBody = ThemeFont(ThemeFonts.pixelify, 1.15f)
private val Silkscreen = ThemeFont(ThemeFonts.silkscreen, 1f)
private val Jersey = ThemeFont(ThemeFonts.jersey, 1.17f)
val TiltNeon = ThemeFont(ThemeFonts.tiltNeon, 1f)

/**
 * Lines are exactly the line height, whatever the font's own ascent and descent (Compose otherwise
 * keeps a tall font's natural height), so a text box is the same size for every theme font.
 */
val FixedLine = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.None, LineHeightStyle.Mode.Fixed)

/** Line height of the default font (Roboto), so a themed text box is exactly as tall as in Midnight. */
private const val DEFAULT_LINE = 1.172f

/**
 * Style for themed text of [size] (the Midnight size): the theme's font scaled to match, on the
 * Midnight line height (or [lineHeight] when the Midnight text sets one).
 */
fun ThemeFont?.style(size: TextUnit, lineHeight: TextUnit = TextUnit.Unspecified): TextStyle {
    if (this == null) return TextStyle(fontSize = size, lineHeight = lineHeight)
    return TextStyle(
        fontFamily = family,
        fontSize = size * scale,
        lineHeight = if (lineHeight != TextUnit.Unspecified) lineHeight else size * DEFAULT_LINE,
        lineHeightStyle = FixedLine,
    )
}

// ---------- frames ----------

/** One CSS `inset X Y 0 SPREAD colour` band (rem). */
@Immutable
data class Inset(val x: Float, val y: Float, val spread: Float, val color: Color)

/** One CSS `X Y 0 SPREAD colour` ring around a box (rem). */
@Immutable
data class Ring(val x: Float, val y: Float, val spread: Float, val color: Color)

private fun box(o: Offset, s: Size, r: CornerRadius) = Path().apply { addRoundRect(RoundRect(o.x, o.y, o.x + s.width, o.y + s.height, r)) }

/** CSS inset box-shadows (first one on top), inside a box of radius [radius]. */
fun DrawScope.insets(list: List<Inset>, radius: Float = 0f) {
    val rem = Rem.toPx()
    val outer = box(Offset.Zero, size, CornerRadius(radius))
    for (sh in list.asReversed()) {
        val sp = sh.spread * rem
        val hole = box(
            Offset(sh.x * rem + sp, sh.y * rem + sp),
            Size(size.width - 2 * sp, size.height - 2 * sp),
            CornerRadius((radius - sp).coerceAtLeast(0f)),
        )
        drawPath(Path.combine(PathOperation.Difference, outer, hole), sh.color)
    }
}

/** CSS outer box-shadows without blur (first one on top), around a box of radius [radius]. */
fun DrawScope.rings(list: List<Ring>, radius: Float = 0f) {
    val rem = Rem.toPx()
    val inner = box(Offset.Zero, size, CornerRadius(radius))
    for (sh in list.asReversed()) {
        val sp = sh.spread * rem
        val ring = box(Offset(sh.x * rem - sp, sh.y * rem - sp), Size(size.width + 2 * sp, size.height + 2 * sp), CornerRadius(radius + sp))
        drawPath(Path.combine(PathOperation.Difference, ring, inner), sh.color)
    }
}

// ---------- fills (CSS backgrounds) ----------

fun solid(c: Color): Fill = { drawRect(c) }

/**
 * A repeating pattern: one [w] × [h] rem tile is drawn once into a bitmap, then repeated by a shader
 * (drawing every cell of a fine pattern each frame is far too slow on a TV).
 */
fun tiled(w: Float, h: Float, tile: DrawScope.() -> Unit): Fill {
    var cache: Pair<Float, androidx.compose.ui.graphics.ShaderBrush>? = null
    return {
        val rem = Rem.toPx()
        val brush = cache?.takeIf { it.first == rem }?.second ?: run {
            val tw = kotlin.math.max(1, kotlin.math.round(w * rem).toInt())
            val th = kotlin.math.max(1, kotlin.math.round(h * rem).toInt())
            val bmp = androidx.compose.ui.graphics.ImageBitmap(tw, th)
            androidx.compose.ui.graphics.drawscope.CanvasDrawScope().draw(
                this, layoutDirection, androidx.compose.ui.graphics.Canvas(bmp), Size(tw.toFloat(), th.toFloat()), tile,
            )
            androidx.compose.ui.graphics.ShaderBrush(
                androidx.compose.ui.graphics.ImageShader(bmp, androidx.compose.ui.graphics.TileMode.Repeated, androidx.compose.ui.graphics.TileMode.Repeated),
            ).also { cache = rem to it }
        }
        drawRect(brush)
    }
}

/** `repeating-conic-gradient(a 0 25%, b 0 50%)` on a [w] × [h] rem tile: a checkerboard. */
fun checker(a: Color, b: Color, w: Float, h: Float = w): Fill = tiled(w, h) {
    drawRect(b)
    drawRect(a, Offset(size.width / 2, 0f), Size(size.width / 2, size.height / 2))
    drawRect(a, Offset(0f, size.height / 2), Size(size.width / 2, size.height / 2))
}

/** Repeating horizontal bands top to bottom: (colour, height in rem). */
fun bands(vararg b: Pair<Color, Float>): Fill = tiled(1f, b.sumOf { it.second.toDouble() }.toFloat()) {
    val k = size.height / b.sumOf { it.second.toDouble() }.toFloat()
    var y = 0f
    for ((c, h) in b) { if (c.alpha > 0f) drawRect(c, Offset(0f, y), Size(size.width, h * k)); y += h * k }
}

/** Repeating vertical bands left to right: (colour, width in rem). */
fun columns(vararg b: Pair<Color, Float>): Fill = tiled(b.sumOf { it.second.toDouble() }.toFloat(), 1f) {
    val k = size.width / b.sumOf { it.second.toDouble() }.toFloat()
    var x = 0f
    for ((c, w) in b) { if (c.alpha > 0f) drawRect(c, Offset(x, 0f), Size(w * k, size.height)); x += w * k }
}

/** Dots of radius [r] rem at ([cx], [cy]) inside every [w] × [h] rem tile, on [bg]. */
fun dots(bg: Color, dot: Color, r: Float, w: Float, h: Float, cx: Float, cy: Float): Fill = tiled(w, h) {
    val k = size.width / w
    drawRect(bg)
    drawCircle(dot, r * k, Offset(cx * k, cy * k))
}

/** Thin grid lines every [step] rem. */
fun gridLines(bg: Color, line: Color, step: Float): Fill = tiled(step, step) {
    val w = 1.dp.toPx()
    drawRect(bg)
    drawRect(line, Offset.Zero, Size(w, size.height))
    drawRect(line, Offset.Zero, Size(size.width, w))
}

/** Hard colour stops top to bottom: (colour, end fraction). */
fun stops(vararg s: Pair<Color, Float>): Fill = {
    var from = 0f
    for ((c, to) in s) { drawRect(c, Offset(0f, from * size.height), Size(size.width, (to - from) * size.height)); from = to }
}

/** Equal hard-edged colour segments left to right in a strip of [h] rem at the top (or bottom). */
fun colourStrip(colors: List<Color>, h: Float, bottom: Boolean = false): Fill = {
    val hh = h * Rem.toPx(); val w = size.width / colors.size
    val y = if (bottom) size.height - hh else 0f
    colors.forEachIndexed { i, c -> drawRect(c, Offset(i * w, y), Size(w, hh)) }
}

operator fun Fill.plus(other: Fill): Fill = { this@plus(this); other(this) }

private fun c(hex: Long) = Color(hex)
private fun c(hex: Long, a: Float) = Color(hex).copy(alpha = a)
private val FOUR = listOf(c(0xFFE03A3A), c(0xFFF2C81E), c(0xFF2FB36A), c(0xFF3A6FE0))

// ---------- Arcade Pixel Art ----------

/** One console's look in the Arcade Pixel Art theme (pixel.css `.home[data-sys]`). */
@Immutable
class PixelPalette(
    val bg: Color,
    val panel: Fill,
    val line: Color,
    val text: Color,
    val muted: Color,
    val accent: Color,
    val onAccent: Color,
    val focus: Color,
    val head: ThemeFont,
    val body: ThemeFont,
    val title: Color = text,
    val bar: Fill,
    val barInk: Color,
    val strip: Fill,
    val frame: List<Inset>,
    val screen: List<Ring>,
    val backdrop: Fill,
    /** Panel corner radius (rem). */
    val radius: Float = 0f,
    /** Players panel frame when it differs (GBC). */
    val playersFrame: List<Inset>? = null,
    /** Offset shadow under the game title (rem, colour). */
    val titleShadow: Pair<Float, Color>? = null,
    val titleItalic: Boolean = false,
    /** Chrome gradient fill for the title (Genesis). */
    val titleBrush: Brush? = null,
    /** Colour of the console strip's focused stop, when it is a fill instead of a frame. */
    val platformFocusFill: Color? = null,
    val platformSmall: Color? = null,
    val hintsBg: Color? = null,
    val hintsInk: Color? = null,
    /** Game Boy: the preview is shown in the LCD's greens. */
    val lcdPreview: Boolean = false,
)

private val PIXEL_BASE = PixelPalette(
    bg = c(0xFF07060F), panel = solid(c(0xFF0E0C1C)), line = c(0xFF3A3466), text = c(0xFFF4F1FF), muted = c(0xFFA49CC8),
    accent = c(0xFFFF3FA4), onAccent = c(0xFF12001A), focus = c(0xFF3FF0FF), head = PressStart, body = Pixelify,
    bar = solid(c(0xFF0E0C1C)), barInk = c(0xFFF4F1FF), strip = solid(Color.Black),
    frame = listOf(Inset(0f, 0f, .25f, c(0xFF0E0C1C)), Inset(0f, 0f, .5f, c(0xFF3A3466))),
    screen = listOf(Ring(0f, 0f, .25f, Color.Black), Ring(0f, 0f, .5f, c(0xFF3A3466))),
    backdrop = dots(c(0xFF07060F), c(0xFF1C1838), .1f, 1.2f, 1.2f, .1f, .1f),
)

private val PIXEL: Map<String, PixelPalette> = mapOf(
    "nes" to PixelPalette(
        bg = Color.Black, panel = solid(Color.Black), line = c(0xFFFCFCFC), text = c(0xFFFCFCFC), muted = c(0xFFBCBCBC),
        accent = c(0xFFF83800), onAccent = Color.Black, focus = c(0xFFFCFCFC), head = PressStart, body = Vt323,
        bar = solid(c(0xFFBCBCBC)), barInk = Color.Black, strip = solid(c(0xFF1C1C1C)),
        frame = listOf(Inset(0f, 0f, .25f, Color.Black), Inset(0f, 0f, .5f, c(0xFFFCFCFC)), Inset(0f, 0f, .75f, Color.Black)),
        screen = listOf(Ring(0f, 0f, .25f, c(0xFF7C7C7C)), Ring(0f, 0f, .5f, Color.Black)),
        backdrop = dots(Color.Black, c(0xFF3C3C3C), .1f, 2.3f, 1.9f, .1f, .1f),
    ),
    "snes" to PixelPalette(
        bg = c(0xFF18103A),
        panel = stops(c(0xFF3848B8) to .14f, c(0xFF3040A8) to .32f, c(0xFF283898) to .52f, c(0xFF203088) to .72f, c(0xFF182878) to .88f, c(0xFF102068) to 1f),
        line = c(0xFFCFC9E6), text = Color.White, muted = c(0xFFC8C0E8), accent = c(0xFFFFD84A), onAccent = c(0xFF1A1040), focus = Color.White,
        head = Pixelify, body = PixelifyBody, title = Color.White,
        bar = solid(c(0xFFD6D3E2)), barInk = c(0xFF2A2550), strip = solid(c(0xFFB9B4D0)),
        frame = listOf(Inset(0f, 0f, .25f, Color.White), Inset(0f, 0f, .5f, c(0xFF6A64A0))),
        screen = listOf(Ring(0f, 0f, .35f, Color.White), Ring(0f, 0f, .6f, c(0xFF6A64A0))),
        backdrop = solid(c(0xFF18103A)) + checker(c(0xFF221650), c(0xFF1A1040), 3f),
        radius = .6f, platformFocusFill = c(0xFF7B5FC7), platformSmall = c(0xFF5A5490),
    ),
    "genesis" to PixelPalette(
        bg = c(0xFF05060C), panel = solid(c(0xFF0B0D16)), line = c(0xFF3A3F50), text = Color.White, muted = c(0xFF9AA4B8),
        accent = c(0xFFFF2A2A), onAccent = Color.White, focus = c(0xFF2A8CFF), head = PressStart, body = Vt323,
        bar = bands(Color.Black to .4f, c(0xFF14161F) to .1f), barInk = Color.White, strip = solid(Color.Black),
        frame = listOf(Inset(0f, .75f, 0f, c(0xFFFF2A2A)), Inset(0f, 1f, 0f, Color.White)),
        screen = listOf(Ring(0f, 0f, .25f, Color.Black), Ring(0f, 0f, .5f, c(0xFF3A3F50))),
        backdrop = checker(c(0xFF0A1430), c(0xFF05060C), 2f, 1.2f) + {
            drawRect(c(0xFFFF2A2A), Offset(0f, size.height * .6f), Size(size.width, size.height * .004f))
            drawRect(c(0xFFFF2A2A), Offset(0f, size.height * .61f), Size(size.width, size.height * .004f))
        },
        titleItalic = true,
        titleBrush = Brush.verticalGradient(
            0f to Color.White, .35f to Color.White, .35f to c(0xFF8FD0FF), .5f to c(0xFF8FD0FF), .5f to c(0xFF1F6FD1), .62f to c(0xFF1F6FD1),
            .62f to Color.White, .75f to Color.White, .75f to c(0xFFC0C8D8), 1f to c(0xFFC0C8D8),
        ),
    ),
    "gb" to PixelPalette(
        bg = c(0xFF9BBC0F), panel = solid(c(0xFF8BAC0F)), line = c(0xFF0F380F), text = c(0xFF0F380F), muted = c(0xFF306230),
        accent = c(0xFF0F380F), onAccent = c(0xFF9BBC0F), focus = c(0xFF0F380F), head = PressStart, body = Vt323,
        bar = solid(c(0xFF8B8B9B)), barInk = c(0xFF2C2A5A), strip = solid(c(0xFF8BAC0F)),
        frame = listOf(Inset(0f, 0f, .25f, c(0xFF9BBC0F)), Inset(0f, 0f, .5f, c(0xFF306230))),
        screen = listOf(Ring(0f, 0f, .6f, c(0xFF5D5B74)), Ring(0f, 0f, .75f, c(0xFF3A3850))),
        backdrop = checker(c(0xFF8BAC0F), c(0xFF9BBC0F), .5f), lcdPreview = true,
    ),
    "gbc" to PixelPalette(
        bg = c(0xFF5B2AA8), panel = solid(c(0xFFFFF8E8)), line = c(0xFF1A1030), text = c(0xFF1A1030), muted = c(0xFF5A4A7A),
        accent = c(0xFFE0368F), onAccent = Color.White, focus = c(0xFFFFD400), head = Pixelify, body = PixelifyBody, title = c(0xFFE0368F),
        bar = solid(c(0xFF2A1060)), barInk = Color.White, strip = solid(c(0xFF3E1A80)),
        frame = listOf(Inset(0f, 0f, .25f, c(0xFF1A1030)), Inset(0f, -.6f, 0f, c(0xFFFFD400))),
        playersFrame = listOf(Inset(0f, 0f, .25f, c(0xFF1A1030)), Inset(0f, -.6f, 0f, c(0xFF00C8B4))),
        screen = listOf(Ring(0f, 0f, .5f, c(0xFF1A1030)), Ring(0f, 0f, .75f, c(0xFF00C8B4))),
        backdrop = checker(c(0xFF4E2298), c(0xFF5B2AA8), .5f), radius = 1f, platformSmall = c(0xFFE8D8FF),
    ),
    "gba" to PixelPalette(
        bg = c(0xFF2A2370), panel = solid(c(0xFFD9D8EA)), line = c(0xFF1D1748), text = c(0xFF1D1748), muted = c(0xFF56508A),
        accent = c(0xFF4B3FB5), onAccent = Color.White, focus = Color.White, head = Silkscreen, body = Silkscreen,
        bar = solid(c(0xFF1D1748)), barInk = Color.White, strip = solid(c(0xFF1D1748)),
        frame = listOf(Inset(0f, .6f, 0f, Color.White), Inset(0f, -.6f, 0f, c(0xFFA9A7C8))),
        screen = listOf(Ring(0f, 0f, .5f, c(0xFF15123A)), Ring(0f, 0f, .75f, c(0xFF6A62C8))),
        backdrop = bands(c(0xFF251F66) to .5f, c(0xFF2A2370) to .5f), radius = 1f,
        platformFocusFill = c(0xFF4B3FB5), platformSmall = c(0xFFC9C6F0),
    ),
    "psx" to PixelPalette(
        bg = c(0xFF1D2230), panel = solid(c(0xFF2A3040)) + colourStrip(FOUR, .4f), line = c(0xFF8E9AA6), text = c(0xFFEEF0F4), muted = c(0xFF9AA2B4),
        accent = c(0xFFE8E8E8), onAccent = c(0xFF1D2230), focus = Color.White, head = Jersey, body = Vt323,
        bar = solid(c(0xFF8E9AA6)), barInk = c(0xFF1D2230), strip = solid(c(0xFF141824)),
        frame = listOf(Inset(.25f, .25f, 0f, c(0xFF4A5264)), Inset(-.25f, -.25f, 0f, c(0xFF12161F))),
        screen = listOf(Ring(0f, 0f, .35f, Color.Black), Ring(0f, 0f, .5f, c(0xFF8E9AA6))),
        backdrop = dots(c(0xFF1D2230), c(0xFF252B3C), .72f, 7f, 7f, 3.5f, 3.5f),
    ),
    "n64" to PixelPalette(
        bg = c(0xFF16181E),
        panel = {
            drawRect(c(0xFF241F17))
            val step = Rem.toPx()
            val stripe = c(0xFF2A251C)
            // 45° stripes, half a rem each.
            clipRect {
                var x = -size.height
                while (x < size.width) {
                    drawPath(Path().apply { moveTo(x, size.height); lineTo(x + step / 2 * 1.414f, size.height); lineTo(x + step / 2 * 1.414f + size.height, 0f); lineTo(x + size.height, 0f); close() }, stripe)
                    x += step * 1.414f
                }
            }
        },
        line = c(0xFFC89A2A), text = c(0xFFFFF6D8), muted = c(0xFFB8A878), accent = c(0xFFFFCC00), onAccent = c(0xFF2A1A00), focus = c(0xFFFFCC00),
        head = Pixelify, body = PixelifyBody, title = c(0xFFFFCC00),
        bar = solid(c(0xFF0E0F13)) + colourStrip(listOf(c(0xFFE2231A), c(0xFFFFCC00), c(0xFF009C3A), c(0xFF1A4EA8)), .35f, bottom = true),
        barInk = c(0xFFFFF6D8), strip = solid(c(0xFF0E0F13)),
        frame = listOf(Inset(0f, 0f, .25f, c(0xFF5A3E0A)), Inset(0f, 0f, .5f, c(0xFFC89A2A)), Inset(0f, 0f, .75f, c(0xFFFFE08A))),
        screen = listOf(Ring(0f, 0f, .25f, Color.Black), Ring(0f, 0f, .5f, c(0xFFC89A2A))),
        backdrop = checker(c(0xFF1B1D24), c(0xFF16181E), 2f), titleShadow = .25f to c(0xFF6A2A00),
    ),
    "psp" to PixelPalette(
        bg = c(0xFF05070C), panel = solid(c(0xFF05070C, .6f)), line = c(0xFF2A3040), text = Color.White, muted = c(0xFF8A92A4),
        accent = c(0xFF7FD4FF), onAccent = c(0xFF001020), focus = Color.White, head = Silkscreen, body = Vt323,
        bar = solid(c(0xFF05070C)), barInk = Color.White, strip = {},
        frame = listOf(Inset(.25f, 0f, 0f, Color.White)),
        screen = listOf(Ring(0f, 0f, .35f, Color.Black), Ring(0f, 0f, .5f, c(0xFF3A4050))),
        backdrop = solid(c(0xFF05070C)) + {
            // The XMB wave, from the web's 96 × 54 SVG stretched to the screen.
            val sx = size.width / 96f; val sy = size.height / 54f
            fun wave(d: String, col: Color) {
                val p = PathParser().parsePathString(d).toPath()
                p.transform(androidx.compose.ui.graphics.Matrix().apply { scale(sx, sy) })
                drawPath(p, col)
            }
            wave("M0 30h8v-1h8v-1h8v-1h8v1h8v1h8v2h8v1h8v1h8v-1h8v-1h8v-2h8V54H0z", c(0xFF0C1830))
            wave("M0 33h8v-1h8v-1h8v-1h8v1h8v1h8v1h8v2h8v1h8v-1h8v-1h8v-1h8v1H0z", c(0xFF1A3A7A))
        },
    ),
    "nds" to PixelPalette(
        bg = c(0xFFE9EDF2), panel = solid(Color.White), line = c(0xFFA7B3C4), text = c(0xFF2A3240), muted = c(0xFF6A7486),
        accent = c(0xFF2A8AD8), onAccent = Color.White, focus = c(0xFF2A8AD8), head = Silkscreen, body = Silkscreen,
        bar = bands(Color.White to .5f, c(0xFFEEF3F8) to .5f), barInk = c(0xFF2A3240), strip = solid(c(0xFFDBE2EA)),
        frame = listOf(Inset(0f, 4f, 0f, c(0xFFDCEBF8))),
        screen = listOf(Ring(0f, 0f, .35f, c(0xFF2A3240)), Ring(0f, 0f, .6f, c(0xFFC0C8D2))),
        backdrop = gridLines(c(0xFFE9EDF2), c(0xFFDFE5EC), .75f),
    ),
    "ps2" to PixelPalette(
        bg = c(0xFF020818), panel = solid(c(0xFF081A4A)), line = c(0xFF2C4A9A), text = c(0xFFE6F0FF), muted = c(0xFF7F97C8),
        accent = c(0xFF5AC8FF), onAccent = c(0xFF001030), focus = c(0xFF9FE2FF), head = Jersey, body = Vt323, title = c(0xFFBFE8FF),
        bar = solid(c(0xFF040E2A)), barInk = c(0xFFE6F0FF), strip = solid(c(0xFF020818)),
        frame = listOf(Inset(0f, 0f, .25f, c(0xFF0F2A6E))),
        screen = listOf(Ring(0f, 0f, .25f, Color.Black), Ring(0f, 0f, .4f, c(0xFF2C4A9A))),
        backdrop = {
            drawRect(Brush.verticalGradient(0f to c(0xFF0A1E5C), .5f to c(0xFF020818), 1f to c(0xFF020818)))
            // The boot screen's towers along the bottom.
            val top = size.height * .55f
            for ((a, b) in listOf(.04f to .06f, .13f to .15f, .27f to .29f, .44f to .46f, .58f to .60f, .71f to .73f, .86f to .88f)) {
                drawRect(c(0xFF0A2470), Offset(size.width * a, top), Size(size.width * (b - a), size.height - top))
            }
            bands(Color.Transparent to .25f, c(0xFF020818) to .1f)(this)
        },
        titleShadow = .25f to c(0xFF0B2A78),
    ),
    "atari2600" to PixelPalette(
        bg = c(0xFF0A0806), panel = solid(c(0xFF120E0A)), line = c(0xFF3C2C1C), text = c(0xFFF4E2C0), muted = c(0xFFB0946A),
        accent = c(0xFFFF8A1E), onAccent = c(0xFF120E0A), focus = c(0xFFFFD23C), head = PressStart, body = Vt323,
        bar = columns(c(0xFF5A3416) to 1.1f, c(0xFF6C4220) to .8f, c(0xFF4A2A10) to .3f, c(0xFF7A4C26) to 1.5f, c(0xFF5A3416) to .4f),
        barInk = c(0xFFF4E2C0), strip = bands(c(0xFF0E0B08) to .5f, c(0xFF1C1610) to .25f),
        frame = listOf(Inset(0f, .35f, 0f, c(0xFFFFD23C)), Inset(0f, .7f, 0f, c(0xFFFF8A1E)), Inset(0f, 1.05f, 0f, c(0xFFD8401A))),
        screen = listOf(Ring(0f, 0f, .35f, Color.Black), Ring(0f, 0f, .6f, c(0xFF5A3416))),
        backdrop = bands(c(0xFF0A0806) to .4f, c(0xFF120E0A) to .2f),
    ),
    "pce" to PixelPalette(
        bg = c(0xFFF2EFE8), panel = solid(Color.White), line = c(0xFF1C1C1C), text = c(0xFF1C1C1C), muted = c(0xFF6C665C),
        accent = c(0xFFE0561F), onAccent = Color.White, focus = c(0xFFE0561F), head = PressStart, body = Vt323,
        bar = solid(Color.White), barInk = c(0xFF1C1C1C), strip = solid(c(0xFFE4E0D6)),
        frame = listOf(Inset(0f, .6f, 0f, c(0xFFE0561F))),
        screen = listOf(Ring(0f, 0f, .35f, c(0xFF1C1C1C)), Ring(.6f, .6f, .35f, c(0xFFE0561F))),
        backdrop = checker(c(0xFFE6E1D6), c(0xFFF2EFE8), .5f),
        hintsBg = c(0xFF1C1C1C), hintsInk = c(0xFFF2EFE8),
    ),
)

fun pixelPalette(sys: String?): PixelPalette = PIXEL[sys] ?: PIXEL_BASE

// ---------- Neon Arcade ----------

/** One console's tube colours in the Neon Arcade theme (neon.css `.home[data-sys]`). */
@Immutable
data class NeonPalette(val n1: Color, val n2: Color, val ok: Color, val back: Color)

private val NEON_BASE = NeonPalette(c(0xFFFF3FA4), c(0xFF3FF0FF), c(0xFFFF3FA4), c(0xFF3FF0FF))
private val NEON = mapOf(
    "nes" to NeonPalette(c(0xFFFF2B3A), c(0xFFF2F2F2), c(0xFFFF2B3A), c(0xFFFF2B3A)),
    "snes" to NeonPalette(c(0xFFA46BFF), c(0xFFFFD23F), c(0xFFFF3B3B), c(0xFFFFD23F)),
    "genesis" to NeonPalette(c(0xFF2F8BFF), c(0xFFFF2A2A), c(0xFFDFE6F2), c(0xFFDFE6F2)),
    "gb" to NeonPalette(c(0xFF8CFF2E), c(0xFFFF3AA8), c(0xFFFF3AA8), c(0xFFFF3AA8)),
    "gbc" to NeonPalette(c(0xFFB46BFF), c(0xFF00FFD5), c(0xFFFFD400), c(0xFFFFD400)),
    "gba" to NeonPalette(c(0xFF6C5CFF), c(0xFFFF5CE1), c(0xFFC9C6FF), c(0xFFC9C6FF)),
    "psx" to NeonPalette(c(0xFF3A8BFF), c(0xFFFF3A5C), c(0xFF6EA8FF), c(0xFFFF3A5C)),
    "n64" to NeonPalette(c(0xFFFFCC00), c(0xFF2AFF6A), c(0xFF3A6BFF), c(0xFF2AFF6A)),
    "psp" to NeonPalette(c(0xFF7FD4FF), Color.White, c(0xFF6EA8FF), c(0xFFFF3A5C)),
    "nds" to NeonPalette(c(0xFF4AC8FF), c(0xFFE4E8EE), c(0xFFFF3B3B), c(0xFFFFD23F)),
    "ps2" to NeonPalette(c(0xFF2F5CFF), c(0xFF9FB8FF), c(0xFF6EA8FF), c(0xFFFF3A5C)),
    "atari2600" to NeonPalette(c(0xFFFF8A1E), c(0xFFFFD08A), c(0xFFFF3B1E), c(0xFFFFD08A)),
    "pce" to NeonPalette(c(0xFFFF6A1F), Color.White, c(0xFFFF6A1F), c(0xFFFF6A1F)),
    "recent" to NeonPalette(c(0xFF4DD8FF), c(0xFFFF3FA4), c(0xFFFF3FA4), c(0xFF3FF0FF)),
    "fav" to NeonPalette(c(0xFFFFD166), c(0xFFFF3FA4), c(0xFFFF3FA4), c(0xFF3FF0FF)),
)

fun neonPalette(sys: String?): NeonPalette = NEON[sys] ?: NEON_BASE

object NeonColors {
    val panel = Color(0xF00B0A0E)
    val wall = Color(0xFF1B1416)
    val mortar = Color(0xFF0E0A0B)
    val strip = Color(0xF20A090C)
    val muted = Color(0xFFB9B2C4)
    val unlit = Color(0xFF4A3F52)
    val unlitSmall = Color(0xFF5A5060)
}

// ---------- what the home screen is dressed as ----------

/** The home screen's theme and the console it is dressed as (the focused game's, else the selected stop's). */
@Immutable
sealed interface HomeLook {
    val sys: String?

    data object Midnight : HomeLook { override val sys: String? = null }
    data class Pixel(override val sys: String?, val p: PixelPalette) : HomeLook
    data class Neon(override val sys: String?, val n: NeonPalette) : HomeLook

    /** Font for headings and labels (null = the default font). */
    val head: ThemeFont? get() = when (this) { is Pixel -> p.head; is Neon -> TiltNeon; Midnight -> null }
    /** Font for body text. */
    val body: ThemeFont? get() = when (this) { is Pixel -> p.body; is Neon -> TiltNeon; Midnight -> null }

    companion object {
        fun of(theme: ThemeId, sys: String?): HomeLook = when (theme) {
            ThemeId.Midnight -> Midnight
            ThemeId.Pixel -> Pixel(sys, pixelPalette(sys))
            ThemeId.Neon -> Neon(sys, neonPalette(sys))
        }
    }
}

val LocalLook = staticCompositionLocalOf<HomeLook> { HomeLook.Midnight }

/**
 * Game Boy preview in the LCD's greens (the web's grayscale + sepia + hue-rotate filter): the
 * picture's brightness mapped from the darkest green to the lightest.
 */
val LcdGreen: androidx.compose.ui.graphics.ColorFilter = run {
    val dark = floatArrayOf(15f, 56f, 15f)
    val light = floatArrayOf(155f, 188f, 15f)
    val w = floatArrayOf(.299f, .587f, .114f)
    val m = FloatArray(20)
    for (row in 0..2) {
        val span = (light[row] - dark[row]) / 255f
        for (col in 0..2) m[row * 5 + col] = span * w[col]
        m[row * 5 + 4] = dark[row]
    }
    m[18] = 1f
    androidx.compose.ui.graphics.ColorFilter.colorMatrix(androidx.compose.ui.graphics.ColorMatrix(m))
}

/** Switched-off tube: the logo greyed, darker and faint (neon.css `.platform-img`). */
fun unlitFilter(brightness: Float, alpha: Float, grey: Float = 1f): androidx.compose.ui.graphics.ColorFilter {
    val m = androidx.compose.ui.graphics.ColorMatrix().apply { setToSaturation(1f - grey) }
    val v = m.values.copyOf()
    for (row in 0..2) for (col in 0..3) v[row * 5 + col] *= brightness
    v[18] = alpha
    return androidx.compose.ui.graphics.ColorFilter.colorMatrix(androidx.compose.ui.graphics.ColorMatrix(v))
}

/**
 * Text whose box is exactly its line boxes (lines × line height), whatever the font: Compose adds
 * padding to fit a tall font's glyphs, which would make the box taller and move what's below. The
 * glyphs may draw past the box instead (nothing clips them).
 */
@androidx.compose.runtime.Composable
fun ThemedText(
    text: String,
    style: TextStyle,
    modifier: androidx.compose.ui.Modifier = androidx.compose.ui.Modifier,
    color: Color = Color.Unspecified,
    maxLines: Int = Int.MAX_VALUE,
    overflow: androidx.compose.ui.text.style.TextOverflow = androidx.compose.ui.text.style.TextOverflow.Visible,
    /** Neon: a halo of the glyphs in this colour, drawn behind them (Compose clips text shadows to the box). */
    glow: Color? = null,
) {
    // [first line top, line count], from the last text layout (made during measure, just before we read it).
    val lines = androidx.compose.runtime.remember { IntArray(2) }
    val layoutResult = androidx.compose.runtime.remember { arrayOfNulls<androidx.compose.ui.text.TextLayoutResult>(1) }
    val resolver = androidx.compose.ui.platform.LocalFontFamilyResolver.current
    val typeface = if (glow == null) null else androidx.compose.runtime.remember(style.fontFamily, style.fontWeight) {
        resolver.resolve(style.fontFamily, style.fontWeight ?: FontWeight.Normal).value as? android.graphics.Typeface
    }
    androidx.tv.material3.Text(
        text,
        modifier = modifier.then(
            androidx.compose.ui.Modifier.layout { m, c ->
                val p = m.measure(c.copy(minHeight = 0, maxHeight = androidx.compose.ui.unit.Constraints.Infinity))
                val lh = style.lineHeight
                val h = if (lh.isSp && lines[1] > 0) kotlin.math.round(lines[1] * lh.toPx()).toInt() else p.height
                layout(p.width, h.coerceIn(c.minHeight, c.maxHeight)) { p.place(0, -lines[0]) }
            },
        ).then(
            if (glow == null) androidx.compose.ui.Modifier
            else androidx.compose.ui.Modifier.drawBehind { glowText(layoutResult[0] ?: return@drawBehind, text, style, typeface, glow) },
        ),
        color = color,
        style = style,
        maxLines = maxLines,
        overflow = overflow,
        onTextLayout = { r ->
            lines[0] = kotlin.math.round(r.getLineTop(0)).toInt()
            lines[1] = r.lineCount
            layoutResult[0] = r
        },
    )
}

/** Draws each line of [text] blurred in [glow] where the text layout puts it: the neon halo. */
private fun DrawScope.glowText(r: androidx.compose.ui.text.TextLayoutResult, text: String, style: TextStyle, typeface: android.graphics.Typeface?, glow: Color) {
    val rem = Rem.toPx()
    val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        this.typeface = typeface
        textSize = style.fontSize.toPx()
        if (style.letterSpacing.isEm) letterSpacing = style.letterSpacing.value
        this.style = android.graphics.Paint.Style.FILL_AND_STROKE
        strokeWidth = textSize * .06f
    }
    drawIntoCanvas { cv ->
        val c = cv.nativeCanvas
        for (i in 0 until r.lineCount) {
            val start = r.getLineStart(i)
            val end = r.getLineEnd(i, visibleEnd = true)
            if (end <= start) continue
            val s = text.substring(start, end)
            val x = r.getLineLeft(i); val y = r.getLineBaseline(i)
            paint.color = glow.copy(alpha = .9f).toArgb()
            paint.maskFilter = android.graphics.BlurMaskFilter(.9f * rem, android.graphics.BlurMaskFilter.Blur.NORMAL)
            c.drawText(s, x, y, paint)
            paint.maskFilter = android.graphics.BlurMaskFilter(.3f * rem, android.graphics.BlurMaskFilter.Blur.NORMAL)
            c.drawText(s, x, y, paint)
        }
    }
}
