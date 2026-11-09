// Junta o "revela a mão e você escolhe" (Thoughtseize, Duress) numa janela só: reconhece o revelar que vem antes da escolha.
package mesadeduelo.bridge;

import forge.game.Game;
import forge.game.ability.AbilityUtils;
import forge.game.ability.ApiType;
import forge.game.card.CardCollectionView;
import forge.game.card.CardLists;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;

/**
 * No descarte em que um jogador revela a mão e quem conjurou escolhe (modos RevealYouChoose e LookYouChoose), o Forge
 * mostra as cartas numa janela de revelar e, em seguida, pergunta quais descartar só entre as válidas. A mesa pula esse
 * revelar quando a escolha vem com certeza depois, e a escolha leva as cartas reveladas que não podem ser escolhidas
 * (o terreno, no Thoughtseize). Sem carta válida, ou sem poder descartar, o revelar continua como antes.
 */
final class DiscardReveal {
    private DiscardReveal() { }

    /** Se este revelar para {@code chooser} é o de um descarte em que ele mesmo escolhe logo depois entre essas cartas. */
    static boolean choiceFollows(Game game, Player chooser, Player owner, CardCollectionView cards) {
        if (game == null || owner == null || owner == chooser || cards == null || cards.isEmpty()) return false;
        var stack = game.getStack();
        if (!stack.isResolving() || stack.isEmpty() || stack.peek() == null) return false;
        for (SpellAbility sa = stack.peek().getSpellAbility(); sa != null; sa = sa.getSubAbility()) {
            if (sa.getApi() != ApiType.Discard || sa.getActivatingPlayer() != chooser) continue;
            String mode = sa.getParamOrDefault("Mode", "");
            if (!(mode.equals("RevealYouChoose") || mode.equals("LookYouChoose"))) continue;
            if (!owner.canDiscardBy(sa, true)) return false;
            String valid = sa.getParamOrDefault("DiscardValid", "Card");
            int choosable = CardLists.getValidCards(cards, valid, sa.getHostCard().getController(), sa.getHostCard(), sa).size();
            int numCards = sa.hasParam("NumCards") ? AbilityUtils.calculateAmount(sa.getHostCard(), sa.getParam("NumCards"), sa) : 1;
            return choosable > 0 && (sa.hasParam("AnyNumber") || numCards > 0);
        }
        return false;
    }
}
