package mesadeduelo.bridge;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.ability.AbilityUtils;
import forge.game.ability.ApiType;
import forge.game.card.CardView;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.trigger.WrappedAbility;
import forge.util.Localizer;

/**
 * Dois montes (Fact or Fiction, Steam Augury, Epiphany at the Drownyard, Sphinx of Uthuun e afins). O Forge pergunta
 * em dois passos: quem separa marca as cartas do monte 1 ("Divida as cartas em duas pilhas"), e quem escolhe recebe
 * uma lista com dois itens falsos ("-- Pile 1 (2 cards) --") misturados às cartas de cada monte. A ponte marca as
 * duas perguntas e diz o que acontece com cada monte, e, na escolha, quais opções são os montes e quais cartas estão
 * em cada um, para a mesa mostrar os montes lado a lado em vez da lista.
 */
final class Piles {
    private Piles() { }

    /** Os itens que o Forge cria para os montes (CardView com id Integer.MIN_VALUE e MIN_VALUE + 1). */
    private static final int PILE_1 = Integer.MIN_VALUE;
    private static final Pattern SIZE = Pattern.compile("\\((\\d+) ");

    /** O "dois montes" que está resolvendo, ou null. */
    static SpellAbility current(Game game) {
        try {
            if (game == null || !game.getStack().isResolving()) return null;
            SpellAbility sa = game.getStack().peekAbility();
            if (sa instanceof WrappedAbility wrapped) sa = wrapped.getWrappedAbility();
            for (; sa != null; sa = sa.getSubAbility()) if (sa.getApi() == ApiType.TwoPiles) return sa;
        } catch (RuntimeException e) { /* Pilha mudando em outra thread: sem montes. */ }
        return null;
    }

    /** Separar as cartas: a pergunta (de 0 a todas) vira purpose "piles-split". */
    static void split(JsonObject q, String title, List<Object> options, Game game) {
        if (options.isEmpty() || !Localizer.getInstance().getMessage("lblDivideCardIntoTwoPiles").equals(title)) return;
        for (Object o : options) if (!(o instanceof CardView)) return;
        SpellAbility sa = current(game);
        if (sa == null) return;
        q.addProperty("purpose", "piles-split");
        describe(q, sa);
    }

    /** Escolher um monte: purpose "piles-choose" e, em piles, a opção de cada monte, o tamanho e as cartas (índices). */
    static void choose(JsonObject q, List<Object> options, Game game) {
        int first = -1, second = -1;
        for (int i = 0; i < options.size(); i++) {
            if (!(options.get(i) instanceof CardView cv)) continue;
            if (cv.getId() == PILE_1) first = i;
            else if (cv.getId() == PILE_1 + 1) second = i;
        }
        if (first < 0 || second < 0) return;
        JsonArray piles = new JsonArray();
        piles.add(pile(options, first, first < second ? second : options.size()));
        piles.add(pile(options, second, second < first ? first : options.size()));
        q.addProperty("purpose", "piles-choose");
        q.add("piles", piles);
        SpellAbility sa = current(game);
        if (sa != null) describe(q, sa);
    }

    private static JsonObject pile(List<Object> options, int marker, int end) {
        JsonObject pile = new JsonObject();
        pile.addProperty("option", marker);
        JsonArray cards = new JsonArray();
        for (int i = marker + 1; i < end; i++) cards.add(i);
        // Monte virado para baixo: as cartas não vêm na lista, só o tamanho no rótulo.
        Matcher m = SIZE.matcher(String.valueOf(((CardView) options.get(marker)).getName()));
        pile.addProperty("size", m.find() ? Integer.parseInt(m.group(1)) : cards.size());
        pile.add("cards", cards);
        return pile;
    }

    /** De quem são as cartas, se o dono escolhe o monte e para onde vai cada um (quando o efeito só move as cartas). */
    private static void describe(JsonObject q, SpellAbility sa) {
        try {
            List<Player> owners = AbilityUtils.getDefinedPlayers(sa.getHostCard(), sa.getParamOrDefault("Defined", "You"), sa);
            Player owner = owners.isEmpty() ? sa.getActivatingPlayer() : owners.get(0);
            if (owner != null) q.addProperty("pileOwner", owner.getId());
            q.addProperty("ownerChooses", !sa.hasParam("Chooser"));
            String chosen = destination(sa.getAdditionalAbility("ChosenPile")), other = destination(sa.getAdditionalAbility("UnchosenPile"));
            if (chosen != null && other != null) { q.addProperty("chosenTo", chosen); q.addProperty("otherTo", other); }
        } catch (RuntimeException e) { /* Sem os detalhes, a mesa explica de um jeito mais geral. */ }
    }

    private static String destination(SpellAbility sub) {
        if (sub == null || sub.getApi() != ApiType.ChangeZone || !sub.hasParam("Destination")) return null;
        return sub.getParam("Destination").toLowerCase();
    }
}
