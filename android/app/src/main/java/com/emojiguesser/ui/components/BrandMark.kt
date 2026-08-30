package com.emojiguesser.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.emojiguesser.ui.theme.LocalConfetti
import com.emojiguesser.ui.theme.Tomato

@Composable
fun BrandMark(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        StampCard(
            rotationDeg = -4f,
            cornerRadius = 8.dp,
            stampOffset = 2.dp,
            contentPadding = 4.dp,
            modifier = Modifier.size(38.dp)
        ) {
            Text(
                "🎯",
                style = MaterialTheme.typography.titleLarge
            )
        }

        Text(
            text = buildAnnotatedString {
                append("Emoji ")
                withStyle(SpanStyle(fontStyle = FontStyle.Italic, color = Tomato)) {
                    append("Guesser")
                }
            },
            style = MaterialTheme.typography.headlineSmall,
            color = LocalConfetti.current.ink
        )
    }
}
