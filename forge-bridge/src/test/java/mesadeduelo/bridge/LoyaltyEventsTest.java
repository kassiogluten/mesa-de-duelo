package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.List;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.card.CounterEnumType;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

public class LoyaltyEventsTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static List<JsonObject> events(VisibleEvents events) {
        return events.json(0).asList().stream().map(e -> e.getAsJsonObject()).toList();
    }
    private static JsonObject activated(VisibleEvents events) {
        return events(events).stream().filter(e -> "ability-activated".equals(e.get("type").getAsString())).findFirst().orElseThrow();
    }
    /** Jace Beleren no campo com 3 de lealdade e a habilidade dele com o custo pedido ("+2", "-1", "-10"). */
    private static SpellAbility jace(Game game, Player a, String cost) {
        Card jace = ExilePermissionsTest.add(game, "Jace Beleren", a, ZoneType.Battlefield);
        jace.setCounters(CounterEnumType.LOYALTY, 3);
        SpellAbility sa = jace.getSpellAbilities().stream().filter(s -> s.isPwAbility() && cost.equals(Loyalty.cost(s))).findFirst().orElseThrow();
        sa.setActivatingPlayer(a);
        if (sa.usesTargeting()) sa.getTargets().add(a);
        return sa;
    }

    @Test public void plusAbilityCarriesItsCostAndThePaidCounterIsMarked() {
        Game game = ExilePermissionsTest.game(); Player a = game.getPlayers().get(0);
        SpellAbility plus = jace(game, a, "+2");
        VisibleEvents events = new VisibleEvents(() -> {}, () -> 1); events.attach(game);
        var paid = new forge.game.GameEntityCounterTable();
        plus.getHostCard().addCounter(CounterEnumType.LOYALTY, 2, a, paid); paid.replaceCounterEffect(game, plus);
        game.getStack().add(plus);
        JsonObject e = activated(events);
        assertTrue(e.get("loyalty").getAsBoolean());
        assertEquals("+2", e.get("cost").getAsString());
        assertFalse(e.has("ultimate"));
        JsonObject counter = events(events).stream().filter(x -> "counters".equals(x.get("type").getAsString())).findFirst().orElseThrow();
        assertTrue(counter.get("paid").getAsBoolean());
    }

    @Test public void minusAbilityCarriesANegativeCost() {
        Game game = ExilePermissionsTest.game(); Player a = game.getPlayers().get(0);
        SpellAbility minus = jace(game, a, "-1");
        VisibleEvents events = new VisibleEvents(() -> {}, () -> 1); events.attach(game);
        game.getStack().add(minus);
        assertEquals("-1", activated(events).get("cost").getAsString());
    }

    @Test public void ultimateIsFlagged() {
        Game game = ExilePermissionsTest.game(); Player a = game.getPlayers().get(0);
        SpellAbility ultimate = jace(game, a, "-10");
        VisibleEvents events = new VisibleEvents(() -> {}, () -> 1); events.attach(game);
        game.getStack().add(ultimate);
        JsonObject e = activated(events);
        assertEquals("-10", e.get("cost").getAsString());
        assertTrue(e.get("ultimate").getAsBoolean());
    }

    @Test public void otherAbilitiesAreNotLoyalty() {
        Game game = ExilePermissionsTest.game(); Player a = game.getPlayers().get(0);
        Card elves = ExilePermissionsTest.add(game, "Llanowar Elves", a, ZoneType.Battlefield);
        VisibleEvents events = new VisibleEvents(() -> {}, () -> 1); events.attach(game);
        Card prodigal = ExilePermissionsTest.add(game, "Prodigal Pyromancer", a, ZoneType.Battlefield);
        SpellAbility ping = prodigal.getSpellAbilities().stream().filter(SpellAbility::isActivatedAbility).findFirst().orElseThrow();
        ping.setActivatingPlayer(a); ping.getTargets().add(elves);
        game.getStack().add(ping);
        JsonObject e = activated(events);
        assertFalse(e.has("loyalty"));
        assertFalse(e.has("cost"));
    }
}
