package com.emojiguesser.ui.components

import androidx.activity.ComponentActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.emojiguesser.network.ConnectionState
import com.emojiguesser.ui.theme.EmojiGuesserTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ConnectionPillTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun `labels every connection state`() {
        var state by mutableStateOf(ConnectionState.CONNECTED)
        compose.setContent { EmojiGuesserTheme { ConnectionPill(state) } }

        mapOf(
            ConnectionState.CONNECTED to "Live",
            ConnectionState.CONNECTING to "Connecting",
            ConnectionState.DISCONNECTED to "Offline",
            ConnectionState.FAILED to "Failed"
        ).forEach { (next, label) ->
            state = next
            compose.onNodeWithText(label).assertIsDisplayed()
        }
    }
}
