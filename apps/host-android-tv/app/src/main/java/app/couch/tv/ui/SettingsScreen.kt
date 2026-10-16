package app.couch.tv.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.Text
import app.couch.tv.CouchApp
import app.couch.tv.library.Systems

private val TV_NAMES = listOf("Living room", "Bedroom", "Game room", "Couch")
private val TIER_LABELS = listOf("Auto", "1 · 8-bit", "2 · 16-bit", "3 · +PS1", "4 · +N64/PSP/NDS", "5 · +PS2")

@Composable
fun SettingsScreen(app: CouchApp, onRemeasure: () -> Unit, onClose: () -> Unit) {
    val s = app.settings
    var version by remember { mutableIntStateOf(0) } // bump to recompose after a change
    val first = remember { FocusRequester() }

    @Composable
    fun Row2(label: String, value: String, hint: String? = null, focus: Boolean = false, onClick: () -> Unit) {
        Button(
            onClick = { onClick(); version++ },
            modifier = Modifier.fillMaxWidth().then(if (focus) Modifier.focusRequester(first) else Modifier),
            shape = ButtonDefaults.shape(RoundedCornerShape(12.dp)),
            colors = ButtonDefaults.colors(containerColor = Color.White.copy(alpha = .06f), contentColor = Color.White),
        ) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(label, fontSize = 18.sp)
                    if (hint != null) Text(hint, fontSize = 13.sp, color = Muted)
                }
                Text(value, fontWeight = FontWeight.Bold, fontSize = 18.sp)
            }
        }
    }

    Box(Modifier.fillMaxSize().background(Color(0xCC04060A)), contentAlignment = Alignment.Center) {
        LazyColumn(
            Modifier.width(820.dp).clip(RoundedCornerShape(24.dp)).background(Panel).padding(28.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item(version) { Text("Settings", fontSize = 32.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 8.dp)) }
            item(version + 1) {
                Row2("TV name", s.hostName, "Shown on phones", focus = true) {
                    s.hostName = TV_NAMES[(TV_NAMES.indexOf(s.hostName) + 1) % TV_NAMES.size]
                    app.session.hostName = s.hostName
                }
            }
            item(version + 2) {
                Row2("Players", "${s.maxPlayers}") {
                    s.maxPlayers = if (s.maxPlayers == 4) 8 else 4
                    app.session.maxPlayers = s.maxPlayers
                }
            }
            item(version + 3) {
                val measured = if (s.measuredTier > 0) "measured tier ${s.measuredTier} (${"%.1f".format(s.measuredRatio)}× slower than a Snapdragon 888)" else "not measured yet"
                Row2("Performance tier", TIER_LABELS[s.tierOverride], "Which systems this device shows · $measured") {
                    s.tierOverride = (s.tierOverride + 1) % TIER_LABELS.size
                }
            }
            item(version + 4) { Row2("Measure this device again", "Run", "10-second CPU benchmark") { onRemeasure() } }
            item(version + 5) {
                Row2("PS2 (experimental)", if (s.ps2Experimental) "On" else "Off", "Needs a Shield-class device or better (ADR-003) and tier 5") {
                    s.ps2Experimental = !s.ps2Experimental
                }
            }
            item(version + 6) { Row2("Box art from the internet", if (s.onlineArt) "On" else "Off", "thumbnails.libretro.com, by file name") { s.onlineArt = !s.onlineArt } }
            item(version + 7) { Row2("Latency overlay in game", if (s.latencyOverlay) "On" else "Off", "Also toggled from the in-game menu") { s.latencyOverlay = !s.latencyOverlay } }
            for (sys in Systems.all.filter { it.android.cores.size > 1 }) {
                item("${version}core${sys.id}") {
                    val current = s.core(sys.id)?.takeIf { it in sys.android.cores } ?: sys.android.cores.first()
                    val installed = if (app.cores.installed(current)) "installed" else "downloads on first use"
                    Row2("${sys.shortName} core", current, installed) {
                        s.setCore(sys.id, sys.android.cores[(sys.android.cores.indexOf(current) + 1) % sys.android.cores.size])
                    }
                }
            }
            item(version + 99) {
                Column(Modifier.padding(top = 12.dp)) {
                    Text("About", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Text(
                        "Couch is free software (GPL-3.0-or-later). Emulator cores are separate programs from the libretro project, downloaded on first use with their own licences; snes9x and Genesis Plus GX are non-commercial. Your ROMs and BIOS files stay on this device.",
                        color = Muted,
                        fontSize = 14.sp,
                    )
                    Text("Room ${app.session.room} · LAN ${app.server.port} · cores for ${app.cores.abi}", color = Muted, fontSize = 13.sp)
                }
            }
            item(version + 100) {
                Button(onClick = onClose, modifier = Modifier.padding(top = 8.dp)) { Text("Done") }
            }
        }
    }
    LaunchedEffect(Unit) { runCatching { first.requestFocus() } }
}
