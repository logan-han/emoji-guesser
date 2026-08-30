package com.emojiguesser

import com.emojiguesser.data.ServerMessage
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ServerMessageTest {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    @Test
    fun `connected message parses with connectionId`() {
        val message = json.decodeFromString<ServerMessage>(
            """{"action":"connected","connectionId":"conn-123"}"""
        )
        assertEquals("connected", message.action)
        assertEquals("conn-123", message.connectionId)
    }

    @Test
    fun `playerJoined message parses game payload`() {
        val payload = """
            {
                "action":"playerJoined",
                "game":{
                    "gameId":"G1",
                    "ownerId":"o1",
                    "players":[
                        {"connectionId":"o1","name":"Host","score":0},
                        {"connectionId":"p2","name":"Bob","score":0}
                    ],
                    "gameState":"WAITING",
                    "timeLimit":120
                }
            }
        """.trimIndent()
        val message = json.decodeFromString<ServerMessage>(payload)
        assertEquals("playerJoined", message.action)
        assertEquals(2, message.game?.players?.size)
        assertEquals("Bob", message.game?.players?.get(1)?.name)
    }

    @Test
    fun `playerLeft message keeps remaining players`() {
        val payload = """
            {
                "action":"playerLeft",
                "game":{
                    "gameId":"G1",
                    "ownerId":"o1",
                    "players":[{"connectionId":"o1","name":"Host","score":0}],
                    "gameState":"WAITING",
                    "timeLimit":120
                }
            }
        """.trimIndent()
        val message = json.decodeFromString<ServerMessage>(payload)
        assertEquals("playerLeft", message.action)
        assertEquals(1, message.game?.players?.size)
    }

    @Test
    fun `chooseWord message returns word options for describer`() {
        val payload = """
            {"action":"chooseWord","wordOptions":["apple","banana","cherry"]}
        """.trimIndent()
        val message = json.decodeFromString<ServerMessage>(payload)
        assertEquals("chooseWord", message.action)
        assertEquals(listOf("apple", "banana", "cherry"), message.wordOptions)
    }

    @Test
    fun `describeWord message includes secret word and game`() {
        val payload = """
            {
                "action":"describeWord",
                "word":"elephant",
                "game":{
                    "gameId":"G1",
                    "ownerId":"o1",
                    "gameState":"IN_PROGRESS",
                    "turnState":"DESCRIBING",
                    "timeLimit":120
                }
            }
        """.trimIndent()
        val message = json.decodeFromString<ServerMessage>(payload)
        assertEquals("describeWord", message.action)
        assertEquals("elephant", message.word)
        assertEquals("DESCRIBING", message.game?.turnState)
    }

    @Test
    fun `turnStarted message carries hint and game state`() {
        val payload = """
            {
                "action":"turnStarted",
                "hint":"_ _ _ _ _",
                "game":{
                    "gameId":"G1",
                    "ownerId":"o1",
                    "gameState":"IN_PROGRESS",
                    "turnState":"DESCRIBING",
                    "currentDescriberIndex":0,
                    "timeLimit":120
                }
            }
        """.trimIndent()
        val message = json.decodeFromString<ServerMessage>(payload)
        assertEquals("turnStarted", message.action)
        assertEquals("_ _ _ _ _", message.hint)
        assertEquals(0, message.game?.currentDescriberIndex)
    }

    @Test
    fun `hintUpdated message updates only the hint field`() {
        val payload = """{"action":"hintUpdated","hint":"e _ _ _ _ _ n t"}"""
        val message = json.decodeFromString<ServerMessage>(payload)
        assertEquals("hintUpdated", message.action)
        assertEquals("e _ _ _ _ _ n t", message.hint)
        assertNull(message.game)
        assertNull(message.word)
    }

    @Test
    fun `newGuess message carries guesser identity and text`() {
        val payload = """
            {"action":"newGuess","text":"banana","guesserId":"conn-5","guesserName":"Alice"}
        """.trimIndent()
        val message = json.decodeFromString<ServerMessage>(payload)
        assertEquals("newGuess", message.action)
        assertEquals("banana", message.text)
        assertEquals("conn-5", message.guesserId)
        assertEquals("Alice", message.guesserName)
    }

    @Test
    fun `timeUp message reveals the secret word`() {
        val payload = """{"action":"timeUp","word":"elephant"}"""
        val message = json.decodeFromString<ServerMessage>(payload)
        assertEquals("timeUp", message.action)
        assertEquals("elephant", message.word)
        assertNull(message.guesserName)
    }

    @Test
    fun `gameEnded message includes final game state`() {
        val payload = """
            {
                "action":"gameEnded",
                "game":{
                    "gameId":"G1",
                    "ownerId":"o1",
                    "gameState":"ENDED",
                    "players":[
                        {"connectionId":"o1","name":"Alice","score":15},
                        {"connectionId":"p2","name":"Bob","score":8}
                    ],
                    "timeLimit":120
                }
            }
        """.trimIndent()
        val message = json.decodeFromString<ServerMessage>(payload)
        assertEquals("gameEnded", message.action)
        assertEquals("ENDED", message.game?.gameState)
        assertEquals(15, message.game?.players?.get(0)?.score)
    }

    @Test
    fun `nextTurn message advances describer index`() {
        val payload = """
            {
                "action":"nextTurn",
                "game":{
                    "gameId":"G1",
                    "ownerId":"o1",
                    "gameState":"IN_PROGRESS",
                    "turnState":"CHOOSING_WORD",
                    "currentRound":2,
                    "currentDescriberIndex":1,
                    "timeLimit":120
                }
            }
        """.trimIndent()
        val message = json.decodeFromString<ServerMessage>(payload)
        assertEquals("nextTurn", message.action)
        assertEquals(2, message.game?.currentRound)
        assertEquals(1, message.game?.currentDescriberIndex)
    }

    @Test
    fun `gameRestarted resets state to WAITING`() {
        val payload = """
            {
                "action":"gameRestarted",
                "game":{
                    "gameId":"G1",
                    "ownerId":"o1",
                    "gameState":"WAITING",
                    "timeLimit":90
                }
            }
        """.trimIndent()
        val message = json.decodeFromString<ServerMessage>(payload)
        assertEquals("gameRestarted", message.action)
        assertEquals("WAITING", message.game?.gameState)
    }

    @Test
    fun `playerNameUpdated reflects renamed player`() {
        val payload = """
            {
                "action":"playerNameUpdated",
                "game":{
                    "gameId":"G1",
                    "ownerId":"o1",
                    "players":[{"connectionId":"o1","name":"NewName","score":0}],
                    "gameState":"WAITING",
                    "timeLimit":120
                }
            }
        """.trimIndent()
        val message = json.decodeFromString<ServerMessage>(payload)
        assertEquals("playerNameUpdated", message.action)
        assertEquals("NewName", message.game?.players?.get(0)?.name)
    }

    @Test
    fun `heartbeatAck round trip carries no extra payload`() {
        val payload = """{"action":"heartbeatAck"}"""
        val message = json.decodeFromString<ServerMessage>(payload)
        assertEquals("heartbeatAck", message.action)
        assertNull(message.game)
        assertNull(message.message)
    }

    @Test
    fun `unknown action is still decoded`() {
        val payload = """{"action":"someFutureAction","message":"hi"}"""
        val message = json.decodeFromString<ServerMessage>(payload)
        assertEquals("someFutureAction", message.action)
        assertEquals("hi", message.message)
    }

    @Test
    fun `unknown fields are ignored during decoding`() {
        val payload = """
            {"action":"connected","connectionId":"c1","futureField":"ignored","nested":{"a":1}}
        """.trimIndent()
        val message = json.decodeFromString<ServerMessage>(payload)
        assertEquals("connected", message.action)
        assertEquals("c1", message.connectionId)
    }

    @Test
    fun `empty games list parses correctly`() {
        val payload = """{"action":"publicGamesList","games":[]}"""
        val message = json.decodeFromString<ServerMessage>(payload)
        assertEquals(0, message.games?.size)
        assertNotNull(message.games)
    }

    @Test
    fun `missing optional fields default to null`() {
        val message = json.decodeFromString<ServerMessage>("""{"action":"connected"}""")
        assertNull(message.game)
        assertNull(message.games)
        assertNull(message.word)
        assertNull(message.hint)
        assertNull(message.connectionId)
        assertNull(message.message)
        assertNull(message.emoji)
        assertNull(message.text)
        assertNull(message.guesserId)
        assertNull(message.guesserName)
        assertNull(message.wordOptions)
    }

    @Test
    fun `lenient JSON parses unquoted strings`() {
        val payload = "{action:connected,connectionId:c1}"
        val message = json.decodeFromString<ServerMessage>(payload)
        assertEquals("connected", message.action)
        assertEquals("c1", message.connectionId)
    }

    @Test
    fun `player score accumulates from gameEnded payload`() {
        val payload = """
            {
                "action":"gameEnded",
                "game":{
                    "gameId":"G1",
                    "ownerId":"o1",
                    "gameState":"ENDED",
                    "players":[
                        {"connectionId":"o1","name":"A","score":30,"wantsToPlayAgain":true},
                        {"connectionId":"o2","name":"B","score":20,"wantsToPlayAgain":false}
                    ],
                    "timeLimit":120
                }
            }
        """.trimIndent()
        val message = json.decodeFromString<ServerMessage>(payload)
        val players = message.game?.players ?: emptyList()
        assertEquals(50, players.sumOf { it.score })
        assertTrue(players[0].wantsToPlayAgain)
        assertTrue(!players[1].wantsToPlayAgain)
    }
}
