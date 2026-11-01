package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.function.Consumer;
import forge.card.mana.ManaCost;
import forge.card.mana.ManaCostParser;
import forge.game.Game;
import forge.game.GameStage;
import forge.game.card.Card;
import forge.game.mana.ManaCostBeingPaid;
import forge.game.player.PlaySpellAbility;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.InputConfirm;
import forge.gamemodes.match.input.InputPayMana;
import forge.gamemodes.match.input.InputPayManaOfCostPayment;
import forge.gui.FThreads;
import forge.gui.interfaces.IGuiGame;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import org.junit.BeforeClass;
import org.junit.Test;

/** O custo que falta pagar vai para a mesa e desconta a cada terreno virado ou mana gerada. */
public class ManaCostTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private Game game; private Player player; private PlayerControllerHuman human;

    private void setup() {
        game = CommanderEngineTest.game(2);
        game.setAge(GameStage.Play);
        player = game.getPlayers().get(0);
        human = new PlayerControllerHuman(game, player, new LobbyPlayerHuman("Payer"));
        human.setGui((IGuiGame) Proxy.newProxyInstance(IGuiGame.class.getClassLoader(), new Class<?>[]{IGuiGame.class}, (proxy, method, args) -> {
            if (method.getName().equals("awaitInput")) { ((CountDownLatch) args[0]).await(); return null; }
            if (args != null && args.length > 1 && args[1] instanceof List<?> l && !l.isEmpty() && method.getReturnType().isInstance(l.get(0))) return l.get(0);
            return method.getReturnType() == boolean.class ? false : method.getReturnType() == int.class ? 0 : null;
        }));
        player.dangerouslySetController(human);
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

    /** Vira uma fonte de mana e espera o motor descontar o custo (a habilidade de mana roda na thread do jogo). */
    private void tap(InputPayMana pay, Card card) {
        String before = cost(pay);
        FThreads.invokeInEdtAndWait(() -> human.selectCard(card.getView(), null, null));
        long until = System.currentTimeMillis() + 5000;
        while (cost(pay).equals(before) && human.getInputQueue().getInput() == pay && System.currentTimeMillis() < until) {
            try { Thread.sleep(20); } catch (InterruptedException e) { throw new IllegalStateException(e); }
        }
    }

    /** Custo misto pago à mão: cada terreno virado desconta o símbolo que pagou, e o total fica para comparar. */
    @Test(timeout = 20000) public void mixedCostShrinksWithEachLand() throws Exception {
        setup();
        Card mountain = ExilePermissionsTest.add(game, "Mountain", player, ZoneType.Battlefield);
        List<Card> forests = List.of(ExilePermissionsTest.add(game, "Forest", player, ZoneType.Battlefield),
            ExilePermissionsTest.add(game, "Forest", player, ZoneType.Battlefield), ExilePermissionsTest.add(game, "Forest", player, ZoneType.Battlefield));
        Card giant = ExilePermissionsTest.add(game, "Hill Giant", player, ZoneType.Hand);
        List<String> seen = new ArrayList<>();
        assertTrue(play(giant.getFirstSpellAbility(), pay -> {
            seen.add(cost(pay));
            tap(pay, mountain);
            seen.add(cost(pay));
            tap(pay, forests.get(0));
            seen.add(cost(pay));
            tap(pay, forests.get(1));
            tap(pay, forests.get(2));
        }));
        assertEquals(List.of("{\"remaining\":\"{3}{R}\"}", "{\"remaining\":\"{3}\",\"total\":\"{3}{R}\"}",
            "{\"remaining\":\"{2}\",\"total\":\"{3}{R}\"}"), seen);
        assertTrue(giant.isInZone(ZoneType.Stack));
    }

    /** Uma fonte que dá duas manas paga as duas de uma vez; o que não serve fica na reserva. */
    @Test(timeout = 20000) public void twoManaSourcePaysTwoAtOnce() throws Exception {
        setup();
        Card solRing = ExilePermissionsTest.add(game, "Sol Ring", player, ZoneType.Battlefield);
        Card mountain = ExilePermissionsTest.add(game, "Mountain", player, ZoneType.Battlefield);
        Card ogre = ExilePermissionsTest.add(game, "Gray Ogre", player, ZoneType.Hand);
        List<String> seen = new ArrayList<>();
        assertTrue(play(ogre.getFirstSpellAbility(), pay -> {
            seen.add(cost(pay));
            tap(pay, solRing);
            seen.add(cost(pay));
            tap(pay, mountain);
        }));
        assertEquals(List.of("{\"remaining\":\"{2}{R}\"}", "{\"remaining\":\"{R}\",\"total\":\"{2}{R}\"}"), seen);
        assertTrue(solRing.isTapped());
    }

    /** Phyrexiana: o símbolo pago com vida sai do que falta e a vida separada vai junto. */
    @Test(timeout = 20000) public void phyrexianLifeShowsWithTheCost() throws Exception {
        setup();
        Card tanadon = ExilePermissionsTest.add(game, "Thundering Tanadon", player, ZoneType.Hand);
        List<String> seen = new ArrayList<>();
        assertFalse(play(tanadon.getFirstSpellAbility(), pay -> {
            seen.add(cost(pay));
            FThreads.invokeInEdtAndWait(() -> human.selectPlayer(player.getView(), null));
            seen.add(cost(pay));
            FThreads.invokeInEdtAndWait(human::selectButtonCancel);
        }));
        assertEquals(List.of("{\"remaining\":\"{4}{G/P}{G/P}\"}", "{\"remaining\":\"{4}{G/P}\",\"total\":\"{4}{G/P}{G/P}\",\"life\":2}"), seen);
    }

    /** Custo pedido por um efeito (Mana Leak): o que o efeito pede, sem X da mágica que pede. */
    @Test public void aCostAskedByAnEffect() {
        setup();
        Card leak = ExilePermissionsTest.add(game, "Mana Leak", player, ZoneType.Hand);
        SpellAbility sa = leak.getFirstSpellAbility();
        sa.setActivatingPlayer(player);
        InputPayManaOfCostPayment pay = new InputPayManaOfCostPayment(human, new ManaCostBeingPaid(new ManaCost(new ManaCostParser("3"))), sa, player, null, true);
        assertEquals("{\"remaining\":\"{3}\"}", cost(pay));
    }

    /** X já escolhido: o motor soma X ao genérico, e o X vai junto para a mesa dizer de onde veio. */
    @Test public void chosenXGoesWithTheCost() {
        setup();
        Card blaze = ExilePermissionsTest.add(game, "Blaze", player, ZoneType.Hand);
        SpellAbility sa = blaze.getFirstSpellAbility();
        sa.setActivatingPlayer(player);
        sa.setXManaCostPaid(3);
        InputPayManaOfCostPayment pay = new InputPayManaOfCostPayment(human, new ManaCostBeingPaid(new ManaCost(new ManaCostParser("3 R"))), sa, player, null, false);
        assertEquals("{\"remaining\":\"{3}{R}\",\"x\":3}", cost(pay));
    }

    @Test public void outsideAPaymentThereIsNoCost() {
        assertNull(InputContext.manaCost(new Object()));
    }
}
