package com.emojiguesser.network

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.emojiguesser.data.ActionReply
import com.emojiguesser.data.ClientMessage
import com.emojiguesser.data.ServerMessage
import com.emojiguesser.data.StreamCursor
import com.emojiguesser.testing.EMPTY_REPLY
import com.emojiguesser.testing.FakeCallFactory
import com.emojiguesser.testing.FakeEventSourceFactory
import com.emojiguesser.testing.fields
import com.emojiguesser.testing.str
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
class GameClientTest {
    private val http = FakeCallFactory()
    private val streams = FakeEventSourceFactory()

    private fun TestScope.client() = GameClient(API, http, streams, backgroundScope).apply { sessionId = "s1" }

    private fun TestScope.connected() = client().apply {
        connect()
        http.last.reply()
    }

    private fun TestScope.received(client: GameClient) =
        mutableListOf<ServerMessage>().also { list -> backgroundScope.launch { client.messages.toList(list) } }

    private fun TestScope.advance(ms: Long) {
        advanceTimeBy(ms)
        runCurrent()
    }

    private fun reply(vararg messages: ServerMessage, stream: StreamCursor? = null) =
        Json.encodeToString(ActionReply.serializer(), ActionReply(messages.toList(), stream))

    private fun cursor(gameId: String, after: Int?) = StreamCursor(gameId, after)

    /** Streams [gameId] from [after], as a createGame or joinGame reply would. */
    private fun TestScope.streaming(gameId: String = "G1", after: Int = 17) = connected().apply {
        send(ClientMessage(action = "joinGame", gameId = gameId))
        http.last.reply(reply(stream = cursor(gameId, after)))
        streams.last.open()
    }

    @Test
    fun `connect says hello to the action endpoint and ignores repeat calls`() = runTest(UnconfinedTestDispatcher()) {
        val client = client()

        client.connect()
        assertEquals(ConnectionState.CONNECTING, client.connectionState.value)
        client.connect()
        val hello = http.last
        assertEquals("POST", hello.request().method)
        assertEquals("$API/action", hello.request().url.toString())
        assertEquals("application/json; charset=utf-8", hello.request().body!!.contentType().toString())
        assertEquals(listOf("hello", "s1"), hello.json.fields("action", "sessionId"))

        hello.reply()
        assertEquals(ConnectionState.CONNECTED, client.connectionState.value)
        client.connect()

        assertEquals(1, http.calls.size)
    }

    @Test
    fun `a failed hello retries with doubling delays then fails`() = runTest(UnconfinedTestDispatcher()) {
        val client = client()
        client.connect()

        listOf(1_000L, 2_000L, 4_000L, 8_000L, 16_000L).forEachIndexed { attempt, delayMs ->
            if (attempt % 2 == 0) http.last.fail() else http.last.reply("""{"error":"server error"}""", code = 500)
            assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
            advance(delayMs - 1)
            assertEquals(attempt + 1, http.calls.size)
            advance(1)
            assertEquals(attempt + 2, http.calls.size)
            assertEquals(ConnectionState.CONNECTING, client.connectionState.value)
        }

        http.last.reply("not json")
        advance(60_000)

        assertEquals(ConnectionState.FAILED, client.connectionState.value)
        assertEquals(6, http.calls.size)
    }

    @Test
    fun `a successful hello resets the backoff`() = runTest(UnconfinedTestDispatcher()) {
        val client = client()
        client.connect()
        http.last.fail()
        advance(1_000)
        http.last.fail()
        advance(2_000)
        http.last.reply()

        client.listPublicGames()
        http.last.fail()
        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
        advance(1_000)

        assertEquals("hello", http.actions().last())
        assertEquals(5, http.calls.size)
    }

    @Test
    fun `resetReconnectAttempts restarts the backoff`() = runTest(UnconfinedTestDispatcher()) {
        val client = client()
        client.connect()
        http.last.fail()
        advance(1_000)
        http.last.fail()
        advance(2_000)

        client.resetReconnectAttempts()
        http.last.fail()
        advance(1_000)

        assertEquals(4, http.calls.size)
    }

    @Test
    fun `hello replies are handled like any other`() = runTest(UnconfinedTestDispatcher()) {
        val client = client()
        val received = received(client)
        client.connect()

        http.last.reply(reply(ServerMessage(action = "error", message = "A session id is required.")))

        assertEquals(listOf(ServerMessage(action = "error", message = "A session id is required.")), received)
        assertEquals(ConnectionState.CONNECTED, client.connectionState.value)
    }

    @Test
    fun `disconnect cancels a hello in flight and ignores its late answer`() = runTest(UnconfinedTestDispatcher()) {
        val client = client()
        client.connect()

        client.disconnect()
        http.last.fail()
        advance(60_000)

        assertTrue(http.last.isCanceled())
        assertEquals(1, http.calls.size)
        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
    }

    @Test
    fun `disconnect cancels a pending reconnect`() = runTest(UnconfinedTestDispatcher()) {
        val client = client()
        client.connect()
        http.last.fail()

        client.disconnect()
        advance(60_000)

        assertEquals(1, http.calls.size)
        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
    }

    @Test
    fun `actions post their fields and always carry the session`() = runTest(UnconfinedTestDispatcher()) {
        http.autoReply = EMPTY_REPLY
        val client = client()

        client.createGame("s2", "Ann", timeLimit = 90, maxRounds = 3, isPublic = true)
        client.createGame("s2", "Bob")
        client.joinGame("G1", "s3", "Cat")
        client.startGame("G1", "s3", timeLimit = 60, maxRounds = 4)
        client.startGame("G1", "s3")
        client.chooseWord("G1", "apple")
        client.submitEmoji("G1", "🍎")
        client.submitGuess("G1", "pear")
        client.listPublicGames()
        client.restartGame("G1", "s3", timeLimit = 180)
        client.restartGame("G1", "s3")
        client.updatePlayerName("G1", "Dee", "s3")
        client.send(ClientMessage(action = "joinGame", gameId = "G2", sessionId = "explicit"))

        val sent = http.calls.map { it.json }
        assertEquals("s3", client.sessionId)
        assertEquals(listOf("createGame", "s2", "Ann", "90", "3", "true"), sent[0].fields("action", "sessionId", "playerName", "timeLimit", "maxRounds", "isPublic"))
        assertEquals(listOf("createGame", "s2", "Bob", "120", "2", "false"), sent[1].fields("action", "sessionId", "playerName", "timeLimit", "maxRounds", "isPublic"))
        assertEquals(listOf("joinGame", "G1", "s3", "Cat"), sent[2].fields("action", "gameId", "sessionId", "playerName"))
        assertEquals(listOf("startGame", "G1", "s3", "60", "4"), sent[3].fields("action", "gameId", "sessionId", "timeLimit", "maxRounds"))
        assertEquals(listOf("120", "2"), sent[4].fields("timeLimit", "maxRounds"))
        assertEquals(listOf("chooseWord", "G1", "s3", "apple"), sent[5].fields("action", "gameId", "sessionId", "word"))
        assertEquals(listOf("submitEmoji", "G1", "s3", "🍎"), sent[6].fields("action", "gameId", "sessionId", "emoji"))
        assertEquals(listOf("submitGuess", "G1", "s3", "pear"), sent[7].fields("action", "gameId", "sessionId", "guess"))
        assertEquals(listOf("listPublicGames", null, "s3"), sent[8].fields("action", "gameId", "sessionId"))
        assertEquals(listOf("restartGame", "G1", "s3", "180"), sent[9].fields("action", "gameId", "sessionId", "timeLimit"))
        assertEquals("120", sent[10].str("timeLimit"))
        assertEquals(listOf("updatePlayerName", "G1", "Dee", "s3"), sent[11].fields("action", "gameId", "name", "sessionId"))
        assertEquals("explicit", sent[12].str("sessionId"))
        assertTrue(http.calls.all { it.request().url.toString() == "$API/action" })
    }

    @Test
    fun `actions go out one at a time in order`() = runTest(UnconfinedTestDispatcher()) {
        val client = connected()

        client.submitEmoji("G1", "🐶")
        client.submitEmoji("G1", "🐱")
        assertEquals(listOf("hello", "submitEmoji"), http.actions())

        http.last.reply()

        assertEquals(listOf("🐶", "🐱"), http.calls.drop(1).map { it.json.str("emoji") })
    }

    @Test
    fun `reply messages are emitted in order and a malformed reply is dropped`() = runTest(UnconfinedTestDispatcher()) {
        val client = connected()
        val received = received(client)

        client.joinGame("G1", "s1", "Ann")
        client.listPublicGames()
        http.last.reply("not json")
        http.last.reply(reply(ServerMessage(action = "playerJoined", eventId = "G1:3"), ServerMessage(action = "hintUpdated", hint = "a _")))

        assertEquals(listOf(ServerMessage(action = "playerJoined", eventId = "G1:3"), ServerMessage(action = "hintUpdated", hint = "a _")), received)
        assertEquals(ConnectionState.CONNECTED, client.connectionState.value)
        assertEquals(3, http.calls.size)
    }

    @Test
    fun `a network failure reports the connection down but a server error does not`() = runTest(UnconfinedTestDispatcher()) {
        val client = connected()

        client.listPublicGames()
        http.last.reply(code = 500)
        assertEquals(ConnectionState.CONNECTED, client.connectionState.value)
        client.listPublicGames()
        http.last.fail(IOException("reset"))
        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)

        client.listPublicGames()
        assertEquals("listPublicGames", http.actions().last())
        advance(1_000)
        assertEquals("hello", http.actions().last())
        http.last.reply()
        assertEquals(ConnectionState.CONNECTED, client.connectionState.value)
    }

    @Test
    fun `disconnect drops queued actions and cancels the one in flight`() = runTest(UnconfinedTestDispatcher()) {
        val client = connected()
        val received = received(client)
        client.submitGuess("G1", "cat")
        client.submitGuess("G1", "dog")
        val inFlight = http.last

        client.disconnect()
        inFlight.reply(reply(ServerMessage(action = "newGuess", text = "cat")))

        assertTrue(inFlight.isCanceled())
        assertEquals(2, http.calls.size)

        client.listPublicGames()
        http.last.reply(reply(ServerMessage(action = "publicGamesList")))
        assertEquals(listOf("publicGamesList"), received.map { it.action })
    }

    @Test
    fun `a reply with a stream cursor opens that game's events`() = runTest(UnconfinedTestDispatcher()) {
        val client = connected()

        client.joinGame("G1", "s1", "Ann")
        http.last.reply(reply(stream = cursor("G1", 17)))

        val source = streams.sources.single()
        assertEquals("$API/events?gameId=G1&sessionId=s1&after=17", source.request().url.toString())
        assertEquals("text/event-stream", source.request().header("Accept"))
        assertEquals("G1", client.currentGameId)
    }

    @Test
    fun `events are emitted and move the cursor while bad data is skipped`() = runTest(UnconfinedTestDispatcher()) {
        val client = streaming(after = 17)
        val received = received(client)

        streams.last.event("18", """{"action":"newEmoji","emoji":"🐶","eventId":"G1:18"}""")
        streams.last.event("19", "not json")
        streams.last.event(null, """{"action":"newEmoji","emoji":"🐱"}""")
        streams.last.event("x", """{"emoji":"🦊"}""")
        advance(5_000)
        streams.last.end()

        assertEquals(listOf(ServerMessage(action = "newEmoji", emoji = "🐶", eventId = "G1:18"), ServerMessage(action = "newEmoji", emoji = "🐱")), received)
        assertEquals("19", streams.last.query("after"))
    }

    @Test
    fun `a stream that ends after it settles rolls straight over from the last event`() = runTest(UnconfinedTestDispatcher()) {
        streaming(after = 17)
        streams.last.event("18", """{"action":"emojisCleared"}""")
        advance(5_000)

        streams.last.end()

        assertEquals(2, streams.sources.size)
        assertEquals(listOf("G1", "s1", "18"), listOf("gameId", "sessionId", "after").map(streams.last::query))
    }

    @Test
    fun `a stream that ends before it settles backs off like a failure`() = runTest(UnconfinedTestDispatcher()) {
        val client = streaming(after = 17)

        listOf(1_000L, 2_000L, 4_000L, 8_000L).forEachIndexed { i, delayMs ->
            advance(4_999)
            streams.last.end()
            advance(delayMs - 1)
            assertEquals(i + 1, streams.sources.size)
            advance(1)
            assertEquals(i + 2, streams.sources.size)
            streams.last.open()
        }
        assertEquals(ConnectionState.CONNECTED, client.connectionState.value)

        streams.last.end()

        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
        assertEquals("17", streams.last.query("after"))
    }

    @Test
    fun `a reply for the game already streaming keeps the current cursor`() = runTest(UnconfinedTestDispatcher()) {
        val client = streaming(after = 17)
        streams.last.event("18", """{"action":"emojisCleared"}""")

        client.submitEmoji("G1", "🐶")
        http.last.reply(reply(stream = cursor("G1", 25)))
        assertEquals(1, streams.sources.size)
        advance(5_000)
        streams.last.end()

        assertEquals("18", streams.last.query("after"))
    }

    @Test
    fun `a reply for another game switches streams`() = runTest(UnconfinedTestDispatcher()) {
        val client = streaming("G1")
        val first = streams.last

        client.joinGame("G2", "s1", "Ann")
        http.last.reply(reply(stream = cursor("G2", 3)))

        assertTrue(first.canceled)
        assertEquals(listOf("G2", "3"), listOf("gameId", "after").map(streams.last::query))
        assertEquals("G2", client.currentGameId)
    }

    @Test
    fun `a null cursor for the streamed game stops the stream`() = runTest(UnconfinedTestDispatcher()) {
        val client = streaming("G1")

        client.listPublicGames()
        http.last.reply(reply(stream = cursor("G2", null)))
        assertFalse(streams.last.canceled)

        client.restartGame("G1", "s1")
        http.last.reply("""{"messages":[],"stream":{"gameId":"G1","after":null}}""")
        advance(60_000)

        assertTrue(streams.last.canceled)
        assertNull(client.currentGameId)
        assertEquals(1, streams.sources.size)
    }

    @Test
    fun `a 403 rejoins the game under the last name sent`() = runTest(UnconfinedTestDispatcher()) {
        val client = connected()
        val received = received(client)
        client.joinGame("G1", "s1", "Ann")
        http.last.reply(reply(stream = cursor("G1", 5)))
        client.updatePlayerName("G1", "Zed", "s1")
        http.last.reply()
        streams.last.open()

        streams.last.reject(403)
        advance(999)
        assertEquals(3, http.calls.size)
        advance(1)

        assertEquals(listOf("joinGame", "G1", "s1", "Zed"), http.last.json.fields("action", "gameId", "sessionId", "playerName"))
        http.last.reply(reply(ServerMessage(action = "spectatorJoined"), stream = cursor("G1", 40)))
        assertEquals(listOf("spectatorJoined"), received.map { it.action })
        assertEquals(2, streams.sources.size)
        assertEquals("40", streams.last.query("after"))
        assertEquals("G1", client.currentGameId)
    }

    @Test
    fun `a rejoin that fails is tried again`() = runTest(UnconfinedTestDispatcher()) {
        streaming("G1")
        streams.last.reject(403)
        advance(1_000)

        http.last.reply(code = 503)
        advance(1_999)
        assertEquals(3, http.calls.size)
        advance(1)

        assertEquals(listOf("joinGame", "G1"), http.last.json.fields("action", "gameId"))
        http.last.reply(reply(stream = cursor("G1", 50)))
        assertEquals(2, streams.sources.size)
        assertEquals("50", streams.last.query("after"))
    }

    @Test
    fun `a rejoin still on its way when the player leaves is not retried`() = runTest(UnconfinedTestDispatcher()) {
        val client = streaming("G1")
        streams.last.reject(403)
        advance(1_000)
        val rejoin = http.last

        client.leaveGame("G1")
        rejoin.reply(code = 503)
        http.last.reply()
        advance(60_000)

        assertEquals(listOf("hello", "joinGame", "joinGame", "leaveGame"), http.actions())
        assertEquals(1, streams.sources.size)
        assertNull(client.currentGameId)
    }

    @Test
    fun `a 404 stops streaming for good`() = runTest(UnconfinedTestDispatcher()) {
        val client = streaming("G1")

        streams.last.reject(404)
        advance(60_000)

        assertNull(client.currentGameId)
        assertEquals(1, streams.sources.size)
    }

    @Test
    fun `stream failures back off up to fifteen seconds`() = runTest(UnconfinedTestDispatcher()) {
        streaming("G1", after = 17)

        listOf(1_000L, 2_000L, 4_000L, 8_000L, 15_000L, 15_000L).forEachIndexed { i, delayMs ->
            if (i % 2 == 0) streams.last.fail() else streams.last.reject(503)
            advance(delayMs - 1)
            assertEquals(i + 1, streams.sources.size)
            advance(1)
            assertEquals(i + 2, streams.sources.size)
        }

        assertEquals("17", streams.last.query("after"))
    }

    @Test
    fun `five stream failures in a row report the connection down until a hello gets through`() = runTest(UnconfinedTestDispatcher()) {
        val client = streaming("G1")
        listOf(1_000L, 2_000L, 4_000L, 8_000L).forEach { delayMs ->
            streams.last.fail()
            advance(delayMs)
        }
        assertEquals(ConnectionState.CONNECTED, client.connectionState.value)

        streams.last.fail()
        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
        advance(1_000)
        assertEquals("hello", http.actions().last())
        http.last.reply()

        assertEquals(ConnectionState.CONNECTED, client.connectionState.value)
        // Resumed straight away rather than at the next fifteen second retry.
        assertEquals(6, streams.sources.size)
        advance(15_000)
        assertEquals(6, streams.sources.size)
    }

    @Test
    fun `only a stream that settles resets the backoff`() = runTest(UnconfinedTestDispatcher()) {
        streaming("G1")
        streams.last.fail()
        advance(1_000)
        streams.last.open()
        streams.last.fail()
        advance(1_999)
        assertEquals(2, streams.sources.size)
        advance(1)

        streams.last.open()
        advance(5_000)
        streams.last.fail()
        advance(1_000)

        assertEquals(4, streams.sources.size)
    }

    @Test
    fun `a hello leaves a healthy stream alone`() = runTest(UnconfinedTestDispatcher()) {
        val client = streaming("G1")

        client.listPublicGames()
        http.last.fail()
        advance(1_000)
        http.last.reply()

        assertEquals(ConnectionState.CONNECTED, client.connectionState.value)
        assertFalse(streams.last.canceled)
        assertEquals(1, streams.sources.size)
    }

    @Test
    fun `leaving while a stream waits to retry cancels the retry`() = runTest(UnconfinedTestDispatcher()) {
        val client = streaming("G1")
        streams.last.fail()

        client.leaveGame("G1")
        advance(60_000)

        assertEquals(1, streams.sources.size)
        assertNull(client.currentGameId)
    }

    @Test
    fun `callbacks from a replaced stream are ignored`() = runTest(UnconfinedTestDispatcher()) {
        val client = streaming("G1")
        val old = streams.last
        val received = received(client)
        client.joinGame("G2", "s1", "Ann")
        http.last.reply(reply(stream = cursor("G2", 0)))

        old.open()
        old.event("99", """{"action":"newEmoji","emoji":"🐘"}""")
        old.end()
        old.fail()
        old.reject(403)
        advance(60_000)

        assertTrue(received.isEmpty())
        assertEquals(2, streams.sources.size)
        assertEquals(3, http.calls.size)
        assertEquals("0", streams.last.query("after"))
    }

    @Test
    fun `leaveGame stops the stream at once and tells the server`() = runTest(UnconfinedTestDispatcher()) {
        val client = streaming("G1")

        client.leaveGame("G9")
        http.last.reply()
        assertFalse(streams.last.canceled)
        client.leaveGame("G1")

        assertTrue(streams.last.canceled)
        assertNull(client.currentGameId)
        assertEquals(listOf("leaveGame", "G1", "s1"), http.last.json.fields("action", "gameId", "sessionId"))
        http.last.reply(reply(stream = cursor("G1", null)))
        advance(60_000)
        assertEquals(1, streams.sources.size)
    }

    @Test
    fun `replies still on their way for a game the player left are dropped`() = runTest(UnconfinedTestDispatcher()) {
        val client = streaming("G1")
        val received = received(client)
        client.submitGuess("G1", "apple")
        val guess = http.last

        client.leaveGame("G1")
        guess.reply(reply(ServerMessage(action = "wordGuessed", eventId = "G1:20"), stream = cursor("G1", 20)))
        http.last.reply()

        assertTrue(received.isEmpty())
        assertEquals(1, streams.sources.size)

        client.joinGame("G1", "s1", "Ann")
        http.last.reply(reply(ServerMessage(action = "playerJoined"), stream = cursor("G1", 30)))

        assertEquals(listOf("playerJoined"), received.map { it.action })
        assertEquals("30", streams.last.query("after"))
    }

    @Test
    fun `disconnect cancels the stream and ignores its late callbacks`() = runTest(UnconfinedTestDispatcher()) {
        val client = streaming("G1")

        client.disconnect()
        streams.last.end()
        advance(60_000)

        assertTrue(streams.last.canceled)
        assertNull(client.currentGameId)
        assertEquals(1, streams.sources.size)
        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
    }

    @Test
    fun `a failed connection pauses the stream until a hello gets through`() = runTest(UnconfinedTestDispatcher()) {
        val client = streaming("G1")
        streams.last.event("18", """{"action":"emojisCleared"}""")
        val open = streams.last

        client.listPublicGames()
        http.last.fail()
        repeat(5) {
            advance(60_000)
            http.last.fail()
        }
        assertEquals(ConnectionState.FAILED, client.connectionState.value)
        assertTrue(open.canceled)
        advance(60_000)
        assertEquals(1, streams.sources.size)

        client.resetReconnectAttempts()
        client.connect()
        http.last.reply()

        assertEquals(2, streams.sources.size)
        assertEquals("18", streams.last.query("after"))
    }

    companion object {
        const val API = "https://api.test/api"
    }
}
