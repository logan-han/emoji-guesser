package com.emojiguesser.ui.components

import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.emojiguesser.data.Player
import com.emojiguesser.ui.theme.LocalConfetti

@Composable
fun ScoreStrip(
    players: List<Player>,
    activeSessionId: String?,
    modifier: Modifier = Modifier
) {
    val shown = players.sortedByDescending { it.score }.take(4)
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        shown.forEach { player ->
            val active = player.sessionId != null && player.sessionId == activeSessionId
            val score by animateIntAsState(player.score, tween(320), label = "score-strip")
            ScorePill(
                name = player.name,
                score = score,
                active = active,
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
private fun ScorePill(
    name: String,
    score: Int,
    active: Boolean,
    modifier: Modifier = Modifier
) {
    val palette = LocalConfetti.current
    val shape = RoundedCornerShape(10.dp)
    val bg = if (active) palette.ink else palette.paper
    val fg = if (active) palette.paper else palette.ink

    Column(
        modifier = modifier
            .drawBehind {
                if (active) {
                    val offset = 3.dp.toPx()
                    drawRoundRect(
                        color = palette.ink,
                        topLeft = Offset(offset, offset),
                        size = Size(size.width, size.height),
                        cornerRadius = CornerRadius(10.dp.toPx())
                    )
                }
            }
            .background(bg, shape)
            .border(1.5.dp, palette.ink, shape)
            .padding(horizontal = 6.dp, vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = name,
            style = MaterialTheme.typography.labelMedium,
            color = fg,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Text(
            text = score.toString(),
            style = MaterialTheme.typography.titleLarge,
            color = fg,
            fontWeight = FontWeight.SemiBold
        )
    }
}
