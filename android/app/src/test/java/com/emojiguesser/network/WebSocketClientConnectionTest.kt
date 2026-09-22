package com.emojiguesser.network

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.emojiguesser.BuildConfig
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
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Request
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(AndroidJUnit4::class)
class WebSocketClientConnectionTest {
    private val sockets = FakeSocketFactory()

    private fun TestScope.client() = WebSocketClient(sockets, backgroundScope)

    private fun TestScope.advance(ms: Long) {
        advanceTimeBy(ms)
        runCurrent()
    }

    private fun JsonObject.str(key: String) = this[key]?.jsonPrimitive?.contentOrNull

    @Test
    fun `connect opens one socket to the configured url and ignores repeat calls`() = runTest(UnconfinedTestDispatcher()) {
        val client = client()

        client.connect()
        assertEquals(ConnectionState.CONNECTING, client.connectionState.value)
        assertEquals(Request.Builder().url(BuildConfig.WS_URL).build().url, sockets.last.request().url)

        client.connect()
        sockets.last.open()
        assertEquals(ConnectionState.CONNECTED, client.connectionState.value)
        client.connect()

        assertEquals(1, sockets.sockets.size)
    }

    @Test
    fun `server frames are emitted and malformed ones are dropped`() = runTest(UnconfinedTestDispatcher()) {
        val client = client()
        val received = mutableListOf<ServerMessage>()
        backgroundScope.launch { client.messages.toList(received) }
        client.connect()
        sockets.last.open()

        sockets.last.receive("""{"action":"newEmoji","emoji":"🐘","eventId":"e1","extra":1}""")
        sockets.last.receive("not json")
        sockets.last.receive("""{"emoji":"🦒"}""")

        assertEquals(listOf(ServerMessage(action = "newEmoji", emoji = "🐘", eventId = "e1")), received)
    }

    @Test
    fun `open starts a five second heartbeat carrying the session and game`() = runTest(UnconfinedTestDispatcher()) {
        val client = client()
        client.sessionId = "s1"
        client.currentGameId = "G1"
        client.connect()
        sockets.last.open()

        advance(4_999)
        assertTrue(sockets.last.sent.isEmpty())
        advance(1)
        advance(5_000)

        val beats = sockets.last.sentJson
        assertEquals(2, beats.size)
        beats.forEach {
            assertEquals("heartbeat", it.str("action"))
            assertEquals("s1", it.str("sessionId"))
            assertEquals("G1", it.str("gameId"))
        }
    }

    @Test
    fun `a repeated open restarts rather than doubles the heartbeat`() = runTest(UnconfinedTestDispatcher()) {
        client().connect()
        sockets.last.open()
        advance(2_000)

        sockets.last.open()
        advance(5_000)

        assertEquals(1, sockets.last.sent.size)
    }

    @Test
    fun `server initiated close is answered with a normal close`() = runTest(UnconfinedTestDispatcher()) {
        client().connect()
        sockets.last.open()

        sockets.last.serverClosing(1001, "bye")

        assertEquals(1000, sockets.last.closeCode)
        assertNull(sockets.last.closeReason)
    }

    @Test
    fun `a closed socket stops heartbeating`() = runTest(UnconfinedTestDispatcher()) {
        val client = client()
        client.connect()
        val first = sockets.last
        first.open()

        first.closed(1006, "abnormal")
        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
        advance(10_000)

        assertTrue(first.sent.isEmpty())
    }

    @Test
    fun `dropped connections retry with doubling delays then fail`() = runTest(UnconfinedTestDispatcher()) {
        val client = client()
        client.connect()

        listOf(1_000L, 2_000L, 4_000L, 8_000L, 16_000L).forEachIndexed { attempt, delayMs ->
            if (attempt % 2 == 0) sockets.last.fail() else sockets.last.closed(1006, "abnormal")
            assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
            advance(delayMs - 1)
            assertEquals(attempt + 1, sockets.sockets.size)
            advance(1)
            assertEquals(attempt + 2, sockets.sockets.size)
            assertEquals(ConnectionState.CONNECTING, client.connectionState.value)
        }

        sockets.last.fail()
        advance(60_000)

        assertEquals(ConnectionState.FAILED, client.connectionState.value)
        assertEquals(6, sockets.sockets.size)
    }

    @Test
    fun `a successful open resets the backoff`() = runTest(UnconfinedTestDispatcher()) {
        client().connect()
        sockets.last.fail()
        advance(1_000)
        sockets.last.fail()
        advance(2_000)

        sockets.last.open()
        sockets.last.closed()
        advance(1_000)

        assertEquals(4, sockets.sockets.size)
    }

    @Test
    fun `resetReconnectAttempts restarts the backoff`() = runTest(UnconfinedTestDispatcher()) {
        val client = client()
        client.connect()
        sockets.last.fail()
        advance(1_000)
        sockets.last.fail()
        advance(2_000)

        client.resetReconnectAttempts()
        sockets.last.fail()
        advance(1_000)

        assertEquals(4, sockets.sockets.size)
    }

    @Test
    fun `disconnect closes the socket, clears the game and stops the heartbeat`() = runTest(UnconfinedTestDispatcher()) {
        val client = client()
        client.currentGameId = "G1"
        client.connect()
        sockets.last.open()

        client.disconnect()
        advance(10_000)

        assertEquals(1000, sockets.last.closeCode)
        assertEquals("User disconnected", sockets.last.closeReason)
        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
        assertNull(client.currentGameId)
        assertTrue(sockets.last.sent.isEmpty())
        assertEquals(1, sockets.sockets.size)
    }

    @Test
    fun `sending or disconnecting before connect is a no-op`() = runTest(UnconfinedTestDispatcher()) {
        val client = client()

        client.listPublicGames()
        client.disconnect()

        assertTrue(sockets.sockets.isEmpty())
        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
    }

    @Test
    fun `a user disconnect still reconnects once the close lands`() = runTest(UnconfinedTestDispatcher()) {
        val client = client()
        client.connect()
        sockets.last.open()

        client.disconnect()
        sockets.last.closed(1000, "User disconnected")
        advance(1_000)

        // Bug: disconnect() sets no intentional-close flag, so its own onClosed schedules a reconnect.
        assertEquals(2, sockets.sockets.size)
        assertEquals(ConnectionState.CONNECTING, client.connectionState.value)
    }

    @Test
    fun `createGame and joinGame remember the session and game`() = runTest(UnconfinedTestDispatcher()) {
        val client = client()
        client.connect()

        client.createGame("s1", "Ann", timeLimit = 90, maxRounds = 3, isPublic = true)
        assertEquals("s1", client.sessionId)
        client.createGame("s2", "Bob")
        client.joinGame("G1", "s3", "Cat")

        assertEquals("s3", client.sessionId)
        assertEquals("G1", client.currentGameId)
        val (custom, defaults, join) = sockets.last.sentJson
        assertEquals(listOf("createGame", "s1", "Ann", "90", "3", "true"), custom.fields("action", "sessionId", "playerName", "timeLimit", "maxRounds", "isPublic"))
        assertEquals(listOf("createGame", "s2", "Bob", "120", "2", "false"), defaults.fields("action", "sessionId", "playerName", "timeLimit", "maxRounds", "isPublic"))
        assertEquals(listOf("joinGame", "G1", "s3", "Cat"), join.fields("action", "gameId", "sessionId", "playerName"))
    }

    @Test
    fun `game actions carry the game id and payload`() = runTest(UnconfinedTestDispatcher()) {
        val client = client()
        client.connect()

        client.startGame("G1", "s1", timeLimit = 60, maxRounds = 4)
        client.startGame("G1", "s1")
        client.chooseWord("G1", "apple")
        client.submitEmoji("G1", "🍎")
        client.submitGuess("G1", "pear")
        client.listPublicGames()
        client.restartGame("G1", "s1", timeLimit = 180)
        client.restartGame("G1", "s1")
        client.updatePlayerName("G1", "Dee", "s1")

        val sent = sockets.last.sentJson
        assertEquals(listOf("startGame", "G1", "s1", "60", "4"), sent[0].fields("action", "gameId", "sessionId", "timeLimit", "maxRounds"))
        assertEquals(listOf("startGame", "G1", "s1", "120", "2"), sent[1].fields("action", "gameId", "sessionId", "timeLimit", "maxRounds"))
        assertEquals(listOf("chooseWord", "G1", "apple"), sent[2].fields("action", "gameId", "word"))
        assertEquals(listOf("submitEmoji", "G1", "🍎"), sent[3].fields("action", "gameId", "emoji"))
        assertEquals(listOf("submitGuess", "G1", "pear"), sent[4].fields("action", "gameId", "guess"))
        assertEquals(listOf("listPublicGames", null), sent[5].fields("action", "gameId"))
        assertEquals(listOf("restartGame", "G1", "s1", "180"), sent[6].fields("action", "gameId", "sessionId", "timeLimit"))
        assertEquals(listOf("restartGame", "G1", "s1", "120"), sent[7].fields("action", "gameId", "sessionId", "timeLimit"))
        assertEquals(listOf("updatePlayerName", "G1", "Dee", "s1"), sent[8].fields("action", "gameId", "name", "sessionId"))
    }

    private fun JsonObject.fields(vararg keys: String) = keys.map { str(it) }
}
