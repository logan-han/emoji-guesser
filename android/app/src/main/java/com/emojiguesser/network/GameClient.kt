package com.emojiguesser.network

import com.emojiguesser.BuildConfig
import com.emojiguesser.data.ActionReply
import com.emojiguesser.data.ClientMessage
import com.emojiguesser.data.ServerMessage
import com.emojiguesser.util.Logger
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.json.Json
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.coroutineContext
import kotlin.coroutines.resumeWithException

/**
 * Talks to the game server. Actions are POSTed to /action, which answers with this client's own
 * messages; everything else in the current game arrives over /events as server-sent events.
 */
class GameClient(
    apiUrl: String = BuildConfig.API_URL,
    private val calls: Call.Factory = defaultHttp,
    private val events: EventSource.Factory = EventSources.createFactory(
        // The server pings every 15s, so a quiet minute means the stream is dead.
        defaultHttp.newBuilder().readTimeout(45, TimeUnit.SECONDS).build()
    ),
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
) {
    companion object {
        private const val TAG = "GameClient"
        private const val MAX_RECONNECT_ATTEMPTS = 5
        private const val INITIAL_RECONNECT_DELAY = 1000L
        private const val MAX_STREAM_RETRY_DELAY = 15_000L
        private const val STREAM_FAILURES_UNTIL_DOWN = 5
        // A stream has to stay open this long before it counts as healthy.
        private const val STREAM_SETTLE_TIME = 5_000L
        private val JSON_TYPE = "application/json; charset=utf-8".toMediaType()

        private val defaultHttp by lazy {
            OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(20, TimeUnit.SECONDS)
                .build()
        }
    }

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    private val baseUrl: HttpUrl = apiUrl.toHttpUrl()
    private val actionUrl = baseUrl.newBuilder().addPathSegment("action").build()

    // Guards everything below; OkHttp calls back on its own threads.
    private val lock = Any()

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState

    // Unbounded, so tryEmit never drops a message and each caller's messages keep their order.
    private val _messages = MutableSharedFlow<ServerMessage>(extraBufferCapacity = Channel.UNLIMITED)
    val messages: SharedFlow<ServerMessage> = _messages

    @Volatile var sessionId: String? = null

    /** The game whose events are streaming, if any. */
    val currentGameId: String? get() = synchronized(lock) { streamGameId }

    private var reconnectAttempts = 0
    private var helloJob: Job? = null
    private var reconnectJob: Job? = null

    private var outbox = Channel<Outgoing>(Channel.UNLIMITED)
    private var sender: Job? = null
    private var lastPlayerName: String? = null
    private var leftGameId: String? = null

    private var streamGameId: String? = null
    private var cursor = 0
    private var source: EventSource? = null
    private var streamFailures = 0
    private var streamRetry: Job? = null
    private var settle: Job? = null
    private var settled = false

    private class Outgoing(val message: ClientMessage, val onFailed: (() -> Unit)? = null)

    fun connect() {
        synchronized(lock) {
            val state = _connectionState.value
            if (state == ConnectionState.CONNECTED || state == ConnectionState.CONNECTING) return
            _connectionState.value = ConnectionState.CONNECTING
            helloJob = scope.launch { hello() }
        }
    }

    private suspend fun hello() {
        val reply = try {
            post(ClientMessage(action = "hello", sessionId = sessionId))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Logger.e(TAG, "Hello failed", e)
            synchronized(lock) {
                coroutineContext.ensureActive()
                handleDisconnect()
            }
            return
        }
        synchronized(lock) {
            coroutineContext.ensureActive()
            onConnected()
        }
        receive(reply)
    }

    private fun onConnected() {
        _connectionState.value = ConnectionState.CONNECTED
        reconnectAttempts = 0
        // Back online: pick the stream up now rather than at its next retry.
        if (streamGameId != null && source == null) {
            streamRetry?.cancel()
            streamRetry = null
            openStream()
        }
    }

    private fun handleDisconnect() {
        _connectionState.value = ConnectionState.DISCONNECTED

        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            val delayMs = INITIAL_RECONNECT_DELAY * (1 shl reconnectAttempts)
            Logger.d(TAG, "Reconnecting in ${delayMs}ms (attempt ${reconnectAttempts + 1})")
            reconnectJob?.cancel()
            reconnectJob = scope.launch {
                delay(delayMs)
                synchronized(lock) { reconnectAttempts++ }
                connect()
            }
        } else {
            _connectionState.value = ConnectionState.FAILED
            pauseStream()
        }
    }

    // What a dropped socket used to do: show the connection as down and let hello find the way back.
    private fun reportDown() {
        if (_connectionState.value == ConnectionState.CONNECTED) handleDisconnect()
    }

    fun send(message: ClientMessage) = enqueue(Outgoing(message))

    private fun enqueue(item: Outgoing) {
        val message = item.message.let { if (it.sessionId == null) it.copy(sessionId = sessionId) else it }
        synchronized(lock) {
            when (message.action) {
                "createGame", "joinGame" -> lastPlayerName = message.playerName
                "updatePlayerName" -> lastPlayerName = message.name
            }
            // One action at a time, so the server sees them in the order they were made.
            if (sender?.isActive != true) {
                val queue = outbox
                sender = scope.launch { for (next in queue) deliver(next) }
            }
            outbox.trySend(Outgoing(message, item.onFailed))
        }
    }

    private suspend fun deliver(item: Outgoing) {
        val message = item.message
        val reply = try {
            post(message)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Logger.e(TAG, "${message.action} failed", e)
            synchronized(lock) {
                coroutineContext.ensureActive()
                if (e is IOException) reportDown()
            }
            item.onFailed?.invoke()
            return
        }
        synchronized(lock) {
            coroutineContext.ensureActive()
            // A reply still on its way for a game the player walked out of is stale.
            if (message.action != "leaveGame" && message.gameId != null && message.gameId == leftGameId) return
        }
        receive(reply)
    }

    private fun receive(reply: ActionReply) {
        reply.messages.forEach { _messages.tryEmit(it) }
        val stream = reply.stream ?: return
        synchronized(lock) {
            val after = stream.after
            when {
                after != null && stream.gameId != streamGameId -> startStream(stream.gameId, after)
                after == null && stream.gameId == streamGameId -> stopStream()
            }
        }
    }

    private suspend fun post(message: ClientMessage): ActionReply {
        val body = json.encodeToString(ClientMessage.serializer(), message)
        Logger.d(TAG, "Sending: $body")
        val request = Request.Builder().url(actionUrl).post(body.toRequestBody(JSON_TYPE)).build()
        return json.decodeFromString(ActionReply.serializer(), calls.newCall(request).await())
    }

    private suspend fun Call.await(): String = suspendCancellableCoroutine { cont ->
        cont.invokeOnCancellation { cancel() }
        enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) = cont.resumeWithException(e)

            override fun onResponse(call: Call, response: Response) = cont.resumeWith(runCatching {
                response.use {
                    if (!it.isSuccessful) throw HttpStatusException(it.code)
                    it.body!!.string()
                }
            })
        })
    }

    private class HttpStatusException(code: Int) : Exception("HTTP $code")

    private fun startStream(gameId: String, after: Int) {
        if (streamGameId != null) stopStream()
        streamGameId = gameId
        cursor = after
        openStream()
    }

    private fun stopStream() {
        pauseStream()
        streamGameId = null
        streamFailures = 0
    }

    // Keeps the game and cursor, so a later hello can resume from the last event.
    private fun pauseStream() {
        streamRetry?.cancel()
        streamRetry = null
        source?.cancel()
        dropSource()
    }

    private fun dropSource() {
        source = null
        settle?.cancel()
        settle = null
        settled = false
    }

    private fun openStream() {
        val gameId = streamGameId ?: return
        val url = baseUrl.newBuilder()
            .addPathSegment("events")
            .addQueryParameter("gameId", gameId)
            .addQueryParameter("sessionId", sessionId)
            .addQueryParameter("after", cursor.toString())
            .build()
        val request = Request.Builder().url(url).header("Accept", "text/event-stream").build()
        source = events.newEventSource(request, listener)
    }

    private val listener = object : EventSourceListener() {
        override fun onOpen(eventSource: EventSource, response: Response) {
            synchronized(lock) {
                if (eventSource !== source) return
                settle = scope.launch {
                    delay(STREAM_SETTLE_TIME)
                    synchronized(lock) {
                        ensureActive()
                        settled = true
                        streamFailures = 0
                    }
                }
            }
        }

        override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
            synchronized(lock) {
                if (eventSource !== source) return
                id?.toIntOrNull()?.let { cursor = it }
            }
            try {
                _messages.tryEmit(json.decodeFromString(ServerMessage.serializer(), data))
            } catch (e: Exception) {
                Logger.e(TAG, "Failed to parse event: $data", e)
            }
        }

        // The server rolls every stream over after a few minutes, so carry straight on from the
        // last event. One that closes before it settles is a server in trouble: back off instead.
        override fun onClosed(eventSource: EventSource) {
            synchronized(lock) {
                if (eventSource !== source) return
                val rollover = settled
                dropSource()
                if (rollover) openStream() else streamFailed { openStream() }
            }
        }

        override fun onFailure(eventSource: EventSource, t: Throwable?, response: Response?) {
            synchronized(lock) {
                if (eventSource !== source) return
                Logger.e(TAG, "Event stream failed (${response?.code})", t)
                dropSource()
                when (response?.code) {
                    // Away long enough that the server dropped this session.
                    403 -> streamFailed { rejoin() }
                    404 -> stopStream()
                    else -> streamFailed { openStream() }
                }
            }
        }
    }

    private fun streamFailed(next: () -> Unit) {
        streamFailures++
        val backoff = INITIAL_RECONNECT_DELAY shl minOf(streamFailures - 1, 4)
        retryStream(minOf(backoff, MAX_STREAM_RETRY_DELAY), next)
        if (streamFailures >= STREAM_FAILURES_UNTIL_DOWN) reportDown()
    }

    private fun retryStream(delayMs: Long, next: () -> Unit) {
        if (_connectionState.value == ConnectionState.FAILED) return
        streamRetry?.cancel()
        streamRetry = scope.launch {
            delay(delayMs)
            synchronized(lock) {
                // Whatever changes the stream cancels this under the lock first.
                ensureActive()
                streamRetry = null
                next()
            }
        }
    }

    private fun rejoin() {
        val gameId = streamGameId ?: return
        // Not streaming any more, so the join's reply starts a fresh stream like any other.
        streamGameId = null
        val join = ClientMessage(action = "joinGame", gameId = gameId, sessionId = sessionId, playerName = lastPlayerName)
        enqueue(Outgoing(join) {
            synchronized(lock) {
                if (streamGameId == null && leftGameId != gameId) {
                    streamGameId = gameId
                    streamFailed { rejoin() }
                }
            }
        })
    }

    fun createGame(sessionId: String, playerName: String, timeLimit: Int = 120, maxRounds: Int = 2, isPublic: Boolean = false) {
        this.sessionId = sessionId
        send(ClientMessage(
            action = "createGame",
            sessionId = sessionId,
            playerName = playerName,
            timeLimit = timeLimit,
            maxRounds = maxRounds,
            isPublic = isPublic
        ))
    }

    fun joinGame(gameId: String, sessionId: String, playerName: String) {
        this.sessionId = sessionId
        synchronized(lock) { if (leftGameId == gameId) leftGameId = null }
        send(ClientMessage(
            action = "joinGame",
            gameId = gameId,
            sessionId = sessionId,
            playerName = playerName
        ))
    }

    fun startGame(gameId: String, sessionId: String, timeLimit: Int = 120, maxRounds: Int = 2) {
        send(ClientMessage(
            action = "startGame",
            gameId = gameId,
            sessionId = sessionId,
            timeLimit = timeLimit,
            maxRounds = maxRounds
        ))
    }

    fun chooseWord(gameId: String, word: String) {
        send(ClientMessage(action = "chooseWord", gameId = gameId, word = word))
    }

    fun submitEmoji(gameId: String, emoji: String) {
        send(ClientMessage(action = "submitEmoji", gameId = gameId, emoji = emoji))
    }

    fun submitGuess(gameId: String, guess: String) {
        send(ClientMessage(action = "submitGuess", gameId = gameId, guess = guess))
    }

    fun listPublicGames() {
        send(ClientMessage(action = "listPublicGames"))
    }

    fun restartGame(gameId: String, sessionId: String, timeLimit: Int = 120) {
        send(ClientMessage(
            action = "restartGame",
            gameId = gameId,
            sessionId = sessionId,
            timeLimit = timeLimit
        ))
    }

    fun updatePlayerName(gameId: String, name: String, sessionId: String) {
        send(ClientMessage(
            action = "updatePlayerName",
            gameId = gameId,
            name = name,
            sessionId = sessionId
        ))
    }

    /** Stops the game's events straight away, then tells the server the player has gone. */
    fun leaveGame(gameId: String) {
        synchronized(lock) {
            leftGameId = gameId
            if (streamGameId == gameId) stopStream()
        }
        send(ClientMessage(action = "leaveGame", gameId = gameId))
    }

    fun disconnect() {
        synchronized(lock) {
            helloJob?.cancel()
            helloJob = null
            reconnectJob?.cancel()
            reconnectJob = null
            sender?.cancel()
            sender = null
            outbox.cancel()
            outbox = Channel(Channel.UNLIMITED)
            stopStream()
            leftGameId = null
            _connectionState.value = ConnectionState.DISCONNECTED
        }
    }

    fun resetReconnectAttempts() {
        synchronized(lock) { reconnectAttempts = 0 }
    }
}

enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    FAILED
}
