package com.emojiguesser.ui.screens

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.emojiguesser.data.Game
import com.emojiguesser.network.ConnectionState
import com.emojiguesser.testing.drawFrame
import com.emojiguesser.ui.theme.EmojiGuesserTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "w411dp-h1600dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MainScreenTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    private val calls = mutableListOf<String>()

    private fun render(
        currentGame: Game? = null,
        connectionState: ConnectionState = ConnectionState.CONNECTED,
        errorMessage: String? = null,
        updateDownloaded: Boolean = false
    ) {
        compose.setContent {
            EmojiGuesserTheme {
                MainScreen(
                    currentGame = currentGame,
                    connectionState = connectionState,
                    playerName = "Alice",
                    publicGames = emptyList(),
                    emojis = emptyList(),
                    guesses = emptyList(),
                    wordOptions = emptyList(),
                    secretWord = null,
                    currentHint = null,
                    errorMessage = errorMessage,
                    lastGuessedWord = null,
                    lastGuesserName = null,
                    isDescriber = false,
                    isOwner = true,
                    currentDescriber = null,
                    currentSessionId = "s-p1",
                    deepLinkGameId = null,
                    updateDownloaded = updateDownloaded,
                    soundsEnabled = true,
                    hapticsEnabled = false,
                    onPlayerNameChange = { calls += "name:$it" },
                    onCreateGame = { time, rounds, isPublic -> calls += "create:$time:$rounds:$isPublic" },
                    onJoinGame = { calls += "join:$it" },
                    onStartGame = { time, rounds -> calls += "start:$time:$rounds" },
                    onChooseWord = { calls += "choose:$it" },
                    onSubmitEmoji = { calls += "emoji:$it" },
                    onRemoveEmojiAt = { calls += "remove:$it" },
                    onSubmitGuess = { calls += "guess:$it" },
                    onListPublicGames = { calls += "list" },
                    onRestartGame = { calls += "restart:$it" },
                    onLeaveGame = { calls += "leave" },
                    onClearError = { calls += "clearError" },
                    onInstallUpdate = { calls += "install" },
                    onSoundsChange = { calls += "sounds:$it" },
                    onHapticsChange = { calls += "haptics:$it" }
                )
            }
        }
    }

    private fun inProgress(turnState: String?, gameState: String = "IN_PROGRESS") =
        game(gameState = gameState, turnState = turnState)

    @Test
    fun `connecting without a game shows the loading screen`() {
        render(connectionState = ConnectionState.CONNECTING)
        compose.drawFrame()

        compose.onNodeWithText("Connecting…").assertExists()
        compose.onNodeWithText("Create a game").assertDoesNotExist()
    }

    @Test
    fun `connecting with a game keeps the game on screen`() {
        render(currentGame = game(), connectionState = ConnectionState.CONNECTING)

        compose.onNodeWithText("Waiting Room").assertExists()
        compose.onNodeWithText("Connecting…").assertDoesNotExist()
    }

    @Test
    fun `failed connection shows the error screen even mid-game`() {
        render(currentGame = inProgress("DESCRIBING"), connectionState = ConnectionState.FAILED)

        compose.onNodeWithText("Connection failed. Please check your internet connection.").assertExists()
        compose.onNodeWithText("Round 1 / 3").assertDoesNotExist()
    }

    @Test
    fun `no game shows the lobby without snackbars`() {
        render()

        compose.onNodeWithText("Create game").performClick()
        compose.onNodeWithContentDescription("Sounds").performScrollTo().performClick()
        compose.onNodeWithContentDescription("Haptics").performClick()

        assertEquals(listOf("list", "create:120:2:true", "sounds:false", "haptics:true"), calls)
        compose.onNodeWithText("Dismiss").assertDoesNotExist()
        compose.onNodeWithText("Update ready to install").assertDoesNotExist()
    }

    @Test
    fun `offline without a game still shows the lobby`() {
        render(connectionState = ConnectionState.DISCONNECTED)

        compose.onNodeWithText("Offline").assertExists()
        compose.onNodeWithText("Create a game").assertExists()
    }

    @Test
    fun `waiting game shows the waiting room`() {
        render(currentGame = game())

        compose.onNodeWithText("👑 Host · You").assertExists()
        compose.onNodeWithText("Start game →").performClick()

        assertEquals(listOf("start:120:3"), calls)
    }

    @Test
    fun `ended game shows the results`() {
        render(currentGame = game(gameState = "ENDED"))

        compose.onNodeWithText("Play again ↻").performClick()

        assertEquals(listOf("restart:120"), calls)
    }

    @Test
    fun `describing turn shows the game screen`() {
        render(currentGame = inProgress("DESCRIBING"))

        compose.onNodeWithContentDescription("Close").performClick()

        assertEquals(listOf("leave"), calls)
    }

    @Test
    fun `choosing turn shows the game screen`() {
        render(currentGame = inProgress("CHOOSING_WORD"))
        compose.onNodeWithText("Round 1 / 3").assertExists()
    }

    @Test
    fun `unknown phases fall back to the game screen`() {
        render(currentGame = inProgress(turnState = null, gameState = "PAUSED"))
        compose.onNodeWithText("Round 1 / 3").assertExists()
    }

    @Test
    fun `error snackbar shows the message and dismisses`() {
        render(errorMessage = "Game not found")

        compose.onNodeWithText("Game not found").assertExists()
        compose.onNodeWithText("Dismiss").performClick()

        assertTrue("clearError" in calls)
    }

    @Test
    fun `update snackbar restarts into the downloaded update`() {
        render(updateDownloaded = true)

        compose.onNodeWithText("Update ready to install").assertExists()
        compose.onNodeWithText("Restart").performClick()

        assertTrue("install" in calls)
    }
}
