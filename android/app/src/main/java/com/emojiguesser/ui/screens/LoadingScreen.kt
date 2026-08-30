package com.emojiguesser.ui.screens

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.emojiguesser.R
import com.emojiguesser.ui.components.BrandMark
import com.emojiguesser.ui.components.StampCard
import com.emojiguesser.ui.theme.Gold
import com.emojiguesser.ui.theme.LocalConfetti

@Composable
fun LoadingScreen(message: String) {
    val palette = LocalConfetti.current
    val transition = rememberInfiniteTransition(label = "connecting")
    val tilt by transition.animateFloat(
        initialValue = -6f,
        targetValue = 6f,
        animationSpec = infiniteRepeatable(tween(700), RepeatMode.Reverse),
        label = "tilt"
    )

    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 18.dp, vertical = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            BrandMark(modifier = Modifier.weight(1f))
            Box(
                modifier = Modifier
                    .background(Gold, RoundedCornerShape(10.dp))
                    .padding(horizontal = 8.dp, vertical = 4.dp)
            ) {
                Text(stringResource(R.string.conn_connecting_title), style = MaterialTheme.typography.labelMedium, color = palette.ink)
            }
        }
        Spacer(Modifier.weight(1f))
        StampCard(modifier = Modifier.fillMaxWidth(), contentPadding = 28.dp, stampOffset = 5.dp) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                Text("🎲", fontSize = 56.sp, modifier = Modifier.rotate(tilt))
                Spacer(Modifier.height(12.dp))
                Text(message, style = MaterialTheme.typography.titleLarge, color = palette.ink)
                Text("•••", style = MaterialTheme.typography.displaySmall, color = palette.inkSoft)
            }
        }
        Spacer(Modifier.height(18.dp))
        Text(
            buildAnnotatedString {
                append(stringResource(R.string.conn_warming_prefix))
                withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(stringResource(R.string.conn_warming_italic)) }
            },
            style = MaterialTheme.typography.displaySmall,
            color = palette.ink
        )
        Spacer(Modifier.weight(1f))
        StampCard(modifier = Modifier.fillMaxWidth(), contentPadding = 12.dp) {
            Text("💡 ${stringResource(R.string.conn_tip)}", style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft)
        }
    }
}
