package app.couch.tv

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings as AndroidSettings
import android.util.Log
import android.hardware.input.InputManager
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.Text
import app.couch.tv.library.Game
import app.couch.tv.library.RemoteLibrary
import app.couch.tv.library.SERVER_ROOT
import app.couch.tv.library.ServerState
import app.couch.tv.library.Systems
import app.couch.tv.net.LanServer
import app.couch.tv.ui.Art
import app.couch.tv.ui.CouchTheme
import app.couch.tv.ui.GameScreen
import app.couch.tv.ui.HomeRow
import app.couch.tv.ui.HomeScreen
import app.couch.tv.ui.Muted
import app.couch.tv.ui.Panel
import app.couch.tv.ui.PhoneNavigator
import app.couch.tv.ui.PlayersDialog
import app.couch.tv.ui.SettingsScreen
import app.couch.tv.ui.hexColor
import app.couch.tv.ui.homeHandler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {
    private val app get() = application as CouchApp
    private lateinit var navigator: PhoneNavigator
    private var deepLinkGame = mutableStateOf<String?>(null)
    /** Bumped when couch://server?url=… sets the Couch server (e.g. from adb), to rescan. */
    private val serverLinks = mutableStateOf(0)
    /** Bumped on every resume (e.g. back from the "All files access" settings page). */
    private val resumes = mutableStateOf(0)

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

    private fun needsStoragePermission(): Boolean =
        if (Build.VERSION.SDK_INT >= 30) !Environment.isExternalStorageManager()
        else checkSelfPermission(android.Manifest.permission.READ_EXTERNAL_STORAGE) != android.content.pm.PackageManager.PERMISSION_GRANTED

    private fun requestStorage() {
        if (Build.VERSION.SDK_INT >= 30) {
            val i = Intent(AndroidSettings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:$packageName"))
            runCatching { startActivity(i) }.onFailure { runCatching { startActivity(Intent(AndroidSettings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)) } }
        } else {
            requestPermissions(arrayOf(android.Manifest.permission.READ_EXTERNAL_STORAGE), 1)
        }
    }

    @Composable
    private fun Root() {
        val scope = rememberCoroutineScope()
        var games by remember { mutableStateOf<List<Game>>(emptyList()) }
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
        val joinUrl = remember(view.room) { LanServer.lanAddress()?.let { "http://$it:${app.server.port}/c/?r=${view.room}" } }

        fun refresh() = scope.launch {
            needsPerm = needsStoragePermission()
            val local = withContext(Dispatchers.IO) {
                runCatching { app.library.scan() }
                    .onFailure { Log.e("Couch", "library scan failed", it) }
                    .getOrDefault(emptyList())
            }
            // Games from the Couch server (its roms/ folder or S3 bucket), downloaded on first play.
            val url = app.settings.serverUrl
            val remote = if (url.isEmpty()) null else app.remote.fetch(url).onFailure { Log.w("Couch", "server library $url: ${it.message}") }
            server = if (url.isEmpty()) null else ServerState(
                url = url,
                reachable = remote!!.isSuccess,
                games = remote.getOrNull()?.size ?: 0,
                error = remote.exceptionOrNull()?.let { it.message ?: it.javaClass.simpleName },
                storage = if (remote.isSuccess) app.remote.storage(url) else null,
            )
            games = local + remote?.getOrNull().orEmpty()
            Log.i("Couch", "library: ${local.size} local games in ${app.library.roots().map { it.path }}, ${server?.games ?: 0} from ${url.ifEmpty { "no server" }}")
            tick++
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
            if (before && !needsPerm) refresh()
        }

        val linked by serverLinks
        LaunchedEffect(linked) { if (linked > 0) refresh() }

        val deep by deepLinkGame
        LaunchedEffect(deep, games) {
            val id = deep ?: return@LaunchedEffect
            games.firstOrNull { it.id == id }?.let { playing = it to app.saves.hasAuto(it.id); deepLinkGame.value = null }
        }

        val s = app.settings
        val playable = games.filter { g ->
            val sys = Systems.byId(g.system) ?: return@filter false
            sys.tier <= s.effectiveTier && (sys.id != "ps2" || s.ps2Experimental)
        }
        val recents = remember(tick) { s.recents() }
        val favs = remember(tick) { s.favourites() }
        // Platform wheel stops: every game, recents, favourites, then one per system (same as the web host).
        val rows = remember(playable, tick) {
            val byId = playable.associateBy { it.id }
            val byTitle = compareBy<Game> { it.title.lowercase() }
            buildList {
                add(HomeRow("all", "All Games", "All Games", "${playable.size} games", null, playable.sortedWith(byTitle)))
                val recent = recents.mapNotNull { byId[it] }.take(20)
                if (recent.isNotEmpty()) add(HomeRow("recent", "Recent", "Recently Played", "Jump back in", Color(0xFF4DD8FF), recent))
                val fav = playable.filter { it.id in favs }.sortedWith(byTitle)
                if (fav.isNotEmpty()) add(HomeRow("fav", "Favourites", "Favourites", "${fav.size} games", Color(0xFFFFD166), fav))
                for (sys in Systems.all) {
                    val list = playable.filter { it.system == sys.id }.sortedWith(byTitle)
                    if (list.isNotEmpty()) add(HomeRow(sys.id, sys.shortName, sys.name, "${sys.maker} · ${sys.year}", hexColor(sys.accent), list))
                }
            }
        }

        val current = playing
        if (current != null) {
            GameScreen(current.first, current.second, navigator) {
                playing = null
                refresh()
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
                maxPlayers = s.maxPlayers,
                onlineArt = s.onlineArt,
                recents = recents,
                favourites = favs,
                needsStoragePermission = needsPerm,
                onGrantStorage = { requestStorage() },
                onOpen = { detail = it },
                onSettings = { showSettings = true },
                onServer = { showSettings = true },
                onRefresh = { refresh() },
                onPlayers = { showPlayers = true },
            )
            if (showPlayers) {
                PlayersDialog(
                    view = view,
                    maxPlayers = s.maxPlayers,
                    onSwap = { a, b -> app.session.swapSlots(a, b) },
                    onRemove = { app.session.removePlayer(it) },
                    onTidy = { app.session.tidySlots() },
                ) { showPlayers = false }
            }
            detail?.let { g ->
                GameDetail(g, s.onlineArt, app.saves.hasAuto(g.id), onPlay = { resume -> detail = null; playing = g to resume }, onFav = { s.toggleFavourite(g.id); tick++ }) {
                    detail = null
                }
            }
            if (showSettings) {
                BackHandler { showSettings = false }
                SettingsScreen(app, server, onServerChanged = { refresh() }, onRemeasure = { scope.launch { measure(); tick++ } }) {
                    showSettings = false
                    onboarding = !s.onboardingDone
                    tick++
                }
            }
            crashed?.let { c ->
                Notice(
                    title = "The emulator stopped",
                    text = "Couch closed while playing ${c.title} with the ${c.core} core. That core may not support this game or this device.",
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
                    title = "Welcome to Couch",
                    text = "1 · Copy your games into roms/<system>/ on a USB drive or in Documents (this device creates the folders for you).\n" +
                        "2 · Scan the QR code with each phone: it becomes the controller, no app needed. Game controllers paired with this TV join with any button.\n" +
                        "3 · In a game, press Home on your phone for save states, controller swaps and quit. If a player leaves, use Players (bottom bar) or Controllers (in-game menu) to swap or remove them.",
                    primary = "Let's play",
                    onPrimary = { s.onboardingDone = true; onboarding = false },
                ) { s.onboardingDone = true; onboarding = false }
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
    Box(Modifier.fillMaxSize().background(Color(0xC804060A)), contentAlignment = Alignment.Center) {
        Column(Modifier.width(760.dp).clip(RoundedCornerShape(24.dp)).background(Panel).padding(30.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(title, fontSize = 30.sp, fontWeight = FontWeight.Bold)
            Text(text, color = Muted, fontSize = 17.sp, lineHeight = 26.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = onPrimary, modifier = Modifier.focusRequester(first)) { Text(primary) }
                Button(onClick = onClose) { Text("Close") }
            }
        }
    }
    LaunchedEffect(Unit) { runCatching { first.requestFocus() } }
}

@Composable
private fun GameDetail(game: Game, onlineArt: Boolean, hasAuto: Boolean, onPlay: (Boolean) -> Unit, onFav: () -> Unit, onClose: () -> Unit) {
    val sys = Systems.byId(game.system)!!
    val first = remember { FocusRequester() }
    BackHandler { onClose() }
    Box(Modifier.fillMaxSize().background(Color(0xB804060A)), contentAlignment = Alignment.Center) {
        Row(Modifier.width(980.dp).clip(RoundedCornerShape(26.dp)).background(Panel).padding(32.dp), horizontalArrangement = Arrangement.spacedBy(32.dp)) {
            Art(game, onlineArt, Modifier.width(260.dp).padding(0.dp))
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(sys.name.uppercase(), color = hexColor(sys.accent), fontWeight = FontWeight.Bold)
                Text(game.title, fontSize = 38.sp, fontWeight = FontWeight.ExtraBold)
                Text("${sys.maker} · ${sys.year} · up to ${sys.maxPlayers} players · ${"%.1f".format(game.size / 1048576.0)} MB", color = Muted)
                Text(
                    if (game.root == SERVER_ROOT) "From the Couch server ${game.remote?.server} · " + (if (game.file.length() == game.size) "downloaded" else "downloads when you play")
                    else game.file.path,
                    color = Muted,
                    fontSize = 13.sp,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(top = 10.dp)) {
                    if (hasAuto) Button(onClick = { onPlay(true) }, modifier = Modifier.focusRequester(first)) { Text("▶  Continue", fontSize = 20.sp) }
                    Button(onClick = { onPlay(false) }, modifier = if (hasAuto) Modifier else Modifier.focusRequester(first)) {
                        Text(if (hasAuto) "Start over" else "▶  Play", fontSize = 20.sp)
                    }
                    Button(onClick = onFav) { Text("☆ Favourite") }
                    Button(onClick = onClose) { Text("Back") }
                }
            }
        }
    }
    LaunchedEffect(Unit) { runCatching { first.requestFocus() } }
}
