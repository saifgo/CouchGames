package app.couch.tv.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics

/**
 * Arcade Pixel Art theme art, ported from the web host (apps/host-web/src/themes/pixel-art.tsx and
 * the cover shapes in pixel.css). Original drawings, no logos.
 */

private class Sprite(val rows: List<String>, val c: Map<Char, Color>)

private fun col(hex: Long) = Color(hex)

private val SPRITES: Map<String, Sprite> = mapOf(
    "nes" to Sprite(
        listOf("gggggggggggggggg", "gkkkkkkkkkkkkkkg", "gkdkkkkkkkkkkkkg", "gdddkkwwkkrkrkkg", "gkdkkkkkkkkkkkkg", "gkkkkkkkkkkkkkkg", "gggggggggggggggg"),
        mapOf('g' to col(0xFFBCBCBC), 'k' to col(0xFF1C1C1C), 'd' to Color.Black, 'w' to col(0xFF7C7C7C), 'r' to col(0xFFF83800)),
    ),
    "snes" to Sprite(
        listOf("..gggg......gggg..", ".gggggggggggggggg.", "ggdgggggggggggyggg", "gdddggppgpggbgrggg", "ggdgggggggggggaggg", ".gggggggggggggggg.", "..gggg......gggg.."),
        mapOf('g' to col(0xFFC8C6D6), 'd' to col(0xFF3A3850), 'p' to col(0xFF7B5FC7), 'y' to col(0xFFF0C020), 'b' to col(0xFF3050E0), 'r' to col(0xFFE03030), 'a' to col(0xFF30A050)),
    ),
    "genesis" to Sprite(
        listOf("..kkkkkkkkkkkk..", ".kkkkkkkkkkkkkk.", "kkdkkkkkkkkkkkkk", "kdddkkkkkkrrrkkk", "kkdkkkkkkkkkkkkk", ".kkkkkkkkkkkkkk.", "..kkkk....kkkk.."),
        mapOf('k' to col(0xFF2A2C36), 'd' to Color.Black, 'r' to col(0xFFFF2A2A)),
    ),
    "gb" to Sprite(
        listOf("gggggggggg", "gssssssssg", "gsllllllsg", "gsllllllsg", "gsllllllsg", "gssssssssg", "gggggggggg", "gdgggggmmg", "dddggggggg", "gdgggggggg", "gggggggggg"),
        mapOf('g' to col(0xFFC4C4C4), 's' to col(0xFF5D5B74), 'l' to col(0xFF8BAC0F), 'd' to col(0xFF2A2A2A), 'm' to col(0xFFA3195B)),
    ),
    "gbc" to Sprite(
        listOf("pppppppppp", "pssssssssp", "psllllllsp", "psllllllsp", "psllllllsp", "pssssssssp", "pppppppppp", "pdpppppyyp", "dddppppppp", "pdpppppppp", "pppppppppp"),
        mapOf('p' to col(0xFF8A50D8), 's' to col(0xFF1A1030), 'l' to col(0xFF00C8B4), 'd' to col(0xFF1A1030), 'y' to col(0xFFFFD400)),
    ),
    "gba" to Sprite(
        listOf("..iiiiiiiiiiiiii..", ".iiiisssssssssiii.", "iidiisllllllllsiyi", "idddisllllllllsyii", "iidiisllllllllsiii", ".iiiisssssssssiii.", "..iiiiiiiiiiiiii.."),
        mapOf('i' to col(0xFF4B3FB5), 's' to col(0xFF15123A), 'l' to col(0xFF78A0F8), 'd' to col(0xFF1D1748), 'y' to col(0xFFC9C6F0)),
    ),
    "psx" to Sprite(
        listOf("..gggg......gggg..", ".gggggggggggggggg.", "ggdgggggggggggtggg", "gdddggkgkgggsgcggg", "ggdgggggggggggxggg", ".gggggggggggggggg.", "..ggg........ggg.."),
        mapOf('g' to col(0xFFC8CCD4), 'd' to col(0xFF4A5060), 'k' to col(0xFF2A3040), 't' to col(0xFF2FB36A), 'c' to col(0xFFE03A3A), 'x' to col(0xFF3A6FE0), 's' to col(0xFFE070B0)),
    ),
    "n64" to Sprite(
        listOf(".ggggggggggggggg.", "gggrgggggggggyyg", "ggrrrggkkggggyyg", "gggrggkkkkgggbbg", ".ggggggkkgggggg.", "..gg...gg...gg..", "..gg...gg...gg.."),
        mapOf('g' to col(0xFF8A8E98), 'r' to col(0xFFE2231A), 'k' to col(0xFF2E3036), 'y' to col(0xFFFFCC00), 'b' to col(0xFF1A4EA8)),
    ),
    "psp" to Sprite(
        listOf(".kkkkkkkkkkkkkkkkkk.", "kkdkksssssssssskkxkk", "kdddksllllllllskckxk", "kkdkksllllllllskkxkk", "kkkkksssssssssskkkkk", ".kkkkkkkkkkkkkkkkkk."),
        mapOf('k' to col(0xFF1C1E24), 's' to Color.Black, 'l' to col(0xFF2050A0), 'd' to col(0xFF5A6070), 'x' to col(0xFF7FD4FF), 'c' to col(0xFF7FD4FF)),
    ),
    "nds" to Sprite(
        listOf("wwwwwwwwwwww", "wssssssssssw", "wsllllllllsw", "wssssssssssw", "gggggggggggg", "wwwwwwwwwwww", "wdwssssssbww", "dddsllllsbbw", "wdwsllllswww", "wwwsssssswww", "wwwwwwwwwwww"),
        mapOf('w' to col(0xFFE4E8EE), 's' to col(0xFF2A3240), 'l' to col(0xFF88C8F8), 'g' to col(0xFFA7B3C4), 'd' to col(0xFF2A3240), 'b' to col(0xFF2A8AD8)),
    ),
    "ps2" to Sprite(
        listOf("..kkkk......kkkk..", ".kkkkkkkkkkkkkkkk.", "kkdkkkkkkkkkkktkkk", "kdddkkbkbkkkskckkk", "kkdkkkkkkkkkkkxkkk", ".kkkkkkkkkkkkkkkk.", "..kkk........kkk.."),
        mapOf('k' to col(0xFF1A1C24), 'd' to col(0xFF4A5060), 'b' to col(0xFF3A6AD8), 't' to col(0xFF2FB36A), 'c' to col(0xFFE03A3A), 'x' to col(0xFF3A6FE0), 's' to col(0xFFE070B0)),
    ),
    "atari2600" to Sprite(
        listOf("......kk......", "......kk......", "......kk......", "..r...kk......", "kkkkkkkkkkkkkk", "kwwwwwwwwwwwwk", "kkkkkkkkkkkkkk"),
        mapOf('k' to col(0xFF141210), 'r' to col(0xFFD8401A), 'w' to col(0xFFFF8A1E)),
    ),
    "pce" to Sprite(
        listOf("wwwwwwwwwwwwww", "wkkkkkkkkkkkkw", "wkddkkkkkoookw", "wkkkkkkkkkkkkw", "wwwwwwwwwwwwww", "oooooooooooooo"),
        mapOf('w' to col(0xFFFAFAFA), 'k' to col(0xFF2A2A2A), 'd' to col(0xFFBDB8AD), 'o' to col(0xFFE0561F)),
    ),
)

fun hasPixelIcon(system: String): Boolean = system in SPRITES

/** Pixel drawing of a console's controller or handheld, [height] tall, in its own aspect ratio. */
@Composable
fun PixelIcon(system: String, height: Dp, modifier: Modifier = Modifier, description: String? = null) {
    val s = SPRITES[system] ?: return
    val w = s.rows.maxOf { it.length }
    val h = s.rows.size
    val described = if (description != null) modifier.semantics { contentDescription = description } else modifier
    Canvas(described.size(height * w / h, height)) {
        val px = size.height / h
        s.rows.forEachIndexed { y, row ->
            var x = 0
            while (x < row.length) {
                val ch = row[x]
                var end = x + 1
                while (end < row.length && row[end] == ch) end++
                val fill = s.c[ch]
                // Snap to whole pixels so neighbouring rects leave no seams.
                if (ch != '.' && fill != null) {
                    val l = kotlin.math.floor(x * px); val t = kotlin.math.floor(y * px)
                    drawRect(fill, Offset(l, t), Size(kotlin.math.ceil(end * px) - l, kotlin.math.ceil((y + 1) * px) - t))
                }
                x = end
            }
        }
    }
}

// ---------- cover shapes ----------

/** Padding of the cover art inside its media (rem of a 10 rem wide cover): top, right, bottom, left. */
data class MediaPad(val top: Float, val right: Float, val bottom: Float, val left: Float)

/** A console's media around the cover art: cartridge, CD case, UMD, HuCard… */
class Media(
    val pad: MediaPad,
    /** The media body, drawn behind the art. */
    val body: DrawScope.(rem: Float) -> Unit,
    /** Details over the art's edges (label ridges, glare, the UMD hole). */
    val deco: (DrawScope.(rem: Float) -> Unit)? = null,
    /** UMD: the art is a disc. */
    val round: Boolean = false,
)

private fun polygon(vararg p: Pair<Float, Float>): DrawScope.() -> Path = {
    Path().apply {
        p.forEachIndexed { i, (x, y) -> if (i == 0) moveTo(x * size.width, y * size.height) else lineTo(x * size.width, y * size.height) }
        close()
    }
}

/** Bands repeating from the bottom up (CSS `repeating-linear-gradient(0deg, …)`) inside a rect. */
private fun DrawScope.bandsUp(l: Float, t: Float, w: Float, h: Float, vararg b: Pair<Color, Float>) {
    val period = b.sumOf { it.second.toDouble() }.toFloat()
    clipRect(l, t, l + w, t + h) {
        var y = t + h
        while (y > t) {
            var yy = y
            for ((c, s) in b) { if (c.alpha > 0f) drawRect(c, Offset(l, yy - s), Size(w, s)); yy -= s }
            y -= period
        }
    }
}

/** Bands repeating left to right (CSS `repeating-linear-gradient(90deg, …)`) inside a rect. */
private fun DrawScope.bandsRight(l: Float, t: Float, w: Float, h: Float, vararg b: Pair<Color, Float>) {
    val period = b.sumOf { it.second.toDouble() }.toFloat()
    clipRect(l, t, l + w, t + h) {
        var x = l
        while (x < l + w) {
            var xx = x
            for ((c, s) in b) { if (c.alpha > 0f) drawRect(c, Offset(xx, t), Size(s, h)); xx += s }
            x += period
        }
    }
}

/** CSS inset shadows in cover rem units. */
private fun DrawScope.coverInsets(rem: Float, vararg list: Inset) {
    for (sh in list.reversed()) {
        val sp = sh.spread * rem
        val holeL = sh.x * rem + sp; val holeT = sh.y * rem + sp
        val outer = Path().apply { addRect(androidx.compose.ui.geometry.Rect(Offset.Zero, size)) }
        val hole = Path().apply { addRect(androidx.compose.ui.geometry.Rect(holeL, holeT, holeL + size.width - 2 * sp, holeT + size.height - 2 * sp)) }
        drawPath(Path.combine(androidx.compose.ui.graphics.PathOperation.Difference, outer, hole), sh.color)
    }
}

private val HANDHELD_CLIP = polygon(0f to 0f, .86f to 0f, 1f to .07f, 1f to 1f, 0f to 1f)

private fun handheld(bg: Color, ridge: Color, shadows: Array<Inset>) = Media(
    MediaPad(2.2f, .8f, .8f, .8f),
    body = { rem ->
        clipPath(HANDHELD_CLIP()) {
            drawRect(bg)
            coverInsets(rem, *shadows)
        }
    },
    deco = { rem -> bandsUp(.8f * rem, .5f * rem, size.width - 2.4f * rem, 1.2f * rem, ridge to .25f * rem, Color.Transparent to .25f * rem) },
)

private val MEDIA: Map<String, Media> = mapOf(
    "nes" to Media(
        MediaPad(.7f, .7f, 2.6f, .7f),
        body = { rem -> drawRect(col(0xFF7C7C7C)); coverInsets(rem, Inset(-.25f, -.25f, 0f, col(0xFF4C4C4C)), Inset(.25f, .25f, 0f, col(0xFFA4A4A4))) },
        deco = { rem -> bandsUp(.7f * rem, size.height - 2.2f * rem, size.width - 1.4f * rem, 1.6f * rem, col(0xFF4C4C4C) to .25f * rem, Color.Transparent to .25f * rem) },
    ),
    "snes" to Media(
        MediaPad(1f, .8f, 2f, .8f),
        body = { rem ->
            val shape = Path().apply {
                addRoundRect(RoundRect(0f, 0f, size.width, size.height, CornerRadius(1.4f * rem), CornerRadius(1.4f * rem), CornerRadius(.3f * rem), CornerRadius(.3f * rem)))
            }
            clipPath(shape) {
                drawRect(col(0xFFA9A6B8))
                coverInsets(rem, Inset(0f, -.25f, 0f, col(0xFF7E7B90)), Inset(0f, .25f, 0f, col(0xFFCFCCE0)))
            }
        },
        deco = { rem -> bandsUp(1.6f * rem, size.height - 1.5f * rem, size.width - 3.2f * rem, 1f * rem, col(0xFF7E7B90) to .25f * rem, Color.Transparent to .25f * rem) },
    ),
    "genesis" to Media(
        MediaPad(1f, .7f, 2.2f, .7f),
        body = { rem ->
            clipPath(polygon(.1f to 0f, .9f to 0f, 1f to .06f, 1f to 1f, 0f to 1f, 0f to .06f)()) {
                drawRect(col(0xFF101014))
                coverInsets(rem, Inset(.25f, 0f, 0f, col(0xFF2A2C36)))
            }
        },
        deco = { rem -> bandsRight(.7f * rem, size.height - 1.9f * rem, size.width - 1.4f * rem, 1.3f * rem, col(0xFF2A2C36) to .25f * rem, Color.Transparent to .35f * rem) },
    ),
    "gb" to handheld(col(0xFFC4C4C4), col(0xFF8C8C8C), arrayOf(Inset(-.25f, -.25f, 0f, col(0xFF8C8C8C)))),
    "gbc" to handheld(
        Color(0x99AA82FF), Color(0x8CFFFFFF),
        arrayOf(Inset(0f, 0f, .25f, Color(0x99FFFFFF)), Inset(-.5f, -.5f, 0f, Color(0x591E0050))),
    ),
    "gba" to handheld(col(0xFF5C5C66), col(0xFF3C3C44), arrayOf(Inset(-.25f, -.25f, 0f, col(0xFF3C3C44)))),
    "psx" to Media(
        MediaPad(.35f, .35f, .35f, 1.1f),
        body = { rem ->
            drawRect(col(0xFF0C0C10))
            // The jewel case's hinge.
            bandsUp(.25f * rem, .35f * rem, .6f * rem, size.height - .7f * rem, col(0xFF1A1A22) to .35f * rem, col(0xFF2A2A34) to .15f * rem)
        },
        deco = { rem ->
            val l = 1.1f * rem; val t = .35f * rem
            val w = size.width - l - .35f * rem; val h = size.height - .7f * rem
            // Glare on the case's plastic (135°).
            drawRect(
                Brush.linearGradient(
                    0f to Color(0x42FFFFFF), .16f to Color(0x42FFFFFF), .16f to Color.Transparent, .6f to Color.Transparent,
                    .6f to Color(0x1AFFFFFF), .64f to Color(0x1AFFFFFF), .64f to Color.Transparent, 1f to Color.Transparent,
                    start = Offset(l, t), end = Offset(l + w, t + h),
                ),
                Offset(l, t), Size(w, h),
            )
        },
    ),
    "n64" to Media(
        MediaPad(1.6f, .8f, 1.4f, .8f),
        body = { rem ->
            val shape = Path().apply {
                addRoundRect(RoundRect(0f, 0f, size.width, size.height, CornerRadius(2f * rem), CornerRadius(2f * rem), CornerRadius(.25f * rem), CornerRadius(.25f * rem)))
            }
            clipPath(shape) {
                drawRect(col(0xFF4A4D55))
                coverInsets(rem, Inset(0f, .25f, 0f, col(0xFF6A6E78)), Inset(0f, -.25f, 0f, col(0xFF2E3036)))
            }
        },
        deco = { rem -> bandsRight(1.4f * rem, .4f * rem, size.width - 2.8f * rem, .75f * rem, col(0xFF2E3036) to .25f * rem, Color.Transparent to .5f * rem) },
    ),
    "psp" to Media(
        MediaPad(2.45f, .8f, 2.45f, .8f),
        body = { rem ->
            clipPath(polygon(.14f to 0f, .86f to 0f, 1f to .1f, 1f to 1f, 0f to 1f, 0f to .1f)()) {
                drawRect(col(0xFF1C1E24))
                coverInsets(rem, Inset(0f, 0f, .25f, col(0xFF3A3E48)))
            }
        },
        deco = { rem ->
            val ctr = Offset(size.width / 2, size.height / 2)
            drawCircle(col(0xFF1C1E24), .55f * rem, ctr)
            drawCircle(col(0xFF9AA0AC), .55f * rem + .125f * rem, ctr, style = Stroke(.25f * rem))
        },
        round = true,
    ),
    "nds" to Media(
        MediaPad(1.6f, .7f, .7f, .7f),
        body = { clipPath(polygon(0f to .08f, .1f to 0f, 1f to 0f, 1f to 1f, 0f to 1f)()) { drawRect(col(0xFF33363E)) } },
    ),
    "ps2" to Media(
        MediaPad(1.5f, .3f, .3f, .3f),
        body = { rem -> drawRect(col(0xFF163A9A)); coverInsets(rem, Inset(0f, 0f, .25f, col(0xFF0B2470))) },
        deco = { rem -> drawRect(col(0xFFD8DCE6), Offset(.3f * rem, .3f * rem), Size(size.width - .6f * rem, 1.1f * rem)) },
    ),
    "atari2600" to Media(
        MediaPad(.7f, .7f, 3f, .7f),
        body = { rem -> drawRect(col(0xFF141210)); coverInsets(rem, Inset(0f, 0f, .35f, col(0xFF2A2622))) },
        deco = { rem -> bandsUp(.7f * rem, size.height - 2.7f * rem, size.width - 1.4f * rem, 2f * rem, col(0xFF2A2622) to .35f * rem, Color.Transparent to .35f * rem) },
    ),
    "pce" to Media(
        MediaPad(.7f, 2.1f, .7f, .7f),
        body = { rem ->
            clipPath(Path().apply { addRoundRect(RoundRect(0f, 0f, size.width, size.height, CornerRadius(.4f * rem))) }) {
                drawRect(col(0xFFFAFAFA))
                coverInsets(rem, Inset(0f, 0f, .25f, col(0xFFBDB8AD)))
            }
        },
        deco = { rem -> bandsUp(size.width - 1.7f * rem, .9f * rem, 1.2f * rem, size.height - 1.8f * rem, col(0xFFD6A43A) to .35f * rem, Color.Transparent to .25f * rem) },
    ),
)

private val MEDIA_DEFAULT = Media(MediaPad(.6f, .6f, .6f, .6f), body = { drawRect(col(0xFF333333)) })

fun pixelMedia(system: String): Media = MEDIA[system] ?: MEDIA_DEFAULT

/** Padding of the art inside a cover [width] wide (the web cover is 10 rem wide). */
fun Media.padding(width: Dp) = androidx.compose.foundation.layout.PaddingValues(
    start = width * (pad.left / 10f), top = width * (pad.top / 10f), end = width * (pad.right / 10f), bottom = width * (pad.bottom / 10f),
)
