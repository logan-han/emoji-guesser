package com.emojiguesser.ui.screens

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.emojiguesser.R
import com.emojiguesser.data.Game
import com.emojiguesser.network.ConnectionState
import com.emojiguesser.ui.components.Avatar
import com.emojiguesser.ui.components.BrandMark
import com.emojiguesser.ui.components.ConnectionPill
import com.emojiguesser.ui.components.PresetChipsRow
import com.emojiguesser.ui.components.StampButton
import com.emojiguesser.ui.components.StampButtonStyle
import com.emojiguesser.ui.components.StampCard
import com.emojiguesser.ui.theme.LocalConfetti
import com.emojiguesser.ui.theme.MonoFamily
import com.emojiguesser.ui.theme.Sage
import com.emojiguesser.ui.theme.Tomato
import kotlinx.coroutines.delay

@Composable
fun LobbyScreen(
    playerName: String,
    publicGames: List<Game>,
    deepLinkGameId: String?,
    connectionState: ConnectionState,
    onPlayerNameChange: (String) -> Unit,
    onCreateGame: (Int, Int, Boolean) -> Unit,
    onJoinGame: (String) -> Unit,
    onListPublicGames: () -> Unit
) {
    val palette = LocalConfetti.current
    var joinGameId by remember { mutableStateOf(deepLinkGameId ?: "") }
    var isPublicGame by remember { mutableStateOf(true) }
    var timeLimit by remember { mutableIntStateOf(120) }
    var maxRounds by remember { mutableIntStateOf(2) }

    LaunchedEffect(Unit) {
        while (true) {
            onListPublicGames()
            delay(5_000)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp, vertical = 10.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            BrandMark()
            ConnectionPill(state = connectionState)
        }

        Spacer(Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.lobby_description),
            style = MaterialTheme.typography.bodyMedium,
            color = palette.inkSoft
        )

        Spacer(Modifier.height(12.dp))

        StampCard(modifier = Modifier.fillMaxWidth(), contentPadding = 14.dp) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stringResource(R.string.lobby_your_name), style = MaterialTheme.typography.labelMedium, color = palette.inkSoft)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Avatar(playerName.ifBlank { stringResource(R.string.lobby_name_hint) }, size = 36.dp)
                    Spacer(Modifier.width(10.dp))
                    OutlinedTextField(
                        value = playerName,
                        onValueChange = { if (it.length <= 20) onPlayerNameChange(it) },
                        modifier = Modifier.weight(1f),
                        placeholder = { Text(stringResource(R.string.lobby_name_hint)) },
                        singleLine = true,
                        textStyle = MaterialTheme.typography.displaySmall.copy(color = palette.ink),
                        trailingIcon = { Icon(Icons.Default.Edit, contentDescription = stringResource(R.string.lobby_edit_name), tint = palette.inkSoft) },
                        shape = RoundedCornerShape(10.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = palette.hairlineStrong,
                            unfocusedBorderColor = palette.hairline,
                            focusedContainerColor = palette.bg,
                            unfocusedContainerColor = palette.bg
                        )
                    )
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        StampCard(modifier = Modifier.fillMaxWidth(), contentPadding = 14.dp) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(stringResource(R.string.lobby_create_title), style = MaterialTheme.typography.headlineLarge, color = palette.ink)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(stringResource(R.string.lobby_public_game), style = MaterialTheme.typography.titleLarge, color = palette.ink)
                        Text(stringResource(R.string.lobby_public_desc), style = MaterialTheme.typography.bodyMedium, color = palette.inkSoft)
                    }
                    StampToggle(checked = isPublicGame, onCheckedChange = { isPublicGame = it })
                }
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.lobby_round_time), style = MaterialTheme.typography.labelMedium, color = palette.inkSoft)
                    PresetChipsRow(selectedSeconds = timeLimit, onSelected = { timeLimit = it })
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    (2..5).forEach { rounds ->
                        SmallChip(
                            label = rounds.toString(),
                            selected = maxRounds == rounds,
                            onClick = { maxRounds = rounds },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
                StampButton(
                    onClick = { onCreateGame(timeLimit, maxRounds, isPublicGame) },
                    enabled = playerName.isNotBlank(),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(stringResource(R.string.lobby_create_game))
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        StampCard(modifier = Modifier.fillMaxWidth(), contentPadding = 14.dp) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        stringResource(R.string.lobby_join_by_code),
                        style = MaterialTheme.typography.headlineLarge,
                        color = palette.ink,
                        modifier = Modifier.weight(1f)
                    )
                    PublicGamesBadge(count = publicGames.size)
                }
                OutlinedTextField(
                    value = joinGameId,
                    onValueChange = { joinGameId = it.uppercase().take(6) },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text(stringResource(R.string.lobby_code_placeholder), textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) },
                    singleLine = true,
                    textStyle = LocalTextStyle.current.copy(
                        letterSpacing = 6.sp,
                        fontSize = 22.sp,
                        fontFamily = MonoFamily,
                        textAlign = TextAlign.Center
                    ),
                    shape = RoundedCornerShape(10.dp),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Go),
                    keyboardActions = KeyboardActions(onGo = {
                        if (joinGameId.isNotBlank() && playerName.isNotBlank()) onJoinGame(joinGameId)
                    }),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = palette.ink,
                        unfocusedBorderColor = palette.hairlineStrong,
                        focusedContainerColor = palette.bg,
                        unfocusedContainerColor = palette.bg
                    )
                )
                StampButton(
                    onClick = { onJoinGame(joinGameId) },
                    enabled = joinGameId.isNotBlank() && playerName.isNotBlank(),
                    style = StampButtonStyle.Secondary,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(stringResource(R.string.lobby_join_game))
                }
            }
        }

        if (publicGames.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                publicGames.take(3).forEach { game ->
                    PublicGameRow(
                        game = game,
                        enabled = playerName.isNotBlank(),
                        onClick = { onJoinGame(game.gameId) }
                    )
                }
            }
        }

        Spacer(Modifier.height(12.dp))
    }
}

@Composable
private fun StampToggle(checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    val palette = LocalConfetti.current
    val knobOffset by animateDpAsState(if (checked) 20.dp else 2.dp, label = "toggle")
    Box(
        modifier = Modifier
            .size(width = 44.dp, height = 24.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (checked) Sage else palette.bg2)
            .clickable { onCheckedChange(!checked) }
            .padding(2.dp)
    ) {
        Box(
            modifier = Modifier
                .padding(start = knobOffset)
                .size(20.dp)
                .clip(CircleShape)
                .background(palette.paper)
        )
    }
}

@Composable
private fun PublicGamesBadge(count: Int) {
    val palette = LocalConfetti.current
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(Tomato)
            .padding(horizontal = 8.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text(stringResource(R.string.lobby_public_games_cta), style = MaterialTheme.typography.labelMedium, color = palette.paper)
        Text(count.toString(), style = MaterialTheme.typography.labelMedium, color = palette.paper)
    }
}

@Composable
private fun SmallChip(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val palette = LocalConfetti.current
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(if (selected) palette.ink else palette.paper)
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = if (selected) palette.paper else palette.ink, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun PublicGameRow(game: Game, enabled: Boolean, onClick: () -> Unit) {
    val palette = LocalConfetti.current
    val isPlaying = game.gameState == "IN_PROGRESS"
    val ownerName = game.players.firstOrNull { it.connectionId == game.ownerId }?.name
        ?: game.players.firstOrNull()?.name
        ?: stringResource(R.string.waiting_host)

    StampCard(modifier = Modifier.fillMaxWidth(), contentPadding = 12.dp, stampOffset = 3.dp) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(enabled = enabled, onClick = onClick),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Avatar(ownerName, size = 40.dp)
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text("$ownerName's game", style = MaterialTheme.typography.titleMedium, color = palette.ink, fontWeight = FontWeight.SemiBold)
                Text(game.gameId, style = MaterialTheme.typography.bodyMedium.copy(fontFamily = MonoFamily, letterSpacing = 2.sp), color = palette.inkSoft)
            }
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (isPlaying) Tomato else Sage)
                    .padding(horizontal = 8.dp, vertical = 4.dp)
            ) {
                Text("${game.players.size} · ${game.timeLimit}s", style = MaterialTheme.typography.labelMedium, color = palette.paper)
            }
        }
    }
}
