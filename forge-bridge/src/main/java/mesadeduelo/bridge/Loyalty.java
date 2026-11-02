package mesadeduelo.bridge;

import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.card.CounterEnumType;
import forge.game.cost.CostPart;
import forge.game.cost.CostPutCounter;
import forge.game.cost.CostRemoveCounter;
import forge.game.spellability.SpellAbility;
import forge.game.spellability.SpellAbilityStackInstance;

/**
 * Habilidade de lealdade de um planeswalker que foi para a pilha: a mesa dá a ela um destaque próprio (o marcador
 * reage, o custo flutua, o ultimate ganha um efeito maior). O StackItemView não diz nada disso, então lê da habilidade
 * real, pelo id da pilha.
 */
final class Loyalty {
    private Loyalty() { }

    /** Acrescenta {@code loyalty}, {@code cost} ("+2", "0", "-3") e {@code ultimate} ao evento; nada se não for de lealdade. */
    static boolean describe(JsonObject event, Game game, int stackId) {
        SpellAbility sa = ability(game, stackId);
        if (sa == null || !sa.isPwAbility()) return false;
        event.addProperty("loyalty", true);
        String cost = cost(sa);
        if (cost != null) event.addProperty("cost", cost);
        if (sa.hasParam("Ultimate")) event.addProperty("ultimate", true);
        return true;
    }

    private static SpellAbility ability(Game game, int stackId) {
        if (game == null) return null;
        try {
            for (SpellAbilityStackInstance item : game.getStack()) {
                if (item.getId() == stackId) return item.getSpellAbility();
            }
        } catch (RuntimeException concurrentRead) { /* a pilha mudou durante a leitura: fica sem o destaque */ }
        return null;
    }

    /** A parte do custo que põe ou tira marcadores de lealdade. */
    static boolean isLoyaltyPart(CostPart part) {
        return part instanceof CostPutCounter put && put.getCounter().is(CounterEnumType.LOYALTY)
            || part instanceof CostRemoveCounter remove && remove.counter != null && remove.counter.is(CounterEnumType.LOYALTY);
    }

    /** O custo de lealdade como está impresso: "+1", "0", "-3"; no "-X", o X escolhido quando já se sabe. */
    static String cost(SpellAbility sa) {
        if (sa.getPayCosts() == null) return null;
        for (CostPart part : sa.getPayCosts().getCostParts()) {
            if (part instanceof CostPutCounter put && put.getCounter().is(CounterEnumType.LOYALTY)) return put.toString();
            if (part instanceof CostRemoveCounter remove && remove.counter != null && remove.counter.is(CounterEnumType.LOYALTY)) {
                String amount = remove.getAmount();
                Integer x = sa.getRootAbility().getXManaCostPaid();
                return "-" + ("X".equals(amount) && x != null ? x.toString() : amount);
            }
        }
        return null;
    }
}
