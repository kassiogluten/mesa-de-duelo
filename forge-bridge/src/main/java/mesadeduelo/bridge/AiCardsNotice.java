// Um aviso só, discreto, com as cartas que o computador não joga, no lugar da janela de revelar por oponente.
package mesadeduelo.bridge;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.deck.DeckSection;
import forge.game.player.Player;
import forge.item.PaperCard;

/**
 * No começo da partida contra o computador, o Forge abre uma janela de revelar para cada oponente com cartas que a IA
 * não joga (nunca as conjura nem ativa). A mesa junta tudo num aviso de canto: quantas cartas e de quem, com a lista por oponente para quem
 * quiser ver. O reserva fica de fora (não entra em jogo na partida).
 */
final class AiCardsNotice {
    /** Título que o {@link AskingController} manda no {@code message} do Forge para o {@link Seat} reconhecer o aviso. */
    static final String TITLE = "mesa:ai-cards";

    private AiCardsNotice() { }

    /** O aviso pronto para a mesa, ou {@code null} quando nenhum oponente tem carta a citar. */
    static String toast(Map<Player, Map<DeckSection, List<? extends PaperCard>>> unplayable) {
        Map<String, Set<String>> byPlayer = new LinkedHashMap<>();
        unplayable.forEach((player, sections) -> sections.forEach((section, cards) -> {
            if (section != DeckSection.Sideboard) for (PaperCard card : cards) byPlayer.computeIfAbsent(player.getName(), k -> new LinkedHashSet<>()).add(card.getName());
        }));
        return toastByName(byPlayer);
    }

    /** O aviso a partir dos nomes: oponente → cartas (em inglês, a mesa traduz). */
    static String toastByName(Map<String, ? extends Collection<String>> byPlayer) {
        JsonArray groups = new JsonArray();
        int total = 0;
        String only = null;
        for (var e : byPlayer.entrySet()) {
            if (e.getValue().isEmpty()) continue;
            JsonObject group = new JsonObject();
            group.addProperty("player", e.getKey());
            JsonArray list = new JsonArray();
            e.getValue().forEach(list::add);
            group.add("cards", list);
            groups.add(group);
            total += e.getValue().size();
            only = e.getKey();
        }
        if (total == 0) return null;
        JsonObject o = new JsonObject();
        o.addProperty("type", "toast");
        // A IA do Forge nunca joga essas cartas (tira da lista do que pode fazer): elas ficam paradas na mão dela.
        o.addProperty("title", "O computador não joga algumas cartas");
        o.addProperty("text", groups.size() == 1
            ? (total == 1 ? "1 carta do deck de " + only + " fica parada na mão dele." : total + " cartas do deck de " + only + " ficam paradas na mão dele.")
            : total + " cartas dos decks dos oponentes ficam paradas na mão deles.");
        o.add("groups", groups);
        return o.toString();
    }
}
