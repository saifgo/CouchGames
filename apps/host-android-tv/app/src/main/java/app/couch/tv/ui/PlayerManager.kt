package app.couch.tv.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.Text
import app.couch.tv.net.PlayerView
import app.couch.tv.net.SessionView
import app.couch.tv.protocol.PLAYER_COLORS

/**
 * Move or remove players. A phone that leaves keeps its slot for 5 minutes (so a locked phone
 * gets its slot back), which leaves a hole: if P1 leaves, most games stop answering. From here
 * the TV can swap any two slots, remove one player, or remove everyone away and move the rest up.
 * Used by the in-game Controllers page and the home screen's Players dialog.
 */
@Composable
fun PlayerManager(
    view: SessionView,
    maxPlayers: Int,
    onSwap: (Int, Int) -> Unit,
    onRemove: (Int) -> Unit,
    onTidy: () -> Int,
) {
    var picked by remember { mutableStateOf<Int?>(null) }
    var note by remember { mutableStateOf<String?>(null) }
    val first = remember { FocusRequester() }
    val players = view.players
    val pick = picked?.let { s -> players.firstOrNull { it.slot == s } }
    // The picked player was removed meanwhile (left, timed out): back to the list.
    LaunchedEffect(picked, pick == null) { if (picked != null && pick == null) picked = null }
    BackHandler(enabled = picked != null) { picked = null }

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (pick == null) {
            Text(note ?: "Choose a player to swap or remove.", color = Muted, fontSize = 15.sp)
            var focusGiven = false
            for (i in 0 until maxPlayers) {
                val p = players.firstOrNull { it.slot == i }
                val takeFocus = p != null && !focusGiven
                if (takeFocus) focusGiven = true
                ManagerButton(focus = if (takeFocus) first else null, enabled = p != null, onClick = { note = null; picked = i }) {
                    SlotRow(i, p)
                }
            }
            val away = players.count { !it.connected }
            val gaps = players.any { it.slot >= players.size }
            ManagerButton(focus = if (!focusGiven) first else null, onClick = {
                note = if (away == 0 && !gaps) "Players are already in order." else {
                    val removed = onTidy()
                    if (removed > 0) "Removed $removed away player${if (removed > 1) "s" else ""} and moved everyone up." else "Moved everyone up."
                }
            }) {
                Text(
                    if (away > 0) "Remove $away away player${if (away > 1) "s" else ""} and move everyone up" else "Move everyone up (fill empty slots)",
                    fontSize = 17.sp,
                )
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(30.dp).clip(CircleShape).background(hexColor(pick.color)), contentAlignment = Alignment.Center) { DeviceIcon(pick, 18.dp) }
                Text(
                    "P${pick.slot + 1} · ${pick.name}" + if (pick.connected) "" else "  (away)",
                    fontSize = 20.sp, fontWeight = FontWeight.Bold,
                )
            }
            var focusGiven = false
            for (i in 0 until maxPlayers) {
                if (i == pick.slot) continue
                val other = players.firstOrNull { it.slot == i }
                val takeFocus = !focusGiven
                focusGiven = true
                ManagerButton(focus = if (takeFocus) first else null, onClick = { onSwap(pick.slot, i); picked = null }) {
                    Text(if (other != null) "⇄  Swap with P${i + 1} · ${other.name}" else "→  Move to P${i + 1} (empty)", fontSize = 17.sp)
                }
            }
            ManagerButton(focus = if (!focusGiven) first else null, onClick = { onRemove(pick.slot); picked = null }) {
                Text("✕  Remove ${pick.name} from the game", fontSize = 17.sp, color = Bad)
            }
            ManagerButton(onClick = { picked = null }) { Text("Cancel", fontSize = 17.sp) }
        }
    }
    LaunchedEffect(picked) { runCatching { first.requestFocus() } }
}

@Composable
private fun SlotRow(slot: Int, p: PlayerView?) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        val c = hexColor(p?.color ?: PLAYER_COLORS[slot % PLAYER_COLORS.size])
        if (p != null) {
            Box(Modifier.size(26.dp).clip(CircleShape).background(c), contentAlignment = Alignment.Center) { DeviceIcon(p, 16.dp) }
        } else {
            Box(Modifier.size(26.dp), contentAlignment = Alignment.Center) { Dot(c.copy(alpha = .35f)) }
        }
        Text("P${slot + 1}", fontSize = 17.sp, fontWeight = FontWeight.Bold)
        Text(
            when {
                p == null -> "empty"
                !p.connected -> "${p.name}  ·  away (${if (p.local) "controller off" else "phone left"})"
                else -> p.name
            },
            fontSize = 17.sp,
        )
    }
}

@Composable
private fun Dot(c: Color) = Box(Modifier.size(12.dp).clip(CircleShape).background(c))

@Composable
private fun ManagerButton(
    focus: FocusRequester? = null,
    enabled: Boolean = true,
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().then(if (focus != null) Modifier.focusRequester(focus) else Modifier),
        shape = ButtonDefaults.shape(RoundedCornerShape(12.dp)),
    ) { content() }
}

/** Full-screen dialog around [PlayerManager] for the home screen. */
@Composable
fun PlayersDialog(
    view: SessionView,
    maxPlayers: Int,
    onSwap: (Int, Int) -> Unit,
    onRemove: (Int) -> Unit,
    onTidy: () -> Int,
    onClose: () -> Unit,
) {
    BackHandler { onClose() }
    Box(Modifier.fillMaxSize().background(Color(0xD904060A)), contentAlignment = Alignment.Center) {
        Column(
            Modifier.width(560.dp).clip(RoundedCornerShape(24.dp)).background(Panel).padding(26.dp)
                // Keep the remote's focus inside the dialog (the home screen is still behind it).
                .focusProperties { onExit = { cancelFocusChange() } }
                .focusGroup()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Players", fontSize = 28.sp, fontWeight = FontWeight.Bold)
            PlayerManager(view, maxPlayers, onSwap, onRemove, onTidy)
            ManagerButton(onClick = onClose) { Text("Close", fontSize = 17.sp) }
        }
    }
}
