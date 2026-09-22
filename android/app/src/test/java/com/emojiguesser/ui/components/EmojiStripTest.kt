package com.emojiguesser.ui.components

import androidx.activity.ComponentActivity
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.emojiguesser.ui.theme.EmojiGuesserTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class EmojiStripTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun `shows the hint until emojis arrive`() {
        var emojis by mutableStateOf(emptyList<String>())
        compose.setContent {
            EmojiGuesserTheme { EmojiStrip(emojis = emojis, listState = rememberLazyListState(), emptyHint = "Nothing yet") }
        }
        compose.onNodeWithText("Nothing yet").assertIsDisplayed()

        emojis = listOf("🐘", "🌊")

        compose.onNodeWithText("🐘").assertIsDisplayed()
        compose.onNodeWithText("🌊").assertIsDisplayed()
        compose.onNodeWithText("Nothing yet").assertDoesNotExist()
    }
}
