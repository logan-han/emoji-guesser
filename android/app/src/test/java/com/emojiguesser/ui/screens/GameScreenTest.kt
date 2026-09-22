package com.emojiguesser.ui.screens

import androidx.activity.ComponentActivity
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasNoClickAction
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.emojiguesser.data.Game
import com.emojiguesser.data.GuessEntry
import com.emojiguesser.data.Player
import com.emojiguesser.testing.drawFrame
import com.emojiguesser.ui.theme.EmojiGuesserTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.time.Instant

@RunWith(AndroidJUnit4::class)
@Config(qualifiers = "w411dp-h1600dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class GameScreenTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    private val alice = player("p1", "Alice", score = 11)
    private val bob = player("p2", "Bob", score = 22)

    private val chosen = mutableListOf<String>()
    private val sentEmojis = mutableListOf<String>()
    private val removed = mutableListOf<Int>()
    private val sentGuesses = mutableListOf<String>()
    private var leaves = 0

    private fun playing(
        players: List<Player> = listOf(alice, bob),
        turnState: String = "DESCRIBING",
        currentRound: Int? = 2,
        maxRounds: Int? = 3,
        timeLimit: Int = 90,
        turnStartTime: String? = null
    ) = game(
        players = players,
        gameState = "IN_PROGRESS",
        turnState = turnState,
        currentRound = currentRound,
        maxRounds = maxRounds,
        timeLimit = timeLimit,
        turnStartTime = turnStartTime
    )

    private val shownGame = mutableStateOf(playing())

    private fun render(
        game: Game = playing(),
        emojis: List<String> = emptyList(),
        guesses: List<GuessEntry> = emptyList(),
        wordOptions: List<String> = emptyList(),
        secretWord: String? = null,
        currentHint: String? = null,
        lastGuessedWord: String? = null,
        lastGuesserName: String? = null,
        isDescriber: Boolean = false,
        currentDescriber: Player? = alice
    ) {
        shownGame.value = game
        compose.setContent {
            EmojiGuesserTheme {
                GameScreen(
                    game = shownGame.value,
                    emojis = emojis,
                    guesses = guesses,
                    wordOptions = wordOptions,
                    secretWord = secretWord,
                    currentHint = currentHint,
                    lastGuessedWord = lastGuessedWord,
                    lastGuesserName = lastGuesserName,
                    isDescriber = isDescriber,
                    currentDescriber = currentDescriber,
                    onChooseWord = { chosen += it },
                    onSubmitEmoji = { sentEmojis += it },
                    onRemoveEmojiAt = { removed += it },
                    onSubmitGuess = { sentGuesses += it },
                    onLeaveGame = { leaves++ }
                )
            }
        }
    }

    private fun guessField() = compose.onNode(hasSetTextAction())

    @Test
    fun `round label uses the game's round and max rounds`() {
        render()
        compose.drawFrame()
        compose.onNodeWithText("Round 2 / 3").assertExists()
    }

    @Test
    fun `round label falls back to round one of one per player`() {
        render(playing(currentRound = null, maxRounds = null))
        compose.onNodeWithText("Round 1 / 2").assertExists()
    }

    @Test
    fun `round label counts at least one round with no players`() {
        render(playing(players = emptyList(), currentRound = null, maxRounds = null), currentDescriber = null)
        compose.onNodeWithText("Round 1 / 1").assertExists()
    }

    @Test
    fun `describer picks a word from the options`() {
        render(playing(turnState = "CHOOSING_WORD"), wordOptions = listOf("apple", "banana"), isDescriber = true)

        compose.onNodeWithText("Choose a word to describe").assertExists()
        compose.onNodeWithText("BANANA").performClick()

        assertEquals(listOf("banana"), chosen)
    }

    @Test
    fun `guessers never see the word options`() {
        render(playing(turnState = "CHOOSING_WORD"), wordOptions = listOf("apple"))

        compose.onNodeWithText("Choose a word to describe").assertDoesNotExist()
        compose.onNodeWithText("APPLE").assertDoesNotExist()
    }

    @Test
    fun `describer sees the word, removes emojis and sends from the picker`() {
        render(secretWord = "elephant", emojis = listOf("🐘", "🦷"), isDescriber = true)
        compose.drawFrame()

        compose.onNodeWithText("You describe").assertExists()
        compose.onNodeWithText("ELEPHANT").assertExists()
        compose.onNodeWithText("Describe using only emojis").assertExists()
        compose.onNodeWithText("tap to remove").assertExists()

        compose.onNodeWithText("🦷").performClick()
        compose.onNodeWithText("😃").performClick()

        assertEquals(listOf(1), removed)
        assertEquals(listOf("😃"), sentEmojis)
    }

    @Test
    fun `describer can hide and reopen the emoji picker`() {
        render(secretWord = "elephant", isDescriber = true)

        compose.onNodeWithText("Hide emoji picker").performClick()
        compose.onNodeWithText("😃").assertDoesNotExist()

        compose.onNodeWithText("Send emoji").performClick()
        compose.onNodeWithText("😃").assertExists()
    }

    @Test
    fun `picker tabs switch the emoji category`() {
        render(secretWord = "elephant", isDescriber = true)

        compose.onNodeWithText("🐶").performClick()
        compose.onNodeWithText("😃").assertDoesNotExist()
        compose.onNodeWithText("🐱").performClick()

        assertEquals(listOf("🐱"), sentEmojis)
    }

    @Test
    fun `describer has no picker before the word is set`() {
        render(isDescriber = true)

        compose.onNodeWithText("Your word").assertDoesNotExist()
        compose.onNodeWithText("Hide emoji picker").assertDoesNotExist()
        compose.onNodeWithText("Send emoji").assertDoesNotExist()
        compose.onNodeWithText("Your emojis").assertExists()
    }

    @Test
    fun `live guesses name the guesser from the entry, the roster or a fallback`() {
        val guesses = listOf(
            GuessEntry(text = "cat", guesserId = "p2", guesserName = "Bobby"),
            GuessEntry(text = "dog", guesserId = "p2"),
            GuessEntry(text = "cow", guesserId = "ghost")
        )
        render(guesses = guesses, secretWord = "elephant", isDescriber = true)

        compose.onNodeWithText("Live guesses").assertExists()
        compose.onNodeWithText("Bobby").assertExists()
        // One "Bob" in the guess list, one in the score strip.
        compose.onAllNodesWithText("Bob").assertCountEquals(2)
        compose.onNodeWithText("Player").assertExists()
        compose.onNodeWithText("cow").assertExists()
        compose.onNodeWithText("Waiting for guesses…").assertDoesNotExist()
    }

    @Test
    fun `no guesses yet shows the waiting hint`() {
        render()
        compose.onNodeWithText("Waiting for guesses…").assertExists()
    }

    @Test
    fun `guesser sees the hint tiles and how much is revealed`() {
        render(currentHint = "c_t d_g")

        compose.onNodeWithText("4 / 6 revealed").assertExists()
        compose.onNodeWithText("C").assertExists()
        compose.onNodeWithText("G").assertExists()
        compose.onNodeWithText("Waiting for emojis…").assertDoesNotExist()
    }

    @Test
    fun `guesser without a hint waits for emojis`() {
        render(currentHint = null)

        compose.onNodeWithText("0 / 0 revealed").assertExists()
        compose.onNodeWithText("Waiting for emojis…").assertExists()
    }

    @Test
    fun `a blank hint counts as no hint`() {
        render(currentHint = "   ")
        compose.onNodeWithText("Waiting for emojis…").assertExists()
    }

    @Test
    fun `guesser sees the describer's emojis read only`() {
        render(emojis = listOf("🐘"))
        compose.onNodeWithText("🐘").assert(hasNoClickAction())
    }

    @Test
    fun `guesser status falls back to player without a describer`() {
        render(currentDescriber = null)
        compose.onNodeWithText("Describer: Player").assertExists()
    }

    @Test
    fun `guesser status names the current describer`() {
        render(currentDescriber = bob)
        compose.onNodeWithText("Describer: Bob").assertExists()
    }

    @Test
    fun `guess input caps at 50 characters and clears after sending`() {
        render()

        guessField().performTextInput("x".repeat(60))
        guessField().assert(hasText("x".repeat(50)))
        compose.onNode(textlessClickable).performClick()

        assertEquals(listOf("x".repeat(50)), sentGuesses)
        guessField().assert(hasText(""))
    }

    @Test
    fun `IME send submits the guess but blank guesses are ignored`() {
        render()

        guessField().performTextInput("   ")
        compose.onNode(textlessClickable).assertIsNotEnabled()
        guessField().performImeAction()
        assertEquals(emptyList<String>(), sentGuesses)

        guessField().performTextInput("tiger")
        guessField().performImeAction()
        // Sent untrimmed; the backend trims before comparing.
        assertEquals(listOf("   tiger"), sentGuesses)
    }

    @Test
    fun `guess input is hidden while the describer is choosing`() {
        render(playing(turnState = "CHOOSING_WORD"))
        compose.onAllNodes(hasSetTextAction()).assertCountEquals(0)
    }

    @Test
    fun `round banner names who guessed the word`() {
        render(lastGuessedWord = "tiger", lastGuesserName = "Bob")
        compose.onNodeWithText("Bob guessed \"tiger\"").assertExists()
    }

    @Test
    fun `round banner reveals the word when time ran out`() {
        render(lastGuessedWord = "tiger", lastGuesserName = null)
        compose.drawFrame()
        compose.onNodeWithText("Time's up. The word was \"tiger\"").assertExists()
    }

    @Test
    fun `close leaves the game`() {
        render()
        compose.onNodeWithContentDescription("Close").performClick()
        assertEquals(1, leaves)
    }

    @Test
    fun `timer shows the full limit before the turn starts`() {
        render(playing(turnStartTime = null))
        compose.onNodeWithText("90").assertExists()
    }

    @Test
    fun `timer shows the full limit for an unparseable start time`() {
        render(playing(turnStartTime = "not-a-time"))
        compose.onNodeWithText("90").assertExists()
    }

    @Test
    fun `timer counts down from the turn start and keeps ticking`() {
        render(playing(turnStartTime = Instant.now().minusSeconds(30).toString()))

        compose.onNode(hasText("60") or hasText("59")).assertExists()
        compose.mainClock.advanceTimeBy(1_000)
        compose.onNode(hasText("60") or hasText("59") or hasText("58")).assertExists()
    }

    @Test
    fun `timer stops at zero once time is up`() {
        render(playing(turnStartTime = "2020-01-01T00:00:00Z"))
        compose.onNodeWithText("0").assertExists()
    }

    @Test
    fun `timer restarts from the new limit when the next turn starts`() {
        render(playing(turnStartTime = "2020-01-01T00:00:00Z"))
        compose.onNodeWithText("0").assertExists()

        compose.runOnIdle { shownGame.value = playing(turnStartTime = null, timeLimit = 45) }

        compose.onNodeWithText("45").assertExists()
        compose.onNodeWithText("0").assertDoesNotExist()
    }

    @Test
    fun `timer never shows more than the limit for a start time in the future`() {
        render(playing(turnStartTime = Instant.now().plusSeconds(3_600).toString()))
        compose.onNodeWithText("90").assertExists()
    }
}
