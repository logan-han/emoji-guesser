package com.emojiguesser.testing

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString

/** Stands in for OkHttp: records every socket the client opens and lets tests play the server. */
class FakeSocketFactory : WebSocket.Factory {
    val sockets = mutableListOf<FakeWebSocket>()
    val last: FakeWebSocket get() = sockets.last()

    override fun newWebSocket(request: Request, listener: WebSocketListener): WebSocket =
        FakeWebSocket(request, listener).also { sockets += it }
}

class FakeWebSocket(private val request: Request, val listener: WebSocketListener) : WebSocket {
    val sent = mutableListOf<String>()
    var closeCode: Int? = null
    var closeReason: String? = null

    val sentJson: List<JsonObject> get() = sent.map { Json.parseToJsonElement(it).jsonObject }

    override fun request(): Request = request
    override fun queueSize(): Long = 0
    override fun send(text: String): Boolean = sent.add(text)
    override fun send(bytes: ByteString): Boolean = false
    override fun cancel() = Unit

    override fun close(code: Int, reason: String?): Boolean {
        closeCode = code
        closeReason = reason
        return true
    }

    fun open() = listener.onOpen(this, handshake())
    fun receive(text: String) = listener.onMessage(this, text)
    fun serverClosing(code: Int = 1001, reason: String = "going away") = listener.onClosing(this, code, reason)
    fun closed(code: Int = 1000, reason: String = "") = listener.onClosed(this, code, reason)
    fun fail(t: Throwable = RuntimeException("socket dropped")) = listener.onFailure(this, t, null)

    private fun handshake() = Response.Builder()
        .request(request)
        .protocol(Protocol.HTTP_1_1)
        .code(101)
        .message("Switching Protocols")
        .build()
}
