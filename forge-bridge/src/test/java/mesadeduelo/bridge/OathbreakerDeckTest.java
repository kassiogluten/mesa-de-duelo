package mesadeduelo.bridge;

import static org.junit.Assert.*;
import com.google.gson.*;
import org.junit.BeforeClass;
import org.junit.Test;

public class OathbreakerDeckTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }
    private JsonObject deck(String oathbreaker, String signature, String card, int count) {
        JsonObject d = new JsonObject(); d.addProperty("name", "Oathbreaker test");
        JsonArray command = rows(oathbreaker, 1); if (signature != null) command.add(rows(signature, 1).get(0));
        d.add("commanders", command); d.add("cards", rows(card, count)); return d;
    }
    private JsonArray rows(String name, int count) {
        JsonArray rows = new JsonArray(); JsonObject e = new JsonObject(); e.addProperty("name", name); e.addProperty("count", count); rows.add(e); return rows;
    }
    private DeckValidation.Result check(JsonObject d) { return DeckValidation.validate(d, "oathbreaker"); }
    private void rejects(JsonObject d, String code) {
        var r = check(d); assertTrue(r.json().toString(), r.issues().asList().stream().anyMatch(i -> code.equals(i.getAsJsonObject().get("code").getAsString())));
    }
    @Test public void allStartersArePlayableByHumansAndAi() {
        StringBuilder errors = new StringBuilder();
        long count = Decks.LISTS.values().stream().filter(d -> "oathbreaker".equals(d.get("format").getAsString())).peek(d -> {
            var r = DeckValidation.validateForAi(d, "oathbreaker");
            if (!r.valid()) { errors.append(d.get("name")).append(": ").append(r.json()).append("\n"); return; }
            assertEquals(58, r.deck().getMain().countAll()); assertNotNull(r.deck().getOathbreaker()); assertNotNull(r.deck().getSignatureSpell());
        }).count();
        assertEquals(errors.toString(), 0, errors.length());
        assertEquals(10, count); assertNotNull(Decks.random("oathbreaker"));
    }
    @Test public void needsAPlaneswalkerASignatureSpellAnd60Cards() {
        assertTrue(check(deck("Wrenn and Six", "Crop Rotation", "Forest", 58)).json().toString(), check(deck("Wrenn and Six", "Crop Rotation", "Forest", 58)).valid());
        rejects(deck("Wrenn and Six", "Crop Rotation", "Forest", 57), "total-count");
        rejects(deck("Wrenn and Six", null, "Forest", 59), "commander-count");
        rejects(deck("Llanowar Elves", "Crop Rotation", "Forest", 58), "invalid-commander");
        rejects(deck("Wrenn and Six", "Llanowar Elves", "Forest", 58), "invalid-commander");
        JsonObject d = deck("Wrenn and Six", "Crop Rotation", "Forest", 58); d.add("sideboard", rows("Forest", 1)); rejects(d, "sideboard-not-supported");
    }
    @Test public void identitySingletonAndBansFollowOathbreaker() {
        rejects(deck("Wrenn and Six", "Counterspell", "Forest", 58), "color-identity");
        rejects(deck("Wrenn and Six", "Crop Rotation", "Island", 58), "color-identity");
        rejects(deck("Wrenn and Six", "Crop Rotation", "Llanowar Elves", 58), "too-many-copies");
        // Banidas no Oathbreaker e não no Commander, e o contrário.
        JsonObject d = deck("Wrenn and Six", "Crop Rotation", "Forest", 57); d.getAsJsonArray("cards").add(rows("Mana Vault", 1).get(0)); rejects(d, "banned-card");
        d = deck("Wrenn and Six", "Crop Rotation", "Forest", 57); d.getAsJsonArray("cards").add(rows("Dockside Extortionist", 1).get(0)); assertTrue(check(d).json().toString(), check(d).valid());
        assertFalse(OathbreakerLegality.permits("Mana Vault")); assertTrue(OathbreakerLegality.permits("Dockside Extortionist")); assertTrue(OathbreakerLegality.permits("Lightning Bolt"));
    }
    @Test public void gameStartsWithTwentyLifeAndBothCardsInTheCommandZone() {
        var players = new java.util.ArrayList<forge.game.player.RegisteredPlayer>();
        for (String id : new String[]{"oathbreaker-vraska", "oathbreaker-ellywick"})
            players.add(forge.game.player.RegisteredPlayer.forVariants(2, java.util.Set.of(forge.game.GameType.Oathbreaker), Decks.build(id), null, false, null, null).setPlayer(new forge.ai.LobbyPlayerAi(id, null)));
        forge.game.Game game = new forge.game.Match(new MatchConfig("oathbreaker", "bo1", 2).rules(), players, "Oathbreaker test").createGame();
        for (int i = 0; i < 2; i++) {
            var player = game.getPlayers().get(i);
            player.initVariantsZones(players.get(i));
            assertEquals(20, player.getStartingLife());
            var command = player.getCardsIn(forge.game.zone.ZoneType.Command).stream().filter(forge.game.card.Card::isCommander).toList();
            assertEquals(2, command.size()); assertTrue(command.get(0).isPlaneswalker()); assertTrue(command.get(1).isInstant() || command.get(1).isSorcery());
            assertEquals(2, player.getCommanders().size());
        }
    }
    @Test public void configIsLikeCommanderWithTwentyLife() {
        var config = new MatchConfig("oathbreaker", "bo1", 4);
        assertTrue(config.commandZone()); assertFalse(config.commander());
        assertTrue(config.rules().hasAppliedVariant(forge.game.GameType.Oathbreaker));
        assertEquals(4, config.json().get("playerCount").getAsInt());
        try { new MatchConfig("oathbreaker", "bo3", 2); fail(); } catch (IllegalArgumentException expected) { }
        try { new MatchConfig("oathbreaker", "bo1", 5); fail(); } catch (IllegalArgumentException expected) { }
    }
}
