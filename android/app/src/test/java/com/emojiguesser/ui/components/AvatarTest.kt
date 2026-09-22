package com.emojiguesser.ui.components

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Row
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.emojiguesser.ui.theme.EmojiGuesserTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AvatarTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun `shows the uppercased first letter of the trimmed name`() {
        compose.setContent { EmojiGuesserTheme { Avatar("  bob") } }

        compose.onNodeWithText("B").assertIsDisplayed()
    }

    @Test
    fun `falls back to a question mark for a blank name`() {
        compose.setContent { EmojiGuesserTheme { Avatar("   ") } }

        compose.onNodeWithText("?").assertIsDisplayed()
    }

    @Test
    fun `host avatars wear a crown and grow to fit it`() {
        compose.setContent {
            EmojiGuesserTheme {
                Row {
                    Avatar("Ann", modifier = Modifier.testTag("host"), size = 30.dp, isHost = true)
                    Avatar("Ben", modifier = Modifier.testTag("guest"), size = 30.dp)
                }
            }
        }

        compose.onNodeWithText("♛").assertIsDisplayed()
        compose.onNodeWithTag("host").assertWidthIsEqualTo(36.dp)
        compose.onNodeWithTag("guest").assertWidthIsEqualTo(30.dp)
    }
}
