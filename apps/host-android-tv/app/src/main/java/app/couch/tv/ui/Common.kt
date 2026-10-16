package app.couch.tv.ui

import android.graphics.Bitmap
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ColorScheme
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
import kotlin.math.abs

val Accent = Color(0xFFFFD166)
val Bg = Color(0xFF07090D)
val Panel = Color(0xFF12161F)
val Muted = Color(0xFF95A0B4)
val Good = Color(0xFF2ED47A)
val Ok = Color(0xFFFFC83D)
val Bad = Color(0xFFFF5D6C)

private val scheme: ColorScheme = darkColorScheme(
    primary = Accent,
    onPrimary = Color(0xFF1A1405),
    background = Bg,
    surface = Panel,
    onSurface = Color(0xFFEEF2F8),
    border = Accent,
)

@Composable
fun CouchTheme(content: @Composable () -> Unit) = MaterialTheme(colorScheme = scheme) {
    CompositionLocalProvider(LocalContentColor provides Color(0xFFEEF2F8), content = content)
}

fun hexColor(s: String): Color = runCatching { Color(android.graphics.Color.parseColor(s)) }.getOrDefault(Color.Gray)

fun qrBitmap(text: String, size: Int = 512): ImageBitmap {
    val m = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size, mapOf(EncodeHintType.MARGIN to 1, EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M))
    val bmp = Bitmap.createBitmap(m.width, m.height, Bitmap.Config.ARGB_8888)
    for (y in 0 until m.height) for (x in 0 until m.width) bmp.setPixel(x, y, if (m[x, y]) 0xFF07090D.toInt() else 0xFFFFFFFF.toInt())
    return bmp.asImageBitmap()
}

/** Generated cover art in the system's colours (used when no online art is found). */
@Composable
fun GeneratedArt(game: Game, modifier: Modifier = Modifier) {
    val sys = Systems.byId(game.system)
    val hue = (abs(game.title.hashCode()) % 360).toFloat()
    Box(
        modifier
            .clip(RoundedCornerShape(14.dp))
            .background(Brush.linearGradient(listOf(hexColor(sys?.accent ?: "#333333"), Color.hsl(hue, 0.45f, 0.22f), Bg))),
    ) {
        Column(Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.SpaceBetween) {
            Text(sys?.shortName ?: "", color = Color.White.copy(alpha = .8f), fontWeight = FontWeight.ExtraBold, fontSize = 12.sp)
            Text(game.title, color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, maxLines = 4, overflow = TextOverflow.Ellipsis)
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

@Composable
fun PlayerChip(p: PlayerView, detailed: Boolean = false) {
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = .06f)).padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.size(28.dp).clip(CircleShape).background(hexColor(p.color)), contentAlignment = Alignment.Center) {
            Text(p.name.take(1).uppercase(), fontWeight = FontWeight.Black, color = Color.White)
        }
        Column {
            Text("P${p.slot + 1} · ${p.name}", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = if (p.connected) Color.White else Muted)
            if (detailed) {
                val lag = if (p.oneWayP50.isNaN()) "…" else "${p.oneWayP50.toInt()}–${p.oneWayP95.toInt()} ms lag"
                Text(if (p.connected) "${TransportKind.label(p.transport)} · $lag" else "reconnecting…", fontSize = 12.sp, color = Muted)
            }
        }
        Box(Modifier.size(9.dp).clip(CircleShape).background(quality(p)))
    }
}
