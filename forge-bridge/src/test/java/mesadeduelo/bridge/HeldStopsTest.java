package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.EnumSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.event.GameEventTurnPhase;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.PlayerView;
import forge.game.zone.ZoneType;
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

/** Etapas marcadas no turno do oponente seguram a prioridade: o Forge não pula nem passa sozinho nelas. */
public class HeldStopsTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static final class Fixture {
        final Game game = CommanderEngineTest.game(2);
        final Player me = game.getPlayers().get(0), opponent = game.getPlayers().get(1);
        final PlayerControllerHuman human = new PlayerControllerHuman(game, me, new LobbyPlayerHuman("Test"));
        final AtomicReference<Set<PhaseType>> stops = new AtomicReference<>(Set.of());
        final WebGuiGame gui = new WebGuiGame(new IRemote() {
            public void send(NetEvent event) { }
            public Object sendAndWait(IdentifiableNetEvent event) { return null; }
        }, () -> true, stops::get, new MatchLifecycle(), () -> game);

        Fixture() {
            gui.setGameView(game.getView());
            gui.setGameController(me.getView(), human);
            gui.openView(new TrackableCollection<>(me.getView()));
        }

        YieldController yields() { return human.getYieldController(); }
        boolean autoPass() { return yields().getBoolPref(FPref.YIELD_AUTO_PASS_NO_ACTIONS); }
        void step(Player turn, PhaseType phase) { game.fireEvent(new GameEventTurnPhase(turn, phase, "")); }
        /** Põe o jogo na etapa como o motor faz: a troca de etapa avisa a tela antes da prioridade. */
        void enter(Player turn, PhaseType phase) { game.getPhaseHandler().devModeSet(phase, turn); }
        boolean skipsMine(PhaseType phase) { return yields().isSkippingPhase(me.getView(), phase); }

        void add(String name, Player owner) {
            Card card = Card.fromPaperCard(DeckValidation.resolve(name), owner);
            owner.getZone(ZoneType.Battlefield).add(card);
            card.setZone(owner.getZone(ZoneType.Battlefield));
        }
    }

    @Test public void markedOpponentStepStopsEvenWithoutActions() {
        Fixture f = new Fixture();
        PlayerView opp = f.opponent.getView();
        assertTrue("sem marca, a manutenção do oponente é pulada", f.yields().isSkippingPhase(opp, PhaseType.UPKEEP));

        f.stops.set(EnumSet.of(PhaseType.UPKEEP));
        f.gui.stopsChanged();
        assertFalse(f.yields().isSkippingPhase(opp, PhaseType.UPKEEP));
        assertTrue("só o turno dos oponentes", f.yields().isSkippingPhase(f.me.getView(), PhaseType.UPKEEP));

        f.step(f.opponent, PhaseType.UPKEEP);
        assertTrue(f.gui.holding());
        assertFalse("na etapa marcada o jogo não passa sozinho", f.autoPass());

        f.step(f.opponent, PhaseType.DRAW);
        assertFalse(f.gui.holding());
        assertTrue("a passagem automática volta quando a etapa acaba", f.autoPass());

        f.step(f.me, PhaseType.UPKEEP);
        assertFalse("a marca não vale no próprio turno", f.gui.holding());
        assertTrue(f.autoPass());
    }

    @Test public void markingTheCurrentStepHoldsItAndUnmarkingReleasesIt() {
        Fixture f = new Fixture();
        f.game.getPhaseHandler().devModeSet(PhaseType.END_OF_TURN, f.opponent);
        f.stops.set(EnumSet.of(PhaseType.END_OF_TURN));
        f.gui.stopsChanged();
        assertTrue(f.gui.holding());
        assertFalse(f.autoPass());

        f.stops.set(Set.of());
        f.gui.stopsChanged();
        assertFalse(f.gui.holding());
        assertTrue(f.autoPass());
        assertFalse("a etapa final continua sendo uma parada padrão", f.yields().isSkippingPhase(f.opponent.getView(), PhaseType.END_OF_TURN));
    }

    @Test public void opponentBeginningOfCombatIsADefaultStop() {
        Fixture f = new Fixture();
        assertFalse("antes dos ataques do oponente dá para usar instantâneas e lampejo", f.yields().isSkippingPhase(f.opponent.getView(), PhaseType.COMBAT_BEGIN));
        assertTrue("no próprio turno o início do combate continua pulado", f.skipsMine(PhaseType.COMBAT_BEGIN));
    }

    @Test public void ownUpkeepAndDrawStopOnlyForAPermanentAbility() {
        Fixture f = new Fixture();
        f.add("Forest", f.me);
        f.enter(f.me, PhaseType.UPKEEP);
        assertTrue("só habilidade de mana: a manutenção continua pulada", f.skipsMine(PhaseType.UPKEEP));

        f.add("Bottle Gnomes", f.me);
        f.enter(f.me, PhaseType.UPKEEP);
        assertFalse("com uma habilidade usável agora a manutenção para", f.skipsMine(PhaseType.UPKEEP));
        f.enter(f.me, PhaseType.DRAW);
        assertTrue("a manutenção volta a ser pulada quando acaba", f.skipsMine(PhaseType.UPKEEP));
        assertFalse("a compra também para", f.skipsMine(PhaseType.DRAW));
        f.enter(f.me, PhaseType.MAIN1);
        assertTrue(f.skipsMine(PhaseType.DRAW));

        f.enter(f.opponent, PhaseType.UPKEEP);
        assertTrue("no turno do oponente as paradas marcadas continuam valendo", f.yields().isSkippingPhase(f.opponent.getView(), PhaseType.UPKEEP));
    }

    @Test public void cardsInHandDoNotOpenTheOwnUpkeep() {
        Fixture f = new Fixture();
        Card bolt = Card.fromPaperCard(DeckValidation.resolve("Lightning Bolt"), f.me);
        f.me.getZone(ZoneType.Hand).add(bolt);
        bolt.setZone(f.me.getZone(ZoneType.Hand));
        f.add("Mountain", f.me);
        f.enter(f.me, PhaseType.UPKEEP);
        assertTrue(f.skipsMine(PhaseType.UPKEEP));
    }
}
