package com.emojiguesser.network

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.emojiguesser.data.ServerMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.sse.EventSources
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.TimeUnit

/** The client over real HTTP, so the requests and the okhttp-sse parsing are the genuine article. */
@RunWith(AndroidJUnit4::class)
class GameClientHttpTest {
    private val server = MockWebServer()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val http = OkHttpClient()
    private val client by lazy {
        GameClient(server.url("/api").toString(), http, EventSources.createFactory(http), scope).apply { sessionId = "session-1" }
    }

    @After
    fun tearDown() {
        scope.cancel()
        server.shutdown()
    }

    private fun takeRequest() = server.takeRequest(5, TimeUnit.SECONDS)!!

    private suspend fun waitFor(condition: () -> Boolean) = withTimeout(5_000) { while (!condition()) delay(20) }

    @Test
    fun `an action is a json post whose reply reaches the messages flow`() = runBlocking {
        server.enqueue(MockResponse().setBody("""{"messages":[{"action":"publicGamesList","games":[]}]}"""))
        val reply = async(start = CoroutineStart.UNDISPATCHED) { client.messages.first() }

        client.listPublicGames()

        val request = takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/action", request.path)
        assertEquals("application/json; charset=utf-8", request.getHeader("Content-Type"))
        val body = Json.parseToJsonElement(request.body.readUtf8()).jsonObject
        assertEquals("listPublicGames", body.getValue("action").jsonPrimitive.content)
        assertEquals("session-1", body.getValue("sessionId").jsonPrimitive.content)
        assertEquals(ServerMessage(action = "publicGamesList", games = emptyList()), withTimeout(5_000) { reply.await() })
    }

    @Test
    fun `the event stream is parsed, resumed from the last id and dropped once the game is gone`() = runBlocking {
        server.enqueue(MockResponse().setBody("""{"messages":[],"stream":{"gameId":"ABC123","after":17}}"""))
        server.enqueue(
            MockResponse()
                .setHeader("Content-Type", "text/event-stream; charset=utf-8")
                .setBody(
                    "retry: 1000\n\n" +
                        "id: 18\ndata: {\"action\":\"newEmoji\",\"emoji\":\"🐶\",\"eventId\":\"ABC123:18\"}\n\n" +
                        ": ping\n\n" +
                        "id: 19\ndata: {\"action\":\"newGuess\",\ndata: \"text\":\"Ann: dog\"}\n\n"
                )
        )
        server.enqueue(MockResponse().setResponseCode(404).setBody("""{"error":"no such game"}"""))
        val events = async(start = CoroutineStart.UNDISPATCHED) { client.messages.take(2).toList() }

        client.joinGame("ABC123", "session-1", "Ann")

        assertEquals("/api/action", takeRequest().path)
        val first = takeRequest()
        assertEquals("/api/events?gameId=ABC123&sessionId=session-1&after=17", first.path)
        assertEquals("text/event-stream", first.getHeader("Accept"))
        assertEquals(
            listOf(
                ServerMessage(action = "newEmoji", emoji = "🐶", eventId = "ABC123:18"),
                ServerMessage(action = "newGuess", text = "Ann: dog")
            ),
            withTimeout(5_000) { events.await() }
        )
        assertEquals("/api/events?gameId=ABC123&sessionId=session-1&after=19", takeRequest().path)
        waitFor { client.currentGameId == null }
        assertEquals(3, server.requestCount)
    }
}
