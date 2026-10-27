package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.lang.reflect.Proxy;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.function.Consumer;
import com.google.gson.JsonObject;
import forge.card.mana.ManaAtom;
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

/** Mana incolor na reserva ({C} de Wastes): aparece no retrato e dá para gastar tocando nela. */
public class ColorlessPoolTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private Game game; private Player player; private PlayerControllerHuman human;

    private void setup() {
        game = CommanderEngineTest.game(2);
        game.setAge(GameStage.Play);
        player = game.getPlayers().get(0);
        human = new PlayerControllerHuman(game, player, new LobbyPlayerHuman("Colorless"));
        human.setGui((IGuiGame) Proxy.newProxyInstance(IGuiGame.class.getClassLoader(), new Class<?>[]{IGuiGame.class}, (proxy, method, args) -> {
            if (method.getName().equals("awaitInput")) { ((CountDownLatch) args[0]).await(); return null; }
            if (args != null && args.length > 1 && args[1] instanceof List<?> l && !l.isEmpty() && method.getReturnType().isInstance(l.get(0))) return l.get(0);
            return method.getReturnType() == boolean.class ? false : method.getReturnType() == int.class ? 0 : null;
        }));
        player.dangerouslySetController(human);
    }

    /** Roda numa "thread do jogo", aceitando confirmações e passando cada pagamento a `onPay`. */
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

    private JsonObject pool() {
        for (var p : StateJson.game(game.getView(), player.getId(), game).getAsJsonArray("players"))
            if (p.getAsJsonObject().get("id").getAsInt() == player.getId()) return p.getAsJsonObject().getAsJsonObject("pool");
        throw new AssertionError("jogador sumiu do estado");
    }

    @Test(timeout = 20000) public void colorlessManaShowsInThePoolAndPaysFromIt() throws Exception {
        setup();
        Card wastes = ExilePermissionsTest.add(game, "Wastes", player, ZoneType.Battlefield);
        assertTrue(play(wastes.getManaAbilities().get(0), pay -> fail("sem custo de mana")));
        assertEquals(1, pool().get("C").getAsInt());

        Card ring = ExilePermissionsTest.add(game, "Sol Ring", player, ZoneType.Hand);
        assertTrue(play(ring.getFirstSpellAbility(), pay -> human.useMana((byte) ManaAtom.COLORLESS)));
        assertTrue(ring.isInZone(ZoneType.Stack));
        assertEquals(0, player.getManaPool().totalMana());
        assertEquals(0, pool().get("C").getAsInt());
    }
}
