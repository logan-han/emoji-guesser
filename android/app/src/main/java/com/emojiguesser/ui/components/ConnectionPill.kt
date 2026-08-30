package com.emojiguesser.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.emojiguesser.network.ConnectionState
import com.emojiguesser.ui.theme.LocalConfetti
import com.emojiguesser.ui.theme.Sage
import com.emojiguesser.ui.theme.Tomato

@Composable
fun ConnectionPill(state: ConnectionState, modifier: Modifier = Modifier) {
    val palette = LocalConfetti.current
    val (label, dot) = when (state) {
        ConnectionState.CONNECTED -> "Live" to Sage
        ConnectionState.CONNECTING -> "Connecting" to palette.inkSoft
        ConnectionState.DISCONNECTED -> "Offline" to palette.inkSoft
        ConnectionState.FAILED -> "Failed" to Tomato
    }

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = modifier
            .clip(RoundedCornerShape(999.dp))
            .background(palette.paper)
            .border(1.dp, palette.hairlineStrong, RoundedCornerShape(999.dp))
            .padding(horizontal = 12.dp, vertical = 6.dp)
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(dot)
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = palette.inkSoft
        )
    }
}
