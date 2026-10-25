package mesadeduelo.bridge;

import static org.junit.Assert.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class AdminTest {
    @Rule public TemporaryFolder tmp = new TemporaryFolder();
    private final AtomicLong now = new AtomicLong(1_000_000);

    private FeedbackStore store() throws IOException { return new FeedbackStore(tmp.getRoot().toPath(), 1L << 30, Duration.ofDays(90), 0); }

    private static byte[] body(String json) { return json.getBytes(StandardCharsets.UTF_8); }
    private static JsonObject json(Admin.Response r) { return JsonParser.parseString(new String(r.body(), StandardCharsets.UTF_8)).getAsJsonObject(); }

    private String login(Admin admin) {
        Admin.Response r = admin.handle("POST", "login", null, body("{\"password\":\"abre-te\"}"), "1.2.3.4");
        assertEquals(200, r.status());
        return "Bearer " + json(r).get("token").getAsString();
    }

    private String report(FeedbackStore store, String description) throws IOException {
        Feedback feedback = new Feedback(store, (code, token) -> null);
        Feedback.Response r = feedback.handle(FeedbackTest.gzip(FeedbackTest.report("erro", description, null)), null, null, "9.9.9." + description.length());
        return JsonParser.parseString(r.json()).getAsJsonObject().get("code").getAsString();
    }

    @Test public void withoutAPasswordTheAreaIsOff() throws IOException {
        Admin admin = new Admin(store(), "", now::get);
        assertFalse(admin.enabled());
        assertEquals(503, admin.handle("POST", "login", null, body("{\"password\":\"\"}"), "ip").status());
        assertEquals(503, admin.handle("GET", "relatos", null, new byte[0], "ip").status());
    }

    @Test public void loginLocksAfterFiveWrongPasswordsAndSessionsExpire() throws IOException {
        Admin admin = new Admin(store(), "abre-te", now::get);
        assertEquals(401, admin.handle("GET", "relatos", null, new byte[0], "ip").status());
        assertEquals(401, admin.handle("GET", "relatos", "Bearer inventado", new byte[0], "ip").status());
        for (int i = 0; i < 5; i++) assertEquals(401, admin.handle("POST", "login", null, body("{\"password\":\"errada\"}"), "5.5.5.5").status());
        assertEquals("locked even with the right password", 429, admin.handle("POST", "login", null, body("{\"password\":\"abre-te\"}"), "5.5.5.5").status());
        String auth = login(admin);
        assertEquals(200, admin.handle("GET", "relatos", auth, new byte[0], "ip").status());
        now.addAndGet(Admin.SESSION_MILLIS + 1);
        assertEquals(401, admin.handle("GET", "relatos", auth, new byte[0], "ip").status());
        now.addAndGet(Admin.FAILURE_WINDOW);
        assertEquals(200, admin.handle("POST", "login", null, body("{\"password\":\"abre-te\"}"), "5.5.5.5").status());
        String other = login(admin);
        assertEquals(200, admin.handle("POST", "logout", other, new byte[0], "ip").status());
        assertEquals(401, admin.handle("GET", "relatos", other, new byte[0], "ip").status());
    }

    @Test public void listsLiveMatchesWithoutSecrets() throws IOException {
        Session waiting = Session.room("ABCD", null, "Ana", new forge.deck.Deck("Elfos"), new MatchConfig("commander", "bo1", 4));
        JsonObject summary = waiting.adminJson();
        assertEquals("aguardando", summary.get("state").getAsString());
        assertEquals(4, summary.get("playerCount").getAsInt());
        JsonObject ana = summary.getAsJsonArray("players").get(0).getAsJsonObject();
        assertEquals("Ana", ana.get("name").getAsString()); assertFalse(ana.get("connected").getAsBoolean()); assertEquals("Elfos", ana.get("deck").getAsString());
        assertFalse("no seat token in the summary", summary.toString().contains(waiting.seats[0].token));

        var all = new com.google.gson.JsonArray(); all.add(summary);
        Admin admin = new Admin(store(), () -> all, null, "abre-te", now::get);
        assertEquals(401, admin.handle("GET", "partidas", null, new byte[0], "ip").status());
        JsonObject list = json(admin.handle("GET", "partidas", login(admin), new byte[0], "ip"));
        assertEquals("ABCD", list.getAsJsonArray("partidas").get(0).getAsJsonObject().get("code").getAsString());
    }

    @Test public void listsDownloadsTracksStatusAndDeletes() throws IOException {
        FeedbackStore store = store();
        String first = report(store, "A carta   sumiu\nda mão"), second = report(store, "x".repeat(300));
        Admin admin = new Admin(store, "abre-te", now::get);
        String auth = login(admin);

        JsonObject list = json(admin.handle("GET", "relatos", auth, new byte[0], "ip"));
        var items = list.getAsJsonArray("relatos");
        assertEquals(2, items.size());
        JsonObject one = items.get(0).getAsJsonObject();
        assertEquals("A carta sumiu da mão", one.get("summary").getAsString());
        assertEquals("novo", one.getAsJsonObject("status").get("status").getAsString());
        assertFalse("paths stay on the server", one.has("path"));
        assertEquals(160, items.get(1).getAsJsonObject().get("summary").getAsString().length());

        Admin.Response file = admin.handle("GET", "relatos/" + first.toLowerCase(), auth, new byte[0], "ip");
        assertEquals("application/gzip", file.contentType());
        assertEquals(0x1f, file.body()[0] & 0xff);

        Admin.Response saved = admin.handle("PUT", "relatos/" + first + "/estado", auth, body("{\"status\":\"issue\",\"issue\":\"#42\",\"note\":\" repete no turno 3 \"}"), "ip");
        assertEquals(200, saved.status());
        assertEquals(400, admin.handle("PUT", "relatos/" + first + "/estado", auth, body("{\"status\":\"talvez\"}"), "ip").status());
        assertEquals(404, admin.handle("PUT", "relatos/R-NADA/estado", auth, body("{\"status\":\"visto\"}"), "ip").status());

        // O estado sobrevive a reiniciar a ponte.
        FeedbackStore reopened = store();
        assertEquals("#42", reopened.status(first).issue());
        assertEquals("repete no turno 3", reopened.status(first).note());

        assertEquals(200, admin.handle("DELETE", "relatos/" + first, auth, new byte[0], "ip").status());
        assertEquals(404, admin.handle("GET", "relatos/" + first, auth, new byte[0], "ip").status());
        assertEquals(1, store.files());
        assertNull(store().status(first));
        assertEquals(second, store().entries().get(0).code());
    }
}
