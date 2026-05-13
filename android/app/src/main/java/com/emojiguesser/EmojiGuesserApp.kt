package com.emojiguesser

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import com.emojiguesser.audio.SoundManager
import com.emojiguesser.haptics.HapticManager
import com.emojiguesser.settings.SettingsRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach

class EmojiGuesserApp : Application() {

    lateinit var sounds: SoundManager
        private set
    lateinit var haptics: HapticManager
        private set
    lateinit var settings: SettingsRepository
        private set

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onCreate() {
        super.onCreate()
        sounds = SoundManager(this)
        haptics = HapticManager(this)
        settings = SettingsRepository(this)

        settings.soundsEnabled.onEach { sounds.enabled = it }.launchIn(appScope)
        settings.hapticsEnabled.onEach { haptics.enabled = it }.launchIn(appScope)

        registerNotificationChannels()
    }

    private fun registerNotificationChannels() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_GAME_INVITES,
                getString(R.string.channel_game_invites_name),
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = getString(R.string.channel_game_invites_desc)
            }
        )
    }

    companion object {
        const val CHANNEL_GAME_INVITES = "game_invites"
    }
}
