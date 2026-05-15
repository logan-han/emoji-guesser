package com.emojiguesser

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import com.emojiguesser.data.GameViewModel
import com.emojiguesser.ui.screens.MainScreen
import com.emojiguesser.ui.theme.EmojiGuesserTheme
import com.emojiguesser.update.AppUpdateController

class MainActivity : ComponentActivity() {

    private lateinit var updateController: AppUpdateController

    private val updateFlowLauncher = registerForActivityResult(
        ActivityResultContracts.StartIntentSenderForResult()
    ) { result -> updateController.handleResult(result) }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        updateController = AppUpdateController(this)
        updateController.checkForUpdate(updateFlowLauncher)

        // Handle deep link
        val deepLinkGameId = intent?.data?.lastPathSegment

        setContent {
            EmojiGuesserTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    val viewModel: GameViewModel = viewModel()

                    // Connect to WebSocket on launch
                    LaunchedEffect(Unit) {
                        viewModel.connect()
                    }

                    // Handle deep link game join
                    LaunchedEffect(deepLinkGameId) {
                        deepLinkGameId?.let { gameId ->
                            if (viewModel.playerName.value.isNotBlank()) {
                                viewModel.joinGame(gameId)
                            }
                        }
                    }

                    val currentGame by viewModel.currentGame.collectAsState()
                    val connectionState by viewModel.connectionState.collectAsState()
                    val playerName by viewModel.playerName.collectAsState()
                    val publicGames by viewModel.publicGames.collectAsState()
                    val emojis by viewModel.emojis.collectAsState()
                    val guesses by viewModel.guesses.collectAsState()
                    val wordOptions by viewModel.wordOptions.collectAsState()
                    val secretWord by viewModel.secretWord.collectAsState()
                    val currentHint by viewModel.currentHint.collectAsState()
                    val errorMessage by viewModel.errorMessage.collectAsState()
                    val lastGuessedWord by viewModel.lastGuessedWord.collectAsState()
                    val lastGuesserName by viewModel.lastGuesserName.collectAsState()
                    val updateDownloaded by updateController.updateDownloaded.collectAsState()

                    MainScreen(
                        currentGame = currentGame,
                        connectionState = connectionState,
                        playerName = playerName,
                        publicGames = publicGames,
                        emojis = emojis,
                        guesses = guesses,
                        wordOptions = wordOptions,
                        secretWord = secretWord,
                        currentHint = currentHint,
                        errorMessage = errorMessage,
                        lastGuessedWord = lastGuessedWord,
                        lastGuesserName = lastGuesserName,
                        isDescriber = viewModel.isCurrentPlayerDescriber(),
                        isOwner = viewModel.isGameOwner(),
                        currentDescriber = viewModel.getCurrentDescriber(),
                        deepLinkGameId = deepLinkGameId,
                        updateDownloaded = updateDownloaded,
                        onPlayerNameChange = viewModel::setPlayerName,
                        onCreateGame = viewModel::createGame,
                        onJoinGame = viewModel::joinGame,
                        onStartGame = viewModel::startGame,
                        onChooseWord = viewModel::chooseWord,
                        onSubmitEmoji = viewModel::submitEmoji,
                        onSubmitGuess = viewModel::submitGuess,
                        onListPublicGames = viewModel::listPublicGames,
                        onRestartGame = viewModel::restartGame,
                        onLeaveGame = viewModel::leaveGame,
                        onClearError = viewModel::clearError,
                        onInstallUpdate = updateController::completeUpdate
                    )
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        updateController.onResume(updateFlowLauncher)
    }

    override fun onDestroy() {
        updateController.dispose()
        super.onDestroy()
    }
}
