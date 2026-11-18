package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.List;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.GameStage;
import forge.game.card.Card;
import forge.game.card.CardCollection;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import forge.gui.interfaces.IGuiGame;
import org.junit.BeforeClass;
import org.junit.Test;

/** O que outro jogador revela vira um aviso que não segura o jogo; o que é do próprio jogador continua na janela. */
public class RevealNoticeTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    /** Uma tela que só anota as chamadas (a janela de revelar do Forge é a chamada "reveal"). */
    private static IGuiGame gui(List<String> calls) {
        return (IGuiGame) Proxy.newProxyInstance(IGuiGame.class.getClassLoader(), new Class<?>[]{IGuiGame.class}, (proxy, m, a) -> {
            if (m.isDefault()) return InvocationHandler.invokeDefault(proxy, m, a);
            calls.add(m.getName());
            Class<?> r = m.getReturnType();
            if (r.isPrimitive() && r != void.class) return java.lang.reflect.Array.get(java.lang.reflect.Array.newInstance(r, 1), 0);
            return r == Long.class ? 0L : r == Integer.class ? 0 : r == Boolean.class ? false : null;
        });
    }

    private static AskingController human(Game game, Player p, List<String> calls) {
        var human = new AskingController(game, p, new AskingController.Lobby(p.getName()));
        human.setGui(gui(calls));
        p.dangerouslySetController(human);
        return human;
    }

    @Test public void anotherPlayersRevealIsANoticeThatDoesNotHoldTheGame() {
        Game game = ExilePermissionsTest.game(); game.setAge(GameStage.Play);
        Player me = game.getPlayers().get(0), opp = game.getPlayers().get(1);
        List<String> calls = new ArrayList<>();
        AskingController mine = human(game, me, calls);
        Card bolt = ExilePermissionsTest.add(game, "Lightning Bolt", opp, ZoneType.Library);

        mine.reveal(new CardCollection(bolt), ZoneType.Library, opp, "", true);

        assertFalse("the Forge window (which waits for OK) must not open", calls.contains("reveal"));
        assertEquals(1, mine.revealNotices().size());
        JsonObject notice = LibraryReveal.json(mine.revealNotices().get(0), game);
        assertEquals(opp.getName(), notice.get("owner").getAsString());
        assertEquals("Library", notice.get("zone").getAsString());
        assertFalse(notice.get("waiting").getAsBoolean());
        assertEquals("Lightning Bolt", notice.getAsJsonArray("cards").get(0).getAsJsonObject().get("name").getAsString());

        // A mesa guardou o aviso: ele sai do estado.
        mine.libraryViewSeen(notice.get("seq").getAsInt());
        assertTrue(mine.revealNotices().isEmpty());
    }

    @Test public void yourOwnRevealStillOpensTheWindow() {
        Game game = ExilePermissionsTest.game(); game.setAge(GameStage.Play);
        Player me = game.getPlayers().get(0);
        List<String> calls = new ArrayList<>();
        AskingController mine = human(game, me, calls);
        Card bolt = ExilePermissionsTest.add(game, "Lightning Bolt", me, ZoneType.Library);

        mine.reveal(new CardCollection(bolt), ZoneType.Library, me, "", true);

        assertTrue("your own cards still open the window: " + calls, calls.contains("reveal"));
        assertTrue(mine.revealNotices().isEmpty());
    }

    @Test public void onlyTheLatestNoticesAreKept() {
        Game game = ExilePermissionsTest.game(); game.setAge(GameStage.Play);
        Player me = game.getPlayers().get(0), opp = game.getPlayers().get(1);
        AskingController mine = human(game, me, new ArrayList<>());
        Card bolt = ExilePermissionsTest.add(game, "Lightning Bolt", opp, ZoneType.Hand);
        for (int i = 0; i < 9; i++) mine.reveal(new CardCollection(bolt), ZoneType.Hand, opp, "", true);
        assertEquals(6, mine.revealNotices().size());
    }
}
