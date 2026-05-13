package com.emojiguesser.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.emojiguesser.data.Game
import com.emojiguesser.network.ConnectionState
import com.emojiguesser.ui.components.BrandMark
import com.emojiguesser.ui.components.ConnectionPill
import com.emojiguesser.ui.components.StampButton
import com.emojiguesser.ui.components.StampButtonStyle
import com.emojiguesser.ui.components.StampCard
import com.emojiguesser.ui.theme.LocalConfetti
import com.emojiguesser.ui.theme.MonoFamily

@Composable
fun LobbyScreen(
    playerName: String,
    publicGames: List<Game>,
    deepLinkGameId: String?,
    connectionState: ConnectionState,
    onPlayerNameChange: (String) -> Unit,
    onCreateGame: (Int, Boolean) -> Unit,
    onJoinGame: (String) -> Unit,
    onListPublicGames: () -> Unit
) {
    val palette = LocalConfetti.current
    var joinGameId by remember { mutableStateOf(deepLinkGameId ?: "") }
    var showPublicGames by remember { mutableStateOf(false) }
    var isPublicGame by remember { mutableStateOf(false) }
    var timeLimit by remember { mutableIntStateOf(120) }

    LaunchedEffect(Unit) { onListPublicGames() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            BrandMark()
            ConnectionPill(state = connectionState)
        }

        Spacer(Modifier.height(20.dp))

        Text(
            "Describe words using only emojis. Friends race to guess. Win the round.",
            style = MaterialTheme.typography.bodyLarge,
            color = palette.inkSoft
        )

        Spacer(Modifier.height(28.dp))

        StampCard(modifier = Modifier.fillMaxWidth()) {
            Column {
                Text("Your name", style = MaterialTheme.typography.labelMedium, color = palette.inkSoft)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = playerName,
                    onValueChange = { if (it.length <= 20) onPlayerNameChange(it) },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Enter your name") },
                    singleLine = true,
                    shape = RoundedCornerShape(10.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = palette.ink,
                        unfocusedBorderColor = palette.hairlineStrong
                    )
                )
            }
        }

        Spacer(Modifier.height(16.dp))

        StampCard(modifier = Modifier.fillMaxWidth()) {
            Column {
                Text("Create a game", style = MaterialTheme.typography.titleLarge, color = palette.ink)
                Spacer(Modifier.height(12.dp))

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Public game", style = MaterialTheme.typography.bodyLarge, color = palette.ink)
                    Spacer(Modifier.weight(1f))
                    Switch(
                        checked = isPublicGame,
                        onCheckedChange = { isPublicGame = it },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = palette.paper,
                            checkedTrackColor = palette.ink,
                            uncheckedTrackColor = palette.bg2,
                            uncheckedBorderColor = palette.hairlineStrong
                        )
                    )
                }

                Spacer(Modifier.height(6.dp))

                Text("Time limit: ${timeLimit}s", style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft)
                Slider(
                    value = timeLimit.toFloat(),
                    onValueChange = { timeLimit = it.toInt() },
                    valueRange = 30f..300f,
                    steps = 8,
                    colors = SliderDefaults.colors(
                        thumbColor = palette.ink,
                        activeTrackColor = palette.ink,
                        inactiveTrackColor = palette.bg2
                    )
                )

                Spacer(Modifier.height(8.dp))

                StampButton(
                    onClick = { onCreateGame(timeLimit, isPublicGame) },
                    enabled = playerName.isNotBlank(),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Create game")
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        StampCard(modifier = Modifier.fillMaxWidth()) {
            Column {
                Text("Join a game", style = MaterialTheme.typography.titleLarge, color = palette.ink)
                Spacer(Modifier.height(12.dp))

                OutlinedTextField(
                    value = joinGameId,
                    onValueChange = { joinGameId = it.uppercase().take(6) },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("ABCDEF") },
                    singleLine = true,
                    shape = RoundedCornerShape(10.dp),
                    textStyle = LocalTextStyle.current.copy(
                        letterSpacing = 4.sp,
                        fontFamily = MonoFamily
                    ),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Go),
                    keyboardActions = KeyboardActions(onGo = {
                        if (joinGameId.isNotBlank() && playerName.isNotBlank()) onJoinGame(joinGameId)
                    }),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = palette.ink,
                        unfocusedBorderColor = palette.hairlineStrong
                    )
                )

                Spacer(Modifier.height(8.dp))

                StampButton(
                    onClick = { onJoinGame(joinGameId) },
                    enabled = joinGameId.isNotBlank() && playerName.isNotBlank(),
                    style = StampButtonStyle.Secondary,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Join game")
                }

                if (publicGames.isNotEmpty()) {
                    Spacer(Modifier.height(12.dp))
                    TextButton(
                        onClick = { showPublicGames = !showPublicGames },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            if (showPublicGames) "Hide public games" else "Show ${publicGames.size} public games",
                            color = palette.ink
                        )
                    }

                    if (showPublicGames) {
                        Spacer(Modifier.height(4.dp))
                        publicGames.forEach { game ->
                            StampButton(
                                onClick = { onJoinGame(game.gameId) },
                                style = StampButtonStyle.Ghost,
                                enabled = playerName.isNotBlank(),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp)
                            ) {
                                Text("${game.gameId} - ${game.players.size} players")
                            }
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(20.dp))
    }
}
