package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
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

/** Pagamento automático do jogador: a parte genérica sai primeiro da mana incolor das pedras de mana. */
public class AutoPayStonesTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private Game game; private Player player; private PlayerControllerHuman human;

    private void setup() {
        game = CommanderEngineTest.game(2);
        game.setAge(GameStage.Play);
        player = game.getPlayers().get(0);
        human = new PlayerControllerHuman(game, player, new LobbyPlayerHuman("AutoPay"));
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
                else if (input instanceof InputPayMana pay) FThreads.invokeInEdtAndWait(() -> onPay.accept(pay));
            }
            Thread.sleep(20);
        }
        return ok[0];
    }

    /** Põe as permanentes no campo, lança `spell` com o pagamento automático e devolve o que ficou virado e a vida. */
    private String autoPay(boolean forge, String spell, String... battlefield) throws Exception {
        setup();
        CommanderEngineTest.commander(game, player); // Arcane Signet dá a cor do comandante (Isamaru, branco)
        List<Card> sources = new ArrayList<>();
        for (String name : battlefield) sources.add(ExilePermissionsTest.add(game, name, player, ZoneType.Battlefield));
        Card card = ExilePermissionsTest.add(game, spell, player, ZoneType.Hand);
        assertTrue(play(card.getFirstSpellAbility(), pay -> { if (forge) human.selectButtonOk(); else assertTrue(AutoPay.ok(human)); }));
        assertTrue(card.isInZone(ZoneType.Stack));
        List<String> tapped = new ArrayList<>();
        for (Card c : sources) if (c.isTapped()) tapped.add(c.getName());
        return tapped + " life " + player.getLife();
    }

    private String forge(String spell, String... battlefield) throws Exception { return autoPay(true, spell, battlefield); }
    private String mesa(String spell, String... battlefield) throws Exception { return autoPay(false, spell, battlefield); }

    /** Antes, o Forge virava os dois terrenos e deixava o talismã; agora a mana incolor dele paga o genérico. */
    @Test(timeout = 60000) public void genericOnlyCostUsesTheTalismanColorlessMana() throws Exception {
        assertEquals("[Island, Swamp] life 40", forge("Mind Stone", "Island", "Swamp", "Talisman of Dominance"));
        assertEquals("[Island, Talisman of Dominance] life 40", mesa("Mind Stone", "Island", "Swamp", "Talisman of Dominance"));
    }

    @Test(timeout = 60000) public void coloredCostKeepsALandUntapped() throws Exception {
        assertEquals("[Island, Island] life 40", forge("Coral Merfolk", "Island", "Island", "Talisman of Dominance"));
        assertEquals("[Island, Talisman of Dominance] life 40", mesa("Coral Merfolk", "Island", "Island", "Talisman of Dominance"));
    }

    @Test(timeout = 60000) public void otherStonesWithoutDrawbackToo() throws Exception {
        assertEquals("[Island, Island] life 40", forge("Coral Merfolk", "Island", "Island", "Mind Stone"));
        assertEquals("[Island, Mind Stone] life 40", mesa("Coral Merfolk", "Island", "Island", "Mind Stone"));
        assertEquals("[Island, Arcane Signet] life 40", mesa("Coral Merfolk", "Island", "Plains", "Arcane Signet"));
    }

    /**
     * Com uma terra de dor: com a Montanha, nada de dano (o talismã dá o incolor e a Montanha, o vermelho); sem ela,
     * o vermelho custa 1 de dano de um jeito ou de outro, e a Planície fica desvirada.
     */
    @Test(timeout = 60000) public void talismanBesideAPainLand() throws Exception {
        assertEquals("[Mountain, Talisman of Conviction] life 40", mesa("Goblin Piker", "Mountain", "Battlefield Forge", "Talisman of Conviction"));
        assertEquals("[Battlefield Forge, Talisman of Conviction] life 39", mesa("Goblin Piker", "Plains", "Battlefield Forge", "Talisman of Conviction"));
    }

    /** Quando o talismã é a única fonte de azul, ele dá o azul (com o dano) e uma Montanha paga o genérico. */
    @Test(timeout = 60000) public void stoneThatIsTheOnlySourceOfTheColorPaysTheColor() throws Exception {
        assertEquals("[Mountain, Talisman of Dominance] life 39", mesa("Coral Merfolk", "Mountain", "Mountain", "Talisman of Dominance"));
    }

    /**
     * Signet (que pede {1} para ativar) fica com o Automático do Forge, e a pedra só entra se não virar mais
     * permanentes: com Pântano, Dimir Signet e Mind Stone, o Pântano paga o Signet e o Signet paga tudo.
     */
    @Test(timeout = 60000) public void signetPaymentIsNoWorse() throws Exception {
        for (String[] table : List.of(new String[]{"Phantom Warrior", "Island", "Island", "Dimir Signet", "Talisman of Dominance"},
                                      new String[]{"Phantom Warrior", "Island", "Swamp", "Dimir Signet", "Talisman of Dominance"},
                                      new String[]{"Coral Merfolk", "Swamp", "Dimir Signet"},
                                      new String[]{"Coral Merfolk", "Swamp", "Dimir Signet", "Mind Stone"})) {
            String spell = table[0]; String[] field = java.util.Arrays.copyOfRange(table, 1, table.length);
            assertEquals(String.join(", ", table), forge(spell, field), mesa(spell, field));
        }
    }

    /** Sol Ring dá {C}{C}: com só {1} genérico, a mana a mais sobraria, então ele fica para o Forge decidir. */
    @Test(timeout = 60000) public void stoneMakingMoreThanTheGenericIsLeftToForge() throws Exception {
        assertEquals(forge("Phantom Warrior", "Island", "Island", "Island", "Sol Ring"), mesa("Phantom Warrior", "Island", "Island", "Island", "Sol Ring"));
        assertEquals("[Sol Ring] life 40", mesa("Mind Stone", "Island", "Swamp", "Sol Ring"));
    }

    @Test(timeout = 20000) public void okOutsideAPaymentIsLeftAlone() {
        setup();
        assertFalse(AutoPay.ok(human));
    }
}
