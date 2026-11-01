package mesadeduelo.bridge;

import static org.junit.Assert.*;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

/** O valor que a carta conta (item 56): o que é contado, o valor de agora e o que ele muda, com o motor de verdade. */
public class CardCountsTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static JsonArray counts(Card c, Game game) {
        JsonObject o = StateJson.card(c.getView(), game);
        assertTrue(c.getName() + " should carry counts: " + o, o.has("counts"));
        return o.getAsJsonArray("counts");
    }
    private static JsonObject only(Card c, Game game) {
        JsonArray a = counts(c, game);
        assertEquals(a.toString(), 1, a.size());
        return a.get(0).getAsJsonObject();
    }
    private static JsonObject use(JsonObject count, String use) {
        for (var u : count.getAsJsonArray("uses")) if (u.getAsJsonObject().get("use").getAsString().equals(use)) return u.getAsJsonObject();
        throw new AssertionError("no use " + use + " in " + count);
    }

    @Test public void combustionTechniqueAddsTheLessonsInYourGraveyardToTheDamage() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        Card combustion = ExilePermissionsTest.add(game, "Combustion Technique", me, ZoneType.Hand);
        JsonObject none = only(combustion, game);
        assertEquals(0, none.get("value").getAsInt());
        assertEquals(2, use(none, "damage").get("amount").getAsInt());

        ExilePermissionsTest.add(game, "Accumulate Wisdom", me, ZoneType.Graveyard);
        ExilePermissionsTest.add(game, "Introduction to Annihilation", me, ZoneType.Graveyard);
        ExilePermissionsTest.add(game, "Expanded Anatomy", me, ZoneType.Graveyard);
        ExilePermissionsTest.add(game, "Grizzly Bears", me, ZoneType.Graveyard);
        ExilePermissionsTest.add(game, "Introduction to Prophecy", other, ZoneType.Graveyard); // a do oponente não conta
        JsonObject c = only(combustion, game);
        assertEquals("cards", c.get("of").getAsString());
        assertEquals("graveyard", c.get("zone").getAsString());
        assertEquals("you", c.get("whose").getAsString());
        assertEquals("[\"Lesson\"]", c.get("types").toString());
        assertEquals(3, c.get("value").getAsInt());
        JsonObject damage = use(c, "damage");
        assertEquals(5, damage.get("amount").getAsInt());
        assertEquals(2, damage.get("plus").getAsInt());
    }

    @Test public void accumulateWisdomShowsTheLessonsAgainstTheMinimumOfThree() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0);
        Card wisdom = ExilePermissionsTest.add(game, "Accumulate Wisdom", me, ZoneType.Hand);
        ExilePermissionsTest.add(game, "Combustion Technique", me, ZoneType.Graveyard);
        ExilePermissionsTest.add(game, "Expanded Anatomy", me, ZoneType.Graveyard);
        JsonObject c = only(wisdom, game);
        assertEquals(2, c.get("value").getAsInt());
        assertEquals("[\"Lesson\"]", c.get("types").toString());
        assertEquals(3, use(c, "threshold").get("min").getAsInt());

        ExilePermissionsTest.add(game, "Introduction to Annihilation", me, ZoneType.Graveyard);
        assertEquals(3, only(wisdom, game).get("value").getAsInt());
    }

    @Test public void craterhoofCountsItselfWhenItEntersAndFollowsTheBoard() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        Card hoof = ExilePermissionsTest.add(game, "Craterhoof Behemoth", me, ZoneType.Hand);
        ExilePermissionsTest.add(game, "Grizzly Bears", me, ZoneType.Battlefield);
        ExilePermissionsTest.add(game, "Llanowar Elves", me, ZoneType.Battlefield);
        ExilePermissionsTest.add(game, "Forest", me, ZoneType.Battlefield);
        ExilePermissionsTest.add(game, "Grizzly Bears", other, ZoneType.Battlefield);
        JsonObject c = only(hoof, game);
        assertEquals("battlefield", c.get("zone").getAsString());
        assertEquals("[\"Creature\"]", c.get("types").toString());
        assertEquals(2, c.get("value").getAsInt());
        assertEquals("counts itself once it enters", 3, c.get("entering").getAsInt());
        JsonObject pt = use(c, "pt");
        assertEquals("+3", pt.get("power").getAsString());
        assertEquals("+3", pt.get("toughness").getAsString());

        ExilePermissionsTest.add(game, "Llanowar Elves", me, ZoneType.Battlefield);
        assertEquals("+4", use(only(hoof, game), "pt").get("power").getAsString());
    }

    @Test public void ghaltaCostsLessByTheTotalPowerOfYourCreatures() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0);
        Card ghalta = ExilePermissionsTest.add(game, "Ghalta, Primal Hunger", me, ZoneType.Hand);
        ExilePermissionsTest.add(game, "Grizzly Bears", me, ZoneType.Battlefield);
        ExilePermissionsTest.add(game, "Craterhoof Behemoth", me, ZoneType.Battlefield);
        JsonObject c = only(ghalta, game);
        assertEquals("power", c.get("measure").getAsString());
        assertEquals(7, c.get("value").getAsInt());
        JsonObject cost = use(c, "costLess");
        assertEquals(7, cost.get("amount").getAsInt());
        assertFalse(cost.has("others"));
    }

    @Test public void opponentsCountsSayWhoseTheyAre() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        Card scourge = ExilePermissionsTest.add(game, "Scourge of Geier Reach", me, ZoneType.Battlefield);
        ExilePermissionsTest.add(game, "Grizzly Bears", other, ZoneType.Battlefield);
        ExilePermissionsTest.add(game, "Grizzly Bears", me, ZoneType.Battlefield);
        JsonObject c = only(scourge, game);
        assertEquals("opponents", c.get("whose").getAsString());
        assertEquals(1, c.get("value").getAsInt());
        assertEquals("+1", use(c, "pt").get("power").getAsString());

        Card goyf = ExilePermissionsTest.add(game, "Tarmogoyf", me, ZoneType.Battlefield);
        ExilePermissionsTest.add(game, "Lightning Bolt", other, ZoneType.Graveyard);
        ExilePermissionsTest.add(game, "Grizzly Bears", me, ZoneType.Graveyard);
        JsonObject g = only(goyf, game);
        assertEquals("all", g.get("whose").getAsString());
        assertEquals("cardTypes", g.get("measure").getAsString());
        assertEquals(2, g.get("value").getAsInt());
        assertEquals("2", use(g, "pt").get("power").getAsString());
        assertEquals("3", use(g, "pt").get("toughness").getAsString());
    }

    @Test public void devotionIsOneOfTheCountsAndGodsKeepTheirThreshold() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0);
        Card thassa = ExilePermissionsTest.add(game, "Thassa, God of the Sea", me, ZoneType.Battlefield);
        ExilePermissionsTest.add(game, "Merfolk of the Pearl Trident", me, ZoneType.Battlefield);
        JsonObject d = only(thassa, game);
        assertEquals("devotion", d.get("of").getAsString());
        assertEquals("[\"U\"]", d.get("colors").toString());
        assertEquals(2, d.get("value").getAsInt());
        assertEquals(5, use(d, "creature").get("min").getAsInt());

        Card mogis = ExilePermissionsTest.add(game, "Mogis, God of Slaughter", me, ZoneType.Battlefield);
        JsonObject dual = only(mogis, game);
        assertEquals("[\"B\",\"R\"]", dual.get("colors").toString());
        assertEquals(2, dual.get("value").getAsInt());
        assertEquals(7, use(dual, "creature").get("min").getAsInt());

        Card merchant = ExilePermissionsTest.add(game, "Gray Merchant of Asphodel", me, ZoneType.Hand);
        JsonObject black = only(merchant, game);
        assertEquals(1, black.get("value").getAsInt());
        assertEquals("its own {B}{B} count once it enters", 3, black.get("entering").getAsInt());
        assertEquals(3, use(black, "lifeLoss").get("amount").getAsInt());
    }

    @Test public void handSizeThresholdAndCardsThatCountNothingTheTableCanShow() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0);
        Card akki = ExilePermissionsTest.add(game, "Akki Underling", me, ZoneType.Battlefield);
        ExilePermissionsTest.add(game, "Grizzly Bears", me, ZoneType.Hand);
        JsonObject hand = only(akki, game);
        assertEquals("hand", hand.get("of").getAsString());
        assertEquals(1, hand.get("value").getAsInt());
        assertEquals(7, use(hand, "threshold").get("min").getAsInt());

        // Só ao resolver: o X pago (Myr Battlesphere) e o dano de Fireball não viram contagem.
        for (String name : new String[] {"Myr Battlesphere", "Fireball", "Grizzly Bears", "Lightning Bolt"})
            assertFalse(name, StateJson.card(ExilePermissionsTest.add(game, name, me, ZoneType.Hand).getView(), game).has("counts"));
        // No cemitério a contagem não muda nenhuma decisão.
        assertFalse(StateJson.card(ExilePermissionsTest.add(game, "Combustion Technique", me, ZoneType.Graveyard).getView(), game).has("counts"));
    }
}
