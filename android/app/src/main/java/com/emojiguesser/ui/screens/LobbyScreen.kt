package com.emojiguesser.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
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
import com.emojiguesser.network.ConnectionState
import com.emojiguesser.ui.components.BrandMark
import com.emojiguesser.ui.components.ConnectionPill
import com.emojiguesser.ui.components.StampButton
import com.emojiguesser.ui.components.StampButtonStyle
import com.emojiguesser.ui.components.StampCard
import com.emojiguesser.ui.theme.LocalConfetti
import com.emojiguesser.ui.theme.MonoFamily
import com.emojiguesser.ui.theme.Sage
import com.emojiguesser.ui.theme.Tomato
import kotlinx.coroutines.delay

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
    var isPublicGame by remember { mutableStateOf(true) }
    var timeLimit by remember { mutableIntStateOf(120) }

    LaunchedEffect(Unit) {
        while (true) {
            onListPublicGames()
            delay(5_000)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 10.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            BrandMark()
            ConnectionPill(state = connectionState)
        }

        Spacer(Modifier.height(12.dp))

        StampCard(modifier = Modifier.fillMaxWidth(), contentPadding = 12.dp) {
            OutlinedTextField(
                value = playerName,
                onValueChange = { if (it.length <= 20) onPlayerNameChange(it) },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Your name") },
                singleLine = true,
                shape = RoundedCornerShape(10.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = palette.ink,
                    unfocusedBorderColor = palette.hairlineStrong
                )
            )
        }

        Spacer(Modifier.height(10.dp))

        StampCard(modifier = Modifier.fillMaxWidth(), contentPadding = 12.dp) {
            Column {
                Text("Create game", style = MaterialTheme.typography.titleMedium, color = palette.ink, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    VisibilityChip(
                        label = "🌍 Public",
                        selected = isPublicGame,
                        onClick = { isPublicGame = true },
                        modifier = Modifier.weight(1f)
                    )
                    VisibilityChip(
                        label = "🔒 Private",
                        selected = !isPublicGame,
                        onClick = { isPublicGame = false },
                        modifier = Modifier.weight(1f)
                    )
                }

                Spacer(Modifier.height(8.dp))

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Round timer",
                        style = MaterialTheme.typography.bodySmall,
                        color = palette.inkSoft,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        "${timeLimit}s",
                        style = MaterialTheme.typography.bodyMedium,
                        color = palette.ink,
                        fontWeight = FontWeight.SemiBold
                    )
                }
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

                StampButton(
                    onClick = { onCreateGame(timeLimit, isPublicGame) },
                    enabled = playerName.isNotBlank(),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Create ${if (isPublicGame) "public" else "private"} game")
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        StampCard(modifier = Modifier.fillMaxWidth(), contentPadding = 12.dp) {
            Column {
                Text("Join by code", style = MaterialTheme.typography.titleMedium, color = palette.ink, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(8.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedTextField(
                        value = joinGameId,
                        onValueChange = { joinGameId = it.uppercase().take(6) },
                        modifier = Modifier.weight(1f),
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
                    StampButton(
                        onClick = { onJoinGame(joinGameId) },
                        enabled = joinGameId.isNotBlank() && playerName.isNotBlank(),
                        style = StampButtonStyle.Secondary,
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp)
                    ) {
                        Text("Join")
                    }
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        StampCard(modifier = Modifier.fillMaxWidth(), contentPadding = 12.dp) {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Public rooms",
                        style = MaterialTheme.typography.titleMedium,
                        color = palette.ink,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        "${publicGames.size}",
                        style = MaterialTheme.typography.labelMedium,
                        color = palette.inkSoft
                    )
                }

                Spacer(Modifier.height(8.dp))

                if (publicGames.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 80.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("🎯", fontSize = 28.sp)
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "No public rooms yet",
                                style = MaterialTheme.typography.bodyMedium,
                                color = palette.inkSoft,
                                textAlign = TextAlign.Center
                            )
                            Text(
                                "Create one to get started",
                                style = MaterialTheme.typography.bodySmall,
                                color = palette.inkSoft,
                                textAlign = TextAlign.Center
                            )
                        }
                    }
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        publicGames.forEach { game ->
                            PublicGameRow(
                                game = game,
                                enabled = playerName.isNotBlank(),
                                onClick = { onJoinGame(game.gameId) }
                            )
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(12.dp))
    }
}

@Composable
private fun VisibilityChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalConfetti.current
    val bg = if (selected) palette.ink else palette.paper
    val fg = if (selected) palette.paper else palette.ink
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(bg)
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(label, color = fg, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun PublicGameRow(
    game: Game,
    enabled: Boolean,
    onClick: () -> Unit
) {
    val palette = LocalConfetti.current
    val isPlaying = game.gameState == "IN_PROGRESS"
    val ownerName = game.players.firstOrNull { it.connectionId == game.ownerId }?.name
        ?: game.players.firstOrNull()?.name
        ?: "—"

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(palette.bg2)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(34.dp)
                .clip(CircleShape)
                .background(palette.paper),
            contentAlignment = Alignment.Center
        ) {
            Text("🎭", fontSize = 18.sp)
        }
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                game.gameId,
                style = MaterialTheme.typography.bodyLarge.copy(fontFamily = MonoFamily, letterSpacing = 2.sp),
                color = palette.ink,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                "Host: $ownerName",
                style = MaterialTheme.typography.bodySmall,
                color = palette.inkSoft,
                maxLines = 1
            )
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(if (isPlaying) Tomato else Sage)
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(
                    if (isPlaying) "Playing" else "Waiting",
                    style = MaterialTheme.typography.labelSmall,
                    color = palette.paper,
                    fontWeight = FontWeight.SemiBold
                )
            }
            Spacer(Modifier.width(2.dp))
            Text("👥", fontSize = 14.sp)
            Text(
                "${game.players.size}",
                style = MaterialTheme.typography.bodyMedium,
                color = palette.ink,
                fontWeight = FontWeight.SemiBold
            )
        }
    }
}
