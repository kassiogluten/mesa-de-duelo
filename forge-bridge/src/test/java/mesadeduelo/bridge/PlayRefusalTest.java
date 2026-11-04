package mesadeduelo.bridge;

import static org.junit.Assert.*;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.phase.PhaseType;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

public class PlayRefusalTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static Game game() { return CommanderEngineTest.game(2); }

    /** Myrel no turno do dono: o oponente não conjura nem ativa, e o aviso aponta a Myrel. */
    @Test public void myrelNamesTheCardThatForbidsCastingAndActivating() {
        Game game = game(); Player me = game.getPlayers().get(0), opp = game.getPlayers().get(1);
        Card myrel = ExilePermissionsTest.add(game, "Myrel, Shield of Argive", opp, ZoneType.Battlefield);
        for (int i = 0; i < 3; i++) ExilePermissionsTest.add(game, "Mountain", me, ZoneType.Battlefield);
        Card bolt = ExilePermissionsTest.add(game, "Lightning Bolt", me, ZoneType.Hand);
        Card shade = ExilePermissionsTest.add(game, "Prodigal Pyromancer", me, ZoneType.Battlefield);
        shade.setSickness(false);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, opp);
        game.getAction().checkStaticAbilities(false);
        var cast = PlayRefusal.explain(me, bolt);
        assertNotNull("bolt refused under Myrel", cast);
        assertEquals(java.util.List.of(myrel), cast.cards());
        assertTrue(cast.text(), cast.text().contains("conjurar") && cast.text().contains("por causa de"));
        var activate = PlayRefusal.explain(me, shade);
        assertNotNull("creature ability refused under Myrel", activate);
        assertEquals(java.util.List.of(myrel), activate.cards());
        assertTrue(activate.text(), activate.text().contains("ativar"));
        assertTrue(PlayRefusal.json(cast).contains("\"cards\""));

        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        game.getAction().checkStaticAbilities(false);
        assertNull("castable on my own turn: the click goes to Forge", PlayRefusal.explain(me, bolt));
    }

    @Test public void secondLandOfTheTurnIsExplained() {
        Game game = game(); Player me = game.getPlayers().get(0);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        Card forest = ExilePermissionsTest.add(game, "Forest", me, ZoneType.Hand);
        assertNull(PlayRefusal.explain(me, forest));
        me.addLandPlayedThisTurn();
        var r = PlayRefusal.explain(me, forest);
        assertNotNull(r);
        assertEquals("Você já jogou um terreno neste turno.", r.text());
    }

    /** Carta de dupla face modal: com o terreno do turno usado, a face de mágica continua jogável. */
    @Test public void modalDoubleFacedSpellStaysPlayableAfterTheLandDrop() {
        Game game = game(); Player me = game.getPlayers().get(0);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        for (int i = 0; i < 4; i++) ExilePermissionsTest.add(game, "Forest", me, ZoneType.Battlefield);
        Card mammoth = ExilePermissionsTest.add(game, "Kazandu Mammoth", me, ZoneType.Hand);
        me.addLandPlayedThisTurn();
        assertNull(PlayRefusal.explain(me, mammoth));
    }

    @Test public void sorceryOnTheOpponentsTurnIsExplained() {
        Game game = game(); Player me = game.getPlayers().get(0), opp = game.getPlayers().get(1);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, opp);
        Card bears = ExilePermissionsTest.add(game, "Grizzly Bears", me, ZoneType.Hand);
        var r = PlayRefusal.explain(me, bears);
        assertNotNull(r);
        assertTrue(r.text(), r.text().contains("no seu turno"));
    }

    @Test public void plainCreatureOnTheFieldStaysSilent() {
        Game game = game(); Player me = game.getPlayers().get(0), opp = game.getPlayers().get(1);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, opp);
        Card bears = ExilePermissionsTest.add(game, "Grizzly Bears", me, ZoneType.Battlefield);
        assertNull(PlayRefusal.explain(me, bears));
    }
}
