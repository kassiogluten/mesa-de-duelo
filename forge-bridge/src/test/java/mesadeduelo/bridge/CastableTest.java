package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.phase.PhaseType;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.InputPassPriority;
import forge.gamemodes.match.input.InputQueue;
import forge.gamemodes.match.input.InputSynchronized;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import java.util.concurrent.BlockingDeque;
import org.junit.BeforeClass;
import org.junit.Test;

public class CastableTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    /** A double-faced commander: checking its back face rebuilds the static effects (CR 601.3e look-ahead). */
    private static Card commander(Game game, Player me) {
        ExilePermissionsTest.add(game, "Glorious Anthem", me, ZoneType.Battlefield);
        Card esika = ExilePermissionsTest.add(game, "Esika, God of the Tree", me, ZoneType.Command);
        esika.setCommander(true); me.addCommander(esika);
        for (int i = 0; i < 6; i++) ExilePermissionsTest.add(game, "Forest", me, ZoneType.Battlefield);
        return esika;
    }

    /** The publisher thread used to run the castable check itself and crash the game thread mid static effects. */
    @Test public void publishingStateNeverRebuildsStaticEffectsBesideTheGameThread() throws Exception {
        Game game = CommanderEngineTest.game(2); Player me = game.getPlayers().get(0);
        commander(game, me);
        AtomicBoolean stop = new AtomicBoolean();
        AtomicReference<Throwable> failure = new AtomicReference<>();
        Thread publisher = new Thread(() -> {
            try { while (!stop.get()) StateJson.game(game.getView(), me.getId(), game); }
            catch (Throwable t) { failure.compareAndSet(null, t); }
        });
        publisher.start();
        try {
            long until = System.nanoTime() + 3_000_000_000L;
            while (System.nanoTime() < until && failure.get() == null) game.getAction().checkStaticAbilities(false);
        } catch (Throwable t) { failure.compareAndSet(null, t); }
        finally { stop.set(true); publisher.join(); }
        if (failure.get() != null) throw new AssertionError("concurrent static effects", failure.get());
    }

    /** The game thread computes it for the open priority prompt; the publisher shows it only for that prompt. */
    @Test public void castableBelongsToThePriorityPromptItWasComputedFor() throws Exception {
        Game game = CommanderEngineTest.game(2); Player me = game.getPlayers().get(0);
        Card esika = commander(game, me);
        assertTrue("back face castable from the command zone", Castable.compute(me).contains(esika.getId()));
        var human = new PlayerControllerHuman(game, me, new LobbyPlayerHuman("Test"));
        me.dangerouslySetController(human);
        var stack = InputQueue.class.getDeclaredField("inputStack"); stack.setAccessible(true);
        @SuppressWarnings("unchecked") var inputs = (BlockingDeque<InputSynchronized>) stack.get(human.getInputQueue());
        var prompt = new InputPassPriority(human);
        inputs.push(prompt);
        assertEquals("nothing computed yet", 0, StateJson.game(game.getView(), me.getId(), game).getAsJsonArray("castable").size());
        Castable.refresh(me, prompt);
        assertEquals(esika.getId(), StateJson.game(game.getView(), me.getId(), game).getAsJsonArray("castable").get(0).getAsInt());
        inputs.pop(); inputs.push(new InputPassPriority(human));
        assertEquals("stale for a new prompt", 0, StateJson.castable(game, me.getId()).size());
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, game.getPlayers().get(1));
        Castable.refresh(me, Castable.currentInput(me));
        assertEquals("only with priority", 0, StateJson.castable(game, me.getId()).size());
    }

    /** Reductions show on the hand: Goblin Electromancer makes Divination {1}{U}; Bolt has nothing generic to reduce. */
    @Test public void handCardsCarryTheirCurrentCostWhenItChanged() {
        Game game = TestGames.empty(); Player me = game.getPlayers().get(0);
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, me);
        Card divination = TestGames.add(game, "Divination", me, ZoneType.Hand);
        Card bolt = TestGames.add(game, "Lightning Bolt", me, ZoneType.Hand);
        Card bears = TestGames.add(game, "Grizzly Bears", me, ZoneType.Hand);
        Card fireball = TestGames.add(game, "Fireball", me, ZoneType.Hand);
        assertTrue("nothing changes the printed cost", Castable.handCosts(me).isEmpty());
        TestGames.add(game, "Goblin Electromancer", me, ZoneType.Battlefield);
        game.getAction().checkStaticAbilities(false);
        var costs = Castable.handCosts(me);
        assertEquals("{1}{U}", costs.get(divination.getId()).cost());
        assertEquals(-1, costs.get(divination.getId()).delta());
        assertNull("{R} has no generic part", costs.get(bolt.getId()));
        assertNull("creatures are not reduced", costs.get(bears.getId()));
        assertNull("X costs are only known when cast", costs.get(fireball.getId()));
    }
}
