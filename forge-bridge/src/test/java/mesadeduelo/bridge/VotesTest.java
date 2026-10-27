package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import forge.game.Game;
import forge.game.GameStage;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import forge.gui.interfaces.IGuiGame;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import org.junit.BeforeClass;
import org.junit.Test;

/** Votação do conselho: o pedido de voto é reconhecido, a carta que vota é achada e os anúncios viram contagem. */
public class VotesTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    @Test(timeout = 30000) public void expropriateVoteIsRecognizedAndAnnouncementsBecomeTheTally() throws Exception {
        Game game = CommanderEngineTest.game(2);
        game.setAge(GameStage.Play);
        Player me = game.getPlayers().get(0), ai = game.getPlayers().get(1);
        PlayerControllerHuman human = new PlayerControllerHuman(game, me, new LobbyPlayerHuman("Eu"));
        List<String> titles = new ArrayList<>(), messages = new ArrayList<>();
        List<SpellAbility> during = new ArrayList<>();
        human.setGui((IGuiGame) Proxy.newProxyInstance(IGuiGame.class.getClassLoader(), new Class<?>[]{IGuiGame.class}, (proxy, method, args) -> {
            if (method.getName().equals("getChoices")) {
                titles.add(String.valueOf(args[0])); during.add(Votes.current(game));
                return List.of(((Collection<?>) args[3]).iterator().next());
            }
            if (method.getName().equals("message")) messages.add(String.valueOf(args[0]));
            return method.getReturnType() == boolean.class ? false : method.getReturnType() == int.class ? 0 : null;
        }));
        me.dangerouslySetController(human);
        Card expropriate = ExilePermissionsTest.add(game, "Expropriate", ai, ZoneType.Hand);
        SpellAbility sa = expropriate.getFirstSpellAbility();
        sa.setActivatingPlayer(ai);
        Thread gameThread = new Thread(() -> { game.getStack().add(sa); game.getStack().resolveStack(); });
        gameThread.start(); gameThread.join();

        assertFalse("o humano votou", titles.isEmpty());
        assertTrue(titles.get(0), Votes.isVotePrompt(titles.get(0)));
        assertNotNull("a votação está resolvendo durante o voto", during.get(0));
        assertSame(expropriate, during.get(0).getHostCard());

        // A IA vota primeiro (é quem conjurou) e o humano recebe o anúncio.
        List<String> names = List.of(me.getName(), ai.getName());
        String announcement = messages.stream().filter(m -> Votes.parse(m, names) != null).findFirst().orElseThrow();
        List<String[]> votes = Votes.parse(announcement, names);
        assertEquals(1, votes.size());
        assertEquals(ai.getName(), votes.get(0)[0]);
        assertTrue(votes.get(0)[1], List.of("Time", "Money").contains(votes.get(0)[1]));
        assertEquals(ai.getName() + " votou em " + votes.get(0)[1] + ".", Votes.notice(announcement, names));
    }

    @Test public void tallyReadsNamesWithCommasAndCardIds() {
        String marker = forge.util.Localizer.getInstance().getMessage("lblCurrentVote");
        List<String[]> votes = Votes.parse("x\r\n" + marker + ":{Time=[Ana, B, Ana], Grizzly Bears (12)=[Carlos]}", List.of("Ana, B", "Ana", "Carlos"));
        assertEquals(3, votes.size());
        assertArrayEquals(new String[] { "Ana, B", "Time" }, votes.get(0));
        assertArrayEquals(new String[] { "Ana", "Time" }, votes.get(1));
        assertArrayEquals(new String[] { "Carlos", "Grizzly Bears" }, votes.get(2));
        assertNull(Votes.parse("Ana escolheu Time", List.of("Ana")));
    }
}
