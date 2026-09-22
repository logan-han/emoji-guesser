package com.emojiguesser

import android.app.NotificationManager
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class EmojiGuesserAppTest {
    private val app = ApplicationProvider.getApplicationContext<EmojiGuesserApp>()

    @After
    fun restoreDefaults() = runBlocking {
        app.settings.setSounds(true)
        app.settings.setHaptics(true)
    }

    // The app applies settings on its own background scope, so wait for it to catch up.
    private suspend fun awaitUntil(condition: () -> Boolean) = withTimeout(5_000) {
        while (!condition()) delay(10)
    }

    @Test
    fun `registers the game invites notification channel`() {
        val channel = app.getSystemService(NotificationManager::class.java)
            .getNotificationChannel(EmojiGuesserApp.CHANNEL_GAME_INVITES)

        assertEquals("Game invites", channel.name)
        assertEquals("Notifies you when a friend invites you to a game.", channel.description)
        assertEquals(NotificationManager.IMPORTANCE_HIGH, channel.importance)
    }

    @Test
    fun `settings toggles reach the sound and haptic managers`() = runBlocking {
        awaitUntil { app.sounds.enabled && app.haptics.enabled }

        app.settings.setSounds(false)
        app.settings.setHaptics(false)
        awaitUntil { !app.sounds.enabled && !app.haptics.enabled }

        app.settings.setSounds(true)
        app.settings.setHaptics(true)
        awaitUntil { app.sounds.enabled && app.haptics.enabled }
    }
}
