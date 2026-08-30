package com.emojiguesser.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.emojiguesser.R
import com.emojiguesser.ui.components.StampCard
import com.emojiguesser.ui.theme.LocalConfetti

@Composable
fun ErrorScreen(message: String) {
    val palette = LocalConfetti.current
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 18.dp, vertical = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(stringResource(R.string.error_title), style = MaterialTheme.typography.labelMedium, color = palette.inkSoft)
        Spacer(Modifier.weight(1f))
        StampCard(modifier = Modifier.fillMaxWidth(), contentPadding = 28.dp, rotationDeg = -1.5f) {
            Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Text("🫥", fontSize = 58.sp, modifier = Modifier.rotate(-8f))
            }
        }
        Spacer(Modifier.height(18.dp))
        Text(
            buildAnnotatedString {
                append(stringResource(R.string.error_room_gone_prefix))
                withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(stringResource(R.string.error_room_gone_italic)) }
            },
            style = MaterialTheme.typography.displaySmall,
            color = palette.ink,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(8.dp))
        Text(message, style = MaterialTheme.typography.bodyLarge, color = palette.inkSoft, textAlign = TextAlign.Center)
        Spacer(Modifier.height(12.dp))
        StampCard(contentPadding = 8.dp, stampOffset = 2.dp) {
            Text(stringResource(R.string.error_diagnostic), style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft)
        }
        Spacer(Modifier.weight(1f))
    }
}
