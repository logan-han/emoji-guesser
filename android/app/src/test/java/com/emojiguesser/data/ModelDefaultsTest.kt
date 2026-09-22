package com.emojiguesser.data

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
}
