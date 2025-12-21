package com.emojiguesser.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Purple = Color(0xFF6B46C1)
val PurpleDark = Color(0xFF553C9A)
val Blue = Color(0xFF3182CE)
val BlueDark = Color(0xFF2C5282)
val White = Color(0xFFFFFFFF)
val LightGray = Color(0xFFF5F5F5)
val DarkGray = Color(0xFF333333)
val Success = Color(0xFF38A169)
val Warning = Color(0xFFD69E2E)
val Error = Color(0xFFE53E3E)

private val LightColorScheme = lightColorScheme(
    primary = Purple,
    onPrimary = White,
    primaryContainer = PurpleDark,
    secondary = Blue,
    onSecondary = White,
    secondaryContainer = BlueDark,
    background = LightGray,
    onBackground = DarkGray,
    surface = White,
    onSurface = DarkGray,
    error = Error,
    onError = White
)

private val DarkColorScheme = darkColorScheme(
    primary = Purple,
    onPrimary = White,
    primaryContainer = PurpleDark,
    secondary = Blue,
    onSecondary = White,
    secondaryContainer = BlueDark,
    background = DarkGray,
    onBackground = White,
    surface = Color(0xFF1E1E1E),
    onSurface = White,
    error = Error,
    onError = White
)

@Composable
fun EmojiGuesserTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
