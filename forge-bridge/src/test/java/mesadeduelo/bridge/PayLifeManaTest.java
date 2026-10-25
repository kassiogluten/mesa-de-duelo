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
import forge.gui.FThreads;
import forge.gui.interfaces.IGuiGame;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import org.junit.BeforeClass;
import org.junit.Test;

/** Terrenos com "Pague 1 de vida" (Mana Confluence) cobram a vida em todo caminho de pagamento. */
public class PayLifeManaTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private Game game; private Player player; private PlayerControllerHuman human; private Card land;

    private void setup() {
        game = CommanderEngineTest.game(2);
        game.setAge(GameStage.Play);
        player = game.getPlayers().get(0);
        human = new PlayerControllerHuman(game, player, new LobbyPlayerHuman("Tapper"));
        // Escolhas (habilidade, cor) ficam com a primeira opção; prompts esperam o clique, como no servidor.
        human.setGui((IGuiGame) Proxy.newProxyInstance(IGuiGame.class.getClassLoader(), new Class<?>[]{IGuiGame.class}, (proxy, method, args) -> {
            if (method.getName().equals("awaitInput")) { ((CountDownLatch) args[0]).await(); return null; }
            if (args != null && args.length > 1 && args[1] instanceof List<?> l && !l.isEmpty() && method.getReturnType().isInstance(l.get(0))) return l.get(0);
            return method.getReturnType() == boolean.class ? false : method.getReturnType() == int.class ? 0 : null;
        }));
        player.dangerouslySetController(human);
        land = ExilePermissionsTest.add(game, "Mana Confluence", player, ZoneType.Battlefield);
    }

    /** Roda a ativação numa "thread do jogo", aceitando a pergunta de vida e passando cada pagamento de mana a `onPay`. */
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
                else if (input instanceof InputPayMana pay) FThreads.invokeInEdtAndWait(() -> onPay.accept(pay));
            }
            Thread.sleep(20);
        }
        return ok[0];
    }

    @Test(timeout = 20000) public void tappingTheLandForManaPaysLife() throws Exception {
        setup();
        assertTrue(play(land.getManaAbilities().get(0), pay -> fail("sem custo de mana")));
        assertTrue(land.isTapped());
        assertEquals(39, player.getLife());
        assertEquals(1, player.getManaPool().totalMana());
    }

    @Test(timeout = 20000) public void clickingTheLandWhilePayingASpellPaysLife() throws Exception {
        setup();
        Card lions = ExilePermissionsTest.add(game, "Savannah Lions", player, ZoneType.Hand);
        assertTrue(play(lions.getFirstSpellAbility(), pay -> human.selectCard(land.getView(), null, null)));
        assertTrue(land.isTapped());
        assertEquals(39, player.getLife());
    }

    @Test(timeout = 20000) public void autoPaymentPaysLife() throws Exception {
        setup();
        Card lions = ExilePermissionsTest.add(game, "Savannah Lions", player, ZoneType.Hand);
        assertTrue(play(lions.getFirstSpellAbility(), pay -> human.selectButtonOk()));
        assertTrue(land.isTapped());
        assertEquals(39, player.getLife());
    }
}
