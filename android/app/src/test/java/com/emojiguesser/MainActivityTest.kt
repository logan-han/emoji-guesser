package com.emojiguesser

import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollTo
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.emojiguesser.data.GameViewModel
import com.emojiguesser.network.SupabaseRealtimeClient
import com.emojiguesser.network.WebSocketClient
import com.emojiguesser.testing.FakeSocketFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MainActivityTest {
    @get:Rule val compose = createEmptyComposeRule()

    private val app = ApplicationProvider.getApplicationContext<EmojiGuesserApp>()
    private val sockets = FakeSocketFactory()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
    private var seeder: Application.ActivityLifecycleCallbacks? = null

    private val factory = object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            GameViewModel(app, WebSocketClient(sockets, scope), SupabaseRealtimeClient("", "", sockets, scope)) as T
    }

    @After
    fun tearDown() {
        seeder?.let(app::unregisterActivityLifecycleCallbacks)
        scope.cancel()
    }

    // viewModel() returns whatever already sits under the default key, so seed a fake-backed one before onCreate.
    private fun launch(intent: Intent = Intent(app, MainActivity::class.java)): ActivityScenario<MainActivity> {
        seeder = object : Application.ActivityLifecycleCallbacks {
            override fun onActivityPreCreated(activity: Activity, savedInstanceState: Bundle?) {
                ViewModelProvider(activity as ComponentActivity, factory)[GameViewModel::class.java]
            }
            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
            override fun onActivityStarted(activity: Activity) = Unit
            override fun onActivityResumed(activity: Activity) = Unit
            override fun onActivityPaused(activity: Activity) = Unit
            override fun onActivityStopped(activity: Activity) = Unit
            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
            override fun onActivityDestroyed(activity: Activity) = Unit
        }.also(app::registerActivityLifecycleCallbacks)
        return ActivityScenario.launch<MainActivity>(intent).also { compose.waitForIdle() }
    }

    private fun deepLink(gameId: String) =
        Intent(Intent.ACTION_VIEW, Uri.parse("https://emoji.han.life/game/$gameId")).setClass(app, MainActivity::class.java)

    private fun savePlayerName(name: String) {
        app.getSharedPreferences("emoji_guesser", Context.MODE_PRIVATE).edit().putString("player_name", name).commit()
    }

    private fun sentActions() = sockets.last.sentJson.map { it.getValue("action").jsonPrimitive.content }

    @Test
    fun `connects on launch and shows the lobby once the socket opens`() {
        launch()

        assertEquals(1, sockets.sockets.size)
        compose.onNodeWithText("Connecting…").assertIsDisplayed()

        sockets.last.open()

        compose.onNodeWithText("Create a game").assertIsDisplayed()
    }

    @Test
    fun `a deep link joins the game when a name is saved`() {
        savePlayerName("Ann")

        launch(deepLink("ABC123"))

        val join = sockets.last.sentJson.single { it.getValue("action").jsonPrimitive.content == "joinGame" }
        assertEquals("ABC123", join.getValue("gameId").jsonPrimitive.content)
        assertEquals("Ann", join.getValue("playerName").jsonPrimitive.content)
    }

    @Test
    fun `a deep link waits in the lobby until the player has a name`() {
        launch(deepLink("ABC123"))
        sockets.last.open()

        compose.onNodeWithText("ABC123").performScrollTo().assertIsDisplayed()
        assertTrue("joinGame" !in sentActions())
    }

    @Test
    fun `closing the activity disconnects the socket`() {
        launch().close()

        assertEquals(1000, sockets.last.closeCode)
        assertEquals("User disconnected", sockets.last.closeReason)
    }
}
