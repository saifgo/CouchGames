package app.couch.tv

import android.app.Application
import app.couch.tv.emu.Cores
import app.couch.tv.emu.Gamepads
import app.couch.tv.emu.InputBridge
import app.couch.tv.library.Library
import app.couch.tv.library.RemoteLibrary
import app.couch.tv.library.Systems
import app.couch.tv.net.HostSession
import app.couch.tv.net.LanServer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/** Process-wide services. The LAN server and room live as long as the app process. */
class CouchApp : Application() {
    lateinit var settings: Settings
    lateinit var session: HostSession
    lateinit var server: LanServer
    lateinit var library: Library
    lateinit var remote: RemoteLibrary
    lateinit var cores: Cores
    lateinit var saves: Saves
    lateinit var diagnostics: Diagnostics
    lateinit var pro: Pro
    val input = InputBridge()
    /** Bluetooth/USB game controllers paired with the TV. */
    val gamepads by lazy { Gamepads(session) }

    /** Player slots open right now: the Settings choice, or 2 on Couch Free. */
    val players get() = ProRules.players(pro.isPro, settings.maxPlayers)

    override fun onCreate() {
        super.onCreate()
        diagnostics = Diagnostics(this).also { it.installJvmHandler() }
        Systems.load(this)
        settings = Settings(this)
        pro = Pro(this, settings)
        session = HostSession(this, settings.hostName)
        session.roomFullText = {
            if (pro.isPro) "All ${session.maxPlayers} player slots are taken"
            else "Couch Free has ${ProRules.FREE_PLAYERS} player slots. Couch Pro on the TV opens up to 8."
        }
        session.maxPlayers = players
        CoroutineScope(SupervisorJob() + Dispatchers.Main).launch { pro.active.collect { session.maxPlayers = players } }
        server = LanServer(this, session)
        library = Library(this).also { it.ensureAppFolders() }
        remote = RemoteLibrary(this)
        cores = Cores(this)
        saves = Saves(this)
        server.start()
        pro.start()
    }
}
