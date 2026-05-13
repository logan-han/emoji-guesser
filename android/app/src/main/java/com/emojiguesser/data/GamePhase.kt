package com.emojiguesser.data

sealed class GamePhase {
    data object Waiting : GamePhase()
    data object ChoosingWord : GamePhase()
    data object Describing : GamePhase()
    data object Ended : GamePhase()
    data object Unknown : GamePhase()
}

fun Game.phase(): GamePhase = when (gameState) {
    "WAITING" -> GamePhase.Waiting
    "ENDED" -> GamePhase.Ended
    "IN_PROGRESS" -> when (turnState) {
        "CHOOSING_WORD" -> GamePhase.ChoosingWord
        "DESCRIBING" -> GamePhase.Describing
        else -> GamePhase.Unknown
    }
    else -> GamePhase.Unknown
}
