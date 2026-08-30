package com.emojiguesser

import com.emojiguesser.data.Game
import com.emojiguesser.data.GuessEntry
import com.emojiguesser.data.Player
import com.emojiguesser.data.ServerMessage
import com.emojiguesser.data.WebSocketMessage
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class ModelsTest {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    @Test
    fun `Player serialization roundtrip`() {
        val player = Player(
            connectionId = "conn123",
            sessionId = "sess456",
            name = "TestPlayer",
            score = 100,
            isSpectator = false
        )

        val jsonString = json.encodeToString(player)
        val decoded = json.decodeFromString<Player>(jsonString)

        assertEquals(player.connectionId, decoded.connectionId)
        assertEquals(player.sessionId, decoded.sessionId)
        assertEquals(player.name, decoded.name)
        assertEquals(player.score, decoded.score)
        assertEquals(player.isSpectator, decoded.isSpectator)
    }

    @Test
    fun `Game serialization with players`() {
        val players = listOf(
            Player(connectionId = "c1", name = "Player1", score = 50),
            Player(connectionId = "c2", name = "Player2", score = 75)
        )
        val game = Game(
            gameId = "ABC123",
            ownerId = "c1",
            players = players,
            gameState = "WAITING",
            timeLimit = 120
        )

        val jsonString = json.encodeToString(game)
        val decoded = json.decodeFromString<Game>(jsonString)

        assertEquals(game.gameId, decoded.gameId)
        assertEquals(game.players.size, decoded.players.size)
        assertEquals("Player1", decoded.players[0].name)
        assertEquals("Player2", decoded.players[1].name)
    }

    @Test
    fun `WebSocketMessage createGame action`() {
        val message = WebSocketMessage(
            action = "createGame",
            sessionId = "session123",
            playerName = "MyPlayer",
            timeLimit = 90,
            isPublic = true
        )

        val jsonString = json.encodeToString(message)
        assertTrue(jsonString.contains("\"action\":\"createGame\""))
        assertTrue(jsonString.contains("\"sessionId\":\"session123\""))
        assertTrue(jsonString.contains("\"playerName\":\"MyPlayer\""))
        assertTrue(jsonString.contains("\"timeLimit\":90"))
        assertTrue(jsonString.contains("\"isPublic\":true"))
    }

    @Test
    fun `WebSocketMessage joinGame action`() {
        val message = WebSocketMessage(
            action = "joinGame",
            gameId = "GAME01",
            sessionId = "session456",
            playerName = "JoiningPlayer"
        )

        val jsonString = json.encodeToString(message)
        assertTrue(jsonString.contains("\"action\":\"joinGame\""))
        assertTrue(jsonString.contains("\"gameId\":\"GAME01\""))
    }

    @Test
    fun `WebSocketMessage submitEmoji action`() {
        val message = WebSocketMessage(
            action = "submitEmoji",
            gameId = "GAME01",
            emoji = "🎉"
        )

        val jsonString = json.encodeToString(message)
        assertTrue(jsonString.contains("\"action\":\"submitEmoji\""))
        assertTrue(jsonString.contains("\"emoji\":\"🎉\""))
    }

    @Test
    fun `WebSocketMessage submitGuess action`() {
        val message = WebSocketMessage(
            action = "submitGuess",
            gameId = "GAME01",
            guess = "elephant"
        )

        val jsonString = json.encodeToString(message)
        assertTrue(jsonString.contains("\"action\":\"submitGuess\""))
        assertTrue(jsonString.contains("\"guess\":\"elephant\""))
    }

    @Test
    fun `ServerMessage gameCreated parsing`() {
        val jsonString = """
            {
                "action": "gameCreated",
                "game": {
                    "gameId": "XYZ789",
                    "ownerId": "owner123",
                    "players": [{"connectionId": "owner123", "name": "Host", "score": 0}],
                    "gameState": "WAITING",
                    "timeLimit": 120
                }
            }
        """.trimIndent()

        val message = json.decodeFromString<ServerMessage>(jsonString)
        assertEquals("gameCreated", message.action)
        assertNotNull(message.game)
        assertEquals("XYZ789", message.game?.gameId)
        assertEquals(1, message.game?.players?.size)
    }

    @Test
    fun `ServerMessage publicGamesList parsing`() {
        val jsonString = """
            {
                "action": "publicGamesList",
                "games": [
                    {"gameId": "G1", "ownerId": "o1", "players": [], "gameState": "WAITING", "timeLimit": 120},
                    {"gameId": "G2", "ownerId": "o2", "players": [], "gameState": "WAITING", "timeLimit": 90}
                ]
            }
        """.trimIndent()

        val message = json.decodeFromString<ServerMessage>(jsonString)
        assertEquals("publicGamesList", message.action)
        assertEquals(2, message.games?.size)
    }

    @Test
    fun `ServerMessage newEmoji parsing`() {
        val jsonString = """{"action": "newEmoji", "emoji": "🚀"}"""
        val message = json.decodeFromString<ServerMessage>(jsonString)
        assertEquals("newEmoji", message.action)
        assertEquals("🚀", message.emoji)
    }

    @Test
    fun `ServerMessage wordGuessed parsing`() {
        val jsonString = """
            {
                "action": "wordGuessed",
                "guesserName": "Winner",
                "word": "rocket",
                "game": {"gameId": "G1", "ownerId": "o1", "players": [], "gameState": "IN_PROGRESS", "timeLimit": 120}
            }
        """.trimIndent()

        val message = json.decodeFromString<ServerMessage>(jsonString)
        assertEquals("wordGuessed", message.action)
        assertEquals("Winner", message.guesserName)
        assertEquals("rocket", message.word)
    }

    @Test
    fun `ServerMessage error parsing`() {
        val jsonString = """{"action": "error", "message": "Game not found"}"""
        val message = json.decodeFromString<ServerMessage>(jsonString)
        assertEquals("error", message.action)
        assertEquals("Game not found", message.message)
    }

    @Test
    fun `GuessEntry creation`() {
        val guess = GuessEntry(
            text = "apple",
            guesserId = "player1",
            guesserName = "Alice"
        )
        assertEquals("apple", guess.text)
        assertEquals("player1", guess.guesserId)
        assertEquals("Alice", guess.guesserName)
    }

    @Test
    fun `Game state values`() {
        val waitingGame = Game(gameId = "1", ownerId = "o", gameState = "WAITING", timeLimit = 120)
        val inProgressGame = Game(gameId = "2", ownerId = "o", gameState = "IN_PROGRESS", timeLimit = 120)
        val endedGame = Game(gameId = "3", ownerId = "o", gameState = "ENDED", timeLimit = 120)

        assertEquals("WAITING", waitingGame.gameState)
        assertEquals("IN_PROGRESS", inProgressGame.gameState)
        assertEquals("ENDED", endedGame.gameState)
    }

    @Test
    fun `Player default values`() {
        val player = Player(connectionId = "c1", name = "Test")
        assertEquals(0, player.score)
        assertNull(player.sessionId)
        assertFalse(player.isSpectator)
        assertFalse(player.wantsToPlayAgain)
    }

    @Test
    fun `Game with optional fields`() {
        val game = Game(
            gameId = "TEST",
            ownerId = "owner",
            secretWord = "secret",
            wordOptions = listOf("word1", "word2", "word3"),
            turnState = "DESCRIBING",
            currentHint = "_ _ _ _ _",
            currentRound = 2,
            maxRounds = 4
        )

        assertEquals("secret", game.secretWord)
        assertEquals(3, game.wordOptions?.size)
        assertEquals("DESCRIBING", game.turnState)
        assertEquals("_ _ _ _ _", game.currentHint)
        assertEquals(2, game.currentRound)
        assertEquals(4, game.maxRounds)
    }
}
