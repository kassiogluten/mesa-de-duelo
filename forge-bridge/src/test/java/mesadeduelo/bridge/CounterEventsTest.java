package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.List;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.card.CounterEnumType;
import forge.game.combat.Combat;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

public class CounterEventsTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static List<JsonObject> events(VisibleEvents events) {
        return events.json(0).asList().stream().map(e -> e.getAsJsonObject()).toList();
    }
    private static List<JsonObject> counters(VisibleEvents events) {
        return events(events).stream().filter(e -> "counters".equals(e.get("type").getAsString())).toList();
    }

    @Test public void counterPutBySpellNamesTypeAmountAndTheResolvingSpell() {
        Game game = ExilePermissionsTest.game(); Player a = game.getPlayers().get(0);
        Card bears = ExilePermissionsTest.add(game, "Grizzly Bears", a, ZoneType.Battlefield);
        VisibleEvents events = new VisibleEvents(() -> {}, () -> 1); events.attach(game);
        var growth = ExilePermissionsTest.add(game, "Battlegrowth", a, ZoneType.Hand).getFirstSpellAbility();
        growth.setActivatingPlayer(a); growth.getTargets().add(bears); game.getStack().add(growth); game.getStack().resolveStack();
        var all = events(events);
        JsonObject counter = counters(events).get(0);
        assertEquals("P1P1", counter.get("counter").getAsString());
        assertEquals(1, counter.get("delta").getAsInt());
        assertEquals(bears.getId(), counter.get("sourceId").getAsInt());
        assertEquals(a.getId(), counter.get("actor").getAsInt());
        assertFalse(counter.has("entering"));
        JsonObject resolved = all.stream().filter(e -> "resolved".equals(e.get("type").getAsString())).findFirst().orElseThrow();
        assertEquals(resolved.get("stackId").getAsInt(), counter.get("stackId").getAsInt());
        assertTrue(counter.get("seq").getAsLong() < resolved.get("seq").getAsLong());
    }

    @Test public void removingCountersIsSilent() {
        Game game = ExilePermissionsTest.game(); Player a = game.getPlayers().get(0);
        Card jace = ExilePermissionsTest.add(game, "Jace Beleren", a, ZoneType.Battlefield);
        jace.setCounters(CounterEnumType.LOYALTY, 3);
        VisibleEvents events = new VisibleEvents(() -> {}, () -> 1); events.attach(game);
        jace.subtractCounter(CounterEnumType.LOYALTY, 1, a);
        assertTrue(counters(events).isEmpty());
    }

    @Test public void countersAPermanentEntersWithMakeNoSoundOfTheirOwn() {
        Game game = ExilePermissionsTest.game(); Player a = game.getPlayers().get(0);
        VisibleEvents events = new VisibleEvents(() -> {}, () -> 1); events.attach(game);
        Card jace = ExilePermissionsTest.add(game, "Jace Beleren", a, ZoneType.Hand);
        var spell = jace.getSpells().stream().filter(sa -> sa.isSpell()).findFirst().orElseThrow();
        spell.setActivatingPlayer(a); game.getStack().add(spell); game.getStack().resolveStack();
        assertTrue(events(events).stream().anyMatch(e -> "entered".equals(e.get("type").getAsString())));
        assertFalse(counters(events).isEmpty());
        assertTrue(counters(events).stream().allMatch(e -> e.has("entering") && e.get("entering").getAsBoolean()));
    }

    @Test public void infectGivesPoisonToThePlayerAsANewAmount() {
        Game game = ExilePermissionsTest.game(); Player a = game.getPlayers().get(0), b = game.getPlayers().get(1);
        b.setCounters(CounterEnumType.POISON, 2, a, false);
        Card stinger = ExilePermissionsTest.add(game, "Plague Stinger", a, ZoneType.Battlefield);
        VisibleEvents events = new VisibleEvents(() -> {}, () -> 1); events.attach(game);
        game.getPhaseHandler().devModeSet(PhaseType.COMBAT_DAMAGE, a);
        Combat combat = new Combat(a); game.getPhaseHandler().setCombat(combat);
        combat.addAttacker(stinger, b); combat.setBlocked(stinger, false);
        combat.assignCombatDamage(false); combat.dealAssignedDamage();
        JsonObject poison = counters(events).stream().filter(e -> "POISON".equals(e.get("counter").getAsString())).findFirst().orElseThrow();
        assertEquals(1, poison.get("delta").getAsInt());
        assertEquals(b.getId(), poison.get("actor").getAsInt());
        assertEquals(b.getId(), poison.getAsJsonObject("targets").getAsJsonArray("players").get(0).getAsInt());
        JsonObject hit = events(events).stream().filter(e -> "damage".equals(e.get("type").getAsString())).findFirst().orElseThrow();
        assertTrue(hit.get("seq").getAsLong() < poison.get("seq").getAsLong());
    }
}
