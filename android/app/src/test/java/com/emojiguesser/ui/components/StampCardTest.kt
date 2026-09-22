package com.emojiguesser.ui.components

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.emojiguesser.testing.drawFrame
import com.emojiguesser.ui.theme.EmojiGuesserTheme
import com.emojiguesser.ui.theme.Gold
import com.emojiguesser.ui.theme.Tomato
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StampCardTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun `renders content on the palette or on custom colours`() {
        compose.setContent {
            EmojiGuesserTheme {
                Column {
                    StampCard { Text("plain") }
                    StampCard(fill = Gold, border = Tomato, rotationDeg = 3f) { Text("custom") }
                }
            }
        }

        compose.onNodeWithText("plain").assertIsDisplayed()
        compose.onNodeWithText("custom").assertIsDisplayed()
        compose.drawFrame()
    }
}
