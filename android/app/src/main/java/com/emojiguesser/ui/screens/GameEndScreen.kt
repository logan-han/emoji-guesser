package com.emojiguesser.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.emojiguesser.R
import com.emojiguesser.data.Game
import com.emojiguesser.data.Player
import com.emojiguesser.ui.components.Avatar
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
    var celebrate by remember { mutableStateOf(true) }
    LaunchedEffect(Unit) { celebrate = true }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 18.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(stringResource(R.string.end_final_results), style = MaterialTheme.typography.labelMedium, color = palette.inkSoft)
            Text(
                buildAnnotatedString {
                    append(stringResource(R.string.end_game_word))
                    append(" ")
                    withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(stringResource(R.string.end_over_word)) }
                },
                style = MaterialTheme.typography.displayMedium,
                color = palette.ink
            )

            Spacer(Modifier.height(12.dp))
            Podium(players = sortedPlayers.take(3))
            Spacer(Modifier.height(10.dp))

            StampCard(modifier = Modifier.fillMaxWidth().weight(1f), contentPadding = 4.dp) {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    itemsIndexed(sortedPlayers) { index, player ->
                        ScoreRow(index = index, player = player)
                    }
                }
            }

            Spacer(Modifier.height(10.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StampButton(onClick = onLeaveGame, style = StampButtonStyle.Secondary, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.waiting_leave))
                }
                if (isOwner) {
                    StampButton(onClick = { onRestartGame(game.timeLimit) }, modifier = Modifier.weight(1f)) {
                        Text(stringResource(R.string.end_play_again_arrow))
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
                        maxSpeed = 14f,
                        damping = 0.92f,
                        spread = 80,
                        colors = listOf(Tomato.toArgb(), Gold.toArgb(), Teal.toArgb(), Plum.toArgb(), Sage.toArgb()),
                        emitter = Emitter(duration = 2200, TimeUnit.MILLISECONDS).perSecond(22),
                        position = Position.Relative(0.15, 0.05)
                    ),
                    Party(
                        speed = 0f,
                        maxSpeed = 14f,
                        damping = 0.92f,
                        spread = 80,
                        colors = listOf(Tomato.toArgb(), Gold.toArgb(), Teal.toArgb(), Plum.toArgb(), Sage.toArgb()),
                        emitter = Emitter(duration = 2200, TimeUnit.MILLISECONDS).perSecond(22),
                        position = Position.Relative(0.85, 0.05)
                    )
                )
            )
        }
    }
}

@Composable
private fun Podium(players: List<Player>) {
    Row(
        modifier = Modifier.fillMaxWidth().height(190.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Bottom
    ) {
        PodiumBlock(player = players.getOrNull(1), rank = 2, color = Teal, height = 120, modifier = Modifier.weight(1f))
        PodiumBlock(player = players.getOrNull(0), rank = 1, color = Gold, height = 150, crowned = true, modifier = Modifier.weight(1f))
        PodiumBlock(player = players.getOrNull(2), rank = 3, color = Tomato, height = 95, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun PodiumBlock(
    player: Player?,
    rank: Int,
    color: Color,
    height: Int,
    modifier: Modifier = Modifier,
    crowned: Boolean = false
) {
    val palette = LocalConfetti.current
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Bottom) {
        if (crowned) Text("👑", fontSize = 24.sp)
        Text(player?.name ?: "—", style = MaterialTheme.typography.bodyMedium, color = palette.ink, fontWeight = FontWeight.SemiBold, maxLines = 1)
        Spacer(Modifier.height(6.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(height.dp)
                .drawBehind {
                    val offset = 4.dp.toPx()
                    drawRoundRect(
                        color = palette.ink,
                        topLeft = Offset(offset, offset),
                        size = Size(size.width, size.height),
                        cornerRadius = androidx.compose.ui.geometry.CornerRadius(14.dp.toPx())
                    )
                }
                .background(color, RoundedCornerShape(14.dp))
                .padding(8.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("#$rank", style = MaterialTheme.typography.displaySmall, color = palette.paper)
                Text("${player?.score ?: 0}", style = MaterialTheme.typography.titleLarge, color = palette.paper, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun ScoreRow(index: Int, player: Player) {
    val palette = LocalConfetti.current
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            "${index + 1}",
            style = MaterialTheme.typography.displaySmall,
            color = when (index) {
                0 -> Gold
                1 -> Teal
                2 -> Tomato
                else -> palette.inkSoft
            },
            modifier = Modifier.width(30.dp)
        )
        Avatar(player.name, size = 32.dp)
        Spacer(Modifier.width(10.dp))
        Text(player.name, style = MaterialTheme.typography.bodyLarge, color = palette.ink, modifier = Modifier.weight(1f))
        Text(stringResource(R.string.end_points_short, player.score), style = MaterialTheme.typography.headlineLarge, color = palette.ink, fontWeight = FontWeight.SemiBold)
    }
}
