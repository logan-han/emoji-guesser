package com.emojiguesser.data

import android.media.SoundPool
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.test.core.app.ApplicationProvider
import com.emojiguesser.EmojiGuesserApp
import com.emojiguesser.audio.SoundEvent
import com.emojiguesser.audio.SoundManager
import com.emojiguesser.network.GameClient
import com.emojiguesser.testing.EMPTY_REPLY
import com.emojiguesser.testing.FakeCallFactory
import com.emojiguesser.testing.FakeEventSourceFactory
import com.emojiguesser.testing.str
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.Json
import org.junit.rules.ExternalResource
import org.robolectric.Shadows.shadowOf
import org.robolectric.shadows.ShadowVibrator

/** A GameViewModel over a fake server and a test Main dispatcher, cleared after each test. */
@OptIn(ExperimentalCoroutinesApi::class)
class GameViewModelRule : ExternalResource() {
    val dispatcher = UnconfinedTestDispatcher()
    val http = FakeCallFactory()
    val streams = FakeEventSourceFactory()
    lateinit var app: EmojiGuesserApp
    lateinit var client: GameClient
    lateinit var vm: GameViewModel

    private val clientScope = CoroutineScope(SupervisorJob() + dispatcher)
    private val store = ViewModelStore()
    private val json = Json
    private var lastEventId = 0

    override fun before() {
        Dispatchers.setMain(dispatcher)
        app = ApplicationProvider.getApplicationContext()
        // Settings live in a process-wide DataStore; pin them on so sound and haptic checks hold.
        runBlocking {
            app.settings.setSounds(true)
            app.settings.setHaptics(true)
        }
        app.sounds.enabled = true
        app.haptics.enabled = true
        vm = newViewModel("main")
    }

    override fun after() {
        store.clear()
        clientScope.cancel()
        Dispatchers.resetMain()
    }

    fun newViewModel(key: String): GameViewModel = ViewModelProvider(store, object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            client = GameClient(API_URL, http, streams, clientScope)
            return GameViewModel(app, client) as T
        }
    })[key, GameViewModel::class.java]

    fun clear() = store.clear()

    fun advance(ms: Long) {
        dispatcher.scheduler.advanceTimeBy(ms)
        dispatcher.scheduler.runCurrent()
    }

    /** Says hello, then answers every action with no messages. */
    fun connect() {
        vm.connect()
        // The hello reply opens a stream on G1, so tests can play the server through it.
        http.last.reply("""{"messages":[],"stream":{"gameId":"G1","after":0}}""")
        streams.last.open()
        http.autoReply = EMPTY_REPLY
    }

    fun server(message: ServerMessage) =
        streams.last.event("${++lastEventId}", json.encodeToString(ServerMessage.serializer(), message))

    /** The actions sent after hello, as JSON bodies. */
    fun sent() = http.calls.map { it.json }.filter { it.str("action") != "hello" }

    fun plays(event: SoundEvent): Int {
        val pool = SoundManager::class.java.getDeclaredField("pool").apply { isAccessible = true }.get(app.sounds) as SoundPool
        return shadowOf(pool).getResourcePlaybacks(event.resId).size
    }

    /** SDK 31+ haptics are recorded as effect segments; returns the last predefined effect id, or 0. */
    fun lastHaptic(): Int {
        val segments = ShadowVibrator::class.java.getDeclaredField("vibrationEffectSegments")
            .apply { isAccessible = true }.get(null) as List<*>
        val segment = segments.lastOrNull() ?: return 0
        return segment.javaClass.getMethod("getEffectId").invoke(segment) as Int
    }

    companion object {
        const val API_URL = "https://api.test/api"
    }
}
