package app.couch.tv.ui

import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.PhoneAndroid
import androidx.compose.material.icons.rounded.PhoneIphone
import androidx.compose.material.icons.rounded.SportsEsports
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.composed
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.platform.LocalDensity
import androidx.tv.material3.ColorScheme
import androidx.tv.material3.Icon
import androidx.tv.material3.LocalContentColor
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import androidx.tv.material3.darkColorScheme
import app.couch.tv.library.Game
import app.couch.tv.library.Systems
import app.couch.tv.net.PlayerView
import app.couch.tv.protocol.TransportKind
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel

val Accent = Color(0xFFF7C948)
val Bg = Color(0xFF1C1814)
val Panel = Color(0xFF26211B)
val Muted = Color(0xFFB8AE9C)
val Good = Color(0xFF2ED47A)
val Ok = Color(0xFFFFC83D)
val Bad = Color(0xFFFF5D6C)

private val scheme: ColorScheme = darkColorScheme(
    primary = Accent,
    onPrimary = Color(0xFF1C1814),
    background = Bg,
    surface = Panel,
    onSurface = Color(0xFFFFF6E0),
    border = Accent,
)

/** The UI is laid out for the Android TV canvas: every TV, 1080p or 4K, reports 960x540dp. */
private const val CanvasW = 960f
private const val CanvasH = 540f

@Composable
fun CouchTheme(content: @Composable () -> Unit) = MaterialTheme(colorScheme = scheme, typography = BrandTypography) {
    CompositionLocalProvider(LocalContentColor provides Color(0xFFFFF6E0)) { FitToCanvas(content) }
}

/**
 * Scales the TV layout to the screen so phones and tablets get the same picture, smaller or
 * larger, instead of clipped panels. The scale fits the short side of the canvas, so the layout
 * always has at least 960x540dp and the longer side just gets extra room. TVs get scale 1.
 */
@Composable
private fun FitToCanvas(content: @Composable () -> Unit) = BoxWithConstraints(Modifier.fillMaxSize()) {
    val scale = minOf(maxWidth.value / CanvasW, maxHeight.value / CanvasH)
    val density = LocalDensity.current
    if (scale.isNaN() || scale <= 0f || kotlin.math.abs(scale - 1f) < 0.02f) {
        content()
    } else {
        CompositionLocalProvider(
            LocalDensity provides Density(density.density * scale, density.fontScale),
            content = content,
        )
    }
}

/**
 * TV Material buttons only answer the remote's OK key. This lets a finger tap focus and click
 * them too, for when the app runs on a phone or tablet. Pass the same action as `onClick`.
 */
fun Modifier.tappable(enabled: Boolean = true, onClick: () -> Unit): Modifier = composed {
    val focus = remember { FocusRequester() }
    val click by rememberUpdatedState(onClick)
    focusRequester(focus).pointerInput(enabled) {
        if (enabled) detectTapGestures { runCatching { focus.requestFocus() }; click() }
    }
}

/** For dialog backdrops: swallows taps so they don't reach the screen underneath. */
fun Modifier.blockTaps(): Modifier = pointerInput(Unit) { detectTapGestures { } }

/** True when the system "Remove animations" setting is on (animator duration scale 0). */
@Composable
fun rememberReduceMotion(): Boolean {
    val context = androidx.compose.ui.platform.LocalContext.current
    return androidx.compose.runtime.remember {
        android.provider.Settings.Global.getFloat(context.contentResolver, android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
}

fun hexColor(s: String): Color = runCatching { Color(android.graphics.Color.parseColor(s)) }.getOrDefault(Color.Gray)

fun qrBitmap(text: String, size: Int = 512): ImageBitmap {
    val m = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size, mapOf(EncodeHintType.MARGIN to 1, EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M))
    val bmp = Bitmap.createBitmap(m.width, m.height, Bitmap.Config.ARGB_8888)
    for (y in 0 until m.height) for (x in 0 until m.width) bmp.setPixel(x, y, if (m[x, y]) 0xFF1C1814.toInt() else 0xFFFFFFFF.toInt())
    return bmp.asImageBitmap()
}

/** Background of the default covers (packages/systems/scripts/build-covers.ts COVER_BG). */
val CoverBg = Color(0xFF26211B)

/**
 * The console's default Couch cover (res/drawable-nodpi/cover_<system>.png, made by `pnpm covers`),
 * used when a game has no box art. [contain] shows it whole in a 4:3 screenshot slot, centred on
 * the cover's own background.
 */
@Composable
fun DefaultCover(game: Game, modifier: Modifier = Modifier, shape: Shape = RoundedCornerShape(14.dp), contain: Boolean = false) {
    val cover = systemCover(game.system)
    Box(modifier.clip(shape).background(CoverBg), contentAlignment = Alignment.Center) {
        if (cover != null) {
            androidx.compose.foundation.Image(
                androidx.compose.ui.res.painterResource(cover),
                contentDescription = null,
                contentScale = if (contain) androidx.compose.ui.layout.ContentScale.Fit else androidx.compose.ui.layout.ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Text(Systems.byId(game.system)?.shortName ?: "", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp, maxLines = 1)
        }
    }
}

fun quality(p: PlayerView): Color = when {
    !p.connected -> Color.Gray
    p.oneWayP95.isNaN() -> Good
    p.oneWayP95 <= 20 -> Good
    p.oneWayP95 <= 40 -> Ok
    else -> Bad
}

/** What the player holds: a game controller paired with the TV, an iPhone or an Android phone. */
fun deviceIcon(p: PlayerView): ImageVector = when {
    p.local -> Icons.Rounded.SportsEsports
    p.ios -> Icons.Rounded.PhoneIphone
    else -> Icons.Rounded.PhoneAndroid
}

fun deviceLabel(p: PlayerView): String = when {
    p.local -> "TV controller"
    p.ios -> "iPhone"
    else -> "Android phone"
}

@Composable
fun DeviceIcon(p: PlayerView, size: Dp, tint: Color = Color(0xFF1C1814)) {
    Icon(deviceIcon(p), contentDescription = deviceLabel(p), tint = tint, modifier = Modifier.size(size))
}

@Composable
fun PlayerChip(p: PlayerView, detailed: Boolean = false) {
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = .06f)).padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.size(28.dp).clip(CircleShape).background(hexColor(p.color)), contentAlignment = Alignment.Center) {
            DeviceIcon(p, 18.dp)
        }
        Column {
            Text("P${p.slot + 1} · ${p.name}", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = if (p.connected) Color.White else Muted)
            if (detailed) {
                val lag = if (p.oneWayP50.isNaN()) "…" else "${p.oneWayP50.toInt()}–${p.oneWayP95.toInt()} ms lag"
                Text(
                    when {
                        !p.connected -> "reconnecting…"
                        p.local -> "TV controller"
                        else -> "${TransportKind.label(p.transport)} · $lag"
                    },
                    fontSize = 12.sp, color = Muted,
                )
            }
        }
        Box(Modifier.size(9.dp).clip(CircleShape).background(quality(p)))
    }
}

/** The CouchPad mark (die-cut, on Ink) and the wordmark, as on the web host and the store icon. */
@Composable
fun Logo(height: Dp = 22.dp, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(height * .4f)) {
        BrandMark(height)
        BrandWord(fontSize = (height.value * .9f).sp)
    }
}
