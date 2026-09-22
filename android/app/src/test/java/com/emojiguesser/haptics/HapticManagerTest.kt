package com.emojiguesser.haptics

import android.content.Context
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Shadows.shadowOf
import org.robolectric.shadows.ShadowVibrator

@RunWith(AndroidJUnit4::class)
class HapticManagerTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private val haptics = HapticManager(context)

    // On SDK 31+ Robolectric only keeps the last effect's segments, in a field with no getter.
    @Suppress("UNCHECKED_CAST")
    private fun lastVibration(): List<Any> =
        ShadowVibrator::class.java.getDeclaredField("vibrationEffectSegments").apply { isAccessible = true }.get(null) as List<Any>

    @Suppress("UNCHECKED_CAST")
    private fun segmentsOf(effectId: Int): List<Any> =
        VibrationEffect.createPredefined(effectId).let { it.javaClass.getMethod("getSegments").invoke(it) as List<Any> }

    @Test
    fun `each cue plays its predefined effect`() {
        listOf(
            haptics::click to VibrationEffect.EFFECT_TICK,
            haptics::success to VibrationEffect.EFFECT_HEAVY_CLICK,
            haptics::warn to VibrationEffect.EFFECT_DOUBLE_CLICK
        ).forEach { (cue, effect) ->
            cue()
            assertEquals(segmentsOf(effect), lastVibration())
        }
    }

    @Test
    fun `disabled haptics stay still`() {
        haptics.enabled = false

        haptics.click()

        assertTrue(lastVibration().isEmpty())
    }

    @Test
    fun `devices without a vibrator are skipped`() {
        shadowOf(context.getSystemService(Vibrator::class.java)).setHasVibrator(false)

        haptics.success()

        assertTrue(lastVibration().isEmpty())
    }
}
