package mesadeduelo.bridge;

import static org.junit.Assert.*;
import com.google.gson.*;
import org.junit.BeforeClass;
import org.junit.Test;

/** A série escolhida na lista vira a impressão da carta no Forge, e volta para o navegador como {set, cn} do Scryfall. */
public class PrintingTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static JsonObject row(String name, int count, String set, String cn) {
        JsonObject e = new JsonObject(); e.addProperty("name", name); e.addProperty("count", count);
        if (set != null) e.addProperty("set", set);
        if (cn != null) e.addProperty("cn", cn);
        return e;
    }
    private static DeckValidation.Result deck(JsonObject... rows) {
        JsonObject d = new JsonObject(); d.addProperty("name", "Séries");
        JsonArray cards = new JsonArray(); for (JsonObject r : rows) cards.add(r);
        d.add("cards", cards);
        return DeckValidation.validate(d, "free");
    }

    @Test public void chosenPrintingIsKeptAndSentBack() {
        var r = deck(row("Lightning Bolt", 4, "m10", "146"), row("Forest", 56, null, null));
        assertTrue(r.json().toString(), r.valid());
        var bolt = r.deck().getMain().toFlatList().stream().filter(c -> c.getName().equals("Lightning Bolt")).findFirst().orElseThrow();
        assertEquals("M10", bolt.getEdition());
        JsonObject print = DeckValidation.printing(bolt);
        assertEquals("m10", print.get("set").getAsString());
        assertEquals("146", print.get("cn").getAsString());
        JsonArray entries = DeckValidation.entries(r.deck().getMain());
        for (JsonElement e : entries) {
            JsonObject o = e.getAsJsonObject();
            if (o.get("name").getAsString().equals("Lightning Bolt")) assertEquals("m10", o.get("set").getAsString());
            else assertFalse("a impressão padrão não leva série: " + o, o.has("set"));
        }
    }

    @Test public void twoPrintingsOfTheSameCardStaySeparate() {
        var r = deck(row("Lightning Bolt", 2, "m10", "146"), row("Lightning Bolt", 2, "2x2", "117"), row("Forest", 56, null, null));
        assertTrue(r.json().toString(), r.valid());
        var sets = DeckValidation.entries(r.deck().getMain()).asList().stream().map(JsonElement::getAsJsonObject)
            .filter(e -> e.get("name").getAsString().equals("Lightning Bolt")).map(e -> e.get("set").getAsString() + " " + e.get("cn").getAsString()).sorted().toList();
        assertEquals(java.util.List.of("2x2 117", "m10 146"), sets);
        assertEquals(4, (int) DeckValidation.poolCounts(r.deck()).get("Lightning Bolt"));
    }

    @Test public void unknownPrintingFallsBackToTheStandardOne() {
        var r = deck(row("Lightning Bolt", 4, "zzzz", "1"), row("Forest", 56, "dmu", "99999"));
        assertTrue(r.json().toString(), r.valid());
        for (var card : r.deck().getMain().toFlatList()) assertNull(card.getName(), DeckValidation.printing(card));
    }
}
