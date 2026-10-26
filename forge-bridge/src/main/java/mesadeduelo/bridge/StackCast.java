package mesadeduelo.bridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.keyword.Keyword;
import forge.game.spellability.OptionalCost;
import forge.game.spellability.SpellAbility;
import forge.game.spellability.SpellAbilityStackInstance;

/**
 * Como um item da pilha foi pago: a forma de conjurar (flashback, evocar, aventura...), os custos opcionais pagos
 * (reforço, recompra, entrelaçar...) e o X. O StackItemView só traz parte disso em texto, então lê da habilidade real.
 */
final class StackCast {
    private StackCast() { }

    /** null quando não há nada além do custo normal, ou quando a pilha muda durante a leitura. */
    static JsonObject of(Game game, int stackId) {
        if (game == null) return null;
        try {
            for (SpellAbilityStackInstance item : game.getStack()) {
                if (item.getId() == stackId) return describe(item.getSpellAbility());
            }
        } catch (RuntimeException concurrentRead) { /* leitura durante a jogada do motor: o próximo estado traz */ }
        return null;
    }

    static JsonObject describe(SpellAbility sa) {
        if (sa == null) return null;
        SpellAbility root = sa.getRootAbility();
        JsonObject o = new JsonObject();
        if (root.isSpell()) {
            String mode = AbilityOptions.mode(root);
            if (!mode.equals("cast")) o.addProperty("mode", mode);
        }
        int kicker = root.getOptionalKeywordAmount(Keyword.MULTIKICKER);
        JsonArray extras = new JsonArray();
        for (OptionalCost cost : root.getOptionalCosts()) {
            switch (cost) {
                case Kicker1, Kicker2 -> kicker++;
                case Buyback -> extras.add("buyback");
                case Entwine -> extras.add("entwine");
                case Bargain -> extras.add("bargain");
                case PromiseGift -> extras.add("gift");
                case Teamwork -> extras.add("teamwork");
                case Offering -> extras.add("offering");
                case Flash -> extras.add("flash");
                case Generic -> extras.add("extra");
                // Retraçar e Jump-start são formas de conjurar do cemitério, não um extra.
                case Retrace -> o.addProperty("mode", "retrace");
                case Jumpstart -> o.addProperty("mode", "jumpstart");
                default -> { }
            }
        }
        if (kicker > 0) o.addProperty("kicker", kicker);
        if (!extras.isEmpty()) o.add("extras", extras);
        Integer x = root.getXManaCostPaid();
        if (x != null && root.getPayCosts() != null && root.getPayCosts().hasXInAnyCostPart()) o.addProperty("x", x);
        return o.size() == 0 ? null : o;
    }
}
