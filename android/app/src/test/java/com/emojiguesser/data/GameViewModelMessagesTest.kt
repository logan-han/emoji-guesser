package com.emojiguesser.data

import android.os.VibrationEffect
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.emojiguesser.audio.SoundEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class GameViewModelMessagesTest {
    @get:Rule val rule = GameViewModelRule()
    private val vm get() = rule.vm

    private val ann = Player(connectionId = "c1", sessionId = "s-ann", name = "Ann")
    private val bob = Player(connectionId = "c2", sessionId = "s-bob", name = "Bob")
    private val cat = Player(connectionId = "c3", sessionId = "s-cat", name = "Cat")

    private fun game(
        state: String = "IN_PROGRESS",
        players: List<Player> = listOf(ann, bob),
        id: String = "G1",
        round: Int = 1
    ) = Game(gameId = id, ownerId = "c1", players = players, gameState = state, turnState = "DESCRIBING", currentRound = round)

    @Before
    fun connect() = rule.connect()

    @Test
    fun `game actions update the game`() {
        val actions = listOf(
            "gameCreated", "playerJoined", "gameStarted", "playerNameUpdated", "gameRestarted",
            "playerLeft", "nextTurn", "playerReconnected", "spectatorJoined", "gameUpdated"
        )

        actions.forEachIndexed { round, action ->
            rule.server(ServerMessage(action = action, game = game(round = round)))
            assertEquals(action, round, vm.currentGame.value?.currentRound)
        }
    }

    @Test
    fun `gameUpdated quietly refreshes the game without touching the turn`() {
        rule.server(ServerMessage(action = "playerJoined", game = game(players = listOf(ann))))
        rule.server(ServerMessage(action = "newEmoji", emoji = "🐘"))

        rule.server(ServerMessage(action = "gameUpdated", game = game(players = listOf(ann, bob))))

        assertEquals(listOf("Ann", "Bob"), vm.currentGame.value?.players?.map { it.name })
        assertEquals(listOf("🐘"), vm.emojis.value)
        assertEquals(1, rule.plays(SoundEvent.PlayerJoined))
    }

    @Test
    fun `game actions without a game are ignored`() {
        rule.server(ServerMessage(action = "playerJoined"))
        rule.server(ServerMessage(action = "nextTurn"))
        rule.server(ServerMessage(action = "gameUpdated"))

        assertNull(vm.currentGame.value)
    }

    @Test
    fun `gameStarted, nextTurn and gameRestarted clear the turn and only gameStarted plays the start sound`() {
        listOf("gameStarted", "nextTurn", "gameRestarted").forEach { action ->
            rule.server(ServerMessage(action = "playerJoined", game = game()))
            rule.server(ServerMessage(action = "chooseWord", wordOptions = listOf("kiwi", "plum")))
            rule.server(ServerMessage(action = "describeWord", word = "apple"))
            rule.server(ServerMessage(action = "turnStarted", hint = "a _ _ _ _"))
            rule.server(ServerMessage(action = "chooseWord", wordOptions = listOf("kiwi", "plum")))
            rule.server(ServerMessage(action = "newEmoji", emoji = "🐘"))
            rule.server(ServerMessage(action = "newGuess", text = "cat", guesserId = "c2"))
            rule.server(ServerMessage(action = "wordGuessed", word = "elephant", guesserName = "Bob"))

            rule.server(ServerMessage(action = action, game = game()))

            assertTrue(action, vm.emojis.value.isEmpty())
            assertTrue(action, vm.guesses.value.isEmpty())
            assertTrue(action, vm.wordOptions.value.isEmpty())
            assertNull(action, vm.secretWord.value)
            assertNull(action, vm.currentHint.value)
            assertNull(action, vm.lastGuessedWord.value)
            assertNull(action, vm.lastGuesserName.value)
        }
        assertEquals(1, rule.plays(SoundEvent.GameStart))
    }

    @Test
    fun `playerJoined only plays a sound when the roster grows`() {
        rule.server(ServerMessage(action = "playerJoined", game = game(players = listOf(ann))))
        rule.server(ServerMessage(action = "playerJoined", game = game(players = listOf(ann))))
        rule.server(ServerMessage(action = "playerLeft", game = game(players = listOf(ann, bob))))
        rule.server(ServerMessage(action = "playerJoined", game = game(players = listOf(ann, bob, cat))))

        assertEquals(2, rule.plays(SoundEvent.PlayerJoined))
    }

    @Test
    fun `publicGamesList replaces the list and treats a missing list as empty`() {
        rule.server(ServerMessage(action = "publicGamesList", games = listOf(game(id = "P1"), game(id = "P2"))))
        assertEquals(listOf("P1", "P2"), vm.publicGames.value.map { it.gameId })

        rule.server(ServerMessage(action = "publicGamesList"))
        assertTrue(vm.publicGames.value.isEmpty())
    }

    @Test
    fun `chooseWord offers options and describeWord takes the chosen word`() {
        rule.server(ServerMessage(action = "chooseWord", wordOptions = listOf("apple", "pear")))
        assertEquals(listOf("apple", "pear"), vm.wordOptions.value)
        rule.server(ServerMessage(action = "chooseWord"))
        assertTrue(vm.wordOptions.value.isEmpty())

        rule.server(ServerMessage(action = "chooseWord", wordOptions = listOf("apple", "pear")))
        rule.server(ServerMessage(action = "describeWord", word = "apple", game = game(round = 2)))
        assertEquals("apple", vm.secretWord.value)
        assertTrue(vm.wordOptions.value.isEmpty())
        assertEquals(2, vm.currentGame.value?.currentRound)

        rule.server(ServerMessage(action = "describeWord", word = "pear"))
        assertEquals("pear", vm.secretWord.value)
        assertEquals(2, vm.currentGame.value?.currentRound)
    }

    @Test
    fun `turnStarted sets the hint and clears the board`() {
        rule.server(ServerMessage(action = "newEmoji", emoji = "🐘"))
        rule.server(ServerMessage(action = "newGuess", text = "cat"))

        rule.server(ServerMessage(action = "turnStarted", hint = "_ _ _", game = game(round = 3)))
        assertEquals("_ _ _", vm.currentHint.value)
        assertTrue(vm.emojis.value.isEmpty())
        assertTrue(vm.guesses.value.isEmpty())
        assertEquals(3, vm.currentGame.value?.currentRound)

        rule.server(ServerMessage(action = "turnStarted", hint = "c _ _"))
        assertEquals("c _ _", vm.currentHint.value)
        assertEquals(3, vm.currentGame.value?.currentRound)

        rule.server(ServerMessage(action = "hintUpdated", hint = "c a _"))
        assertEquals("c a _", vm.currentHint.value)
    }

    @Test
    fun `newEmoji appends with a sound and emojisCleared empties the board`() {
        rule.server(ServerMessage(action = "newEmoji", emoji = "🐘"))
        rule.server(ServerMessage(action = "newEmoji"))
        rule.server(ServerMessage(action = "newEmoji", emoji = "🥜"))
        assertEquals(listOf("🐘", "🥜"), vm.emojis.value)
        assertEquals(2, rule.plays(SoundEvent.EmojiSelect))

        rule.server(ServerMessage(action = "emojisCleared"))
        assertTrue(vm.emojis.value.isEmpty())
    }

    @Test
    fun `newGuess names the guesser from the roster`() {
        rule.server(ServerMessage(action = "newGuess", text = "early", guesserId = "c2"))
        rule.server(ServerMessage(action = "playerJoined", game = game()))
        rule.server(ServerMessage(action = "newGuess", text = "cat", guesserId = "c2"))
        rule.server(ServerMessage(action = "newGuess", text = "dog", guesserId = "c9"))
        rule.server(ServerMessage(action = "newGuess", text = "eel"))
        rule.server(ServerMessage(action = "newGuess", guesserId = "c2"))

        assertEquals(
            listOf(
                GuessEntry("early", "c2", null),
                GuessEntry("cat", "c2", "Bob"),
                GuessEntry("dog", "c9", null),
                GuessEntry("eel", "", null)
            ),
            vm.guesses.value
        )
        assertEquals(4, rule.plays(SoundEvent.NewGuess))
    }

    @Test
    fun `wordGuessed records the winner and celebrates`() {
        rule.server(ServerMessage(action = "wordGuessed", word = "apple", guesserName = "Bob", game = game(round = 4)))

        assertEquals("apple", vm.lastGuessedWord.value)
        assertEquals("Bob", vm.lastGuesserName.value)
        assertEquals(4, vm.currentGame.value?.currentRound)
        assertEquals(1, rule.plays(SoundEvent.CorrectGuess))
        assertEquals(VibrationEffect.EFFECT_HEAVY_CLICK, rule.lastHaptic())

        rule.server(ServerMessage(action = "wordGuessed", word = "pear", guesserName = "Ann"))
        assertEquals("pear", vm.lastGuessedWord.value)
        assertEquals(4, vm.currentGame.value?.currentRound)
    }

    @Test
    fun `timeUp reveals the word without a winner`() {
        rule.server(ServerMessage(action = "wordGuessed", word = "apple", guesserName = "Bob"))

        rule.server(ServerMessage(action = "timeUp", word = "pear"))

        assertEquals("pear", vm.lastGuessedWord.value)
        assertNull(vm.lastGuesserName.value)
        assertEquals(1, rule.plays(SoundEvent.TimeUp))
        assertEquals(VibrationEffect.EFFECT_DOUBLE_CLICK, rule.lastHaptic())
    }

    @Test
    fun `gameEnded stores the final game and plays the end sound`() {
        rule.server(ServerMessage(action = "gameEnded", game = game(state = "ENDED")))
        assertEquals("ENDED", vm.currentGame.value?.gameState)

        rule.server(ServerMessage(action = "gameEnded"))
        assertEquals("ENDED", vm.currentGame.value?.gameState)
        assertEquals(2, rule.plays(SoundEvent.GameEnd))
    }

    @Test
    fun `late updates for an ended game are ignored`() {
        rule.server(ServerMessage(action = "wordGuessed", word = "apple", guesserName = "Bob"))
        rule.server(ServerMessage(action = "gameEnded", game = game(state = "ENDED", round = 5)))

        rule.server(ServerMessage(action = "nextTurn", game = game(round = 6)))
        rule.server(ServerMessage(action = "gameStarted", game = game(round = 6)))
        assertEquals(5, vm.currentGame.value?.currentRound)
        assertEquals("apple", vm.lastGuessedWord.value)
        assertEquals(0, rule.plays(SoundEvent.GameStart))

        rule.server(ServerMessage(action = "gameEnded", game = game(state = "ENDED", round = 7)))
        assertEquals(7, vm.currentGame.value?.currentRound)

        rule.server(ServerMessage(action = "playerJoined", game = game(state = "WAITING", id = "G2")))
        assertEquals("G2", vm.currentGame.value?.gameId)
    }

    @Test
    fun `errors are surfaced and unknown actions change nothing`() {
        rule.server(ServerMessage(action = "statusMessage", message = "Ann is choosing a word..."))
        rule.server(ServerMessage(action = "somethingNew", game = game()))
        assertNull(vm.currentGame.value)
        assertNull(vm.errorMessage.value)

        rule.server(ServerMessage(action = "error", message = "Game not found"))
        assertEquals("Game not found", vm.errorMessage.value)
    }

    @Test
    fun `action replies and stream events share one handler and duplicate events are dropped`() {
        rule.http.autoReply = null
        rule.server(ServerMessage(action = "playerJoined", eventId = "G1:1", game = game(round = 1)))

        vm.submitEmoji("🐘")
        rule.http.last.reply("""{"messages":[{"action":"newEmoji","emoji":"🐘","eventId":"G1:2"}]}""")
        rule.server(ServerMessage(action = "newEmoji", eventId = "G1:2", emoji = "🐘"))
        rule.server(ServerMessage(action = "playerJoined", eventId = "G1:1", game = game(round = 9)))
        rule.server(ServerMessage(action = "newEmoji", emoji = "🥜"))
        rule.server(ServerMessage(action = "newEmoji", emoji = "🥜"))

        assertEquals(listOf("🐘", "🥜", "🥜"), vm.emojis.value)
        assertEquals(1, vm.currentGame.value?.currentRound)
    }

    @Test
    fun `the dedupe window forgets the oldest of 200 event ids`() {
        (0..200).forEach { rule.server(ServerMessage(action = "newEmoji", eventId = "e$it", emoji = "🙂")) }
        assertEquals(201, vm.emojis.value.size)

        rule.server(ServerMessage(action = "newEmoji", eventId = "e0", emoji = "🙂"))
        rule.server(ServerMessage(action = "newEmoji", eventId = "e200", emoji = "🙂"))

        assertEquals(202, vm.emojis.value.size)
    }

    @Test
    fun `a restart brings an ended game back to the waiting room`() {
        rule.server(ServerMessage(action = "gameEnded", game = game(state = "ENDED")))

        rule.server(ServerMessage(action = "gameRestarted", game = game(state = "WAITING")))

        assertEquals("WAITING", vm.currentGame.value?.gameState)
        assertEquals(GamePhase.Waiting, vm.currentGame.value?.phase())
    }
}
