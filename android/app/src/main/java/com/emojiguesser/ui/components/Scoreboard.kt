package com.emojiguesser.ui.components

import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.emojiguesser.data.Player
import com.emojiguesser.ui.theme.LocalConfetti

@Composable
fun Scoreboard(
    players: List<Player>,
    currentDescriberSessionId: String?,
    modifier: Modifier = Modifier
) {
    val palette = LocalConfetti.current
    LazyRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(players.sortedByDescending { it.score }, key = { it.sessionId ?: it.connectionId }) { player ->
            val isDescriber = player.sessionId != null && player.sessionId == currentDescriberSessionId
            val bg = if (isDescriber) palette.ink else palette.paper
            val fg = if (isDescriber) palette.paper else palette.ink
            val score by animateIntAsState(
                targetValue = player.score,
                animationSpec = tween(durationMillis = 320),
                label = "score"
            )
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(bg)
                    .border(1.dp, palette.ink, RoundedCornerShape(10.dp))
                    .padding(horizontal = 10.dp, vertical = 6.dp)
            ) {
                Text(
                    player.name,
                    style = MaterialTheme.typography.bodySmall,
                    color = fg,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    score.toString(),
                    style = MaterialTheme.typography.titleLarge,
                    color = fg,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}
