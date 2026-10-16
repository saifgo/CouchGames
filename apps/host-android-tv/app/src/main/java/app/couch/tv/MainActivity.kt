package app.couch.tv

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings as AndroidSettings
import android.util.Log
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
        deepLinkGame.value = intent?.data?.takeIf { it.scheme == "couch" }?.lastPathSegment
        setContent { CouchTheme { Root() } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        deepLinkGame.value = intent.data?.takeIf { it.scheme == "couch" }?.lastPathSegment
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
        var playing by remember { mutableStateOf<Pair<Game, Boolean>?>(null) }
        var detail by remember { mutableStateOf<Game?>(null) }
        var showSettings by remember { mutableStateOf(false) }
        var needsPerm by remember { mutableStateOf(needsStoragePermission()) }
        var tick by remember { mutableStateOf(0) }
        val view by app.session.view.collectAsState()
        val joinUrl = remember(view.room) { LanServer.lanAddress()?.let { "http://$it:${app.server.port}/c/?r=${view.room}" } }

        fun refresh() = scope.launch {
            needsPerm = needsStoragePermission()
            games = withContext(Dispatchers.IO) {
                runCatching { app.library.scan() }
                    .onFailure { Log.e("Couch", "library scan failed", it) }
                    .getOrDefault(emptyList())
            }
            Log.i("Couch", "library: ${games.size} games in ${app.library.roots().map { it.path }}")
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
        val rows = remember(playable, tick) {
            val byId = playable.associateBy { it.id }
            buildList {
                val recent = s.recents().mapNotNull { byId[it] }
                if (recent.isNotEmpty()) add(HomeRow("recent", "Continue playing", null, recent))
                val favs = s.favourites()
                playable.filter { it.id in favs }.takeIf { it.isNotEmpty() }?.let { add(HomeRow("fav", "Favourites", null, it)) }
                for (sys in Systems.all) {
                    val list = playable.filter { it.system == sys.id }.sortedBy { it.title.lowercase() }
                    if (list.isNotEmpty()) add(HomeRow(sys.id, sys.name, hexColor(sys.accent), list))
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
                view = view,
                joinUrl = joinUrl,
                maxPlayers = s.maxPlayers,
                onlineArt = s.onlineArt,
                needsStoragePermission = needsPerm,
                onGrantStorage = { requestStorage() },
                onOpen = { detail = it },
                onSettings = { showSettings = true },
                onRefresh = { refresh() },
            )
            detail?.let { g ->
                GameDetail(g, s.onlineArt, app.saves.hasAuto(g.id), onPlay = { resume -> detail = null; playing = g to resume }, onFav = { s.toggleFavourite(g.id); tick++ }) {
                    detail = null
                }
            }
            if (showSettings) {
                BackHandler { showSettings = false }
                SettingsScreen(app, onRemeasure = { scope.launch { measure(); tick++ } }) { showSettings = false; tick++ }
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
                Text(game.file.path, color = Muted, fontSize = 13.sp)
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
