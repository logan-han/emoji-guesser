package com.emojiguesser

import com.emojiguesser.data.WebSocketMessage
import com.emojiguesser.network.ConnectionState
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class WebSocketClientTest {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    @Test
    fun `ConnectionState enum values`() {
        assertEquals(4, ConnectionState.entries.size)
        assertTrue(ConnectionState.entries.contains(ConnectionState.DISCONNECTED))
        assertTrue(ConnectionState.entries.contains(ConnectionState.CONNECTING))
        assertTrue(ConnectionState.entries.contains(ConnectionState.CONNECTED))
        assertTrue(ConnectionState.entries.contains(ConnectionState.FAILED))
    }

    @Test
    fun `createGame message format`() {
        val message = WebSocketMessage(
            action = "createGame",
            sessionId = "test-session",
            playerName = "TestPlayer",
            timeLimit = 120,
            isPublic = false
        )

        val jsonString = json.encodeToString(message)

        assertTrue(jsonString.contains("\"action\":\"createGame\""))
        assertTrue(jsonString.contains("\"sessionId\":\"test-session\""))
        assertTrue(jsonString.contains("\"playerName\":\"TestPlayer\""))
        assertTrue(jsonString.contains("\"timeLimit\":120"))
    }

    @Test
    fun `joinGame message format`() {
        val message = WebSocketMessage(
            action = "joinGame",
            gameId = "ABC123",
            sessionId = "test-session",
            playerName = "Joiner"
        )

        val jsonString = json.encodeToString(message)

        assertTrue(jsonString.contains("\"action\":\"joinGame\""))
        assertTrue(jsonString.contains("\"gameId\":\"ABC123\""))
    }

    @Test
    fun `startGame message format`() {
        val message = WebSocketMessage(
            action = "startGame",
            gameId = "ABC123",
            sessionId = "test-session",
            timeLimit = 90
        )

        val jsonString = json.encodeToString(message)

        assertTrue(jsonString.contains("\"action\":\"startGame\""))
        assertTrue(jsonString.contains("\"timeLimit\":90"))
    }

    @Test
    fun `chooseWord message format`() {
        val message = WebSocketMessage(
            action = "chooseWord",
            gameId = "ABC123",
            word = "elephant"
        )

        val jsonString = json.encodeToString(message)

        assertTrue(jsonString.contains("\"action\":\"chooseWord\""))
        assertTrue(jsonString.contains("\"word\":\"elephant\""))
    }

    @Test
    fun `submitEmoji message format`() {
        val message = WebSocketMessage(
            action = "submitEmoji",
            gameId = "ABC123",
            emoji = "🐘"
        )

        val jsonString = json.encodeToString(message)

        assertTrue(jsonString.contains("\"action\":\"submitEmoji\""))
        assertTrue(jsonString.contains("\"emoji\":\"🐘\""))
    }

    @Test
    fun `submitGuess message format`() {
        val message = WebSocketMessage(
            action = "submitGuess",
            gameId = "ABC123",
            guess = "elephant"
        )

        val jsonString = json.encodeToString(message)

        assertTrue(jsonString.contains("\"action\":\"submitGuess\""))
        assertTrue(jsonString.contains("\"guess\":\"elephant\""))
    }

    @Test
    fun `heartbeat message format`() {
        val message = WebSocketMessage(
            action = "heartbeat",
            sessionId = "test-session",
            gameId = "ABC123"
        )

        val jsonString = json.encodeToString(message)

        assertTrue(jsonString.contains("\"action\":\"heartbeat\""))
        assertTrue(jsonString.contains("\"sessionId\":\"test-session\""))
        assertTrue(jsonString.contains("\"gameId\":\"ABC123\""))
    }

    @Test
    fun `listPublicGames message format`() {
        val message = WebSocketMessage(action = "listPublicGames")

        val jsonString = json.encodeToString(message)

        assertTrue(jsonString.contains("\"action\":\"listPublicGames\""))
    }

    @Test
    fun `restartGame message format`() {
        val message = WebSocketMessage(
            action = "restartGame",
            gameId = "ABC123",
            sessionId = "test-session",
            timeLimit = 120
        )

        val jsonString = json.encodeToString(message)

        assertTrue(jsonString.contains("\"action\":\"restartGame\""))
    }

    @Test
    fun `updatePlayerName message format`() {
        val message = WebSocketMessage(
            action = "updatePlayerName",
            gameId = "ABC123",
            name = "NewName",
            sessionId = "test-session"
        )

        val jsonString = json.encodeToString(message)

        assertTrue(jsonString.contains("\"action\":\"updatePlayerName\""))
        assertTrue(jsonString.contains("\"name\":\"NewName\""))
    }
}
