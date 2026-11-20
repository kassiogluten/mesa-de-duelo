package mesadeduelo.bridge;

import static org.junit.Assert.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/** Aviso do servidor: o admin marca, todas as conexões recebem, e ele some no horário ou quando é retirado. */
public class ServerNoticeTest {
    @Rule public TemporaryFolder tmp = new TemporaryFolder();
    private final AtomicLong now = new AtomicLong(1_000_000_000L);
    private final List<String> sent = new ArrayList<>();

    private ServerNotice notice() {
        ServerNotice n = new ServerNotice(now::get);
        n.broadcaster(sent::add);
        return n;
    }

    private static JsonObject parse(String json) { return JsonParser.parseString(json).getAsJsonObject(); }
    private static JsonObject json(Admin.Response r) { return parse(new String(r.body(), StandardCharsets.UTF_8)); }

    @Test public void settingTheNoticeSendsItToEveryoneAndItExpiresAfterTheTime() {
        ServerNotice n = notice();
        long at = now.get() + 30 * 60_000L;
        n.set("  O servidor reinicia às {hora}.  ", at);
        assertEquals(1, sent.size());
        JsonObject message = parse(sent.get(0));
        assertEquals("server-notice", message.get("type").getAsString());
        assertEquals("O servidor reinicia às {hora}.", message.getAsJsonObject("notice").get("text").getAsString());
        assertEquals(at, message.getAsJsonObject("notice").get("at").getAsLong());

        now.set(at + ServerNotice.EXPIRES_AFTER_MS - 1);
        assertNotNull("vale um pouco depois do horário, se o reinício atrasar", n.current());
        now.set(at + ServerNotice.EXPIRES_AFTER_MS + 1);
        assertNull(n.current());
        assertTrue(n.json().get("notice").isJsonNull());
    }

    @Test public void clearingTellsEveryoneToRemoveTheBanner() {
        ServerNotice n = notice();
        n.set("Manutenção hoje à noite.", 0);
        n.clear();
        assertEquals(2, sent.size());
        assertTrue(parse(sent.get(1)).get("notice").isJsonNull());
        n.clear();
        assertEquals("retirar sem aviso não manda nada", 2, sent.size());
    }

    @Test public void refusesEmptyLongPastOrTimelessHourText() {
        ServerNotice n = notice();
        assertThrows(IllegalArgumentException.class, () -> n.set("   ", 0));
        assertThrows(IllegalArgumentException.class, () -> n.set("x".repeat(ServerNotice.MAX_TEXT + 1), 0));
        assertThrows(IllegalArgumentException.class, () -> n.set("Já passou.", now.get() - 1));
        assertThrows(IllegalArgumentException.class, () -> n.set("Longe demais.", now.get() + ServerNotice.MAX_AHEAD_MS + 1));
        assertThrows(IllegalArgumentException.class, () -> n.set("Reinicia às {hora}.", 0));
        assertTrue(sent.isEmpty());
    }

    @Test public void theAdminAreaSetsShowsAndClearsTheNotice() throws IOException {
        Admin admin = new Admin(new FeedbackStore(tmp.getRoot().toPath(), 1L << 30, Duration.ofDays(90), 0), com.google.gson.JsonArray::new, null, "abre-te", now::get);
        ServerNotice n = notice();
        admin.notice(n, () -> 7);
        assertEquals(401, admin.handle("PUT", "aviso", null, "{}".getBytes(StandardCharsets.UTF_8), "ip").status());
        String auth = "Bearer " + json(admin.handle("POST", "login", null, "{\"password\":\"abre-te\"}".getBytes(StandardCharsets.UTF_8), "ip")).get("token").getAsString();

        long at = now.get() + 15 * 60_000L;
        Admin.Response put = admin.handle("PUT", "aviso", auth, ("{\"text\":\"Reinício às {hora}.\",\"at\":" + at + "}").getBytes(StandardCharsets.UTF_8), "ip");
        assertEquals(200, put.status());
        JsonObject got = json(admin.handle("GET", "aviso", auth, new byte[0], "ip"));
        assertEquals("Reinício às {hora}.", got.getAsJsonObject("notice").get("text").getAsString());
        assertEquals(7, got.get("conexoes").getAsInt());

        Admin.Response bad = admin.handle("PUT", "aviso", auth, "{\"text\":\"\"}".getBytes(StandardCharsets.UTF_8), "ip");
        assertEquals(400, bad.status());
        assertEquals("Escreva o texto do aviso.", json(bad).get("error").getAsString());

        assertEquals(200, admin.handle("DELETE", "aviso", auth, new byte[0], "ip").status());
        assertNull(n.current());
    }
}
