package com.emojiguesser.data

import android.media.SoundPool
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.test.core.app.ApplicationProvider
import com.emojiguesser.EmojiGuesserApp
import com.emojiguesser.audio.SoundEvent
import com.emojiguesser.audio.SoundManager
import com.emojiguesser.network.SupabaseRealtimeClient
import com.emojiguesser.network.WebSocketClient
import com.emojiguesser.testing.FakeSocketFactory
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

/** A GameViewModel over fake sockets and a test Main dispatcher, cleared after each test. */
@OptIn(ExperimentalCoroutinesApi::class)
class GameViewModelRule : ExternalResource() {
    val dispatcher = UnconfinedTestDispatcher()
    val ws = FakeSocketFactory()
    val rt = FakeSocketFactory()
    lateinit var app: EmojiGuesserApp
    lateinit var wsClient: WebSocketClient
    lateinit var vm: GameViewModel

    private val clientScope = CoroutineScope(SupervisorJob() + dispatcher)
    private val store = ViewModelStore()
    private val json = Json

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
            wsClient = WebSocketClient(ws, clientScope)
            return GameViewModel(app, wsClient, SupabaseRealtimeClient(REALTIME_URL, "anon", rt, clientScope)) as T
        }
    })[key, GameViewModel::class.java]

    fun clear() = store.clear()

    fun advance(ms: Long) {
        dispatcher.scheduler.advanceTimeBy(ms)
        dispatcher.scheduler.runCurrent()
    }

    fun connect() {
        vm.connect()
        ws.last.open()
    }

    fun server(message: ServerMessage) = ws.last.receive(json.encodeToString(ServerMessage.serializer(), message))

    fun realtime(message: ServerMessage) = rt.last.receive(
        """{"event":"broadcast","payload":{"event":"game_event","payload":${json.encodeToString(ServerMessage.serializer(), message)}}}"""
    )

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
        const val REALTIME_URL = "https://proj.supabase.co"
    }
}
