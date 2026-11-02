package mesadeduelo.bridge;

import java.util.List;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.ability.ApiType;
import forge.game.spellability.AbilitySub;
import forge.game.spellability.SpellAbility;
import forge.game.spellability.SpellAbilityStackInstance;
import forge.game.trigger.WrappedAbility;

/**
 * Os modos escolhidos de uma mágica ou habilidade modal na pilha ("Escolha um —", como o Prismari Charm), para todos
 * saberem qual foi. O Forge encadeia uma cópia de cada modo escolhido depois da habilidade principal; cada cópia é
 * reconhecida pelo texto do modo entre as escolhas da carta, e vai com o número dele na carta (1 é o primeiro).
 */
final class StackModes {
    private StackModes() { }

    /** [{index, text}] na ordem de resolução; null quando o item não é modal ou a pilha muda durante a leitura. */
    static JsonArray of(Game game, int stackId) {
        if (game == null) return null;
        try {
            for (SpellAbilityStackInstance item : game.getStack()) {
                if (item.getId() == stackId) return describe(item.getSpellAbility());
            }
        } catch (RuntimeException concurrentRead) { /* o próximo estado traz */ }
        return null;
    }

    static JsonArray describe(SpellAbility sa) {
        if (sa == null) return null;
        SpellAbility base = sa instanceof WrappedAbility wrapped ? wrapped.getWrappedAbility() : sa;
        SpellAbility root = base.getRootAbility();
        if (root.getApi() != ApiType.Charm) return null;
        List<AbilitySub> choices = root.getAdditionalAbilityList("Choices");
        String host = root.getHostCard() == null ? "" : root.getHostCard().getDisplayName();
        JsonArray modes = new JsonArray();
        for (AbilitySub step = root.getSubAbility(); step != null; step = step.getSubAbility()) {
            String text = step.getParam("SpellDescription");
            if (text == null) continue;
            int index = 0;
            for (int i = 0; i < choices.size(); i++) if (text.equals(choices.get(i).getParam("SpellDescription"))) { index = i + 1; break; }
            if (index == 0) continue;
            JsonObject mode = new JsonObject();
            mode.addProperty("index", index);
            mode.addProperty("text", text.replace("CARDNAME", host).trim());
            modes.add(mode);
        }
        return modes.isEmpty() ? null : modes;
    }
}
