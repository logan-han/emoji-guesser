package com.emojiguesser.settings

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SettingsRepositoryTest {
    private val settings = SettingsRepository(ApplicationProvider.getApplicationContext())

    // The DataStore is a process-wide singleton, so later tests (and every app start) would inherit a false.
    @After
    fun restoreDefaults() = runBlocking {
        settings.setSounds(true)
        settings.setHaptics(true)
    }

    @Test
    fun `sounds and haptics start on`() = runBlocking {
        assertTrue(settings.soundsEnabled.first())
        assertTrue(settings.hapticsEnabled.first())
    }

    @Test
    fun `each toggle persists on its own`() = runBlocking {
        settings.setSounds(false)
        assertFalse(settings.soundsEnabled.first())
        assertTrue(settings.hapticsEnabled.first())

        settings.setHaptics(false)
        assertFalse(settings.hapticsEnabled.first())

        settings.setSounds(true)
        assertTrue(settings.soundsEnabled.first())
    }
}
