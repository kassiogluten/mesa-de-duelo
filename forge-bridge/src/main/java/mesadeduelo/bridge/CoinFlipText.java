package mesadeduelo.bridge;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import forge.util.CardTranslation;

/**
 * Textos da moeda. A tradução do Forge sai quebrada ("Você vitórias o cara-coroa", "Você's caroa-coroa cara"),
 * o pedido usa o nome da carta em inglês ("Stitch in Time - Lança moeda") e a pilha fica em inglês
 * ("Você flips a coin. Targeting: [...]"). Aqui tudo vira "Costurado no Tempo: você ganhou na moeda.".
 */
final class CoinFlipText {
    private CoinFlipText() { }

    private static final Pattern PROMPT = Pattern.compile("^(.+) - Lança moeda(.*)$", Pattern.DOTALL);
    private static final Pattern CHOICE = Pattern.compile("^(.+) - Escolha um resultado$");
    private static final Pattern CALLED = Pattern.compile("^(.+?) (vitória|derrota)s? o cara-coroa$");
    private static final Pattern NO_CALL = Pattern.compile("^(.+?)['’]s (?:caroa|cara)-coroa (cara|coroa)$");
    private static final Pattern STACK = Pattern.compile("^(.+?) \\((\\d+)\\) - .+? flips a coin\\. Targeting: \\[\\1 \\(\\2\\), (.+)\\]\\.$", Pattern.DOTALL);
    private static final Pattern CARD_ID = Pattern.compile(" \\(\\d+\\)$");
    private static final Map<String, String> LABELS = Map.of("cara", "Cara", "coroa", "Coroa",
        "ganhou na moeda", "Ganhou na moeda", "perdeu na moeda", "Perdeu na moeda");

    /** "Stitch in Time - Lança moeda" → "Costurado no Tempo: cara ou coroa?" (com a rodada ou o jogador, se houver). */
    static String prompt(String message) {
        Matcher m = message == null ? null : PROMPT.matcher(message);
        if (m == null || !m.matches()) return message;
        String extra = m.group(2).trim().replaceAll("^\\((.*)\\)$", "$1");
        return CardTranslation.getTranslatedName(m.group(1)) + ": cara ou coroa?" + (extra.isEmpty() ? "" : " (" + extra + ")");
    }

    /** Botões e opções em minúsculas ("cara", "coroa") ganham maiúscula; o resto fica como veio. */
    static String label(String label) {
        return LABELS.getOrDefault(label, label);
    }

    /** Krark's Thumb: "Stitch in Time - Escolha um resultado" com cara/coroa vira "Costurado no Tempo: escolha o resultado da moeda". */
    static void choice(JsonObject q) {
        Matcher m = CHOICE.matcher(q.has("title") ? q.get("title").getAsString() : "");
        if (!m.matches() || !(q.get("options") instanceof JsonArray rows) || rows.isEmpty()) return;
        for (JsonElement row : rows)
            if (!(row instanceof JsonObject o) || !o.has("label") || !LABELS.containsKey(o.get("label").getAsString())) return;
        q.addProperty("title", CardTranslation.getTranslatedName(m.group(1)) + ": escolha o resultado da moeda");
        for (JsonElement row : rows) ((JsonObject) row).addProperty("label", label(((JsonObject) row).get("label").getAsString()));
    }

    /**
     * O aviso do resultado. {@code card} é o título que o Forge manda junto ("Costurado no Tempo (6)").
     * "Você vitórias o cara-coroa" → "Costurado no Tempo: você ganhou na moeda.";
     * "Oponente's caroa-coroa coroa" → "Duelo de Mana: a moeda de Oponente deu coroa.".
     */
    static String notice(String text, String card) {
        if (text == null) return null;
        String prefix = card == null || card.isBlank() ? "" : CARD_ID.matcher(card.trim()).replaceFirst("") + ": ";
        Matcher called = CALLED.matcher(text.trim());
        if (called.matches()) {
            String who = called.group(1), result = "vitória".equals(called.group(2)) ? "ganhou" : "perdeu";
            return sentence(prefix, (isYou(who) ? "você" : who) + " " + result + " na moeda.");
        }
        Matcher noCall = NO_CALL.matcher(text.trim());
        if (noCall.matches()) {
            String who = noCall.group(1);
            return sentence(prefix, (isYou(who) ? "sua moeda" : "a moeda de " + who) + " deu " + noCall.group(2) + ".");
        }
        return text;
    }

    /**
     * Pilha e registro: "Costurado no Tempo (6) - Você flips a coin. Targeting: [Costurado no Tempo (6), Jogue uma moeda...]."
     * vira "Costurado no Tempo (6) - Jogue uma moeda..." como as outras mágicas; sem a descrição, só traduz a frase.
     */
    static String stack(String text) {
        if (text == null || !text.contains(" flips a coin.")) return text;
        Matcher m = STACK.matcher(text);
        if (m.matches()) return m.group(1) + " (" + m.group(2) + ") - " + m.group(3);
        return text.replace(" flips a coin.", " joga uma moeda.").replace(" Targeting: ", " Alvos: ");
    }

    private static boolean isYou(String who) { return "você".equalsIgnoreCase(who); }

    private static String sentence(String prefix, String rest) {
        return prefix.isEmpty() ? Character.toUpperCase(rest.charAt(0)) + rest.substring(1) : prefix + rest;
    }
}
