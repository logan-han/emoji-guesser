package com.emojiguesser.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.emojiguesser.R
import com.emojiguesser.data.Game
import com.emojiguesser.data.GuessEntry
import com.emojiguesser.data.Player
import com.emojiguesser.ui.components.Avatar
import com.emojiguesser.ui.components.EmojiPicker
import com.emojiguesser.ui.components.HintTiles
import com.emojiguesser.ui.components.ScoreStrip
import com.emojiguesser.ui.components.StampButton
import com.emojiguesser.ui.components.StampCard
import com.emojiguesser.ui.components.TimerRing
import com.emojiguesser.ui.theme.Gold
import com.emojiguesser.ui.theme.LocalConfetti
import com.emojiguesser.ui.theme.MonoFamily
import com.emojiguesser.ui.theme.Sage
import com.emojiguesser.ui.theme.Teal
import com.emojiguesser.ui.theme.Tomato
import kotlinx.coroutines.delay
import java.time.Instant

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
    val palette = LocalConfetti.current
    var guessText by remember { mutableStateOf("") }
    var showEmojiPicker by remember { mutableStateOf(true) }
    val remaining = rememberRemainingSeconds(game.turnStartTime, game.timeLimit)
    val roundText = stringResource(R.string.game_round, game.currentRound ?: 1, game.maxRounds ?: game.players.size.coerceAtLeast(1))

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 12.dp, vertical = 10.dp)
    ) {
        StatusRow(
            roundText = roundText,
            isDescriber = isDescriber,
            currentDescriber = currentDescriber,
            remainingSeconds = remaining,
            totalSeconds = game.timeLimit,
            onLeaveGame = onLeaveGame
        )

        Spacer(Modifier.height(8.dp))

        if (wordOptions.isNotEmpty() && isDescriber) {
            WordChoiceCard(words = wordOptions, onChooseWord = onChooseWord)
            Spacer(Modifier.height(8.dp))
        }

        if (isDescriber) {
            secretWord?.let {
                WordCard(word = it)
                Spacer(Modifier.height(8.dp))
            }
            DescriberBody(
                emojis = emojis,
                guesses = guesses,
                players = game.players,
                modifier = Modifier.weight(1f)
            )
            Spacer(Modifier.height(8.dp))
            if (secretWord != null) {
                StampButton(
                    onClick = { showEmojiPicker = !showEmojiPicker },
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(vertical = 8.dp, horizontal = 12.dp)
                ) {
                    Text(if (showEmojiPicker) stringResource(R.string.game_hide_emoji_picker) else stringResource(R.string.game_send_emoji))
                }
                if (showEmojiPicker) {
                    Spacer(Modifier.height(8.dp))
                    EmojiPicker(onEmojiSelected = onSubmitEmoji)
                }
            }
        } else {
            GuesserBody(
                emojis = emojis,
                guesses = guesses,
                players = game.players,
                currentHint = currentHint,
                modifier = Modifier.weight(1f)
            )
            Spacer(Modifier.height(8.dp))
            if (game.turnState == "DESCRIBING") {
                GuessInput(
                    value = guessText,
                    onValueChange = { guessText = it.take(50) },
                    onSubmit = {
                        if (guessText.isNotBlank()) {
                            onSubmitGuess(guessText)
                            guessText = ""
                        }
                    }
                )
            }
        }

        lastGuessedWord?.let {
            Spacer(Modifier.height(8.dp))
            RoundResultBanner(word = it, guesserName = lastGuesserName)
        }

        Spacer(Modifier.height(8.dp))
        ScoreStrip(
            players = game.players,
            activeSessionId = currentDescriber?.sessionId,
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@Composable
private fun StatusRow(
    roundText: String,
    isDescriber: Boolean,
    currentDescriber: Player?,
    remainingSeconds: Int,
    totalSeconds: Int,
    onLeaveGame: () -> Unit
) {
    val palette = LocalConfetti.current
    StampCard(modifier = Modifier.fillMaxWidth(), contentPadding = 10.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(roundText, style = MaterialTheme.typography.labelMedium, color = palette.inkSoft)
                Spacer(Modifier.height(4.dp))
                if (isDescriber) {
                    RolePill(text = stringResource(R.string.game_you_describe), color = Tomato)
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        currentDescriber?.let { Avatar(it.name, size = 22.dp) }
                        Text(
                            stringResource(R.string.game_describer_label, currentDescriber?.name ?: stringResource(R.string.game_player_fallback)),
                            style = MaterialTheme.typography.bodyMedium,
                            color = palette.ink,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
            TimerRing(remainingSeconds = remainingSeconds, totalSeconds = totalSeconds)
            IconButton(onClick = onLeaveGame, modifier = Modifier.size(40.dp)) {
                Icon(Icons.Default.Close, contentDescription = stringResource(R.string.action_close), tint = palette.ink)
            }
        }
    }
}

@Composable
private fun RolePill(text: String, color: androidx.compose.ui.graphics.Color) {
    val palette = LocalConfetti.current
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(color)
            .padding(horizontal = 8.dp, vertical = 4.dp)
    ) {
        Text(text, style = MaterialTheme.typography.labelMedium, color = palette.paper)
    }
}

@Composable
private fun WordChoiceCard(words: List<String>, onChooseWord: (String) -> Unit) {
    val palette = LocalConfetti.current
    StampCard(modifier = Modifier.fillMaxWidth(), fill = Gold, contentPadding = 14.dp) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.game_choose_word), style = MaterialTheme.typography.titleLarge, color = palette.ink)
            Spacer(Modifier.height(12.dp))
            words.forEach { word ->
                StampButton(onClick = { onChooseWord(word) }, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Text(word.uppercase())
                }
            }
        }
    }
}

@Composable
private fun WordCard(word: String) {
    val palette = LocalConfetti.current
    StampCard(modifier = Modifier.fillMaxWidth(), fill = Sage, contentPadding = 14.dp) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.game_your_word), style = MaterialTheme.typography.labelMedium, color = palette.paper.copy(alpha = 0.7f))
            Text(word.uppercase(), style = MaterialTheme.typography.displayLarge, color = palette.paper, textAlign = TextAlign.Center)
            Text(stringResource(R.string.game_describe_with_emojis), style = MaterialTheme.typography.bodyMedium, color = palette.paper)
        }
    }
}

@Composable
private fun DescriberBody(
    emojis: List<String>,
    guesses: List<GuessEntry>,
    players: List<Player>,
    modifier: Modifier = Modifier
) {
    val palette = LocalConfetti.current
    StampCard(modifier = modifier.fillMaxWidth(), contentPadding = 12.dp) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.game_your_emojis), style = MaterialTheme.typography.titleLarge, color = palette.ink, modifier = Modifier.weight(1f))
                Text(stringResource(R.string.game_tap_to_remove), style = MaterialTheme.typography.labelMedium, color = palette.inkSoft)
            }
            Spacer(Modifier.height(10.dp))
            EmojiTileRow(emojis = emojis, tileSize = 38)
            Spacer(Modifier.height(12.dp))
            Box(Modifier.fillMaxWidth().height(1.dp).background(palette.hairline))
            Spacer(Modifier.height(10.dp))
            Text(stringResource(R.string.game_live_guesses), style = MaterialTheme.typography.labelMedium, color = palette.inkSoft)
            Spacer(Modifier.height(6.dp))
            GuessesList(guesses = guesses, players = players, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun GuesserBody(
    emojis: List<String>,
    guesses: List<GuessEntry>,
    players: List<Player>,
    currentHint: String?,
    modifier: Modifier = Modifier
) {
    val palette = LocalConfetti.current
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        StampCard(modifier = Modifier.fillMaxWidth(), fill = Teal, contentPadding = 12.dp) {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.game_hint), style = MaterialTheme.typography.labelMedium, color = palette.paper, modifier = Modifier.weight(1f))
                    val revealed = currentHint?.count { it != '_' && !it.isWhitespace() } ?: 0
                    val total = currentHint?.count { !it.isWhitespace() } ?: 0
                    Text(stringResource(R.string.game_hint_progress, revealed, total), style = MaterialTheme.typography.bodyMedium.copy(fontFamily = MonoFamily), color = palette.paper)
                }
                Spacer(Modifier.height(10.dp))
                if (!currentHint.isNullOrBlank()) HintTiles(currentHint) else Text(stringResource(R.string.game_waiting_for_emojis), color = palette.paper)
            }
        }
        StampCard(modifier = Modifier.fillMaxWidth(), contentPadding = 12.dp) {
            Column {
                Text(stringResource(R.string.game_emojis), style = MaterialTheme.typography.titleLarge, color = palette.ink)
                Spacer(Modifier.height(10.dp))
                EmojiTileRow(emojis = emojis, tileSize = 42)
            }
        }
        StampCard(modifier = Modifier.fillMaxWidth().weight(1f), contentPadding = 12.dp) {
            Column(modifier = Modifier.fillMaxSize()) {
                Text(stringResource(R.string.game_guesses), style = MaterialTheme.typography.titleLarge, color = palette.ink)
                Spacer(Modifier.height(6.dp))
                GuessesList(guesses = guesses, players = players, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun EmojiTileRow(emojis: List<String>, tileSize: Int) {
    val palette = LocalConfetti.current
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
        emojis.take(7).forEach { emoji ->
            Box(
                modifier = Modifier
                    .size(tileSize.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(palette.bg)
                    .border(1.dp, palette.hairlineStrong, RoundedCornerShape(10.dp)),
                contentAlignment = Alignment.Center
            ) {
                Text(emoji, fontSize = (tileSize - 14).sp)
            }
        }
        Box(
            modifier = Modifier
                .size(tileSize.dp)
                .clip(RoundedCornerShape(10.dp))
                .border(1.dp, palette.hairlineStrong, RoundedCornerShape(10.dp)),
            contentAlignment = Alignment.Center
        ) {
            Text("+", style = MaterialTheme.typography.titleLarge, color = palette.inkSoft)
        }
    }
}

@Composable
private fun GuessesList(guesses: List<GuessEntry>, players: List<Player>, modifier: Modifier = Modifier) {
    val palette = LocalConfetti.current
    if (guesses.isEmpty()) {
        Box(modifier = modifier.fillMaxWidth().heightIn(min = 70.dp), contentAlignment = Alignment.Center) {
            Text(stringResource(R.string.game_no_guesses), style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft, fontStyle = FontStyle.Italic)
        }
        return
    }

    LazyColumn(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        items(guesses) { guess ->
            val name = guess.guesserName ?: players.find { it.connectionId == guess.guesserId }?.name ?: stringResource(R.string.game_player_fallback)
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Avatar(name, size = 22.dp)
                Spacer(Modifier.width(8.dp))
                Text(name, style = MaterialTheme.typography.bodyMedium, color = palette.ink, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.width(6.dp))
                Text(guess.text, style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft, modifier = Modifier.weight(1f))
                Text("×", style = MaterialTheme.typography.bodyMedium, color = palette.inkFaintCompat())
            }
        }
    }
}

@Composable
private fun GuessInput(value: String, onValueChange: (String) -> Unit, onSubmit: () -> Unit) {
    val palette = LocalConfetti.current
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.weight(1f),
            placeholder = { Text(stringResource(R.string.game_your_guess)) },
            singleLine = true,
            shape = RoundedCornerShape(10.dp),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
            keyboardActions = KeyboardActions(onSend = { onSubmit() }),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = palette.ink,
                unfocusedBorderColor = palette.hairlineStrong,
                focusedContainerColor = palette.paper,
                unfocusedContainerColor = palette.paper
            )
        )
        StampButton(onClick = onSubmit, enabled = value.isNotBlank(), contentPadding = PaddingValues(14.dp), modifier = Modifier.size(50.dp)) {
            Icon(Icons.AutoMirrored.Filled.Send, contentDescription = null)
        }
    }
}

@Composable
private fun RoundResultBanner(word: String, guesserName: String?) {
    val won = guesserName != null
    val palette = LocalConfetti.current
    StampCard(modifier = Modifier.fillMaxWidth(), fill = if (won) Sage else Gold, contentPadding = 10.dp) {
        Text(
            text = if (won) stringResource(R.string.game_player_guessed, guesserName ?: "", word) else stringResource(R.string.game_time_up, word),
            style = MaterialTheme.typography.titleMedium,
            color = palette.paper,
            textAlign = TextAlign.Center,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@Composable
private fun rememberRemainingSeconds(turnStartTime: String?, totalSeconds: Int): Int {
    var remaining by remember(turnStartTime, totalSeconds) { mutableIntStateOf(totalSeconds) }
    LaunchedEffect(turnStartTime, totalSeconds) {
        while (true) {
            remaining = calculateRemainingSeconds(turnStartTime, totalSeconds)
            delay(1_000)
        }
    }
    return remaining
}

private fun calculateRemainingSeconds(turnStartTime: String?, totalSeconds: Int): Int {
    val start = runCatching { turnStartTime?.let { Instant.parse(it) } }.getOrNull() ?: return totalSeconds
    val elapsed = Instant.now().epochSecond - start.epochSecond
    return (totalSeconds - elapsed.toInt()).coerceIn(0, totalSeconds)
}

private fun com.emojiguesser.ui.theme.ConfettiPalette.inkFaintCompat() = inkSoft.copy(alpha = 0.65f)
