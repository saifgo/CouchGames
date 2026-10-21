package app.couch.tv.ui

import android.graphics.BitmapFactory
import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.asAndroidPath
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import android.graphics.BlurMaskFilter
import androidx.annotation.DrawableRes
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Neon Arcade theme art, ported from the web host (apps/host-web/src/themes/neon.css and
 * neon-art.tsx): tube glows, the brick wall, and neon drawings of each console's signature shapes.
 */

private fun glowPaint(color: Color, blur: Float, stroke: Float? = null) = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
    this.color = color.toArgb()
    if (blur > 0f) maskFilter = BlurMaskFilter(blur, BlurMaskFilter.Blur.NORMAL)
    if (stroke != null) { style = android.graphics.Paint.Style.STROKE; strokeWidth = stroke }
}

/**
 * A neon tube around a box (CSS `0 0 0 2px c, 0 0 .6rem 1px c, 0 0 1.6rem 2px c`): the glow is
 * drawn outside the box, the 2 dp tube on its edge. Call before the box's background.
 */
fun DrawScope.tubeGlow(color: Color, radius: Float) {
    val rem = Rem.toPx()
    drawIntoCanvas { cv ->
        val c = cv.nativeCanvas
        val r = radius
        c.drawRoundRect(-2f, -2f, size.width + 2f, size.height + 2f, r + 2f, r + 2f, glowPaint(color.copy(alpha = .9f), 1.6f * rem, 4.dp.toPx()))
        c.drawRoundRect(-1f, -1f, size.width + 1f, size.height + 1f, r + 1f, r + 1f, glowPaint(color, .6f * rem, 3.dp.toPx()))
    }
}

/** The tube itself and its glow on the inside (CSS `inset 0 0 .6rem c`). Call after the box's background. */
fun DrawScope.tubeInner(color: Color, radius: Float) {
    val rem = Rem.toPx()
    drawIntoCanvas { cv ->
        val c = cv.nativeCanvas
        c.save()
        c.clipRect(0f, 0f, size.width, size.height)
        c.drawRoundRect(0f, 0f, size.width, size.height, radius, radius, glowPaint(color.copy(alpha = .8f), .6f * rem, .6f * rem))
        c.restore()
        val w = 2.dp.toPx()
        c.drawRoundRect(w / 2, w / 2, size.width - w / 2, size.height - w / 2, radius, radius, glowPaint(color, 0f, w))
    }
}

/** A plain glow behind a box (QR code, pills). */
fun DrawScope.softGlow(color: Color, radius: Float, blur: Float) {
    drawIntoCanvas { it.nativeCanvas.drawRoundRect(0f, 0f, size.width, size.height, radius, radius, glowPaint(color, blur)) }
}

/**
 * Text lit like a tube: a coloured halo under a white-cored copy. Both copies have the same layout,
 * so the box is exactly as big as a plain [androidx.tv.material3.Text].
 */
@Composable
fun NeonText(
    text: String,
    style: TextStyle,
    glow: Color,
    modifier: Modifier = Modifier,
    color: Color = Color.White,
    maxLines: Int = Int.MAX_VALUE,
    overflow: androidx.compose.ui.text.style.TextOverflow = androidx.compose.ui.text.style.TextOverflow.Visible,
) {
    ThemedText(text, style = style, modifier = modifier, color = color, maxLines = maxLines, overflow = overflow, glow = glow)
}

/**
 * A console logo lit like a sign: the logo over a blurred halo of its own shape in [glow]
 * (CSS `drop-shadow(0 0 2px #fff) drop-shadow(0 0 .45rem c) drop-shadow(0 0 1.2rem c)`).
 */
@Composable
fun GlowLogo(@DrawableRes res: Int, glow: Color, modifier: Modifier, flicker: Boolean = false, description: String? = null) {
    val context = LocalContext.current
    val bmp = remember(res) { BitmapFactory.decodeResource(context.resources, res) }
    // The logo's shape (alpha only), blurred into the halo; made once per logo.
    val shape = remember(bmp) { bmp?.extractAlpha() }
    val alpha = if (flicker) neonFlicker() else 1f
    Canvas(if (description != null) modifier.semantics { contentDescription = description } else modifier) {
        if (bmp == null || shape == null) return@Canvas
        // ContentScale.Fit, centred.
        val k = minOf(size.width / bmp.width, size.height / bmp.height)
        val w = bmp.width * k; val h = bmp.height * k
        val l = (size.width - w) / 2; val t = (size.height - h) / 2
        val dst = android.graphics.RectF(l, t, l + w, t + h)
        drawIntoCanvas { cv ->
            val c = cv.nativeCanvas
            val rem = Rem.toPx()
            val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG or android.graphics.Paint.FILTER_BITMAP_FLAG)
            paint.alpha = (alpha * 255).toInt()
            paint.color = glow.copy(alpha = alpha).toArgb()
            paint.maskFilter = BlurMaskFilter(1.2f * rem, BlurMaskFilter.Blur.NORMAL)
            c.drawBitmap(shape, null, dst, paint)
            paint.maskFilter = BlurMaskFilter(.45f * rem, BlurMaskFilter.Blur.NORMAL)
            c.drawBitmap(shape, null, dst, paint)
            paint.color = Color.White.copy(alpha = .8f * alpha).toArgb()
            paint.maskFilter = BlurMaskFilter(2.dp.toPx(), BlurMaskFilter.Blur.NORMAL)
            c.drawBitmap(shape, null, dst, paint)
            val img = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG or android.graphics.Paint.FILTER_BITMAP_FLAG).apply { this.alpha = (alpha * 255).toInt() }
            c.drawBitmap(bmp, null, dst, img)
        }
    }
}

/** The focused sign's flicker (CSS `neon-flicker`: a dip at 8 % of every 4 s). */
@Composable
fun neonFlicker(): Float {
    if (rememberReduceMotion()) return 1f
    val v by rememberInfiniteTransition(label = "flicker").animateFloat(
        1f, 1f,
        infiniteRepeatable(keyframes { durationMillis = 4000; 1f at 280; .35f at 320; 1f at 360 }),
        label = "flick",
    )
    return v
}

/** A pulse between 0 and 1 (press-play button, CSS `neon-pulse`). */
@Composable
fun neonPulse(periodMs: Int = 1600): Float {
    if (rememberReduceMotion()) return 0f
    val v by rememberInfiniteTransition(label = "pulse").animateFloat(
        0f, 1f, infiniteRepeatable(tween(periodMs / 2), RepeatMode.Reverse), label = "p",
    )
    return v
}

// ---------- wall ----------

/** Bricks: 7.5 × 2.875 rem, every other row offset by half a brick, 0.25 rem mortar (one tile = two rows). */
private val Bricks: Fill = tiled(7.5f, 5.75f) {
    val k = size.width / 7.5f
    val bh = 2.875f * k; val m = .25f * k
    drawRect(NeonColors.wall)
    drawRect(NeonColors.mortar, Offset(0f, bh - m), Size(size.width, m))
    drawRect(NeonColors.mortar, Offset(0f, 2 * bh - m), Size(size.width, m))
    drawRect(NeonColors.mortar, Offset(size.width - m, 0f), Size(m, bh))
    drawRect(NeonColors.mortar, Offset(size.width / 2 - m, bh), Size(m, bh))
}

/** Dark brick wall lit by the signs' colours (neon.css `.backdrop`). */
fun neonWall(n: NeonPalette): Fill = {
    Bricks(this)
    drawRect(Brush.radialGradient(listOf(n.n1.copy(alpha = .2f), Color.Transparent), Offset(size.width * .28f, size.height * .4f), size.width * .55f))
    drawRect(Brush.radialGradient(listOf(n.n2.copy(alpha = .14f), Color.Transparent), Offset(size.width * .82f, size.height * .45f), size.width * .5f))
}

// ---------- console drawings beside the preview ----------

/** One neon element in a 200 × 240 drawing. */
private sealed interface Tube
private class Shape(val color: Color, val d: String, val width: Float = 5f) : Tube
private class Word(val color: Color, val x: Float, val y: Float, val size: Float, val text: String, val italic: Boolean = false, val rotate: Float = 0f) : Tube

private fun col(hex: Long) = Color(hex)
private fun circle(cx: Float, cy: Float, r: Float) = "M${cx - r} ${cy}a$r $r 0 1 0 ${2 * r} 0a$r $r 0 1 0 ${-2 * r} 0z"
private fun rect(x: Float, y: Float, w: Float, h: Float, rx: Float = 0f) =
    if (rx == 0f) "M$x ${y}h${w}v${h}h${-w}z"
    else "M${x + rx} ${y}h${w - 2 * rx}a$rx $rx 0 0 1 $rx ${rx}v${h - 2 * rx}a$rx $rx 0 0 1 ${-rx} ${rx}h${-(w - 2 * rx)}a$rx $rx 0 0 1 ${-rx} ${-rx}v${-(h - 2 * rx)}a$rx $rx 0 0 1 $rx ${-rx}z"

private val PS_SHAPES = listOf(
    Shape(col(0xFF2FE08A), "M55 40 L85 92 L25 92 Z"),
    Shape(col(0xFFFF3A5C), circle(150f, 70f, 28f)),
    Shape(col(0xFF6EA8FF), "M28 140 L82 194 M82 140 L28 194"),
    Shape(col(0xFFFF7AD9), rect(122f, 140f, 56f, 56f, 3f)),
)

/** [left of the screen, right of the screen] per console (neon-art.tsx MOTIFS). */
private val MOTIFS: Map<String, List<List<Tube>>> = mapOf(
    "nes" to listOf(
        listOf(Shape(col(0xFFBCBCBC), "M40 95 h30 v-30 h26 v30 h30 v26 h-30 v30 h-26 v-30 h-30 Z"), Shape(col(0xFFFF2B3A), circle(70f, 205f, 20f) + circle(135f, 205f, 20f))),
        listOf(Shape(col(0xFFBCBCBC), rect(35f, 40f, 130f, 160f, 6f) + rect(55f, 62f, 90f, 80f)), Shape(col(0xFFFF2B3A), "M55 165 h90 M55 180 h90", 4f)),
    ),
    "snes" to listOf(
        listOf(
            Shape(col(0xFF6EA8FF), circle(100f, 55f, 26f)), Shape(col(0xFFFF3B3B), circle(160f, 115f, 26f)),
            Shape(col(0xFFFFD23F), circle(100f, 175f, 26f)), Shape(col(0xFF2FE08A), circle(40f, 115f, 26f)),
            Word(col(0xFF6EA8FF), 100f, 66f, 30f, "X"), Word(col(0xFFFF3B3B), 160f, 126f, 30f, "A"),
            Word(col(0xFFFFD23F), 100f, 186f, 30f, "B"), Word(col(0xFF2FE08A), 40f, 126f, 30f, "Y"),
        ),
        listOf(Shape(col(0xFFB9B4D0), "M30 200 V70 Q30 40 60 40 H140 Q170 40 170 70 V200 Z" + rect(52f, 70f, 96f, 80f)), Shape(col(0xFFA46BFF), "M60 180 h80", 4f)),
    ),
    "genesis" to listOf(
        listOf(Word(col(0xFFFF2A2A), 100f, 110f, 64f, "16", italic = true), Word(col(0xFF2F8BFF), 100f, 170f, 46f, "-BIT", italic = true), Shape(col(0xFFFF2A2A), "M20 200 h160 M35 215 h130", 4f)),
        listOf(
            Shape(col(0xFFDFE6F2), circle(45f, 150f, 22f) + circle(100f, 130f, 22f) + circle(155f, 110f, 22f)),
            Word(col(0xFFDFE6F2), 45f, 160f, 26f, "A"), Word(col(0xFFDFE6F2), 100f, 140f, 26f, "B"), Word(col(0xFFDFE6F2), 155f, 120f, 26f, "C"),
            Shape(col(0xFFFF2A2A), "M30 60 h140", 4f),
        ),
    ),
    "gb" to listOf(
        listOf(
            Shape(col(0xFFC4C4C4), "M40 20 H160 V200 Q160 225 135 225 H40 Z"), Shape(col(0xFF8CFF2E), rect(58f, 40f, 84f, 70f)),
            Shape(col(0xFFFF3AA8), circle(128f, 160f, 11f) + circle(104f, 172f, 11f)), Shape(col(0xFFC4C4C4), "M60 165 h26 M73 152 v26"),
        ),
        listOf(
            Word(col(0xFFFF3AA8), 100f, 60f, 32f, "DOT MATRIX"), Word(col(0xFF8CFF2E), 100f, 100f, 26f, "WITH STEREO"), Word(col(0xFF8CFF2E), 100f, 132f, 26f, "SOUND"),
            Shape(col(0xFFFF2B3A), circle(100f, 172f, 9f)), Word(col(0xFFFF2B3A), 100f, 214f, 24f, "BATTERY"),
        ),
    ),
    "gbc" to listOf(
        listOf(Shape(col(0xFFB46BFF), "M40 20 H160 V200 Q160 225 135 225 H65 Q40 225 40 200 Z"), Shape(col(0xFF00FFD5), rect(58f, 40f, 84f, 70f)), Shape(col(0xFFFFD400), circle(128f, 160f, 11f) + circle(104f, 172f, 11f))),
        listOf(
            Word(col(0xFFFF3B3B), 40f, 130f, 46f, "C"), Word(col(0xFFB46BFF), 70f, 130f, 46f, "O"), Word(col(0xFF2FE08A), 100f, 130f, 46f, "L"),
            Word(col(0xFFFFD400), 130f, 130f, 46f, "O"), Word(col(0xFF3A8BFF), 160f, 130f, 46f, "R"),
        ),
    ),
    "gba" to listOf(
        listOf(Shape(col(0xFF6C5CFF), "M10 90 Q10 60 40 60 H160 Q190 60 190 90 V160 Q190 190 160 190 H40 Q10 190 10 160 Z" + rect(62f, 85f, 76f, 80f)), Shape(col(0xFFC9C6FF), "M20 70 Q30 40 60 42 M180 70 Q170 40 140 42")),
        listOf(
            Shape(col(0xFFC9C6FF), circle(70f, 140f, 26f) + circle(135f, 105f, 26f)),
            Word(col(0xFFC9C6FF), 70f, 151f, 30f, "B"), Word(col(0xFFC9C6FF), 135f, 116f, 30f, "A"), Word(col(0xFFFF5CE1), 100f, 215f, 22f, "L · R"),
        ),
    ),
    "psx" to listOf(PS_SHAPES, listOf(Shape(col(0xFF8E9AA6), circle(100f, 120f, 80f) + circle(100f, 120f, 16f)), Shape(col(0xFF3A8BFF), "M45 80 A70 70 0 0 1 100 50", 4f))),
    "ps2" to listOf(PS_SHAPES, listOf(Shape(col(0xFF2F5CFF), rect(60f, 20f, 80f, 200f, 4f)), Shape(col(0xFF9FB8FF), "M70 70 h60 M70 80 h60 M100 120 v60", 4f))),
    "psp" to listOf(PS_SHAPES, listOf(Shape(col(0xFF7FD4FF), "M40 40 H160 V150 Q160 200 100 200 Q40 200 40 150 Z" + circle(100f, 120f, 34f) + circle(100f, 120f, 8f)))),
    "n64" to listOf(
        listOf(
            Shape(col(0xFFFFCC00), "M100 40 l18 22 h-36 Z M100 140 l18 -22 h-36 Z M50 90 l22 -18 v36 Z M150 90 l-22 -18 v36 Z"),
            Shape(col(0xFF3A6BFF), circle(70f, 190f, 22f)), Shape(col(0xFF2AFF6A), circle(135f, 185f, 18f)),
            Word(col(0xFF3A6BFF), 70f, 200f, 26f, "A"), Word(col(0xFF2AFF6A), 135f, 194f, 22f, "B"),
        ),
        listOf(
            Shape(col(0xFF8E929C), "M20 60 H180 V200 H20 Z" + rect(45f, 90f, 110f, 80f)),
            Shape(col(0xFFFF2A2A), "M30 45 h35", 4f), Shape(col(0xFFFFCC00), "M70 45 h35", 4f), Shape(col(0xFF2AFF6A), "M110 45 h35", 4f), Shape(col(0xFF3A6BFF), "M150 45 h20", 4f),
        ),
    ),
    "nds" to listOf(
        listOf(Shape(col(0xFFE4E8EE), rect(30f, 20f, 140f, 95f, 8f) + rect(30f, 125f, 140f, 95f, 8f)), Shape(col(0xFF4AC8FF), rect(58f, 35f, 84f, 64f) + rect(58f, 140f, 84f, 64f))),
        listOf(Shape(col(0xFFE4E8EE), "M60 210 L150 40", 4f), Word(col(0xFF4AC8FF), 100f, 120f, 28f, "TOUCH!", rotate = -10f)),
    ),
    "atari2600" to listOf(
        listOf(Shape(col(0xFFFF8A1E), rect(40f, 150f, 120f, 70f, 6f) + "M100 150 V50"), Shape(col(0xFFFF3B1E), circle(100f, 40f, 14f) + circle(62f, 170f, 10f))),
        listOf(
            Shape(col(0xFFC8642A), "M20 70 Q60 60 100 72 T180 66 M20 100 Q60 90 100 102 T180 96 M20 130 Q60 120 100 132 T180 126", 4f),
            Shape(col(0xFFFF8A1E), "M20 180 h160 M20 200 h160"),
        ),
    ),
    "pce" to listOf(
        listOf(Shape(Color.White, rect(50f, 40f, 100f, 150f, 10f)), Shape(col(0xFFFF6A1F), "M65 190 v-24 M80 190 v-24 M95 190 v-24 M110 190 v-24 M125 190 v-24", 4f)),
        listOf(Word(col(0xFFFF6A1F), 100f, 110f, 38f, "PC"), Word(Color.White, 100f, 160f, 30f, "ENGINE")),
    ),
)

fun hasNeonMotif(system: String?): Boolean = system in MOTIFS

/** Draws one console drawing ([side] 0 = left, 1 = right) scaled into this canvas (200 × 240 viewBox, centred). */
@Composable
fun NeonMotif(system: String, side: Int, modifier: Modifier) {
    val tubes = MOTIFS[system]?.getOrNull(side) ?: return
    val context = LocalContext.current
    val typeface = remember { androidx.core.content.res.ResourcesCompat.getFont(context, app.couch.tv.R.font.tilt_neon) }
    val paths = remember(system, side) { tubes.map { (it as? Shape)?.let { s -> PathParser().parsePathString(s.d).toPath() } } }
    Canvas(modifier) {
        val k = minOf(size.width / 200f, size.height / 240f)
        val ox = (size.width - 200f * k) / 2; val oy = (size.height - 240f * k) / 2
        drawIntoCanvas { cv ->
            val c = cv.nativeCanvas
            c.save()
            c.translate(ox, oy)
            c.scale(k, k)
            tubes.forEachIndexed { i, t ->
                when (t) {
                    is Shape -> {
                        val p = android.graphics.Path(paths[i]!!.asAndroidPath())
                        val stroke = { color: Color, w: Float, blur: Float ->
                            glowPaint(color, blur, w).apply { strokeCap = android.graphics.Paint.Cap.ROUND; strokeJoin = android.graphics.Paint.Join.ROUND }
                        }
                        c.drawPath(p, stroke(t.color, t.width, 4f))
                        c.drawPath(p, stroke(t.color, t.width, 4f))
                        c.drawPath(p, stroke(t.color, t.width, 0f))
                    }
                    is Word -> {
                        c.save()
                        if (t.rotate != 0f) c.rotate(t.rotate, t.x, t.y)
                        val base = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
                            this.typeface = typeface
                            textSize = t.size
                            textAlign = android.graphics.Paint.Align.CENTER
                            textSkewX = if (t.italic) -.22f else 0f
                        }
                        val glow = android.graphics.Paint(base).apply { color = t.color.toArgb(); maskFilter = BlurMaskFilter(2f, BlurMaskFilter.Blur.NORMAL); style = android.graphics.Paint.Style.FILL_AND_STROKE; strokeWidth = 3f }
                        c.drawText(t.text, t.x, t.y, glow)
                        c.drawText(t.text, t.x, t.y, android.graphics.Paint(base).apply { color = android.graphics.Color.WHITE })
                        c.drawText(t.text, t.x, t.y, android.graphics.Paint(base).apply { color = t.color.toArgb(); style = android.graphics.Paint.Style.STROKE; strokeWidth = 1.5f })
                        c.restore()
                    }
                }
            }
            c.restore()
        }
    }
}

/** Console logo (or name) lit in a sign plate, centred in the top bar. */
@Composable
fun NeonMarquee(system: String, name: String, n: NeonPalette, modifier: Modifier) {
    val logo = systemLogo(system)
    // The tube stutters on when the console changes (CSS `neon-on`).
    val on = remember(system) { Animatable(.2f) }
    val reduce = rememberReduceMotion()
    LaunchedEffect(system) {
        if (reduce) on.snapTo(1f)
        else on.animateTo(1f, keyframes { durationMillis = 500; .2f at 0; 1f at 100; .4f at 175; 1f at 250 })
    }
    Box(
        modifier.drawBehind {
            val rem = Rem.toPx()
            val r = CornerRadius(.9f * rem)
            // Chains the plate hangs from, its drop shadow, the plate and its rim.
            drawRect(Color(0xFF4A4450), Offset(4f * rem, -.5f * rem), Size(2.dp.toPx(), .5f * rem))
            drawRect(Color(0xFF4A4450), Offset(size.width - 4f * rem, -.5f * rem), Size(2.dp.toPx(), .5f * rem))
            drawRoundRect(Color(0xCC000000), Offset(0f, 4.dp.toPx()), size, r)
            drawRoundRect(Color(0xEB0C0A0E), cornerRadius = r)
            drawRoundRect(Color(0xFF2A2430), cornerRadius = r, style = Stroke(2.dp.toPx()))
        },
        contentAlignment = Alignment.Center,
    ) {
        if (logo != null) {
            GlowLogo(logo, n.n1, Modifier.fillMaxSize().padding(horizontal = 18.dp, vertical = 5.dp).graphicsLayer { alpha = on.value })
        } else {
            NeonText(
                name.uppercase(), TiltNeon.style(17.sp).copy(letterSpacing = .08.em), n.n1,
                Modifier.graphicsLayer { alpha = on.value }, maxLines = 1,
            )
        }
    }
}

/** Little bobbing triangle above the focused cover (CSS `neon-bob`), or blinking for Pixel. */
fun DrawScope.arrowAbove(color: Color, topPx: Float, w: Float, h: Float, glow: Boolean) {
    val x = size.width / 2
    val p = Path().apply { moveTo(x - w / 2, topPx); lineTo(x + w / 2, topPx); lineTo(x, topPx + h); close() }
    if (glow) drawIntoCanvas { it.nativeCanvas.drawPath(p.asAndroidPath(), glowPaint(color, .35f * Rem.toPx())) }
    drawPath(p, color)
}

/** Size helper so call sites read in rem. */
fun rem(v: Float): Dp = Rem * v

/** The glow of a horizontal tube at [y] across the whole width (strip and bar edges). */
fun DrawScope.tubeLine(color: Color, y: Float) {
    drawIntoCanvas { it.nativeCanvas.drawLine(0f, y, size.width, y, glowPaint(color.copy(alpha = .8f), .8f * Rem.toPx(), 3.dp.toPx())) }
}
