package app.couch.tv.ui

import android.view.KeyEvent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.Text
import app.couch.tv.CouchApp
import app.couch.tv.library.Game
import app.couch.tv.library.Systems
import app.couch.tv.protocol.MenuAction
import app.couch.tv.protocol.TransportKind
import com.swordfish.libretrodroid.GLRetroView.GLRetroEvents
import com.swordfish.libretrodroid.GLRetroView
import com.swordfish.libretrodroid.GLRetroViewData
import com.swordfish.libretrodroid.ShaderConfig
import com.swordfish.libretrodroid.Variable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.DateFormat
import java.util.Date

/** Core options so analog pads and multitaps behave (mirrors the web host's coreOptions). */
private fun coreVariables(system: String, players: Int): Array<Variable> = when (system) {
    "psx" -> (1..8).map { Variable("pcsx_rearmed_pad${it}type", "analog") }.toTypedArray() +
        arrayOf(Variable("pcsx_rearmed_multitap", if (players > 2) "port 1 only" else "disabled"))
    "nes" -> if (players > 2) arrayOf(Variable("fceumm_nes_four_score", "enabled")) else emptyArray()
    // Same defaults as Lemuroid (also on LibretroDroid); the threaded GLideN64 renderer
    // aborts inside LibretroDroid's GL context handling.
    "n64" -> arrayOf(
        Variable("mupen64plus-43screensize", "320x240"),
        Variable("mupen64plus-FrameDuping", "True"),
        Variable("mupen64plus-ThreadedRenderer", "False"),
        Variable("mupen64plus-EnableShadersStorage", "False"),
        Variable("mupen64plus-EnableCopyColorToRDRAM", "Off"),
        // parallel_n64: hardware GL renderer + dynarec (its default is the software RDP).
        Variable("parallel-n64-gfxplugin", "glide64"),
        Variable("parallel-n64-cpucore", "dynamic_recompiler"),
        Variable("parallel-n64-framerate", "original"),
    )
    else -> emptyArray()
}

private enum class Page { MAIN, SAVE, LOAD, PLAYERS }

@Composable
fun GameScreen(game: Game, resume: Boolean, navigator: PhoneNavigator, onExit: () -> Unit) {
    val app = LocalContext.current.applicationContext as CouchApp
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    val sys = Systems.byId(game.system)!!
    val core = app.settings.core(sys.id)?.takeIf { it in sys.android.cores } ?: sys.android.cores.first()
    var corePath by remember { mutableStateOf<String?>(null) }
    var progress by remember { mutableStateOf(0f) }
    var error by remember { mutableStateOf<String?>(null) }
    var view by remember { mutableStateOf<GLRetroView?>(null) }
    var menu by remember { mutableStateOf<Page?>(null) }
    var toast by remember { mutableStateOf<String?>(null) }
    var overlay by remember { mutableStateOf(app.settings.latencyOverlay) }
    var swapFrom by remember { mutableStateOf<Int?>(null) }
    var slots by remember { mutableStateOf(app.saves.slots(game.id)) }
    var fps by remember { mutableStateOf(0.0) }
    val session by app.session.view.collectAsState()

    fun flash(msg: String) {
        toast = msg
        scope.launch {
            delay(2500)
            if (toast == msg) toast = null
        }
    }

    fun broadcastState() = app.session.setHostState(if (menu != null) "menu" else "game", menu != null, slots.keys.sorted())

    fun openMenu() {
        app.input.releaseAll()
        app.input.enabled = false
        view?.onPause()
        menu = Page.MAIN
        navigator.enabled = true
        broadcastState()
    }

    fun closeMenu() {
        menu = null
        swapFrom = null
        navigator.enabled = false
        view?.onResume()
        app.input.enabled = true
        broadcastState()
    }

    suspend fun save(slot: String) {
        val v = view ?: return
        val paused = menu != null
        val bytes = withContext(Dispatchers.IO) { runCatching { v.serializeState(useEmulationThread = !paused) }.getOrNull() }
        if (bytes == null) {
            flash("Save failed")
            return
        }
        withContext(Dispatchers.IO) { app.saves.write(game.id, slot, bytes) }
        slots = app.saves.slots(game.id)
        if (slot != "auto") flash("Saved to slot ${slot.removePrefix("slot").toInt() + 1}")
    }

    suspend fun load(slot: Int) {
        val v = view ?: return
        val bytes = withContext(Dispatchers.IO) { app.saves.read(game.id, "slot$slot") } ?: return
        val ok = withContext(Dispatchers.IO) { v.unserializeState(bytes, useEmulationThread = menu == null) }
        flash(if (ok) "Loaded slot ${slot + 1}" else "Load failed")
        if (ok) closeMenu()
    }

    suspend fun quit() {
        save("auto")
        view?.let { v -> withContext(Dispatchers.IO) { runCatching { app.saves.sramFile(game.id).writeBytes(v.serializeSRAM(useEmulationThread = menu == null)) } } }
        app.saves.publishWatchNext(game, sys.name)
        onExit()
    }

    // 1) Make sure the core is installed (first use downloads it from the libretro buildbot).
    LaunchedEffect(core) {
        runCatching { app.cores.ensure(core) { progress = it } }
            .onSuccess { corePath = it }
            .onFailure { error = "Could not get the $core core: ${it.message}. Connect the TV to the internet once, or side-load the core (see roms/README.md)." }
    }

    // 2) Phones → emulator, Home button → menu, phone menu actions.
    DisposableEffect(Unit) {
        app.settings.touchRecent(game.id)
        app.session.setSkin(sys.skin, game.title)
        navigator.enabled = false
        app.input.reset()
        app.input.enabled = true
        app.session.onMenu = { _, action, arg ->
            scope.launch {
                when (action) {
                    MenuAction.OPEN -> openMenu()
                    MenuAction.RESUME -> closeMenu()
                    MenuAction.SAVE_STATE -> save("slot$arg")
                    MenuAction.LOAD_STATE -> load(arg)
                    MenuAction.RESET -> { view?.reset(useEmulationThread = menu == null); closeMenu() }
                    MenuAction.QUIT -> quit()
                }
            }
        }
        val prevJoin = app.session.onJoinLeave
        app.session.onJoinLeave = { p, joined -> scope.launch { flash(if (joined) "P${p.slot + 1} ${p.name} joined" else "P${p.slot + 1} ${p.name} disconnected") } }
        onDispose {
            app.session.onMenu = null
            app.session.onJoinLeave = prevJoin
            app.input.view = null
            app.session.setSkin("modern", null)
            app.session.setHostState("library", false, emptyList())
            navigator.enabled = true
        }
    }

    BackHandler(enabled = true) {
        when (menu) {
            null -> openMenu()
            Page.MAIN -> closeMenu()
            else -> menu = Page.MAIN
        }
    }

    Box(
        Modifier.fillMaxSize().background(Color.Black).onPreviewKeyEvent {
            // Remote "menu" / L key shortcuts.
            if (it.nativeKeyEvent.action == KeyEvent.ACTION_DOWN && it.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_L) {
                overlay = !overlay; true
            } else false
        },
    ) {
        val path = corePath
        // Once created, the emulator view stays until we leave the screen: tearing it down
        // while its GL thread runs (e.g. on an error) crashes the process.
        if (path != null) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    val data = GLRetroViewData(ctx).apply {
                        coreFilePath = path
                        gameFilePath = game.file.absolutePath
                        systemDirectory = app.library.systemDir().absolutePath
                        savesDirectory = app.saves.sramFile(game.id).parentFile!!.absolutePath
                        variables = coreVariables(sys.id, app.settings.maxPlayers)
                        saveRAMState = app.saves.sramFile(game.id).takeIf { it.exists() }?.readBytes()
                        shader = ShaderConfig.Default
                        preferLowLatencyAudio = true
                        rumbleEventsEnabled = true
                    }
                    GLRetroView(ctx, data).also { v ->
                        lifecycleOwner.lifecycle.addObserver(v)
                        view = v
                        app.input.view = v
                        // Apply whatever phones are holding right now.
                        app.session.players.forEach { p -> p?.let { app.input.apply(it.slot, it.input) } }
                    }
                },
                onRelease = { v ->
                    lifecycleOwner.lifecycle.removeObserver(v)
                    v.onDestroy()
                },
            )
            LaunchedEffect(view) {
                val v = view ?: return@LaunchedEffect
                launch {
                    v.getGLRetroErrors().collect { code ->
                        android.util.Log.w("Couch", "LibretroDroid error $code (core $core, ${game.file.name})")
                        error = "The core reported error $code. This game may need BIOS files or a different core (Settings → ${sys.shortName} core)."
                    }
                }
                launch {
                    var last = 0
                    v.getRumbleEvents().collect { r ->
                        val strong = (r.strengthStrong * 255).toInt()
                        val key = strong * 256 + (r.strengthWeak * 255).toInt()
                        if (key != last) app.session.rumble(r.port, strong, (r.strengthWeak * 255).toInt(), 250)
                        last = key
                    }
                }
                launch {
                    // Frame counter for the overlay + logcat (M4 performance tiers).
                    var frames = 0
                    var t0 = System.nanoTime()
                    v.getGLRetroEvents().collect { e ->
                        if (e !is GLRetroEvents.FrameRendered) return@collect
                        frames++
                        val dt = (System.nanoTime() - t0) / 1e9
                        if (dt >= 5) {
                            fps = frames / dt
                            android.util.Log.i("Couch", "fps ${"%.1f".format(fps)} system=${sys.id} core=$core")
                            frames = 0
                            t0 = System.nanoTime()
                        }
                    }
                }
                v.getGLRetroEvents().first { it is GLRetroEvents.FrameRendered }
                if (resume) app.saves.read(game.id, "auto")?.let { bytes -> withContext(Dispatchers.IO) { v.unserializeState(bytes) } }
                broadcastState()
            }
        }
        if (path == null && error == null) {
            Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Getting the ${sys.shortName} emulator ($core)…", fontSize = 22.sp)
                Text("${(progress * 100).toInt()} %  · licence: see Settings → About", color = Muted)
            }
        }

        error?.let { msg ->
            val focus = remember { FocusRequester() }
            Column(Modifier.align(Alignment.Center).width(700.dp).clip(RoundedCornerShape(20.dp)).background(Panel).padding(28.dp)) {
                Text("Couldn’t start ${game.title}", fontSize = 26.sp, fontWeight = FontWeight.Bold)
                Text(msg, color = Muted, modifier = Modifier.padding(vertical = 12.dp))
                Button(onClick = onExit, modifier = Modifier.focusRequester(focus)) { Text("Back to library") }
            }
            LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
        }

        if (overlay) {
            Column(Modifier.align(Alignment.BottomStart).padding(16.dp).clip(RoundedCornerShape(8.dp)).background(Color(0xB8000000)).padding(10.dp)) {
                Text("${sys.shortName} · $core · ${"%.1f".format(fps)} fps", fontFamily = FontFamily.Monospace, fontSize = 13.sp)
                session.players.forEach { p ->
                    Text(
                        "P${p.slot + 1} ${p.name}: ${TransportKind.label(p.transport)} · rtt ${fmt(p.rttMs)} · 1-way p50 ${fmt(p.oneWayP50)} / p95 ${fmt(p.oneWayP95)} ms · jitter ${fmt(p.jitterMs)} · loss ${"%.1f".format(p.lossPct)}%",
                        color = hexColor(p.color),
                        fontFamily = FontFamily.Monospace,
                        fontSize = 13.sp,
                    )
                }
            }
        }

        menu?.let { page ->
            val first = remember(page) { FocusRequester() }
            Column(
                Modifier.fillMaxSize().background(Color(0xD905070B)),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(game.title, fontSize = 28.sp, fontWeight = FontWeight.Bold)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 8.dp)) { session.players.forEach { PlayerChip(it) } }
                Column(Modifier.width(520.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    val item: @Composable (String, Boolean, Boolean, () -> Unit) -> Unit = { label, isFirst, enabled, action ->
                        Button(
                            onClick = action,
                            enabled = enabled,
                            modifier = Modifier.fillMaxWidth().then(if (isFirst) Modifier.focusRequester(first) else Modifier),
                            shape = ButtonDefaults.shape(RoundedCornerShape(12.dp)),
                        ) { Text(label, fontSize = 18.sp) }
                    }
                    when (page) {
                        Page.MAIN -> {
                            item("▶  Resume", true, true) { closeMenu() }
                            item("Save state", false, true) { menu = Page.SAVE }
                            item("Load state", false, slots.isNotEmpty()) { menu = Page.LOAD }
                            item("Controllers", false, true) { menu = Page.PLAYERS }
                            item(if (overlay) "Hide latency overlay" else "Show latency overlay", false, true) { overlay = !overlay }
                            item("Reset game", false, true) { view?.reset(useEmulationThread = false); closeMenu() }
                            item("Quit to library", false, true) { scope.launch { quit() } }
                        }
                        Page.SAVE, Page.LOAD -> for (i in 0 until 4) {
                            val at = slots[i]
                            val label = "Slot ${i + 1}" + (at?.let { "  ·  " + DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(it)) } ?: "  ·  empty")
                            item(label, i == 0, page == Page.SAVE || at != null) { scope.launch { if (page == Page.SAVE) save("slot$i") else load(i) } }
                        }
                        Page.PLAYERS -> {
                            Text(if (swapFrom == null) "Pick a player to move, then the slot to swap with." else "Swap P${swapFrom!! + 1} with…", color = Muted)
                            for (i in 0 until app.settings.maxPlayers) {
                                val p = session.players.firstOrNull { it.slot == i }
                                item("P${i + 1}: ${p?.let { it.name + if (it.connected) "" else " (away)" } ?: "empty"}", i == 0, true) {
                                    val from = swapFrom
                                    if (from == null) swapFrom = i else {
                                        app.session.swapSlots(from, i)
                                        swapFrom = null
                                    }
                                }
                            }
                        }
                    }
                }
            }
            LaunchedEffect(page) { runCatching { first.requestFocus() } }
        }
        toast?.let {
            Text(
                it,
                Modifier.align(Alignment.BottomCenter).padding(24.dp).clip(RoundedCornerShape(50)).background(Color(0xE60A0C12)).padding(horizontal = 22.dp, vertical = 10.dp),
                fontSize = 18.sp,
            )
        }

    }
    // Phone Home button toggles the menu.
    DisposableEffect(navigator) {
        val open = { if (menu == null) openMenu() else closeMenu() }
        homeHandler = open
        onDispose { homeHandler = null }
    }
}

/** Set while a game runs: what the phones' Home button does. */
var homeHandler: (() -> Unit)? = null

private fun fmt(v: Double) = if (v.isNaN()) "–" else "%.1f".format(v)
