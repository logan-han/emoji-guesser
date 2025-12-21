package com.emojiguesser.data

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.emojiguesser.network.ConnectionState
import com.emojiguesser.network.WebSocketClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID

class GameViewModel(application: Application) : AndroidViewModel(application) {
    private val webSocketClient = WebSocketClient()
    private val prefs = application.getSharedPreferences("emoji_guesser", Context.MODE_PRIVATE)

    // Session ID persisted across app restarts
    val sessionId: String = prefs.getString("session_id", null) ?: run {
        val newId = UUID.randomUUID().toString()
        prefs.edit().putString("session_id", newId).apply()
        newId
    }

    // Saved player name
    private val _playerName = MutableStateFlow(prefs.getString("player_name", "") ?: "")
    val playerName: StateFlow<String> = _playerName.asStateFlow()

    // Connection state
    val connectionState: StateFlow<ConnectionState> = webSocketClient.connectionState

    // Game state
    private val _currentGame = MutableStateFlow<Game?>(null)
    val currentGame: StateFlow<Game?> = _currentGame.asStateFlow()

    private val _publicGames = MutableStateFlow<List<Game>>(emptyList())
    val publicGames: StateFlow<List<Game>> = _publicGames.asStateFlow()

    // UI state
    private val _emojis = MutableStateFlow<List<String>>(emptyList())
    val emojis: StateFlow<List<String>> = _emojis.asStateFlow()

    private val _guesses = MutableStateFlow<List<GuessEntry>>(emptyList())
    val guesses: StateFlow<List<GuessEntry>> = _guesses.asStateFlow()

    private val _wordOptions = MutableStateFlow<List<String>>(emptyList())
    val wordOptions: StateFlow<List<String>> = _wordOptions.asStateFlow()

    private val _secretWord = MutableStateFlow<String?>(null)
    val secretWord: StateFlow<String?> = _secretWord.asStateFlow()

    private val _currentHint = MutableStateFlow<String?>(null)
    val currentHint: StateFlow<String?> = _currentHint.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private val _lastGuessedWord = MutableStateFlow<String?>(null)
    val lastGuessedWord: StateFlow<String?> = _lastGuessedWord.asStateFlow()

    private val _lastGuesserName = MutableStateFlow<String?>(null)
    val lastGuesserName: StateFlow<String?> = _lastGuesserName.asStateFlow()

    init {
        viewModelScope.launch {
            webSocketClient.messages.collect { message ->
                handleServerMessage(message)
            }
        }
    }

    private fun handleServerMessage(message: ServerMessage) {
        when (message.action) {
            "connected" -> {
                // Connection established
            }
            "gameCreated", "playerJoined", "gameStarted", "playerNameUpdated",
            "gameRestarted", "playerLeft", "nextTurn" -> {
                message.game?.let { game ->
                    _currentGame.value = game
                    webSocketClient.currentGameId = game.gameId
                    // Clear emojis and guesses on new turn
                    if (message.action == "nextTurn" || message.action == "gameStarted") {
                        _emojis.value = emptyList()
                        _guesses.value = emptyList()
                        _lastGuessedWord.value = null
                        _lastGuesserName.value = null
                    }
                }
            }
            "publicGamesList" -> {
                _publicGames.value = message.games ?: emptyList()
            }
            "chooseWord" -> {
                _wordOptions.value = message.wordOptions ?: emptyList()
            }
            "describeWord" -> {
                _secretWord.value = message.word
                _wordOptions.value = emptyList()
                message.game?.let { _currentGame.value = it }
            }
            "turnStarted" -> {
                message.game?.let { _currentGame.value = it }
                _currentHint.value = message.hint
                _emojis.value = emptyList()
                _guesses.value = emptyList()
            }
            "hintUpdated" -> {
                _currentHint.value = message.hint
            }
            "newEmoji" -> {
                message.emoji?.let { emoji ->
                    _emojis.value = _emojis.value + emoji
                }
            }
            "newGuess" -> {
                message.text?.let { text ->
                    val guesserName = getCurrentPlayerName(message.guesserId)
                    _guesses.value = _guesses.value + GuessEntry(
                        text = text,
                        guesserId = message.guesserId ?: "",
                        guesserName = guesserName
                    )
                }
            }
            "wordGuessed" -> {
                _lastGuessedWord.value = message.word
                _lastGuesserName.value = message.guesserName
                message.game?.let { _currentGame.value = it }
            }
            "timeUp" -> {
                _lastGuessedWord.value = message.word
                _lastGuesserName.value = null
            }
            "gameEnded" -> {
                message.game?.let { _currentGame.value = it }
            }
            "error" -> {
                _errorMessage.value = message.message
            }
            "heartbeatAck" -> {
                // Heartbeat acknowledged
            }
        }
    }

    private fun getCurrentPlayerName(connectionId: String?): String? {
        return _currentGame.value?.players?.find { it.connectionId == connectionId }?.name
    }

    fun connect() {
        webSocketClient.sessionId = sessionId
        webSocketClient.connect()
    }

    fun disconnect() {
        webSocketClient.disconnect()
    }

    fun setPlayerName(name: String) {
        _playerName.value = name
        prefs.edit().putString("player_name", name).apply()
    }

    fun createGame(timeLimit: Int = 120, isPublic: Boolean = false) {
        webSocketClient.createGame(sessionId, _playerName.value, timeLimit, isPublic)
    }

    fun joinGame(gameId: String) {
        webSocketClient.joinGame(gameId, sessionId, _playerName.value)
    }

    fun startGame(timeLimit: Int = 120) {
        _currentGame.value?.let { game ->
            webSocketClient.startGame(game.gameId, sessionId, timeLimit)
        }
    }

    fun chooseWord(word: String) {
        _currentGame.value?.let { game ->
            webSocketClient.chooseWord(game.gameId, word)
        }
    }

    fun submitEmoji(emoji: String) {
        _currentGame.value?.let { game ->
            webSocketClient.submitEmoji(game.gameId, emoji)
        }
    }

    fun submitGuess(guess: String) {
        _currentGame.value?.let { game ->
            webSocketClient.submitGuess(game.gameId, guess)
        }
    }

    fun listPublicGames() {
        webSocketClient.listPublicGames()
    }

    fun restartGame(timeLimit: Int = 120) {
        _currentGame.value?.let { game ->
            webSocketClient.restartGame(game.gameId, sessionId, timeLimit)
        }
    }

    fun leaveGame() {
        webSocketClient.currentGameId = null
        _currentGame.value = null
        _emojis.value = emptyList()
        _guesses.value = emptyList()
        _wordOptions.value = emptyList()
        _secretWord.value = null
        _currentHint.value = null
        _lastGuessedWord.value = null
        _lastGuesserName.value = null
    }

    fun clearError() {
        _errorMessage.value = null
    }

    fun isCurrentPlayerDescriber(): Boolean {
        val game = _currentGame.value ?: return false
        val describerIndex = game.currentDescriberIndex ?: return false
        if (describerIndex >= game.players.size) return false
        val describer = game.players[describerIndex]
        return describer.sessionId == sessionId
    }

    fun isGameOwner(): Boolean {
        val game = _currentGame.value ?: return false
        return game.ownerSessionId == sessionId
    }

    fun getCurrentDescriber(): Player? {
        val game = _currentGame.value ?: return null
        val index = game.currentDescriberIndex ?: return null
        return game.players.getOrNull(index)
    }

    override fun onCleared() {
        super.onCleared()
        disconnect()
    }
}
