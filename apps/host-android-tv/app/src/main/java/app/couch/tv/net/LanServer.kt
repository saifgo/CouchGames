package app.couch.tv.net

import android.content.Context
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.install
import io.ktor.server.cio.CIO
import io.ktor.server.engine.EmbeddedServer
import io.ktor.server.engine.embeddedServer
import io.ktor.server.plugins.origin
import io.ktor.server.response.respondBytes
import io.ktor.server.response.respondRedirect
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import io.ktor.server.websocket.WebSockets
import io.ktor.server.websocket.pingPeriod
import io.ktor.server.websocket.webSocket
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import java.net.Inet4Address
import java.net.NetworkInterface
import kotlin.time.Duration.Companion.seconds

/**
 * The TV is its own server on the LAN (ADR-002 "LAN mode"):
 *  - GET /c/...  the phone controller (built web app, bundled in assets)
 *  - WS  /ws     signaling for WebRTC + direct WebSocket input path
 *  - GET /api/health
 */
class LanServer(private val context: Context, private val session: HostSession, val port: Int = 8787) {
    private var server: EmbeddedServer<*, *>? = null

    fun start() {
        if (server != null) return
        server = embeddedServer(CIO, port = port, host = "0.0.0.0") {
            install(WebSockets) {
                pingPeriod = 15.seconds
                maxFrameSize = 64 * 1024
            }
            routing {
                get("/") { call.respondRedirect("/c/") }
                get("/api/health") { call.respondText("""{"ok":true,"room":"${session.room}"}""", ContentType.Application.Json) }
                get("/c") { call.respondRedirect("/c/") }
                get("/c/{path...}") {
                    val rel = call.parameters.getAll("path")?.joinToString("/").orEmpty()
                    val asset = asset(rel) ?: if (!rel.substringAfterLast('/').contains('.')) asset("index.html") else null
                    if (asset == null) call.respondText("not found", status = HttpStatusCode.NotFound)
                    else call.respondBytes(asset.second, asset.first)
                }
                webSocket("/ws") {
                    val peer = session.attach(this, call.request.origin.remoteHost)
                    try {
                        for (frame in incoming) {
                            when (frame) {
                                is Frame.Text -> session.onText(peer, frame.readText())
                                is Frame.Binary -> session.onBinary(peer, frame.data)
                                else -> Unit
                            }
                        }
                    } finally {
                        session.detach(peer)
                    }
                }
            }
        }.start(wait = false)
    }

    fun stop() {
        server?.stop(500, 1000)
        server = null
    }

    private fun asset(rel: String): Pair<ContentType, ByteArray>? {
        val path = "controller/" + rel.ifEmpty { "index.html" }
        if (path.contains("..")) return null
        val bytes = runCatching { context.assets.open(path).use { it.readBytes() } }.getOrNull() ?: return null
        val type = when (path.substringAfterLast('.')) {
            "html" -> ContentType.Text.Html
            "js" -> ContentType.Text.JavaScript
            "css" -> ContentType.Text.CSS
            "svg" -> ContentType.Image.SVG
            "json", "map" -> ContentType.Application.Json
            "webmanifest" -> ContentType("application", "manifest+json")
            "png" -> ContentType.Image.PNG
            else -> ContentType.Application.OctetStream
        }
        return type to bytes
    }

    companion object {
        /** Best LAN IPv4 (Wi-Fi / Ethernet), for the QR code. */
        fun lanAddress(): String? = NetworkInterface.getNetworkInterfaces().toList()
            .filter { it.isUp && !it.isLoopback && !it.isVirtual }
            .sortedBy { if (it.name.startsWith("wlan") || it.name.startsWith("eth")) 0 else 1 }
            .flatMap { it.inetAddresses.toList() }
            .firstOrNull { it is Inet4Address && !it.isLoopbackAddress }?.hostAddress
    }
}
