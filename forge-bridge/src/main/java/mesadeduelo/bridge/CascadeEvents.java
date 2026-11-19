// Cascata e descobrir nos eventos da mesa: as cartas que saem do topo do grimório até a que serve, numa entrada só, com a que parou a busca e se ela foi conjurada.
package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.List;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.ability.ApiType;
import forge.game.card.CardView;
import forge.game.keyword.Keyword;
import forge.game.spellability.SpellAbility;

final class CascadeEvents {
    /** O item da pilha que está cavando, o jeito ("cascade" ou "discover") e as cartas exiladas até agora, do topo para baixo. */
    private int stackId = -1;
    private String dig;
    private JsonObject source;
    private int actor = -1;
    private final List<CardView> cards = new ArrayList<>();

    void reset() { stackId = -1; dig = null; source = null; actor = -1; cards.clear(); }

    /** "cascade" ou "discover" se é isso que está resolvendo agora; senão, null. */
    static String digging(Game game) {
        SpellAbility resolving = game == null ? null : game.getStack().getResolvingAbility();
        if (resolving == null) return null;
        try {
            SpellAbility root = resolving.getRootAbility();
            if (root.isTrigger() && root.getTrigger() != null && root.getTrigger().isKeyword(Keyword.CASCADE)) return "cascade";
            for (SpellAbility sa = root; sa != null; sa = sa.getSubAbility()) if (sa.getApi() == ApiType.Discover) return "discover";
        } catch (RuntimeException unreadable) { /* sem a cascata desta vez */ }
        return null;
    }

    /** Uma carta foi do grimório para o exílio: se é a cascata ou o descobrir cavando, entra na lista. */
    void exiled(Game game, CardView card) {
        String kind = digging(game);
        if (kind == null || card == null) return;
        var item = game.getStack().peek();
        int id = item == null ? -1 : item.getId();
        if (id != stackId) { reset(); stackId = id; }
        dig = kind;
        SpellAbility resolving = game.getStack().getResolvingAbility();
        if (resolving != null && resolving.getHostCard() != null) source = StateJson.card(resolving.getHostCard().getView());
        if (resolving != null && resolving.getActivatingPlayer() != null) actor = resolving.getActivatingPlayer().getId();
        cards.add(card);
    }

    boolean pending() { return dig != null && !cards.isEmpty(); }

    /** A carta `id` está entre as que a busca exilou (é ela sendo conjurada de graça). */
    boolean found(int id) { return pending() && cards.stream().anyMatch(c -> c.getId() == id); }

    /**
     * Fecha a busca num evento `cascade`: as cartas na ordem em que saíram, a que parou a busca (`hit`, a última, se não
     * é terreno) e, com {@code castId}, que ela foi conjurada. Null se não havia busca.
     */
    JsonObject flush(Integer castId) {
        if (!pending()) { reset(); return null; }
        JsonObject e = new JsonObject();
        e.addProperty("type", "cascade");
        e.addProperty("dig", dig);
        if (source != null) { e.add("card", source); e.addProperty("sourceId", source.get("id").getAsInt()); }
        if (actor >= 0) e.addProperty("actor", actor);
        e.addProperty("stackId", stackId);
        JsonArray revealed = new JsonArray();
        for (CardView c : cards) revealed.add(StateJson.card(c));
        e.add("revealed", revealed);
        CardView last = cards.get(cards.size() - 1);
        var state = last.getCurrentState();
        if (castId != null) { e.addProperty("hit", castId); e.addProperty("cast", true); }
        else if (state != null && !state.isLand()) e.addProperty("hit", last.getId());
        reset();
        return e;
    }
}
