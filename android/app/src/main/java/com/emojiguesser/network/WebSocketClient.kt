package com.emojiguesser.network

import com.emojiguesser.BuildConfig
import com.emojiguesser.data.ServerMessage
import com.emojiguesser.data.WebSocketMessage
import com.emojiguesser.util.Logger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit

class WebSocketClient {
    companion object {
        private const val TAG = "WebSocketClient"
        private const val MAX_RECONNECT_ATTEMPTS = 5
        private const val INITIAL_RECONNECT_DELAY = 1000L
        private const val HEARTBEAT_INTERVAL = 5000L
    }

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .connectTimeout(10, TimeUnit.SECONDS)
        .build()

    private var webSocket: WebSocket? = null
    private var reconnectAttempts = 0
    private var heartbeatJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO)

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState

    private val _messages = MutableSharedFlow<ServerMessage>(extraBufferCapacity = 100)
    val messages: SharedFlow<ServerMessage> = _messages

    var sessionId: String? = null
    var currentGameId: String? = null

    fun connect() {
        if (_connectionState.value == ConnectionState.CONNECTED ||
            _connectionState.value == ConnectionState.CONNECTING) {
            return
        }

        _connectionState.value = ConnectionState.CONNECTING

        val request = Request.Builder()
            .url(BuildConfig.WS_URL)
            .build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Logger.d(TAG, "WebSocket connected")
                _connectionState.value = ConnectionState.CONNECTED
                reconnectAttempts = 0
                startHeartbeat()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                Logger.d(TAG, "Received: $text")
                try {
                    val message = json.decodeFromString<ServerMessage>(text)
                    scope.launch {
                        _messages.emit(message)
                    }
                } catch (e: Exception) {
                    Logger.e(TAG, "Failed to parse message: $text", e)
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                Logger.d(TAG, "WebSocket closing: $code - $reason")
                webSocket.close(1000, null)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Logger.d(TAG, "WebSocket closed: $code - $reason")
                handleDisconnect()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Logger.e(TAG, "WebSocket failure", t)
                handleDisconnect()
            }
        })
    }

    private fun handleDisconnect() {
        _connectionState.value = ConnectionState.DISCONNECTED
        stopHeartbeat()

        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            scope.launch {
                val delayMs = INITIAL_RECONNECT_DELAY * (1 shl reconnectAttempts)
                Logger.d(TAG, "Reconnecting in ${delayMs}ms (attempt ${reconnectAttempts + 1})")
                delay(delayMs)
                reconnectAttempts++
                connect()
            }
        } else {
            _connectionState.value = ConnectionState.FAILED
        }
    }

    private fun startHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (true) {
                delay(HEARTBEAT_INTERVAL)
                sendHeartbeat()
            }
        }
    }

    private fun stopHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = null
    }

    private fun sendHeartbeat() {
        val message = WebSocketMessage(
            action = "heartbeat",
            sessionId = sessionId,
            gameId = currentGameId
        )
        send(message)
    }

    fun send(message: WebSocketMessage) {
        val jsonString = json.encodeToString(message)
        Logger.d(TAG, "Sending: $jsonString")
        webSocket?.send(jsonString)
    }

    fun createGame(sessionId: String, playerName: String, timeLimit: Int = 120, maxRounds: Int = 2, isPublic: Boolean = false) {
        this.sessionId = sessionId
        send(WebSocketMessage(
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
        this.currentGameId = gameId
        send(WebSocketMessage(
            action = "joinGame",
            gameId = gameId,
            sessionId = sessionId,
            playerName = playerName
        ))
    }

    fun startGame(gameId: String, sessionId: String, timeLimit: Int = 120, maxRounds: Int = 2) {
        send(WebSocketMessage(
            action = "startGame",
            gameId = gameId,
            sessionId = sessionId,
            timeLimit = timeLimit,
            maxRounds = maxRounds
        ))
    }

    fun chooseWord(gameId: String, word: String) {
        send(WebSocketMessage(
            action = "chooseWord",
            gameId = gameId,
            word = word
        ))
    }

    fun submitEmoji(gameId: String, emoji: String) {
        send(WebSocketMessage(
            action = "submitEmoji",
            gameId = gameId,
            emoji = emoji
        ))
    }

    fun submitGuess(gameId: String, guess: String) {
        send(WebSocketMessage(
            action = "submitGuess",
            gameId = gameId,
            guess = guess
        ))
    }

    fun listPublicGames() {
        send(WebSocketMessage(action = "listPublicGames"))
    }

    fun restartGame(gameId: String, sessionId: String, timeLimit: Int = 120) {
        send(WebSocketMessage(
            action = "restartGame",
            gameId = gameId,
            sessionId = sessionId,
            timeLimit = timeLimit
        ))
    }

    fun updatePlayerName(gameId: String, name: String, sessionId: String) {
        send(WebSocketMessage(
            action = "updatePlayerName",
            gameId = gameId,
            name = name,
            sessionId = sessionId
        ))
    }

    fun disconnect() {
        stopHeartbeat()
        webSocket?.close(1000, "User disconnected")
        webSocket = null
        _connectionState.value = ConnectionState.DISCONNECTED
        currentGameId = null
    }

    fun resetReconnectAttempts() {
        reconnectAttempts = 0
    }
}

enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    FAILED
}
