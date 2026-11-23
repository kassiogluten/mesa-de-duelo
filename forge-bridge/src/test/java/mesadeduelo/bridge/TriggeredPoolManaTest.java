package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.lang.reflect.Proxy;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.function.Consumer;
import forge.card.MagicColor;
import forge.game.Game;
import forge.game.GameStage;
import forge.game.card.Card;
import forge.game.player.PlaySpellAbility;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.InputConfirm;
import forge.gamemodes.match.input.InputPayMana;
import forge.gui.FThreads;
import forge.gui.interfaces.IGuiGame;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import org.junit.BeforeClass;
import org.junit.Test;

/**
 * Mana que um gatilho põe na reserva no meio do pagamento (Fertile Ground no terreno virado): o Automático volta a
 * valer quando a reserva fecha o custo, e tocar na mana da reserva paga com ela.
 */
public class TriggeredPoolManaTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private Game game; private Player player; private PlayerControllerHuman human;
    private Card mountain, forest, animar;

    private void setup() {
        game = CommanderEngineTest.game(2);
        game.setAge(GameStage.Play);
        player = game.getPlayers().get(0);
        human = new PlayerControllerHuman(game, player, new LobbyPlayerHuman("Pool"));
        // Nas escolhas de uma lista, a cor azul quando ela está lá (a mana a mais do Fertile Ground); senão, a primeira.
        human.setGui((IGuiGame) Proxy.newProxyInstance(IGuiGame.class.getClassLoader(), new Class<?>[]{IGuiGame.class}, (proxy, method, args) -> {
            if (method.getName().equals("awaitInput")) { ((CountDownLatch) args[0]).await(); return null; }
            if (args != null && args.length > 1 && args[1] instanceof List<?> l && !l.isEmpty() && method.getReturnType().isInstance(l.get(0))) {
                for (Object o : l) if (String.valueOf(o).equalsIgnoreCase("blue")) return o;
                return l.get(0);
            }
            return method.getReturnType() == boolean.class ? false : method.getReturnType() == int.class ? 0 : null;
        }));
        player.dangerouslySetController(human);
        mountain = ExilePermissionsTest.add(game, "Mountain", player, ZoneType.Battlefield);
        forest = ExilePermissionsTest.add(game, "Forest", player, ZoneType.Battlefield);
        Card fertile = ExilePermissionsTest.add(game, "Fertile Ground", player, ZoneType.Battlefield);
        fertile.attachToEntity(mountain, null);
        animar = ExilePermissionsTest.add(game, "Animar, Soul of Elements", player, ZoneType.Hand);
        game.getTriggerHandler().resetActiveTriggers();
    }

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
                else if (input instanceof InputPayMana pay) onPay.accept(pay);
            }
            Thread.sleep(20);
        }
        return ok[0];
    }

    private static String cost(Object input) { return String.valueOf(InputContext.manaCost(input)); }

    /** Vira uma fonte e espera o motor descontar o custo e o gatilho pôr a mana a mais na reserva. */
    private void tap(InputPayMana pay, Card card, int poolAfter) {
        FThreads.invokeInEdtAndWait(() -> human.selectCard(card.getView(), null, null));
        long until = System.currentTimeMillis() + 5000;
        while ((!card.isTapped() || player.getManaPool().totalMana() < poolAfter || pay.isActivatingManaAbility())
            && human.getInputQueue().getInput() == pay && System.currentTimeMillis() < until) {
            try { Thread.sleep(20); } catch (InterruptedException e) { throw new IllegalStateException(e); }
        }
    }

    /** As duas terras viradas: falta {U}, e o {U} do Fertile Ground está na reserva. */
    private void tapBoth(InputPayMana pay) {
        assertFalse("sem fonte de azul, o Automático começa desligado", AutoPay.payableWithPool(pay));
        tap(pay, mountain, 1);
        tap(pay, forest, 1);
        assertTrue(cost(pay), cost(pay).startsWith("{\"remaining\":\"{U}\""));
        assertEquals(1, player.getManaPool().getAmountOfColor(MagicColor.BLUE));
    }

    @Test(timeout = 30000) public void autoPayComesBackWhenThePoolPays() throws Exception {
        setup();
        assertTrue(play(animar.getFirstSpellAbility(), pay -> {
            tapBoth(pay);
            assertNull("o teste guardado pelo Forge continua sem saída", ForgeReflection.field(InputPayMana.class, "autoPayManaSources").get(pay));
            assertTrue("a reserva paga o que falta: o Automático volta", AutoPay.payableWithPool(pay));
            FThreads.invokeInEdtAndWait(() -> AutoPay.ok(human));
        }));
        assertTrue(animar.isInZone(ZoneType.Stack));
        assertEquals(0, player.getManaPool().totalMana());
    }

    @Test(timeout = 30000) public void touchingThePoolPaysWithIt() throws Exception {
        setup();
        assertTrue(play(animar.getFirstSpellAbility(), pay -> {
            tapBoth(pay);
            FThreads.invokeInEdtAndWait(() -> human.useMana(MagicColor.BLUE));
        }));
        assertTrue(animar.isInZone(ZoneType.Stack));
        assertEquals(0, player.getManaPool().totalMana());
    }
}
