package com.emojiguesser.ui.screens

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import com.emojiguesser.data.Game
import com.emojiguesser.data.Player

internal fun player(id: String, name: String = id, score: Int = 0) =
    Player(connectionId = id, sessionId = "s-$id", name = name, score = score)

internal fun game(
    players: List<Player> = listOf(player("p1", "Alice"), player("p2", "Bob")),
    gameState: String = "WAITING",
    turnState: String? = null,
    ownerId: String = players.firstOrNull()?.connectionId ?: "p1",
    timeLimit: Int = 120,
    maxRounds: Int? = 3,
    currentRound: Int? = 1,
    turnStartTime: String? = null,
    isPublic: Boolean = false,
    gameId: String = "ABC123"
) = Game(
    gameId = gameId,
    ownerId = ownerId,
    players = players,
    gameState = gameState,
    turnState = turnState,
    timeLimit = timeLimit,
    maxRounds = maxRounds,
    currentRound = currentRound,
    turnStartTime = turnStartTime,
    isPublic = isPublic
)

/** A clickable node with no text or description, e.g. the guess send button. */
internal val textlessClickable = SemanticsMatcher("clickable without text") { node ->
    SemanticsActions.OnClick in node.config &&
        SemanticsActions.SetText !in node.config &&
        SemanticsProperties.ContentDescription !in node.config &&
        node.config.getOrElse(SemanticsProperties.Text) { emptyList() }.isEmpty()
}
