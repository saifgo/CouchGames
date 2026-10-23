package app.couch.tv.ui

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.Text
import app.couch.tv.CouchApp
import app.couch.tv.ProRules

private val PRO_FEATURES = listOf(
    "Multiplayer, up to 8 players" to "CouchPad Free has 1 phone or controller slot",
    "Every console" to "Adds Game Boy Advance, PlayStation, Nintendo 64, PSP, Nintendo DS and PS2 (where this TV can run them)",
    "4 save-state slots per game" to "CouchPad Free has ${ProRules.FREE_SAVE_SLOTS}, plus the automatic save when you quit",
    "Games from a CouchPad server" to "Play the library on your own server or S3 bucket",
    "No reminders" to "No CouchPad Free badge or upgrade card",
)

/**
 * The Couch Pro screen. [reason] says what the user just tried ("N64 games need Couch Pro"),
 * or null when opened from Settings.
 */
@Composable
fun ProDialog(reason: String?, onClose: () -> Unit) {
    val app = LocalContext.current.applicationContext as CouchApp
    val activity = LocalContext.current as? Activity
    val active by app.pro.active.collectAsState()
    val price by app.pro.price.collectAsState()
    val status by app.pro.status.collectAsState()
    val first = remember { FocusRequester() }
    BackHandler { onClose() }
    LaunchedEffect(Unit) { app.pro.refresh() }
    Box(Modifier.fillMaxSize().background(Color(0xE01C1814)).blockTaps(), contentAlignment = Alignment.Center) {
        Column(
            Modifier.width(820.dp).clip(RoundedCornerShape(24.dp)).background(Panel).padding(32.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(if (active) "CouchPad Pro is on" else "CouchPad Pro", fontSize = 32.sp, fontFamily = Fredoka, fontWeight = FontWeight.Bold)
            when {
                active -> Text("Thanks for supporting CouchPad. Everything below is unlocked on this TV.", color = Muted, fontSize = 17.sp)
                reason != null -> Text(reason, color = Accent, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                else -> Text("One purchase, yours for good. No subscription, no ads.", color = Muted, fontSize = 17.sp)
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 6.dp)) {
                for ((title, detail) in PRO_FEATURES) {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        androidx.tv.material3.Icon(androidx.compose.material.icons.Icons.Rounded.Check, contentDescription = null, tint = Accent, modifier = Modifier.size(22.dp))
                        Column {
                            Text(title, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                            Text(detail, color = Muted, fontSize = 15.sp)
                        }
                    }
                }
            }
            status?.takeIf { !active }?.let { Text(it, color = Color(0xFFFFC37A), fontSize = 15.sp) }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (active) {
                    Button(onClick = onClose, modifier = Modifier.focusRequester(first).tappable(onClick = onClose)) { Text("Let's play") }
                } else {
                    Button(onClick = { activity?.let { app.pro.buy(it) } }, modifier = Modifier.focusRequester(first).tappable { activity?.let { app.pro.buy(it) } }) {
                        Text(price?.let { "Unlock Pro · $it" } ?: "Unlock Pro", fontSize = 18.sp)
                    }
                    Button(onClick = { app.pro.refresh() }, modifier = Modifier.tappable { app.pro.refresh() }) { Text("Restore purchase") }
                    Button(onClick = onClose, modifier = Modifier.tappable(onClick = onClose)) { Text("Not now") }
                }
            }
        }
    }
    LaunchedEffect(active) { runCatching { first.requestFocus() } }
}

/** Shown before a game at most once a day on Couch Free. Play stays the focused, default choice. */
@Composable
fun FreeReminder(onPlay: () -> Unit, onSeePro: () -> Unit) {
    val first = remember { FocusRequester() }
    BackHandler { onPlay() }
    Box(Modifier.fillMaxSize().background(Color(0xC81C1814)).blockTaps(), contentAlignment = Alignment.Center) {
        Column(Modifier.width(700.dp).clip(RoundedCornerShape(24.dp)).background(Panel).padding(30.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("You're playing CouchPad Free", fontSize = 28.sp, fontFamily = Fredoka, fontWeight = FontWeight.Bold)
            Text(
                "CouchPad Pro opens up to 8 players, every console, more save slots and your CouchPad server library. One purchase, no subscription.",
                color = Muted,
                fontSize = 17.sp,
                lineHeight = 26.sp,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = onPlay, modifier = Modifier.focusRequester(first).tappable(onClick = onPlay)) { androidx.tv.material3.Icon(androidx.compose.material.icons.Icons.Rounded.PlayArrow, contentDescription = null, modifier = Modifier.padding(end = 8.dp).size(20.dp)); Text("Play") }
                Button(onClick = onSeePro, modifier = Modifier.tappable(onClick = onSeePro)) { Text("See CouchPad Pro") }
            }
        }
    }
    LaunchedEffect(Unit) { runCatching { first.requestFocus() } }
}
