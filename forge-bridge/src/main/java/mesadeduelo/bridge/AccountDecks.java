package mesadeduelo.bridge;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

/**
 * Os decks dentro do arquivo de uma conta e a sincronia deles (docs/spec-login-google.md), sem disco nem rede:
 * {@link Accounts} lê o arquivo, chama estes métodos e grava de volta.
 *
 * Cada deck guardado é {deck, rev} ou, apagado, {deck, rev, apagadoEm}: o deck continua lá 30 dias, na lixeira.
 * O {@code rev} da conta sobe a cada mudança aceita, e cada deck guarda o rev da última mudança dele; o navegador
 * pede o que mudou desde o último rev que viu e manda cada mudança com o rev em que ela se baseou.
 *
 * As preferências da mesa (só as de {@link #PREF_KEYS}) vão no mesmo arquivo, em {prefs: {chave: {valor, rev}}},
 * e na mesma troca: vale a última gravação, sem conflito. Valor null apaga a preferência.
 */
final class AccountDecks {
    static final int MAX_DECKS = 300;
    static final long TRASH_MILLIS = 30 * 86_400_000L;
    static final int MAX_ID = 100, MAX_NAME = 200, MAX_ENTRIES = 1000, MAX_COUNT = 9999, MAX_DECK_CHARS = 200_000;

    /** As chaves do localStorage que acompanham a conta; o resto é deste aparelho. */
    static final java.util.Set<String> PREF_KEYS = java.util.Set.of("mesa:audio:v1", "mesa:turnNotice", "mesa:pace",
        "mesa:passResponses", "mesa:autoPassNoActions", "mesa:opponentStops", "mesa:name");
    static final int MAX_PREF_CHARS = 4000;

    private AccountDecks() { }

    private static JsonObject prefs(JsonObject account) {
        if (!account.has("prefs")) account.add("prefs", new JsonObject());
        return account.getAsJsonObject("prefs");
    }

    private static JsonArray decks(JsonObject account) {
        if (!account.has("decks")) account.add("decks", new JsonArray());
        return account.getAsJsonArray("decks");
    }

    private static Map<String, JsonObject> byId(JsonObject account) {
        Map<String, JsonObject> map = new HashMap<>();
        for (JsonElement e : decks(account)) map.put(e.getAsJsonObject().getAsJsonObject("deck").get("id").getAsString(), e.getAsJsonObject());
        return map;
    }

    private static long rev(JsonObject account) { return account.has("rev") ? account.get("rev").getAsLong() : 0; }
    private static long nextRev(JsonObject account) { long r = rev(account) + 1; account.addProperty("rev", r); return r; }
    private static boolean deleted(JsonObject entry) { return entry.has("apagadoEm"); }

    static int live(JsonObject account) {
        int n = 0;
        for (JsonElement e : decks(account)) if (!deleted(e.getAsJsonObject())) n++;
        return n;
    }

    /** Tira da lixeira o que passou de 30 dias; devolve se mudou algo. */
    static boolean purge(JsonObject account, long now) {
        boolean changed = false;
        for (java.util.Iterator<JsonElement> it = decks(account).iterator(); it.hasNext(); ) {
            JsonObject entry = it.next().getAsJsonObject();
            if (deleted(entry) && Instant.parse(entry.get("apagadoEm").getAsString()).toEpochMilli() < now - TRASH_MILLIS) { it.remove(); changed = true; }
        }
        return changed;
    }

    /** O que mudou depois de {@code since}: {rev, decks: [{id, rev, deck} | {id, rev, apagado: true}]}. Do zero, só os vivos. */
    static JsonObject state(JsonObject account, long since) {
        JsonArray changes = new JsonArray();
        for (JsonElement e : decks(account)) {
            JsonObject entry = e.getAsJsonObject();
            long r = entry.get("rev").getAsLong();
            if (r <= since || (since == 0 && deleted(entry))) continue;
            changes.add(change(entry));
        }
        JsonObject o = new JsonObject();
        o.addProperty("rev", rev(account));
        o.add("decks", changes);
        JsonObject prefs = new JsonObject();
        for (Map.Entry<String, JsonElement> e : prefs(account).entrySet())
            if (e.getValue().getAsJsonObject().get("rev").getAsLong() > since) prefs.add(e.getKey(), e.getValue().getAsJsonObject().get("valor"));
        o.add("prefs", prefs);
        return o;
    }

    private static JsonObject change(JsonObject entry) {
        JsonObject deck = entry.getAsJsonObject("deck"), c = new JsonObject();
        c.addProperty("id", deck.get("id").getAsString());
        c.addProperty("rev", entry.get("rev").getAsLong());
        if (deleted(entry)) c.addProperty("apagado", true); else c.add("deck", deck.deepCopy());
        return c;
    }

    /**
     * Aplica {mudancas: [{id, base, deck} | {id, base, apagar: true}], prefs?: {chave: valor}}. A mudança entra se o deck não mudou na conta
     * depois de {@code base}; senão volta em {@code conflitos} com a versão da conta. Deck inválido ou acima do limite
     * volta em {@code recusadas}, com o motivo para o jogador.
     */
    static JsonObject sync(JsonObject account, JsonObject body, long now) {
        JsonArray input = body.has("mudancas") && body.get("mudancas").isJsonArray() ? body.getAsJsonArray("mudancas") : null;
        if (input == null) input = new JsonArray();
        if (input.size() > MAX_DECKS * 2) throw new IllegalArgumentException("Mudanças demais num pedido só.");
        Map<String, JsonObject> current = byId(account);
        JsonArray applied = new JsonArray(), conflicts = new JsonArray(), refused = new JsonArray();
        for (JsonElement e : input) {
            JsonObject change = e.isJsonObject() ? e.getAsJsonObject() : new JsonObject();
            String id = text(change, "id");
            if (id == null || id.isEmpty() || id.length() > MAX_ID) throw new IllegalArgumentException("Mudança sem o id do deck.");
            long base = change.has("base") ? change.get("base").getAsLong() : 0;
            JsonObject entry = current.get(id);
            if ((entry == null ? 0 : entry.get("rev").getAsLong()) != base) { conflicts.add(entry == null ? gone(id) : change(entry)); continue; }
            boolean remove = change.has("apagar") && change.get("apagar").getAsBoolean();
            if (remove) {
                if (entry == null || deleted(entry)) { applied.add(done(id, entry == null ? 0 : entry.get("rev").getAsLong())); continue; }
                entry.addProperty("rev", nextRev(account));
                entry.addProperty("apagadoEm", Instant.ofEpochMilli(now).toString());
                applied.add(done(id, entry.get("rev").getAsLong()));
                continue;
            }
            JsonObject deck = change.has("deck") && change.get("deck").isJsonObject() ? change.getAsJsonObject("deck") : null;
            String problem = deck == null ? "O deck veio vazio." : invalid(deck, id);
            if (problem == null && (entry == null || deleted(entry)) && live(account) >= MAX_DECKS)
                problem = "A conta já tem " + MAX_DECKS + " decks. Apague algum para guardar este.";
            if (problem != null) { JsonObject r = new JsonObject(); r.addProperty("id", id); r.addProperty("motivo", problem); refused.add(r); continue; }
            if (entry == null) { entry = new JsonObject(); decks(account).add(entry); current.put(id, entry); }
            entry.add("deck", deck.deepCopy());
            entry.remove("apagadoEm");
            entry.addProperty("rev", nextRev(account));
            applied.add(done(id, entry.get("rev").getAsLong()));
        }
        if (body.has("prefs") && body.get("prefs").isJsonObject()) syncPrefs(account, body.getAsJsonObject("prefs"));
        JsonObject o = new JsonObject();
        o.addProperty("rev", rev(account));
        o.add("aplicadas", applied); o.add("conflitos", conflicts); o.add("recusadas", refused);
        return o;
    }

    /** Um deck que a conta não tem (nem na lixeira): para o navegador, foi apagado lá. */
    private static JsonObject gone(String id) { JsonObject o = done(id, 0); o.addProperty("apagado", true); return o; }

    /** Grava as preferências que mudaram; chaves desconhecidas ou valores grandes demais são ignorados. */
    private static void syncPrefs(JsonObject account, JsonObject input) {
        JsonObject stored = prefs(account);
        for (Map.Entry<String, JsonElement> e : input.entrySet()) {
            JsonElement value = e.getValue();
            boolean text = value.isJsonPrimitive() && value.getAsJsonPrimitive().isString();
            if (!PREF_KEYS.contains(e.getKey()) || !(text || value.isJsonNull()) || (text && value.getAsString().length() > MAX_PREF_CHARS)) continue;
            JsonObject old = stored.has(e.getKey()) ? stored.getAsJsonObject(e.getKey()) : null;
            if (old != null && old.get("valor").equals(value)) continue;
            JsonObject entry = new JsonObject();
            entry.add("valor", value);
            entry.addProperty("rev", nextRev(account));
            stored.add(e.getKey(), entry);
        }
    }

    private static JsonObject done(String id, long rev) { JsonObject o = new JsonObject(); o.addProperty("id", id); o.addProperty("rev", rev); return o; }

    /** Os decks apagados ainda na lixeira, do mais recente para o mais antigo. */
    static JsonObject trash(JsonObject account) {
        java.util.List<JsonObject> list = new java.util.ArrayList<>();
        for (JsonElement e : decks(account)) if (deleted(e.getAsJsonObject())) list.add(e.getAsJsonObject());
        list.sort((a, b) -> b.get("apagadoEm").getAsString().compareTo(a.get("apagadoEm").getAsString()));
        JsonArray out = new JsonArray();
        for (JsonObject entry : list) {
            JsonObject o = change(entry);
            o.add("deck", entry.getAsJsonObject("deck").deepCopy());
            o.addProperty("apagadoEm", entry.get("apagadoEm").getAsString());
            out.add(o);
        }
        JsonObject o = new JsonObject();
        o.add("decks", out);
        return o;
    }

    /** Devolve o deck da lixeira à conta: {rev, deck}; null se ele não estiver lá. */
    static JsonObject restore(JsonObject account, String id) {
        JsonObject entry = byId(account).get(id);
        if (entry == null || !deleted(entry)) return null;
        if (live(account) >= MAX_DECKS) throw new IllegalArgumentException("A conta já tem " + MAX_DECKS + " decks. Apague algum para restaurar este.");
        entry.remove("apagadoEm");
        entry.addProperty("rev", nextRev(account));
        JsonObject o = change(entry);
        o.addProperty("contaRev", rev(account));
        return o;
    }

    /** O motivo para recusar o deck, ou null. Confere a forma, como o validDeck do navegador, e os tamanhos. */
    static String invalid(JsonObject deck, String id) {
        if (!id.equals(text(deck, "id"))) return "O deck veio com outro id.";
        String name = text(deck, "name");
        if (name == null || name.isBlank() || name.length() > MAX_NAME) return "O deck precisa de um nome com até " + MAX_NAME + " letras.";
        if (deck.has("builtin") && deck.get("builtin").getAsBoolean()) return "Decks prontos não vão para a conta.";
        int total = 0;
        for (String list : new String[]{"cards", "sideboard", "commanders"}) {
            if (!deck.has(list)) { if (list.equals("cards")) return "O deck veio sem cartas."; continue; }
            if (!deck.get(list).isJsonArray()) return "A lista de cartas do deck está estragada.";
            for (JsonElement e : deck.getAsJsonArray(list)) {
                if (!e.isJsonObject()) return "A lista de cartas do deck está estragada.";
                String card = text(e.getAsJsonObject(), "name");
                JsonElement count = e.getAsJsonObject().get("count");
                if (card == null || card.isBlank() || card.length() > MAX_NAME || count == null || !count.isJsonPrimitive() || !count.getAsJsonPrimitive().isNumber()
                    || count.getAsDouble() != Math.floor(count.getAsDouble()) || count.getAsInt() < 1 || count.getAsInt() > MAX_COUNT)
                    return "A lista de cartas do deck está estragada.";
                if (++total > MAX_ENTRIES) return "O deck tem cartas diferentes demais.";
            }
        }
        if (deck.toString().length() > MAX_DECK_CHARS) return "O deck é grande demais para a conta.";
        return null;
    }

    private static String text(JsonObject o, String key) {
        JsonElement e = o.get(key);
        return e != null && e.isJsonPrimitive() && e.getAsJsonPrimitive().isString() ? e.getAsString() : null;
    }
}
