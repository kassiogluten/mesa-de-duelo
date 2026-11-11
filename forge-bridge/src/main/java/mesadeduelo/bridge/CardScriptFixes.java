package mesadeduelo.bridge;

import java.util.List;

import forge.StaticData;
import forge.card.CardRules;
import forge.card.ICardFace;

/**
 * Correções de roteiro de cartas do Forge, aplicadas na memória quando o servidor sobe: o arquivo da carta no Forge
 * continua como está (a mesma correção vai como PR para o repositório oficial). Cada correção troca um trecho do
 * roteiro de uma habilidade; quando o Forge já vier corrigido, o trecho não aparece mais e nada muda.
 */
final class CardScriptFixes {
    private CardScriptFixes() { }

    record Fix(String card, String from, String to, String why) { }

    static final List<Fix> FIXES = List.of(
        new Fix("Fossil Find", "Hidden$ True | AtRandom$ True | Origin$ Graveyard |",
            "Hidden$ True | AtRandom$ True | ChangeType$ Card.YouOwn | Origin$ Graveyard |",
            "sem ChangeType, o sorteio pegava a carta de qualquer cemitério e ela ia para a mão do dono"));

    /** Aplica as correções nas regras carregadas; devolve quantas habilidades mudaram. */
    static int apply() {
        int changed = 0;
        for (Fix fix : FIXES) {
            CardRules rules = StaticData.instance().getCommonCards().getRules(fix.card(), false);
            if (rules == null) continue;
            for (ICardFace face : rules.getAllFaces()) {
                if (face == null || !(face.getAbilities() instanceof List<String> abilities)) continue;
                for (int i = 0; i < abilities.size(); i++) {
                    String ability = abilities.get(i);
                    if (!ability.contains(fix.from())) continue;
                    abilities.set(i, ability.replace(fix.from(), fix.to()));
                    Log.bridge().info("Roteiro corrigido: %s (%s)", fix.card(), fix.why());
                    changed++;
                }
            }
        }
        return changed;
    }
}
