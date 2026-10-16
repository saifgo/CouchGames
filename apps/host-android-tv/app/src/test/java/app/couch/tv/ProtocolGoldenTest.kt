package app.couch.tv

import app.couch.tv.protocol.Codec
import app.couch.tv.protocol.ControlMsg
import app.couch.tv.protocol.InputEcho
import app.couch.tv.protocol.InputState
import app.couch.tv.protocol.LinkStats
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** Same bytes must decode identically in TypeScript and Kotlin (packages/protocol/vectors/golden.json). */
class ProtocolGoldenTest {
    private val golden: JsonObject =
        Json.parseToJsonElement(javaClass.classLoader!!.getResource("golden.json")!!.readText()).jsonObject

    private fun JsonObject.i(k: String) = get(k)!!.jsonPrimitive.int
    private fun JsonObject.l(k: String) = get(k)!!.jsonPrimitive.long
    private fun JsonObject.b(k: String) = get(k)!!.jsonPrimitive.boolean

    @Test
    fun versionMatches() = assertEquals(1, golden["protocolVersion"]!!.jsonPrimitive.int)

    @Test
    fun inputVectors() {
        for (v in golden["input"]!!.jsonArray) {
            val o = v.jsonObject
            val value = o["value"]!!.jsonObject
            val s = InputState().apply {
                seq = value.i("seq"); clientTimeMs = value.l("clientTimeMs"); buttons = value.l("buttons")
                lx = value.i("lx"); ly = value.i("ly"); rx = value.i("rx"); ry = value.i("ry"); l2 = value.i("l2"); r2 = value.i("r2")
                hasGyro = value.b("hasGyro"); gx = value.i("gx"); gy = value.i("gy"); gz = value.i("gz")
            }
            val buf = ByteArray(24)
            val n = Codec.encodeInputInto(s, buf)
            val hex = o["hex"]!!.jsonPrimitive.content
            assertEquals(o["name"].toString(), hex, Codec.hex(buf, n))
            val bytes = Codec.fromHex(hex)
            val out = InputState()
            assertTrue(Codec.decodeInputInto(bytes, 0, bytes.size, out))
            assertEquals(s.seq, out.seq); assertEquals(s.clientTimeMs, out.clientTimeMs); assertEquals(s.buttons, out.buttons)
            assertEquals(listOf(s.lx, s.ly, s.rx, s.ry, s.l2, s.r2), listOf(out.lx, out.ly, out.rx, out.ry, out.l2, out.r2))
            assertEquals(listOf(s.hasGyro, s.gx, s.gy, s.gz), listOf(out.hasGyro, out.gx, out.gy, out.gz))
        }
    }

    @Test
    fun echoVectors() {
        for (v in golden["echo"]!!.jsonArray) {
            val o = v.jsonObject
            val value = o["value"]!!.jsonObject
            val e = InputEcho(value.i("seq"), value.l("clientTimeMs"), value.l("hostTimeMs"))
            val buf = ByteArray(12)
            Codec.encodeEchoInto(e, buf)
            assertEquals(o["hex"]!!.jsonPrimitive.content, Codec.hex(buf))
            val out = InputEcho()
            assertTrue(Codec.decodeEchoInto(Codec.fromHex(o["hex"]!!.jsonPrimitive.content), out))
            assertEquals(e, out)
        }
    }

    @Test
    fun controlVectors() {
        for (v in golden["control"]!!.jsonArray) {
            val o = v.jsonObject
            val hex = o["hex"]!!.jsonPrimitive.content
            val decoded = Codec.decodeControl(Codec.fromHex(hex))
            // Re-encoding what we decoded must give the exact same bytes.
            assertEquals(o["name"].toString(), hex, Codec.hex(Codec.encodeControl(decoded)))
            val value = o["value"]!!.jsonObject
            assertEquals(value.i("type"), decoded.type)
            when (decoded) {
                is ControlMsg.Ping -> assertEquals(value.l("hostTimeMs"), decoded.hostTimeMs)
                is ControlMsg.Stats -> assertEquals(value["rttMs"]!!.jsonPrimitive.content.toDouble(), decoded.rttMs, 0.001)
                is ControlMsg.Roster -> assertEquals((value["players"] as JsonArray).size, decoded.body.players.size)
                is ControlMsg.Hello -> assertEquals(value["name"]!!.jsonPrimitive.content, decoded.body.name)
                else -> Unit
            }
        }
    }

    @Test
    fun invalidVectorsAreRejected() {
        for (v in golden["invalid"]!!.jsonArray) {
            val bytes = Codec.fromHex(v.jsonObject["hex"]!!.jsonPrimitive.content)
            if (bytes[0].toInt() == 0x01) {
                assertFalse(Codec.decodeInputInto(bytes, 0, bytes.size, InputState()))
            } else {
                try {
                    Codec.decodeControl(bytes)
                    fail("accepted ${v.jsonObject["name"]}")
                } catch (_: Codec.ProtocolError) {
                }
            }
        }
    }

    @Test
    fun seqAndClockArithmetic() {
        assertTrue(Codec.seqNewer(0, 65535))
        assertFalse(Codec.seqNewer(65535, 0))
        assertEquals(11, Codec.u32Diff(5, 4294967290L))
    }

    @Test
    fun linkStatsSkipsLatencyBeforeSync() {
        val ls = LinkStats(10)
        ls.onPacket(1, Double.NaN)
        ls.onPacket(3, Double.NaN)
        assertEquals(1, ls.lost)
        assertEquals(0, ls.latency.size)
    }
}
