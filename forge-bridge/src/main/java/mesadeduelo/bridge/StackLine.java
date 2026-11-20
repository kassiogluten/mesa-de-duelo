package mesadeduelo.bridge;

import java.util.Locale;
import java.util.regex.Pattern;

import forge.game.Game;
import forge.game.card.Card;
import forge.game.spellability.SpellAbility;
import forge.game.spellability.SpellAbilityStackInstance;

/**
 * Habilidade ativada na pilha: qual linha do texto da carta ela é (0 é a primeira), para a mesa mostrar essa linha
 * impressa, em português, em vez da descrição que o Forge gera (em inglês, e às vezes torta, como
 * "Remove 1 Time counter fromGreater Gargadon"). Fica de fora a habilidade com X, cujo valor só a descrição do Forge tem.
 */
final class StackLine {
    private StackLine() { }

    private static final Pattern X = Pattern.compile("\\bX\\b");

    /** A linha da habilidade no texto da carta; null para mágica, gatilho, lealdade, mana ou quando não acha uma só. */
    static Integer of(Game game, int stackId) {
        if (game == null) return null;
        try {
            for (SpellAbilityStackInstance item : game.getStack()) {
                if (item.getId() == stackId) return line(item.getSpellAbility());
            }
        } catch (RuntimeException concurrentRead) { /* o próximo estado traz */ }
        return null;
    }

    static Integer line(SpellAbility sa) {
        if (sa == null || !sa.isActivatedAbility() || sa.isPwAbility() || sa.isManaAbility() || sa.isTrigger()) return null;
        Card host = sa.getHostCard();
        String effect = sa.getParam("SpellDescription");
        if (host == null || effect == null || effect.isBlank()) return null;
        String oracle = host.getView().getCurrentState().getOracleText();
        if (oracle == null || oracle.isBlank()) return null;
        String want = normalize(effect.replace("CARDNAME", host.getName()).replace("NICKNAME", host.getName()));
        if (want.isEmpty()) return null;
        // Só as linhas com texto: o Oracle do Forge separa as habilidades com uma linha em branco.
        String[] lines = java.util.Arrays.stream(oracle.split("\\r?\\n")).filter(l -> !l.isBlank()).toArray(String[]::new);
        Integer found = null;
        for (int i = 0; i < lines.length; i++) {
            if (!normalize(lines[i]).contains(want)) continue;
            if (found != null) return null;
            found = i;
        }
        return found == null || X.matcher(lines[found]).find() ? null : found;
    }

    /** Só letras e números, em minúsculas: o texto do script e o Oracle diferem em pontuação e espaços. */
    private static String normalize(String text) {
        return text.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }
}
