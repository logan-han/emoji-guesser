package com.emojiguesser.testing

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okio.Buffer
import okio.Timeout
import java.io.IOException

const val EMPTY_REPLY = """{"messages":[]}"""

/** Stands in for OkHttp's calls: records every request the client makes and lets tests answer it. */
class FakeCallFactory : Call.Factory {
    val calls = mutableListOf<FakeCall>()
    val last: FakeCall get() = calls.last()

    /** When set, every call is answered with this body as soon as it is sent. */
    var autoReply: String? = null

    override fun newCall(request: Request): Call = FakeCall(request, this).also { calls += it }

    fun actions(): List<String?> = calls.map { it.json.str("action") }
}

class FakeCall(private val request: Request, private val factory: FakeCallFactory) : Call {
    private var callback: Callback? = null
    private var canceled = false

    val json: JsonObject get() = Json.parseToJsonElement(Buffer().also { request.body!!.writeTo(it) }.readUtf8()).jsonObject

    override fun request(): Request = request
    override fun execute(): Response = throw UnsupportedOperationException("the client only enqueues")
    override fun isExecuted() = callback != null
    override fun cancel() { canceled = true }
    override fun isCanceled() = canceled
    override fun timeout(): Timeout = Timeout.NONE
    override fun clone(): Call = FakeCall(request, factory)

    override fun enqueue(responseCallback: Callback) {
        callback = responseCallback
        factory.autoReply?.let { reply(it) }
    }

    fun reply(body: String = EMPTY_REPLY, code: Int = 200) = callback!!.onResponse(this, response(request, code, body))
    fun fail(e: IOException = IOException("offline")) = callback!!.onFailure(this, e)
}

/** Stands in for okhttp-sse: records every stream the client opens and lets tests play the server. */
class FakeEventSourceFactory : EventSource.Factory {
    val sources = mutableListOf<FakeEventSource>()
    val last: FakeEventSource get() = sources.last()

    override fun newEventSource(request: Request, listener: EventSourceListener): EventSource =
        FakeEventSource(request, listener).also { sources += it }
}

class FakeEventSource(private val request: Request, private val listener: EventSourceListener) : EventSource {
    var canceled = false
        private set

    fun query(name: String): String? = request.url.queryParameter(name)

    override fun request(): Request = request
    override fun cancel() { canceled = true }

    fun open() = listener.onOpen(this, response(request, 200, type = "text/event-stream"))
    fun event(id: String?, data: String) = listener.onEvent(this, id, null, data)

    /** The server ending the response normally, as it does every few minutes. */
    fun end() = listener.onClosed(this)
    fun fail(t: Throwable = IOException("stream dropped")) = listener.onFailure(this, t, null)
    fun reject(code: Int) = listener.onFailure(this, null, response(request, code))
}

fun JsonObject.str(key: String): String? = this[key]?.jsonPrimitive?.contentOrNull

fun JsonObject.fields(vararg keys: String): List<String?> = keys.map { str(it) }

private fun response(request: Request, code: Int, body: String = "", type: String = "application/json") = Response.Builder()
    .request(request)
    .protocol(Protocol.HTTP_1_1)
    .code(code)
    .message("HTTP $code")
    .body(body.toResponseBody(type.toMediaType()))
    .build()
