package mesadeduelo.bridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import io.micrometer.core.instrument.Counter;
import io.netty.buffer.ByteBufUtil;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelInboundHandlerAdapter;
import io.netty.handler.codec.http.FullHttpRequest;
import io.netty.handler.codec.http.HttpMethod;
import io.netty.handler.codec.http.QueryStringDecoder;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.Writer;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.LongSupplier;

/**
 * Dados das cartas pelo nosso cache (POST /api/cartas {nomes}): a carta do Scryfall, só com os campos que a mesa usa,
 * e a impressão em português, guardadas em disco e servidas a todos. A carta que ninguém pediu ainda é buscada no
 * Scryfall na primeira vez ({@code /cards/collection} e a busca {@code lang:pt}), numa fila só, no ritmo que ele pede;
 * os decks prontos entram aos poucos ao subir a ponte. As legalidades valem 24 horas. Com o Scryfall fora do ar, vale a
 * cópia guardada; a mesa pede direto a ele o que a ponte não conseguiu ({@code depois}), e também se a ponte falhar.
 */
final class CardDataCache {
    static final String PATH = "/api/cartas";
    static final int MAX_NAMES = 200;
    static final int MAX_NAME_LENGTH = 150;
    /** Versão dos registros guardados: um formato novo descarta os antigos, que são buscados de novo. */
    static final int FORMAT = 1;
    static final long LEGALITY_TTL = TimeUnit.HOURS.toMillis(24);
    static final long NOT_FOUND_TTL = TimeUnit.HOURS.toMillis(24);
    /** Depois de uma falha do Scryfall, a ponte espera este tanto antes de pedir de novo (serve o que tem). */
    static final long FAILURE_PAUSE = TimeUnit.SECONDS.toMillis(60);
    /** Quanto um pedido espera a fila antes de responder com o que já tem. */
    static final long WAIT = TimeUnit.SECONDS.toMillis(20);
    static final int COLLECTION_CHUNK = 75, PT_CHUNK = 30, PREWARM_CHUNK = 30;
    /** Nomes esperando o Scryfall: passou disso, a mesa vai direto a ele. */
    static final int MAX_PENDING = 2000;

    /** O que a ponte pede ao Scryfall; {@code null} quando ele responde 404. Nos testes, um falso. */
    interface Scryfall {
        JsonObject get(String path) throws IOException;
        JsonObject post(String path, JsonObject body) throws IOException;
    }

    /** Uma carta guardada: {@code json} é o objeto que vai na resposta, já com {@code pt} e {@code atualizada}. */
    record Entry(String name, String json, long updatedAt, boolean ptChecked, Set<String> aliases) {}

    /** O que responder: as cartas, os nomes que o Scryfall não conhece e os que a mesa deve pedir direto a ele. */
    record Result(List<String> cards, List<String> notFound, List<String> later) {
        String json() {
            StringBuilder out = new StringBuilder("{\"cartas\":[");
            for (int i = 0; i < cards.size(); i++) { if (i > 0) out.append(','); out.append(cards.get(i)); }
            out.append("],\"faltam\":").append(array(notFound)).append(",\"depois\":").append(array(later)).append('}');
            return out.toString();
        }
        private static String array(List<String> list) { JsonArray a = new JsonArray(); list.forEach(a::add); return a.toString(); }
    }

    private static final Counter HITS = Counter.builder("mesa.cartas.hits").description("Cartas servidas do cache de dados").register(Metrics.REGISTRY);
    private static final Counter MISSES = Counter.builder("mesa.cartas.misses").description("Cartas que o cache de dados foi buscar no Scryfall").register(Metrics.REGISTRY);
    private static final Counter CALLS = Counter.builder("mesa.cartas.scryfall").description("Pedidos do cache de dados ao Scryfall").register(Metrics.REGISTRY);
    private static final Counter FAILURES = Counter.builder("mesa.cartas.scryfall.failures").description("Pedidos do cache de dados que o Scryfall recusou ou não respondeu").register(Metrics.REGISTRY);

    private final Path file;
    private final Scryfall scryfall;
    private final LongSupplier clock;
    private final ExecutorService queue;
    /** Nome completo (minúsculas) → carta. */
    private final Map<String, Entry> cards = new HashMap<>();
    /** Nome pedido (minúsculas) → nome completo da carta que o Scryfall devolveu para ele. */
    private final Map<String, String> aliases = new HashMap<>();
    private final Map<String, Long> notFound = new HashMap<>();
    /** Nomes na fila do Scryfall: quem pede o mesmo nome espera a mesma busca. */
    private final Map<String, CompletableFuture<Void>> pending = new HashMap<>();
    private volatile long failedAt = Long.MIN_VALUE / 2;
    private int lines;

    CardDataCache(Path file, Scryfall scryfall, LongSupplier clock, ExecutorService queue) {
        this.file = file;
        this.scryfall = scryfall;
        this.clock = clock;
        this.queue = queue;
        load();
    }

    /** Na pasta da ponte ({@code ~/.forge/mesa-cartas}, no volume do Forge): é só um cache, refeito se sumir. */
    static CardDataCache fromSystem() {
        String dir = System.getProperty("mesa.cartas.dir", System.getProperty("user.home") + "/.forge/mesa-cartas");
        ExecutorService queue = Executors.newSingleThreadExecutor(r -> { Thread t = new Thread(r, "cartas-scryfall"); t.setDaemon(true); return t; });
        return new CardDataCache(Path.of(dir, "cartas.jsonl"), new HttpScryfall(), System::currentTimeMillis, queue);
    }

    Path file() { return file; }
    /** A fila do Scryfall: as impressões ({@link CardPrints}) passam por ela, no mesmo ritmo. */
    Scryfall scryfall() { return scryfall; }
    synchronized int size() { return cards.size(); }

    /** O nome que o {@code /cards/collection} acha: a frente de "Frente // Verso" (como {@code lookupName} na mesa). */
    static String lookupName(String name) {
        int at = name.indexOf(" // ");
        return (at >= 0 ? name.substring(0, at) : name).strip();
    }

    static boolean validName(String name) {
        return name != null && !name.isBlank() && name.length() <= MAX_NAME_LENGTH && name.chars().noneMatch(Character::isISOControl);
    }

    // ---- Pedidos ----

    /** As cartas destes nomes, esperando o Scryfall no máximo {@link #WAIT} pelas que ainda não estão guardadas. */
    CompletableFuture<Result> lookup(List<String> names) {
        Map<String, String> asked = new LinkedHashMap<>();
        for (String n : names) { String name = lookupName(n); asked.putIfAbsent(name.toLowerCase(), name); }
        List<CompletableFuture<Void>> waits = new ArrayList<>();
        Map<String, String> fetch = new LinkedHashMap<>();
        boolean full = false;
        synchronized (this) {
            long now = clock.getAsLong();
            for (var e : asked.entrySet()) {
                String key = e.getKey();
                Entry entry = entry(key);
                if (entry != null && ready(entry, now)) { HITS.increment(); continue; }
                if (entry == null && knownMissing(key, now)) continue;
                CompletableFuture<Void> wait = pending.get(key);
                if (wait == null) {
                    if (pending.size() >= MAX_PENDING) { full = true; continue; }
                    wait = new CompletableFuture<>();
                    pending.put(key, wait);
                    fetch.put(key, e.getValue());
                }
                waits.add(wait);
            }
        }
        if (!fetch.isEmpty()) submit(fetch);
        boolean busy = full;
        return CompletableFuture.allOf(waits.toArray(CompletableFuture[]::new))
                .completeOnTimeout(null, WAIT, TimeUnit.MILLISECONDS)
                .thenApply(x -> result(asked.keySet(), busy));
    }

    private synchronized Result result(Collection<String> keys, boolean busy) {
        long now = clock.getAsLong();
        Set<String> seen = new LinkedHashSet<>();
        List<String> out = new ArrayList<>(), missing = new ArrayList<>(), later = new ArrayList<>();
        for (String key : keys) {
            Entry entry = entry(key);
            // Guardada, mesmo com a legalidade velha ou sem a tradução: melhor que nada com o Scryfall fora do ar.
            if (entry != null) { if (seen.add(entry.name().toLowerCase())) out.add(entry.json()); }
            else if (knownMissing(key, now)) missing.add(key);
            else later.add(key);
        }
        if (busy) Log.bridge().warn("Cartas: fila do Scryfall cheia (" + MAX_PENDING + " nomes); a mesa pede direto a ele");
        return new Result(out, missing, later);
    }

    private Entry entry(String key) {
        String name = aliases.get(key);
        return name == null ? null : cards.get(name);
    }

    private boolean ready(Entry e, long now) { return e.ptChecked() && now - e.updatedAt() < LEGALITY_TTL; }

    private boolean knownMissing(String key, long now) {
        Long at = notFound.get(key);
        return at != null && now - at < NOT_FOUND_TTL;
    }

    private void submit(Map<String, String> fetch) {
        try { queue.execute(() -> run(fetch)); }
        catch (RuntimeException e) { finish(fetch.keySet()); }
    }

    /** Ao subir a ponte: as cartas dos decks prontos que ainda não estão guardadas, um lote de cada vez. */
    void prewarm(Collection<String> names) {
        List<String> todo = new ArrayList<>();
        synchronized (this) {
            Set<String> seen = new java.util.HashSet<>();
            for (String n : names) {
                String name = lookupName(n), key = name.toLowerCase();
                if (validName(name) && seen.add(key) && entry(key) == null && !knownMissing(key, clock.getAsLong())) todo.add(name);
            }
        }
        if (todo.isEmpty()) return;
        Log.bridge().info("Cartas: %d cartas dos decks prontos a buscar no Scryfall", todo.size());
        prewarmStep(todo, 0);
    }

    /** Um lote por vez, voltando para o fim da fila: um pedido da mesa nunca espera mais que um lote. */
    private void prewarmStep(List<String> todo, int from) {
        if (from >= todo.size()) { Log.bridge().info("Cartas: decks prontos guardados (%d cartas no cache)", size()); return; }
        try {
            queue.execute(() -> {
                Map<String, String> fetch = new LinkedHashMap<>();
                synchronized (this) {
                    for (String name : todo.subList(from, Math.min(todo.size(), from + PREWARM_CHUNK))) {
                        String key = name.toLowerCase();
                        if (entry(key) != null || pending.containsKey(key)) continue;
                        pending.put(key, new CompletableFuture<>());
                        fetch.put(key, name);
                    }
                }
                if (!fetch.isEmpty()) run(fetch);
                // Scryfall fora do ar: tenta o resto na próxima vez que a ponte subir.
                if (clock.getAsLong() - failedAt < FAILURE_PAUSE) { Log.bridge().warn("Cartas: pré-carga interrompida (Scryfall falhou)"); return; }
                prewarmStep(todo, from + PREWARM_CHUNK);
            });
        } catch (RuntimeException e) { /* fila encerrada */ }
    }

    // ---- Na fila do Scryfall ----

    /** Busca as cartas (as novas e as de legalidade velha) e a tradução das que ainda não têm. */
    void run(Map<String, String> fetch) {
        try {
            if (clock.getAsLong() - failedAt < FAILURE_PAUSE) return;
            List<String> collection = new ArrayList<>();
            synchronized (this) {
                long now = clock.getAsLong();
                for (String key : fetch.keySet()) { Entry e = entry(key); if (e == null || now - e.updatedAt() >= LEGALITY_TTL) collection.add(key); }
            }
            for (int i = 0; i < collection.size(); i += COLLECTION_CHUNK)
                if (!collect(collection.subList(i, Math.min(collection.size(), i + COLLECTION_CHUNK)), fetch)) return;
            List<String> untranslated = new ArrayList<>();
            synchronized (this) {
                for (String key : fetch.keySet()) {
                    Entry e = entry(key);
                    if (e != null && !e.ptChecked() && !untranslated.contains(e.name())) untranslated.add(e.name());
                }
            }
            for (int i = 0; i < untranslated.size(); i += PT_CHUNK)
                if (!translate(untranslated.subList(i, Math.min(untranslated.size(), i + PT_CHUNK)))) return;
        } finally {
            finish(fetch.keySet());
        }
    }

    private synchronized void finish(Collection<String> keys) {
        for (String key : keys) { CompletableFuture<Void> f = pending.remove(key); if (f != null) f.complete(null); }
    }

    private boolean collect(List<String> keys, Map<String, String> original) {
        JsonObject body = new JsonObject();
        JsonArray ids = new JsonArray();
        for (String key : keys) { JsonObject id = new JsonObject(); id.addProperty("name", original.get(key)); ids.add(id); }
        body.add("identifiers", ids);
        JsonObject json = call(() -> scryfall.post("/cards/collection", body));
        if (json == null) return false;
        List<JsonObject> data = new ArrayList<>();
        if (json.has("data") && json.get("data").isJsonArray()) for (JsonElement d : json.getAsJsonArray("data")) if (d.isJsonObject() && string(d.getAsJsonObject(), "name") != null) data.add(d.getAsJsonObject());
        Set<String> missing = new java.util.HashSet<>();
        if (json.has("not_found") && json.get("not_found").isJsonArray())
            for (JsonElement n : json.getAsJsonArray("not_found")) if (n.isJsonObject() && string(n.getAsJsonObject(), "name") != null) missing.add(string(n.getAsJsonObject(), "name").toLowerCase());
        List<String> found = keys.stream().filter(k -> !missing.contains(k)).toList();
        long now = clock.getAsLong();
        synchronized (this) {
            for (String key : keys) if (missing.contains(key)) notFound.put(key, now);
            for (int i = 0; i < found.size(); i++) {
                String key = found.get(i);
                JsonObject d = match(key, data);
                // Sem nome parecido (acentos, grafias), vale a ordem: o Scryfall devolve na ordem pedida, sem as que faltam.
                if (d == null && data.size() == found.size()) d = data.get(i);
                if (d != null) { store(trimCard(d), key, now); MISSES.increment(); }
            }
        }
        return true;
    }

    /** A carta da resposta que tem este nome, o da frente ou o de uma face. */
    static JsonObject match(String key, List<JsonObject> data) {
        for (JsonObject d : data) if (string(d, "name").equalsIgnoreCase(key) || lookupName(string(d, "name")).equalsIgnoreCase(key)) return d;
        for (JsonObject d : data) if (d.has("card_faces") && d.get("card_faces").isJsonArray())
            for (JsonElement f : d.getAsJsonArray("card_faces")) if (f.isJsonObject() && key.equalsIgnoreCase(string(f.getAsJsonObject(), "name"))) return d;
        return null;
    }

    /** Guarda a carta nova (ou a atualização dela, mantendo a tradução) e aprende o nome pedido. */
    private void store(JsonObject card, String asked, long now) {
        String name = string(card, "name"), full = name.toLowerCase();
        Entry old = cards.get(full);
        boolean ptChecked = old != null && old.ptChecked();
        if (ptChecked) { JsonObject before = JsonParser.parseString(old.json()).getAsJsonObject(); card.add("pt", before.get("pt")); }
        card.addProperty("atualizada", now);
        Set<String> names = new LinkedHashSet<>(old != null ? old.aliases() : Set.of());
        names.add(asked);
        names.add(full);
        names.add(lookupName(name).toLowerCase());
        put(new Entry(name, card.toString(), now, ptChecked, names));
    }

    private boolean translate(List<String> names) {
        StringBuilder q = new StringBuilder("lang:pt (");
        for (int i = 0; i < names.size(); i++) q.append(i > 0 ? " or " : "").append("!\"").append(names.get(i).replace("\"", "")).append('"');
        q.append(')');
        String path = "/cards/search?q=" + URLEncoder.encode(q.toString(), StandardCharsets.UTF_8) + "&unique=cards";
        Map<String, JsonObject> found = new HashMap<>();
        // A busca devolve até 175 por página; um lote de 30 cabe numa só.
        JsonObject json = call(() -> { JsonObject r = scryfall.get(path); return r == null ? new JsonObject() : r; });
        if (json == null) return false;
        if (json.has("data") && json.get("data").isJsonArray())
            for (JsonElement d : json.getAsJsonArray("data")) if (d.isJsonObject() && string(d.getAsJsonObject(), "name") != null) found.put(string(d.getAsJsonObject(), "name").toLowerCase(), d.getAsJsonObject());
        synchronized (this) {
            for (String name : names) {
                Entry old = cards.get(name.toLowerCase());
                if (old == null) continue;
                JsonObject card = JsonParser.parseString(old.json()).getAsJsonObject();
                JsonObject pt = found.get(name.toLowerCase());
                card.add("pt", pt == null ? JsonNull.INSTANCE : trimPt(pt));
                put(new Entry(old.name(), card.toString(), old.updatedAt(), true, old.aliases()));
            }
        }
        return true;
    }

    private interface Call { JsonObject run() throws IOException; }

    /** Um pedido ao Scryfall; numa falha, marca a pausa e devolve null. */
    private JsonObject call(Call c) {
        CALLS.increment();
        try { return c.run(); }
        catch (IOException | RuntimeException e) {
            FAILURES.increment();
            failedAt = clock.getAsLong();
            Log.bridge().warn("Cartas: o Scryfall falhou (" + e.getMessage() + "); servindo o que está guardado");
            return null;
        }
    }

    // ---- O que guardar de cada carta (os campos que src/scryfallCards.ts usa) ----

    private static final List<String> CARD_FIELDS = List.of("name", "lang", "oracle_id", "cmc", "rarity", "legalities", "layout", "mana_cost", "type_line",
            "oracle_text", "power", "toughness", "loyalty", "colors", "color_identity", "image_status", "printed_name", "printed_type_line", "printed_text");
    private static final List<String> FACE_FIELDS = List.of("name", "mana_cost", "type_line", "oracle_text", "power", "toughness", "loyalty",
            "printed_name", "printed_type_line", "printed_text");
    private static final List<String> IMAGE_SIZES = List.of("small", "normal", "art_crop");

    static JsonObject trimCard(JsonObject d) {
        JsonObject out = new JsonObject();
        for (String k : CARD_FIELDS) if (d.has(k) && !d.get(k).isJsonNull()) out.add(k, d.get(k));
        JsonObject images = images(d);
        if (images != null) out.add("image_uris", images);
        if (d.has("card_faces") && d.get("card_faces").isJsonArray()) {
            JsonArray faces = new JsonArray();
            for (JsonElement f : d.getAsJsonArray("card_faces")) {
                if (!f.isJsonObject()) continue;
                JsonObject face = new JsonObject();
                for (String k : FACE_FIELDS) if (f.getAsJsonObject().has(k) && !f.getAsJsonObject().get(k).isJsonNull()) face.add(k, f.getAsJsonObject().get(k));
                JsonObject fi = images(f.getAsJsonObject());
                if (fi != null) face.add("image_uris", fi);
                faces.add(face);
            }
            out.add("card_faces", faces);
        }
        return out;
    }

    /** A impressão em português: o que {@code slimPt} lê. */
    static JsonObject trimPt(JsonObject d) {
        JsonObject out = trimCard(d);
        for (String k : List.of("legalities", "oracle_text", "oracle_id", "cmc", "rarity", "colors", "color_identity")) out.remove(k);
        return out;
    }

    private static JsonObject images(JsonObject o) {
        if (!o.has("image_uris") || !o.get("image_uris").isJsonObject()) return null;
        JsonObject all = o.getAsJsonObject("image_uris"), out = new JsonObject();
        for (String size : IMAGE_SIZES) if (all.has(size)) out.add(size, all.get(size));
        return out;
    }

    private static String string(JsonObject o, String key) {
        return o != null && o.has(key) && o.get(key).isJsonPrimitive() ? o.get(key).getAsString() : null;
    }

    // ---- Disco: uma linha por carta guardada, a última vale ----

    private void put(Entry e) {
        String full = e.name().toLowerCase();
        cards.put(full, e);
        for (String a : e.aliases()) aliases.put(a, full);
        JsonObject line = new JsonObject();
        line.addProperty("v", FORMAT);
        JsonArray names = new JsonArray(); e.aliases().forEach(names::add); line.add("nomes", names);
        line.addProperty("atualizada", e.updatedAt());
        line.addProperty("traduzida", e.ptChecked());
        line.add("carta", JsonParser.parseString(e.json()));
        try {
            Files.createDirectories(file.getParent());
            Files.writeString(file, line + "\n", StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
            lines++;
        } catch (IOException e2) {
            Log.bridge().error("Cartas: não gravei " + file + ": " + e2);
        }
    }

    private synchronized void load() {
        if (!Files.isRegularFile(file)) return;
        int read = 0;
        try (BufferedReader in = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            for (String line; (line = in.readLine()) != null; ) {
                if (line.isBlank()) continue;
                read++;
                try {
                    JsonObject o = JsonParser.parseString(line).getAsJsonObject();
                    if (!o.has("v") || o.get("v").getAsInt() != FORMAT) continue;
                    JsonObject card = o.getAsJsonObject("carta");
                    String name = string(card, "name");
                    if (name == null) continue;
                    Set<String> names = new LinkedHashSet<>();
                    for (JsonElement n : o.getAsJsonArray("nomes")) names.add(n.getAsString());
                    Entry e = new Entry(name, card.toString(), o.get("atualizada").getAsLong(), o.get("traduzida").getAsBoolean(), names);
                    cards.put(name.toLowerCase(), e);
                    for (String a : names) aliases.put(a, name.toLowerCase());
                } catch (RuntimeException e) { /* linha cortada (a ponte caiu gravando): só some */ }
            }
        } catch (IOException e) {
            Log.bridge().error("Cartas: não li " + file + ": " + e);
            return;
        }
        lines = read;
        if (read > cards.size() * 3 / 2 + 100) compact();
    }

    /** Reescreve o arquivo só com a última linha de cada carta. */
    private void compact() {
        Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
        try (Writer out = Files.newBufferedWriter(tmp, StandardCharsets.UTF_8)) {
            for (Entry e : cards.values()) {
                JsonObject line = new JsonObject();
                line.addProperty("v", FORMAT);
                JsonArray names = new JsonArray(); e.aliases().forEach(names::add); line.add("nomes", names);
                line.addProperty("atualizada", e.updatedAt());
                line.addProperty("traduzida", e.ptChecked());
                line.add("carta", JsonParser.parseString(e.json()));
                out.write(line + "\n");
            }
        } catch (IOException e) {
            Log.bridge().error("Cartas: não compactei " + file + ": " + e);
            return;
        }
        try {
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            lines = cards.size();
        } catch (IOException e) {
            Log.bridge().error("Cartas: não compactei " + file + ": " + e);
        }
    }

    // ---- Rota ----

    /** O corpo {nomes: [...]}, ou null se não for um pedido válido. */
    static List<String> names(byte[] body) {
        try {
            JsonArray list = JsonParser.parseString(new String(body, StandardCharsets.UTF_8)).getAsJsonObject().getAsJsonArray("nomes");
            if (list == null || list.isEmpty() || list.size() > MAX_NAMES) return null;
            List<String> out = new ArrayList<>();
            for (JsonElement e : list) {
                String name = e.isJsonPrimitive() ? e.getAsString() : null;
                if (!validName(name)) return null;
                out.add(name);
            }
            return out;
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** Depois do agregador de 64 KB: OPTIONS (CORS) e POST em /api/cartas, respondido quando o Scryfall terminar. */
    final class Handler extends ChannelInboundHandlerAdapter {
        @Override public void channelRead(ChannelHandlerContext ctx, Object msg) {
            if (!(msg instanceof FullHttpRequest req) || !PATH.equals(new QueryStringDecoder(req.uri()).path())) {
                ctx.fireChannelRead(msg);
                return;
            }
            try {
                if (req.method() == HttpMethod.OPTIONS) { Admin.respond(ctx, new Admin.Response(204, null, new byte[0])); return; }
                if (req.method() != HttpMethod.POST) { Admin.respond(ctx, Admin.Response.error(405, "Use POST.")); return; }
                List<String> names = names(ByteBufUtil.getBytes(req.content()));
                if (names == null) { Admin.respond(ctx, Admin.Response.error(400, "Pedido inválido.")); return; }
                lookup(names).whenComplete((result, error) -> Admin.respond(ctx, error != null
                        ? Admin.Response.error(500, "Não foi possível buscar as cartas.")
                        : new Admin.Response(200, "application/json; charset=utf-8", result.json().getBytes(StandardCharsets.UTF_8))));
            } finally {
                req.release();
            }
        }
    }

    // ---- O Scryfall de verdade ----

    /** Uma fila só: no mínimo 550 ms entre pedidos (a busca e a coleção aceitam 2 por segundo). */
    static final class HttpScryfall implements Scryfall {
        private static final String API = "https://api.scryfall.com";
        private static final long INTERVAL = 550;
        private final java.net.http.HttpClient http = java.net.http.HttpClient.newBuilder()
                .connectTimeout(java.time.Duration.ofSeconds(8)).build();
        private long lastAt;

        @Override public JsonObject get(String path) throws IOException { return send(base(path).GET().build()); }

        @Override public JsonObject post(String path, JsonObject body) throws IOException {
            return send(base(path).header("Content-Type", "application/json")
                    .POST(java.net.http.HttpRequest.BodyPublishers.ofString(body.toString())).build());
        }

        /** O Scryfall pede User-Agent com o nome do app e um Accept em todo pedido. */
        private static java.net.http.HttpRequest.Builder base(String path) {
            return java.net.http.HttpRequest.newBuilder(java.net.URI.create(API + path)).timeout(java.time.Duration.ofSeconds(20))
                    .header("Accept", "application/json").header("User-Agent", "MesaDeDuelo/0.1 (+dados das cartas)");
        }

        private synchronized JsonObject send(java.net.http.HttpRequest request) throws IOException {
            long wait = lastAt + INTERVAL - System.currentTimeMillis();
            try {
                if (wait > 0) Thread.sleep(wait);
                var res = http.send(request, java.net.http.HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                if (res.statusCode() == 404) return null;
                if (res.statusCode() != 200) throw new IOException("Scryfall respondeu " + res.statusCode());
                return JsonParser.parseString(res.body()).getAsJsonObject();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IOException("interrompido", e);
            } finally {
                lastAt = System.currentTimeMillis();
            }
        }
    }
}
