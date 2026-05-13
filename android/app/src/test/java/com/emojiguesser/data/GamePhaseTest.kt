package com.emojiguesser.data

import org.junit.Assert.assertEquals
import org.junit.Test

class GamePhaseTest {

    private fun game(state: String, turn: String? = null) =
        Game(gameId = "G", ownerId = "o", gameState = state, turnState = turn)

    @Test
    fun `waiting state maps to Waiting`() {
        assertEquals(GamePhase.Waiting, game("WAITING").phase())
    }

    @Test
    fun `ended state maps to Ended`() {
        assertEquals(GamePhase.Ended, game("ENDED").phase())
    }

    @Test
    fun `in progress with choosing word turn maps to ChoosingWord`() {
        assertEquals(GamePhase.ChoosingWord, game("IN_PROGRESS", "CHOOSING_WORD").phase())
    }

    @Test
    fun `in progress with describing turn maps to Describing`() {
        assertEquals(GamePhase.Describing, game("IN_PROGRESS", "DESCRIBING").phase())
    }

    @Test
    fun `in progress with null turn maps to Unknown`() {
        assertEquals(GamePhase.Unknown, game("IN_PROGRESS", null).phase())
    }

    @Test
    fun `garbage state maps to Unknown`() {
        assertEquals(GamePhase.Unknown, game("SOMETHING_NEW").phase())
    }
}
