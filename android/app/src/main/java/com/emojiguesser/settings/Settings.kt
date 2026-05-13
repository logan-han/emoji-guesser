package com.emojiguesser.settings

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.settingsDataStore by preferencesDataStore("settings")

class SettingsRepository(private val context: Context) {
    private val SOUNDS = booleanPreferencesKey("sounds_enabled")
    private val HAPTICS = booleanPreferencesKey("haptics_enabled")

    val soundsEnabled: Flow<Boolean> = context.settingsDataStore.data.map { it[SOUNDS] ?: true }
    val hapticsEnabled: Flow<Boolean> = context.settingsDataStore.data.map { it[HAPTICS] ?: true }

    suspend fun setSounds(enabled: Boolean) {
        context.settingsDataStore.edit { it[SOUNDS] = enabled }
    }

    suspend fun setHaptics(enabled: Boolean) {
        context.settingsDataStore.edit { it[HAPTICS] = enabled }
    }
}
