package com.emojiguesser.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.emojiguesser.ui.theme.LocalConfetti

@Composable
fun StampCard(
    modifier: Modifier = Modifier,
    rotationDeg: Float = 0f,
    cornerRadius: Dp = 14.dp,
    stampOffset: Dp = 3.dp,
    fill: Color? = null,
    border: Color? = null,
    contentPadding: Dp = 12.dp,
    content: @Composable () -> Unit
) {
    val palette = LocalConfetti.current
    val bg = fill ?: palette.paper
    val borderColour = border ?: palette.ink
    val shape = RoundedCornerShape(cornerRadius)

    Box(
        modifier = modifier
            .rotate(rotationDeg)
            .drawBehind {
                val offsetPx = stampOffset.toPx()
                val radius = cornerRadius.toPx()
                drawRoundRect(
                    color = palette.ink,
                    topLeft = Offset(offsetPx, offsetPx),
                    size = Size(size.width, size.height),
                    cornerRadius = CornerRadius(radius, radius)
                )
            }
            .clip(shape)
            .background(bg)
            .border(1.5.dp, borderColour, shape)
            .padding(contentPadding)
    ) {
        content()
    }
}
