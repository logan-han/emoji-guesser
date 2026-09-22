package com.emojiguesser.ui.screens

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.emojiguesser.testing.drawFrame
import com.emojiguesser.ui.theme.EmojiGuesserTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.GraphicsMode

@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class StatusScreensTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun `loading screen shows the message and warm-up copy`() {
        compose.setContent { EmojiGuesserTheme { LoadingScreen("Joining room…") } }
        compose.drawFrame()

        compose.onNodeWithText("Joining room…").assertExists()
        compose.onNodeWithText("Connecting").assertExists()
        // Bug: aapt strips the trailing space in conn_warming_prefix, so the words run together.
        compose.onNodeWithText("We're warming upthe server").assertExists()
        compose.onNodeWithText("💡 Tip: short emoji clues are usually easier to guess.").assertExists()
    }

    @Test
    fun `error screen shows the message and diagnostic`() {
        compose.setContent { EmojiGuesserTheme { ErrorScreen("Connection failed.") } }
        compose.drawFrame()

        compose.onNodeWithText("Connection failed.").assertExists()
        compose.onNodeWithText("Something went wrong").assertExists()
        // Bug: aapt strips the trailing space in error_room_gone_prefix, so the words run together.
        compose.onNodeWithText("That gamedisappeared").assertExists()
        compose.onNodeWithText("Error · WS_4404 · Room not found").assertExists()
    }
}
