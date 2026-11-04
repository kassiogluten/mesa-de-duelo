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

    static Deck random(String format) { return random(format, 0); }

    /**
     * Um deck pronto do formato, sorteado. Com {@code bracket} (1 a 5), só entre os de bracket mais perto dele, para o
     * computador que completa uma mesa de Commander jogar no nível dela; 0 sorteia entre todos.
     */
    static Deck random(String format, int bracket) {
        var candidates = LISTS.values().stream()
            .filter(o -> { String of = o.has("format") ? o.get("format").getAsString() : "free"; return "free".equals(format) ? !"commander".equals(of) && !"oathbreaker".equals(of) : "precon".equals(format) ? o.has("precon") : format.equals(of); })
            .toList();
        if (bracket > 0) {
            int nearest = candidates.stream().filter(o -> o.has("bracket")).mapToInt(o -> Math.abs(o.get("bracket").getAsInt() - bracket)).min().orElse(-1);
            if (nearest >= 0) candidates = candidates.stream().filter(o -> o.has("bracket") && Math.abs(o.get("bracket").getAsInt() - bracket) == nearest).toList();
        }
        // O precon é conferido como o Commander que ele é: o sorteio já escolheu só entre eles.
        String rules = "precon".equals(format) ? "commander" : format;
        var valid = candidates.stream().map(o -> DeckValidation.validateForAi(o, rules)).filter(DeckValidation.Result::valid).toList();
        if (valid.isEmpty() && bracket > 0) return random(format, 0);
        if (valid.isEmpty()) throw new IllegalArgumentException("Não há deck pronto válido para este formato.");
        return valid.get(java.util.concurrent.ThreadLocalRandom.current().nextInt(valid.size())).deck();
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
