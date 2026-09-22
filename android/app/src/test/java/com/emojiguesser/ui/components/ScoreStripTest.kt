package com.emojiguesser.ui.components

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.emojiguesser.data.Player
import com.emojiguesser.testing.drawFrame
import com.emojiguesser.ui.theme.EmojiGuesserTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ScoreStripTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun `shows the top four scores in order`() {
        val players = listOf(
            Player(connectionId = "c1", sessionId = "s1", name = "Ann", score = 10),
            Player(connectionId = "c2", sessionId = "s2", name = "Ben", score = 50),
            Player(connectionId = "c3", name = "Cat", score = 40),
            Player(connectionId = "c4", sessionId = "s4", name = "Dan", score = 30),
            Player(connectionId = "c5", sessionId = "s5", name = "Eve", score = 20)
        )
        compose.setContent { EmojiGuesserTheme { ScoreStrip(players = players, activeSessionId = "s4") } }

        listOf("Ben" to "50", "Cat" to "40", "Dan" to "30", "Eve" to "20").forEach { (name, score) ->
            compose.onNodeWithText(name).assertIsDisplayed()
            compose.onNodeWithText(score).assertIsDisplayed()
        }
        val lefts = listOf("Ben", "Cat", "Dan", "Eve").map { compose.onNodeWithText(it).getUnclippedBoundsInRoot().left }
        assertEquals(lefts.sorted(), lefts)
        compose.onNodeWithText("Ann").assertDoesNotExist()
        compose.drawFrame()
    }
}
