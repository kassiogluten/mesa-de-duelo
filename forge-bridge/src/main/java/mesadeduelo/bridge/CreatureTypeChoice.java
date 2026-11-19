// Escolher um tipo de criatura (Cavern of Souls, Kindred Discovery): a pergunta ganha purpose "creature-type" e, em cada tipo, quantas cartas do deck do jogador o têm.
package mesadeduelo.bridge;

import java.util.HashMap;
import java.util.Map;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.game.card.Card;
import forge.game.keyword.Keyword;
import forge.game.player.Player;

/**
 * O Forge manda os 380 e tantos tipos numa lista de texto, com os do deck primeiro (mas sem dizer quantas cartas cada um
 * tem). Aqui a pergunta ganha {@code purpose:"creature-type"} e cada opção, {@code count}: as cartas do jogador com o
 * tipo, contadas como o Forge conta para ordenar (sem as que têm todos os tipos, como os metamorfos).
 */
final class CreatureTypeChoice {
    private CreatureTypeChoice() { }

    /** Quantas cartas do jogador têm cada tipo de criatura. */
    static Map<String, Integer> counts(Player player) {
        Map<String, Integer> counts = new HashMap<>();
        if (player == null) return counts;
        for (Card c : player.getAllCards()) {
            if (c.hasKeyword(Keyword.CHANGELING) || c.getType().hasAllCreatureTypes()) continue;
            for (String type : c.getType().getCreatureTypes()) counts.merge(type, 1, Integer::sum);
        }
        return counts;
    }

    static void describe(JsonObject q, Map<String, Integer> counts, JsonArray rows) {
        q.addProperty("purpose", "creature-type");
        for (var e : rows) {
            JsonObject row = e.getAsJsonObject();
            Integer n = counts.get(row.get("label").getAsString());
            if (n != null && n > 0) row.addProperty("count", n);
        }
    }
}
