package com.emojiguesser.data

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ModelDefaultsTest {

    @Test
    fun `state enums spell the server's game and turn states`() {
        assertEquals(listOf("WAITING", "IN_PROGRESS", "ENDED"), GameState.entries.map { it.name })
        assertEquals(listOf("CHOOSING_WORD", "DESCRIBING"), TurnState.entries.map { it.name })

        val game = Game(gameId = "G", ownerId = "o", gameState = GameState.IN_PROGRESS.name, turnState = TurnState.DESCRIBING.name)
        assertEquals(GamePhase.Describing, game.phase())
    }

    @Test
    fun `a guess without a name leaves it null`() {
        assertNull(GuessEntry(text = "cat", guesserId = "c1").guesserName)
    }

    @Test
    fun `an action reply defaults to no messages and no stream`() {
        val reply = Json.decodeFromString(ActionReply.serializer(), "{}")

        assertEquals(ActionReply(), reply)
        assertEquals(emptyList<ServerMessage>(), reply.messages)
        assertNull(reply.stream)
        assertNull(StreamCursor(gameId = "G").after)
    }
}
