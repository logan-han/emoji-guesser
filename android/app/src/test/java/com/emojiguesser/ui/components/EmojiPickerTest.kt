package com.emojiguesser.ui.components

import androidx.activity.ComponentActivity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.emojiguesser.ui.theme.EmojiGuesserTheme
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class EmojiPickerTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    private val picked = mutableListOf<String>()

    @Before
    fun setUp() {
        compose.setContent { EmojiGuesserTheme { EmojiPicker(onEmojiSelected = { picked += it }) } }
    }

    // Tab icons also appear in their own grids, so match on the tab role.
    private fun tab(icon: String) =
        compose.onNode(hasText(icon) and SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Tab))

    @Test
    fun `opens on smileys and reports the tapped emoji`() {
        tab("😀").assertIsSelected()

        compose.onNodeWithText("😃").performClick()

        assertEquals(listOf("😃"), picked)
    }

    @Test
    fun `every category tab swaps in its own emojis`() {
        val secondEmojiByTab = linkedMapOf(
            "👋" to "🤚",
            "🐶" to "🐱",
            "🍔" to "🍟",
            "⚽" to "🏀",
            "🚗" to "🚕",
            "💡" to "🔦",
            "❤️" to "🧡",
            "🏳️" to "🏴",
            "😀" to "😃"
        )

        secondEmojiByTab.forEach { (icon, emoji) ->
            tab(icon).performScrollTo().performClick()
            tab(icon).assertIsSelected()
            compose.onNodeWithText(emoji).performClick()
        }

        assertEquals(secondEmojiByTab.values.toList(), picked)
    }
}
