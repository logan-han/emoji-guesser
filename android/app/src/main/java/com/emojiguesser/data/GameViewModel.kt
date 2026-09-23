package com.emojiguesser.data

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.emojiguesser.EmojiGuesserApp
import com.emojiguesser.audio.SoundEvent
import com.emojiguesser.network.ConnectionState
import com.emojiguesser.network.GameClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID

class GameViewModel internal constructor(
    application: Application,
    private val client: GameClient
) : AndroidViewModel(application) {
    constructor(application: Application) : this(application, GameClient())

    private val prefs = application.getSharedPreferences("emoji_guesser", Context.MODE_PRIVATE)
    private val app get() = getApplication<EmojiGuesserApp>()
    private val seenEventIds = ArrayDeque<String>()
    private val seenEventIdSet = mutableSetOf<String>()

    val sessionId: String = prefs.getString("session_id", null) ?: run {
        val newId = UUID.randomUUID().toString()
        prefs.edit().putString("session_id", newId).apply()
        newId
    }

    private val _playerName = MutableStateFlow(prefs.getString("player_name", "") ?: "")
    val playerName: StateFlow<String> = _playerName.asStateFlow()

    val connectionState: StateFlow<ConnectionState> = client.connectionState

    private val _currentGame = MutableStateFlow<Game?>(null)
    val currentGame: StateFlow<Game?> = _currentGame.asStateFlow()

    private val _publicGames = MutableStateFlow<List<Game>>(emptyList())
    val publicGames: StateFlow<List<Game>> = _publicGames.asStateFlow()

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

    val soundsEnabled: StateFlow<Boolean> =
        app.settings.soundsEnabled.stateIn(viewModelScope, SharingStarted.Eagerly, true)
    val hapticsEnabled: StateFlow<Boolean> =
        app.settings.hapticsEnabled.stateIn(viewModelScope, SharingStarted.Eagerly, true)

    init {
        viewModelScope.launch {
            client.messages.collect { message ->
                handleServerMessage(message)
            }
        }
    }

    /** Returns false for a late update to a game that already ended; a restart is the one way back. */
    private fun updateGame(game: Game, isRestart: Boolean = false): Boolean {
        val current = _currentGame.value
        if (!isRestart && current?.gameState == "ENDED" && game.gameState != "ENDED" && current.gameId == game.gameId) {
            return false
        }
        _currentGame.value = game
        return true
    }

    private fun resetTurn() {
        _emojis.value = emptyList()
        _guesses.value = emptyList()
        _wordOptions.value = emptyList()
        _secretWord.value = null
        _currentHint.value = null
        _lastGuessedWord.value = null
        _lastGuesserName.value = null
    }

    private fun handleServerMessage(message: ServerMessage) {
        message.eventId?.let { eventId ->
            if (!seenEventIdSet.add(eventId)) return
            seenEventIds.addLast(eventId)
            if (seenEventIds.size > 200) {
                seenEventIdSet.remove(seenEventIds.removeFirst())
            }
        }

        when (message.action) {
            "gameCreated", "playerJoined", "gameStarted", "playerNameUpdated",
            "gameRestarted", "playerLeft", "nextTurn", "playerReconnected",
            "spectatorJoined", "gameUpdated" -> {
                message.game?.let { game ->
                    val previousPlayerCount = _currentGame.value?.players?.size ?: 0
                    if (!updateGame(game, isRestart = message.action == "gameRestarted")) return
                    when (message.action) {
                        "gameStarted", "nextTurn", "gameRestarted" -> {
                            resetTurn()
                            if (message.action == "gameStarted") app.sounds.play(SoundEvent.GameStart)
                        }
                        "playerJoined" -> if (game.players.size > previousPlayerCount) {
                            app.sounds.play(SoundEvent.PlayerJoined)
                        }
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
                message.game?.let { updateGame(it) }
            }
            "turnStarted" -> {
                message.game?.let { updateGame(it) }
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
                    app.sounds.play(SoundEvent.EmojiSelect)
                }
            }
            "emojisCleared" -> {
                _emojis.value = emptyList()
            }
            "newGuess" -> {
                message.text?.let { text ->
                    val guesserName = getCurrentPlayerName(message.guesserId)
                    _guesses.value = _guesses.value + GuessEntry(
                        text = text,
                        guesserId = message.guesserId ?: "",
                        guesserName = guesserName
                    )
                    app.sounds.play(SoundEvent.NewGuess)
                }
            }
            "wordGuessed" -> {
                _lastGuessedWord.value = message.word
                _lastGuesserName.value = message.guesserName
                message.game?.let { updateGame(it) }
                app.sounds.play(SoundEvent.CorrectGuess)
                app.haptics.success()
            }
            "timeUp" -> {
                _lastGuessedWord.value = message.word
                _lastGuesserName.value = null
                app.sounds.play(SoundEvent.TimeUp)
                app.haptics.warn()
            }
            "gameEnded" -> {
                message.game?.let { updateGame(it) }
                app.sounds.play(SoundEvent.GameEnd)
            }
            "error" -> {
                _errorMessage.value = message.message
            }
        }
    }

    private fun getCurrentPlayerName(connectionId: String?): String? {
        return _currentGame.value?.players?.find { it.connectionId == connectionId }?.name
    }

    fun connect() {
        client.sessionId = sessionId
        client.connect()
    }

    fun disconnect() {
        client.disconnect()
    }

    fun setPlayerName(name: String) {
        _playerName.value = name
        prefs.edit().putString("player_name", name).apply()
    }

    fun setSoundsEnabled(enabled: Boolean) {
        viewModelScope.launch { app.settings.setSounds(enabled) }
    }

    fun setHapticsEnabled(enabled: Boolean) {
        viewModelScope.launch { app.settings.setHaptics(enabled) }
    }

    fun createGame(timeLimit: Int = 120, maxRounds: Int = 2, isPublic: Boolean = false) {
        client.createGame(sessionId, _playerName.value, timeLimit, maxRounds, isPublic)
        app.sounds.play(SoundEvent.ButtonClick)
        app.haptics.click()
    }

    fun joinGame(gameId: String) {
        client.joinGame(gameId, sessionId, _playerName.value)
        app.sounds.play(SoundEvent.ButtonClick)
        app.haptics.click()
    }

    fun startGame(timeLimit: Int = 120, maxRounds: Int = 2) {
        _currentGame.value?.let { game ->
            client.startGame(game.gameId, sessionId, timeLimit, maxRounds)
        }
        app.sounds.play(SoundEvent.ButtonClick)
        app.haptics.click()
    }

    fun chooseWord(word: String) {
        _currentGame.value?.let { game ->
            client.chooseWord(game.gameId, word)
        }
        app.sounds.play(SoundEvent.ButtonClick)
        app.haptics.click()
    }

    fun submitEmoji(emoji: String) {
        _currentGame.value?.let { game ->
            client.submitEmoji(game.gameId, emoji)
        }
        app.haptics.click()
    }

    fun removeEmojiAt(index: Int) {
        val current = _emojis.value
        if (index !in current.indices) return
        _emojis.value = current.toMutableList().also { it.removeAt(index) }
        app.haptics.click()
    }

    fun submitGuess(guess: String) {
        _currentGame.value?.let { game ->
            client.submitGuess(game.gameId, guess)
        }
        app.haptics.click()
    }

    fun listPublicGames() {
        client.listPublicGames()
    }

    fun restartGame(timeLimit: Int = 120) {
        _currentGame.value?.let { game ->
            client.restartGame(game.gameId, sessionId, timeLimit)
        }
        app.sounds.play(SoundEvent.ButtonClick)
        app.haptics.click()
    }

    fun leaveGame() {
        _currentGame.value?.let { client.leaveGame(it.gameId) }
        _currentGame.value = null
        resetTurn()
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
