package mesadeduelo.bridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.card.CardStateName;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.card.CardState;
import forge.game.card.CardView;
import forge.game.keyword.Keyword;
import forge.game.keyword.KeywordInterface;

/**
 * Cartas previstas (Foretell): ficam viradas para baixo no exílio, mas o dono pode olhá-las. Para ele a carta vai de
 * face para cima, com {@code foretold} e o custo previsto em {@code foretellCost}; os outros recebem só o verso com
 * {@code foretold}.
 */
final class Foretold {
    private Foretold() {}

    /** O exílio de quem está vendo: as previstas dele vão com a face à mostra. */
    static JsonArray forOwner(Iterable<CardView> exile, Game game) {
        JsonArray a = new JsonArray();
        if (exile != null) for (CardView c : exile) a.add(card(c, game));
        return a;
    }

    static JsonObject card(CardView c, Game game) {
        JsonObject o = StateJson.card(c, game);
        if (game == null || !c.isFaceDown() || !c.isForeTold()) return o;
        Card gc;
        try { gc = game.findByView(c); } catch (RuntimeException concurrentRead) { return o; }
        if (gc == null) return o;
        CardState face = gc.getState(CardStateName.Original);
        if (face == null) return o;
        o.remove("faceDown");
        o.addProperty("name", face.getName());
        o.addProperty("set", face.getSetCode());
        String cost = face.getManaCost() == null ? "" : face.getManaCost().toString();
        o.addProperty("manaCost", "no cost".equals(cost) ? "" : cost);
        o.addProperty("typeLine", face.getType() == null ? "" : face.getType().toString());
        o.addProperty("text", face.getView().getOracleText());
        o.addProperty("creature", face.getType() != null && face.getType().isCreature());
        o.addProperty("land", face.getType() != null && face.getType().isLand());
        String foretell = foretellCost(face);
        if (foretell != null) o.addProperty("foretellCost", foretell);
        return o;
    }

    /** "Foretell:1 U" → "{1}{U}"; sem custo na palavra-chave (previsão dada por outra carta), nada. */
    static String foretellCost(CardState face) {
        for (KeywordInterface k : face.getCachedKeywords()) {
            if (k.getKeyword() != Keyword.FORETELL) continue;
            String[] parts = k.getOriginal().split(":", 2);
            if (parts.length == 2 && !parts[1].isBlank()) return braces(parts[1].trim());
        }
        return null;
    }

    private static String braces(String shortCost) {
        StringBuilder sb = new StringBuilder();
        for (String shard : shortCost.trim().split("\\s+")) sb.append('{').append(shard).append('}');
        return sb.toString();
    }
}
