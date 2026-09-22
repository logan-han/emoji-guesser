package com.emojiguesser.ui.components

import androidx.activity.ComponentActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.emojiguesser.testing.drawFrame
import com.emojiguesser.ui.theme.EmojiGuesserTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TimerRingTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun `shows the seconds left as the ring drains`() {
        var remaining by mutableIntStateOf(90)
        compose.setContent { EmojiGuesserTheme { TimerRing(remainingSeconds = remaining, totalSeconds = 100) } }

        listOf(90, 40, 10).forEach {
            remaining = it
            compose.onNodeWithText("$it").assertIsDisplayed()
            compose.drawFrame()
        }
    }

    @Test
    fun `clamps negative time and a zero-length round`() {
        compose.setContent {
            EmojiGuesserTheme { TimerRing(remainingSeconds = -5, totalSeconds = 0, modifier = Modifier.testTag("ring")) }
        }

        compose.onNodeWithText("0").assertIsDisplayed()
        compose.onNodeWithTag("ring").assertWidthIsEqualTo(44.dp)
        compose.drawFrame()
    }
}
