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
import com.emojiguesser.network.ConnectionState
import com.emojiguesser.network.GameClient
import com.emojiguesser.testing.FakeCallFactory
import com.emojiguesser.testing.FakeEventSourceFactory
import com.emojiguesser.testing.str
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
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
    private val http = FakeCallFactory()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
    private val client = GameClient("https://api.test/api", http, FakeEventSourceFactory(), scope)
    private var seeder: Application.ActivityLifecycleCallbacks? = null

    private val factory = object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T = GameViewModel(app, client) as T
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

    private fun deepLink(gameId: String) = link("https://emoji.han.life/game/$gameId")

    private fun link(url: String) = Intent(Intent.ACTION_VIEW, Uri.parse(url)).setClass(app, MainActivity::class.java)

    private fun savePlayerName(name: String) {
        app.getSharedPreferences("emoji_guesser", Context.MODE_PRIVATE).edit().putString("player_name", name).commit()
    }

    private fun joins() = http.calls.map { it.json }.filter { it.str("action") == "joinGame" }

    @Test
    fun `says hello on launch and shows the lobby once the server answers`() {
        launch()

        assertEquals("hello", http.actions().first())
        compose.onNodeWithText("Connecting…").assertIsDisplayed()

        http.calls.first().reply()

        compose.onNodeWithText("Create a game").assertIsDisplayed()
    }

    @Test
    fun `a deep link joins the game when a name is saved`() {
        savePlayerName("Ann")

        launch(deepLink("ABC123"))

        val join = joins().single()
        assertEquals("ABC123", join.str("gameId"))
        assertEquals("Ann", join.str("playerName"))
    }

    @Test
    fun `the shared web link joins the game too`() {
        savePlayerName("Ann")

        launch(link("https://emoji.han.life/?gameId=XYZ789"))

        assertEquals("XYZ789", joins().single().str("gameId"))
    }

    @Test
    fun `a deep link waits in the lobby until the player has a name`() {
        launch(deepLink("ABC123"))
        http.calls.first().reply()

        compose.onNodeWithText("ABC123").performScrollTo().assertIsDisplayed()
        assertTrue(joins().isEmpty())
    }

    @Test
    fun `closing the activity disconnects`() {
        launch().close()

        assertTrue(http.calls.all { it.isCanceled() })
        assertEquals(ConnectionState.DISCONNECTED, client.connectionState.value)
    }
}
