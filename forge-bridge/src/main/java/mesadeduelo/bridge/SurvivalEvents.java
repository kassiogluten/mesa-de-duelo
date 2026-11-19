// As permanentes que deveriam ter sido destruídas e ficaram no campo: as indestrutíveis que a mágica ou habilidade resolvendo mandou destruir (o Forge não avisa nada nesse caso) e as que se regeneraram.
package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import forge.game.Game;
import forge.game.ability.AbilityUtils;
import forge.game.ability.ApiType;
import forge.game.card.Card;
import forge.game.keyword.Keyword;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;

final class SurvivalEvents {
    private SurvivalEvents() { }

    /**
     * As indestrutíveis que a mágica ou habilidade que acabou de resolver tentou destruir ("destrua a criatura alvo",
     * "destrua todas as criaturas") e que continuam no campo, na ordem em que estão nele.
     */
    static List<Card> withstood(Game game) {
        SpellAbility resolving = game == null ? null : game.getStack().getResolvingAbility();
        if (resolving == null) return List.of();
        Set<Card> aimed = new LinkedHashSet<>();
        try {
            for (SpellAbility sa = resolving.getRootAbility(); sa != null; sa = sa.getSubAbility()) {
                if (sa.getApi() == ApiType.Destroy) {
                    if (sa.usesTargeting()) for (Card c : sa.getTargets().getTargetCards()) aimed.add(c);
                    else if (sa.hasParam("Defined")) aimed.addAll(AbilityUtils.getDefinedCards(sa.getHostCard(), sa.getParam("Defined"), sa));
                } else if (sa.getApi() == ApiType.DestroyAll) {
                    String valid = sa.getParamOrDefault("ValidCards", "");
                    // O X do texto ("valor de mana X ou menos") depende de contas da própria carta: fica de fora.
                    if (valid.contains("X")) continue;
                    for (Card c : AbilityUtils.filterListByType(game.getCardsIn(ZoneType.Battlefield), valid, sa)) aimed.add(c);
                }
            }
        } catch (RuntimeException unreadable) { return List.of(); }
        List<Card> stayed = new ArrayList<>();
        for (Card c : aimed) if (c != null && c.isInZone(ZoneType.Battlefield) && c.hasKeyword(Keyword.INDESTRUCTIBLE)) stayed.add(c);
        return stayed;
    }
}
