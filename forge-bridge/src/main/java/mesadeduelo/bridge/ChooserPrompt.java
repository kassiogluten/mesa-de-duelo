package mesadeduelo.bridge;

import java.util.List;
import java.util.Map;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.ability.AbilityUtils;
import forge.game.ability.ApiType;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.trigger.WrappedAbility;

/**
 * Oponente que escolhe entre as cartas de outro jogador (Gifts Ungiven, Intuition): o Forge pergunta com o texto do
 * roteiro da carta, em inglês e sem dizer de quem são as cartas ("Select two cards for the graveyard"). A ponte troca
 * por um título que diz quantas escolher, para onde vão, de quem são e o que acontece com as outras.
 */
final class ChooserPrompt {
    private ChooserPrompt() { }

    private static final Map<String, String> ZONES = Map.of("hand", "a mão", "graveyard", "o cemitério", "exile", "o exílio",
        "library", "o grimório", "battlefield", "o campo de batalha");

    /** Troca o título quando a pergunta é a escolha de um "Chooser" numa mudança de zona que está resolvendo. */
    static void describe(JsonObject q, String title, Game game) {
        SpellAbility choice = find(title, game);
        if (choice == null) return;
        try {
            String to = ZONES.get(choice.getParam("Destination").toLowerCase());
            if (to == null) return;
            List<Player> owners = AbilityUtils.getDefinedPlayers(choice.getHostCard(), choice.getParamOrDefault("DefinedPlayer", "You"), choice);
            Player owner = owners.isEmpty() ? choice.getActivatingPlayer() : owners.get(0);
            int n = AbilityUtils.calculateAmount(choice.getHostCard(), choice.getParamOrDefault("ChangeNum", "1"), choice);
            StringBuilder text = new StringBuilder("Escolha ").append(n).append(n == 1 ? " carta para " : " cartas para ").append(to);
            if (owner != null) text.append(" de ").append(owner.getName());
            text.append('.');
            SpellAbility rest = choice.getSubAbility();
            if (rest != null && rest.getApi() == ApiType.ChangeZoneAll && rest.hasParam("Destination")) {
                String others = ZONES.get(rest.getParam("Destination").toLowerCase());
                if (others != null) text.append(" As outras vão para ").append(others).append('.');
            }
            q.addProperty("title", text.toString());
        } catch (RuntimeException e) { /* Fica o título do Forge. */ }
    }

    private static SpellAbility find(String title, Game game) {
        try {
            if (title == null || game == null || !game.getStack().isResolving()) return null;
            SpellAbility sa = game.getStack().peekAbility();
            if (sa instanceof WrappedAbility wrapped) sa = wrapped.getWrappedAbility();
            for (; sa != null; sa = sa.getSubAbility())
                if (sa.getApi() == ApiType.ChangeZone && sa.hasParam("Chooser") && title.equals(sa.getParam("SelectPrompt"))) return sa;
        } catch (RuntimeException e) { /* Pilha mudando em outra thread. */ }
        return null;
    }
}
