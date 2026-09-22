package com.emojiguesser.ui.components

import androidx.activity.ComponentActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.emojiguesser.data.Player
import com.emojiguesser.ui.theme.EmojiGuesserTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ScoreboardTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    private fun leftOf(name: String) = compose.onNodeWithText(name).getUnclippedBoundsInRoot().left

    @Test
    fun `ranks players by score and animates score changes`() {
        var players by mutableStateOf(
            listOf(
                Player(connectionId = "c1", sessionId = "s1", name = "Ann", score = 10),
                Player(connectionId = "c2", name = "Ben", score = 30),
                Player(connectionId = "c3", sessionId = "s3", name = "Cat", score = 20)
            )
        )
        compose.setContent { EmojiGuesserTheme { Scoreboard(players = players, currentDescriberSessionId = "s1") } }

        val lefts = listOf("Ben", "Cat", "Ann").map(::leftOf)
        assertEquals(lefts.sorted(), lefts)

        players = players.map { if (it.name == "Ann") it.copy(score = 50) else it }

        compose.onNodeWithText("50").assertIsDisplayed()
        assertTrue(leftOf("Ann") < leftOf("Ben"))
    }
}
