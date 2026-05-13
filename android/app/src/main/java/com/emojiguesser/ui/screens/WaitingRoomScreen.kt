package com.emojiguesser.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.emojiguesser.data.Game
import com.emojiguesser.ui.components.StampButton
import com.emojiguesser.ui.components.StampButtonStyle
import com.emojiguesser.ui.components.StampCard
import com.emojiguesser.ui.theme.LocalConfetti
import com.emojiguesser.ui.theme.MonoFamily

@Composable
fun WaitingRoomScreen(
    game: Game,
    isOwner: Boolean,
    onStartGame: (Int) -> Unit,
    onLeaveGame: () -> Unit
) {
    val palette = LocalConfetti.current
    val clipboardManager = LocalClipboardManager.current
    var timeLimit by remember { mutableIntStateOf(game.timeLimit) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        StampCard(modifier = Modifier.fillMaxWidth()) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                Text("Game code", style = MaterialTheme.typography.labelMedium, color = palette.inkSoft)
                Spacer(Modifier.height(6.dp))
                Text(
                    game.gameId,
                    fontSize = 40.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = palette.ink,
                    letterSpacing = 6.sp,
                    style = MaterialTheme.typography.displayMedium.copy(fontFamily = MonoFamily)
                )
                Spacer(Modifier.height(10.dp))
                StampButton(
                    onClick = { clipboardManager.setText(AnnotatedString(game.gameId)) },
                    style = StampButtonStyle.Secondary
                ) {
                    Text("Copy code")
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        StampCard(modifier = Modifier
            .fillMaxWidth()
            .weight(1f, fill = true)) {
            Column(modifier = Modifier.fillMaxWidth()) {
                Text("Players (${game.players.size})", style = MaterialTheme.typography.titleLarge, color = palette.ink)
                Spacer(Modifier.height(12.dp))
                LazyColumn {
                    items(game.players) { player ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                player.name,
                                style = MaterialTheme.typography.bodyLarge,
                                color = palette.ink,
                                fontWeight = if (player.connectionId == game.ownerId) FontWeight.SemiBold else FontWeight.Normal
                            )
                            if (player.connectionId == game.ownerId) {
                                Spacer(Modifier.width(8.dp))
                                Text("👑", fontSize = 16.sp)
                            }
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(16.dp))

        if (isOwner) {
            StampCard(modifier = Modifier.fillMaxWidth()) {
                Column {
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
                }
            }
            Spacer(Modifier.height(16.dp))
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            StampButton(
                onClick = onLeaveGame,
                style = StampButtonStyle.Secondary,
                modifier = Modifier.weight(1f)
            ) {
                Text("Leave")
            }
            if (isOwner && game.players.size >= 2) {
                StampButton(
                    onClick = { onStartGame(timeLimit) },
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Start game")
                }
            }
        }

        if (isOwner && game.players.size < 2) {
            Spacer(Modifier.height(8.dp))
            Text(
                "Need at least 2 players to start",
                style = MaterialTheme.typography.bodyMedium,
                color = palette.inkSoft
            )
        }
    }
}

