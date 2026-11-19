package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.List;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.GameStage;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.spellability.OptionalCost;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

/** Os avisos que a mesa usa para os efeitos: sobreviveu (indestrutível, regenerar), cópia, reforço, X, cascata e fase. */
public class EffectEventsTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static Card add(Game game, String name, Player owner, ZoneType zone) { return TestGames.add(game, name, owner, zone); }
    private static List<JsonObject> events(VisibleEvents events) {
        return events.json(0).asList().stream().map(e -> e.getAsJsonObject()).toList();
    }
    private static List<JsonObject> all(List<JsonObject> all, String type) {
        return all.stream().filter(e -> type.equals(e.get("type").getAsString())).toList();
    }
    private static boolean flag(JsonObject e, String key) { return e.has(key) && e.get(key).getAsBoolean(); }
    private static String name(JsonObject e) { return e.getAsJsonObject("card").get("name").getAsString(); }

    private static Game game() { Game game = TestGames.empty(); game.setAge(GameStage.Play); return game; }
    private static VisibleEvents watch(Game game) {
        game.getAction().checkStaticAbilities();
        game.getTriggerHandler().resetActiveTriggers();
        VisibleEvents events = new VisibleEvents(() -> {}, () -> 1); events.attach(game);
        return events;
    }
    private static SpellAbility cast(Game game, Card card, Player who) {
        SpellAbility sa = card.getFirstSpellAbility();
        sa.setActivatingPlayer(who);
        return sa;
    }
    private static void resolveAll(Game game) {
        for (int i = 0; i < 12 && !game.getStack().isEmpty(); i++) {
            game.getStack().addAllTriggeredAbilitiesToStack();
            game.getStack().resolveStack();
            game.getAction().checkStateEffects(true);
        }
    }

    @Test public void wrathLeavesTheIndestructibleAndSaysSo() {
        Game game = game(); Player a = game.getPlayers().get(0), b = game.getPlayers().get(1);
        Card myr = add(game, "Darksteel Myr", a, ZoneType.Battlefield);
        add(game, "Grizzly Bears", a, ZoneType.Battlefield); add(game, "Grizzly Bears", b, ZoneType.Battlefield);
        VisibleEvents events = watch(game);
        game.getStack().add(cast(game, add(game, "Wrath of God", b, ZoneType.Hand), b));
        resolveAll(game);
        List<JsonObject> out = events(events);
        assertEquals(2, all(out, "left").size());
        List<JsonObject> survived = all(out, "survived");
        assertEquals(1, survived.size());
        assertEquals(myr.getId(), survived.get(0).get("sourceId").getAsInt());
        assertEquals("indestructible", survived.get(0).get("survived").getAsString());
        JsonObject resolved = all(out, "resolved").get(0);
        assertTrue(survived.get(0).get("seq").getAsLong() < resolved.get("seq").getAsLong());
        assertEquals(resolved.get("stackId").getAsInt(), survived.get(0).get("stackId").getAsInt());
    }

    @Test public void lethalDamageOnAnIndestructibleIsMarked() {
        Game game = game(); Player a = game.getPlayers().get(0), b = game.getPlayers().get(1);
        Card myr = add(game, "Darksteel Myr", a, ZoneType.Battlefield), bears = add(game, "Grizzly Bears", a, ZoneType.Battlefield);
        VisibleEvents events = watch(game);
        for (Card target : List.of(myr, bears)) {
            SpellAbility bolt = cast(game, add(game, "Lightning Bolt", b, ZoneType.Hand), b);
            bolt.getTargets().add(target); game.getStack().add(bolt);
            resolveAll(game);
        }
        List<JsonObject> damage = all(events(events), "damage");
        assertEquals(2, damage.size());
        assertTrue(flag(damage.get(0), "lethal")); assertTrue(flag(damage.get(0), "indestructible"));
        assertTrue(flag(damage.get(1), "lethal")); assertFalse(damage.get(1).has("indestructible"));
        assertTrue(myr.isInZone(ZoneType.Battlefield));
    }

    @Test public void regeneratedCreatureSaysSo() {
        Game game = game(); Player a = game.getPlayers().get(0), b = game.getPlayers().get(1);
        Card skeletons = add(game, "Drudge Skeletons", a, ZoneType.Battlefield);
        VisibleEvents events = watch(game);
        SpellAbility regen = skeletons.getSpellAbilities().stream().filter(s -> s.isActivatedAbility()).findFirst().orElseThrow();
        regen.setActivatingPlayer(a); game.getStack().add(regen);
        resolveAll(game);
        SpellAbility bolt = cast(game, add(game, "Lightning Bolt", b, ZoneType.Hand), b);
        bolt.getTargets().add(skeletons); game.getStack().add(bolt);
        resolveAll(game);
        List<JsonObject> survived = all(events(events), "survived");
        assertEquals(1, survived.size());
        assertEquals("regenerated", survived.get(0).get("survived").getAsString());
        assertEquals("Drudge Skeletons", name(survived.get(0)));
        assertTrue(skeletons.isInZone(ZoneType.Battlefield));
    }

    @Test public void copiesKickedAndXAreMarkedOnTheCast() {
        Game game = game(); Player a = game.getPlayers().get(0), b = game.getPlayers().get(1);
        VisibleEvents events = watch(game);
        SpellAbility bolt = cast(game, add(game, "Lightning Bolt", a, ZoneType.Hand), a);
        bolt.getTargets().add(b); game.getStack().add(bolt);
        SpellAbility twin = cast(game, add(game, "Reverberate", a, ZoneType.Hand), a);
        twin.getTargets().add(bolt); game.getStack().add(twin);
        resolveAll(game);
        SpellAbility burst = cast(game, add(game, "Burst Lightning", a, ZoneType.Hand), a);
        burst.addOptionalCost(OptionalCost.Kicker1); burst.getTargets().add(b); game.getStack().add(burst);
        SpellAbility blaze = cast(game, add(game, "Blaze", a, ZoneType.Hand), a);
        blaze.setXManaCostPaid(4); blaze.getTargets().add(b); game.getStack().add(blaze);
        resolveAll(game);
        List<JsonObject> casts = all(events(events), "spell-cast");
        List<JsonObject> bolts = casts.stream().filter(e -> "Lightning Bolt".equals(name(e))).toList();
        assertEquals(2, bolts.size());
        assertFalse(bolts.get(0).has("copy")); assertTrue(flag(bolts.get(1), "copy"));
        JsonObject kicked = casts.stream().filter(e -> "Burst Lightning".equals(name(e))).findFirst().orElseThrow();
        assertTrue(flag(kicked, "kicked")); assertFalse(kicked.has("x"));
        JsonObject x = casts.stream().filter(e -> "Blaze".equals(name(e))).findFirst().orElseThrow();
        assertEquals(4, x.get("x").getAsInt()); assertFalse(x.has("kicked"));
    }

    /** Descobrir usa a mesma busca da cascata (o gatilho da cascata só dispara numa conjuração de verdade). */
    @Test public void discoverTellsTheCardsItWentThrough() {
        Game game = game(); Player a = game.getPlayers().get(0);
        for (String n : List.of("Forest", "Mountain", "Grizzly Bears", "Shivan Dragon")) add(game, n, a, ZoneType.Library);
        VisibleEvents events = watch(game);
        game.getStack().add(cast(game, add(game, "Hit the Mother Lode", a, ZoneType.Hand), a));
        resolveAll(game);
        List<JsonObject> out = events(events);
        List<JsonObject> digs = all(out, "cascade");
        assertEquals("eventos " + out.stream().map(e -> e.get("type").getAsString()).toList(), 1, digs.size());
        JsonObject c = digs.get(0);
        assertEquals("discover", c.get("dig").getAsString());
        assertEquals("Hit the Mother Lode", name(c));
        List<String> revealed = c.getAsJsonArray("revealed").asList().stream().map(e -> e.getAsJsonObject().get("name").getAsString()).toList();
        assertEquals(List.of("Forest", "Mountain", "Grizzly Bears"), revealed);
        assertEquals(c.getAsJsonArray("revealed").get(2).getAsJsonObject().get("id").getAsInt(), c.get("hit").getAsInt());
        // Conjurada de graça: a busca fecha antes de a mágica chegar à pilha.
        if (flag(c, "cast")) assertTrue(all(out, "spell-cast").stream().anyMatch(e -> "Grizzly Bears".equals(name(e)) && e.get("seq").getAsLong() > c.get("seq").getAsLong()));
        assertTrue(c.get("seq").getAsLong() < all(out, "resolved").get(all(out, "resolved").size() - 1).get("seq").getAsLong());
    }

    @Test public void phasingIsAnEvent() {
        Game game = game(); Player a = game.getPlayers().get(0);
        Card bears = add(game, "Grizzly Bears", a, ZoneType.Battlefield);
        VisibleEvents events = watch(game);
        game.fireEvent(new forge.game.event.GameEventCardPhased(bears.getView(), true));
        game.fireEvent(new forge.game.event.GameEventCardPhased(bears.getView(), false));
        List<JsonObject> phased = all(events(events), "phased");
        assertEquals(2, phased.size());
        assertTrue(flag(phased.get(0), "out")); assertFalse(phased.get(1).has("out"));
    }
}
