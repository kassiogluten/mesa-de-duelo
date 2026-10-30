package mesadeduelo.bridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.regex.Pattern;
import java.util.zip.GZIPInputStream;

/**
 * Cartas parecidas pelas tags de função do Tagger, o projeto de etiquetas da comunidade do Scryfall.
 *
 * <p>O Scryfall publica todas as tags num arquivo diário ({@code oracle_tags} em {@code /bulk-data}). A ponte baixa
 * esse arquivo no máximo uma vez por dia (guardado em disco para sobreviver a um reinício), monta o índice
 * carta ({@code oracle_id}) → tags e mede a semelhança assim:
 * <ol>
 *   <li>ignora as tags que não dizem o que a carta faz (nome, errata, ciclo, sinalização de draft e afins);</li>
 *   <li>soma a cada tag as tags-mãe, para {@code scry} e {@code surveil} se encontrarem em {@code library-manipulation};</li>
 *   <li>dá mais peso às tags raras: peso = ln(cartas com alguma tag / cartas com esta tag);</li>
 *   <li>semelhança = soma dos pesos das tags em comum / soma dos pesos das tags de uma ou de outra (Jaccard com peso).</li>
 * </ol>
 * Quem escolhe com que cartas comparar (mesmas cores, mesmo tipo, custo próximo, formato) é a mesa, pela busca
 * normal do Scryfall: a ponte só ordena os {@code oracle_id} que recebe. O arquivo não é repassado a ninguém.
 */
final class CardTags {
    static final String BULK_INDEX = "https://api.scryfall.com/bulk-data/oracle-tags";
    private static final Duration MAX_AGE = Duration.ofHours(24);
    private static final Pattern UUID = Pattern.compile("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
    /** Raízes de árvores que não falam da função da carta; as tags filhas delas também são ignoradas. */
    static final Set<String> IGNORED_ROOTS = Set.of("card-names", "cycle", "draft-signpost", "un-design", "token-versions-of-cards");
    static final int MAX_CANDIDATES = 1500;
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8)).followRedirects(HttpClient.Redirect.NORMAL).build();

    /** Índice pronto: tags de cada carta (já com as mães) e o peso de cada tag. */
    record Index(Map<String, int[]> cards, String[] slugs, double[] weights) {
        boolean has(String oracleId) { return cards.containsKey(oracleId); }
    }

    record Match(String oracleId, double score, List<String> tags) {}

    private static Index index;
    private static long loadedAt;
    private static CompletableFuture<Index> loading;

    private CardTags() {}

    /** Índice do dia: o da memória, o do disco ou um novo download. */
    static synchronized CompletableFuture<Index> current() {
        long now = System.currentTimeMillis();
        if (index != null && now - loadedAt < MAX_AGE.toMillis()) return CompletableFuture.completedFuture(index);
        if (loading != null) return loading;
        Index stale = index;
        loading = CompletableFuture.supplyAsync(() -> {
            try { return load(); }
            catch (Exception e) {
                System.out.println("Tags do Tagger: não foi possível atualizar (" + e + ")");
                if (stale != null) return stale;
                throw new IllegalArgumentException("Não foi possível baixar as tags de função do Scryfall agora. Tente de novo mais tarde.");
            }
        }).whenComplete((result, error) -> {
            synchronized (CardTags.class) {
                loading = null;
                if (result != null) { loadedAt = System.currentTimeMillis(); index = result; }
            }
        });
        return loading;
    }

    /** Cartas parecidas com {@code target} entre as candidatas, da mais para a menos parecida (só as com alguma tag em comum). */
    static CompletableFuture<List<Match>> similar(String target, Collection<String> candidates, int limit) {
        if (target == null || !UUID.matcher(target).matches()) throw new IllegalArgumentException("Carta inválida.");
        if (candidates.size() > MAX_CANDIDATES) throw new IllegalArgumentException("Cartas demais para comparar.");
        return current().thenApply(idx -> {
            if (!idx.has(target)) throw new IllegalArgumentException("Esta carta ainda não tem tags de função no Tagger do Scryfall.");
            return rank(idx, target, candidates, limit);
        });
    }

    static List<Match> rank(Index idx, String target, Collection<String> candidates, int limit) {
        int[] mine = idx.cards().getOrDefault(target, new int[0]);
        Set<Integer> mineSet = new HashSet<>(); for (int t : mine) mineSet.add(t);
        double mineWeight = 0; for (int t : mine) mineWeight += idx.weights()[t];
        List<Match> out = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (String other : candidates) {
            if (other == null || other.equals(target) || !seen.add(other)) continue;
            int[] theirs = idx.cards().get(other); if (theirs == null) continue;
            double shared = 0, union = mineWeight;
            List<Integer> common = new ArrayList<>();
            for (int t : theirs) {
                if (mineSet.contains(t)) { shared += idx.weights()[t]; common.add(t); }
                else union += idx.weights()[t];
            }
            if (shared <= 0 || union <= 0) continue;
            // As tags em comum mais raras primeiro: são as que explicam a semelhança ("cantrip", "scry").
            common.sort(Comparator.comparingDouble((Integer t) -> -idx.weights()[t]));
            List<String> tags = new ArrayList<>();
            for (int t : common) { if (tags.size() == 3) break; tags.add(idx.slugs()[t]); }
            out.add(new Match(other, shared / union, tags));
        }
        // Ordenação estável: no empate fica a ordem em que a mesa mandou (por nome).
        out.sort(Comparator.comparingDouble((Match m) -> -m.score()));
        return out.size() > limit ? new ArrayList<>(out.subList(0, limit)) : out;
    }

    static JsonObject json(List<Match> matches) {
        JsonObject result = new JsonObject();
        JsonArray cards = new JsonArray();
        for (Match m : matches) {
            JsonObject card = new JsonObject();
            card.addProperty("oracleId", m.oracleId());
            card.addProperty("score", Math.round(m.score() * 1000) / 1000.0);
            JsonArray tags = new JsonArray(); m.tags().forEach(tags::add); card.add("tags", tags);
            cards.add(card);
        }
        result.add("cards", cards);
        return result;
    }

    // ---- Montagem do índice ----

    /** Lê o arquivo de tags (uma tag por linha, JSONL, ou um array JSON) e monta o índice. */
    static Index parse(Reader reader) throws IOException {
        List<JsonObject> tags = new ArrayList<>();
        BufferedReader in = new BufferedReader(reader);
        in.mark(1 << 16);
        int first; do { first = in.read(); } while (first != -1 && Character.isWhitespace(first));
        in.reset();
        if (first == '[') {
            for (JsonElement e : JsonParser.parseReader(in).getAsJsonArray()) if (e.isJsonObject()) tags.add(e.getAsJsonObject());
        } else {
            for (String line; (line = in.readLine()) != null; ) {
                if (line.isBlank()) continue;
                JsonElement e = JsonParser.parseString(line);
                if (e.isJsonObject()) tags.add(e.getAsJsonObject());
            }
        }
        return build(tags);
    }

    static Index build(List<JsonObject> tags) {
        Map<String, Integer> byId = new HashMap<>();
        String[] slugs = new String[tags.size()];
        for (int i = 0; i < tags.size(); i++) {
            JsonObject tag = tags.get(i);
            byId.put(string(tag, "id"), i);
            slugs[i] = string(tag, "slug") != null ? string(tag, "slug") : string(tag, "label");
        }
        List<List<Integer>> parents = new ArrayList<>();
        for (JsonObject tag : tags) {
            List<Integer> ps = new ArrayList<>();
            if (tag.has("parent_ids") && tag.get("parent_ids").isJsonArray())
                for (JsonElement p : tag.getAsJsonArray("parent_ids")) { Integer at = byId.get(p.getAsString()); if (at != null) ps.add(at); }
            parents.add(ps);
        }
        // Tag + todas as mães; ignorada se ela ou alguma mãe é de nome, errata, ciclo e afins.
        List<Set<Integer>> lineage = new ArrayList<>();
        boolean[] ignored = new boolean[tags.size()];
        for (int i = 0; i < tags.size(); i++) {
            Set<Integer> all = new HashSet<>(); ancestors(i, parents, all); all.add(i);
            lineage.add(all);
            for (int a : all) if (ignoredSlug(slugs[a])) { ignored[i] = true; break; }
        }
        Map<String, Set<Integer>> perCard = new HashMap<>();
        for (int i = 0; i < tags.size(); i++) {
            if (ignored[i]) continue;
            JsonObject tag = tags.get(i);
            if (!tag.has("taggings") || !tag.get("taggings").isJsonArray()) continue;
            for (JsonElement t : tag.getAsJsonArray("taggings")) {
                if (!t.isJsonObject()) continue;
                String oracle = string(t.getAsJsonObject(), "oracle_id"); if (oracle == null) continue;
                Set<Integer> set = perCard.computeIfAbsent(oracle, k -> new HashSet<>());
                for (int a : lineage.get(i)) if (!ignored[a]) set.add(a);
            }
        }
        int[] df = new int[tags.size()];
        Map<String, int[]> cards = new HashMap<>(perCard.size() * 2);
        for (var e : perCard.entrySet()) {
            int[] arr = e.getValue().stream().mapToInt(Integer::intValue).sorted().toArray();
            for (int t : arr) df[t]++;
            cards.put(e.getKey(), arr);
        }
        double n = Math.max(1, cards.size());
        double[] weights = new double[tags.size()];
        for (int i = 0; i < weights.length; i++) weights[i] = df[i] > 0 ? Math.log(n / df[i]) : 0;
        return new Index(cards, slugs, weights);
    }

    static boolean ignoredSlug(String slug) {
        return slug != null && (IGNORED_ROOTS.contains(slug) || slug.contains("errata"));
    }

    private static void ancestors(int tag, List<List<Integer>> parents, Set<Integer> acc) {
        for (int p : parents.get(tag)) if (acc.add(p)) ancestors(p, parents, acc);
    }

    private static String string(JsonObject o, String key) {
        return o.has(key) && o.get(key).isJsonPrimitive() ? o.get(key).getAsString() : null;
    }

    // ---- Download (uma vez por dia) ----

    static Path cacheFile() {
        String dir = System.getProperty("mesa.tags.dir", System.getProperty("user.home") + "/.forge/mesa-tags");
        return Path.of(dir, "oracle-tags.jsonl.gz");
    }

    private static Index load() throws IOException, InterruptedException {
        Path file = cacheFile();
        boolean fresh = Files.exists(file) && System.currentTimeMillis() - Files.getLastModifiedTime(file).toMillis() < MAX_AGE.toMillis();
        if (!fresh) {
            try { download(file); }
            catch (IOException | InterruptedException | RuntimeException e) {
                if (!Files.exists(file)) throw e;
                System.out.println("Tags do Tagger: usando o arquivo de antes (" + e + ")");
            }
        }
        try (InputStream raw = Files.newInputStream(file); InputStream gz = new GZIPInputStream(raw)) {
            Index idx = parse(new InputStreamReader(gz, StandardCharsets.UTF_8));
            System.out.printf("Tags do Tagger: %d cartas com tags%n", idx.cards().size());
            return idx;
        }
    }

    private static void download(Path file) throws IOException, InterruptedException {
        HttpResponse<String> meta = HTTP.send(request(URI.create(BULK_INDEX)), HttpResponse.BodyHandlers.ofString());
        if (meta.statusCode() != 200) throw new IOException("bulk-data respondeu " + meta.statusCode());
        JsonObject info = JsonParser.parseString(meta.body()).getAsJsonObject();
        String link = string(info, "jsonl_download_uri") != null ? string(info, "jsonl_download_uri") : string(info, "download_uri");
        if (link == null || !link.startsWith("https://data.scryfall.io/")) throw new IOException("endereço do arquivo de tags inesperado: " + link);
        Files.createDirectories(file.getParent());
        Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
        HttpResponse<Path> body = HTTP.send(request(URI.create(link)), HttpResponse.BodyHandlers.ofFile(tmp));
        if (body.statusCode() != 200) { Files.deleteIfExists(tmp); throw new IOException("download das tags respondeu " + body.statusCode()); }
        Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }

    /** O Scryfall pede User-Agent com o nome do app e um Accept em todo pedido. */
    private static HttpRequest request(URI uri) {
        return HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(60))
                .header("Accept", "application/json;q=0.9,*/*;q=0.8")
                .header("User-Agent", "MesaDeDuelo/0.1 (+cartas parecidas)").GET().build();
    }
}
