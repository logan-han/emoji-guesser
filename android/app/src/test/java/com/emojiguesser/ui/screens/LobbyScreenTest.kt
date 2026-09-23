package com.emojiguesser.ui.screens

import androidx.activity.ComponentActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.lifecycle.Lifecycle
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.emojiguesser.data.Game
import com.emojiguesser.network.ConnectionState
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
class LobbyScreenTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    private val created = mutableListOf<Triple<Int, Int, Boolean>>()
    private val joined = mutableListOf<String>()
    private val names = mutableListOf<String>()
    private val soundChanges = mutableListOf<Boolean>()
    private val hapticChanges = mutableListOf<Boolean>()
    private var listCalls = 0

    private fun render(
        initialName: String = "Alice",
        publicGames: List<Game> = emptyList(),
        deepLinkGameId: String? = null,
        connectionState: ConnectionState = ConnectionState.CONNECTED,
        sounds: Boolean = true,
        haptics: Boolean = true
    ) {
        compose.setContent {
            var name by remember { mutableStateOf(initialName) }
            EmojiGuesserTheme {
                LobbyScreen(
                    playerName = name,
                    publicGames = publicGames,
                    deepLinkGameId = deepLinkGameId,
                    connectionState = connectionState,
                    soundsEnabled = sounds,
                    hapticsEnabled = haptics,
                    onPlayerNameChange = { names += it; name = it },
                    onCreateGame = { time, rounds, isPublic -> created += Triple(time, rounds, isPublic) },
                    onJoinGame = { joined += it },
                    onListPublicGames = { listCalls++ },
                    onSoundsChange = { soundChanges += it },
                    onHapticsChange = { hapticChanges += it }
                )
            }
        }
    }

    private fun nameField() = compose.onAllNodes(hasSetTextAction())[0]
    private fun codeField() = compose.onAllNodes(hasSetTextAction())[1]

    @Test
    fun `polls public games on entry and every five seconds`() {
        render()
        assertEquals(1, listCalls)

        compose.mainClock.advanceTimeBy(5_000)
        assertEquals(2, listCalls)
        compose.mainClock.advanceTimeBy(5_000)
        assertEquals(3, listCalls)
    }

    @Test
    fun `polling pauses in the background and picks up again on return`() {
        render()
        assertEquals(1, listCalls)

        compose.activityRule.scenario.moveToState(Lifecycle.State.CREATED)
        compose.mainClock.advanceTimeBy(20_000)
        assertEquals(1, listCalls)

        compose.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
        compose.waitForIdle()
        assertEquals(2, listCalls)
        compose.mainClock.advanceTimeBy(5_000)
        assertEquals(3, listCalls)
    }

    @Test
    fun `create game sends the default round time, rounds and public room`() {
        render()
        compose.drawFrame()

        compose.onNodeWithText("Create game").performClick()

        assertEquals(listOf(Triple(120, 2, true)), created)
    }

    @Test
    fun `create game sends the chosen round time, rounds and private room`() {
        render()

        compose.onNodeWithText("60").performClick()
        compose.onNodeWithText("4").performClick()
        compose.onNodeWithContentDescription("Public game").assertIsOn().performClick().assertIsOff()
        compose.drawFrame()
        compose.onNodeWithText("Create game").performClick()

        assertEquals(listOf(Triple(60, 4, false)), created)
    }

    @Test
    fun `sound and haptic toggles show the saved settings and report changes`() {
        render(sounds = true, haptics = false)
        compose.drawFrame()

        compose.onNodeWithContentDescription("Sounds").performScrollTo().assertIsOn().performClick()
        compose.onNodeWithContentDescription("Haptics").assertIsOff().performClick()

        assertEquals(listOf(false), soundChanges)
        assertEquals(listOf(true), hapticChanges)
    }

    @Test
    fun `create and join stay disabled until a name is set`() {
        render(initialName = "")
        codeField().performTextInput("abc")

        compose.onNodeWithText("Create game").assertIsNotEnabled().performClick()
        compose.onNodeWithText("Join game").assertIsNotEnabled().performClick()

        assertEquals(emptyList<Triple<Int, Int, Boolean>>(), created)
        assertEquals(emptyList<String>(), joined)
    }

    @Test
    fun `typing a name reports it and ignores names over 20 characters`() {
        render(initialName = "")

        nameField().performTextInput("Bob")
        nameField().performTextReplacement("x".repeat(21))

        assertEquals(listOf("Bob"), names)
        nameField().assert(hasText("Bob"))
        compose.onNodeWithText("Create game").assertIsEnabled()
    }

    @Test
    fun `join code is uppercased and capped at six characters`() {
        render()

        codeField().performTextInput("abc123xyz")
        codeField().assert(hasText("ABC123"))
        compose.onNodeWithText("Join game").performClick()

        assertEquals(listOf("ABC123"), joined)
    }

    @Test
    fun `IME go joins only when both the code and a name are set`() {
        render()
        codeField().performTextInput("zz9")
        codeField().performImeAction()
        assertEquals(listOf("ZZ9"), joined)
    }

    @Test
    fun `IME go without a name does nothing`() {
        render(initialName = "")
        codeField().performTextInput("zz9")
        codeField().performImeAction()
        assertEquals(emptyList<String>(), joined)
    }

    @Test
    fun `IME go without a code does nothing`() {
        render()
        codeField().performImeAction()
        assertEquals(emptyList<String>(), joined)
    }

    @Test
    fun `deep link prefills the join code`() {
        render(deepLinkGameId = "DEEP01")

        codeField().assert(hasText("DEEP01"))
        compose.onNodeWithText("Join game").performClick()

        assertEquals(listOf("DEEP01"), joined)
    }

    @Test
    fun `public games show the first three rooms and join on tap`() {
        val alice = player("a", "Alice")
        val games = listOf(
            game(players = listOf(player("b", "Bob"), alice), ownerId = "a", gameState = "IN_PROGRESS", gameId = "G1"),
            game(players = listOf(player("c", "Carol")), ownerId = "gone", timeLimit = 60, gameId = "G2"),
            game(players = emptyList(), ownerId = "nobody", gameId = "G3"),
            game(players = listOf(player("d", "Dan")), gameId = "G4")
        )
        render(publicGames = games)
        compose.drawFrame()

        // The badge count; the rounds chip labelled "4" is the clickable one.
        compose.onNode(hasText("4") and !hasClickAction()).assertExists()
        compose.onNodeWithText("2 · 120s").assertExists()
        compose.onNodeWithText("1 · 60s").assertExists()
        compose.onNodeWithText("Host's game").assertExists()
        compose.onNodeWithText("Dan's game").assertDoesNotExist()

        compose.onNodeWithText("Alice's game").performScrollTo().performClick()
        compose.onNodeWithText("Carol's game").performScrollTo().performClick()

        assertEquals(listOf("G1", "G2"), joined)
    }

    @Test
    fun `public game rows are disabled without a name`() {
        render(initialName = "", publicGames = listOf(game(gameId = "G1")))

        compose.onNodeWithText("Alice's game").performScrollTo().assertIsNotEnabled().performClick()

        assertEquals(emptyList<String>(), joined)
    }

    @Test
    fun `connection pill shows the socket state`() {
        render(connectionState = ConnectionState.DISCONNECTED)
        compose.onNodeWithText("Offline").assertExists()
    }
}
