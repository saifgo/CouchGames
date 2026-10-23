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
import app.couch.tv.ProRules
import androidx.compose.runtime.collectAsState
import app.couch.tv.library.RemoteLibrary
import kotlinx.coroutines.launch
import app.couch.tv.library.ServerState
import app.couch.tv.library.Systems
import androidx.compose.foundation.border
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType

private val TV_NAMES = listOf("Living room", "Bedroom", "Game room", "CouchPad")
private val TIER_LABELS = listOf("Auto", "1 · 8-bit", "2 · 16-bit", "3 · +PS1", "4 · +N64/PSP/NDS", "5 · +PS2")

@Composable
fun SettingsScreen(
    app: CouchApp,
    server: ServerState?,
    onServerChanged: () -> Unit,
    onRemeasure: () -> Unit,
    onPro: (String?) -> Unit,
    onAddFolder: () -> Unit,
    onFoldersChanged: () -> Unit,
    onClose: () -> Unit,
) {
    val s = app.settings
    val isPro by app.pro.active.collectAsState()
    val price by app.pro.price.collectAsState()
    var version by remember { mutableIntStateOf(0) } // bump to recompose after a change
    val first = remember { FocusRequester() }
    var editServer by remember { mutableStateOf(false) }

    @Composable
    fun Row2(label: String, value: String, hint: String? = null, focus: Boolean = false, onClick: () -> Unit) {
        Button(
            onClick = { onClick(); version++ },
            modifier = Modifier.fillMaxWidth().then(if (focus) Modifier.focusRequester(first) else Modifier).tappable { onClick(); version++ },
            shape = ButtonDefaults.shape(RoundedCornerShape(12.dp)),
            colors = ButtonDefaults.colors(containerColor = Color.White.copy(alpha = .06f), contentColor = Color.White),
        ) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(label, fontSize = 18.sp)
                    if (hint != null) Text(hint, fontSize = 15.sp, lineHeight = 20.sp, color = androidx.tv.material3.LocalContentColor.current.copy(alpha = .72f))
                }
                Text(value, fontWeight = FontWeight.Bold, fontSize = 18.sp)
            }
        }
    }

    Box(Modifier.fillMaxSize().background(Color(0xCC1C1814)).blockTaps(), contentAlignment = Alignment.Center) {
        LazyColumn(
            Modifier.width(820.dp).clip(RoundedCornerShape(24.dp)).background(Panel).padding(28.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item(version) { Text("Settings", fontSize = 32.sp, fontFamily = Fredoka, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 8.dp)) }
            item("${version}pro$isPro") {
                Row2(
                    "CouchPad Pro",
                    if (isPro) "On" else price ?: "Upgrade",
                    if (isPro) "Up to 8 players, every console, 4 save slots, CouchPad server library" else "One purchase: up to 8 players, every console, more save slots, CouchPad server library",
                    focus = true,
                ) { onPro(null) }
            }
            if (app.pro.debuggable) item("${version}prodebug$isPro") {
                Row2("Pro test switch (debug build)", if (s.proDebug) "On" else "Off", "Turns Pro on without buying. Release builds don't have this row") { app.pro.setDebug(!s.proDebug) }
            }
            item(version + 1) {
                Row2("TV name", s.hostName, "Shown on phones") {
                    s.hostName = TV_NAMES[(TV_NAMES.indexOf(s.hostName) + 1) % TV_NAMES.size]
                    app.session.hostName = s.hostName
                }
            }
            for (tree in app.library.folders.list()) {
                item("${version}folder$tree") {
                    Row2("Game folder", "Remove", app.library.folders.label(tree)) {
                        app.library.folders.remove(tree)
                        onFoldersChanged()
                    }
                }
            }
            item("${version}addfolder") {
                Row2("Add game folder", "Add", "Pick a roms folder (with nes/, snes/… inside) on a USB drive or this TV") { onAddFolder() }
            }
            item("${version}server") {
                Row2(
                    "CouchPad server",
                    s.serverUrl.ifEmpty { "Off" },
                    if (!isPro) "CouchPad Pro: also show the games of a CouchPad server (its roms/ folder or S3 bucket)"
                    else server?.detail ?: "Also show the games of a CouchPad server (its roms/ folder or S3 bucket). Select to set the address.",
                ) { if (isPro) editServer = true else onPro("Games from a CouchPad server need CouchPad Pro") }
            }
            item("${version}players$isPro") {
                if (isPro) {
                    Row2("Players", "${s.maxPlayers}") {
                        s.maxPlayers = if (s.maxPlayers == 4) 8 else 4
                        app.session.maxPlayers = app.players
                    }
                } else {
                    Row2("Players", "${ProRules.FREE_PLAYERS}", "CouchPad Pro: 2 to 8") { onPro("A second player needs CouchPad Pro") }
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
            item(version + 8) {
                val history = app.diagnostics.latencyHistory()
                val last = history.lastOrNull()?.players?.mapNotNull { it.p95 }?.maxOrNull()
                Row2(
                    "Keep anonymous latency history",
                    if (s.telemetry) "On" else "Off",
                    "Per-session lag summaries, no names, stored on this device · ${history.size} sessions" + (last?.let { " · last p95 $it ms" } ?: ""),
                ) { s.telemetry = !s.telemetry }
            }
            item(version + 9) { Row2("Show the welcome tips again", "Show", "Crash reports on this device: ${app.diagnostics.crashCount()}") { s.onboardingDone = false } }
            for (sys in Systems.all.filter { it.android.cores.size > 1 }) {
                item("${version}core${sys.id}") {
                    val current = s.core(sys.id)?.takeIf { it in sys.android.cores } ?: sys.android.cores.first()
                    val installed = if (app.cores.installed(current)) "ready" else "not available on this device"
                    Row2("${sys.shortName} core", current, installed) {
                        s.setCore(sys.id, sys.android.cores[(sys.android.cores.indexOf(current) + 1) % sys.android.cores.size])
                    }
                }
            }
            item(version + 99) {
                Column(Modifier.padding(top = 12.dp)) {
                    Text("About", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Text(
                        "CouchPad is free software (GPL-3.0-or-later); the source is available on request. Emulator cores are separate programs from the libretro project, included with the app under their own licences (all allow commercial use). CouchPad includes no games: play the ones you own. Your ROMs and BIOS files stay on this device.",
                        color = Muted,
                        fontSize = 14.sp,
                    )
                    Text("Room ${app.session.room} · LAN ${app.server.port} · cores for ${app.cores.abi}", color = Muted, fontSize = 13.sp)
                }
            }
            item(version + 100) {
                Button(onClick = onClose, modifier = Modifier.padding(top = 8.dp).tappable(onClick = onClose)) { Text("Done") }
            }
        }
    }
    if (editServer) {
        val save = { url: String ->
            s.serverUrl = url
            editServer = false
            version++
            onServerChanged()
        }
        ServerDialog(
            initial = s.serverUrl,
            // Test before saving; keep the address variant that answered (e.g. without :8787).
            test = { input -> app.remote.connect(input) },
            onSave = save,
            onCancel = { editServer = false },
        )
    }
    LaunchedEffect(Unit) { runCatching { first.requestFocus() } }
}

/** Address entry for the Couch server (TV keyboard or a USB/Bluetooth keyboard). */
@Composable
private fun ServerDialog(initial: String, test: suspend (String) -> Result<String>, onSave: (String) -> Unit, onCancel: () -> Unit) {
    var text by remember { mutableStateOf(initial.ifEmpty { "https://" }) }
    var focused by remember { mutableStateOf(false) }
    var testing by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<String?>(null) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    fun connect() {
        if (RemoteLibrary.normalizeServer(text).isEmpty()) return onSave("")
        testing = true
        problem = null
        scope.launch {
            test(text).fold({ onSave(it) }, { problem = it.message ?: it.javaClass.simpleName })
            testing = false
        }
    }
    val field = remember { FocusRequester() }
    androidx.activity.compose.BackHandler { onCancel() }
    Box(Modifier.fillMaxSize().background(Color(0xE01C1814)).blockTaps(), contentAlignment = Alignment.Center) {
        Column(
            Modifier.width(760.dp).clip(RoundedCornerShape(24.dp)).background(Panel).padding(28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("CouchPad server", fontSize = 28.sp, fontFamily = Fredoka, fontWeight = FontWeight.Bold)
            Text(
                "The address of the TV page you open in a browser, e.g. https://couch.example.com or http://192.168.1.20:8787. " +
                    "Its games (roms/ folder or S3 bucket) appear here and download the first time you play them. Leave empty to turn it off.",
                color = Muted,
                fontSize = 14.sp,
            )
            BasicTextField(
                value = text,
                onValueChange = { text = it },
                singleLine = true,
                textStyle = TextStyle(color = Color.White, fontSize = 22.sp),
                cursorBrush = SolidColor(Color.White),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done, autoCorrectEnabled = false),
                keyboardActions = KeyboardActions(onDone = { connect() }),
                modifier = Modifier.fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color.White.copy(alpha = .08f))
                    .border(2.dp, if (focused) Color.White else Color.White.copy(alpha = .2f), RoundedCornerShape(12.dp))
                    .padding(horizontal = 16.dp, vertical = 12.dp)
                    .focusRequester(field)
                    .onFocusChanged { focused = it.isFocused },
            )
            problem?.let { Text(it, color = Color(0xFFFF9B9B), fontSize = 15.sp) }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = { if (!testing) connect() }, modifier = Modifier.tappable { if (!testing) connect() }) { Text(if (testing) "Connecting…" else "Save & connect") }
                if (problem != null) Button(onClick = { onSave(RemoteLibrary.normalizeServer(text)) }, modifier = Modifier.tappable { onSave(RemoteLibrary.normalizeServer(text)) }) { Text("Save anyway") }
                Button(onClick = { onSave("") }, modifier = Modifier.tappable { onSave("") }) { Text("Turn off") }
                Button(onClick = onCancel, modifier = Modifier.tappable(onClick = onCancel)) { Text("Cancel") }
            }
        }
    }
    LaunchedEffect(Unit) { runCatching { field.requestFocus() } }
}
