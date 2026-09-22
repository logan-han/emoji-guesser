package com.emojiguesser.ui.components

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.emojiguesser.testing.drawFrame
import com.emojiguesser.ui.theme.EmojiGuesserTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StampButtonTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    private var clicks = 0

    @Test
    fun `every style renders and fires onClick`() {
        compose.setContent {
            EmojiGuesserTheme {
                Column {
                    StampButtonStyle.entries.forEach { style ->
                        StampButton(onClick = { clicks++ }, style = style) { Text(style.name) }
                    }
                }
            }
        }
        compose.drawFrame()

        StampButtonStyle.entries.forEach { compose.onNodeWithText(it.name).performClick() }

        assertEquals(StampButtonStyle.entries.size, clicks)
    }

    @Test
    fun `disabled buttons ignore taps`() {
        compose.setContent { EmojiGuesserTheme { StampButton(onClick = { clicks++ }, enabled = false) { Text("Start") } } }

        compose.onNodeWithText("Start").assertIsNotEnabled().performClick()

        assertEquals(0, clicks)
    }

    @Test
    fun `pressing and releasing clicks once`() {
        compose.setContent { EmojiGuesserTheme { StampButton(onClick = { clicks++ }) { Text("Press") } } }

        compose.onNodeWithText("Press").performTouchInput { down(center) }
        // Drawing mid-press runs the flat, shadowless branch.
        compose.drawFrame()
        compose.onNodeWithText("Press").performTouchInput { up() }

        compose.onNodeWithText("Press").assertIsDisplayed()
        assertEquals(1, clicks)
    }
}
