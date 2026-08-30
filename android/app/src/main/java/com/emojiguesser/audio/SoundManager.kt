package com.emojiguesser.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool
import com.emojiguesser.util.Logger

class SoundManager(private val context: Context) {
    private val pool: SoundPool = SoundPool.Builder()
        .setMaxStreams(4)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        )
        .build()

    private val ids = mutableMapOf<SoundEvent, Int>()

    @Volatile var enabled: Boolean = true

    init {
        SoundEvent.entries.forEach { evt ->
            try {
                ids[evt] = pool.load(context, evt.resId, 1)
            } catch (t: Throwable) {
                Logger.e("SoundManager", "Failed to load ${evt.name}", t)
            }
        }
    }

    fun play(event: SoundEvent, rate: Float = 1f) {
        if (!enabled) return
        val id = ids[event] ?: return
        pool.play(id, 1f, 1f, 1, 0, rate)
    }

    fun release() {
        pool.release()
        ids.clear()
    }
}
