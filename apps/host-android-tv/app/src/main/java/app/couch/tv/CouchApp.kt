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
    val input = InputBridge()
    /** Bluetooth/USB game controllers paired with the TV. */
    val gamepads by lazy { Gamepads(session) }

    override fun onCreate() {
        super.onCreate()
        diagnostics = Diagnostics(this).also { it.installJvmHandler() }
        Systems.load(this)
        settings = Settings(this)
        session = HostSession(this, settings.hostName).also { it.maxPlayers = settings.maxPlayers }
        server = LanServer(this, session)
        library = Library(this).also { it.ensureAppFolders() }
        remote = RemoteLibrary(this)
        cores = Cores(this)
        saves = Saves(this)
        server.start()
    }
}
