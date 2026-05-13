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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
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
import com.emojiguesser.ui.components.StampButtonStyle
import com.emojiguesser.ui.components.StampCard
import com.emojiguesser.ui.theme.Gold
import com.emojiguesser.ui.theme.LocalConfetti
import com.emojiguesser.ui.theme.Sage
import com.emojiguesser.ui.theme.Teal

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
            .padding(16.dp)
    ) {
        StampCard(modifier = Modifier.fillMaxWidth(), contentPadding = 12.dp) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "Round ${game.currentRound ?: 1} / ${game.maxRounds ?: game.players.size}",
                        style = MaterialTheme.typography.titleMedium,
                        color = palette.ink,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        "Describer: ${currentDescriber?.name ?: "Unknown"}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = palette.inkSoft
                    )
                }
                IconButton(onClick = onLeaveGame) {
                    Icon(Icons.Default.Close, contentDescription = "Leave", tint = palette.ink)
                }
            }
        }

        Spacer(Modifier.height(12.dp))

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
            Spacer(Modifier.height(12.dp))
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
            Spacer(Modifier.height(12.dp))
        }

        if (!isDescriber && currentHint != null) {
            StampCard(modifier = Modifier.fillMaxWidth(), fill = Teal) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Text("Hint", style = MaterialTheme.typography.labelMedium, color = palette.paper)
                    Spacer(Modifier.height(8.dp))
                    HintTiles(currentHint)
                }
            }
            Spacer(Modifier.height(12.dp))
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
            Spacer(Modifier.height(12.dp))
        }

        StampCard(modifier = Modifier
            .fillMaxWidth()
            .weight(1f)) {
            Column(modifier = Modifier.fillMaxWidth()) {
                Text("Emojis", style = MaterialTheme.typography.labelMedium, color = palette.inkSoft)
                Spacer(Modifier.height(6.dp))
                EmojiStrip(
                    emojis = emojis,
                    listState = emojiListState,
                    emptyHint = if (isDescriber) "Tap emojis below to describe your word" else "Waiting for emojis…",
                    modifier = Modifier.height(72.dp)
                )

                if (guesses.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(1.dp)
                            .background(palette.hairline)
                    )
                    Spacer(Modifier.height(8.dp))
                    Text("Guesses", style = MaterialTheme.typography.labelMedium, color = palette.inkSoft)
                    Spacer(Modifier.height(4.dp))
                    LazyColumn(modifier = Modifier.weight(1f)) {
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

        Spacer(Modifier.height(12.dp))

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

        Spacer(Modifier.height(12.dp))

        Scoreboard(
            players = game.players,
            currentDescriberSessionId = currentDescriber?.sessionId,
            modifier = Modifier.fillMaxWidth()
        )
    }
}
