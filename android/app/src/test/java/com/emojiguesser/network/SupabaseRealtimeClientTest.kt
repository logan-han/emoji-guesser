package com.emojiguesser.network

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.emojiguesser.data.ServerMessage
import com.emojiguesser.testing.FakeSocketFactory
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.shadows.ShadowLog

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
class SupabaseRealtimeClientTest {
    private val sockets = FakeSocketFactory()

    private fun TestScope.realtime(url: String = "https://proj.supabase.co", key: String = "anon-key") =
        SupabaseRealtimeClient(url, key, sockets, backgroundScope)

    private fun TestScope.advance(ms: Long) {
        advanceTimeBy(ms)
        runCurrent()
    }

    private fun JsonObject.str(key: String) = this[key]?.jsonPrimitive?.contentOrNull

    private fun broadcast(inner: String, event: String = "game_event") =
        """{"topic":"realtime:game:G1","event":"broadcast","payload":{"type":"broadcast","event":"$event","payload":$inner},"ref":null}"""

    @Test
    fun `subscribe builds the realtime url from the project url and key`() = runTest(UnconfinedTestDispatcher()) {
        realtime("https://proj.supabase.co/").subscribe("G1")

        // OkHttp stores wss:// as https:// on the request.
        assertEquals(
            "https://proj.supabase.co/realtime/v1/websocket?apikey=anon-key&vsn=1.0.0",
            sockets.last.request().url.toString()
        )
    }

    @Test
    fun `http urls and extra trailing slashes are normalised`() = runTest(UnconfinedTestDispatcher()) {
        realtime("http://localhost:54321//").subscribe("G1")

        assertEquals(
            "https://localhost:54321/realtime/v1/websocket?apikey=anon-key&vsn=1.0.0",
            sockets.last.request().url.toString()
        )
    }

    @Test
    fun `a blank url or key disables realtime`() = runTest(UnconfinedTestDispatcher()) {
        realtime(url = " ").subscribe("G1")
        realtime(key = "").subscribe("G1")

        assertTrue(sockets.sockets.isEmpty())
        assertEquals(2, ShadowLog.getLogsForTag("SupabaseRealtime").count { "not configured" in it.msg })
    }

    @Test
    fun `open joins the game channel and heartbeats every thirty seconds`() = runTest(UnconfinedTestDispatcher()) {
        realtime().subscribe("G1")
        sockets.last.open()

        val join = sockets.last.sentJson.single()
        assertEquals("realtime:game:G1", join.str("topic"))
        assertEquals("phx_join", join.str("event"))
        assertEquals("1", join.str("ref"))
        val config = join["payload"]!!.jsonObject["config"]!!.jsonObject
        assertEquals(false, config["broadcast"]!!.jsonObject["self"]!!.jsonPrimitive.boolean)
        assertEquals("", config["presence"]!!.jsonObject.str("key"))

        advance(29_999)
        assertEquals(1, sockets.last.sent.size)
        advance(1)
        advance(30_000)

        val beats = sockets.last.sentJson.drop(1)
        assertEquals(listOf("2", "3"), beats.map { it.str("ref") })
        beats.forEach {
            assertEquals("phoenix", it.str("topic"))
            assertEquals("heartbeat", it.str("event"))
            assertEquals(JsonObject(emptyMap()), it["payload"])
        }
    }

    @Test
    fun `game_event broadcasts are emitted as server messages`() = runTest(UnconfinedTestDispatcher()) {
        val client = realtime()
        val received = mutableListOf<ServerMessage>()
        backgroundScope.launch { client.messages.toList(received) }
        client.subscribe("G1")
        sockets.last.open()

        sockets.last.receive(broadcast("""{"action":"newEmoji","emoji":"🐘","eventId":"e1"}"""))

        assertEquals(listOf(ServerMessage(action = "newEmoji", emoji = "🐘", eventId = "e1")), received)
    }

    @Test
    fun `frames that are not game_event broadcasts are ignored`() = runTest(UnconfinedTestDispatcher()) {
        val client = realtime()
        val received = mutableListOf<ServerMessage>()
        backgroundScope.launch { client.messages.toList(received) }
        client.subscribe("G1")
        val socket = sockets.last
        socket.open()

        socket.receive("not json")
        socket.receive("[1,2]")
        socket.receive("""{"payload":{}}""")
        socket.receive("""{"event":null}""")
        socket.receive("""{"event":"phx_reply","payload":{"status":"ok"}}""")
        socket.receive("""{"event":"broadcast"}""")
        socket.receive("""{"event":"broadcast","payload":{"event":"game_event"}}""")
        socket.receive("""{"event":"broadcast","payload":{"payload":{"action":"newEmoji"}}}""")
        socket.receive(broadcast("""{"action":"newEmoji"}""", event = "presence_diff"))
        socket.receive(broadcast("""{"emoji":"🐘"}"""))

        assertTrue(received.isEmpty())
    }

    @Test
    fun `subscribing to the same game twice keeps one socket`() = runTest(UnconfinedTestDispatcher()) {
        val client = realtime()

        client.subscribe("G1")
        client.subscribe("G1")

        assertEquals(1, sockets.sockets.size)
    }

    @Test
    fun `switching games closes the old socket first`() = runTest(UnconfinedTestDispatcher()) {
        val client = realtime()
        client.subscribe("G1")
        val first = sockets.last

        client.subscribe("G2")
        sockets.last.open()

        assertEquals(1000, first.closeCode)
        assertEquals("client unsubscribed", first.closeReason)
        assertEquals(2, sockets.sockets.size)
        assertEquals("realtime:game:G2", sockets.last.sentJson.single().str("topic"))
    }

    @Test
    fun `server initiated close is answered with a normal close`() = runTest(UnconfinedTestDispatcher()) {
        realtime().subscribe("G1")

        sockets.last.serverClosing()

        assertEquals(1000, sockets.last.closeCode)
        assertNull(sockets.last.closeReason)
    }

    @Test
    fun `a closed socket stops heartbeating and rejoins after two seconds`() = runTest(UnconfinedTestDispatcher()) {
        realtime().subscribe("G1")
        val first = sockets.last
        first.open()

        first.closed()
        advance(1_999)
        assertEquals(1, sockets.sockets.size)
        advance(1)
        sockets.last.open()
        advance(30_000)

        assertEquals(1, first.sent.size)
        assertEquals(2, sockets.sockets.size)
        assertEquals(listOf("realtime:game:G1", "phoenix"), sockets.last.sentJson.map { it.str("topic") })
    }

    @Test
    fun `a failed socket rejoins every time it drops`() = runTest(UnconfinedTestDispatcher()) {
        realtime().subscribe("G1")
        sockets.last.open()

        sockets.last.fail()
        advance(2_000)
        sockets.last.fail()
        advance(2_000)

        assertEquals(3, sockets.sockets.size)
    }

    @Test
    fun `unsubscribe closes the socket and cancels a pending rejoin`() = runTest(UnconfinedTestDispatcher()) {
        val client = realtime()
        client.subscribe("G1")
        sockets.last.open()
        sockets.last.closed()

        client.unsubscribe()
        advance(10_000)

        assertEquals(1, sockets.sockets.size)
        assertEquals("client unsubscribed", sockets.last.closeReason)
    }

    @Test
    fun `a close after unsubscribe does not rejoin`() = runTest(UnconfinedTestDispatcher()) {
        val client = realtime()
        client.subscribe("G1")
        sockets.last.open()

        client.unsubscribe()
        sockets.last.closed()
        advance(10_000)

        assertEquals(1, sockets.sockets.size)
    }

    @Test
    fun `unsubscribe before subscribe is harmless`() = runTest(UnconfinedTestDispatcher()) {
        realtime().unsubscribe()

        assertTrue(sockets.sockets.isEmpty())
    }

    @Test
    fun `callbacks from the previous game's socket leave the live one alone`() = runTest(UnconfinedTestDispatcher()) {
        val client = realtime()
        val received = mutableListOf<ServerMessage>()
        backgroundScope.launch { client.messages.toList(received) }
        client.subscribe("G1")
        val old = sockets.last
        client.subscribe("G2")
        val current = sockets.last
        current.open()

        old.open()
        old.receive(broadcast("""{"action":"newEmoji","emoji":"🐘"}"""))
        old.closed(1000, "client unsubscribed")
        old.fail()
        advance(30_000)

        assertEquals(2, sockets.sockets.size)
        assertTrue(old.sent.isEmpty())
        assertTrue(received.isEmpty())
        assertNull(current.closeCode)
        assertEquals(listOf("phx_join", "heartbeat"), current.sentJson.map { it.str("event") })
    }
}
