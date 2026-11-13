package mesadeduelo.bridge;

import static org.junit.Assert.*;

import forge.game.Game;
import forge.game.card.Card;
import forge.game.event.GameEventTurnBegan;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.undo.GameMemento;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

/** O histórico do Desfazer: retratos guardados como diferença, voltas seguidas e o limite de turnos. */
public class UndoHistoryTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    /** Muda um pouco de tudo: vida, cartas que entram, que mudam de zona e que viram. */
    private static void play(Game game, int round) {
        Player me = game.getPlayers().get(0), them = game.getPlayers().get(1);
        me.setLife(40 - round, null);
        Card forest = ExilePermissionsTest.add(game, "Forest", me, ZoneType.Battlefield);
        if (round % 2 == 0) forest.setTapped(true);
        Card bear = ExilePermissionsTest.add(game, "Grizzly Bears", them, ZoneType.Hand);
        if (round > 1) game.getAction().moveTo(ZoneType.Graveyard, bear, null, null);
    }

    @Test public void olderPicturesKeepOnlyTheDifferenceAndRestoreExactly() {
        Game game = CommanderEngineTest.game(2);
        // Um jogo de verdade tem bibliotecas cheias: é isso que não muda de uma decisão para outra.
        for (Player p : game.getPlayers()) for (int i = 0; i < 60; i++) ExilePermissionsTest.add(game, "Plains", p, ZoneType.Library);
        GameMemento.Recorder recorder = new GameMemento.Recorder();
        GameMemento[] m = new GameMemento[4];
        GameMemento[] copy = new GameMemento[4];
        for (int i = 0; i < m.length; i++) {
            copy[i] = new GameMemento.Recorder().captureStandalone(game);
            m[i] = recorder.capture(game); play(game, i + 1);
        }
        recorder.capture(game);
        for (int i = 0; i < m.length; i++)
            assertTrue("o retrato mais velho guarda bem menos que o inteiro: " + m[i].deltaSize() + " de " + copy[i].objectCount(), m[i].deltaSize() < copy[i].objectCount() / 4);
        for (int i = m.length - 1; i >= 0; i--) {
            assertTrue(recorder.restoreTo(m[i]));
            assertEquals(java.util.List.of(), new GameMemento.Recorder().captureStandalone(game).diff(copy[i]));
        }
    }

    @Test public void undoTwiceInARowRestoresEachEarlierDecision() {
        Game game = CommanderEngineTest.game(2);
        Player me = game.getPlayers().get(0);
        UndoHistory h = new UndoHistory();
        int[] life = new int[4];
        for (int i = 0; i < life.length; i++) {
            life[i] = me.getLife();
            h.decided(h.capture(game, me), null);
            play(game, i + 1);
        }
        int cards = me.getCardsIn(ZoneType.Battlefield).size();
        assertEquals(4, h.size());
        for (int i = life.length - 1; i >= 2; i--) {
            h.approve(h.lastOf(me.getId()), null);
            assertNotNull(h.applyPending(game));
            assertEquals("volta para a decisão " + i, life[i], me.getLife());
            assertEquals(i, h.size());
        }
        assertEquals("as Florestas jogadas depois saíram", cards - 2, me.getCardsIn(ZoneType.Battlefield).size());
        // Depois de voltar, o jogo segue e guarda novas decisões a partir dali.
        h.decided(h.capture(game, me), null);
        play(game, 9);
        h.approve(h.lastOf(me.getId()), null);
        assertNotNull(h.applyPending(game));
        assertEquals(life[2], me.getLife());
        h.approve(h.lastOf(me.getId()), null);
        assertNotNull(h.applyPending(game));
        assertEquals(life[1], me.getLife());
        h.approve(h.lastOf(me.getId()), null);
        assertNotNull(h.applyPending(game));
        assertEquals(life[0], me.getLife());
        assertNull(h.lastOf(me.getId()));
    }

    @Test public void keepsOnlyTheCurrentAndThePreviousTurn() {
        Game game = CommanderEngineTest.game(2);
        Player me = game.getPlayers().get(0);
        UndoHistory h = new UndoHistory();
        GameMemento.Recorder recorder = new GameMemento.Recorder();
        h.capture(game, me);   // liga o histórico a este jogo
        for (int turn = 1; turn <= 3; turn++)
            for (int k = 0; k < 2; k++)
                h.decided(new UndoHistory.Step(recorder.capture(game), 0, me, turn, PhaseType.MAIN1, null, null), null);
        assertEquals("os do turno 1 saíram quando o 3 teve uma decisão", 4, h.size());
        assertEquals(3, h.lastOf(me.getId()).turn());
        game.fireEvent(new GameEventTurnBegan(me.getView(), 4));
        assertEquals("começou o turno 4: fica só o 3", 2, h.size());
        game.fireEvent(new GameEventTurnBegan(me.getView(), 5));
        assertNull("começou o turno 5: nada mais para desfazer", h.lastOf(me.getId()));
    }
}
