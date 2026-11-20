package mesadeduelo.bridge;

import static org.junit.Assert.*;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.card.CounterEnumType;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

/** Greater Gargadon: a habilidade que se ativa do exílio enquanto ela está suspensa chega à mesa como utilizável. */
public class GreaterGargadonTest {
    @BeforeClass public static void engine() { TestGames.engine(); }

    @Test public void suspendedGargadonIsUsableFromExileWithoutAPlayPermission() {
        Game game = TestGames.empty(); Player me = game.getPlayers().get(0);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        TestGames.add(game, "Forest", me, ZoneType.Battlefield);
        Card gargadon = TestGames.add(game, "Greater Gargadon", me, ZoneType.Exile);
        gargadon.addCounterInternal(CounterEnumType.TIME, 10, me, false, null, null);
        assertTrue("suspensa", StateJson.suspendedExile(game, me.getId()).contains(new com.google.gson.JsonPrimitive(gargadon.getId())));
        assertTrue("habilidade do exílio disponível", Castable.compute(me).contains(gargadon.getId()));
        assertEquals("não é permissão de jogar do exílio", 0, StateJson.playableExile(game, me.getId()).size());
        gargadon.setCounters(com.google.common.collect.HashMultiset.create());
        assertFalse("sem marcadores não está suspensa: nada a ativar", Castable.compute(me).contains(gargadon.getId()));
    }

    /** Na pilha, a habilidade vai com a linha dela no texto da carta (a mesa mostra essa linha em português). */
    @Test public void activatedAbilityPointsToItsLineOfTheCardText() {
        Game game = TestGames.empty(); Player me = game.getPlayers().get(0);
        Card gargadon = TestGames.add(game, "Greater Gargadon", me, ZoneType.Exile);
        assertEquals(Integer.valueOf(1), StackLine.line(ability(gargadon)));
        Card pyromancer = TestGames.add(game, "Prodigal Pyromancer", me, ZoneType.Battlefield);
        assertEquals(Integer.valueOf(0), StackLine.line(ability(pyromancer)));
        assertNull("com X, fica a descrição do motor, que tem o valor", StackLine.line(ability(TestGames.add(game, "Crypt Rats", me, ZoneType.Battlefield))));
        assertNull("mágica", StackLine.line(TestGames.add(game, "Lightning Bolt", me, ZoneType.Hand).getFirstSpellAbility()));
    }

    private static forge.game.spellability.SpellAbility ability(Card card) {
        return card.getSpellAbilities().stream().filter(sa -> sa.isActivatedAbility() && !sa.isManaAbility()).findFirst().orElseThrow();
    }
}
