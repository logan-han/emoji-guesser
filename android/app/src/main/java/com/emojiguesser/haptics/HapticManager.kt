package com.emojiguesser.haptics

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

class HapticManager(context: Context) {
    private val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

    @Volatile var enabled: Boolean = true

    fun click() = pulse(VibrationEffect.EFFECT_TICK)
    fun success() = pulse(VibrationEffect.EFFECT_HEAVY_CLICK)
    fun warn() = pulse(VibrationEffect.EFFECT_DOUBLE_CLICK)

    private fun pulse(effect: Int) {
        if (!enabled) return
        val v = vibrator?.takeIf { it.hasVibrator() } ?: return
        v.vibrate(VibrationEffect.createPredefined(effect))
    }
}
