package app.couch.tv.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Text
import androidx.tv.material3.Typography
import app.couch.tv.R

/**
 * CouchPad brand tokens (docs/brand/identity.md, web twin: packages/design/tokens.css).
 * Common.kt's Accent / Bg / Panel / Muted point at these values.
 */
object Brand {
    /** Logo body, primary buttons, focus ring. Only with Ink text. */
    val Yellow = Color(0xFFF7C948)
    /** Pressed states; yellow text on Cream (20px+ bold). */
    val YellowDeep = Color(0xFFD9A520)
    /** TV background, text on light. Never #000. */
    val Ink = Color(0xFF1C1814)
    /** Text on Ink, sticker border on dark. */
    val Cream = Color(0xFFFFF6E0)
    /** Secondary text on Cream. */
    val Mocha = Color(0xFF7A6F5E)
    /** Secondary text on Ink. */
    val Sand = Color(0xFFB8AE9C)
    /** Borders on Cream, soft text on Ink. */
    val Linen = Color(0xFFE8DCC0)

    /** Dark surfaces are lifted Ink. */
    val InkPanel = Color(0xFF26211B)
    val InkRaised = Color(0xFF312A23)
    val InkLine = Color(0xFF3A332B)
}

/** Fredoka: display, titles and headings (28sp and up only, never paragraphs). SIL OFL 1.1. */
val Fredoka = FontFamily(
    Font(R.font.fredoka_semibold, FontWeight.SemiBold),
    Font(R.font.fredoka_bold, FontWeight.Bold),
)

/** Inter: body and UI text. SIL OFL 1.1. */
val Inter = FontFamily(
    Font(R.font.inter_regular, FontWeight.Normal),
    Font(R.font.inter_medium, FontWeight.Medium),
    Font(R.font.inter_semibold, FontWeight.SemiBold),
    Font(R.font.inter_bold, FontWeight.Bold),
    // ExtraBold/Black requests (used across the UI) resolve to the closest file, Bold.
)

/** TV Material typography with Inter as the body family (sizes stay the Material defaults). */
val BrandTypography: Typography = Typography().let { t ->
    fun TextStyle.inter() = copy(fontFamily = Inter)
    Typography(
        displayLarge = t.displayLarge.inter(), displayMedium = t.displayMedium.inter(), displaySmall = t.displaySmall.inter(),
        headlineLarge = t.headlineLarge.inter(), headlineMedium = t.headlineMedium.inter(), headlineSmall = t.headlineSmall.inter(),
        titleLarge = t.titleLarge.inter(), titleMedium = t.titleMedium.inter(), titleSmall = t.titleSmall.inter(),
        bodyLarge = t.bodyLarge.inter(), bodyMedium = t.bodyMedium.inter(), bodySmall = t.bodySmall.inter(),
        labelLarge = t.labelLarge.inter(), labelMedium = t.labelMedium.inter(), labelSmall = t.labelSmall.inter(),
    )
}

/**
 * The die-cut mark (Cream border, for dark UI), 156:120. Never smaller than the brand's TV minimum,
 * 48px high on a 1080p TV (24dp at the usual TV density).
 */
@Composable
fun BrandMark(height: Dp, modifier: Modifier = Modifier) {
    Image(
        painterResource(R.drawable.cp_mark_on_ink),
        contentDescription = null,
        modifier = modifier.height(maxOf(height, 24.dp)).aspectRatio(156f / 120f),
    )
}

/** The "CouchPad" wordmark in Fredoka Bold; on Ink, "Pad" turns Yellow. */
@Composable
fun BrandWord(fontSize: TextUnit, color: Color = Color.Unspecified, pad: Color = Brand.Yellow) {
    Text(
        buildAnnotatedString {
            append("Couch")
            withStyle(SpanStyle(color = pad)) { append("Pad") }
        },
        fontFamily = Fredoka, fontWeight = FontWeight.Bold, fontSize = fontSize, color = color, maxLines = 1,
    )
}
