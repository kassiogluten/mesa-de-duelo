package mesadeduelo.bridge;

import static org.junit.Assert.*;
import com.google.gson.*;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import org.junit.Test;

/** A série de ficha escolhida no deck: guardada com ele, e mostrada só nas fichas do dono que batem com a escolha. */
public class TokenPrintsTest {
    private static JsonObject choice(String name, String colors, String power, String toughness, String set, String cn) {
        JsonObject o = new JsonObject(); o.addProperty("name", name); o.addProperty("colors", colors);
        if (power != null) { o.addProperty("power", power); o.addProperty("toughness", toughness); }
        o.addProperty("set", set); o.addProperty("cn", cn);
        return o;
    }
    private static DeckValidation.Result deck(JsonObject... tokens) {
        JsonObject d = new JsonObject(); d.addProperty("name", "Fichas");
        JsonArray cards = new JsonArray(); JsonObject forest = new JsonObject(); forest.addProperty("name", "Forest"); forest.addProperty("count", 60); cards.add(forest);
        d.add("cards", cards);
        JsonArray list = new JsonArray(); for (JsonObject t : tokens) list.add(t);
        d.add("tokens", list);
        return DeckValidation.validate(d, "free");
    }
    private static Card token(Game game, String script, Player owner) {
        Card t = forge.game.card.CardFactory.getCard(forge.StaticData.instance().getAllTokens().getToken(script), owner, game);
        t.setOwner(owner); t.setController(owner, 0);
        owner.getZone(ZoneType.Battlefield).add(t); t.setZone(owner.getZone(ZoneType.Battlefield));
        return t;
    }
    private static String image(Game game, Card c) { JsonElement img = StateJson.card(c.getView(), game).get("image"); return img == null ? null : img.getAsString(); }

    @Test public void choicesTravelWithTheDeckAndMalformedOnesAreDropped() {
        TestGames.engine();
        JsonObject bad = choice("Rabbit", "X", "1", "1", "tblb", "3");
        var r = deck(choice("Rabbit", "W", "1", "1", "tblb", "3"), bad, choice("Treasure", "", null, null, "thob", "13"));
        assertTrue(r.json().toString(), r.valid());
        JsonArray back = DeckValidation.deckJson(r.deck()).getAsJsonArray("tokens");
        assertEquals(2, back.size());
        assertEquals("tblb", back.get(0).getAsJsonObject().get("set").getAsString());
        assertEquals("thob", back.get(1).getAsJsonObject().get("set").getAsString());
        assertEquals(2, TokenPrints.json((forge.deck.Deck) r.deck().copyTo("Cópia")).size());
    }

    @Test public void ownersTokenShowsTheChosenPrinting() {
        var mine = deck(choice("Rabbit", "W", "1", "1", "tfdn", "5"), choice("Treasure", "", null, null, "thob", "13")).deck();
        Game game = TestGames.game(mine, new forge.deck.Deck("B"), "free", "Token prints");
        Player a = game.getPlayers().get(0), b = game.getPlayers().get(1);
        assertEquals("https://api.scryfall.com/cards/tfdn/5?format=image&version=normal", image(game, token(game, "w_1_1_rabbit", a)));
        assertEquals("https://api.scryfall.com/cards/thob/13?format=image&version=normal", image(game, token(game, "c_a_treasure_sac", a)));
        String theirs = image(game, token(game, "w_1_1_rabbit", b));
        assertFalse("a ficha do oponente segue a série da carta: " + theirs, theirs != null && theirs.contains("tfdn/5"));
    }

    @Test public void xTokenFallsBackToTheOnlyChoiceWithThatNameAndColors() {
        var mine = deck(choice("Hydra", "G", "0", "0", "tdmu", "1")).deck();
        Game game = TestGames.game(mine, new forge.deck.Deck("B"), "free", "Token prints X");
        Card hydra = token(game, "g_x_x_hydra", game.getPlayers().get(0));
        hydra.setBasePower(3); hydra.setBaseToughness(3);
        assertEquals("https://api.scryfall.com/cards/tdmu/1?format=image&version=normal", image(game, hydra));
    }
}
