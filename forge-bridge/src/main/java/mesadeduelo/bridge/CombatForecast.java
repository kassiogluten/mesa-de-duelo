package mesadeduelo.bridge;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.ai.ComputerUtilCombat;
import forge.game.Game;
import forge.game.GameEntity;
import forge.game.GameType;
import forge.game.card.Card;
import forge.game.card.CounterEnumType;
import forge.game.combat.Combat;
import forge.game.keyword.Keyword;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.staticability.StaticAbilityAssignCombatDamageAsUnblocked;

/**
 * Previsão do combate enquanto os bloqueadores são declarados: a vida, o veneno, o dano de comandante e a lealdade
 * dos planeswalkers de cada jogador atacado depois do dano, com os bloqueios marcados até agora. A conta é a do
 * Forge (prevenção, proteção, golpe duplo, atropelar sobre o letal do bloqueador, infectar); a mesa só mostra.
 */
final class CombatForecast {
    private CombatForecast() { }

    static final int POISON_LIMIT = 10, COMMANDER_LIMIT = 21;

    static void add(JsonObject o, Game game) {
        JsonArray rows = of(game);
        if (rows != null) o.add("forecast", rows);
    }

    static JsonArray of(Game game) {
        if (game == null || game.getPhaseHandler() == null || game.getPhaseHandler().getPhase() != PhaseType.COMBAT_DECLARE_BLOCKERS) return null;
        Combat combat = game.getCombat();
        if (combat == null || combat.getAttackers().isEmpty()) return null;
        // Oathbreaker, Brawl e Tiny Leaders também têm comandante, mas sem o limite de 21.
        boolean commanderRule = game.getRules().hasAppliedVariant(GameType.Commander);
        JsonArray rows = new JsonArray();
        for (Player defender : combat.getDefendingPlayers()) {
            List<Card> attackers = combat.getAttackersOf(defender);
            JsonArray walkers = new JsonArray();
            for (Card walker : combat.getDefendingPlaneswalkers()) {
                if (!defender.equals(walker.getController()) || combat.getAttackersOf(walker).isEmpty()) continue;
                int damage = 0;
                for (Card attacker : combat.getAttackersOf(walker)) damage += hit(combat, attacker, walker)[0];
                JsonObject w = new JsonObject(); w.addProperty("id", walker.getId());
                w.addProperty("loyalty", walker.getCurrentLoyalty());
                w.addProperty("after", Math.max(0, walker.getCurrentLoyalty() - damage)); walkers.add(w);
            }
            if (attackers.isEmpty() && walkers.isEmpty()) continue;

            int damage = 0, poison = 0;
            Map<Card, Integer> commanders = new LinkedHashMap<>();
            for (Card attacker : attackers) {
                int[] dealt = hit(combat, attacker, defender);
                damage += dealt[0]; poison += dealt[1];
                if (attacker.isCommander() && dealt[2] > 0) commanders.merge(attacker.getRealCommander(), dealt[2], Integer::sum);
            }
            JsonObject row = new JsonObject();
            row.addProperty("player", defender.getId());
            int life = defender.getLife(), lifeAfter = life - damage;
            row.addProperty("life", life); row.addProperty("lifeAfter", lifeAfter);
            int poisonNow = defender.getPoisonCounters();
            if (poison > 0 || poisonNow > 0) { row.addProperty("poison", poisonNow); row.addProperty("poisonAfter", poisonNow + poison); }
            JsonArray commanderRows = new JsonArray();
            int worstCommander = 0;
            if (commanderRule) for (var entry : commanders.entrySet()) {
                int now = defender.getCommanderDamage(entry.getKey()), after = now + entry.getValue();
                JsonObject c = new JsonObject(); c.addProperty("commanderId", entry.getKey().getId());
                c.addProperty("damage", now); c.addProperty("after", after); commanderRows.add(c);
                worstCommander = Math.max(worstCommander, after);
            }
            if (!commanderRows.isEmpty()) row.add("commander", commanderRows);
            if (!walkers.isEmpty()) row.add("planeswalkers", walkers);
            String lethal = defender.cantLose() ? null
                : damage > 0 && lifeAfter <= 0 && !defender.cantLoseForZeroOrLessLife() ? "life"
                : poison > 0 && poisonNow + poison >= POISON_LIMIT ? "poison"
                : worstCommander >= COMMANDER_LIMIT ? "commander" : null;
            if (lethal != null) row.addProperty("lethal", lethal);
            rows.add(row);
        }
        return rows.isEmpty() ? null : rows;
    }

    /** Dano de um atacante no alvo: {vida perdida (ou lealdade), veneno, dano de combate causado ao jogador}. */
    static int[] hit(Combat combat, Card attacker, GameEntity target) {
        List<Card> blockers = combat.getBlockers(attacker);
        boolean unblocked = blockers.isEmpty() || StaticAbilityAssignCombatDamageAsUnblocked.assignCombatDamageAsUnblocked(attacker);
        int through;
        if (unblocked) {
            if (target instanceof Player player) {
                int life = ComputerUtilCombat.damageIfUnblocked(attacker, player, combat, false);
                int poison = ComputerUtilCombat.poisonIfUnblocked(attacker, player);
                return new int[]{life, poison, attacker.isInfectDamage(player) ? poison : life};
            }
            through = ComputerUtilCombat.getAttack(attacker) + ComputerUtilCombat.predictPowerBonusOfAttacker(attacker, null, combat, false);
        } else {
            // Atropelar: o que sobra depois do letal de cada bloqueador vai para o defensor.
            if (!attacker.hasKeyword(Keyword.TRAMPLE)) return new int[3];
            through = ComputerUtilCombat.getAttack(attacker) - ComputerUtilCombat.totalShieldDamage(attacker, blockers);
        }
        if (through <= 0) return new int[3];
        int dealt = ComputerUtilCombat.predictDamageTo(target, through, attacker, true);
        if (!(target instanceof Player player)) return new int[]{dealt, 0, 0};
        int extra = dealt > 0 ? ComputerUtilCombat.predictExtraPoisonWithDamage(attacker, player, dealt) : 0;
        if (attacker.isInfectDamage(player))
            return new int[]{0, player.canReceiveCounters(CounterEnumType.POISON) ? dealt + extra : 0, dealt};
        return new int[]{player.canLoseLife() ? dealt : 0, extra, dealt};
    }
}
