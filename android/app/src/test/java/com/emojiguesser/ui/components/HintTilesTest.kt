package com.emojiguesser.ui.components

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.emojiguesser.ui.theme.EmojiGuesserTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class HintTilesTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun `uppercases revealed letters and leaves blanks and spaces empty`() {
        compose.setContent { EmojiGuesserTheme { HintTiles("c_t a") } }

        listOf("C", "T", "A").forEach { compose.onNodeWithText(it).assertIsDisplayed() }
        compose.onAllNodesWithText("_").assertCountEquals(0)
    }
}
