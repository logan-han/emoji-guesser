package com.emojiguesser.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.emojiguesser.ui.theme.LocalConfetti

@Composable
fun EmojiPicker(
    onEmojiSelected: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalConfetti.current
    var selectedCategory by remember { mutableStateOf(EmojiCategory.SMILEYS) }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .height(280.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(palette.paper)
            .border(1.5.dp, palette.ink, RoundedCornerShape(12.dp))
    ) {
        ScrollableTabRow(
            selectedTabIndex = selectedCategory.ordinal,
            containerColor = Color.Transparent,
            contentColor = palette.ink,
            edgePadding = 0.dp,
            divider = {}
        ) {
            EmojiCategory.entries.forEach { category ->
                Tab(
                    selected = selectedCategory == category,
                    onClick = { selectedCategory = category },
                    text = { Text(category.icon, fontSize = 20.sp) }
                )
            }
        }

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
                    Text(text = emoji, fontSize = 24.sp, textAlign = TextAlign.Center)
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
