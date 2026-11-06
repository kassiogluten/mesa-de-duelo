package mesadeduelo.bridge;

import static org.junit.Assert.*;
import com.google.gson.JsonObject;
import forge.StaticData;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

/**
 * A série escolhida no deck vale também fora do campo e da mão: na pilha e nas cartas que vão sem a partida (eventos,
 * perguntas, votações). Antes, a carta conjurada aparecia com a arte padrão na pilha.
 */
public class StackPrintingTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static Card m10Bolt(Player owner) {
        var paper = StaticData.instance().getCommonCards().getCard("Lightning Bolt", "M10");
        assertNotNull("Lightning Bolt da M10", paper);
        Card bolt = Card.fromPaperCard(paper, owner);
        owner.getZone(ZoneType.Hand).add(bolt); bolt.setZone(owner.getZone(ZoneType.Hand));
        return bolt;
    }

    @Test public void theCastSpellKeepsTheChosenPrintingOnTheStack() {
        Game game = TestGames.empty(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        var spell = m10Bolt(me).getFirstSpellAbility();
        spell.setActivatingPlayer(me); spell.getTargets().add(other); game.getStack().add(spell);
        // Os dois jogadores veem a arte que o dono escolheu.
        for (Player viewer : java.util.List.of(me, other)) {
            JsonObject print = TestGames.top(game, viewer).getAsJsonObject("source").getAsJsonObject("print");
            assertNotNull("print na pilha para " + viewer.getName(), print);
            assertEquals("m10", print.get("set").getAsString());
            assertEquals("146", print.get("cn").getAsString());
        }
    }

    @Test public void aCardSentWithoutTheGameStillFindsItsPrinting() {
        Game game = TestGames.empty(); Player me = game.getPlayers().get(0);
        Card bolt = m10Bolt(me);
        StateJson.game(game.getView(), me.getId(), game); // a partida já mandou estado
        JsonObject json = StateJson.card(bolt.getView());
        assertEquals("m10", json.getAsJsonObject("print").get("set").getAsString());
    }

    @Test public void aCardFromAnotherGameWithTheSameIdIsNotMistaken() {
        Game one = TestGames.empty(), two = TestGames.empty();
        Card bolt = m10Bolt(one.getPlayers().get(0));
        Card plain = TestGames.add(two, "Lightning Bolt", two.getPlayers().get(0), ZoneType.Hand);
        StateJson.game(one.getView(), one.getPlayers().get(0).getId(), one);
        StateJson.game(two.getView(), two.getPlayers().get(0).getId(), two);
        assertEquals("m10", StateJson.card(bolt.getView()).getAsJsonObject("print").get("set").getAsString());
        assertFalse("a carta padrão da outra partida não leva série", StateJson.card(plain.getView()).has("print"));
    }
}
