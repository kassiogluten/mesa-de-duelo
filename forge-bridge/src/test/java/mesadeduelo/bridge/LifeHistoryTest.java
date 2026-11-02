package mesadeduelo.bridge;

import static org.junit.Assert.*;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.event.GameEventTurnBegan;
import forge.game.player.Player;
import org.junit.BeforeClass;
import org.junit.Test;

public class LifeHistoryTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static JsonObject over(Game game, int turn, boolean gameOver) {
        JsonObject state = new JsonObject();
        state.addProperty("gameOver", gameOver);
        state.addProperty("turn", turn);
        JsonArray players = new JsonArray();
        for (Player p : game.getRegisteredPlayers()) { JsonObject o = new JsonObject(); o.addProperty("id", p.getId()); o.addProperty("life", p.getLife()); players.add(o); }
        state.add("players", players);
        return state;
    }
    private static int life(JsonArray history, int index, Player p) { return history.get(index).getAsJsonObject().getAsJsonObject("life").get(String.valueOf(p.getId())).getAsInt(); }
    private static int turn(JsonArray history, int index) { return history.get(index).getAsJsonObject().get("turn").getAsInt(); }

    @Test public void lifeAtTheEndOfEachTurnReachesTheStateOnlyWhenTheGameIsOver() {
        Game game = ExilePermissionsTest.game(); Player a = game.getPlayers().get(0), b = game.getPlayers().get(1);
        VisibleEvents events = new VisibleEvents(() -> {}, () -> 1); events.attach(game);
        events.receive(new GameEventTurnBegan(a.getView(), 1));
        b.setLife(17, null);
        events.receive(new GameEventTurnBegan(b.getView(), 2));
        a.setLife(15, null);
        JsonObject playing = over(game, 2, false);
        events.addLifeHistory(playing);
        assertFalse(playing.has("lifeHistory"));

        b.setLife(0, null);
        JsonObject done = over(game, 2, true);
        events.addLifeHistory(done);
        JsonArray history = done.getAsJsonArray("lifeHistory");
        assertEquals(3, history.size());
        assertEquals(0, turn(history, 0)); assertEquals(20, life(history, 0, b));
        assertEquals(1, turn(history, 1)); assertEquals(17, life(history, 1, b)); assertEquals(20, life(history, 1, a));
        assertEquals(2, turn(history, 2)); assertEquals(0, life(history, 2, b)); assertEquals(15, life(history, 2, a));
    }

    @Test public void undoingToAnEarlierTurnRewritesTheTurnsAfterIt() {
        Game game = ExilePermissionsTest.game(); Player a = game.getPlayers().get(0), b = game.getPlayers().get(1);
        VisibleEvents events = new VisibleEvents(() -> {}, () -> 1); events.attach(game);
        events.receive(new GameEventTurnBegan(a.getView(), 1));
        b.setLife(12, null);
        events.receive(new GameEventTurnBegan(b.getView(), 2));
        events.receive(new GameEventTurnBegan(a.getView(), 3));
        // Desfazer volta ao turno 2, e ele acaba com outra vida.
        b.setLife(18, null);
        events.receive(new GameEventTurnBegan(a.getView(), 3));
        JsonObject done = over(game, 3, true);
        events.addLifeHistory(done);
        JsonArray history = done.getAsJsonArray("lifeHistory");
        assertEquals(4, history.size());
        assertEquals(2, turn(history, 2)); assertEquals(18, life(history, 2, b));
        assertEquals(3, turn(history, 3));
    }
}
