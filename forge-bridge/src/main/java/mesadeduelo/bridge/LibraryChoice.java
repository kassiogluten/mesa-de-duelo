package mesadeduelo.bridge;

import java.util.List;
import com.google.gson.JsonObject;
import forge.game.card.CardView;
import forge.game.zone.ZoneType;
import forge.util.Localizer;

/**
 * Vidência (scry) e vigilância (surveil) de várias cartas. O Forge pergunta em dois passos, com as cartas na
 * ordem do grimório (a primeira é a do topo): quais vão para o fundo (ou para o cemitério) e, se sobrar mais de
 * uma, em que ordem as outras ficam no topo. Os dois passos só se reconhecem pelo título, então a ponte compara
 * com as mesmas mensagens que o Forge usa e marca a pergunta, para a mesa mostrar as cartas na ordem do topo.
 */
final class LibraryChoice {
    private LibraryChoice() { }

    /** Passo da escolha pelo título que o Forge mandou, ou null quando não é vidência nem vigilância. */
    static String step(String title) {
        if (title == null) return null;
        Localizer l = Localizer.getInstance();
        if (title.equals(l.getMessage("lblSelectCardsToBeOutOnTheBottomOfYourLibrary"))) return "bottom";
        if (title.equals(l.getMessage("lblSelectCardsToBePutIntoTheGraveyard"))) return "graveyard";
        if (title.equals(l.getMessage("lblArrangeCardsToBePutOnTopOfYourLibrary"))) return "top";
        return null;
    }

    /** Marca a pergunta (purpose "library" e o passo) quando as opções são as cartas do topo do grimório. */
    static void describe(JsonObject q, String title, List<Object> options) {
        String step = step(title);
        if (step == null || options.isEmpty()) return;
        for (Object o : options) if (!(o instanceof CardView cv) || cv.getZone() != ZoneType.Library) return;
        q.addProperty("purpose", "library");
        q.addProperty("library", step);
    }
}
