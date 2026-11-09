// Revelar o topo do grimório e escolher (Grisly Salvage, Satyr Wayfinder) numa janela só, para quem escolhe e quem assiste.
package mesadeduelo.bridge;

import java.util.List;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.ability.ApiType;
import forge.game.card.Card;
import forge.game.card.CardCollectionView;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;

/**
 * No "revele as N cartas do topo e escolha" (Dig com Reveal), o Forge mostra as cartas a todos numa janela que segura o
 * jogo e, depois da escolha, mostra a escolhida aos outros noutra janela. A mesa troca isso por: para quem escolhe, a
 * escolha já com todas as reveladas (as que não servem apagadas); para quem assiste, uma janela que não segura o jogo
 * ({@link View}) e se atualiza com a escolha, como a das remoções.
 */
final class LibraryReveal {
    private LibraryReveal() { }

    /**
     * O que quem assiste vê: o efeito, quem escolhe, as cartas e as escolhidas. {@code chosen} null: ainda escolhendo
     * (ou não escolheu nada, quando o efeito já resolveu). {@code mine}: o revelar foi do próprio jogador e nenhuma
     * escolha veio depois (sem carta válida), então a janela só mostra as cartas.
     */
    record View(int seq, int stackId, String chooser, Card source, List<Card> cards, List<Integer> chosen, boolean mine) {
        View choose(List<Integer> ids) { return new View(seq, stackId, chooser, source, cards, ids, mine); }
    }

    /** O Dig com Reveal que está resolvendo e revela estas cartas do grimório de {@code owner}; null se não for esse caso. */
    static SpellAbility dig(Game game, Player owner, CardCollectionView cards) {
        if (game == null || owner == null || cards == null || cards.isEmpty()) return null;
        var stack = game.getStack();
        if (!stack.isResolving() || stack.isEmpty() || stack.peek() == null) return null;
        for (Card c : cards) if (!owner.getCardsIn(ZoneType.Library).contains(c)) return null;
        for (SpellAbility sa = stack.peek().getSpellAbility(); sa != null; sa = sa.getSubAbility()) {
            if (sa.getApi() != ApiType.Dig || !"True".equalsIgnoreCase(sa.getParam("Reveal"))) continue;
            // Outro jogador escolhe (Choser), ou a habilidade pergunta antes se vai em frente: fica como o Forge faz.
            if (sa.hasParam("Choser") || sa.hasParam("PromptToSkipOptionalAbility")) return null;
            return sa;
        }
        return null;
    }

    /** O item da pilha que está resolvendo, para saber quando o efeito terminou. */
    static int resolvingId(Game game) {
        var stack = game == null ? null : game.getStack();
        return stack == null || !stack.isResolving() || stack.isEmpty() || stack.peek() == null ? -1 : stack.peek().getId();
    }

    /**
     * A janela no estado do jogador. {@code waiting}: quem escolhe ainda não escolheu (o efeito continua resolvendo).
     * O revelar do próprio jogador só aparece se o efeito terminar sem a escolha (que já mostra as cartas); null antes.
     */
    static JsonObject json(View v, Game game) {
        if (v.mine() && resolvingId(game) == v.stackId()) return null;
        JsonObject o = new JsonObject();
        o.addProperty("seq", v.seq());
        if (v.chooser() != null) o.addProperty("chooser", v.chooser());
        if (v.source() != null) o.add("source", StateJson.card(v.source().getView()));
        JsonArray cards = new JsonArray();
        for (Card c : v.cards()) cards.add(StateJson.card(c.getView()));
        o.add("cards", cards);
        if (v.chosen() != null) { JsonArray ids = new JsonArray(); v.chosen().forEach(ids::add); o.add("chosen", ids); }
        boolean waiting = v.chosen() == null && !v.mine() && resolvingId(game) == v.stackId();
        o.addProperty("waiting", waiting);
        if (v.mine()) o.addProperty("mine", true);
        return o;
    }
}
