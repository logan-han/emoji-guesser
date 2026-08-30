package com.emojiguesser.network

import com.emojiguesser.BuildConfig
import com.emojiguesser.data.ServerMessage
import com.emojiguesser.util.Logger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

/**
 * Minimal Supabase Realtime client (Phoenix Channels protocol) used to receive
 * game broadcast events that the backend publishes via supabase channels.
 */
class SupabaseRealtimeClient {
    companion object {
        private const val TAG = "SupabaseRealtime"
        private const val HEARTBEAT_INTERVAL = 30_000L
        private const val RECONNECT_DELAY = 2_000L
    }

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .connectTimeout(10, TimeUnit.SECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .build()

    private val scope = CoroutineScope(Dispatchers.IO)
    private val refCounter = AtomicLong(1)

    private var webSocket: WebSocket? = null
    private var heartbeatJob: Job? = null
    private var reconnectJob: Job? = null
    private var currentGameId: String? = null
    private var shouldReconnect = false

    private val _messages = MutableSharedFlow<ServerMessage>(extraBufferCapacity = 100)
    val messages: SharedFlow<ServerMessage> = _messages

    private fun realtimeUrl(): String? {
        val rawUrl = BuildConfig.SUPABASE_URL.takeIf { it.isNotBlank() } ?: return null
        val anonKey = BuildConfig.SUPABASE_ANON_KEY.takeIf { it.isNotBlank() } ?: return null
        val wsHost = rawUrl
            .removePrefix("https://")
            .removePrefix("http://")
            .trimEnd('/')
        return "wss://$wsHost/realtime/v1/websocket?apikey=$anonKey&vsn=1.0.0"
    }

    fun subscribe(gameId: String) {
        if (currentGameId == gameId && webSocket != null) return
        unsubscribe()

        val url = realtimeUrl() ?: run {
            Logger.e(TAG, "Supabase URL/anon key not configured, realtime disabled")
            return
        }

        currentGameId = gameId
        shouldReconnect = true
        openSocket(url, gameId)
    }

    fun unsubscribe() {
        shouldReconnect = false
        reconnectJob?.cancel()
        reconnectJob = null
        stopHeartbeat()
        webSocket?.close(1000, "client unsubscribed")
        webSocket = null
        currentGameId = null
    }

    private fun openSocket(url: String, gameId: String) {
        val request = Request.Builder().url(url).build()
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Logger.d(TAG, "Realtime WS open for game:$gameId")
                joinChannel(webSocket, gameId)
                startHeartbeat(webSocket)
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleIncoming(text)
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Logger.d(TAG, "Realtime WS closed: $code $reason")
                stopHeartbeat()
                scheduleReconnectIfNeeded()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Logger.e(TAG, "Realtime WS failure", t)
                stopHeartbeat()
                scheduleReconnectIfNeeded()
            }
        })
    }

    private fun joinChannel(ws: WebSocket, gameId: String) {
        val msg = buildJsonObject {
            put("topic", "realtime:game:$gameId")
            put("event", "phx_join")
            put("payload", buildJsonObject {
                put("config", buildJsonObject {
                    put("broadcast", buildJsonObject {
                        put("self", false)
                    })
                    put("presence", buildJsonObject { put("key", "") })
                })
            })
            put("ref", refCounter.getAndIncrement().toString())
        }
        ws.send(json.encodeToString(JsonObject.serializer(), msg))
    }

    private fun startHeartbeat(ws: WebSocket) {
        stopHeartbeat()
        heartbeatJob = scope.launch {
            while (true) {
                delay(HEARTBEAT_INTERVAL)
                val msg = buildJsonObject {
                    put("topic", "phoenix")
                    put("event", "heartbeat")
                    put("payload", buildJsonObject { })
                    put("ref", refCounter.getAndIncrement().toString())
                }
                ws.send(json.encodeToString(JsonObject.serializer(), msg))
            }
        }
    }

    private fun stopHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = null
    }

    private fun handleIncoming(text: String) {
        val root = try {
            json.parseToJsonElement(text).jsonObject
        } catch (e: Exception) {
            Logger.e(TAG, "Failed to parse realtime payload: $text", e)
            return
        }

        val event = root["event"]?.jsonPrimitive?.contentOrNull ?: return
        if (event != "broadcast") return

        val outer = root["payload"]?.jsonObject ?: return
        val inner = outer["payload"]?.jsonObject ?: return
        val broadcastEvent = outer["event"]?.jsonPrimitive?.contentOrNull
        if (broadcastEvent != "game_event") return

        val message = try {
            json.decodeFromJsonElement(ServerMessage.serializer(), inner)
        } catch (e: Exception) {
            Logger.e(TAG, "Failed to decode game_event: $inner", e)
            return
        }
        scope.launch { _messages.emit(message) }
    }

    private fun scheduleReconnectIfNeeded() {
        if (!shouldReconnect) return
        val gameId = currentGameId ?: return
        val url = realtimeUrl() ?: return
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            delay(RECONNECT_DELAY)
            if (shouldReconnect && currentGameId == gameId) {
                openSocket(url, gameId)
            }
        }
    }
}
