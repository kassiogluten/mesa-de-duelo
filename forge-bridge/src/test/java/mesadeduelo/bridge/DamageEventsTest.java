package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.List;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.combat.Combat;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

public class DamageEventsTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static Card add(Game game, String name, Player player) { return ExilePermissionsTest.add(game, name, player, ZoneType.Battlefield); }
    private static List<JsonObject> damage(VisibleEvents events) {
        return events.json(0).asList().stream().map(e -> e.getAsJsonObject()).filter(e -> "damage".equals(e.get("type").getAsString())).toList();
    }
    private static boolean flag(JsonObject e, String key) { return e.has(key) && e.get(key).getAsBoolean(); }
    private static int target(JsonObject e, String kind) { return e.getAsJsonObject("targets").getAsJsonArray(kind).get(0).getAsInt(); }

    private static VisibleEvents fight(Game game, Player attacker, PhaseType step) {
        VisibleEvents events = new VisibleEvents(() -> {}, () -> 1); events.attach(game);
        game.getPhaseHandler().devModeSet(step, attacker);
        return events;
    }
    private static void strike(Game game, Combat combat, boolean firstStrike) {
        for (Card attacker : combat.getAttackers()) combat.setBlocked(attacker, !combat.getBlockers(attacker).isEmpty());
        combat.orderBlockersForDamageAssignment();
        combat.assignCombatDamage(firstStrike); combat.dealAssignedDamage();
    }

    private static Combat combat(Game game, Player a, Player b, Card unblocked, Card blocked, Card blocker) {
        Combat combat = new Combat(a); game.getPhaseHandler().setCombat(combat);
        combat.addAttacker(unblocked, b); combat.addAttacker(blocked, b); combat.addBlocker(blocked, blocker);
        return combat;
    }

    @Test public void directDamageIsNotCombatAndMarksLethal() {
        Game game = ExilePermissionsTest.game(); Player a = game.getPlayers().get(0), b = game.getPlayers().get(1);
        Card bears = add(game, "Grizzly Bears", b);
        VisibleEvents events = new VisibleEvents(() -> {}, () -> 1); events.attach(game);
        var bolt = ExilePermissionsTest.add(game, "Lightning Bolt", a, ZoneType.Hand).getFirstSpellAbility();
        bolt.setActivatingPlayer(a); bolt.getTargets().add(bears); game.getStack().add(bolt); game.getStack().resolveStack();
        JsonObject hit = damage(events).get(0);
        assertFalse(flag(hit, "combat")); assertFalse(hit.has("step"));
        assertTrue(flag(hit, "lethal")); assertEquals(-3, hit.get("delta").getAsInt());
        assertEquals(bears.getId(), target(hit, "cards")); assertEquals("Lightning Bolt", hit.getAsJsonObject("card").get("name").getAsString());
    }

    @Test public void trampleSplitsBetweenBlockerAndPlayer() {
        Game game = ExilePermissionsTest.game(); Player a = game.getPlayers().get(0), b = game.getPlayers().get(1);
        Card wurm = add(game, "Colossal Dreadmaw", a), bears = add(game, "Grizzly Bears", b);
        VisibleEvents events = fight(game, a, PhaseType.COMBAT_DAMAGE);
        Combat combat = new Combat(a); game.getPhaseHandler().setCombat(combat);
        combat.addAttacker(wurm, b); combat.addBlocker(wurm, bears);
        strike(game, combat, false);
        var hits = damage(events);
        JsonObject blocker = hits.stream().filter(e -> e.getAsJsonObject("targets").getAsJsonArray("cards").size() > 0 && target(e, "cards") == bears.getId()).findFirst().orElseThrow();
        JsonObject player = hits.stream().filter(e -> e.getAsJsonObject("targets").getAsJsonArray("players").size() > 0).findFirst().orElseThrow();
        assertTrue(flag(blocker, "combat")); assertEquals("regular", blocker.get("step").getAsString()); assertTrue(flag(blocker, "lethal"));
        assertFalse(flag(blocker, "trample"));
        assertTrue(flag(player, "combat")); assertTrue(flag(player, "trample")); assertEquals(b.getId(), target(player, "players"));
        assertEquals(6, -blocker.get("delta").getAsInt() - player.get("delta").getAsInt());
    }

    @Test public void doubleStrikeHitsInBothStepsAndLifelinkDeathtouchAreFlagged() {
        Game game = ExilePermissionsTest.game(); Player a = game.getPlayers().get(0), b = game.getPlayers().get(1);
        Card ace = add(game, "Fencing Ace", a), hawk = add(game, "Vampire Nighthawk", a), bears = add(game, "Grizzly Bears", b);
        VisibleEvents events = fight(game, a, PhaseType.COMBAT_FIRST_STRIKE_DAMAGE);
        // Trocar de etapa no modo de teste limpa o combate: a etapa normal monta o mesmo combate de novo.
        strike(game, combat(game, a, b, ace, hawk, bears), true);
        game.getPhaseHandler().devModeSet(PhaseType.COMBAT_DAMAGE, a);
        strike(game, combat(game, a, b, ace, hawk, bears), false);
        var hits = damage(events);
        var aceHits = hits.stream().filter(e -> e.get("sourceId").getAsInt() == ace.getId()).toList();
        assertEquals(2, aceHits.size());
        assertEquals("first-strike", aceHits.get(0).get("step").getAsString()); assertEquals("regular", aceHits.get(1).get("step").getAsString());
        assertTrue(flag(aceHits.get(0), "doubleStrike"));
        JsonObject bite = hits.stream().filter(e -> e.get("sourceId").getAsInt() == hawk.getId()).findFirst().orElseThrow();
        assertTrue(flag(bite, "deathtouch")); assertTrue(flag(bite, "lifelink")); assertTrue(flag(bite, "lethal"));
        assertTrue(events.json(0).asList().stream().map(e -> e.getAsJsonObject())
            .anyMatch(e -> "life-changed".equals(e.get("type").getAsString()) && e.get("actor").getAsInt() == a.getId() && e.get("delta").getAsInt() == 2));
    }
}
