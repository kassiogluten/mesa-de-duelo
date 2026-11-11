package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

/**
 * Ranking dos jogadores da área de admin, contado das linhas do histórico ({@link MatchHistory}): partidas em rede e
 * contra a IA juntas, uma linha por pessoa (a IA só aparece como oponente). A mesma pessoa é a conta, quando entrou
 * com ela, e o apelido, quando não; sem nenhum dos dois, vai para "Sem apelido".
 */
final class PlayerRanking {
    private PlayerRanking() { }

    static final int TOP = 5, RECENT = 10;

    private static final class Tally { String name; int played, won; }
    private static final class Row {
        final String key; String name; boolean account;
        int played, won, lost, tied, conceded, dropped;
        String last;
        final Map<String, Tally> decks = new LinkedHashMap<>(), opponents = new LinkedHashMap<>();
        final JsonArray recent = new JsonArray();
        Row(String key) { this.key = key; }
    }

    /** Quem é o jogador do assento: "c:" + conta, "n:" + apelido em minúsculas, "-" sem nenhum; null para a IA. */
    static String key(JsonObject p) {
        if (bool(p, "ai")) return null;
        String account = string(p, "account"), name = string(p, "name");
        if (account != null) return "c:" + account;
        if (name != null && !name.isBlank()) return "n:" + name.strip().toLowerCase(Locale.ROOT);
        return "-";
    }

    /** As partidas, das mais recentes para as mais antigas (como {@link MatchHistory#read} devolve). */
    static JsonArray rank(Iterable<JsonObject> matches) {
        Map<String, Row> rows = new LinkedHashMap<>();
        for (JsonObject m : matches) {
            if (!m.has("players") || !m.get("players").isJsonArray()) continue;
            JsonArray players = m.getAsJsonArray("players");
            Integer winner = m.has("winner") && !m.get("winner").isJsonNull() ? m.get("winner").getAsInt() : null;
            String end = m.has("end") ? m.get("end").getAsString() : "concluida";
            for (int seat = 0; seat < players.size(); seat++) {
                if (!players.get(seat).isJsonObject()) continue;
                JsonObject p = players.get(seat).getAsJsonObject();
                String key = key(p);
                if (key == null) continue;
                Row r = rows.computeIfAbsent(key, Row::new);
                // A primeira linha é a mais recente: fica o apelido de agora.
                if (r.name == null) r.name = key.equals("-") ? null : string(p, "name");
                r.account |= key.startsWith("c:");
                if (r.last == null) r.last = string(m, "endedAt");
                r.played++;
                boolean won = winner != null && winner == seat;
                if ("queda".equals(end)) r.dropped++;
                else if (winner == null) r.tied++;
                else if (won) r.won++;
                else { r.lost++; if ("concedida".equals(end)) r.conceded++; }
                String deck = string(p, "commander") != null ? string(p, "commander") : string(p, "deck");
                if (deck != null) tally(r.decks, deck, deck, won);
                List<String> against = new ArrayList<>();
                for (int other = 0; other < players.size(); other++) {
                    if (other == seat || !players.get(other).isJsonObject()) continue;
                    JsonObject o = players.get(other).getAsJsonObject();
                    String name = shownName(o), id = key(o);
                    against.add(name);
                    tally(r.opponents, id == null ? "ia" : id, name, won);
                }
                if (r.recent.size() < RECENT) {
                    JsonObject g = new JsonObject();
                    g.addProperty("id", string(m, "id")); g.addProperty("endedAt", string(m, "endedAt"));
                    g.addProperty("format", string(m, "format")); g.addProperty("mode", string(m, "mode"));
                    g.addProperty("deck", deck); g.addProperty("against", String.join(", ", against));
                    g.addProperty("result", "queda".equals(end) ? "queda" : winner == null ? "empate" : won ? "vitoria" : "concedida".equals(end) ? "concedeu" : "derrota");
                    r.recent.add(g);
                }
            }
        }
        List<Row> sorted = new ArrayList<>(rows.values());
        sorted.sort(Comparator.<Row>comparingInt(r -> r.won).reversed().thenComparing(Comparator.comparingDouble(PlayerRanking::rate).reversed()).thenComparing(r -> r.played, Comparator.reverseOrder()));
        JsonArray out = new JsonArray();
        for (Row r : sorted) {
            JsonObject o = new JsonObject();
            o.addProperty("key", r.key);
            if (r.name != null) o.addProperty("name", r.name);
            o.addProperty("account", r.account);
            o.addProperty("played", r.played); o.addProperty("won", r.won); o.addProperty("lost", r.lost);
            o.addProperty("tied", r.tied); o.addProperty("conceded", r.conceded); o.addProperty("dropped", r.dropped);
            if (r.last != null) o.addProperty("last", r.last);
            o.add("decks", top(r.decks)); o.add("opponents", top(r.opponents)); o.add("recent", r.recent);
            out.add(o);
        }
        return out;
    }

    /** Vitórias sobre as partidas que tiveram resultado (a queda fica de fora). */
    static double rate(Row r) { int decided = r.won + r.lost + r.tied; return decided == 0 ? 0 : (double) r.won / decided; }

    private static String shownName(JsonObject p) {
        if (bool(p, "ai")) return "IA";
        String name = string(p, "name");
        return name == null || name.isBlank() ? "Sem apelido" : name.strip();
    }

    /** Soma na linha {@code key}; o nome que fica é o da partida mais recente (a primeira lida). */
    private static void tally(Map<String, Tally> map, String key, String name, boolean won) {
        Tally t = map.computeIfAbsent(key, n -> new Tally());
        if (t.name == null) t.name = name;
        t.played++; if (won) t.won++;
    }

    private static JsonArray top(Map<String, Tally> map) {
        JsonArray a = new JsonArray();
        map.entrySet().stream().sorted(Comparator.<Map.Entry<String, Tally>>comparingInt(e -> e.getValue().played).reversed()).limit(TOP).forEach(e -> {
            JsonObject o = new JsonObject();
            o.addProperty("name", e.getValue().name); o.addProperty("played", e.getValue().played); o.addProperty("won", e.getValue().won);
            a.add(o);
        });
        return a;
    }

    private static String string(JsonObject o, String field) {
        JsonElement e = o.get(field);
        return e == null || e.isJsonNull() || !e.isJsonPrimitive() ? null : e.getAsString();
    }
    private static boolean bool(JsonObject o, String field) {
        JsonElement e = o.get(field);
        return e != null && e.isJsonPrimitive() && e.getAsBoolean();
    }
}
