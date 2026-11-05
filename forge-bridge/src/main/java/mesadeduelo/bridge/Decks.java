package mesadeduelo.bridge;

import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import forge.deck.Deck;

/** The browser and bridge consume the same reviewed starter collection. */
final class Decks {
    static final Map<String, JsonObject> LISTS = new LinkedHashMap<>();
    static {
        try (var stream = Decks.class.getResourceAsStream("/starter-decks.json")) {
            if (stream == null) throw new IllegalStateException("Coleção de decks prontos não encontrada.");
            for (var e : JsonParser.parseReader(new InputStreamReader(stream, StandardCharsets.UTF_8)).getAsJsonArray()) {
                JsonObject o = e.getAsJsonObject(); LISTS.put(o.get("id").getAsString(), o);
            }
        } catch (java.io.IOException e) { throw new ExceptionInInitializerError(e); }
    }

    static JsonObject template(String id) {
        JsonObject o = LISTS.get(id);
        if (o == null) o = LISTS.get("padrao-" + id);
        return o == null ? null : o.deepCopy();
    }

    static Deck build(String id) {
        JsonObject source = template(id);
        var result = DeckValidation.validate(source, source != null && source.has("format") ? source.get("format").getAsString() : "free");
        if (!result.valid()) throw new IllegalArgumentException("Deck pronto inválido: " + id);
        return result.deck();
    }

    /** Bracket conferido à mão de um deck pronto (pelo nome, como o sorteio o monta); 0 se não houver. */
    static int bracket(Deck deck) {
        for (JsonObject o : LISTS.values())
            if (o.has("bracket") && o.get("name").getAsString().equals(deck.getName())) return o.get("bracket").getAsInt();
        return 0;
    }

    static Deck random(String format) { return random(format, 0, java.util.Set.of()); }
    static Deck random(String format, int bracket) { return random(format, bracket, java.util.Set.of()); }

    /**
     * Um deck pronto do formato, sorteado. Com {@code bracket} (1 a 5), entre os de bracket mais perto dele, para o
     * computador que completa uma mesa de Commander jogar no nível dela; 0 sorteia entre todos. Evita os decks com algo
     * de {@code taken} (veja {@link #tableKeys}): passa para o bracket seguinte antes de repetir, e só repete quando
     * não sobra nenhum.
     */
    static Deck random(String format, int bracket, java.util.Set<String> taken) {
        var groups = new java.util.TreeMap<Integer, java.util.List<JsonObject>>();
        for (JsonObject o : LISTS.values()) {
            String of = o.has("format") ? o.get("format").getAsString() : "free";
            boolean fits = "free".equals(format) ? !"commander".equals(of) && !"oathbreaker".equals(of) : "precon".equals(format) ? o.has("precon") : format.equals(of);
            int distance = bracket <= 0 ? 0 : o.has("bracket") ? Math.abs(o.get("bracket").getAsInt() - bracket) : Integer.MAX_VALUE;
            if (fits) groups.computeIfAbsent(distance, k -> new java.util.ArrayList<>()).add(o);
        }
        // O precon é conferido como o Commander que ele é: o sorteio já escolheu só entre eles.
        String rules = "precon".equals(format) ? "commander" : format;
        var random = java.util.concurrent.ThreadLocalRandom.current();
        Deck repeat = null;
        for (var group : groups.values()) {
            var valid = group.stream().map(o -> DeckValidation.validateForAi(o, rules)).filter(DeckValidation.Result::valid).map(DeckValidation.Result::deck).toList();
            if (valid.isEmpty()) continue;
            var fresh = valid.stream().filter(d -> java.util.Collections.disjoint(tableKeys(d), taken)).toList();
            if (!fresh.isEmpty()) return fresh.get(random.nextInt(fresh.size()));
            if (repeat == null) repeat = valid.get(random.nextInt(valid.size()));
        }
        if (repeat == null) throw new IllegalArgumentException("Não há deck pronto válido para este formato.");
        return repeat;
    }

    /** O que conta como o mesmo deck na mesa: os comandantes, cada um pelo nome; sem comandante, o nome do deck. */
    static java.util.Set<String> tableKeys(Deck deck) {
        var keys = new java.util.HashSet<String>();
        var commanders = deck.get(forge.deck.DeckSection.Commander);
        if (commanders != null) for (var e : commanders) keys.add(e.getKey().getName());
        if (keys.isEmpty()) keys.add("deck:" + deck.getName());
        return keys;
    }

    /** As cartas de cada precon (comandantes e deck), com os nomes como o motor os conhece; montado na primeira consulta. */
    private static volatile java.util.List<Map<String, Integer>> precons;

    /** Se o deck tem exatamente as cartas de um precon oficial, sem nada trocado (a impressão não importa). */
    static boolean isPrecon(Deck deck) {
        var lists = precons;
        if (lists == null) {
            lists = new java.util.ArrayList<>();
            for (JsonObject o : LISTS.values()) if (o.has("precon")) lists.add(contents(DeckValidation.validate(o, "commander").deck()));
            precons = lists = java.util.List.copyOf(lists);
        }
        return lists.contains(contents(deck));
    }

    private static Map<String, Integer> contents(Deck deck) {
        Map<String, Integer> counts = new java.util.HashMap<>();
        for (var section : new forge.deck.DeckSection[]{forge.deck.DeckSection.Commander, forge.deck.DeckSection.Main, forge.deck.DeckSection.Sideboard})
            for (var e : deck.getOrCreate(section)) counts.merge(section + ":" + e.getKey().getName(), e.getValue(), Integer::sum);
        return counts;
    }

    private Decks() { }
}
