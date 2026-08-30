package com.emojiguesser.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf

data class ConfettiPalette(
    val paper: androidx.compose.ui.graphics.Color,
    val bg: androidx.compose.ui.graphics.Color,
    val bg2: androidx.compose.ui.graphics.Color,
    val ink: androidx.compose.ui.graphics.Color,
    val inkSoft: androidx.compose.ui.graphics.Color,
    val hairline: androidx.compose.ui.graphics.Color,
    val hairlineStrong: androidx.compose.ui.graphics.Color,
    val accent: androidx.compose.ui.graphics.Color
)

val LocalConfetti = staticCompositionLocalOf {
    ConfettiPalette(Paper, Bg, Bg2, Ink, InkSoft, Hairline, HairlineStrong, Tomato)
}

private val LightColorScheme = lightColorScheme(
    primary = Ink,
    onPrimary = Paper,
    primaryContainer = Bg2,
    onPrimaryContainer = Ink,
    secondary = Tomato,
    onSecondary = Paper,
    secondaryContainer = Bg2,
    onSecondaryContainer = Ink,
    tertiary = Teal,
    background = Bg,
    onBackground = Ink,
    surface = Paper,
    onSurface = Ink,
    surfaceVariant = Bg2,
    onSurfaceVariant = InkSoft,
    outline = HairlineStrong,
    outlineVariant = Hairline,
    error = Tomato,
    onError = Paper
)

private val DarkColorScheme = darkColorScheme(
    primary = InkLight,
    onPrimary = BgDark,
    primaryContainer = Bg2Dark,
    onPrimaryContainer = InkLight,
    secondary = Tomato,
    onSecondary = InkLight,
    secondaryContainer = Bg2Dark,
    onSecondaryContainer = InkLight,
    tertiary = Teal,
    background = BgDark,
    onBackground = InkLight,
    surface = PaperDark,
    onSurface = InkLight,
    surfaceVariant = Bg2Dark,
    onSurfaceVariant = InkSoftDark,
    outline = HairlineStrongDark,
    outlineVariant = HairlineDark,
    error = Tomato,
    onError = InkLight
)

@Composable
fun EmojiGuesserTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val confetti = if (darkTheme) {
        ConfettiPalette(PaperDark, BgDark, Bg2Dark, InkLight, InkSoftDark, HairlineDark, HairlineStrongDark, Tomato)
    } else {
        ConfettiPalette(Paper, Bg, Bg2, Ink, InkSoft, Hairline, HairlineStrong, Tomato)
    }
    CompositionLocalProvider(LocalConfetti provides confetti) {
        MaterialTheme(
            colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme,
            typography = AppTypography,
            shapes = AppShapes,
            content = content
        )
    }
}
