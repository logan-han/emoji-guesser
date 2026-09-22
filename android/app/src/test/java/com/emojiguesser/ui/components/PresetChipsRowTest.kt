package com.emojiguesser.ui.components

import androidx.activity.ComponentActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.emojiguesser.testing.drawFrame
import com.emojiguesser.ui.theme.EmojiGuesserTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PresetChipsRowTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun `offers the default round lengths and reports the tapped one`() {
        var selected by mutableIntStateOf(120)
        compose.setContent { EmojiGuesserTheme { PresetChipsRow(selectedSeconds = selected, onSelected = { selected = it }) } }
        listOf("60", "90", "120", "180", "240").forEach { compose.onNodeWithText(it).assertIsDisplayed() }
        compose.drawFrame()

        compose.onNodeWithText("90").performClick()

        assertEquals(90, selected)
        compose.drawFrame()
    }

    @Test
    fun `accepts custom presets`() {
        compose.setContent { EmojiGuesserTheme { PresetChipsRow(selectedSeconds = 30, onSelected = {}, values = listOf(30, 45)) } }

        compose.onNodeWithText("45").assertIsDisplayed()
        compose.onNodeWithText("60").assertDoesNotExist()
    }
}
