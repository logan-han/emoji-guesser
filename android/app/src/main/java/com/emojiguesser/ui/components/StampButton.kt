package com.emojiguesser.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.emojiguesser.ui.theme.LocalConfetti

enum class StampButtonStyle { Primary, Secondary, Ghost }

@Composable
fun StampButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    style: StampButtonStyle = StampButtonStyle.Primary,
    contentPadding: PaddingValues = PaddingValues(horizontal = 20.dp, vertical = 12.dp),
    content: @Composable () -> Unit
) {
    val palette = LocalConfetti.current
    val (bg, fg) = when (style) {
        StampButtonStyle.Primary -> palette.ink to palette.paper
        StampButtonStyle.Secondary -> palette.paper to palette.ink
        StampButtonStyle.Ghost -> Color.Transparent to palette.ink
    }
    val effectiveBg = if (enabled) bg else palette.bg2
    val effectiveFg = if (enabled) fg else palette.inkSoft
    val shape = RoundedCornerShape(12.dp)
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val offsetDp = if (pressed) 0.dp else 3.dp

    Box(
        modifier = modifier
            .drawBehind {
                val offsetPx = offsetDp.toPx()
                if (offsetPx > 0f) {
                    drawRoundRect(
                        color = palette.ink,
                        topLeft = Offset(offsetPx, offsetPx),
                        size = Size(size.width, size.height),
                        cornerRadius = CornerRadius(12.dp.toPx(), 12.dp.toPx())
                    )
                }
            }
            .clip(shape)
            .background(effectiveBg)
            .border(1.5.dp, palette.ink, shape)
            .clickable(
                enabled = enabled,
                interactionSource = source,
                indication = null,
                onClick = onClick
            )
            .padding(contentPadding)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            modifier = Modifier.align(Alignment.Center)
        ) {
            CompositionLocalProvider(LocalContentColor provides effectiveFg) {
                ProvideTextStyle(
                    value = MaterialTheme.typography.labelLarge.copy(
                        fontWeight = FontWeight.SemiBold,
                        color = effectiveFg
                    )
                ) {
                    content()
                }
            }
        }
    }
}
