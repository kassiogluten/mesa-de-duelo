package mesadeduelo.bridge;

import static org.junit.Assert.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class PlayerRankingTest {
    @Rule public TemporaryFolder tmp = new TemporaryFolder();

    private static JsonObject match(String id, String endedAt, String end, Integer winner, String... players) {
        StringBuilder sb = new StringBuilder("{\"id\":\"" + id + "\",\"endedAt\":\"" + endedAt + "\",\"format\":\"pauper\",\"mode\":\"rede\",\"end\":\"" + end + "\",\"winner\":" + winner + ",\"players\":[");
        for (int i = 0; i < players.length; i++) sb.append(i > 0 ? "," : "").append(players[i]);
        return JsonParser.parseString(sb.append("]}").toString()).getAsJsonObject();
    }
    private static final String ANA = "{\"name\":\"Ana\",\"account\":\"c1\",\"ai\":false,\"deck\":\"Elfos\",\"wins\":0}";
    private static final String ANA_NEW_NICK = "{\"name\":\"Aninha\",\"account\":\"c1\",\"ai\":false,\"deck\":\"Elfos\",\"wins\":0}";
    private static final String BIA = "{\"name\":\"Bia\",\"ai\":false,\"deck\":\"Goblins\",\"wins\":0}";
    private static final String BIA_UPPER = "{\"name\":\"BIA \",\"ai\":false,\"deck\":\"Goblins\",\"wins\":0}";
    private static final String NOBODY = "{\"ai\":false,\"deck\":\"Mono U\",\"wins\":0}";
    private static final String AI = "{\"ai\":true,\"deck\":\"Burn\",\"wins\":0}";

    private static JsonObject row(JsonArray rows, String key) {
        for (var e : rows) if (e.getAsJsonObject().get("key").getAsString().equals(key)) return e.getAsJsonObject();
        throw new AssertionError(key + " fora do ranking: " + rows);
    }

    @Test public void countsPeopleByAccountOrNicknameWithTheAiOnlyAsOpponent() {
        JsonArray rows = PlayerRanking.rank(java.util.List.of(
            match("5", "2026-11-05T10:00:00Z", "concluida", 0, ANA_NEW_NICK, AI),
            match("4", "2026-11-04T10:00:00Z", "concedida", 0, ANA, BIA),
            match("3", "2026-11-03T10:00:00Z", "queda", null, ANA, BIA_UPPER),
            match("2", "2026-11-02T10:00:00Z", "concluida", 1, ANA, BIA),
            match("1", "2026-11-01T10:00:00Z", "concluida", null, NOBODY, AI)));
        assertEquals("a IA não vira linha", 3, rows.size());

        JsonObject ana = rows.get(0).getAsJsonObject();
        assertEquals("c:c1", ana.get("key").getAsString());
        assertEquals("o apelido mais recente", "Aninha", ana.get("name").getAsString());
        assertTrue(ana.get("account").getAsBoolean());
        assertEquals(4, ana.get("played").getAsInt());
        assertEquals(2, ana.get("won").getAsInt()); assertEquals(1, ana.get("lost").getAsInt()); assertEquals(1, ana.get("dropped").getAsInt());
        assertEquals("2026-11-05T10:00:00Z", ana.get("last").getAsString());
        assertEquals("Bia", ana.getAsJsonArray("opponents").get(0).getAsJsonObject().get("name").getAsString());
        assertEquals(3, ana.getAsJsonArray("opponents").get(0).getAsJsonObject().get("played").getAsInt());
        assertEquals("vitoria", ana.getAsJsonArray("recent").get(0).getAsJsonObject().get("result").getAsString());
        assertEquals("IA", ana.getAsJsonArray("recent").get(0).getAsJsonObject().get("against").getAsString());

        JsonObject bia = row(rows, "n:bia");
        assertEquals("o apelido junta maiúsculas e espaços", 3, bia.get("played").getAsInt());
        assertEquals(1, bia.get("won").getAsInt()); assertEquals(1, bia.get("lost").getAsInt()); assertEquals(1, bia.get("conceded").getAsInt());
        assertEquals("concedeu", bia.getAsJsonArray("recent").get(0).getAsJsonObject().get("result").getAsString());

        JsonObject nobody = row(rows, "-");
        assertFalse(nobody.has("name"));
        assertEquals(1, nobody.get("tied").getAsInt());
    }

    @Test public void adminRanksAMonthOrEverything() throws IOException {
        MatchHistory history = new MatchHistory(tmp.getRoot().toPath().resolve("partidas"));
        history.record(match("a", "2026-10-30T10:00:00Z", "concluida", 0, ANA, BIA));
        history.record(match("b", "2026-11-01T10:00:00Z", "concluida", 1, ANA, BIA));
        FeedbackStore store = new FeedbackStore(tmp.getRoot().toPath(), 1L << 30, Duration.ofDays(90), 0);
        Admin admin = new Admin(store, JsonArray::new, history, "abre-te", () -> 0);
        Admin.Response login = admin.handle("POST", "login", null, "{\"password\":\"abre-te\"}".getBytes(StandardCharsets.UTF_8), "ip");
        String auth = "Bearer " + JsonParser.parseString(new String(login.body(), StandardCharsets.UTF_8)).getAsJsonObject().get("token").getAsString();

        assertEquals(401, admin.handle("GET", "ranking", null, new byte[0], "ip").status());
        JsonObject all = JsonParser.parseString(new String(admin.handle("GET", "ranking", auth, new byte[0], "ip").body(), StandardCharsets.UTF_8)).getAsJsonObject();
        assertEquals("", all.get("mes").getAsString());
        assertEquals(2, all.get("partidas").getAsInt());
        assertEquals(2, all.getAsJsonArray("meses").size());
        assertEquals(1, row(all.getAsJsonArray("jogadores"), "c:c1").get("won").getAsInt());
        JsonObject november = JsonParser.parseString(new String(admin.handle("GET", "ranking/2026-11", auth, new byte[0], "ip").body(), StandardCharsets.UTF_8)).getAsJsonObject();
        assertEquals(1, november.get("partidas").getAsInt());
        assertEquals("Bia venceu em novembro", "n:bia", november.getAsJsonArray("jogadores").get(0).getAsJsonObject().get("key").getAsString());
        assertEquals(400, admin.handle("GET", "ranking/novembro", auth, new byte[0], "ip").status());
    }
}
