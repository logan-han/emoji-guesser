package com.emojiguesser.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.Snackbar
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.emojiguesser.R
import com.emojiguesser.data.Game
import com.emojiguesser.data.GamePhase
import com.emojiguesser.data.GuessEntry
import com.emojiguesser.data.Player
import com.emojiguesser.data.phase
import com.emojiguesser.network.ConnectionState
import com.emojiguesser.ui.theme.LocalConfetti
import com.emojiguesser.ui.theme.Tomato

@Composable
fun MainScreen(
    currentGame: Game?,
    connectionState: ConnectionState,
    playerName: String,
    publicGames: List<Game>,
    emojis: List<String>,
    guesses: List<GuessEntry>,
    wordOptions: List<String>,
    secretWord: String?,
    currentHint: String?,
    errorMessage: String?,
    lastGuessedWord: String?,
    lastGuesserName: String?,
    isDescriber: Boolean,
    isOwner: Boolean,
    currentDescriber: Player?,
    deepLinkGameId: String?,
    updateDownloaded: Boolean,
    onPlayerNameChange: (String) -> Unit,
    onCreateGame: (Int, Int, Boolean) -> Unit,
    onJoinGame: (String) -> Unit,
    onStartGame: (Int, Int) -> Unit,
    onChooseWord: (String) -> Unit,
    onSubmitEmoji: (String) -> Unit,
    onRemoveEmojiAt: (Int) -> Unit,
    onSubmitGuess: (String) -> Unit,
    onListPublicGames: () -> Unit,
    onRestartGame: (Int) -> Unit,
    onLeaveGame: () -> Unit,
    onClearError: () -> Unit,
    onInstallUpdate: () -> Unit
) {
    val palette = LocalConfetti.current

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.bg)
            .systemBarsPadding()
            .imePadding()
    ) {
        when {
            connectionState == ConnectionState.CONNECTING && currentGame == null -> {
                LoadingScreen("Connecting…")
            }
            connectionState == ConnectionState.FAILED -> {
                ErrorScreen("Connection failed. Please check your internet connection.")
            }
            currentGame == null -> {
                LobbyScreen(
                    playerName = playerName,
                    publicGames = publicGames,
                    deepLinkGameId = deepLinkGameId,
                    connectionState = connectionState,
                    onPlayerNameChange = onPlayerNameChange,
                    onCreateGame = onCreateGame,
                    onJoinGame = onJoinGame,
                    onListPublicGames = onListPublicGames
                )
            }
            else -> when (currentGame.phase()) {
                GamePhase.Waiting -> WaitingRoomScreen(
                    game = currentGame,
                    isOwner = isOwner,
                    onStartGame = onStartGame,
                    onLeaveGame = onLeaveGame
                )
                GamePhase.Ended -> GameEndScreen(
                    game = currentGame,
                    isOwner = isOwner,
                    onRestartGame = onRestartGame,
                    onLeaveGame = onLeaveGame
                )
                else -> GameScreen(
                    game = currentGame,
                    emojis = emojis,
                    guesses = guesses,
                    wordOptions = wordOptions,
                    secretWord = secretWord,
                    currentHint = currentHint,
                    lastGuessedWord = lastGuessedWord,
                    lastGuesserName = lastGuesserName,
                    isDescriber = isDescriber,
                    currentDescriber = currentDescriber,
                    onChooseWord = onChooseWord,
                    onSubmitEmoji = onSubmitEmoji,
                    onRemoveEmojiAt = onRemoveEmojiAt,
                    onSubmitGuess = onSubmitGuess,
                    onLeaveGame = onLeaveGame
                )
            }
        }

        errorMessage?.let { error ->
            Snackbar(
                modifier = Modifier
                    .padding(16.dp)
                    .align(Alignment.TopCenter),
                action = {
                    TextButton(onClick = onClearError) { Text(stringResource(R.string.conn_dismiss), color = palette.paper) }
                },
                containerColor = Tomato
            ) {
                Text(error, color = palette.paper)
            }
        }

        if (updateDownloaded) {
            Snackbar(
                modifier = Modifier
                    .padding(16.dp)
                    .align(Alignment.BottomCenter),
                action = {
                    TextButton(onClick = onInstallUpdate) { Text(stringResource(R.string.conn_restart), color = palette.paper) }
                }
            ) {
                Text(stringResource(R.string.conn_update_ready), color = palette.paper)
            }
        }
    }
}
