package com.emojiguesser.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.emojiguesser.R
import com.emojiguesser.data.Game
import com.emojiguesser.data.Player
import com.emojiguesser.ui.components.Avatar
import com.emojiguesser.ui.components.PresetChipsRow
import com.emojiguesser.ui.components.StampButton
import com.emojiguesser.ui.components.StampButtonStyle
import com.emojiguesser.ui.components.StampCard
import com.emojiguesser.ui.theme.LocalConfetti
import com.emojiguesser.ui.theme.MonoFamily
import com.emojiguesser.ui.theme.Sage
import com.emojiguesser.ui.theme.Teal

@Composable
fun WaitingRoomScreen(
    game: Game,
    isOwner: Boolean,
    onStartGame: (Int, Int) -> Unit,
    onLeaveGame: () -> Unit
) {
    val palette = LocalConfetti.current
    val clipboardManager = LocalClipboardManager.current
    var timeLimit by remember { mutableIntStateOf(game.timeLimit) }
    var maxRounds by remember { mutableIntStateOf(game.maxRounds ?: 2) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 18.dp, vertical = 10.dp)
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onLeaveGame) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.waiting_leave), tint = palette.ink)
            }
            Text(
                stringResource(R.string.waiting_room_title),
                style = MaterialTheme.typography.labelMedium,
                color = palette.inkSoft,
                modifier = Modifier.weight(1f),
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.size(48.dp))
        }

        StampCard(modifier = Modifier.fillMaxWidth(), contentPadding = 14.dp, stampOffset = 5.dp) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.waiting_game_code), style = MaterialTheme.typography.labelMedium, color = palette.inkSoft, modifier = Modifier.weight(1f))
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .background(Teal)
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(if (game.isPublic) stringResource(R.string.lobby_public_game) else stringResource(R.string.waiting_private), style = MaterialTheme.typography.labelMedium, color = palette.paper)
                    }
                }
                Text(
                    game.gameId,
                    modifier = Modifier.fillMaxWidth(),
                    style = MaterialTheme.typography.displayLarge.copy(fontFamily = MonoFamily, fontSize = 42.sp, letterSpacing = 6.sp),
                    color = palette.ink,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    StampButton(
                        onClick = { clipboardManager.setText(AnnotatedString(game.gameId)) },
                        style = StampButtonStyle.Secondary,
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 9.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("📋 ${stringResource(R.string.waiting_copy_code)}")
                    }
                    StampButton(
                        onClick = { clipboardManager.setText(AnnotatedString("https://emoji-guesser.app/${game.gameId}")) },
                        style = StampButtonStyle.Secondary,
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 9.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("↗ ${stringResource(R.string.waiting_share_link)}")
                    }
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        StampCard(modifier = Modifier.fillMaxWidth().weight(1f), contentPadding = 14.dp) {
            Column(modifier = Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.waiting_players, game.players.size), style = MaterialTheme.typography.headlineLarge, color = palette.ink, modifier = Modifier.weight(1f))
                    Text(stringResource(R.string.waiting_players_capacity, game.players.size), style = MaterialTheme.typography.bodyMedium.copy(fontFamily = MonoFamily), color = palette.inkSoft)
                }
                Spacer(Modifier.height(10.dp))
                LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(8) { index ->
                        val player = game.players.getOrNull(index)
                        if (player == null) {
                            EmptyPlayerRow()
                        } else {
                            PlayerRow(
                                player = player,
                                isOwner = player.connectionId == game.ownerId,
                                isYou = isOwner && player.connectionId == game.ownerId
                            )
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        if (isOwner) {
            StampCard(modifier = Modifier.fillMaxWidth(), contentPadding = 14.dp) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.lobby_round_time), style = MaterialTheme.typography.labelMedium, color = palette.inkSoft)
                    PresetChipsRow(selectedSeconds = timeLimit, onSelected = { timeLimit = it })
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        (2..5).forEach { rounds ->
                            RoundChip(rounds.toString(), maxRounds == rounds, { maxRounds = rounds }, Modifier.weight(1f))
                        }
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
        }

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StampButton(onClick = onLeaveGame, style = StampButtonStyle.Secondary, modifier = Modifier.weight(1f)) {
                Text(stringResource(R.string.waiting_leave))
            }
            if (isOwner) {
                StampButton(
                    onClick = { onStartGame(timeLimit, maxRounds) },
                    enabled = game.players.size >= 2,
                    modifier = Modifier.weight(1f)
                ) {
                    Text(if (game.players.size >= 2) stringResource(R.string.waiting_start_game_arrow) else stringResource(R.string.waiting_need_more_players))
                }
            } else {
                StampButton(onClick = {}, enabled = false, style = StampButtonStyle.Secondary, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.waiting_joining))
                }
            }
        }
    }
}

@Composable
private fun PlayerRow(player: Player, isOwner: Boolean, isYou: Boolean) {
    val palette = LocalConfetti.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(if (isYou) palette.bg else palette.paper)
            .border(1.dp, if (isYou) palette.hairlineStrong else palette.hairline, RoundedCornerShape(10.dp))
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Avatar(player.name, size = 36.dp, isHost = isOwner)
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(player.name, style = MaterialTheme.typography.bodyLarge, color = palette.ink, fontWeight = FontWeight.SemiBold)
            Text(if (isOwner) "👑 ${stringResource(R.string.waiting_host)}" else stringResource(R.string.waiting_ready), style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft)
        }
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(10.dp))
                .background(Sage)
                .padding(horizontal = 8.dp, vertical = 4.dp)
        ) {
            Text(stringResource(R.string.waiting_ready), style = MaterialTheme.typography.labelMedium, color = palette.paper)
        }
    }
}

@Composable
private fun EmptyPlayerRow() {
    val palette = LocalConfetti.current
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .border(1.dp, palette.hairlineStrong, CircleShape)
        )
        Spacer(Modifier.width(10.dp))
        Text(
            stringResource(R.string.waiting_empty_slot),
            style = MaterialTheme.typography.bodyMedium,
            color = palette.inkSoft,
            fontStyle = FontStyle.Italic
        )
    }
}

@Composable
private fun RoundChip(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val palette = LocalConfetti.current
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(if (selected) palette.ink else palette.paper)
            .border(1.dp, palette.ink, RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = if (selected) palette.paper else palette.ink,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.fillMaxWidth(),
            textAlign = TextAlign.Center
        )
    }
}
