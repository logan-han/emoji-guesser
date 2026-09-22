package com.emojiguesser.audio

import android.media.SoundPool
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.emojiguesser.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Shadows.shadowOf

@RunWith(AndroidJUnit4::class)
class SoundManagerTest {
    private val sounds = SoundManager(ApplicationProvider.getApplicationContext())

    // The pool is private; its shadow is the only record of what played.
    private val pool
        get() = shadowOf(SoundManager::class.java.getDeclaredField("pool").apply { isAccessible = true }.get(sounds) as SoundPool)

    @Test
    fun `every event plays its own sound`() {
        SoundEvent.entries.forEach { sounds.play(it) }

        SoundEvent.entries.forEach { assertTrue(it.name, pool.wasResourcePlayed(it.resId)) }
        assertEquals(1f, pool.getResourcePlaybacks(R.raw.button_click).single().rate)
    }

    @Test
    fun `plays at the requested rate`() {
        sounds.play(SoundEvent.TimeUp, rate = 1.5f)

        assertEquals(1.5f, pool.getResourcePlaybacks(R.raw.time_up).single().rate)
    }

    @Test
    fun `muted sounds stay silent`() {
        sounds.enabled = false

        sounds.play(SoundEvent.GameStart)

        assertFalse(pool.wasResourcePlayed(R.raw.game_start))
    }

    @Test
    fun `released sounds stay silent`() {
        sounds.release()

        sounds.play(SoundEvent.ButtonClick)

        assertFalse(pool.wasResourcePlayed(R.raw.button_click))
    }
}
