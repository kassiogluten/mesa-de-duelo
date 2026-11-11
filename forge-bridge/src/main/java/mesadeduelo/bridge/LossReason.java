// O motivo de um jogador ter perdido, como a mesa recebe: o GameLossReason do Forge e a carta que causou a derrota.
package mesadeduelo.bridge;

import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.player.GameLossReason;
import forge.game.player.Player;
import forge.game.player.PlayerOutcome;

final class LossReason {
    private LossReason() {}

    /** Acrescenta lossReason (LifeReachedZero, CommanderDamage, Poisoned, Milled, SpellEffect, OpponentWon, Conceded...) e lossCard. */
    static void add(JsonObject o, Player player, Game game) {
        PlayerOutcome outcome = player.getOutcome();
        if (outcome == null || outcome.lossState == null) return;
        o.addProperty("lossReason", outcome.lossState.name());
        if (outcome.loseConditionSpell != null && !outcome.loseConditionSpell.isBlank()) o.addProperty("lossCard", outcome.loseConditionSpell);
        else if (outcome.lossState == GameLossReason.OpponentWon && game != null) {
            for (Player other : game.getRegisteredPlayers()) {
                PlayerOutcome won = other.getOutcome();
                if (won != null && won.hasWon()) {
                    o.addProperty("lossWinner", other.getName());
                    if (won.altWinSourceName != null) o.addProperty("lossCard", won.altWinSourceName);
                }
            }
        }
    }
}
