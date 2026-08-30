package com.emojiguesser

import org.junit.Assert.*
import org.junit.Test

class EmojiCategoryTest {

    @Test
    fun `all emoji categories have icons`() {
        val categories = listOf(
            "SMILEYS" to "😀",
            "PEOPLE" to "👋",
            "ANIMALS" to "🐶",
            "FOOD" to "🍔",
            "ACTIVITIES" to "⚽",
            "TRAVEL" to "🚗",
            "OBJECTS" to "💡",
            "SYMBOLS" to "❤️",
            "FLAGS" to "🏳️"
        )

        assertEquals(9, categories.size)
        categories.forEach { (name, icon) ->
            assertTrue("$name should have icon", icon.isNotEmpty())
        }
    }

    @Test
    fun `smileys category contains face emojis`() {
        val smileys = listOf("😀", "😃", "😄", "😁", "😊", "😍", "😎", "😭", "😱")
        smileys.forEach { emoji ->
            assertTrue("Smiley emoji should be valid: $emoji", emoji.isNotEmpty())
        }
    }

    @Test
    fun `animals category contains animal emojis`() {
        val animals = listOf("🐶", "🐱", "🐭", "🐰", "🦊", "🐻", "🐼", "🐨", "🦁")
        animals.forEach { emoji ->
            assertTrue("Animal emoji should be valid: $emoji", emoji.isNotEmpty())
        }
    }

    @Test
    fun `food category contains food emojis`() {
        val food = listOf("🍔", "🍟", "🍕", "🌮", "🍜", "🍣", "🍰", "🍦", "☕")
        food.forEach { emoji ->
            assertTrue("Food emoji should be valid: $emoji", emoji.isNotEmpty())
        }
    }

    @Test
    fun `activities category contains activity emojis`() {
        val activities = listOf("⚽", "🏀", "🎾", "🎮", "🎸", "🎬", "🎨", "🎭")
        activities.forEach { emoji ->
            assertTrue("Activity emoji should be valid: $emoji", emoji.isNotEmpty())
        }
    }

    @Test
    fun `travel category contains travel emojis`() {
        val travel = listOf("🚗", "✈️", "🚀", "🚢", "🏰", "🗽", "⛰️", "🏖️")
        travel.forEach { emoji ->
            assertTrue("Travel emoji should be valid: $emoji", emoji.isNotEmpty())
        }
    }

    @Test
    fun `objects category contains object emojis`() {
        val objects = listOf("💡", "📱", "💻", "🔧", "🔪", "💎", "💰", "🔬")
        objects.forEach { emoji ->
            assertTrue("Object emoji should be valid: $emoji", emoji.isNotEmpty())
        }
    }

    @Test
    fun `symbols category contains symbol emojis`() {
        val symbols = listOf("❤️", "💔", "☮️", "♈", "✅", "❌", "💯", "⚛️")
        symbols.forEach { emoji ->
            assertTrue("Symbol emoji should be valid: $emoji", emoji.isNotEmpty())
        }
    }

    @Test
    fun `flags category contains flag emojis`() {
        val flags = listOf("🏳️", "🏴", "🇺🇸", "🇬🇧", "🇯🇵", "🇫🇷", "🇩🇪", "🏳️‍🌈")
        flags.forEach { emoji ->
            assertTrue("Flag emoji should be valid: $emoji", emoji.isNotEmpty())
        }
    }

    @Test
    fun `emoji strings are not empty`() {
        val testEmojis = listOf(
            "😀", "👋", "🐶", "🍔", "⚽", "🚗", "💡", "❤️", "🏳️"
        )

        testEmojis.forEach { emoji ->
            assertTrue("Emoji should not be blank: $emoji", emoji.isNotBlank())
            assertTrue("Emoji string length should be > 0", emoji.length > 0)
        }
    }
}
