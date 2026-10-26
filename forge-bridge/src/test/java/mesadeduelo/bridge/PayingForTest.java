package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.lang.reflect.Proxy;
import forge.card.mana.ManaCost;
import forge.game.Game;
import forge.game.GameStage;
import forge.game.card.Card;
import forge.game.mana.ManaCostBeingPaid;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.InputPayManaOfCostPayment;
import forge.gui.interfaces.IGuiGame;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import org.junit.BeforeClass;
import org.junit.Test;

/** O pagamento de mana diz à mesa o que o Cancelar desfaz: a mágica, a habilidade ou só o pagamento pedido por um efeito. */
public class PayingForTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private Game game; private Player player; private PlayerControllerHuman human;

    private void setup() {
        game = CommanderEngineTest.game(2);
        game.setAge(GameStage.Play);
        player = game.getPlayers().get(0);
        human = new PlayerControllerHuman(game, player, new LobbyPlayerHuman("Payer"));
        human.setGui((IGuiGame) Proxy.newProxyInstance(IGuiGame.class.getClassLoader(), new Class<?>[]{IGuiGame.class},
            (proxy, method, args) -> method.getReturnType() == boolean.class ? false : method.getReturnType() == int.class ? 0 : null));
        player.dangerouslySetController(human);
    }

    private String payingFor(SpellAbility sa, boolean effect) {
        sa.setActivatingPlayer(player);
        return Session.payingFor(new InputPayManaOfCostPayment(human, new ManaCostBeingPaid(ManaCost.get(1)), sa, player, null, effect));
    }

    @Test public void castingASpellPaysForTheSpell() {
        setup();
        Card lions = ExilePermissionsTest.add(game, "Savannah Lions", player, ZoneType.Hand);
        assertEquals("spell", payingFor(lions.getFirstSpellAbility(), false));
    }

    @Test public void activatingAnAbilityPaysForTheAbility() {
        setup();
        Card dragon = ExilePermissionsTest.add(game, "Shivan Dragon", player, ZoneType.Battlefield);
        SpellAbility firebreathing = dragon.getSpellAbilities().stream().filter(SpellAbility::isActivatedAbility).findFirst().orElseThrow();
        assertEquals("ability", payingFor(firebreathing, false));
    }

    @Test public void aCostAskedByAnEffectIsOnlyAPayment() {
        setup();
        Card lions = ExilePermissionsTest.add(game, "Savannah Lions", player, ZoneType.Hand);
        assertEquals("effect", payingFor(lions.getFirstSpellAbility(), true));
    }
}
