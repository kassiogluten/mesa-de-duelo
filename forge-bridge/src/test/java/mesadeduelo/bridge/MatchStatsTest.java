package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.List;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.combat.Combat;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

public class MatchStatsTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static MatchStats stats(Game game) { MatchStats s = new MatchStats(); s.attach(game); return s; }
    private static Card add(Game game, String name, Player owner, ZoneType zone) { return TestGames.add(game, name, owner, zone); }

    /** Conjura {@code name} da mão de {@code who} com os alvos dados (sem pagar). */
    private static SpellAbility cast(Game game, Player who, String name, Object... targets) {
        SpellAbility sa = add(game, name, who, ZoneType.Hand).getFirstSpellAbility();
        sa.setActivatingPlayer(who);
        for (Object t : targets) {
            if (t instanceof Card c) sa.getTargets().add(c);
            else if (t instanceof Player p) sa.getTargets().add(p);
            else if (t instanceof SpellAbility s) sa.getTargets().add(s);
        }
        game.getStack().add(sa);
        return sa;
    }

    private static JsonObject over(MatchStats s, Game game) {
        JsonObject state = new JsonObject();
        state.addProperty("gameOver", true);
        JsonArray players = new JsonArray();
        for (Player p : game.getRegisteredPlayers()) { JsonObject o = new JsonObject(); o.addProperty("id", p.getId()); players.add(o); }
        state.add("players", players);
        s.addStats(state);
        return state.getAsJsonObject("stats");
    }
    private static int n(JsonObject stats, Player p, String key) {
        JsonObject o = stats.getAsJsonObject(String.valueOf(p.getId()));
        return o.has(key) ? o.get(key).getAsInt() : 0;
    }

    @Test public void burnOnACreatureIsARemovalAndOnThePlayerIsDamage() {
        Game game = TestGames.empty(); Player a = game.getPlayers().get(0), b = game.getPlayers().get(1);
        Card bears = add(game, "Grizzly Bears", b, ZoneType.Battlefield);
        MatchStats s = stats(game);
        cast(game, a, "Lightning Bolt", bears); game.getStack().resolveStack(); game.getAction().checkStateEffects(true);
        cast(game, a, "Lightning Bolt", b); game.getStack().resolveStack();
        JsonObject st = over(s, game);
        assertEquals(1, n(st, a, "removals"));
        assertEquals(1, n(st, b, "creaturesLost"));
        assertEquals(2, n(st, a, "spells"));
        assertEquals(3, n(st, a, "damage")); assertEquals(0, n(st, a, "combatDamage"));
        assertEquals(3, n(st, b, "damageTaken")); assertEquals(3, n(st, a, "biggestTurn"));
        assertEquals(3, st.getAsJsonObject(String.valueOf(a.getId())).getAsJsonObject("damageTo").get(String.valueOf(b.getId())).getAsInt());
        assertEquals(0, n(st, b, "removals"));
    }

    @Test public void counteringASpellCountsForBothSides() {
        Game game = TestGames.empty(); Player a = game.getPlayers().get(0), b = game.getPlayers().get(1);
        MatchStats s = stats(game);
        SpellAbility bears = cast(game, b, "Grizzly Bears");
        cast(game, a, "Cancel", bears);
        game.getStack().resolveStack();
        JsonObject st = over(s, game);
        assertEquals(1, n(st, a, "counters"));
        assertEquals(1, n(st, b, "countered"));
        assertEquals(0, n(st, b, "counters"));
    }

    @Test public void creaturesThatDieInCombatCountForWhoDealtTheDamage() {
        Game game = TestGames.empty(); Player a = game.getPlayers().get(0), b = game.getPlayers().get(1);
        Card mine = add(game, "Hill Giant", a, ZoneType.Battlefield), theirs = add(game, "Grizzly Bears", b, ZoneType.Battlefield);
        Card unblocked = add(game, "Grizzly Bears", a, ZoneType.Battlefield);
        MatchStats s = stats(game);
        game.getPhaseHandler().devModeSet(PhaseType.COMBAT_DAMAGE, a);
        Combat combat = new Combat(a); game.getPhaseHandler().setCombat(combat);
        combat.addAttacker(mine, b); combat.addAttacker(unblocked, b); combat.addBlocker(mine, theirs);
        for (Card attacker : combat.getAttackers()) combat.setBlocked(attacker, !combat.getBlockers(attacker).isEmpty());
        combat.orderBlockersForDamageAssignment();
        combat.assignCombatDamage(false); combat.dealAssignedDamage();
        game.getAction().checkStateEffects(true);
        JsonObject st = over(s, game);
        assertEquals(1, n(st, a, "kills")); assertEquals(1, n(st, b, "creaturesLost"));
        assertEquals(0, n(st, a, "creaturesLost")); assertEquals(0, n(st, a, "removals"));
        assertEquals(2, n(st, a, "damage")); assertEquals(2, n(st, a, "combatDamage"));
    }

    @Test public void undoBringsTheNumbersBack() {
        Game game = TestGames.empty(); Player a = game.getPlayers().get(0), b = game.getPlayers().get(1);
        MatchStats s = stats(game);
        Object kept = s.copy();
        cast(game, a, "Lightning Bolt", b); game.getStack().resolveStack();
        assertEquals(3, n(over(s, game), a, "damage"));
        s.restore(kept);
        assertEquals(0, n(over(s, game), a, "damage"));
        assertEquals(0, n(over(s, game), b, "damageTaken"));
    }

    @Test public void theSeriesAddsTheGamesAndPutsTheDamageInThePlayersOrder() {
        Game game = TestGames.empty(); Player a = game.getPlayers().get(0), b = game.getPlayers().get(1);
        MatchStats s = stats(game);
        cast(game, a, "Lightning Bolt", b); game.getStack().resolveStack();
        s.gameEnded(game);
        // O segundo jogo da série: os mesmos jogadores inscritos, com ids novos.
        Game second = game.getMatch().createGame(); second.setNoGUIUser();
        second.getPhaseHandler().devModeSet(PhaseType.MAIN1, second.getPlayers().get(0));
        s.attach(second);
        Player a2 = second.getPlayers().get(0), b2 = second.getPlayers().get(1);
        cast(second, a2, "Lightning Bolt", b2); second.getStack().resolveStack();
        var order = List.of(a.getRegisteredPlayer(), b.getRegisteredPlayer());
        JsonObject finished = s.seriesJson(a.getRegisteredPlayer(), order, null);
        assertEquals(3, finished.get("damage").getAsInt());
        assertEquals(0, finished.getAsJsonArray("damageTo").get(0).getAsInt());
        assertEquals(3, finished.getAsJsonArray("damageTo").get(1).getAsInt());
        // A série que acabou antes da hora conta o jogo em andamento.
        JsonObject conceded = s.seriesJson(a.getRegisteredPlayer(), order, second);
        assertEquals(6, conceded.get("damage").getAsInt());
        assertEquals(6, conceded.getAsJsonArray("damageTo").get(1).getAsInt());
        JsonObject other = s.seriesJson(b.getRegisteredPlayer(), order, null);
        assertFalse(other.has("damage")); assertEquals(3, other.get("damageTaken").getAsInt());
    }

    @Test public void theResultStillHasTheNumbersAfterTheGameEnds() {
        Game game = TestGames.empty(); Player a = game.getPlayers().get(0), b = game.getPlayers().get(1);
        MatchStats s = stats(game);
        cast(game, a, "Lightning Bolt", b); game.getStack().resolveStack();
        // A sessão fecha o jogo (e soma à série) antes de montar o estado do resultado.
        s.gameEnded(game);
        assertEquals(3, n(over(s, game), a, "damage"));
        assertEquals(3, n(over(s, game), b, "damageTaken"));
        // Fechar de novo, ou a série abandonada logo depois, não conta o mesmo jogo duas vezes.
        s.gameEnded(game);
        var order = List.of(a.getRegisteredPlayer(), b.getRegisteredPlayer());
        assertEquals(3, s.seriesJson(a.getRegisteredPlayer(), order, game).get("damage").getAsInt());
        // O que acontece depois do fim não muda os números do jogo que acabou.
        cast(game, a, "Lightning Bolt", b); game.getStack().resolveStack();
        assertEquals(3, n(over(s, game), a, "damage"));
        // O próximo jogo começa do zero.
        Game next = TestGames.empty(); s.attach(next);
        assertEquals(0, n(over(s, next), next.getPlayers().get(0), "damage"));
    }

    @Test public void duringTheGameTheStateHasNoNumbers() {
        Game game = TestGames.empty();
        MatchStats s = stats(game);
        JsonObject state = new JsonObject(); state.addProperty("gameOver", false); state.add("players", new JsonArray());
        s.addStats(state);
        assertFalse(state.has("stats"));
    }
}
