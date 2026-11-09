package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.List;
import forge.ai.AvailableActions;
import forge.ai.ComputerUtilMana;
import forge.game.Game;
import forge.game.GameStage;
import forge.game.card.Card;
import forge.game.mana.ManaCostBeingPaid;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import org.junit.Test;

/** Caged Sun: a mana extra das terras da cor escolhida conta para conjurar e para o Automático. */
public class CagedSunTest {
    private static final class Table {
        final Game game = TestGames.empty();
        final Player a = game.getPlayers().get(0);
        final Card spell;
        final SpellAbility sa;

        Table(String color, int mountains, String card) {
            game.setAge(GameStage.Play);
            game.getPhaseHandler().devModeSet(PhaseType.MAIN1, a);
            if (color != null) TestGames.add(game, "Caged Sun", a, ZoneType.Battlefield).setChosenColors(List.of(color));
            for (int i = 0; i < mountains; i++) TestGames.add(game, "Mountain", a, ZoneType.Battlefield);
            spell = TestGames.add(game, card, a, ZoneType.Hand);
            sa = spell.getFirstSpellAbility();
            sa.setActivatingPlayer(a);
            game.getTriggerHandler().resetActiveTriggers();
        }

        boolean castable() { return AvailableActions.collectActionable(a, 5000).contains(spell.getView()); }
    }

    @Test public void twoMountainsPayFourWithCagedSunOnRed() {
        Table t = new Table("red", 2, "Hill Giant");
        assertTrue("Hill Giant ({3}{R}) disponível com 2 Montanhas", t.castable());
        ManaCostBeingPaid cost = new ManaCostBeingPaid(t.sa.getPayCosts().getTotalMana());
        assertTrue(AvailableActions.canAffordWithLandBonus(cost, t.sa, t.a, false));
        assertTrue("o Automático paga de verdade", ComputerUtilMana.payManaCost(cost, t.sa, t.a, false));
        assertTrue(cost.isPaid());
        assertEquals(0, t.a.getManaPool().totalMana());
    }

    @Test public void bonusDoesNotOverpay() {
        assertFalse("{3}{R} com 1 Montanha dá só 2", new Table("red", 1, "Hill Giant").castable());
        assertFalse("sem Caged Sun, 2 Montanhas não pagam {3}{R}", new Table(null, 2, "Hill Giant").castable());
        assertFalse("Caged Sun no verde não ajuda as Montanhas", new Table("green", 2, "Hill Giant").castable());
    }
}
