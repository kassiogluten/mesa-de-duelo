package mesadeduelo.bridge;

import java.util.Collection;
import java.util.List;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.game.replacement.ReplacementEffectView;

/**
 * Qual efeito de substituição se aplica primeiro (Corpsejack Menace com Hardened Scales): uma escolha simples entre
 * todos os efeitos, com "usar em todas" quando a decisão se repete dentro do mesmo efeito em resolução (uma por
 * criatura que recebe marcadores). O Forge manda a ordem já escolhida antes na lista de destino e deixa a de origem
 * vazia; a mesa, que só via a de origem, abria uma escolha sem opções.
 */
final class ReplacementOrder {
    private ReplacementOrder() { }

    /** O pedido de ordem do Forge ({@code order}) é de efeitos de substituição. */
    static boolean is(Object[] a) {
        return all(a[4]) && all(a[5]) && (!empty(a[4]) || !empty(a[5]));
    }

    /** As opções são todos os efeitos, a ordem escolhida antes primeiro; {@code applyToAll} diz se a mesa oferece "usar em todas". */
    static void describe(JsonObject q, List<Object> options, Object[] a, boolean applyToAll) {
        if (a[5] instanceof Collection<?> placed) options.addAll(placed);
        if (a[4] instanceof Collection<?> source) options.addAll(source);
        q.addProperty("kind", "choose");
        q.addProperty("purpose", "replacement-order");
        q.addProperty("title", "Qual efeito aplicar primeiro?");
        q.addProperty("min", 1);
        q.addProperty("max", 1);
        q.addProperty("applyToAll", applyToAll);
        JsonArray rows = new JsonArray();
        for (Object o : options) {
            ReplacementEffectView re = (ReplacementEffectView) o;
            JsonObject j = new JsonObject();
            j.addProperty("kind", "ability");
            if (re.getHostCard() != null) j.add("card", StateJson.card(re.getHostCard()));
            // O Forge começa a descrição com "Nome (id) - "; a carta já vem em card.
            j.addProperty("ability", String.valueOf(re.getDescription()).replaceFirst("^.*?\\(\\d+\\) - ", ""));
            j.addProperty("label", String.valueOf(re));
            rows.add(j);
        }
        q.add("options", rows);
    }

    private static boolean all(Object list) {
        return list == null || list instanceof Collection<?> c && c.stream().allMatch(o -> o instanceof ReplacementEffectView);
    }

    private static boolean empty(Object list) { return !(list instanceof Collection<?> c) || c.isEmpty(); }
}
