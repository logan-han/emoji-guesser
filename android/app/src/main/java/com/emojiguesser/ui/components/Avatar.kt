package com.emojiguesser.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.emojiguesser.ui.theme.Gold
import com.emojiguesser.ui.theme.LocalConfetti

@Composable
fun Avatar(
    name: String,
    modifier: Modifier = Modifier,
    size: Dp = 36.dp,
    isHost: Boolean = false
) {
    val palette = LocalConfetti.current
    val initial = name.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "?"

    Box(modifier = modifier.size(size + if (isHost) 6.dp else 0.dp)) {
        Box(
            modifier = Modifier
                .align(Alignment.Center)
                .size(size)
                .clip(CircleShape)
                .background(palette.paper)
                .border(2.dp, if (isHost) Gold else palette.ink, CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = initial,
                style = MaterialTheme.typography.titleMedium,
                color = palette.ink,
                fontWeight = FontWeight.SemiBold
            )
        }
        if (isHost) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(16.dp)
                    .clip(CircleShape)
                    .background(Gold)
                    .border(1.dp, palette.ink, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text("♛", color = palette.ink, fontSize = 9.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}
