package mesadeduelo.bridge;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

/**
 * Minhas partidas (item 65): as linhas do {@link MatchHistory} em que a conta jogou, vistas do lado dela.
 *
 *   GET partidas?periodo=7|30|90&formato=F&deck=D&pagina=N
 *   → {total, pagina, porPagina, partidas:[linha], numeros, filtros:{formatos, decks:[{id, nome}]}}
 *
 * O período, o formato e o deck valem para a lista e para os números; as opções dos filtros vêm de todas as partidas.
 * A partida que caiu sem vencedor (ninguém voltou) aparece na lista, mas fica fora dos números. O deck é o salvo na
 * conta (o id dele): editar a lista não muda o deck; sem id, vale o nome.
 */
final class AccountMatches {
    static final int PAGE = 20;
    private static final long DAY = 86_400_000L;

    private AccountMatches() { }

    record Filter(int days, String format, String deck, int page) {
        /** Do que veio na URL; valores fora do esperado viram "sem filtro". */
        static Filter of(Map<String, String> query) {
            int days = switch (query.getOrDefault("periodo", "")) { case "7" -> 7; case "30" -> 30; case "90" -> 90; default -> 0; };
            int page;
            try { page = Math.max(0, Integer.parseInt(query.getOrDefault("pagina", "0"))); } catch (NumberFormatException e) { page = 0; }
            String format = query.get("formato"), deck = query.get("deck");
            return new Filter(days, format == null || format.isBlank() ? null : format, deck == null || deck.isBlank() ? null : deck, page);
        }
    }

    /** {@code mine}: as partidas da conta, mais recentes primeiro ({@link MatchHistory#readFor}). */
    static JsonObject page(List<JsonObject> mine, String account, Filter filter, long now) {
        List<JsonObject> rows = new ArrayList<>();
        Map<String, String> decks = new LinkedHashMap<>();
        List<String> formats = new ArrayList<>();
        for (JsonObject match : mine) {
            JsonObject row = row(match, MatchHistory.seatOf(match, account));
            if (row == null) continue;
            String key = deckKey(row.getAsJsonObject("deck"));
            decks.putIfAbsent(key, text(row.getAsJsonObject("deck"), "nome"));
            String format = text(row, "formato");
            if (format != null && !formats.contains(format)) formats.add(format);
            if (filter.days() > 0 && when(row) < now - filter.days() * DAY) continue;
            if (filter.format() != null && !filter.format().equals(format)) continue;
            if (filter.deck() != null && !filter.deck().equals(key)) continue;
            rows.add(row);
        }
        JsonObject o = new JsonObject();
        o.addProperty("total", rows.size());
        o.addProperty("pagina", filter.page());
        o.addProperty("porPagina", PAGE);
        JsonArray list = new JsonArray();
        for (int i = filter.page() * PAGE; i < Math.min(rows.size(), (filter.page() + 1) * PAGE); i++) list.add(rows.get(i));
        o.add("partidas", list);
        o.add("numeros", numbers(rows));
        JsonObject options = new JsonObject();
        JsonArray f = new JsonArray();
        formats.forEach(f::add);
        options.add("formatos", f);
        JsonArray d = new JsonArray();
        decks.forEach((id, name) -> { JsonObject e = new JsonObject(); e.addProperty("id", id); e.addProperty("nome", name); d.add(e); });
        options.add("decks", d);
        o.add("filtros", options);
        return o;
    }

    /** A partida vista do assento {@code me}; null se a linha não tem esse assento. */
    static JsonObject row(JsonObject match, int me) {
        JsonArray players = match.has("players") && match.get("players").isJsonArray() ? match.getAsJsonArray("players") : null;
        if (players == null || me < 0 || me >= players.size()) return null;
        JsonObject r = new JsonObject();
        copy(match, "id", r, "id");
        copy(match, "endedAt", r, "quando");
        copy(match, "format", r, "formato");
        copy(match, "length", r, "melhorDe");
        copy(match, "mode", r, "modo");
        copy(match, "ms", r, "ms");
        copy(match, "end", r, "fim");
        JsonElement winner = match.get("winner");
        String end = text(match, "end");
        r.addProperty("resultado", "queda".equals(end) ? "queda"
            : winner == null || winner.isJsonNull() ? "empate" : winner.getAsInt() == me ? "vitoria" : "derrota");
        int turns = 0, games = 0;
        if (match.has("games") && match.get("games").isJsonArray()) for (JsonElement g : match.getAsJsonArray("games")) {
            games++;
            if (g.isJsonObject() && g.getAsJsonObject().has("turns")) turns += g.getAsJsonObject().get("turns").getAsInt();
        }
        r.addProperty("turnos", turns);
        r.addProperty("jogos", games);
        JsonArray score = new JsonArray(), opponents = new JsonArray();
        score.add(wins(players.get(me)));
        for (int i = 0; i < players.size(); i++) {
            if (i == me) continue;
            score.add(wins(players.get(i)));
            JsonObject p = players.get(i).getAsJsonObject(), op = new JsonObject();
            copy(p, "name", op, "nome");
            op.addProperty("ia", p.has("ai") && p.get("ai").getAsBoolean());
            copy(p, "aiStyle", op, "estilo");
            copy(p, "deck", op, "deck");
            copy(p, "commander", op, "comandante");
            copy(p, "colors", op, "cores");
            opponents.add(op);
        }
        r.add("placar", score);
        JsonObject mine = players.get(me).getAsJsonObject(), deck = new JsonObject();
        copy(mine, "deckId", deck, "id");
        copy(mine, "deck", deck, "nome");
        copy(mine, "commander", deck, "comandante");
        copy(mine, "colors", deck, "cores");
        r.add("deck", deck);
        r.add("oponentes", opponents);
        return r;
    }

    /** Números das partidas filtradas, sem as que caíram sem vencedor. */
    static JsonObject numbers(List<JsonObject> rows) {
        int played = 0, won = 0, lost = 0, drawn = 0, timed = 0;
        long ms = 0;
        Map<String, int[]> byDeck = new LinkedHashMap<>(), byFormat = new LinkedHashMap<>(), byOpponent = new LinkedHashMap<>();
        Map<String, String> deckNames = new LinkedHashMap<>();
        String streak = null;
        int streakN = 0;
        boolean streakOpen = true;
        for (JsonObject r : rows) {
            String result = text(r, "resultado");
            if ("queda".equals(result)) continue;
            boolean win = "vitoria".equals(result);
            played++;
            if (win) won++; else if ("derrota".equals(result)) lost++; else drawn++;
            if (r.has("ms")) { ms += r.get("ms").getAsLong(); timed++; }
            String deck = deckKey(r.getAsJsonObject("deck"));
            deckNames.putIfAbsent(deck, text(r.getAsJsonObject("deck"), "nome"));
            tally(byDeck, deck, win);
            tally(byFormat, String.valueOf(text(r, "formato")), win);
            tally(byOpponent, "ia".equals(text(r, "modo")) ? "ia" : "pessoas", win);
            // Sequência atual: as mais recentes com o mesmo resultado; um empate encerra a contagem.
            if (streakOpen) {
                if ("empate".equals(result)) streakOpen = false;
                else if (streak == null || streak.equals(result)) { streak = result; streakN++; }
                else streakOpen = false;
            }
        }
        JsonObject o = new JsonObject();
        o.addProperty("partidas", played);
        o.addProperty("vitorias", won);
        o.addProperty("derrotas", lost);
        o.addProperty("empates", drawn);
        if (timed > 0) o.addProperty("duracaoMedia", ms / timed);
        if (streak != null) { JsonObject s = new JsonObject(); s.addProperty("resultado", streak); s.addProperty("n", streakN); o.add("sequencia", s); }
        o.add("porDeck", groups(byDeck, "id", deckNames));
        o.add("porFormato", groups(byFormat, "formato", null));
        o.add("porOponente", groups(byOpponent, "tipo", null));
        return o;
    }

    private static void tally(Map<String, int[]> map, String key, boolean win) {
        int[] t = map.computeIfAbsent(key, k -> new int[2]);
        t[0]++;
        if (win) t[1]++;
    }

    /** Do grupo com mais partidas para o com menos. */
    private static JsonArray groups(Map<String, int[]> map, String keyName, Map<String, String> names) {
        JsonArray a = new JsonArray();
        map.entrySet().stream().sorted((x, y) -> Integer.compare(y.getValue()[0], x.getValue()[0])).forEach(e -> {
            JsonObject g = new JsonObject();
            g.addProperty(keyName, e.getKey());
            if (names != null) g.addProperty("nome", names.get(e.getKey()));
            g.addProperty("partidas", e.getValue()[0]);
            g.addProperty("vitorias", e.getValue()[1]);
            a.add(g);
        });
        return a;
    }

    /** O deck salvo na conta pelo id; o de um navegador antigo, que não manda o id, pelo nome. */
    static String deckKey(JsonObject deck) {
        String id = text(deck, "id");
        return id != null ? id : "nome:" + String.valueOf(text(deck, "nome"));
    }

    private static long when(JsonObject row) {
        try { return Instant.parse(text(row, "quando")).toEpochMilli(); } catch (RuntimeException e) { return 0; }
    }

    private static int wins(JsonElement player) {
        JsonObject p = player.getAsJsonObject();
        return p.has("wins") ? p.get("wins").getAsInt() : 0;
    }

    private static String text(JsonObject o, String key) {
        return o != null && o.has(key) && o.get(key).isJsonPrimitive() ? o.get(key).getAsString() : null;
    }

    private static void copy(JsonObject from, String key, JsonObject to, String as) {
        if (from.has(key) && !from.get(key).isJsonNull()) to.add(as, from.get(key));
    }
}
