package com.emojiguesser.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun EmojiPicker(
    onEmojiSelected: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var selectedCategory by remember { mutableStateOf(EmojiCategory.SMILEYS) }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .height(280.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column {
            // Category tabs
            ScrollableTabRow(
                selectedTabIndex = selectedCategory.ordinal,
                containerColor = Color.Transparent,
                edgePadding = 0.dp
            ) {
                EmojiCategory.entries.forEach { category ->
                    Tab(
                        selected = selectedCategory == category,
                        onClick = { selectedCategory = category },
                        text = { Text(category.icon, fontSize = 20.sp) }
                    )
                }
            }

            // Emoji grid
            LazyVerticalGrid(
                columns = GridCells.Fixed(8),
                contentPadding = PaddingValues(8.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(getEmojisForCategory(selectedCategory)) { emoji ->
                    Box(
                        modifier = Modifier
                            .aspectRatio(1f)
                            .clickable { onEmojiSelected(emoji) }
                            .padding(4.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = emoji,
                            fontSize = 24.sp,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }
        }
    }
}

enum class EmojiCategory(val icon: String) {
    SMILEYS("😀"),
    PEOPLE("👋"),
    ANIMALS("🐶"),
    FOOD("🍔"),
    ACTIVITIES("⚽"),
    TRAVEL("🚗"),
    OBJECTS("💡"),
    SYMBOLS("❤️"),
    FLAGS("🏳️")
}

private fun getEmojisForCategory(category: EmojiCategory): List<String> {
    return when (category) {
        EmojiCategory.SMILEYS -> listOf(
            "😀", "😃", "😄", "😁", "😅", "😂", "🤣", "😊",
            "😇", "🙂", "😉", "😌", "😍", "🥰", "😘", "😗",
            "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭",
            "🤫", "🤔", "🤐", "🤨", "😐", "😑", "😶", "😏",
            "😒", "🙄", "😬", "🤥", "😌", "😔", "😪", "🤤",
            "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🤧", "🥵",
            "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "🥸", "😎",
            "🤓", "🧐", "😕", "😟", "🙁", "☹️", "😮", "😯",
            "😲", "😳", "🥺", "😦", "😧", "😨", "😰", "😥",
            "😢", "😭", "😱", "😖", "😣", "😞", "😓", "😩",
            "😫", "🥱", "😤", "😡", "😠", "🤬", "😈", "👿",
            "💀", "☠️", "💩", "🤡", "👹", "👺", "👻", "👽"
        )
        EmojiCategory.PEOPLE -> listOf(
            "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏",
            "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆",
            "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛",
            "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️",
            "💪", "🦾", "🦿", "🦵", "🦶", "👂", "🦻", "👃",
            "🧠", "🫀", "🫁", "🦷", "🦴", "👀", "👁️", "👅",
            "👄", "👶", "🧒", "👦", "👧", "🧑", "👱", "👨",
            "🧔", "👩", "🧓", "👴", "👵", "🙍", "🙎", "🙅",
            "🙆", "💁", "🙋", "🧏", "🙇", "🤦", "🤷", "👮",
            "🕵️", "💂", "🥷", "👷", "🤴", "👸", "👳", "👲"
        )
        EmojiCategory.ANIMALS -> listOf(
            "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼",
            "🐻‍❄️", "🐨", "🐯", "🦁", "🐮", "🐷", "🐽", "🐸",
            "🐵", "🙈", "🙉", "🙊", "🐒", "🐔", "🐧", "🐦",
            "🐤", "🐣", "🐥", "🦆", "🦅", "🦉", "🦇", "🐺",
            "🐗", "🐴", "🦄", "🐝", "🪱", "🐛", "🦋", "🐌",
            "🐞", "🐜", "🪰", "🪲", "🪳", "🦟", "🦗", "🕷️",
            "🕸️", "🦂", "🐢", "🐍", "🦎", "🦖", "🦕", "🐙",
            "🦑", "🦐", "🦞", "🦀", "🐡", "🐠", "🐟", "🐬",
            "🐳", "🐋", "🦈", "🐊", "🐅", "🐆", "🦓", "🦍",
            "🦧", "🦣", "🐘", "🦛", "🦏", "🐪", "🐫", "🦒"
        )
        EmojiCategory.FOOD -> listOf(
            "🍔", "🍟", "🍕", "🌭", "🥪", "🌮", "🌯", "🫔",
            "🥙", "🧆", "🥚", "🍳", "🥘", "🍲", "🫕", "🥣",
            "🥗", "🍿", "🧈", "🧂", "🥫", "🍱", "🍘", "🍙",
            "🍚", "🍛", "🍜", "🍝", "🍠", "🍢", "🍣", "🍤",
            "🍥", "🥮", "🍡", "🥟", "🥠", "🥡", "🦀", "🦞",
            "🦐", "🦑", "🦪", "🍦", "🍧", "🍨", "🍩", "🍪",
            "🎂", "🍰", "🧁", "🥧", "🍫", "🍬", "🍭", "🍮",
            "🍯", "🍼", "🥛", "☕", "🫖", "🍵", "🍶", "🍾",
            "🍷", "🍸", "🍹", "🍺", "🍻", "🥂", "🥃", "🥤",
            "🧋", "🧃", "🧉", "🧊", "🥢", "🍽️", "🍴", "🥄"
        )
        EmojiCategory.ACTIVITIES -> listOf(
            "⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉",
            "🥏", "🎱", "🪀", "🏓", "🏸", "🏒", "🏑", "🥍",
            "🏏", "🪃", "🥅", "⛳", "🪁", "🏹", "🎣", "🤿",
            "🥊", "🥋", "🎽", "🛹", "🛼", "🛷", "⛸️", "🥌",
            "🎿", "⛷️", "🏂", "🪂", "🏋️", "🤼", "🤸", "⛹️",
            "🤺", "🤾", "🏌️", "🏇", "⛵", "🏄", "🏊", "🚣",
            "🧗", "🚵", "🚴", "🎪", "🎭", "🎨", "🎬", "🎤",
            "🎧", "🎼", "🎹", "🥁", "🪘", "🎷", "🎺", "🪗",
            "🎸", "🪕", "🎻", "🎲", "♟️", "🎯", "🎳", "🎮",
            "🎰", "🧩", "🎭", "🎪", "🎠", "🎡", "🎢", "🎟️"
        )
        EmojiCategory.TRAVEL -> listOf(
            "🚗", "🚕", "🚙", "🚌", "🚎", "🏎️", "🚓", "🚑",
            "🚒", "🚐", "🛻", "🚚", "🚛", "🚜", "🦯", "🦽",
            "🦼", "🛴", "🚲", "🛵", "🏍️", "🛺", "🚨", "🚔",
            "🚍", "🚘", "🚖", "🚡", "🚠", "🚟", "🚃", "🚋",
            "🚞", "🚝", "🚄", "🚅", "🚈", "🚂", "🚆", "🚇",
            "🚊", "🚉", "✈️", "🛫", "🛬", "🛩️", "💺", "🛰️",
            "🚀", "🛸", "🚁", "🛶", "⛵", "🚤", "🛥️", "🛳️",
            "⛴️", "🚢", "⚓", "🪝", "⛽", "🚧", "🚦", "🚥",
            "🗿", "🗽", "🗼", "🏰", "🏯", "🏟️", "🎡", "🎢",
            "🎠", "⛲", "⛱️", "🏖️", "🏝️", "🏜️", "🌋", "⛰️"
        )
        EmojiCategory.OBJECTS -> listOf(
            "💡", "🔦", "🏮", "🪔", "📱", "📲", "💻", "🖥️",
            "🖨️", "⌨️", "🖱️", "🖲️", "💽", "💾", "💿", "📀",
            "🧮", "🎥", "🎞️", "📽️", "🎬", "📺", "📷", "📸",
            "📹", "📼", "🔍", "🔎", "🕯️", "💵", "💴", "💶",
            "💷", "💰", "💳", "💎", "⚖️", "🪜", "🧰", "🪛",
            "🔧", "🔨", "⚒️", "🛠️", "⛏️", "🪚", "🔩", "⚙️",
            "🪤", "🧱", "⛓️", "🧲", "🔫", "💣", "🧨", "🪓",
            "🔪", "🗡️", "⚔️", "🛡️", "🚬", "⚰️", "🪦", "⚱️",
            "🏺", "🔮", "📿", "🧿", "💈", "⚗️", "🔭", "🔬",
            "🕳️", "🩹", "🩺", "💊", "💉", "🩸", "🧬", "🦠"
        )
        EmojiCategory.SYMBOLS -> listOf(
            "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍",
            "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖",
            "💘", "💝", "💟", "☮️", "✝️", "☪️", "🕉️", "☸️",
            "✡️", "🔯", "🕎", "☯️", "☦️", "🛐", "⛎", "♈",
            "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐",
            "♑", "♒", "♓", "🆔", "⚛️", "🉑", "☢️", "☣️",
            "📴", "📳", "🈶", "🈚", "🈸", "🈺", "🈷️", "✴️",
            "🆚", "💮", "🉐", "㊙️", "㊗️", "🈴", "🈵", "🈹",
            "🈲", "🅰️", "🅱️", "🆎", "🆑", "🅾️", "🆘", "❌",
            "⭕", "🛑", "⛔", "📛", "🚫", "💯", "💢", "♨️"
        )
        EmojiCategory.FLAGS -> listOf(
            "🏳️", "🏴", "🏁", "🚩", "🎌", "🏴‍☠️", "🇦🇺", "🇦🇹",
            "🇧🇪", "🇧🇷", "🇨🇦", "🇨🇳", "🇩🇰", "🇪🇬", "🇫🇮", "🇫🇷",
            "🇩🇪", "🇬🇷", "🇮🇳", "🇮🇩", "🇮🇪", "🇮🇱", "🇮🇹", "🇯🇵",
            "🇰🇷", "🇲🇽", "🇳🇱", "🇳🇿", "🇳🇴", "🇵🇱", "🇵🇹", "🇷🇺",
            "🇸🇦", "🇸🇬", "🇿🇦", "🇪🇸", "🇸🇪", "🇨🇭", "🇹🇭", "🇹🇷",
            "🇺🇦", "🇦🇪", "🇬🇧", "🇺🇸", "🇻🇳", "🏳️‍🌈", "🏳️‍⚧️", "🇺🇳"
        )
    }
}
