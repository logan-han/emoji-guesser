package com.emojiguesser.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.emojiguesser.data.Game
import com.emojiguesser.data.GuessEntry
import com.emojiguesser.data.Player
import com.emojiguesser.network.ConnectionState
import com.emojiguesser.ui.components.EmojiPicker
import com.emojiguesser.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
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
    onPlayerNameChange: (String) -> Unit,
    onCreateGame: (Int, Boolean) -> Unit,
    onJoinGame: (String) -> Unit,
    onStartGame: (Int) -> Unit,
    onChooseWord: (String) -> Unit,
    onSubmitEmoji: (String) -> Unit,
    onSubmitGuess: (String) -> Unit,
    onListPublicGames: () -> Unit,
    onRestartGame: (Int) -> Unit,
    onLeaveGame: () -> Unit,
    onClearError: () -> Unit
) {
    val gradientBrush = Brush.verticalGradient(
        colors = listOf(Purple, Blue)
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(gradientBrush)
            .systemBarsPadding()
    ) {
        // Error snackbar
        errorMessage?.let { error ->
            Snackbar(
                modifier = Modifier
                    .padding(16.dp)
                    .align(Alignment.TopCenter),
                action = {
                    TextButton(onClick = onClearError) {
                        Text("Dismiss", color = White)
                    }
                },
                containerColor = Error
            ) {
                Text(error)
            }
        }

        when {
            connectionState == ConnectionState.CONNECTING -> {
                LoadingScreen("Connecting...")
            }
            connectionState == ConnectionState.FAILED -> {
                ErrorScreen("Connection failed. Please check your internet connection.")
            }
            currentGame == null -> {
                LobbyScreen(
                    playerName = playerName,
                    publicGames = publicGames,
                    deepLinkGameId = deepLinkGameId,
                    onPlayerNameChange = onPlayerNameChange,
                    onCreateGame = onCreateGame,
                    onJoinGame = onJoinGame,
                    onListPublicGames = onListPublicGames
                )
            }
            currentGame.gameState == "WAITING" -> {
                WaitingRoomScreen(
                    game = currentGame,
                    isOwner = isOwner,
                    onStartGame = onStartGame,
                    onLeaveGame = onLeaveGame
                )
            }
            currentGame.gameState == "ENDED" -> {
                GameEndScreen(
                    game = currentGame,
                    isOwner = isOwner,
                    onRestartGame = onRestartGame,
                    onLeaveGame = onLeaveGame
                )
            }
            else -> {
                GameScreen(
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
                    onSubmitGuess = onSubmitGuess,
                    onLeaveGame = onLeaveGame
                )
            }
        }
    }
}

@Composable
fun LoadingScreen(message: String) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(color = White)
            Spacer(modifier = Modifier.height(16.dp))
            Text(message, color = White, fontSize = 18.sp)
        }
    }
}

@Composable
fun ErrorScreen(message: String) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(32.dp)
        ) {
            Icon(
                Icons.Default.Warning,
                contentDescription = "Error",
                tint = Warning,
                modifier = Modifier.size(64.dp)
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                message,
                color = White,
                fontSize = 18.sp,
                textAlign = TextAlign.Center
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LobbyScreen(
    playerName: String,
    publicGames: List<Game>,
    deepLinkGameId: String?,
    onPlayerNameChange: (String) -> Unit,
    onCreateGame: (Int, Boolean) -> Unit,
    onJoinGame: (String) -> Unit,
    onListPublicGames: () -> Unit
) {
    var joinGameId by remember { mutableStateOf(deepLinkGameId ?: "") }
    var showPublicGames by remember { mutableStateOf(false) }
    var isPublicGame by remember { mutableStateOf(false) }
    var timeLimit by remember { mutableStateOf(120) }

    LaunchedEffect(Unit) {
        onListPublicGames()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Title
        Text(
            "🎯 Emoji Guesser",
            fontSize = 32.sp,
            fontWeight = FontWeight.Bold,
            color = White
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            "Describe words using only emojis!",
            fontSize = 16.sp,
            color = White.copy(alpha = 0.8f)
        )

        Spacer(modifier = Modifier.height(32.dp))

        // Player name input
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = White.copy(alpha = 0.95f))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Your Name", fontWeight = FontWeight.Medium, color = DarkGray)
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = playerName,
                    onValueChange = { if (it.length <= 20) onPlayerNameChange(it) },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Enter your name") },
                    singleLine = true
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Create game section
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = White.copy(alpha = 0.95f))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Create Game", fontWeight = FontWeight.Bold, color = DarkGray)
                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Public Game", color = DarkGray)
                    Spacer(modifier = Modifier.weight(1f))
                    Switch(
                        checked = isPublicGame,
                        onCheckedChange = { isPublicGame = it }
                    )
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Time Limit: ${timeLimit}s", color = DarkGray)
                    Spacer(modifier = Modifier.weight(1f))
                }
                Slider(
                    value = timeLimit.toFloat(),
                    onValueChange = { timeLimit = it.toInt() },
                    valueRange = 30f..300f,
                    steps = 8
                )

                Spacer(modifier = Modifier.height(8.dp))

                Button(
                    onClick = { onCreateGame(timeLimit, isPublicGame) },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = playerName.isNotBlank(),
                    colors = ButtonDefaults.buttonColors(containerColor = Purple)
                ) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Create Game")
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Join game section
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = White.copy(alpha = 0.95f))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Join Game", fontWeight = FontWeight.Bold, color = DarkGray)
                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = joinGameId,
                    onValueChange = { joinGameId = it.uppercase().take(6) },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Enter Game Code") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Go),
                    keyboardActions = KeyboardActions(
                        onGo = {
                            if (joinGameId.isNotBlank() && playerName.isNotBlank()) {
                                onJoinGame(joinGameId)
                            }
                        }
                    )
                )

                Spacer(modifier = Modifier.height(8.dp))

                Button(
                    onClick = { onJoinGame(joinGameId) },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = joinGameId.isNotBlank() && playerName.isNotBlank(),
                    colors = ButtonDefaults.buttonColors(containerColor = Blue)
                ) {
                    Icon(Icons.Default.PlayArrow, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Join Game")
                }

                if (publicGames.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(12.dp))
                    TextButton(
                        onClick = { showPublicGames = !showPublicGames },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            if (showPublicGames) "Hide Public Games" else "Show ${publicGames.size} Public Games",
                            color = Blue
                        )
                    }

                    if (showPublicGames) {
                        publicGames.forEach { game ->
                            OutlinedButton(
                                onClick = { onJoinGame(game.gameId) },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp),
                                enabled = playerName.isNotBlank()
                            ) {
                                Text("${game.gameId} (${game.players.size} players)")
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun WaitingRoomScreen(
    game: Game,
    isOwner: Boolean,
    onStartGame: (Int) -> Unit,
    onLeaveGame: () -> Unit
) {
    val clipboardManager = LocalClipboardManager.current
    var timeLimit by remember { mutableStateOf(game.timeLimit) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Game code display
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = White.copy(alpha = 0.95f))
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("Game Code", color = DarkGray)
                Text(
                    game.gameId,
                    fontSize = 36.sp,
                    fontWeight = FontWeight.Bold,
                    color = Purple,
                    letterSpacing = 4.sp
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedButton(
                    onClick = {
                        clipboardManager.setText(AnnotatedString(game.gameId))
                    }
                ) {
                    Icon(Icons.Default.Share, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Copy Code")
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Players list
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            colors = CardDefaults.cardColors(containerColor = White.copy(alpha = 0.95f))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    "Players (${game.players.size})",
                    fontWeight = FontWeight.Bold,
                    color = DarkGray
                )
                Spacer(modifier = Modifier.height(12.dp))
                LazyColumn {
                    items(game.players) { player ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Default.Person,
                                contentDescription = null,
                                tint = Purple
                            )
                            Spacer(modifier = Modifier.width(12.dp))
                            Text(
                                player.name,
                                color = DarkGray,
                                fontWeight = if (player.connectionId == game.ownerId) FontWeight.Bold else FontWeight.Normal
                            )
                            if (player.connectionId == game.ownerId) {
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("👑", fontSize = 16.sp)
                            }
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Settings and controls
        if (isOwner) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = White.copy(alpha = 0.95f))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Time Limit: ${timeLimit}s", color = DarkGray)
                    Slider(
                        value = timeLimit.toFloat(),
                        onValueChange = { timeLimit = it.toInt() },
                        valueRange = 30f..300f,
                        steps = 8
                    )
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
        }

        Row(modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(
                onClick = onLeaveGame,
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = White)
            ) {
                Text("Leave")
            }

            if (isOwner && game.players.size >= 2) {
                Spacer(modifier = Modifier.width(12.dp))
                Button(
                    onClick = { onStartGame(timeLimit) },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = Success)
                ) {
                    Icon(Icons.Default.PlayArrow, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Start Game")
                }
            }
        }

        if (isOwner && game.players.size < 2) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                "Need at least 2 players to start",
                color = White.copy(alpha = 0.7f),
                fontSize = 14.sp
            )
        }
    }
}

@Composable
fun GameScreen(
    game: Game,
    emojis: List<String>,
    guesses: List<GuessEntry>,
    wordOptions: List<String>,
    secretWord: String?,
    currentHint: String?,
    lastGuessedWord: String?,
    lastGuesserName: String?,
    isDescriber: Boolean,
    currentDescriber: Player?,
    onChooseWord: (String) -> Unit,
    onSubmitEmoji: (String) -> Unit,
    onSubmitGuess: (String) -> Unit,
    onLeaveGame: () -> Unit
) {
    var guessText by remember { mutableStateOf("") }
    var showEmojiPicker by remember { mutableStateOf(false) }
    val emojiListState = rememberLazyListState()

    // Auto-scroll emoji list
    LaunchedEffect(emojis.size) {
        if (emojis.isNotEmpty()) {
            emojiListState.animateScrollToItem(emojis.size - 1)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        // Header with round info
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = White.copy(alpha = 0.95f))
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        "Round ${game.currentRound ?: 1}/${game.maxRounds ?: game.players.size}",
                        fontWeight = FontWeight.Bold,
                        color = DarkGray
                    )
                    Text(
                        "Describer: ${currentDescriber?.name ?: "Unknown"}",
                        fontSize = 14.sp,
                        color = DarkGray.copy(alpha = 0.7f)
                    )
                }
                IconButton(onClick = onLeaveGame) {
                    Icon(Icons.Default.Close, contentDescription = "Leave", tint = Error)
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Word selection (for describer choosing word)
        if (wordOptions.isNotEmpty() && isDescriber) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Warning.copy(alpha = 0.95f))
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        "Choose a word to describe:",
                        fontWeight = FontWeight.Bold,
                        color = DarkGray
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    wordOptions.forEach { word ->
                        Button(
                            onClick = { onChooseWord(word) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Purple)
                        ) {
                            Text(word.uppercase())
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
        }

        // Secret word display (for describer)
        if (secretWord != null && isDescriber) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Success.copy(alpha = 0.95f))
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("Your word:", color = White)
                    Text(
                        secretWord.uppercase(),
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Bold,
                        color = White
                    )
                    Text(
                        "Describe using only emojis!",
                        fontSize = 12.sp,
                        color = White.copy(alpha = 0.8f)
                    )
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
        }

        // Hint display (for guessers)
        if (!isDescriber && currentHint != null) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Blue.copy(alpha = 0.95f))
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("Hint:", color = White)
                    Text(
                        currentHint,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold,
                        color = White,
                        letterSpacing = 4.sp
                    )
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
        }

        // Last guessed word notification
        if (lastGuessedWord != null) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = if (lastGuesserName != null) Success else Warning
                )
            ) {
                Text(
                    text = if (lastGuesserName != null) {
                        "🎉 $lastGuesserName guessed \"$lastGuessedWord\"!"
                    } else {
                        "⏰ Time's up! The word was \"$lastGuessedWord\""
                    },
                    modifier = Modifier.padding(12.dp),
                    color = White,
                    textAlign = TextAlign.Center,
                    fontWeight = FontWeight.Bold
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
        }

        // Emoji display area
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            colors = CardDefaults.cardColors(containerColor = White.copy(alpha = 0.95f))
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Text("Emojis", fontWeight = FontWeight.Bold, color = DarkGray)
                Spacer(modifier = Modifier.height(8.dp))

                if (emojis.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            if (isDescriber) "Tap emojis below to describe your word"
                            else "Waiting for emojis...",
                            color = DarkGray.copy(alpha = 0.5f)
                        )
                    }
                } else {
                    LazyRow(
                        state = emojiListState,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        items(emojis) { emoji ->
                            Text(
                                emoji,
                                fontSize = 40.sp,
                                modifier = Modifier.padding(4.dp)
                            )
                        }
                    }
                }

                // Guesses section
                if (guesses.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(8.dp))
                    HorizontalDivider()
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Guesses", fontWeight = FontWeight.Bold, color = DarkGray)
                    LazyColumn(
                        modifier = Modifier.weight(1f)
                    ) {
                        items(guesses) { guess ->
                            Text(
                                "${guess.guesserName ?: "Player"}: ${guess.text}",
                                color = DarkGray.copy(alpha = 0.7f),
                                modifier = Modifier.padding(vertical = 2.dp)
                            )
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Input area
        if (isDescriber && secretWord != null) {
            // Emoji picker for describer
            Button(
                onClick = { showEmojiPicker = !showEmojiPicker },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Purple)
            ) {
                Text(if (showEmojiPicker) "Hide Emoji Picker" else "Send Emoji 😀")
            }

            if (showEmojiPicker) {
                Spacer(modifier = Modifier.height(8.dp))
                EmojiPicker(
                    onEmojiSelected = { emoji ->
                        onSubmitEmoji(emoji)
                    }
                )
            }
        } else if (!isDescriber && game.turnState == "DESCRIBING") {
            // Guess input for guessers
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = guessText,
                    onValueChange = { guessText = it.take(50) },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Your guess...") },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        unfocusedContainerColor = White,
                        focusedContainerColor = White
                    ),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(
                        onSend = {
                            if (guessText.isNotBlank()) {
                                onSubmitGuess(guessText)
                                guessText = ""
                            }
                        }
                    )
                )
                Spacer(modifier = Modifier.width(8.dp))
                Button(
                    onClick = {
                        if (guessText.isNotBlank()) {
                            onSubmitGuess(guessText)
                            guessText = ""
                        }
                    },
                    enabled = guessText.isNotBlank(),
                    colors = ButtonDefaults.buttonColors(containerColor = Blue)
                ) {
                    Icon(Icons.Default.Send, contentDescription = "Send")
                }
            }
        }

        // Scoreboard
        Spacer(modifier = Modifier.height(12.dp))
        LazyRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(game.players.sortedByDescending { it.score }) { player ->
                Card(
                    colors = CardDefaults.cardColors(
                        containerColor = if (player.sessionId == currentDescriber?.sessionId)
                            Purple.copy(alpha = 0.9f)
                        else
                            White.copy(alpha = 0.9f)
                    )
                ) {
                    Column(
                        modifier = Modifier.padding(8.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            player.name,
                            fontWeight = FontWeight.Medium,
                            fontSize = 12.sp,
                            color = if (player.sessionId == currentDescriber?.sessionId) White else DarkGray
                        )
                        Text(
                            "${player.score}",
                            fontWeight = FontWeight.Bold,
                            color = if (player.sessionId == currentDescriber?.sessionId) White else Purple
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun GameEndScreen(
    game: Game,
    isOwner: Boolean,
    onRestartGame: (Int) -> Unit,
    onLeaveGame: () -> Unit
) {
    val sortedPlayers = game.players.sortedByDescending { it.score }
    val winner = sortedPlayers.firstOrNull()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            "🎉 Game Over!",
            fontSize = 32.sp,
            fontWeight = FontWeight.Bold,
            color = White
        )

        Spacer(modifier = Modifier.height(24.dp))

        // Winner announcement
        winner?.let {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Warning)
            ) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("👑", fontSize = 48.sp)
                    Text(
                        it.name,
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Bold,
                        color = White
                    )
                    Text(
                        "${it.score} points",
                        fontSize = 20.sp,
                        color = White.copy(alpha = 0.9f)
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Full scoreboard
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            colors = CardDefaults.cardColors(containerColor = White.copy(alpha = 0.95f))
        ) {
            LazyColumn(modifier = Modifier.padding(16.dp)) {
                items(sortedPlayers.withIndex().toList()) { (index, player) ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            "${index + 1}.",
                            fontWeight = FontWeight.Bold,
                            color = when(index) {
                                0 -> Warning
                                1 -> Color.Gray
                                2 -> Color(0xFFCD7F32)
                                else -> DarkGray
                            },
                            modifier = Modifier.width(32.dp)
                        )
                        Text(
                            player.name,
                            modifier = Modifier.weight(1f),
                            color = DarkGray
                        )
                        Text(
                            "${player.score}",
                            fontWeight = FontWeight.Bold,
                            color = Purple
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        Row(modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(
                onClick = onLeaveGame,
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = White)
            ) {
                Text("Leave")
            }

            if (isOwner) {
                Spacer(modifier = Modifier.width(12.dp))
                Button(
                    onClick = { onRestartGame(game.timeLimit) },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = Success)
                ) {
                    Icon(Icons.Default.Refresh, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Play Again")
                }
            }
        }
    }
}
