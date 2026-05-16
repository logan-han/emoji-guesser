package com.emojiguesser.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.emojiguesser.data.Game
import com.emojiguesser.data.Player
import com.emojiguesser.ui.components.StampButton
import com.emojiguesser.ui.components.StampButtonStyle
import com.emojiguesser.ui.components.StampCard
import com.emojiguesser.ui.theme.LocalConfetti
import com.emojiguesser.ui.theme.MonoFamily
import com.emojiguesser.ui.theme.Sage

@Composable
fun WaitingRoomScreen(
    game: Game,
    isOwner: Boolean,
    onStartGame: (Int, Int) -> Unit,
    onLeaveGame: () -> Unit
) {
    val palette = LocalConfetti.current
    val clipboardManager = LocalClipboardManager.current
    var timeLimit by remember { mutableIntStateOf(game.timeLimit) }
    var maxRounds by remember { mutableIntStateOf(game.maxRounds ?: 2) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        StampCard(modifier = Modifier.fillMaxWidth(), contentPadding = 12.dp) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "Game code",
                        style = MaterialTheme.typography.labelSmall,
                        color = palette.inkSoft
                    )
                    Text(
                        game.gameId,
                        fontSize = 32.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = palette.ink,
                        letterSpacing = 4.sp,
                        style = MaterialTheme.typography.displaySmall.copy(fontFamily = MonoFamily)
                    )
                }
                StampButton(
                    onClick = { clipboardManager.setText(AnnotatedString(game.gameId)) },
                    style = StampButtonStyle.Secondary,
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 8.dp)
                ) {
                    Text("Copy")
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        StampCard(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f, fill = true),
            contentPadding = 12.dp
        ) {
            Column(modifier = Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Players",
                        style = MaterialTheme.typography.titleMedium,
                        color = palette.ink,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.weight(1f)
                    )
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(Sage)
                            .padding(horizontal = 8.dp, vertical = 2.dp)
                    ) {
                        Text(
                            "${game.players.size} joined",
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.paper,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(game.players) { player ->
                        PlayerRow(
                            player = player,
                            isOwner = player.connectionId == game.ownerId
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        if (isOwner) {
            StampCard(modifier = Modifier.fillMaxWidth(), contentPadding = 12.dp) {
                Column {
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
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "Total rounds",
                            style = MaterialTheme.typography.bodySmall,
                            color = palette.inkSoft,
                            modifier = Modifier.weight(1f)
                        )
                        Text(
                            "$maxRounds",
                            style = MaterialTheme.typography.bodyMedium,
                            color = palette.ink,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        (2..5).forEach { rounds ->
                            RoundOptionChip(
                                label = "$rounds",
                                selected = maxRounds == rounds,
                                onClick = { maxRounds = rounds },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            StampButton(
                onClick = onLeaveGame,
                style = StampButtonStyle.Secondary,
                modifier = Modifier.weight(1f)
            ) {
                Text("Leave")
            }
            if (isOwner) {
                StampButton(
                    onClick = { onStartGame(timeLimit, maxRounds) },
                    enabled = game.players.size >= 2,
                    modifier = Modifier.weight(1f)
                ) {
                    Text(if (game.players.size >= 2) "Start" else "Need 2+")
                }
            } else {
                StampButton(
                    onClick = {},
                    enabled = false,
                    style = StampButtonStyle.Secondary,
                    modifier = Modifier.weight(1f)
                ) {
                    Text(
                        "Waiting for host",
                        maxLines = 1
                    )
                }
            }
        }
    }
}

@Composable
private fun RoundOptionChip(
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
            .padding(vertical = 9.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            label,
            color = fg,
            fontWeight = FontWeight.SemiBold,
            style = MaterialTheme.typography.bodyMedium
        )
    }
}

@Composable
private fun PlayerRow(player: Player, isOwner: Boolean) {
    val palette = LocalConfetti.current
    val initial = player.name.firstOrNull()?.uppercase() ?: "?"
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(palette.bg2)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(30.dp)
                .clip(CircleShape)
                .background(palette.ink),
            contentAlignment = Alignment.Center
        ) {
            Text(
                initial,
                color = palette.paper,
                fontWeight = FontWeight.SemiBold,
                style = MaterialTheme.typography.bodyMedium
            )
        }
        Spacer(Modifier.width(10.dp))
        Text(
            player.name,
            style = MaterialTheme.typography.bodyLarge,
            color = palette.ink,
            fontWeight = if (isOwner) FontWeight.SemiBold else FontWeight.Normal,
            modifier = Modifier.weight(1f)
        )
        if (isOwner) {
            Text("👑", fontSize = 16.sp)
        }
    }
}
