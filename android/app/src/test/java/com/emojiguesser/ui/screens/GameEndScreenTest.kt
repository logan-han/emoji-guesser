package com.emojiguesser.ui.screens

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
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
class GameEndScreenTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    private val restarts = mutableListOf<Int>()
    private var leaves = 0

    private fun render(game: Game, isOwner: Boolean = true) {
        compose.setContent {
            EmojiGuesserTheme {
                GameEndScreen(
                    game = game,
                    isOwner = isOwner,
                    onRestartGame = { restarts += it },
                    onLeaveGame = { leaves++ }
                )
            }
        }
    }

    @Test
    fun `final results rank every player by score`() {
        val players = listOf(
            player("a", "Alice", score = 10),
            player("b", "Bob", score = 30),
            player("c", "Carol", score = 20),
            player("d", "Dan", score = 5)
        )
        render(game(players = players, gameState = "ENDED"))
        compose.drawFrame()

        compose.onNodeWithText("Final results").assertExists()
        compose.onNodeWithText("Game over").assertExists()
        compose.onNodeWithText("👑").assertExists()
        listOf("#1", "#2", "#3", "30", "20", "10").forEach { compose.onNodeWithText(it).assertExists() }
        listOf("1", "2", "3", "4").forEach { compose.onNodeWithText(it).assertExists() }
        listOf("30 pts", "20 pts", "10 pts", "5 pts").forEach { compose.onNodeWithText(it).assertExists() }
        // Podium and score list both show the top three; Dan only makes the list.
        compose.onAllNodesWithText("Bob").assertCountEquals(2)
        compose.onAllNodesWithText("Dan").assertCountEquals(1)
    }

    @Test
    fun `empty podium places show a dash and zero`() {
        render(game(players = listOf(player("a", "Alice", score = 12)), gameState = "ENDED"))
        compose.drawFrame()

        compose.onAllNodesWithText("—").assertCountEquals(2)
        compose.onAllNodesWithText("0").assertCountEquals(2)
        compose.onNodeWithText("12").assertExists()
    }

    @Test
    fun `owner plays again with the room's time limit`() {
        render(game(gameState = "ENDED", timeLimit = 75))

        compose.onNodeWithText("Play again ↻").performClick()

        assertEquals(listOf(75), restarts)
    }

    @Test
    fun `guests can only leave`() {
        render(game(gameState = "ENDED"), isOwner = false)

        compose.onNodeWithText("Play again ↻").assertDoesNotExist()
        compose.onNodeWithText("Leave").performClick()

        assertEquals(1, leaves)
        assertEquals(emptyList<Int>(), restarts)
    }
}
