package com.emojiguesser.ui.screens

import android.content.ClipboardManager
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.emojiguesser.data.Game
import com.emojiguesser.testing.drawFrame
import com.emojiguesser.ui.theme.EmojiGuesserTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "w411dp-h1400dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class WaitingRoomScreenTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    private val starts = mutableListOf<Pair<Int, Int>>()
    private var leaves = 0

    private fun render(game: Game = game(), isOwner: Boolean = true) {
        compose.setContent {
            EmojiGuesserTheme {
                WaitingRoomScreen(
                    game = game,
                    isOwner = isOwner,
                    onStartGame = { time, rounds -> starts += time to rounds },
                    onLeaveGame = { leaves++ }
                )
            }
        }
    }

    private fun clipboardText() =
        compose.activity.getSystemService(ClipboardManager::class.java).primaryClip?.getItemAt(0)?.text?.toString()

    @Test
    fun `owner sees the code, privacy and every seat`() {
        render()
        compose.drawFrame()

        compose.onNodeWithText("ABC123").assertExists()
        compose.onNodeWithText("Private").assertExists()
        compose.onNodeWithText("Players (2)").assertExists()
        compose.onNodeWithText("2 / 8").assertExists()
        compose.onNodeWithText("👑 Host").assertExists()
        compose.onAllNodesWithText("Waiting for player…").assertCountEquals(6)
        compose.onNodeWithText("Round time").assertExists()
    }

    @Test
    fun `public rooms are labelled public`() {
        render(game(isPublic = true))
        compose.onNodeWithText("Public game").assertExists()
    }

    @Test
    fun `copy code and share link write to the clipboard`() {
        render()

        compose.onNodeWithText("📋 Copy code").performClick()
        assertEquals("ABC123", clipboardText())

        compose.onNodeWithText("↗ Share link").performClick()
        // Pins current behaviour: neither the manifest deep link (emoji.han.life/game/) nor the web ?gameId= link.
        assertEquals("https://emoji-guesser.app/ABC123", clipboardText())
    }

    @Test
    fun `owner starts with the room's settings by default`() {
        render(game(timeLimit = 90, maxRounds = 3))

        compose.onNodeWithText("Start game →").performClick()

        assertEquals(listOf(90 to 3), starts)
    }

    @Test
    fun `owner can change round time and rounds before starting`() {
        render()

        compose.onNodeWithText("180").performClick()
        compose.onNodeWithText("5").performClick()
        compose.drawFrame()
        compose.onNodeWithText("Start game →").performClick()

        assertEquals(listOf(180 to 5), starts)
    }

    @Test
    fun `rounds fall back to two when the room has none`() {
        render(game(maxRounds = null))

        compose.onNodeWithText("Start game →").performClick()

        assertEquals(listOf(120 to 2), starts)
    }

    @Test
    fun `start stays disabled until a second player joins`() {
        render(game(players = listOf(player("p1", "Alice"))))

        compose.onNodeWithText("Need at least 2 players to start").assertIsNotEnabled().performClick()

        assertEquals(emptyList<Pair<Int, Int>>(), starts)
        compose.onAllNodesWithText("Waiting for player…").assertCountEquals(7)
    }

    @Test
    fun `guests wait for the host without room settings`() {
        render(isOwner = false)
        compose.drawFrame()

        compose.onNodeWithText("Waiting for the host to start the game").assertIsNotEnabled().performClick()
        compose.onNodeWithText("Start game →").assertDoesNotExist()
        compose.onNodeWithText("Round time").assertDoesNotExist()
        compose.onNodeWithText("👑 Host").assertExists()
        assertEquals(emptyList<Pair<Int, Int>>(), starts)
    }

    @Test
    fun `leave works from the header and the footer`() {
        render()

        compose.onNodeWithContentDescription("Leave").performClick()
        compose.onNodeWithText("Leave").performClick()

        assertEquals(2, leaves)
    }
}
