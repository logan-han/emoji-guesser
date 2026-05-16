package com.emojiguesser.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.emojiguesser.data.Game
import com.emojiguesser.data.GuessEntry
import com.emojiguesser.data.Player
import com.emojiguesser.ui.components.EmojiPicker
import com.emojiguesser.ui.components.EmojiStrip
import com.emojiguesser.ui.components.HintTiles
import com.emojiguesser.ui.components.Scoreboard
import com.emojiguesser.ui.components.StampButton
import com.emojiguesser.ui.components.StampCard
import com.emojiguesser.ui.theme.Gold
import com.emojiguesser.ui.theme.LocalConfetti
import com.emojiguesser.ui.theme.Sage

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
    var showEmojiPicker by remember { mutableStateOf(false) }
    val emojiListState = rememberLazyListState()

    LaunchedEffect(emojis.size) {
        if (emojis.isNotEmpty()) {
            emojiListState.animateScrollToItem(emojis.size - 1)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 12.dp, vertical = 10.dp)
    ) {
        StampCard(modifier = Modifier.fillMaxWidth(), contentPadding = 10.dp) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(palette.bg2)
                                .padding(horizontal = 8.dp, vertical = 3.dp)
                        ) {
                            Text(
                                "Round ${game.currentRound ?: 1} / ${game.maxRounds ?: game.players.size}",
                                style = MaterialTheme.typography.labelMedium,
                                color = palette.ink,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                        RoundProgress(
                            currentRound = game.currentRound ?: 1,
                            maxRounds = game.maxRounds ?: game.players.size
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(
                        if (isDescriber) "You're describing" else "${currentDescriber?.name ?: "Someone"} is describing",
                        style = MaterialTheme.typography.bodyMedium,
                        color = palette.ink,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        "Time ${formatTime(game.timeLimit)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = palette.inkSoft
                    )
                }
                IconButton(onClick = onLeaveGame) {
                    Icon(Icons.Default.Close, contentDescription = "Leave", tint = palette.ink)
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        if (wordOptions.isNotEmpty() && isDescriber) {
            StampCard(modifier = Modifier.fillMaxWidth(), fill = Gold) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Text("Choose a word to describe", style = MaterialTheme.typography.titleLarge, color = palette.ink)
                    Spacer(Modifier.height(12.dp))
                    wordOptions.forEach { word ->
                        StampButton(
                            onClick = { onChooseWord(word) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                        ) {
                            Text(word.uppercase())
                        }
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }

        if (secretWord != null && isDescriber) {
            StampCard(modifier = Modifier.fillMaxWidth(), fill = Sage) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Text("Your word", style = MaterialTheme.typography.labelMedium, color = palette.paper)
                    Text(
                        secretWord.uppercase(),
                        style = MaterialTheme.typography.displaySmall,
                        color = palette.paper,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text("Describe using only emojis", style = MaterialTheme.typography.bodyMedium, color = palette.paper)
                }
            }
            Spacer(Modifier.height(8.dp))
        }

        if (lastGuessedWord != null) {
            val won = lastGuesserName != null
            StampCard(modifier = Modifier.fillMaxWidth(), fill = if (won) Sage else Gold) {
                Text(
                    text = if (won) "🎉 $lastGuesserName guessed \"$lastGuessedWord\"" else "⏰ Time's up. The word was \"$lastGuessedWord\"",
                    style = MaterialTheme.typography.titleMedium,
                    color = palette.paper,
                    textAlign = TextAlign.Center,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            Spacer(Modifier.height(8.dp))
        }

        StampCard(modifier = Modifier
            .fillMaxWidth()
            .weight(1f), contentPadding = 0.dp) {
            Column(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        if (isDescriber) "You are describing" else "${currentDescriber?.name ?: "Player"} is describing",
                        style = MaterialTheme.typography.titleMedium,
                        color = palette.ink,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        "${emojis.size} emoji played",
                        style = MaterialTheme.typography.labelSmall,
                        color = palette.inkSoft
                    )
                }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(1.dp)
                        .background(palette.hairline)
                )
                EmojiStrip(
                    emojis = emojis,
                    listState = emojiListState,
                    emptyHint = if (isDescriber) "Tap emojis below to describe your word" else "Waiting for emojis...",
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(132.dp)
                        .padding(horizontal = 8.dp)
                )

                if (currentHint != null || !isDescriber) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(1.dp)
                            .background(palette.hairline)
                    )
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        if (!currentHint.isNullOrBlank()) {
                            HintTiles(currentHint)
                        } else {
                            Text(
                                "Hint pending",
                                style = MaterialTheme.typography.bodyMedium,
                                color = palette.inkSoft
                            )
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        if (isDescriber && secretWord != null) {
            StampButton(
                onClick = { showEmojiPicker = !showEmojiPicker },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (showEmojiPicker) "Hide emoji picker" else "Send emoji 😀")
            }
            if (showEmojiPicker) {
                Spacer(Modifier.height(8.dp))
                EmojiPicker(onEmojiSelected = { onSubmitEmoji(it) })
            }
        } else if (!isDescriber && game.turnState == "DESCRIBING") {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = guessText,
                    onValueChange = { guessText = it.take(50) },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Your guess…") },
                    singleLine = true,
                    shape = RoundedCornerShape(10.dp),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                    keyboardActions = KeyboardActions(onSend = {
                        if (guessText.isNotBlank()) {
                            onSubmitGuess(guessText)
                            guessText = ""
                        }
                    }),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = palette.ink,
                        unfocusedBorderColor = palette.hairlineStrong,
                        focusedContainerColor = palette.paper,
                        unfocusedContainerColor = palette.paper
                    )
                )
                StampButton(
                    onClick = {
                        if (guessText.isNotBlank()) {
                            onSubmitGuess(guessText)
                            guessText = ""
                        }
                    },
                    enabled = guessText.isNotBlank(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp)
                ) {
                    Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send")
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        Scoreboard(
            players = game.players,
            currentDescriberSessionId = currentDescriber?.sessionId,
            modifier = Modifier.fillMaxWidth()
        )

        if (guesses.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            StampCard(modifier = Modifier.fillMaxWidth(), contentPadding = 10.dp) {
                Column(modifier = Modifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "Guesses",
                            style = MaterialTheme.typography.titleSmall,
                            color = palette.ink,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.weight(1f)
                        )
                        Text("Live", style = MaterialTheme.typography.labelSmall, color = palette.inkSoft)
                    }
                    Spacer(Modifier.height(6.dp))
                    LazyColumn(modifier = Modifier.height(88.dp)) {
                        items(guesses) { guess ->
                            Text(
                                "${guess.guesserName ?: "Player"}: ${guess.text}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = palette.inkSoft,
                                modifier = Modifier.padding(vertical = 2.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun formatTime(seconds: Int): String {
    val minutes = seconds / 60
    val remainder = seconds % 60
    return "%d:%02d".format(minutes, remainder)
}

@Composable
private fun RoundProgress(currentRound: Int, maxRounds: Int) {
    val palette = LocalConfetti.current
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        repeat(maxRounds.coerceAtLeast(1)) { index ->
            val round = index + 1
            Box(
                modifier = Modifier
                    .size(if (round == currentRound) 9.dp else 7.dp)
                    .clip(CircleShape)
                    .background(if (round <= currentRound) palette.ink else palette.bg2)
            )
        }
    }
}
