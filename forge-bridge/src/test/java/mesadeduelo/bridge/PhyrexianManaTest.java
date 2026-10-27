package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.lang.reflect.Proxy;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.function.Consumer;
import forge.game.Game;
import forge.game.GameStage;
import forge.game.card.Card;
import forge.game.player.PlaySpellAbility;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.InputConfirm;
import forge.gamemodes.match.input.InputPayMana;
import forge.gamemodes.match.input.InputSelectTargets;
import forge.gui.FThreads;
import forge.gui.interfaces.IGuiGame;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import org.junit.BeforeClass;
import org.junit.Test;

/** Mana phyrexiana ({U/P}): sem a cor, o jogador paga 2 de vida por símbolo. */
public class PhyrexianManaTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private Game game; private Player player; private PlayerControllerHuman human;

    private void setup() {
        game = CommanderEngineTest.game(2);
        game.setAge(GameStage.Play);
        player = game.getPlayers().get(0);
        human = new PlayerControllerHuman(game, player, new LobbyPlayerHuman("Phyrexian"));
        human.setGui((IGuiGame) Proxy.newProxyInstance(IGuiGame.class.getClassLoader(), new Class<?>[]{IGuiGame.class}, (proxy, method, args) -> {
            if (method.getName().equals("awaitInput")) { ((CountDownLatch) args[0]).await(); return null; }
            if (args != null && args.length > 1 && args[1] instanceof List<?> l && !l.isEmpty() && method.getReturnType().isInstance(l.get(0))) return l.get(0);
            return method.getReturnType() == boolean.class ? false : method.getReturnType() == int.class ? 0 : null;
        }));
        player.dangerouslySetController(human);
    }

    /** Lança numa "thread do jogo", aceitando confirmações, mirando o oponente e passando cada pagamento a `onPay`. */
    private boolean play(SpellAbility sa, Consumer<InputPayMana> onPay) throws Exception {
        sa.setActivatingPlayer(player);
        boolean[] ok = new boolean[1];
        Thread gameThread = new Thread(() -> ok[0] = PlaySpellAbility.playSpellAbility(human, player, sa));
        gameThread.start();
        Object handled = null;
        while (gameThread.isAlive()) {
            Object input = human.getInputQueue().getInput();
            if (input != null && input != handled) {
                handled = input;
                if (input instanceof InputConfirm) FThreads.invokeInEdtAndWait(human::selectButtonOk);
                else if (input instanceof InputSelectTargets) FThreads.invokeInEdtAndWait(() -> human.selectPlayer(player.getOpponents().get(0).getView(), null));
                else if (input instanceof InputPayMana pay) FThreads.invokeInEdtAndWait(() -> onPay.accept(pay));
            }
            Thread.sleep(20);
        }
        return ok[0];
    }

    @Test(timeout = 20000) public void clickingYourselfWhilePayingPaysTwoLife() throws Exception {
        setup();
        Card probe = ExilePermissionsTest.add(game, "Gitaxian Probe", player, ZoneType.Hand);
        assertTrue(play(probe.getFirstSpellAbility(), pay -> human.selectPlayer(player.getView(), null)));
        assertEquals(38, player.getLife());
        assertTrue(probe.isInZone(ZoneType.Stack));
    }

    /** O Automático do Forge só paga com mana: sem azul, a vida fica e o {U/P} continua pedido. */
    @Test(timeout = 20000) public void autoPaymentDoesNotPayWithLife() throws Exception {
        setup();
        Card probe = ExilePermissionsTest.add(game, "Gitaxian Probe", player, ZoneType.Hand);
        String[] left = new String[1];
        assertFalse(play(probe.getFirstSpellAbility(), pay -> {
            human.selectButtonOk();
            left[0] = String.valueOf(human.getInputQueue().getInput());
            human.selectButtonCancel();
        }));
        assertTrue(left[0], left[0].contains("{U/P}"));
        assertEquals(40, player.getLife());
    }

    @Test(timeout = 20000) public void blueManaStillPaysWithoutLosingLife() throws Exception {
        setup();
        Card island = ExilePermissionsTest.add(game, "Island", player, ZoneType.Battlefield);
        Card probe = ExilePermissionsTest.add(game, "Gitaxian Probe", player, ZoneType.Hand);
        assertTrue(play(probe.getFirstSpellAbility(), pay -> human.selectCard(island.getView(), null, null)));
        assertTrue(island.isTapped());
        assertEquals(40, player.getLife());
    }

    @Test(timeout = 20000) public void twoSymbolsCostFourLife() throws Exception {
        setup();
        List<Card> swamps = List.of(
            ExilePermissionsTest.add(game, "Swamp", player, ZoneType.Battlefield), ExilePermissionsTest.add(game, "Swamp", player, ZoneType.Battlefield),
            ExilePermissionsTest.add(game, "Swamp", player, ZoneType.Battlefield), ExilePermissionsTest.add(game, "Swamp", player, ZoneType.Battlefield));
        Card tanadon = ExilePermissionsTest.add(game, "Thundering Tanadon", player, ZoneType.Hand);
        // A vida paga os dois {G/P}; o Automático vira os pântanos para o {4}.
        // A ponte anuncia o retrato clicável enquanto houver símbolo e vida, com a vida já separada.
        List<String> offers = new java.util.ArrayList<>();
        assertTrue(play(tanadon.getFirstSpellAbility(), pay -> {
            offers.add(String.valueOf(InputContext.phyrexianLife(pay)));
            human.selectPlayer(player.getView(), null);
            offers.add(String.valueOf(InputContext.phyrexianLife(pay)));
            human.selectPlayer(player.getView(), null);
            offers.add(String.valueOf(InputContext.phyrexianLife(pay)));
            human.selectButtonOk();
        }));
        String me = "{\"player\":" + player.getId();
        assertEquals(List.of(me + ",\"pending\":0}", me + ",\"pending\":2}", "null"), offers);
        assertEquals(36, player.getLife());
        assertTrue(swamps.stream().allMatch(Card::isTapped));
    }

    @Test(timeout = 20000) public void withoutEnoughLifeTheOfferDisappears() throws Exception {
        setup();
        player.setLife(1, null);
        Card probe = ExilePermissionsTest.add(game, "Gitaxian Probe", player, ZoneType.Hand);
        String[] offer = new String[1];
        assertFalse(play(probe.getFirstSpellAbility(), pay -> {
            offer[0] = String.valueOf(InputContext.phyrexianLife(pay));
            human.selectPlayer(player.getView(), null);
            human.selectButtonCancel();
        }));
        assertEquals("null", offer[0]);
        assertEquals(1, player.getLife());
    }
}
