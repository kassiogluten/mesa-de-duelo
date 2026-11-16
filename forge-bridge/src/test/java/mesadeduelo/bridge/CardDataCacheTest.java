package mesadeduelo.bridge;

import static org.junit.Assert.*;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.AbstractExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class CardDataCacheTest {
    @Rule public TemporaryFolder tmp = new TemporaryFolder();
    private final AtomicLong now = new AtomicLong(1_800_000_000_000L);

    /** A fila roda na hora, na própria thread do teste. */
    static final class Direct extends AbstractExecutorService {
        @Override public void execute(Runnable r) { r.run(); }
        @Override public void shutdown() {}
        @Override public List<Runnable> shutdownNow() { return List.of(); }
        @Override public boolean isShutdown() { return false; }
        @Override public boolean isTerminated() { return false; }
        @Override public boolean awaitTermination(long t, TimeUnit u) { return true; }
    }

    /** Scryfall falso: as cartas em inglês e as impressões em português que ele conhece, e os pedidos que recebeu. */
    static final class FakeScryfall implements CardDataCache.Scryfall {
        final Map<String, JsonObject> en = new HashMap<>(), pt = new HashMap<>();
        final List<String> calls = new ArrayList<>();
        boolean down;

        FakeScryfall card(String name, String... faces) {
            JsonObject c = new JsonObject();
            c.addProperty("name", name);
            c.addProperty("lang", "en");
            c.addProperty("layout", faces.length > 0 ? "transform" : "normal");
            c.addProperty("type_line", "Instant");
            c.addProperty("oracle_text", "Text of " + name);
            c.addProperty("prices", "não guardar");
            JsonObject legal = new JsonObject(); legal.addProperty("commander", "legal"); c.add("legalities", legal);
            JsonObject img = new JsonObject();
            img.addProperty("small", "https://cards.scryfall.io/small/front/a/b/x.jpg");
            img.addProperty("png", "https://cards.scryfall.io/png/front/a/b/x.png");
            c.add("image_uris", img);
            if (faces.length > 0) {
                JsonArray fs = new JsonArray();
                for (String f : faces) { JsonObject o = new JsonObject(); o.addProperty("name", f); o.addProperty("artist", "x"); fs.add(o); }
                c.add("card_faces", fs);
            }
            en.put(name.toLowerCase(), c);
            return this;
        }

        FakeScryfall portuguese(String name, String printed) {
            JsonObject c = en.get(name.toLowerCase()).deepCopy();
            c.addProperty("lang", "pt");
            c.addProperty("printed_name", printed);
            pt.put(name.toLowerCase(), c);
            return this;
        }

        @Override public JsonObject post(String path, JsonObject body) throws IOException {
            calls.add(path);
            if (down) throw new IOException("Scryfall respondeu 503");
            JsonArray data = new JsonArray(), missing = new JsonArray();
            for (JsonElement id : body.getAsJsonArray("identifiers")) {
                String asked = id.getAsJsonObject().get("name").getAsString().toLowerCase();
                JsonObject hit = en.values().stream().filter(c -> c.get("name").getAsString().toLowerCase().equals(asked)
                        || CardDataCache.lookupName(c.get("name").getAsString()).equalsIgnoreCase(asked)
                        || (c.has("card_faces") && c.getAsJsonArray("card_faces").toString().toLowerCase().contains("\"" + asked + "\""))).findFirst().orElse(null);
                if (hit != null) data.add(hit); else missing.add(id);
            }
            JsonObject o = new JsonObject(); o.add("data", data); o.add("not_found", missing);
            return o;
        }

        @Override public JsonObject get(String path) throws IOException {
            calls.add(path.substring(0, path.indexOf('?')));
            if (down) throw new IOException("Scryfall respondeu 503");
            String q = URLDecoder.decode(path.substring(path.indexOf("q=") + 2, path.indexOf('&')), StandardCharsets.UTF_8);
            JsonArray data = new JsonArray();
            for (var e : pt.entrySet()) if (q.toLowerCase().contains("!\"" + e.getKey() + "\"")) data.add(e.getValue());
            if (data.isEmpty()) return null;
            JsonObject o = new JsonObject(); o.add("data", data);
            return o;
        }
    }

    private CardDataCache cache(FakeScryfall s) throws IOException {
        return new CardDataCache(tmp.getRoot().toPath().resolve("cartas.jsonl"), s, now::get, new Direct());
    }

    private static JsonObject ask(CardDataCache cache, String... names) throws Exception {
        return JsonParser.parseString(cache.lookup(List.of(names)).get(5, TimeUnit.SECONDS).json()).getAsJsonObject();
    }

    private static JsonObject card(JsonObject result, String name) {
        for (JsonElement c : result.getAsJsonArray("cartas")) if (c.getAsJsonObject().get("name").getAsString().equals(name)) return c.getAsJsonObject();
        return null;
    }

    @Test public void aCardIsFetchedOnceWithItsPortuguesePrintingAndThenServedFromTheCache() throws Exception {
        FakeScryfall s = new FakeScryfall().card("Lightning Bolt").card("Opt").portuguese("Lightning Bolt", "Raio");
        CardDataCache cache = cache(s);
        JsonObject first = ask(cache, "Lightning Bolt", "Opt");
        assertEquals(List.of("/cards/collection", "/cards/search"), s.calls);
        JsonObject bolt = card(first, "Lightning Bolt");
        assertEquals("Raio", bolt.getAsJsonObject("pt").get("printed_name").getAsString());
        assertTrue("sem tradução, pt fica null (já procurada)", card(first, "Opt").get("pt").isJsonNull());
        assertEquals(now.get(), bolt.get("atualizada").getAsLong());
        assertFalse("só os campos que a mesa usa", bolt.has("prices"));
        assertFalse(bolt.getAsJsonObject("image_uris").has("png"));
        assertTrue(bolt.has("legalities"));
        assertFalse("a tradução não leva as legalidades", bolt.getAsJsonObject("pt").has("legalities"));

        s.calls.clear();
        JsonObject again = ask(cache, "lightning bolt", "Opt");
        assertEquals(List.of(), s.calls);
        assertEquals(2, again.getAsJsonArray("cartas").size());
    }

    @Test public void theFrontOfATwoFaceCardAndAFaceNameFindTheWholeCard() throws Exception {
        FakeScryfall s = new FakeScryfall().card("Delver of Secrets // Insectile Aberration", "Delver of Secrets", "Insectile Aberration");
        CardDataCache cache = cache(s);
        assertNotNull(card(ask(cache, "Delver of Secrets // Insectile Aberration"), "Delver of Secrets // Insectile Aberration"));
        assertEquals(1, s.calls.stream().filter("/cards/collection"::equals).count());
        s.calls.clear();
        assertNotNull(card(ask(cache, "Delver of Secrets"), "Delver of Secrets // Insectile Aberration"));
        assertEquals("a frente já foi aprendida", List.of(), s.calls);
        // O nome da face de trás só vale depois que o Scryfall disser que é desta carta (uma magia preparada pode ter o
        // nome de uma carta de verdade).
        assertNotNull(card(ask(cache, "Insectile Aberration"), "Delver of Secrets // Insectile Aberration"));
        assertEquals(List.of("/cards/collection"), s.calls);
    }

    @Test public void unknownNamesAreReportedAndNotAskedAgainForADay() throws Exception {
        FakeScryfall s = new FakeScryfall().card("Opt");
        CardDataCache cache = cache(s);
        JsonObject r = ask(cache, "Opt", "Not A Card");
        assertEquals("not a card", r.getAsJsonArray("faltam").get(0).getAsString());
        assertEquals(0, r.getAsJsonArray("depois").size());
        s.calls.clear();
        ask(cache, "Not A Card");
        assertEquals(List.of(), s.calls);
        now.addAndGet(CardDataCache.NOT_FOUND_TTL);
        ask(cache, "Not A Card");
        assertEquals(List.of("/cards/collection"), s.calls);
    }

    @Test public void oldLegalitiesAreRefreshedKeepingTheTranslation() throws Exception {
        FakeScryfall s = new FakeScryfall().card("Lightning Bolt").portuguese("Lightning Bolt", "Raio");
        CardDataCache cache = cache(s);
        ask(cache, "Lightning Bolt");
        now.addAndGet(CardDataCache.LEGALITY_TTL);
        s.en.get("lightning bolt").getAsJsonObject("legalities").addProperty("commander", "banned");
        s.calls.clear();
        JsonObject bolt = card(ask(cache, "Lightning Bolt"), "Lightning Bolt");
        assertEquals("só a coleção, sem buscar a tradução de novo", List.of("/cards/collection"), s.calls);
        assertEquals("banned", bolt.getAsJsonObject("legalities").get("commander").getAsString());
        assertEquals("Raio", bolt.getAsJsonObject("pt").get("printed_name").getAsString());
        assertEquals(now.get(), bolt.get("atualizada").getAsLong());
    }

    @Test public void withScryfallDownTheStoredCopyIsServedAndTheRestGoesToTheTable() throws Exception {
        FakeScryfall s = new FakeScryfall().card("Opt").card("Ponder");
        CardDataCache cache = cache(s);
        ask(cache, "Opt");
        now.addAndGet(CardDataCache.LEGALITY_TTL);
        s.down = true;
        JsonObject r = ask(cache, "Opt", "Ponder");
        assertNotNull("a cópia velha ainda vale", card(r, "Opt"));
        assertEquals("ponder", r.getAsJsonArray("depois").get(0).getAsString());
        s.calls.clear();
        ask(cache, "Ponder");
        assertEquals("pausa depois da falha", List.of(), s.calls);
        s.down = false;
        now.addAndGet(CardDataCache.FAILURE_PAUSE);
        assertNotNull(card(ask(cache, "Ponder"), "Ponder"));
    }

    @Test public void cardsSurviveARestartWithoutAskingScryfall() throws Exception {
        FakeScryfall s = new FakeScryfall().card("Lightning Bolt").portuguese("Lightning Bolt", "Raio");
        ask(cache(s), "Lightning Bolt");
        FakeScryfall later = new FakeScryfall();
        CardDataCache restarted = cache(later);
        assertEquals(1, restarted.size());
        JsonObject bolt = card(ask(restarted, "lightning bolt"), "Lightning Bolt");
        assertEquals(List.of(), later.calls);
        assertEquals("Raio", bolt.getAsJsonObject("pt").get("printed_name").getAsString());
    }

    @Test public void prewarmFetchesOnlyWhatIsNotStoredYet() throws Exception {
        FakeScryfall s = new FakeScryfall().card("Opt").card("Ponder").card("Brainstorm");
        CardDataCache cache = cache(s);
        ask(cache, "Opt");
        s.calls.clear();
        cache.prewarm(List.of("Opt", "Ponder", "Brainstorm", "Ponder"));
        assertEquals(List.of("/cards/collection", "/cards/search"), s.calls);
        assertEquals(3, cache.size());
        s.calls.clear();
        cache.prewarm(List.of("Opt", "Ponder", "Brainstorm"));
        assertEquals(List.of(), s.calls);
    }

    @Test public void onlyAListOfReasonableNamesIsAccepted() {
        assertEquals(List.of("Opt"), CardDataCache.names("{\"nomes\":[\"Opt\"]}".getBytes(StandardCharsets.UTF_8)));
        assertNull(CardDataCache.names("{\"nomes\":[]}".getBytes(StandardCharsets.UTF_8)));
        assertNull(CardDataCache.names("{\"nomes\":[\"a\\nb\"]}".getBytes(StandardCharsets.UTF_8)));
        assertNull(CardDataCache.names(("{\"nomes\":[\"" + "x".repeat(151) + "\"]}").getBytes(StandardCharsets.UTF_8)));
        assertNull(CardDataCache.names("não é json".getBytes(StandardCharsets.UTF_8)));
        JsonArray many = new JsonArray(); for (int i = 0; i <= CardDataCache.MAX_NAMES; i++) many.add("c" + i);
        assertNull(CardDataCache.names(("{\"nomes\":" + many + "}").getBytes(StandardCharsets.UTF_8)));
    }
}
