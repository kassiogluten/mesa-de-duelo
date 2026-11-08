package mesadeduelo.bridge;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class FunnelTest {
    @Rule public TemporaryFolder tmp = new TemporaryFolder();
    /** Quarta-feira, 4 de novembro de 2026: a semana começa na segunda, dia 2. */
    private final AtomicLong now = new AtomicLong(Instant.parse("2026-11-04T15:00:00Z").toEpochMilli());

    private static byte[] event(String name) { return ("{\"evento\":\"" + name + "\"}").getBytes(StandardCharsets.UTF_8); }

    @Test public void weeksStartOnMondayInUtc() {
        assertEquals("2026-11-02", Funnel.week(Instant.parse("2026-11-02T00:00:00Z").toEpochMilli()));
        assertEquals("2026-11-02", Funnel.week(Instant.parse("2026-11-08T23:59:59Z").toEpochMilli()));
        assertEquals("2026-11-09", Funnel.week(Instant.parse("2026-11-09T00:00:00Z").toEpochMilli()));
    }

    @Test public void countsOnlyKnownEventsPerWeekAndKeepsThemOnDisk() throws Exception {
        Path file = tmp.getRoot().toPath().resolve("funil.json");
        Funnel funnel = new Funnel(file, now::get);
        assertEquals(204, funnel.handle(event("jogar"), "1.1.1.1"));
        assertEquals(204, funnel.handle(event("deck"), "1.1.1.1"));
        assertEquals(204, funnel.handle(event("partida-ia"), "2.2.2.2"));
        assertEquals(400, funnel.handle(event("visita"), "1.1.1.1"));
        assertEquals(400, funnel.handle("nada".getBytes(StandardCharsets.UTF_8), "1.1.1.1"));
        now.addAndGet(7 * 86_400_000L);
        assertEquals(204, funnel.handle(event("partida-sala"), "1.1.1.1"));

        String saved = Files.readString(file);
        assertFalse("nada do jogador no arquivo", saved.contains("1.1.1.1"));
        JsonObject json = new Funnel(file, now::get).json();
        var weeks = json.getAsJsonArray("semanas");
        assertEquals(2, weeks.size());
        JsonObject latest = weeks.get(0).getAsJsonObject(), first = weeks.get(1).getAsJsonObject();
        assertEquals("2026-11-09", latest.get("semana").getAsString());
        assertEquals(1, latest.get("partida-sala").getAsInt());
        assertEquals(0, latest.get("jogar").getAsInt());
        assertEquals("2026-11-02", first.get("semana").getAsString());
        assertEquals(1, first.get("jogar").getAsInt());
        assertEquals(1, first.get("deck").getAsInt());
        assertEquals(1, first.get("partida-ia").getAsInt());
    }

    @Test public void oneAddressCannotInflateTheNumbers() {
        Funnel funnel = new Funnel(tmp.getRoot().toPath().resolve("funil.json"), now::get);
        for (int i = 0; i < Funnel.MAX_PER_WINDOW; i++) assertEquals(204, funnel.handle(event("deck"), "3.3.3.3"));
        assertEquals(429, funnel.handle(event("deck"), "3.3.3.3"));
        assertEquals("outro endereço continua contando", 204, funnel.handle(event("deck"), "4.4.4.4"));
        now.addAndGet(Funnel.WINDOW);
        assertEquals(204, funnel.handle(event("deck"), "3.3.3.3"));
        assertEquals(Funnel.MAX_PER_WINDOW + 2, funnel.json().getAsJsonArray("semanas").get(0).getAsJsonObject().get("deck").getAsInt());
    }

    @Test public void theAdminAreaReadsTheWeeks() throws Exception {
        Funnel funnel = new Funnel(tmp.getRoot().toPath().resolve("funil.json"), now::get);
        funnel.handle(event("jogar"), "1.1.1.1");
        Admin admin = new Admin(new FeedbackStore(tmp.newFolder("relatos").toPath(), 1L << 30, java.time.Duration.ofDays(90), 0), "abre-te", now::get);
        assertEquals("sem o funil ligado", 404, admin.handle("GET", "funil", login(admin), new byte[0], "ip").status());
        admin.funnel(funnel);
        assertEquals(401, admin.handle("GET", "funil", null, new byte[0], "ip").status());
        Admin.Response r = admin.handle("GET", "funil", login(admin), new byte[0], "ip");
        assertEquals(200, r.status());
        JsonObject week = JsonParser.parseString(new String(r.body(), StandardCharsets.UTF_8)).getAsJsonObject().getAsJsonArray("semanas").get(0).getAsJsonObject();
        assertEquals(1, week.get("jogar").getAsInt());
    }

    private static String login(Admin admin) {
        Admin.Response r = admin.handle("POST", "login", null, "{\"password\":\"abre-te\"}".getBytes(StandardCharsets.UTF_8), "1.2.3.4");
        return "Bearer " + JsonParser.parseString(new String(r.body(), StandardCharsets.UTF_8)).getAsJsonObject().get("token").getAsString();
    }
}
