package mesadeduelo.bridge;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.LongSupplier;
import java.util.regex.Pattern;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import io.micrometer.core.instrument.Counter;

/**
 * As impressões de uma carta, para trocar a arte no deck (GET /api/deck/impressoes?carta=ORACLE_ID&nome=NOME).
 *
 * <p>O Scryfall é consultado uma vez por carta a cada {@link #TTL} ({@code /cards/search} com {@code unique=prints}),
 * pela mesma fila do {@link CardDataCache}, e a lista fica em disco e na memória para todos: abrir a troca de arte da
 * mesma carta em outro aparelho não chega ao Scryfall. Quem pede a mesma carta ao mesmo tempo espera a mesma busca.
 * Com o Scryfall fora do ar, vale a lista guardada, mesmo vencida.
 *
 * <p>Só saem as impressões que o Forge conhece ({@link Known}): a arte escolhida vai no deck, e a partida só mostra
 * a todos a impressão que ela consegue montar.
 */
final class CardPrints {
    static final long TTL = TimeUnit.DAYS.toMillis(7);
    /** Páginas de 175 impressões: Sol Ring e os básicos passam de 400. */
    static final int MAX_PAGES = 4;
    /** Cartas esperando o Scryfall: passou disso, responde que está ocupado. */
    static final int MAX_PENDING = 100;
    static final int MEMORY = 3000;
    private static final Pattern UUID = Pattern.compile("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");

    /** O Forge tem a impressão (série do Scryfall e número) desta carta? */
    interface Known { boolean has(String name, String set, String cn); }

    private record Entry(JsonArray prints, long savedAt) { }

    private static final Counter HITS = Counter.builder("mesa.impressoes.hits").description("Listas de impressões servidas do cache").register(Metrics.REGISTRY);
    private static final Counter CALLS = Counter.builder("mesa.impressoes.scryfall").description("Listas de impressões buscadas no Scryfall").register(Metrics.REGISTRY);

    private final Path dir;
    private final CardDataCache.Scryfall scryfall;
    private final Known known;
    private final LongSupplier clock;
    private final ExecutorService queue;
    private final Map<String, Entry> memory = new LinkedHashMap<>(256, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, Entry> eldest) { return size() > MEMORY; }
    };
    private final Map<String, CompletableFuture<JsonArray>> pending = new HashMap<>();

    CardPrints(Path dir, CardDataCache.Scryfall scryfall, Known known, LongSupplier clock, ExecutorService queue) {
        this.dir = dir; this.scryfall = scryfall; this.known = known; this.clock = clock; this.queue = queue;
    }

    /** Ao lado do cache de dados das cartas ({@code ~/.forge/mesa-impressoes}): é só um cache, refeito se sumir. */
    static CardPrints fromSystem(CardDataCache cards) {
        String dir = System.getProperty("mesa.impressoes.dir", System.getProperty("user.home") + "/.forge/mesa-impressoes");
        ExecutorService queue = Executors.newSingleThreadExecutor(r -> { Thread t = new Thread(r, "impressoes-scryfall"); t.setDaemon(true); return t; });
        return new CardPrints(Path.of(dir), cards.scryfall(), DeckValidation::knowsPrint, System::currentTimeMillis, queue);
    }

    /** {impressoes: [...]}: as impressões da carta que a partida mostra, da mais nova para a mais antiga. */
    CompletableFuture<JsonObject> list(String oracleId, String name) {
        if (oracleId == null || !UUID.matcher(oracleId).matches()) throw new IllegalArgumentException("Carta inválida.");
        if (!CardDataCache.validName(name)) throw new IllegalArgumentException("Carta inválida.");
        return prints(oracleId).thenApply(all -> {
            JsonArray out = new JsonArray();
            for (JsonElement e : all) {
                JsonObject p = e.getAsJsonObject();
                if (known.has(name, p.get("set").getAsString(), p.get("cn").getAsString())) out.add(p);
            }
            JsonObject o = new JsonObject();
            o.add("impressoes", out);
            return o;
        });
    }

    /** Todas as impressões guardadas da carta (sem o filtro do Forge), buscando no Scryfall se vencidas. */
    synchronized CompletableFuture<JsonArray> prints(String oracleId) {
        Entry entry = memory.get(oracleId);
        if (entry == null && (entry = readDisk(oracleId)) != null) memory.put(oracleId, entry);
        if (entry != null && clock.getAsLong() - entry.savedAt() < TTL) { HITS.increment(); return CompletableFuture.completedFuture(entry.prints()); }
        CompletableFuture<JsonArray> running = pending.get(oracleId);
        if (running != null) return running;
        Entry stale = entry;
        if (pending.size() >= MAX_PENDING) {
            if (stale != null) return CompletableFuture.completedFuture(stale.prints());
            return CompletableFuture.failedFuture(new IllegalStateException("fila cheia"));
        }
        CompletableFuture<JsonArray> f = CompletableFuture.supplyAsync(() -> {
            try { return fetch(oracleId); }
            catch (IOException e) { throw new CompletionException(e); }
        }, queue).handle((prints, error) -> {
            synchronized (this) { pending.remove(oracleId); }
            if (error == null) { save(oracleId, prints); return prints; }
            if (stale != null) { Log.bridge().warn("Impressões: Scryfall falhou, usando a lista guardada (" + error + ")"); return stale.prints(); }
            throw error instanceof CompletionException c ? c : new CompletionException(error);
        });
        pending.put(oracleId, f);
        return f;
    }

    private JsonArray fetch(String oracleId) throws IOException {
        JsonArray out = new JsonArray();
        String q = URLEncoder.encode("oracleid:" + oracleId, StandardCharsets.UTF_8);
        for (int page = 1; page <= MAX_PAGES; page++) {
            CALLS.increment();
            JsonObject json = scryfall.get("/cards/search?q=" + q + "&unique=prints&order=released&dir=desc&page=" + page);
            if (json == null || !json.has("data")) break;
            for (JsonElement e : json.getAsJsonArray("data")) {
                JsonObject p = e.isJsonObject() ? slimPrint(e.getAsJsonObject()) : null;
                if (p != null) out.add(p);
            }
            if (!json.has("has_more") || !json.get("has_more").getAsBoolean()) break;
        }
        return out;
    }

    /** Os campos que a troca de arte mostra; null para impressões só digitais ou sem série e número. */
    static JsonObject slimPrint(JsonObject d) {
        if (bool(d, "digital")) return null;
        String set = string(d, "set"), cn = string(d, "collector_number");
        if (set == null || cn == null) return null;
        JsonObject p = new JsonObject();
        p.addProperty("set", set.toLowerCase());
        p.addProperty("cn", cn);
        copy(d, "set_name", p, "setName");
        copy(d, "released_at", p, "released");
        copy(d, "rarity", p, "rarity");
        copy(d, "artist", p, "artist");
        copy(d, "border_color", p, "border");
        if (bool(d, "full_art")) p.addProperty("fullArt", true);
        if (bool(d, "promo")) p.addProperty("promo", true);
        if (d.has("frame_effects") && d.get("frame_effects").isJsonArray()) p.add("frame", d.get("frame_effects").deepCopy());
        if (d.has("finishes") && d.get("finishes").isJsonArray()) p.add("finishes", d.get("finishes").deepCopy());
        if (d.has("prices") && d.get("prices").isJsonObject()) {
            JsonObject prices = d.getAsJsonObject("prices");
            for (String k : new String[]{"usd", "usd_foil", "usd_etched"}) { String v = string(prices, k); if (v != null) { p.addProperty("usd", v); break; } }
        }
        JsonObject image = images(d);
        JsonArray faces = new JsonArray();
        if (d.has("card_faces") && d.get("card_faces").isJsonArray()) {
            for (JsonElement f : d.getAsJsonArray("card_faces")) {
                if (!f.isJsonObject()) continue;
                JsonObject face = images(f.getAsJsonObject());
                if (face == null) continue;
                JsonObject o = new JsonObject();
                copy(f.getAsJsonObject(), "name", o, "name");
                o.add("image", face);
                faces.add(o);
            }
        }
        if (image == null && !faces.isEmpty()) image = faces.get(0).getAsJsonObject().getAsJsonObject("image");
        if (image == null) return null;
        p.add("image", image);
        if (!faces.isEmpty()) p.add("faces", faces);
        return p;
    }

    private static JsonObject images(JsonObject o) {
        if (!o.has("image_uris") || !o.get("image_uris").isJsonObject()) return null;
        JsonObject u = o.getAsJsonObject("image_uris"), out = new JsonObject();
        for (String size : new String[]{"small", "normal", "art_crop"}) copy(u, size, out, size);
        return out.size() == 0 ? null : out;
    }

    // ---- Disco ----

    private Path file(String oracleId) { return dir.resolve(oracleId + ".json"); }

    private Entry readDisk(String oracleId) {
        try {
            Path f = file(oracleId);
            if (!Files.isRegularFile(f)) return null;
            JsonObject o = JsonParser.parseString(Files.readString(f)).getAsJsonObject();
            return new Entry(o.getAsJsonArray("impressoes"), o.get("salvaEm").getAsLong());
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    private synchronized void save(String oracleId, JsonArray prints) {
        long now = clock.getAsLong();
        memory.put(oracleId, new Entry(prints, now));
        JsonObject o = new JsonObject();
        o.addProperty("salvaEm", now);
        o.add("impressoes", prints);
        try {
            Files.createDirectories(dir);
            Path tmp = Files.createTempFile(dir, ".gravando-", ".tmp");
            try {
                Files.writeString(tmp, o.toString());
                Files.move(tmp, file(oracleId), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } finally {
                Files.deleteIfExists(tmp);
            }
        } catch (IOException e) {
            Log.bridge().warn("Impressões: não deu para guardar em disco (" + e + ")");
        }
    }

    // ---- Auxiliares ----

    private static String string(JsonObject o, String key) {
        return o.has(key) && o.get(key).isJsonPrimitive() ? o.get(key).getAsString() : null;
    }

    private static boolean bool(JsonObject o, String key) {
        return o.has(key) && o.get(key).isJsonPrimitive() && o.get(key).getAsBoolean();
    }

    private static void copy(JsonObject from, String key, JsonObject to, String as) {
        String v = string(from, key);
        if (v != null) to.addProperty(as, v);
    }
}
