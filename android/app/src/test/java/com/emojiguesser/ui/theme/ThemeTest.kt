package com.emojiguesser.ui.theme

import androidx.activity.ComponentActivity
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

@RunWith(AndroidJUnit4::class)
class ThemeTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    private lateinit var palette: ConfettiPalette
    private lateinit var scheme: ColorScheme
    private lateinit var typography: Typography
    private lateinit var shapes: Shapes

    private val light = ConfettiPalette(Paper, Bg, Bg2, Ink, InkSoft, Hairline, HairlineStrong, Tomato)
    private val dark = ConfettiPalette(PaperDark, BgDark, Bg2Dark, InkLight, InkSoftDark, HairlineDark, HairlineStrongDark, Tomato)

    private val capture: @Composable () -> Unit = {
        palette = LocalConfetti.current
        scheme = MaterialTheme.colorScheme
        typography = MaterialTheme.typography
        shapes = MaterialTheme.shapes
    }

    private fun render(darkTheme: Boolean? = null) = compose.setContent {
        if (darkTheme == null) EmojiGuesserTheme(content = capture) else EmojiGuesserTheme(darkTheme = darkTheme, content = capture)
    }

    @Test
    fun `light theme uses the confetti palette and app type and shapes`() {
        render(darkTheme = false)

        compose.runOnIdle {
            assertEquals(light, palette)
            assertEquals(Bg, scheme.background)
            assertEquals(Ink, scheme.primary)
            assertSame(AppTypography, typography)
            assertSame(AppShapes, shapes)
        }
    }

    @Test
    fun `dark theme swaps to the midnight palette`() {
        render(darkTheme = true)

        compose.runOnIdle {
            assertEquals(dark, palette)
            assertEquals(BgDark, scheme.background)
            assertEquals(InkLight, scheme.primary)
        }
    }

    @Test
    fun `follows a light system setting by default`() {
        render()

        compose.runOnIdle { assertEquals(light, palette) }
    }

    @Test
    @Config(qualifiers = "night")
    fun `follows a dark system setting by default`() {
        render()

        compose.runOnIdle { assertEquals(dark, palette) }
    }

    @Test
    fun `palette falls back to light outside the theme`() {
        compose.setContent { palette = LocalConfetti.current }

        compose.runOnIdle { assertEquals(light, palette) }
    }
}
