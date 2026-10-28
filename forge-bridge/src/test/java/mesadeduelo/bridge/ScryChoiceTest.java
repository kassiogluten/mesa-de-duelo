package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.List;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.card.CardCollection;
import forge.game.card.CardView;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import forge.gui.interfaces.IGuiGame;
import forge.localinstance.properties.ForgePreferences.FPref;
import forge.model.FModel;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

public class ScryChoiceTest {
    private static String cardDisplays;

    @BeforeClass public static void engine() {
        BridgeRulesTest.engine();
        // Como na ponte (Main): escolhas fora do campo e da mão chegam como pergunta com as cartas.
        cardDisplays = FModel.getPreferences().getPref(FPref.UI_SELECT_FROM_CARD_DISPLAYS);
        FModel.getPreferences().setPref(FPref.UI_SELECT_FROM_CARD_DISPLAYS, "false");
    }

    @AfterClass public static void restore() { FModel.getPreferences().setPref(FPref.UI_SELECT_FROM_CARD_DISPLAYS, cardDisplays); }

    /** Uma pergunta que o Forge fez à tela: o título e as opções. */
    private record Asked(String method, String title, List<Object> options) { }

    /** Tela falsa: guarda cada escolha, não manda nada para o fundo e mantém a ordem do topo. */
    private static IGuiGame recorder(List<Asked> asked) {
        return (IGuiGame) Proxy.newProxyInstance(IGuiGame.class.getClassLoader(), new Class<?>[]{IGuiGame.class}, (proxy, m, a) -> {
            if (m.getName().equals("many") || m.getName().equals("order")) {
                List<Object> options = null;
                for (Object o : a) if (o instanceof List<?> l && !l.isEmpty()) { options = new ArrayList<>(l); break; }
                asked.add(new Asked(m.getName(), String.valueOf(a[0]), options));
                return m.getName().equals("many") ? new ArrayList<>() : new ArrayList<>(options);
            }
            Class<?> r = m.getReturnType();
            if (r.isPrimitive() && r != void.class) return java.lang.reflect.Array.get(java.lang.reflect.Array.newInstance(r, 1), 0);
            return r == Long.class ? 0L : r == Integer.class ? 0 : r == Boolean.class ? false : null;
        });
    }

    private static List<Asked> arrange(String effect, List<Card> expectedTop) {
        Game game = CommanderEngineTest.game(2); Player me = game.getPlayers().get(0);
        for (Card c : me.getCardsIn(ZoneType.Library)) me.getZone(ZoneType.Library).remove(c);
        for (String n : List.of("Lightning Bolt", "Counterspell", "Forest")) expectedTop.add(ExilePermissionsTest.add(game, n, me, ZoneType.Library));
        var human = new PlayerControllerHuman(game, me, new LobbyPlayerHuman("Test"));
        List<Asked> asked = new ArrayList<>();
        human.setGui(recorder(asked));
        CardCollection top = new CardCollection(me.getCardsIn(ZoneType.Library, 3));
        if (effect.equals("scry")) human.arrangeForScry(top); else human.arrangeForSurveil(top);
        return asked;
    }

    /** Vidência e vigilância chegam iguais: as cartas inteiras (não só os nomes), na ordem do topo, em dois passos. */
    @Test public void scryAndSurveilAskWithTheCardsInLibraryOrder() {
        for (String effect : List.of("scry", "surveil")) {
            List<Card> top = new ArrayList<>();
            List<Asked> asked = arrange(effect, top);
            assertEquals(effect, List.of("many", "order"), asked.stream().map(Asked::method).toList());
            for (Asked step : asked) {
                assertEquals(effect, 3, step.options().size());
                for (int i = 0; i < 3; i++) {
                    CardView v = (CardView) step.options().get(i);
                    assertEquals(effect + " keeps the library order", top.get(i).getId(), v.getId());
                    JsonObject card = StateJson.card(v);
                    assertEquals(top.get(i).getName(), card.get("name").getAsString());
                    assertTrue(card.has("typeLine"));
                    assertFalse(card.has("faceDown"));
                }
            }
            String first = effect.equals("scry") ? "bottom" : "graveyard";
            assertEquals(first, LibraryChoice.step(asked.get(0).title()));
            assertEquals("top", LibraryChoice.step(asked.get(1).title()));
            JsonObject q = new JsonObject();
            LibraryChoice.describe(q, asked.get(0).title(), asked.get(0).options());
            assertEquals("library", q.get("purpose").getAsString());
            assertEquals(first, q.get("library").getAsString());
        }
    }

    /** Outras escolhas (e cartas fora do grimório com o mesmo título) ficam como estão. */
    @Test public void otherChoicesAreLeftAlone() {
        assertNull(LibraryChoice.step("Escolha uma carta"));
        assertNull(LibraryChoice.step(null));
        List<Card> top = new ArrayList<>();
        List<Asked> asked = arrange("scry", top);
        top.get(0).getGame().getAction().moveTo(ZoneType.Graveyard, top.get(0), null, null);
        assertEquals(ZoneType.Graveyard, ((CardView) asked.get(0).options().get(0)).getZone());
        JsonObject q = new JsonObject();
        LibraryChoice.describe(q, asked.get(0).title(), asked.get(0).options());
        assertFalse(q.has("purpose"));
    }
}
