package mesadeduelo.bridge;

import static org.junit.Assert.*;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

/** Companheiro no Commander: a condição conta o comandante, só cabe um, e na partida ele espera na zona de comando. */
public class CompanionTest {
    @BeforeClass public static void engine() { TestGames.engine(); }

    private static JsonArray rows(String name, int count) {
        JsonArray rows = new JsonArray(); JsonObject e = new JsonObject(); e.addProperty("name", name); e.addProperty("count", count); rows.add(e); return rows;
    }
    private static JsonObject deck(String commander, String card, int count, String companion) {
        JsonObject d = new JsonObject(); d.addProperty("name", "Companheiro");
        d.add("commanders", rows(commander, 1)); d.add("cards", rows(card, count));
        if (companion != null) d.add("sideboard", rows(companion, 1));
        return d;
    }
    private static boolean has(DeckValidation.Result r, String code) {
        return r.issues().asList().stream().anyMatch(i -> code.equals(i.getAsJsonObject().get("code").getAsString()));
    }

    @Test public void companionIsTheOnlyCardOutsideTheHundred() {
        var ok = DeckValidation.validate(deck("Ayli, Eternal Pilgrim", "Plains", 99, "Lurrus of the Dream-Den"), "commander");
        assertTrue(ok.json().toString(), ok.valid());
        assertEquals(1, ok.json().getAsJsonObject("deck").getAsJsonArray("sideboard").size());
        assertTrue(has(DeckValidation.validate(deck("Ayli, Eternal Pilgrim", "Plains", 99, "Swords to Plowshares"), "commander"), "sideboard-not-supported"));
        JsonObject two = deck("Ayli, Eternal Pilgrim", "Plains", 99, "Lurrus of the Dream-Den");
        two.getAsJsonArray("sideboard").add(rows("Kaheera, the Orphanguard", 1).get(0));
        assertTrue(has(DeckValidation.validate(two, "commander"), "sideboard-not-supported"));
        // Lutri: proibido como companheiro no Commander, mas vale no deck.
        var lutri = DeckValidation.validate(deck("Niv-Mizzet, Parun", "Island", 99, "Lutri, the Spellchaser"), "commander");
        assertTrue(lutri.json().toString(), has(lutri, "banned-companion"));
        JsonObject inDeck = deck("Niv-Mizzet, Parun", "Island", 98, null);
        inDeck.getAsJsonArray("cards").add(rows("Lutri, the Spellchaser", 1).get(0));
        assertTrue(DeckValidation.validate(inDeck, "commander").json().toString(), DeckValidation.validate(inDeck, "commander").valid());
        // Fora da identidade dos comandantes, como qualquer carta do deck.
        assertTrue(has(DeckValidation.validate(deck("Isamaru, Hound of Konda", "Plains", 99, "Lurrus of the Dream-Den"), "commander"), "color-identity"));
    }

    @Test public void conditionCountsTheCommander() {
        // Teysa Karlov tem valor de mana 4: o Lurrus pede toda permanente do deck inicial, comandante incluído, com 2 ou menos.
        var r = DeckValidation.validate(deck("Teysa Karlov", "Plains", 99, "Lurrus of the Dream-Den"), "commander");
        assertTrue(r.json().toString(), has(r, "companion-restriction"));
        String message = r.issues().get(0).getAsJsonObject().get("message").getAsString();
        assertTrue(message, message.contains("valor de mana 2 ou menos"));
        // Gyruda: só valor de mana par (terrenos têm 0). Obosh: só ímpar ou terreno.
        assertTrue(DeckValidation.validate(deck("Ayli, Eternal Pilgrim", "Plains", 99, null), "commander").valid());
        assertTrue(Companions.meets(DeckValidation.resolve("Obosh, the Preypiercer"),
            DeckValidation.validate(deck("Isamaru, Hound of Konda", "Mountain", 99, null), "free").deck()));
        assertFalse(Companions.meets(DeckValidation.resolve("Gyruda, Doom of Depths"),
            DeckValidation.validate(deck("Isamaru, Hound of Konda", "Island", 99, null), "free").deck()));
        assertFalse("Yorion pede 20 cartas além do mínimo", Companions.meets(DeckValidation.resolve("Yorion, Sky Nomad"),
            DeckValidation.validate(deck("Ayli, Eternal Pilgrim", "Plains", 99, null), "free").deck()));
    }

    @Test public void revealedCompanionWaitsInTheCommandZoneAndGoesToHandForThree() {
        Game game = TestGames.empty(); Player me = game.getPlayers().get(0);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        for (int i = 0; i < 10; i++) TestGames.add(game, "Plains", me, ZoneType.Library);
        TestGames.add(game, "Lurrus of the Dream-Den", me, ZoneType.Sideboard);
        me.assignCompanion(game, me.getController());
        Card lurrus = me.getCardsIn(ZoneType.Command).stream().filter(Companions::inCommandZone).findFirst().orElseThrow();
        assertEquals("Lurrus of the Dream-Den", lurrus.getName());

        JsonObject row = StateJson.player(me.getView(), true, game);
        assertEquals(lurrus.getId(), row.getAsJsonObject("companion").get("id").getAsInt());
        assertEquals("o efeito do companheiro não aparece como emblema", 0, row.getAsJsonArray("emblems").size());
        assertEquals("nem como comandante", 0, row.getAsJsonArray("commandZone").size());
        assertFalse("o oponente não tem companheiro", StateJson.player(game.getPlayers().get(1).getView(), false, game).has("companion"));

        for (int i = 0; i < 3; i++) TestGames.add(game, "Plains", me, ZoneType.Battlefield);
        game.getAction().checkStaticAbilities();
        assertTrue("dá para pôr na mão por {3}", Castable.compute(me).contains(lurrus.getId()));
    }
}
