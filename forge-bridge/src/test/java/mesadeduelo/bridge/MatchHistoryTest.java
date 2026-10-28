package mesadeduelo.bridge;

import static org.junit.Assert.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Duration;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import org.junit.BeforeClass;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import forge.game.Game;

public class MatchHistoryTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }
    @Rule public TemporaryFolder tmp = new TemporaryFolder();

    private static JsonObject line(String endedAt, String deck) {
        return JsonParser.parseString("{\"id\":\"" + deck + "\",\"endedAt\":\"" + endedAt + "\",\"players\":[]}").getAsJsonObject();
    }

    @Test public void appendsOneLinePerMatchInTheMonthFileAndReadsNewestFirst() throws IOException {
        MatchHistory history = new MatchHistory(tmp.getRoot().toPath().resolve("partidas"));
        history.record(line("2026-09-30T23:59:00Z", "a"));
        history.record(line("2026-10-01T10:00:00Z", "b"));
        history.record(line("2026-10-02T10:00:00Z", "c"));
        Files.writeString(history.dir().resolve("2026-10.jsonl"), "{\"cortada\":", StandardCharsets.UTF_8, java.nio.file.StandardOpenOption.APPEND);
        assertEquals(java.util.List.of("2026-10", "2026-09"), history.months());
        var october = history.read("2026-10");
        assertEquals("the cut line is skipped", 2, october.size());
        assertEquals("c", october.get(0).getAsJsonObject().get("id").getAsString());
        assertNull(history.file("../relatos/indice"));
        assertEquals(0, history.read("2020-01").size());
    }

    @Test public void adminListsTheLatestMonthAndDownloadsTheFile() throws IOException {
        MatchHistory history = new MatchHistory(tmp.getRoot().toPath().resolve("partidas"));
        history.record(line("2026-09-30T23:59:00Z", "a"));
        history.record(line("2026-10-01T10:00:00Z", "b"));
        FeedbackStore store = new FeedbackStore(tmp.getRoot().toPath(), 1L << 30, Duration.ofDays(90), 0);
        Admin admin = new Admin(store, com.google.gson.JsonArray::new, history, "abre-te", () -> 0);
        Admin.Response login = admin.handle("POST", "login", null, "{\"password\":\"abre-te\"}".getBytes(StandardCharsets.UTF_8), "ip");
        String auth = "Bearer " + JsonParser.parseString(new String(login.body(), StandardCharsets.UTF_8)).getAsJsonObject().get("token").getAsString();

        assertEquals(401, admin.handle("GET", "historico", null, new byte[0], "ip").status());
        JsonObject latest = JsonParser.parseString(new String(admin.handle("GET", "historico", auth, new byte[0], "ip").body(), StandardCharsets.UTF_8)).getAsJsonObject();
        assertEquals("2026-10", latest.get("mes").getAsString());
        assertEquals(2, latest.getAsJsonArray("meses").size());
        assertEquals("b", latest.getAsJsonArray("partidas").get(0).getAsJsonObject().get("id").getAsString());
        JsonObject september = JsonParser.parseString(new String(admin.handle("GET", "historico/2026-09", auth, new byte[0], "ip").body(), StandardCharsets.UTF_8)).getAsJsonObject();
        assertEquals("a", september.getAsJsonArray("partidas").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals(400, admin.handle("GET", "historico/setembro", auth, new byte[0], "ip").status());

        Admin.Response file = admin.handle("GET", "historico/2026-09.jsonl", auth, new byte[0], "ip");
        assertEquals(200, file.status());
        assertTrue(new String(file.body(), StandardCharsets.UTF_8).contains("\"id\":\"a\""));
        assertEquals(404, admin.handle("GET", "historico/2020-01.jsonl", auth, new byte[0], "ip").status());
    }

    @Test public void summaryHasDecksColorsCommanderWinnerTurnsAndHowEachSeatLost() {
        Game game = CommanderEngineTest.game(3);
        var seats = java.util.List.copyOf(game.getPlayers());
        seats.get(1).concede(); game.getAction().checkGameOverCondition();
        seats.get(2).setLife(0, null); game.getAction().checkGameOverCondition();
        assertTrue(game.isGameOver());
        Session session = Session.room("ABCD", null, "Ana", new forge.deck.Deck("Elfos"), new MatchConfig("commander", "bo1", 3), true);
        JsonObject o = session.historyJson(game.getMatch());

        assertEquals("commander", o.get("format").getAsString());
        assertEquals("rede", o.get("mode").getAsString());
        assertTrue(o.get("public").getAsBoolean());
        assertEquals(0, o.get("winner").getAsInt());
        var players = o.getAsJsonArray("players");
        assertEquals(3, players.size());
        JsonObject first = players.get(0).getAsJsonObject();
        assertEquals("Commander 0", first.get("deck").getAsString());
        assertEquals("W", first.get("colors").getAsString());
        assertEquals("Isamaru, Hound of Konda", first.get("commander").getAsString());
        assertEquals(1, first.get("wins").getAsInt());
        assertFalse("AI seats carry no typed name", first.has("name"));
        JsonObject g = o.getAsJsonArray("games").get(0).getAsJsonObject();
        assertEquals(0, g.get("winner").getAsInt());
        assertEquals("[\"win\",\"Conceded\",\"LifeReachedZero\"]", g.getAsJsonArray("result").toString());
        assertEquals(3, g.getAsJsonArray("mull").size());
        assertTrue("small enough to keep forever", o.toString().length() < 1000);
        assertEquals("one seat died, so it was played to the end", "concluida", o.get("end").getAsString());
    }

    private static Session twoSeats() {
        return Session.room("ABCD", null, "Ana", new forge.deck.Deck("Elfos"), new MatchConfig("commander", "bo1", 2), false);
    }

    @Test public void aGameDecidedByAConcessionIsMarkedConceded() {
        Game game = CommanderEngineTest.game(2);
        java.util.List.copyOf(game.getPlayers()).get(1).concede(); game.getAction().checkGameOverCondition();
        assertTrue(game.isGameOver());
        JsonObject o = twoSeats().historyJson(game.getMatch());
        assertEquals("concedida", o.get("end").getAsString());
        assertEquals(0, o.get("winner").getAsInt());
    }

    @Test public void leavingMidGameConcedesItAndHandsTheSeriesToWhoStayed() {
        Game game = CommanderEngineTest.game(2);
        Session session = twoSeats();
        session.seats[0].registered = game.getMatch().getPlayers().get(0);
        JsonObject o = session.historyJson(game.getMatch(), "concedida", session.seats[0], game);

        assertEquals("concedida", o.get("end").getAsString());
        assertEquals(1, o.get("winner").getAsInt());
        assertEquals(1, o.getAsJsonArray("players").get(1).getAsJsonObject().get("wins").getAsInt());
        JsonObject g = o.getAsJsonArray("games").get(0).getAsJsonObject();
        assertEquals(1, g.get("winner").getAsInt());
        assertEquals("Conceded", g.get("end").getAsString());
        assertEquals("[\"Conceded\",\"win\"]", g.getAsJsonArray("result").toString());
    }

    @Test public void aDropWithoutReturnHasNoWinner() {
        Game game = CommanderEngineTest.game(2);
        JsonObject o = twoSeats().historyJson(game.getMatch(), "queda", null, game);

        assertEquals("queda", o.get("end").getAsString());
        assertTrue(o.get("winner").isJsonNull());
        JsonObject g = o.getAsJsonArray("games").get(0).getAsJsonObject();
        assertTrue(g.get("winner").isJsonNull());
        assertEquals("Interrupted", g.get("end").getAsString());
        assertEquals("[\"playing\",\"playing\"]", g.getAsJsonArray("result").toString());
    }
}
