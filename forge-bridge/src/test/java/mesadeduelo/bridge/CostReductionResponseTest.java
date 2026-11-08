package mesadeduelo.bridge;

import static org.junit.Assert.*;
import forge.ai.AvailableActions;
import forge.ai.ComputerUtilMana;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.cost.CostAdjustment;
import forge.game.mana.ManaCostBeingPaid;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

/**
 * Item 110 do roadmap: Arcane Denial ({1}{U}) com Baral, Chief of Compliance (instantâneas custam {1} a menos)
 * e uma Island só, respondendo à mágica do oponente. A passagem automática sem ações e o destaque da mão vêm de
 * {@link AvailableActions}; o pagamento, do custo ajustado pelo {@link CostAdjustment}.
 */
public class CostReductionResponseTest {
    private static final long BUDGET_MS = 5000;

    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private record Table(Game game, Player me, Card denial) { }

    /** Turno do oponente, com a Divination dele na pilha e a prioridade com o jogador. */
    private static Table table(boolean baral) {
        Game game = TestGames.empty();
        Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        game.getPhaseHandler().devModeSet(forge.game.phase.PhaseType.MAIN1, other);
        if (baral) TestGames.add(game, "Baral, Chief of Compliance", me, ZoneType.Battlefield);
        TestGames.add(game, "Island", me, ZoneType.Battlefield);
        Card denial = TestGames.add(game, "Arcane Denial", me, ZoneType.Hand);
        Card divination = TestGames.add(game, "Divination", other, ZoneType.Hand);
        SpellAbility spell = divination.getFirstSpellAbility();
        spell.setActivatingPlayer(other);
        game.getStack().add(spell);
        game.getPhaseHandler().setPriority(me);
        return new Table(game, me, denial);
    }

    @Test public void baralMakesArcaneDenialPlayableWithOneIsland() {
        Table t = table(true);
        assertTrue("o jogador não passa direto: há uma resposta", AvailableActions.compute(t.me(), BUDGET_MS));
        assertTrue("a Contradição Arcana aparece como jogável",
            AvailableActions.collectActionable(t.me(), BUDGET_MS).contains(t.denial().getView()));

        SpellAbility sa = t.denial().getFirstSpellAbility();
        sa.setActivatingPlayer(t.me());
        ManaCostBeingPaid cost = new ManaCostBeingPaid(sa.getPayCosts().getTotalMana());
        CostAdjustment.adjust(cost, sa, t.me(), null, true, false);
        assertEquals("o custo cai para {U}", "{U}", cost.toManaCost().toString());
        assertTrue("uma Island paga", ComputerUtilMana.canPayManaCost(sa, t.me(), 0, false));
    }

    @Test public void withoutBaralOneIslandIsNotEnough() {
        Table t = table(false);
        assertFalse(AvailableActions.compute(t.me(), BUDGET_MS));
    }
}
