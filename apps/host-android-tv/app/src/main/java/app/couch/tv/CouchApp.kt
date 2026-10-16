package app.couch.tv

import android.app.Application
import app.couch.tv.emu.Cores
import app.couch.tv.emu.InputBridge
import app.couch.tv.library.Library
import app.couch.tv.library.Systems
import app.couch.tv.net.HostSession
import app.couch.tv.net.LanServer

/** Process-wide services. The LAN server and room live as long as the app process. */
class CouchApp : Application() {
    lateinit var settings: Settings
    lateinit var session: HostSession
    lateinit var server: LanServer
    lateinit var library: Library
    lateinit var cores: Cores
    lateinit var saves: Saves
    val input = InputBridge()

    override fun onCreate() {
        super.onCreate()
        Systems.load(this)
        settings = Settings(this)
        session = HostSession(this, settings.hostName).also { it.maxPlayers = settings.maxPlayers }
        server = LanServer(this, session)
        library = Library(this).also { it.ensureAppFolders() }
        cores = Cores(this)
        saves = Saves(this)
        server.start()
    }
}
