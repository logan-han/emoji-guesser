package com.emojiguesser.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInHorizontally
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.emojiguesser.ui.theme.LocalConfetti

@Composable
fun EmojiStrip(
    emojis: List<String>,
    listState: LazyListState,
    emptyHint: String,
    modifier: Modifier = Modifier
) {
    val palette = LocalConfetti.current
    if (emojis.isEmpty()) {
        Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(emptyHint, style = MaterialTheme.typography.bodyLarge, color = palette.inkSoft)
        }
    } else {
        LazyRow(
            state = listState,
            modifier = modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            items(emojis) { emoji ->
                AnimatedVisibility(
                    visible = true,
                    enter = slideInHorizontally(animationSpec = tween(220)) { it / 2 } + fadeIn(tween(220))
                ) {
                    Text(
                        emoji,
                        fontSize = 44.sp,
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 6.dp)
                    )
                }
            }
        }
    }
}
