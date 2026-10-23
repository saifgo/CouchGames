package app.couch.tv

import android.content.ActivityNotFoundException
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.hardware.input.InputManager
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.foundation.layout.size
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.Text
import app.couch.tv.library.Game
import app.couch.tv.library.LoadProgress
import app.couch.tv.library.RemoteLibrary
import app.couch.tv.library.SERVER_ROOT
import app.couch.tv.library.ServerState
import app.couch.tv.library.Systems
import app.couch.tv.net.LanServer
import app.couch.tv.ui.Art
import app.couch.tv.ui.CouchTheme
import app.couch.tv.ui.GameScreen
import app.couch.tv.ui.FreeReminder
import app.couch.tv.ui.HomeRow
import app.couch.tv.ui.HomeScreen
import app.couch.tv.ui.Muted
import app.couch.tv.ui.Panel
import app.couch.tv.ui.PhoneNavigator
import app.couch.tv.ui.blockTaps
import app.couch.tv.ui.tappable
import app.couch.tv.ui.PlayersDialog
import app.couch.tv.ui.ProDialog
import app.couch.tv.ui.SettingsScreen
import app.couch.tv.ui.hexColor
import app.couch.tv.ui.homeHandler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    private val app get() = application as CouchApp
    private lateinit var navigator: PhoneNavigator
    private var deepLinkGame = mutableStateOf<String?>(null)
    /** Bumped when couch://server?url=… sets the Couch server (e.g. from adb), to rescan. */
    private val serverLinks = mutableStateOf(0)
    /** Bumped on every resume (e.g. back from the storage permission dialog). */
    private val resumes = mutableStateOf(0)
    /** Bumped when a game folder is added with the folder picker, to rescan. */
    private val folderAdds = mutableStateOf(0)
    /** This device has no system folder picker (some Android TV builds): explain the alternatives. */
    private val noPicker = mutableStateOf(false)
    private val pickFolder = registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null && runCatching { app.library.folders.add(uri) }.isSuccess) folderAdds.value++
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        navigator = PhoneNavigator(this) { homeHandler?.invoke() }
        app.session.onInput = { p ->
            app.input.apply(p.slot, p.input)
            navigator.feed(p.slot, p.input)
        }
        (getSystemService(INPUT_SERVICE) as InputManager).registerInputDeviceListener(app.gamepads, null)
        handleLink(intent)
        setContent { CouchTheme { Root() } }
    }

    override fun onDestroy() {
        (getSystemService(INPUT_SERVICE) as InputManager).unregisterInputDeviceListener(app.gamepads)
        super.onDestroy()
    }

    /** Game controllers paired with the TV play like phones (see Gamepads); the remote is untouched. */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean = app.gamepads.onKey(event) || super.dispatchKeyEvent(event)

    override fun dispatchGenericMotionEvent(ev: MotionEvent): Boolean = app.gamepads.onMotion(ev) || super.dispatchGenericMotionEvent(ev)

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleLink(intent)
    }

    /** couch://game/<id> (TV home "Continue playing") or couch://server?url=<couch server>. */
    private fun handleLink(intent: Intent?) {
        val data = intent?.data?.takeIf { it.scheme == "couch" } ?: return
        if (data.host == "server") {
            app.settings.serverUrl = RemoteLibrary.normalizeServer(data.getQueryParameter("url").orEmpty())
            serverLinks.value++
        } else {
            deepLinkGame.value = data.lastPathSegment
        }
    }

    /** Android 8–10: the storage permission is missing. Android 11+: no game folder picked yet. */
    private fun needsStoragePermission(): Boolean =
        if (Build.VERSION.SDK_INT >= 30) app.library.folders.list().isEmpty()
        else checkSelfPermission(android.Manifest.permission.READ_EXTERNAL_STORAGE) != android.content.pm.PackageManager.PERMISSION_GRANTED

    private fun requestStorage() {
        if (Build.VERSION.SDK_INT >= 30) addGameFolder()
        else requestPermissions(arrayOf(android.Manifest.permission.READ_EXTERNAL_STORAGE), 1)
    }

    /** Opens the system folder picker (also used from Settings). */
    fun addGameFolder() {
        try {
            pickFolder.launch(null)
        } catch (_: ActivityNotFoundException) {
            noPicker.value = true
        }
    }

    @Composable
    private fun Root() {
        val scope = rememberCoroutineScope()
        var localGames by remember { mutableStateOf<List<Game>>(emptyList()) }
        var serverGames by remember { mutableStateOf<List<Game>>(emptyList()) }
        val games = remember(localGames, serverGames) { localGames + serverGames }
        var serverLoad by remember { mutableStateOf<LoadProgress?>(null) }
        var serverJob by remember { mutableStateOf<Job?>(null) }
        var server by remember { mutableStateOf<ServerState?>(null) }
        var playing by remember { mutableStateOf<Pair<Game, Boolean>?>(null) }
        var detail by remember { mutableStateOf<Game?>(null) }
        var showSettings by remember { mutableStateOf(false) }
        var showPlayers by remember { mutableStateOf(false) }
        var needsPerm by remember { mutableStateOf(needsStoragePermission()) }
        var tick by remember { mutableStateOf(0) }
        var crashed by remember { mutableStateOf(app.diagnostics.takeUncleanExit()) }
        var onboarding by remember { mutableStateOf(!app.settings.onboardingDone) }
        val view by app.session.view.collectAsState()
        val isPro by app.pro.active.collectAsState()
        /** Couch Pro screen: the reason shown on top ("" = opened from Settings), null = closed. */
        var proPrompt by remember { mutableStateOf<String?>(null) }
        /** Game waiting behind the once-a-day Couch Free reminder. */
        var pendingPlay by remember { mutableStateOf<Pair<Game, Boolean>?>(null) }
        val joinUrl = remember(view.room) { LanServer.lanAddress()?.let { "http://$it:${app.server.port}/c/?r=${view.room}" } }

        /** USB / internal storage folders: cheap, rescanned whenever we come back home. */
        fun refreshLocal() = scope.launch {
            needsPerm = needsStoragePermission()
            localGames = withContext(Dispatchers.IO) {
                runCatching { app.library.scan() }
                    .onFailure { Log.e("Couch", "library scan failed", it) }
                    .getOrDefault(emptyList())
            }
            Log.i("Couch", "library: ${localGames.size} local games in ${app.library.roots().map { it.path }}")
            tick++
        }

        /**
         * Games from the Couch server (its roms/ folder or S3 bucket), downloaded on first play.
         * The saved list is used unless [network]: the library rarely changes, so the server is
         * only asked again on Refresh (with [fresh], it also re-lists its storage).
         */
        fun refreshServer(network: Boolean, fresh: Boolean = false) {
            val saved = app.settings.serverUrl
            // The Couch server library is a Pro feature.
            if (saved.isEmpty() || !ProRules.remoteLibrary(app.pro.isPro)) {
                serverJob?.cancel()
                server = null
                serverGames = emptyList()
                serverLoad = null
                return
            }
            if (serverJob?.isActive == true) return
            serverJob = scope.launch {
                if (!network) {
                    val cached = app.remote.saved(saved)
                    if (cached != null) {
                        serverGames = cached.games
                        server = ServerState(cached.server, true, cached.games.size, null, cached.storage, savedAt = cached.at)
                        return@launch
                    }
                }
                serverLoad = LoadProgress(0, Systems.all.size, emptyList(), emptyList())
                val conn = app.remote.connect(saved)
                val url = conn.getOrNull() ?: saved
                // A variant answered (e.g. without Coolify's :8787): remember the address that works.
                if (url != saved) app.settings.serverUrl = url
                val result = conn.fold(
                    { app.remote.load(url, fresh, onProgress = { serverLoad = it }, onGames = { serverGames = it }) },
                    { Result.failure(it) },
                ).onFailure { Log.w("Couch", "server library $url: ${it.message}", it.cause) }
                val failed = serverLoad?.failed?.size ?: 0
                result.onSuccess { serverGames = it }
                // Not reached at all: finish the bar as failed so it doesn't look stuck.
                if (result.isFailure) serverLoad = LoadProgress(Systems.all.size, Systems.all.size, emptyList(), Systems.all.map { it.id })
                server = ServerState(
                    url = url,
                    reachable = result.isSuccess,
                    games = result.getOrNull()?.size ?: serverGames.size,
                    error = result.exceptionOrNull()?.let { it.message ?: it.javaClass.simpleName },
                    storage = if (result.isSuccess) app.remote.storage(url) else null,
                    savedAt = if (result.isSuccess && failed == 0) System.currentTimeMillis() else null,
                    failed = if (result.isSuccess) failed else 0,
                )
                Log.i("Couch", "library: ${serverGames.size} games from $url (${failed} consoles failed)")
                // Keep the finished bar up for a moment so it reads as "done", not "vanished".
                delay(1200)
                serverLoad = null
            }
        }

        fun refresh(network: Boolean = false, fresh: Boolean = false) {
            refreshLocal()
            refreshServer(network, fresh)
        }

        LaunchedEffect(Unit) {
            refresh()
            if (app.settings.measuredTier == 0) measure()
        }
        // Back from the system permission screen: re-check and rescan.
        val resumeCount by resumes
        LaunchedEffect(resumeCount) {
            val before = needsPerm
            needsPerm = needsStoragePermission()
            if (before && !needsPerm) refreshLocal()
        }
        // A folder was picked: rescan, then show the user where the new games went.
        var justAdded by remember { mutableStateOf<Pair<Long, List<Game>>?>(null) }
        val added by folderAdds
        LaunchedEffect(added) {
            if (added == 0) return@LaunchedEffect
            val before = localGames.mapTo(HashSet()) { it.id }
            refreshLocal().join()
            val fresh = localGames.filter { it.id !in before }
            if (fresh.isNotEmpty()) {
                showSettings = false
                justAdded = System.currentTimeMillis() to fresh
            }
        }

        // Pro turned on (bought) or off (refunded): show or hide the server library.
        LaunchedEffect(isPro) { refreshServer(network = false) }

        /** Starts a game, or explains what needs Couch Pro / shows the daily Free reminder first. */
        fun start(g: Game, resume: Boolean) {
            if (!ProRules.systemAllowed(isPro, g.system)) {
                proPrompt = "${Systems.byId(g.system)?.name ?: g.system} games need CouchPad Pro"
                return
            }
            val now = System.currentTimeMillis()
            if (ProRules.shouldNag(isPro, app.settings.lastProNag, now)) {
                app.settings.lastProNag = now
                pendingPlay = g to resume
                return
            }
            playing = g to resume
        }

        val linked by serverLinks
        LaunchedEffect(linked) { if (linked > 0) refresh(network = true) }

        val deep by deepLinkGame
        LaunchedEffect(deep, games) {
            val id = deep ?: return@LaunchedEffect
            games.firstOrNull { it.id == id }?.let { start(it, app.saves.hasAuto(it.id)); deepLinkGame.value = null }
        }

        val s = app.settings
        val playable = games.filter { g ->
            val sys = Systems.byId(g.system) ?: return@filter false
            sys.tier <= s.effectiveTier && (sys.id != "ps2" || s.ps2Experimental)
        }
        val recents = remember(tick) { s.recents() }
        val favs = remember(tick) { s.favourites() }
        // Platform wheel stops: every game, recents, favourites, then one per system (same as the web host).
        val rows = remember(playable, tick, isPro) {
            val byId = playable.associateBy { it.id }
            val byTitle = compareBy<Game> { it.title.lowercase() }
            buildList {
                add(HomeRow("all", "All Games", "All Games", "${playable.size} games", null, playable.sortedWith(byTitle)))
                val recent = recents.mapNotNull { byId[it] }.take(20)
                if (recent.isNotEmpty()) add(HomeRow("recent", "Recent", "Recently Played", "Jump back in", Color(0xFF4DD8FF), recent))
                val fav = playable.filter { it.id in favs }.sortedWith(byTitle)
                if (fav.isNotEmpty()) add(HomeRow("fav", "Favourites", "Favourites", "${fav.size} games", Color(0xFFF7C948), fav))
                for (sys in Systems.all) {
                    val list = playable.filter { it.system == sys.id }.sortedWith(byTitle)
                    val locked = !ProRules.systemAllowed(isPro, sys.id)
                    if (list.isNotEmpty()) add(HomeRow(sys.id, sys.shortName, sys.name, "${sys.maker} · ${sys.year}", hexColor(sys.accent), list, locked))
                }
            }
        }

        val current = playing
        if (current != null) {
            GameScreen(current.first, current.second, navigator) {
                playing = null
                refreshLocal()
            }
            return
        }

        Box(Modifier.fillMaxSize()) {
            HomeScreen(
                rows = rows,
                hiddenCount = games.size - playable.size,
                server = server,
                view = view,
                joinUrl = joinUrl,
                maxPlayers = ProRules.players(isPro, s.maxPlayers),
                free = !isPro,
                onlineArt = s.onlineArt,
                recents = recents,
                favourites = favs,
                needsStoragePermission = needsPerm,
                onGrantStorage = { requestStorage() },
                onOpen = { detail = it },
                onSettings = { showSettings = true },
                onServer = { showSettings = true },
                serverLoad = serverLoad,
                onRefresh = { refresh(network = true, fresh = true) },
                onPlayers = { showPlayers = true },
                justAdded = justAdded,
                overlayOpen = onboarding || showSettings || showPlayers || detail != null || proPrompt != null || pendingPlay != null || noPicker.value || crashed != null,
            )
            if (showPlayers) {
                PlayersDialog(
                    view = view,
                    maxPlayers = ProRules.players(isPro, s.maxPlayers),
                    onSwap = { a, b -> app.session.swapSlots(a, b) },
                    onRemove = { app.session.removePlayer(it) },
                    onTidy = { app.session.tidySlots() },
                ) { showPlayers = false }
            }
            detail?.let { g ->
                GameDetail(g, s.onlineArt, app.saves.hasAuto(g.id), locked = !ProRules.systemAllowed(isPro, g.system), onPlay = { resume -> detail = null; start(g, resume) }, favourite = g.id in favs, onFav = { s.toggleFavourite(g.id); tick++ }) {
                    detail = null
                }
            }
            if (showSettings) {
                BackHandler { showSettings = false }
                SettingsScreen(
                    app, server,
                    onServerChanged = { serverJob?.cancel(); refreshServer(network = true) },
                    onRemeasure = { scope.launch { measure(); tick++ } },
                    onPro = { proPrompt = it.orEmpty() },
                    onAddFolder = { addGameFolder() },
                    onFoldersChanged = { refreshLocal() },
                ) {
                    showSettings = false
                    onboarding = !s.onboardingDone
                    tick++
                }
            }
            crashed?.let { c ->
                Notice(
                    title = "The emulator stopped",
                    text = "CouchPad closed while playing ${c.title} with the ${c.core} core. That core may not support this game or this device.",
                    primary = "Try another core",
                    onPrimary = {
                        Systems.byId(c.system)?.let { sys ->
                            val cores = sys.android.cores
                            s.setCore(sys.id, cores[(cores.indexOf(c.core) + 1).mod(cores.size)])
                        }
                        crashed = null
                    },
                ) { crashed = null }
            }
            if (crashed == null && onboarding && !showSettings) {
                Notice(
                    title = "Welcome to CouchPad",
                    text = "1 · Put your games in roms/<system>/ folders (for example roms/snes/) on a USB drive, then choose \"Add game folder\" and pick the roms folder.\n" +
                        "2 · Scan the QR code with each phone: it becomes the controller, no app needed. Game controllers paired with this TV join with any button.\n" +
                        "3 · In a game, press Home on your phone for save states, controller swaps and quit. If a player leaves, use Players (bottom bar) or Controllers (in-game menu) to swap or remove them.",
                    primary = "Let's play",
                    onPrimary = { s.onboardingDone = true; onboarding = false },
                ) { s.onboardingDone = true; onboarding = false }
            }
            pendingPlay?.let { p ->
                FreeReminder(onPlay = { pendingPlay = null; playing = p }, onSeePro = { pendingPlay = null; proPrompt = "" })
            }
            proPrompt?.let { reason -> ProDialog(reason.ifEmpty { null }) { proPrompt = null } }
            if (noPicker.value) {
                Notice(
                    title = "No folder picker on this TV",
                    text = "This TV has no system folder picker. You can still add games:\n" +
                        "· On a USB drive, put them in Android/data/$packageName/files/roms/<system>/ (CouchPad creates this folder when the drive is plugged in).\n" +
                        "· Or copy them over adb into the same folder on this TV.\n" +
                        "· Or play from a CouchPad server (CouchPad Pro).",
                    primary = "Refresh",
                    onPrimary = { noPicker.value = false; refreshLocal() },
                ) { noPicker.value = false }
            }
        }
    }

    private suspend fun measure() {
        val r = withContext(Dispatchers.Default) { DeviceTier.measure(this@MainActivity) }
        Log.i("Couch", "device tier: $r")
        app.settings.measuredTier = r.tier
        app.settings.measuredRatio = r.ratio.toFloat()
    }

    override fun onResume() {
        super.onResume()
        resumes.value++
    }
}

@Composable
private fun Notice(title: String, text: String, primary: String, onPrimary: () -> Unit, onClose: () -> Unit) {
    val first = remember { FocusRequester() }
    BackHandler { onClose() }
    Box(Modifier.fillMaxSize().background(Color(0xC81C1814)).blockTaps(), contentAlignment = Alignment.Center) {
        Column(Modifier.width(760.dp).clip(RoundedCornerShape(24.dp)).background(Panel).padding(30.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(title, fontSize = 30.sp, fontFamily = app.couch.tv.ui.Fredoka, fontWeight = FontWeight.Bold)
            Text(text, color = Muted, fontSize = 17.sp, lineHeight = 26.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = onPrimary, modifier = Modifier.focusRequester(first).tappable(onClick = onPrimary)) { Text(primary) }
                Button(onClick = onClose, modifier = Modifier.tappable(onClick = onClose)) { Text("Close") }
            }
        }
    }
    LaunchedEffect(Unit) { runCatching { first.requestFocus() } }
}

@Composable
private fun GameDetail(game: Game, onlineArt: Boolean, hasAuto: Boolean, locked: Boolean, favourite: Boolean, onPlay: (Boolean) -> Unit, onFav: () -> Unit, onClose: () -> Unit) {
    val sys = Systems.byId(game.system)!!
    val first = remember { FocusRequester() }
    BackHandler { onClose() }
    Box(Modifier.fillMaxSize().background(Color(0xB81C1814)).blockTaps(), contentAlignment = Alignment.Center) {
        Row(Modifier.width(880.dp).clip(RoundedCornerShape(26.dp)).background(Panel).padding(32.dp), horizontalArrangement = Arrangement.spacedBy(32.dp)) {
            Art(game, onlineArt, Modifier.width(260.dp).padding(0.dp))
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(game.title, fontSize = 38.sp, lineHeight = 44.sp, fontFamily = app.couch.tv.ui.Fredoka, fontWeight = FontWeight.ExtraBold)
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(color = lerp(hexColor(sys.accent), Color.White, .3f), fontWeight = FontWeight.Bold)) { append(sys.name) }
                        append("  ·  ${sys.maker} · ${sys.year} · up to ${sys.maxPlayers} players · ${"%.1f".format(game.size / 1048576.0)} MB")
                    },
                    color = Muted, fontSize = 17.sp,
                )
                Text(
                    when {
                        game.root == SERVER_ROOT -> "From the CouchPad server ${game.remote?.server} · " + (if (game.file.length() == game.size) "downloaded" else "downloads when you play")
                        game.folder != null -> "From a game folder · " + (if (game.file.length() == game.size) "ready" else "copied to this TV when you play")
                        else -> game.file.path
                    },
                    color = Muted,
                    fontSize = 15.sp,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(top = 10.dp)) {
                    if (locked) {
                        Button(onClick = { onPlay(false) }, modifier = Modifier.focusRequester(first).tappable { onPlay(false) }) { ButtonIcon(Icons.Rounded.Lock); Text("Unlock with CouchPad Pro", fontSize = 20.sp) }
                    } else {
                        if (hasAuto) Button(onClick = { onPlay(true) }, modifier = Modifier.focusRequester(first).tappable { onPlay(true) }) { ButtonIcon(Icons.Rounded.PlayArrow); Text("Continue", fontSize = 20.sp) }
                        Button(onClick = { onPlay(false) }, modifier = (if (hasAuto) Modifier else Modifier.focusRequester(first)).tappable { onPlay(false) }) {
                            if (!hasAuto) ButtonIcon(Icons.Rounded.PlayArrow)
                            Text(if (hasAuto) "Start over" else "Play", fontSize = 20.sp)
                        }
                    }
                    Button(onClick = onFav, modifier = Modifier.tappable(onClick = onFav)) {
                        ButtonIcon(if (favourite) Icons.Rounded.Star else Icons.Rounded.StarBorder)
                        Text("Favourite")
                    }
                    Button(onClick = onClose, modifier = Modifier.tappable(onClick = onClose)) { Text("Back") }
                }
            }
        }
    }
    LaunchedEffect(Unit) { runCatching { first.requestFocus() } }
}

/** Leading icon in a button, sized to its label. */
@Composable
private fun ButtonIcon(icon: androidx.compose.ui.graphics.vector.ImageVector) {
    androidx.tv.material3.Icon(icon, contentDescription = null, modifier = Modifier.padding(end = 8.dp).size(22.dp))
}
