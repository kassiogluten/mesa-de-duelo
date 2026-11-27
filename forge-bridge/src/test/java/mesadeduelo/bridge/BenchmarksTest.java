package mesadeduelo.bridge;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class BenchmarksTest {
    @Rule public TemporaryFolder tmp = new TemporaryFolder();
    private final AtomicLong now = new AtomicLong(Instant.parse("2026-11-26T15:00:00Z").toEpochMilli());

    private static final String VALID = """
        {"versao":"0.258.0","modo":"commander","nota":72,"fps":54.37,"fps1":31.2,"travadas":3,"quadros":3200,"duracaoMs":60000,
         "degrau":1,"efeitos":"auto","segredo":"fora",
         "aparelho":{"tela":"412x915@2.6","nucleos":8,"memoria":4,"gpu":"Adreno 650","modelo":"SM-A515F","navegador":"Chrome 131","sistema":"Android 14","movel":true,"hz":120,"ua":"Mozilla/5.0"},
         "cenas":[{"nome":"Abertura","fps":60,"fps1":50,"travadas":0,"extra":1},{"nome":"Combate","fps":40.04,"fps1":22,"travadas":3}]}
        """;

    private static byte[] body(String json) { return json.getBytes(StandardCharsets.UTF_8); }
    private Benchmarks benchmarks() { return new Benchmarks(tmp.getRoot().toPath().resolve("desempenho.json"), now::get); }
    private static JsonObject first(Benchmarks b) { return b.json().getAsJsonArray("resultados").get(0).getAsJsonObject(); }

    @Test public void keepsOnlyTheKnownFieldsWithAnIdAndTheTime() {
        Benchmarks b = benchmarks();
        assertEquals(204, b.handle(body(VALID), "1.1.1.1"));
        JsonObject r = first(b);
        assertTrue(r.get("id").getAsString().length() >= 8);
        assertEquals("2026-11-26T15:00:00Z", r.get("quando").getAsString());
        assertEquals("commander", r.get("modo").getAsString());
        assertEquals(72, r.get("nota").getAsInt());
        assertEquals(54.4, r.get("fps").getAsDouble(), 1e-9);
        assertEquals(1, r.get("degrau").getAsInt());
        assertFalse("campo desconhecido sai", r.has("segredo"));
        JsonObject device = r.getAsJsonObject("aparelho");
        assertFalse("nada de user-agent cru", device.has("ua"));
        assertEquals("Adreno 650", device.get("gpu").getAsString());
        assertEquals("SM-A515F", device.get("modelo").getAsString());
        assertTrue(device.get("movel").getAsBoolean());
        JsonArray scenes = r.getAsJsonArray("cenas");
        assertEquals(2, scenes.size());
        assertFalse(scenes.get(0).getAsJsonObject().has("extra"));
        assertEquals(40.0, scenes.get(1).getAsJsonObject().get("fps").getAsDouble(), 1e-9);
    }

    @Test public void refusesWhatIsNotAResult() {
        Benchmarks b = benchmarks();
        assertEquals(400, b.handle(body("[1,2]"), "1.1.1.1"));
        assertEquals(400, b.handle(body("nada"), "1.1.1.1"));
        assertEquals(400, b.handle(body("{\"modo\":\"pauper\",\"nota\":50}"), "1.1.1.1"));
        assertEquals("sem nota", 400, b.handle(body("{\"modo\":\"duelo\"}"), "1.1.1.1"));
        assertEquals(400, b.handle(body("{\"modo\":\"duelo\",\"nota\":101}"), "1.1.1.1"));
        assertEquals(400, b.handle(body("{\"modo\":\"duelo\",\"nota\":50.5}"), "1.1.1.1"));
        assertEquals(400, b.handle(body("{\"modo\":\"duelo\",\"nota\":50,\"fps\":NaN}"), "1.1.1.1"));
        assertEquals(400, b.handle(body("{\"modo\":\"duelo\",\"nota\":50,\"degrau\":4}"), "1.1.1.1"));
        assertEquals(400, b.handle(body("{\"modo\":\"duelo\",\"nota\":50,\"aparelho\":\"x\"}"), "1.1.1.1"));
        assertEquals(400, b.handle(body("{\"modo\":\"duelo\",\"nota\":50,\"cenas\":[{\"fps\":3}]}"), "1.1.1.1"));
        assertEquals(413, b.handle(body("{\"modo\":\"duelo\",\"nota\":50,\"efeitos\":\"" + "x".repeat(Benchmarks.MAX_BODY) + "\"}"), "1.1.1.1"));
        assertEquals(0, b.size());
        assertEquals("degrau e campos opcionais podem faltar", 204, b.handle(body("{\"modo\":\"duelo\",\"nota\":0,\"degrau\":null}"), "1.1.1.1"));
        assertTrue(first(b).get("degrau").isJsonNull());
    }

    @Test public void cutsLongTextsAndTooManyScenes() {
        Benchmarks b = benchmarks();
        StringBuilder scenes = new StringBuilder();
        for (int i = 0; i < 30; i++) scenes.append(i == 0 ? "" : ",").append("{\"nome\":\"c").append(i).append("\",\"fps\":60}");
        assertEquals(204, b.handle(body("{\"modo\":\"duelo\",\"nota\":90,\"aparelho\":{\"gpu\":\"" + "g".repeat(300) + "\",\"modelo\":\"" + "m".repeat(100) + "\"},\"cenas\":[" + scenes + "]}"), "1.1.1.1"));
        JsonObject r = first(b);
        assertEquals(Benchmarks.MAX_TEXT, r.getAsJsonObject("aparelho").get("gpu").getAsString().length());
        assertEquals(Benchmarks.MAX_MODEL, r.getAsJsonObject("aparelho").get("modelo").getAsString().length());
        assertEquals(Benchmarks.MAX_SCENES, r.getAsJsonArray("cenas").size());
    }

    @Test public void keepsTheLatestThousandOnDiskWithoutTheAddress() throws Exception {
        Path file = tmp.getRoot().toPath().resolve("desempenho.json");
        Benchmarks b = new Benchmarks(file, now::get);
        for (int i = 0; i < Benchmarks.MAX_RESULTS + 5; i++) {
            now.addAndGet(1000);
            assertEquals(204, b.handle(body("{\"modo\":\"duelo\",\"nota\":" + (i % 101) + "}"), "10.0." + (i / 250) + "." + (i % 250)));
        }
        assertEquals(Benchmarks.MAX_RESULTS, b.size());
        assertFalse("nada do jogador no arquivo", Files.readString(file).contains("10.0."));
        Benchmarks again = new Benchmarks(file, now::get);
        assertEquals(Benchmarks.MAX_RESULTS, again.size());
        JsonArray list = again.json().getAsJsonArray("resultados");
        assertEquals("o mais novo primeiro", (Benchmarks.MAX_RESULTS + 4) % 101, list.get(0).getAsJsonObject().get("nota").getAsInt());
        assertEquals("os 5 mais antigos saíram", 5 % 101, list.get(list.size() - 1).getAsJsonObject().get("nota").getAsInt());
    }

    @Test public void oneAddressCannotFloodTheList() {
        Benchmarks b = benchmarks();
        for (int i = 0; i < Benchmarks.MAX_PER_WINDOW; i++) assertEquals(204, b.handle(body(VALID), "3.3.3.3"));
        assertEquals(429, b.handle(body(VALID), "3.3.3.3"));
        assertEquals("outro endereço continua mandando", 204, b.handle(body(VALID), "4.4.4.4"));
        now.addAndGet(Benchmarks.WINDOW);
        assertEquals(204, b.handle(body(VALID), "3.3.3.3"));
        assertEquals(Benchmarks.MAX_PER_WINDOW + 2, b.size());
    }

    @Test public void theAdminAreaListsAndDeletes() throws Exception {
        Path file = tmp.getRoot().toPath().resolve("desempenho.json");
        Benchmarks b = new Benchmarks(file, now::get);
        b.handle(body(VALID), "1.1.1.1");
        now.addAndGet(1000);
        b.handle(body("{\"modo\":\"duelo\",\"nota\":10}"), "1.1.1.1");
        Admin admin = new Admin(new FeedbackStore(tmp.newFolder("relatos").toPath(), 1L << 30, java.time.Duration.ofDays(90), 0), "abre-te", now::get);
        String auth = login(admin);
        assertEquals("sem os resultados ligados", 404, admin.handle("GET", "desempenho", auth, new byte[0], "ip").status());
        admin.benchmarks(b);
        assertEquals(401, admin.handle("GET", "desempenho", null, new byte[0], "ip").status());
        Admin.Response r = admin.handle("GET", "desempenho", auth, new byte[0], "ip");
        assertEquals(200, r.status());
        JsonArray list = JsonParser.parseString(new String(r.body(), StandardCharsets.UTF_8)).getAsJsonObject().getAsJsonArray("resultados");
        assertEquals(2, list.size());
        assertEquals("duelo", list.get(0).getAsJsonObject().get("modo").getAsString());
        String id = list.get(0).getAsJsonObject().get("id").getAsString();
        assertEquals(200, admin.handle("DELETE", "desempenho/" + id, auth, new byte[0], "ip").status());
        assertEquals(404, admin.handle("DELETE", "desempenho/" + id, auth, new byte[0], "ip").status());
        assertEquals(1, b.size());
        assertEquals("apagado também no arquivo", 1, new Benchmarks(file, now::get).size());
    }

    private static String login(Admin admin) {
        Admin.Response r = admin.handle("POST", "login", null, "{\"password\":\"abre-te\"}".getBytes(StandardCharsets.UTF_8), "1.2.3.4");
        return "Bearer " + JsonParser.parseString(new String(r.body(), StandardCharsets.UTF_8)).getAsJsonObject().get("token").getAsString();
    }
}
