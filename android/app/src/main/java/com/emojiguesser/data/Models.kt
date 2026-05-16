package com.emojiguesser.data

import kotlinx.serialization.Serializable

@Serializable
data class Player(
    val connectionId: String,
    val sessionId: String? = null,
    val name: String,
    val score: Int = 0,
    val joinedAt: String? = null,
    val lastSeen: String? = null,
    val isSpectator: Boolean = false,
    val wantsToPlayAgain: Boolean = false
)

@Serializable
data class Game(
    val gameId: String,
    val ownerId: String,
    val ownerSessionId: String? = null,
    val players: List<Player> = emptyList(),
    val spectators: List<Player>? = null,
    val gameState: String = "WAITING", // WAITING, IN_PROGRESS, ENDED
    val currentRound: Int? = null,
    val maxRounds: Int? = null,
    val currentDescriberIndex: Int? = null,
    val secretWord: String? = null,
    val wordOptions: List<String>? = null,
    val turnState: String? = null, // CHOOSING_WORD, DESCRIBING
    val turnStartTime: String? = null,
    val timeLimit: Int = 120,
    val currentHint: String? = null,
    val createdAt: String? = null,
    val endedAt: String? = null,
    val isPublic: Boolean = false,
    val updatedAt: String? = null
)

@Serializable
data class WebSocketMessage(
    val action: String,
    val gameId: String? = null,
    val sessionId: String? = null,
    val playerName: String? = null,
    val word: String? = null,
    val guess: String? = null,
    val emoji: String? = null,
    val timeLimit: Int? = null,
    val maxRounds: Int? = null,
    val isPublic: Boolean? = null,
    val name: String? = null
)

@Serializable
data class ServerMessage(
    val action: String,
    val eventId: String? = null,
    val game: Game? = null,
    val games: List<Game>? = null,
    val connectionId: String? = null,
    val message: String? = null,
    val word: String? = null,
    val wordOptions: List<String>? = null,
    val emoji: String? = null,
    val text: String? = null,
    val guesserId: String? = null,
    val guesserName: String? = null,
    val hint: String? = null
)

enum class GameState {
    WAITING,
    IN_PROGRESS,
    ENDED
}

enum class TurnState {
    CHOOSING_WORD,
    DESCRIBING
}

data class GuessEntry(
    val text: String,
    val guesserId: String,
    val guesserName: String? = null
)
