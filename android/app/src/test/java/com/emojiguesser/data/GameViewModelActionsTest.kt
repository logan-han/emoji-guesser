package com.emojiguesser.data

import android.content.Context
import android.os.VibrationEffect
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.emojiguesser.audio.SoundEvent
import com.emojiguesser.network.ConnectionState
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class GameViewModelActionsTest {
    @get:Rule val rule = GameViewModelRule()
    private val vm get() = rule.vm

    private val prefs get() = rule.app.getSharedPreferences("emoji_guesser", Context.MODE_PRIVATE)

    private fun sent(): List<JsonObject> = rule.ws.last.sentJson.filter { it.str("action") != "heartbeat" }

    private fun JsonObject.str(key: String) = this[key]?.jsonPrimitive?.contentOrNull

    private fun JsonObject.fields(vararg keys: String) = keys.map { str(it) }

    private fun me(name: String = "Me") = Player(connectionId = "c-me", sessionId = vm.sessionId, name = name)

    private val other = Player(connectionId = "c-other", sessionId = "s-other", name = "Other")

    private fun receiveGame(game: Game = Game(gameId = "G1", ownerId = "c-me", players = listOf(me(), other))) =
        rule.server(ServerMessage(action = "playerJoined", game = game))

    @Test
    fun `a session id is created once and reused`() {
        val id = vm.sessionId

        UUID.fromString(id)
        assertEquals(id, prefs.getString("session_id", null))
        assertEquals(id, rule.newViewModel("second").sessionId)
    }

    @Test
    fun `a saved session id and player name are restored`() {
        prefs.edit().putString("session_id", "s-saved").putString("player_name", "Zed").commit()

        val restored = rule.newViewModel("restored")

        assertEquals("s-saved", restored.sessionId)
        assertEquals("Zed", restored.playerName.value)
    }

    @Test
    fun `setPlayerName updates the state and persists it`() {
        assertEquals("", vm.playerName.value)

        vm.setPlayerName("Ann")

        assertEquals("Ann", vm.playerName.value)
        assertEquals("Ann", prefs.getString("player_name", null))
    }

    @Test
    fun `connect hands the session to the socket and mirrors its state`() {
        assertEquals(ConnectionState.DISCONNECTED, vm.connectionState.value)

        vm.connect()
        assertEquals(ConnectionState.CONNECTING, vm.connectionState.value)
        rule.ws.last.open()

        assertEquals(ConnectionState.CONNECTED, vm.connectionState.value)
        assertEquals(vm.sessionId, rule.wsClient.sessionId)
        rule.advance(5_000)
        assertEquals(vm.sessionId, rule.ws.last.sentJson.single().str("sessionId"))
    }

    @Test
    fun `createGame and joinGame send the player's session and name with click feedback`() {
        vm.setPlayerName("Ann")
        rule.connect()

        vm.createGame(timeLimit = 90, maxRounds = 3, isPublic = true)
        vm.createGame()
        vm.joinGame("G9")

        val (custom, defaults, join) = sent()
        assertEquals(listOf("createGame", vm.sessionId, "Ann", "90", "3", "true"), custom.fields("action", "sessionId", "playerName", "timeLimit", "maxRounds", "isPublic"))
        assertEquals(listOf("120", "2", "false"), defaults.fields("timeLimit", "maxRounds", "isPublic"))
        assertEquals(listOf("joinGame", "G9", vm.sessionId, "Ann"), join.fields("action", "gameId", "sessionId", "playerName"))
        assertEquals(3, rule.plays(SoundEvent.ButtonClick))
        assertEquals(VibrationEffect.EFFECT_TICK, rule.lastHaptic())
    }

    @Test
    fun `game actions are skipped without a current game`() {
        rule.connect()

        vm.startGame()
        vm.chooseWord("apple")
        vm.submitEmoji("🍎")
        vm.submitGuess("apple")
        vm.restartGame()

        assertTrue(sent().isEmpty())
        assertEquals(3, rule.plays(SoundEvent.ButtonClick))
    }

    @Test
    fun `game actions carry the current game`() {
        rule.connect()
        receiveGame()

        vm.startGame(timeLimit = 60, maxRounds = 4)
        vm.startGame()
        vm.chooseWord("apple")
        vm.submitEmoji("🍎")
        vm.submitGuess("pear")
        vm.restartGame(timeLimit = 180)
        vm.restartGame()
        vm.listPublicGames()

        val sent = sent()
        assertEquals(listOf("startGame", "G1", vm.sessionId, "60", "4"), sent[0].fields("action", "gameId", "sessionId", "timeLimit", "maxRounds"))
        assertEquals(listOf("120", "2"), sent[1].fields("timeLimit", "maxRounds"))
        assertEquals(listOf("chooseWord", "G1", "apple"), sent[2].fields("action", "gameId", "word"))
        assertEquals(listOf("submitEmoji", "G1", "🍎"), sent[3].fields("action", "gameId", "emoji"))
        assertEquals(listOf("submitGuess", "G1", "pear"), sent[4].fields("action", "gameId", "guess"))
        assertEquals(listOf("restartGame", "G1", vm.sessionId, "180"), sent[5].fields("action", "gameId", "sessionId", "timeLimit"))
        assertEquals("120", sent[6].str("timeLimit"))
        assertEquals("listPublicGames", sent[7].str("action"))
    }

    @Test
    fun `removeEmojiAt drops one emoji and ignores bad indexes`() {
        rule.connect()
        listOf("🐘", "🥜", "🎪").forEach { rule.server(ServerMessage(action = "newEmoji", emoji = it)) }

        vm.removeEmojiAt(1)
        vm.removeEmojiAt(2)
        vm.removeEmojiAt(-1)

        assertEquals(listOf("🐘", "🎪"), vm.emojis.value)
    }

    @Test
    fun `leaveGame resets the game state and leaves the realtime channel`() {
        rule.connect()
        receiveGame()
        rule.server(ServerMessage(action = "describeWord", word = "apple"))
        rule.server(ServerMessage(action = "chooseWord", wordOptions = listOf("kiwi")))
        rule.server(ServerMessage(action = "turnStarted", hint = "a _ _ _ _"))
        rule.server(ServerMessage(action = "newEmoji", emoji = "🍎"))
        rule.server(ServerMessage(action = "newGuess", text = "pear"))
        rule.server(ServerMessage(action = "wordGuessed", word = "apple", guesserName = "Other"))

        vm.leaveGame()

        assertNull(vm.currentGame.value)
        assertTrue(vm.emojis.value.isEmpty())
        assertTrue(vm.guesses.value.isEmpty())
        assertTrue(vm.wordOptions.value.isEmpty())
        assertNull(vm.secretWord.value)
        assertNull(vm.currentHint.value)
        assertNull(vm.lastGuessedWord.value)
        assertNull(vm.lastGuesserName.value)
        assertNull(rule.wsClient.currentGameId)
        assertEquals("client unsubscribed", rule.rt.last.closeReason)
    }

    @Test
    fun `clearError resets the error`() {
        rule.connect()
        rule.server(ServerMessage(action = "error", message = "Game is full"))

        vm.clearError()

        assertNull(vm.errorMessage.value)
    }

    @Test
    fun `describer and owner checks follow the current game`() {
        rule.connect()
        assertFalse(vm.isCurrentPlayerDescriber())
        assertFalse(vm.isGameOwner())
        assertNull(vm.getCurrentDescriber())

        val base = Game(gameId = "G1", ownerId = "c-other", ownerSessionId = "s-other", players = listOf(me(), other))
        receiveGame(base)
        assertFalse(vm.isCurrentPlayerDescriber())
        assertFalse(vm.isGameOwner())
        assertNull(vm.getCurrentDescriber())

        receiveGame(base.copy(currentDescriberIndex = 5))
        assertFalse(vm.isCurrentPlayerDescriber())
        assertNull(vm.getCurrentDescriber())

        receiveGame(base.copy(currentDescriberIndex = 1))
        assertFalse(vm.isCurrentPlayerDescriber())
        assertEquals(other, vm.getCurrentDescriber())

        receiveGame(base.copy(currentDescriberIndex = 0, ownerSessionId = vm.sessionId))
        assertTrue(vm.isCurrentPlayerDescriber())
        assertTrue(vm.isGameOwner())
        assertEquals(me(), vm.getCurrentDescriber())
    }

    @Test
    fun `clearing the view model closes both sockets and stops handling messages`() {
        rule.connect()
        receiveGame()

        rule.clear()
        rule.server(ServerMessage(action = "newEmoji", emoji = "🐘"))

        assertEquals("User disconnected", rule.ws.last.closeReason)
        assertEquals("client unsubscribed", rule.rt.last.closeReason)
        assertTrue(vm.emojis.value.isEmpty())
    }

    @Test
    fun `a cleared view model reconnects and heartbeats once its socket reports closed`() {
        rule.connect()
        rule.clear()

        rule.ws.last.closed(1000, "User disconnected")
        rule.advance(1_000)
        rule.ws.last.open()
        rule.advance(5_000)

        // Bug: WebSocketClient.disconnect() has no intentional-close flag, so the cleared view model's socket comes back.
        assertEquals(2, rule.ws.sockets.size)
        assertEquals("heartbeat", rule.ws.last.sentJson.single().str("action"))
    }

    @Test
    fun `the default factory still builds the view model from its public constructor`() {
        val store = ViewModelStore()

        val real = ViewModelProvider(store, ViewModelProvider.AndroidViewModelFactory.getInstance(rule.app))[GameViewModel::class.java]

        assertEquals(ConnectionState.DISCONNECTED, real.connectionState.value)
        assertNull(real.currentGame.value)
        store.clear()
    }
}
