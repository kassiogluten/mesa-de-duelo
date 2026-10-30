package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.EnumSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import forge.game.Game;
import forge.game.event.GameEventTurnPhase;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.gamemodes.match.YieldController;
import forge.gamemodes.net.IRemote;
import forge.gamemodes.net.event.IdentifiableNetEvent;
import forge.gamemodes.net.event.NetEvent;
import forge.localinstance.properties.ForgePreferences.FPref;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import forge.trackable.TrackableCollection;
import org.junit.BeforeClass;
import org.junit.Test;

/** Níveis de passar automaticamente: o que cada um passa, as etapas marcadas e o atalho "Passar até o fim do turno". */
public class PassLevelTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    @Test public void eachLevelPassesOnlyWhatItPromises() {
        // passes(holding, myTurn, stackEmpty, phase, affected)
        for (PassLevel slow : new PassLevel[] { PassLevel.SEMPRE, PassLevel.ACOES }) {
            assertFalse(slow.passes(false, false, true, PhaseType.END_OF_TURN, false));
            assertFalse(slow.passes(false, true, false, PhaseType.MAIN1, false));
        }
        PassLevel r = PassLevel.RESPOSTAS;
        assertTrue("turno do oponente", r.passes(false, false, true, PhaseType.END_OF_TURN, false));
        assertTrue("pilha cheia no seu turno", r.passes(false, true, false, PhaseType.MAIN1, false));
        assertTrue("como o antigo Passar respostas, passa mesmo quando algo mira você", r.passes(false, false, false, PhaseType.MAIN1, true));
        assertFalse("seu turno com a pilha vazia para", r.passes(false, true, true, PhaseType.COMBAT_DECLARE_BLOCKERS, false));

        PassLevel a = PassLevel.AFETA;
        assertTrue(a.passes(false, false, false, PhaseType.MAIN1, false));
        assertFalse("algo mira você: para", a.passes(false, false, false, PhaseType.MAIN1, true));
        assertTrue("seu turno fora das principais", a.passes(false, true, true, PhaseType.COMBAT_DECLARE_BLOCKERS, false));
        assertTrue(a.passes(false, true, true, PhaseType.UPKEEP, false));
        assertFalse("suas fases principais param", a.passes(false, true, true, PhaseType.MAIN1, false));
        assertFalse(a.passes(false, true, true, PhaseType.MAIN2, false));
    }

    @Test public void markedStepsStopInEveryLevel() {
        for (PassLevel level : PassLevel.values())
            assertFalse(level.name(), level.passes(true, false, false, PhaseType.END_OF_TURN, false));
    }

    @Test public void oldSwitchesMapToTheEquivalentLevel() {
        assertEquals(PassLevel.SEMPRE, PassLevel.fromLegacy(PassLevel.ACOES, false, null));
        assertEquals(PassLevel.ACOES, PassLevel.fromLegacy(PassLevel.SEMPRE, true, null));
        assertEquals(PassLevel.RESPOSTAS, PassLevel.fromLegacy(PassLevel.ACOES, null, true));
        assertEquals(PassLevel.AFETA, PassLevel.fromLegacy(PassLevel.AFETA, null, true));
        assertEquals(PassLevel.ACOES, PassLevel.fromLegacy(PassLevel.AFETA, null, false));
        assertEquals(PassLevel.RESPOSTAS, PassLevel.fromLegacy(PassLevel.ACOES, true, true));
        assertEquals(PassLevel.ACOES, PassLevel.fromLegacy(PassLevel.ACOES, null, null));
        for (PassLevel level : PassLevel.values()) assertEquals(level, PassLevel.of(level.id));
        assertNull(PassLevel.of("rapido"));
    }

    private static final class Fixture {
        final Game game = CommanderEngineTest.game(2);
        final Player me = game.getPlayers().get(0), opponent = game.getPlayers().get(1);
        final PlayerControllerHuman human = new PlayerControllerHuman(game, me, new LobbyPlayerHuman("Test"));
        final AtomicReference<PassLevel> level = new AtomicReference<>(PassLevel.ACOES);
        final AtomicReference<Set<PhaseType>> stops = new AtomicReference<>(Set.of());
        final WebGuiGame gui = new WebGuiGame(new IRemote() {
            public void send(NetEvent event) { }
            public Object sendAndWait(IdentifiableNetEvent event) { return null; }
        }, level::get, stops::get, new MatchLifecycle(), () -> game);

        Fixture() {
            gui.setGameView(game.getView());
            gui.setGameController(me.getView(), human);
            human.setGui(gui);
            gui.openView(new TrackableCollection<>(me.getView()));
        }

        YieldController yields() { return human.getYieldController(); }
        void step(Player turn, PhaseType phase) { game.fireEvent(new GameEventTurnPhase(turn, phase, "")); }
    }

    @Test public void stopAlwaysStopsInEveryStepWithPriority() {
        Fixture f = new Fixture();
        assertTrue(f.yields().isSkippingPhase(f.opponent.getView(), PhaseType.UPKEEP));
        f.level.set(PassLevel.SEMPRE);
        f.gui.levelChanged();
        assertFalse("sem passagem automática", f.yields().getBoolPref(FPref.YIELD_AUTO_PASS_NO_ACTIONS));
        for (PhaseType phase : WebGuiGame.HOLDABLE) {
            if (phase == PhaseType.COMBAT_DECLARE_ATTACKERS) continue;   // sem atacantes, não há a que responder
            assertFalse(phase.name(), f.yields().isSkippingPhase(f.opponent.getView(), phase));
            assertFalse(phase.name(), f.yields().isSkippingPhase(f.me.getView(), phase));
        }
        f.level.set(PassLevel.AFETA);
        f.gui.levelChanged();
        assertTrue(f.yields().getBoolPref(FPref.YIELD_AUTO_PASS_NO_ACTIONS));
        assertTrue("volta às paradas de sempre", f.yields().isSkippingPhase(f.opponent.getView(), PhaseType.UPKEEP));
    }

    @Test public void passUntilEndOfTurnEndsWithTheTurn() {
        Fixture f = new Fixture();
        f.game.getPhaseHandler().devModeSet(PhaseType.MAIN1, f.opponent);
        f.gui.passUntilEndOfTurn(f.human);
        assertTrue(f.gui.passingTurn());
        assertTrue(f.yields().autoPassUntilEndOfTurn());
        assertFalse("uma mágica qualquer do oponente não interrompe", f.yields().getBoolPref(FPref.YIELD_INTERRUPT_ON_OPPONENT_SPELL));
        assertTrue("algo que mira você interrompe", f.yields().getBoolPref(FPref.YIELD_INTERRUPT_ON_TARGETING));
        assertTrue("ser atacado interrompe", f.yields().getBoolPref(FPref.YIELD_INTERRUPT_ON_ATTACKERS));

        f.step(f.opponent, PhaseType.END_OF_TURN);
        assertTrue("ainda no mesmo turno", f.gui.passingTurn());
        f.step(f.me, PhaseType.UPKEEP);
        assertFalse("o turno acabou: volta ao nível escolhido", f.gui.passingTurn());
        assertFalse(f.yields().autoPassUntilEndOfTurn());
    }

    @Test public void markedStepInterruptsPassUntilEndOfTurn() {
        Fixture f = new Fixture();
        f.stops.set(EnumSet.of(PhaseType.END_OF_TURN));
        f.gui.stopsChanged();
        f.game.getPhaseHandler().devModeSet(PhaseType.MAIN1, f.opponent);
        f.gui.passUntilEndOfTurn(f.human);
        f.step(f.opponent, PhaseType.COMBAT_BEGIN);
        assertTrue(f.gui.passingTurn());
        f.step(f.opponent, PhaseType.END_OF_TURN);
        assertTrue(f.gui.holding());
        assertFalse("a etapa marcada para mesmo com o atalho", f.gui.passingTurn());
    }

    @Test public void stoppingTheShortcutReturnsToTheLevel() {
        Fixture f = new Fixture();
        f.game.getPhaseHandler().devModeSet(PhaseType.MAIN1, f.opponent);
        f.gui.passUntilEndOfTurn(f.human);
        f.gui.stopPassingTurn();
        assertFalse(f.gui.passingTurn());
        assertFalse(f.yields().autoPassUntilEndOfTurn());
        f.gui.resolveAll(f.human);
        assertTrue("o Resolver todos continua parando com qualquer mágica nova", f.yields().getBoolPref(FPref.YIELD_INTERRUPT_ON_OPPONENT_SPELL));
    }
}
