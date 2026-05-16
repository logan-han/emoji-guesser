package com.emojiguesser.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.emojiguesser.ui.theme.LocalConfetti

@Composable
fun PresetChipsRow(
    selectedSeconds: Int,
    onSelected: (Int) -> Unit,
    modifier: Modifier = Modifier,
    values: List<Int> = listOf(60, 90, 120, 180, 240)
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        values.forEach { value ->
            PresetChip(
                label = value.toString(),
                selected = value == selectedSeconds,
                onClick = { onSelected(value) },
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
private fun PresetChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalConfetti.current
    val bg = if (selected) palette.ink else palette.paper
    val fg = if (selected) palette.paper else palette.ink
    val shape = RoundedCornerShape(10.dp)

    Box(
        modifier = modifier
            .drawBehind {
                if (selected) {
                    val offset = 2.dp.toPx()
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
            .clickable(onClick = onClick)
            .padding(vertical = 9.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = fg, fontWeight = FontWeight.SemiBold)
    }
}
