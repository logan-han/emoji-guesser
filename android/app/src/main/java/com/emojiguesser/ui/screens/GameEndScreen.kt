package com.emojiguesser.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.emojiguesser.data.Game
import com.emojiguesser.ui.components.StampButton
import com.emojiguesser.ui.components.StampButtonStyle
import com.emojiguesser.ui.components.StampCard
import com.emojiguesser.ui.theme.Gold
import com.emojiguesser.ui.theme.LocalConfetti
import com.emojiguesser.ui.theme.Plum
import com.emojiguesser.ui.theme.Sage
import com.emojiguesser.ui.theme.Teal
import com.emojiguesser.ui.theme.Tomato
import nl.dionsegijn.konfetti.compose.KonfettiView
import nl.dionsegijn.konfetti.core.Party
import nl.dionsegijn.konfetti.core.Position
import nl.dionsegijn.konfetti.core.emitter.Emitter
import java.util.concurrent.TimeUnit

@Composable
fun GameEndScreen(
    game: Game,
    isOwner: Boolean,
    onRestartGame: (Int) -> Unit,
    onLeaveGame: () -> Unit
) {
    val palette = LocalConfetti.current
    val sortedPlayers = game.players.sortedByDescending { it.score }
    val winner = sortedPlayers.firstOrNull()

    var celebrate by remember { mutableStateOf(true) }
    LaunchedEffect(Unit) { celebrate = true }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                "Game over",
                style = MaterialTheme.typography.displayMedium,
                color = palette.ink
            )

            Spacer(Modifier.height(24.dp))

            winner?.let {
                StampCard(modifier = Modifier.fillMaxWidth(), fill = Gold, rotationDeg = -2f) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("👑", fontSize = 56.sp)
                        Text(
                            it.name,
                            style = MaterialTheme.typography.displaySmall,
                            color = palette.ink,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            "${it.score} points",
                            style = MaterialTheme.typography.titleLarge,
                            color = palette.ink
                        )
                    }
                }
            }

            Spacer(Modifier.height(16.dp))

            StampCard(modifier = Modifier
                .fillMaxWidth()
                .weight(1f)) {
                LazyColumn {
                    items(sortedPlayers.withIndex().toList()) { (index, player) ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                "${index + 1}.",
                                style = MaterialTheme.typography.titleLarge,
                                color = when (index) {
                                    0 -> Gold
                                    1 -> palette.inkSoft
                                    2 -> Tomato
                                    else -> palette.inkSoft
                                },
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.width(36.dp)
                            )
                            Text(
                                player.name,
                                style = MaterialTheme.typography.bodyLarge,
                                modifier = Modifier.weight(1f),
                                color = palette.ink
                            )
                            Text(
                                "${player.score}",
                                style = MaterialTheme.typography.titleLarge,
                                color = palette.ink,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(16.dp))

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

                if (isOwner) {
                    StampButton(
                        onClick = { onRestartGame(game.timeLimit) },
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Play again")
                    }
                }
            }
        }

        if (celebrate) {
            KonfettiView(
                modifier = Modifier.fillMaxSize(),
                parties = listOf(
                    Party(
                        speed = 0f,
                        maxSpeed = 30f,
                        damping = 0.9f,
                        spread = 360,
                        colors = listOf(
                            Tomato.toArgb(),
                            Gold.toArgb(),
                            Teal.toArgb(),
                            Plum.toArgb(),
                            Sage.toArgb()
                        ),
                        emitter = Emitter(duration = 3, TimeUnit.SECONDS).perSecond(80),
                        position = Position.Relative(0.5, 0.2)
                    )
                )
            )
        }
    }
}

