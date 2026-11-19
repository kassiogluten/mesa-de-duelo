// Custos opcionais ao conjurar (reforço, recompra, entrelaçar...): a pergunta ganha o tipo de cada custo, a parte em mana e o resto por extenso, o custo da mágica sem eles e a mana que o jogador consegue gerar.
package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.List;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.card.mana.ManaCost;
import forge.game.cost.Cost;
import forge.game.cost.CostPart;
import forge.game.cost.CostPartMana;
import forge.game.player.Player;
import forge.game.spellability.OptionalCostValue;
import forge.game.spellability.SpellAbility;

/**
 * O Forge pergunta os custos opcionais numa lista de texto ("Kicker – {4}"), sem dizer quanto a mágica custa no total nem
 * se a mana dá. Aqui a pergunta ganha {@code purpose:"optional-costs"}, o {@code cost} (o custo de mana da mágica em
 * {@code base} e a mana disponível) e, em cada opção, {@code optional} (Kicker, Buyback, Entwine...), {@code cost} (a parte
 * em mana) e {@code extra} (o que não é mana, por extenso).
 */
final class OptionalCosts {
    private OptionalCosts() { }

    record Option(String type, String mana, List<String> extra) { }
    record Context(String base, int available, List<Option> options) { }

    static Context of(SpellAbility sa, List<OptionalCostValue> costs, Player player) {
        ManaCost total = sa == null || sa.getPayCosts() == null ? null : sa.getPayCosts().getTotalMana();
        List<Option> options = new ArrayList<>();
        for (OptionalCostValue v : costs) {
            Cost cost = v.getCost();
            ManaCost mana = cost == null ? null : cost.getTotalMana();
            List<String> extra = new ArrayList<>();
            if (cost != null) for (CostPart part : cost.getCostParts()) if (!(part instanceof CostPartMana)) extra.add(part.toString());
            options.add(new Option(v.getType().name(), mana == null || mana.isNoCost() ? "" : mana.toString(), extra));
        }
        return new Context(total == null || total.isNoCost() ? "" : NumberChoice.withoutX(total), NumberChoice.available(player), options);
    }

    static void describe(JsonObject q, Context c, JsonArray rows) {
        q.addProperty("purpose", "optional-costs");
        JsonObject cost = new JsonObject();
        cost.addProperty("base", c.base());
        cost.addProperty("each", "");
        if (c.available() >= 0) cost.addProperty("available", c.available());
        q.add("cost", cost);
        for (int i = 0; i < rows.size() && i < c.options().size(); i++) {
            Option o = c.options().get(i);
            JsonObject row = rows.get(i).getAsJsonObject();
            row.addProperty("optional", o.type());
            if (!o.mana().isEmpty()) row.addProperty("cost", o.mana());
            if (!o.extra().isEmpty()) { JsonArray extra = new JsonArray(); o.extra().forEach(extra::add); row.add("extra", extra); }
        }
    }
}
