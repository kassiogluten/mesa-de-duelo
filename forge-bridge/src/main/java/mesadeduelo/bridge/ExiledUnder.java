package mesadeduelo.bridge;

import java.util.LinkedHashSet;
import java.util.Set;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.zone.ZoneType;

/**
 * Cartas que uma permanente exilou "com ela" ou "sob ela" (Journey to Nowhere, Oblivion Ring, Banisher Priest, Hostage
 * Taker, imprint, Hideaway) e que continuam no exílio: vão em {@code exiling} na permanente, para a mesa desenhá-las
 * saindo por baixo dela.
 */
final class ExiledUnder {
    private ExiledUnder() {}

    static void add(JsonObject o, Card permanent, Game game) {
        if (permanent == null || game == null || !permanent.isInPlay()) return;
        Set<Integer> ids = new LinkedHashSet<>();
        try {
            for (Card x : permanent.getExiledCards()) if (stillExiled(x, permanent, game)) ids.add(x.getId());
            for (Card x : permanent.getImprintedCards()) if (stillExiled(x, null, game)) ids.add(x.getId());
        } catch (RuntimeException concurrentRead) {
            return; // leitura durante a jogada do motor: fica para o próximo estado
        }
        if (ids.isEmpty()) return;
        JsonArray list = new JsonArray();
        ids.forEach(list::add);
        o.add("exiling", list);
    }

    /**
     * Ainda no exílio, como o mesmo objeto (uma carta que sai do exílio vira outro objeto no Forge). Ficam de fora as
     * exiladas para pagar a própria mágica (Delve): o Forge as liga à criatura, mas elas não estão "sob" ela.
     */
    private static boolean stillExiled(Card x, Card host, Game game) {
        if (x == null || x.isToken()) return false;
        if (host != null && (host.getDelved().contains(x) || (x.getExiledSA() != null && x.getExiledSA().isSpell()))) return false;
        Card now = game.getCardState(x, null);
        return now != null && now.isInZone(ZoneType.Exile);
    }
}
