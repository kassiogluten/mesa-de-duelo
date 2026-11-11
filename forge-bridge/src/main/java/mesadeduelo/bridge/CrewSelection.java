package mesadeduelo.bridge;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import forge.game.card.Card;
import forge.game.card.CardLists;
import forge.game.cost.CostTapType;
import forge.game.keyword.Keyword;
import forge.game.spellability.SpellAbility;
import forge.gamemodes.match.input.InputSelectEntitiesFromList;
import forge.gamemodes.match.input.InputSelectManyBase;

/**
 * Tripular e Selar (Crew, Saddle): o Forge deixa o OK ligado com qualquer poder escolhido e, abaixo do necessário,
 * o OK só desiste em silêncio; aqui ele fica desligado até o poder somado alcançar o custo (o Cancelar continua para
 * desistir), e a contagem "Crewing: 2 / 8" do pedido vira "Tripulando: 2 / 8", na primeira linha.
 */
final class CrewSelection {
    private CrewSelection() { }

    private static final ForgeReflection.FieldRef ABILITY = ForgeReflection.field(InputSelectManyBase.class, "sa");
    private static final Pattern NEEDED = Pattern.compile("withTotalPowerGE(\\d+)");

    private static final Pattern COUNT = Pattern.compile("\n(Crewing|Saddling): (\\d+ / \\d+)\\s*$");

    /**
     * "Shorikai…\n - Tripular 8 (lembrete longo…)\nEscolha…\nCrewing: 2 / 8" → "Tripulando: 2 / 8\nShorikai…": a contagem
     * vai para a primeira linha, que a caixa de ação mostra mesmo quando o lembrete fica escondido em "Ver detalhes".
     */
    static String prompt(String message) {
        Matcher m = message == null ? null : COUNT.matcher(message);
        if (m == null || !m.find()) return message;
        String verb = "Crewing".equals(m.group(1)) ? "Tripulando" : "Selando";
        return verb + ": " + m.group(2) + "\n" + message.substring(0, m.start());
    }

    /** O pedido aberto é um Tripular (ou Selar) com menos poder escolhido do que o custo pede. */
    static boolean shortOfPower(Object input) {
        if (!(input instanceof InputSelectEntitiesFromList<?> list) || !ABILITY.present()) return false;
        SpellAbility sa = (SpellAbility) ABILITY.get(list);
        if (sa == null || !(sa.isCrew() || sa.isKeyword(Keyword.SADDLE)) || sa.getPayCosts() == null
            || !sa.getPayCosts().hasSpecificCostType(CostTapType.class)) return false;
        Matcher m = NEEDED.matcher(sa.getPayCosts().getCostPartByType(CostTapType.class).getType());
        if (!m.find()) return false;
        int power = 0;
        for (Object o : list.getSelected()) if (o instanceof Card c) power += CardLists.getTotalPower(java.util.List.of(c), sa);
        return power < Integer.parseInt(m.group(1));
    }
}
