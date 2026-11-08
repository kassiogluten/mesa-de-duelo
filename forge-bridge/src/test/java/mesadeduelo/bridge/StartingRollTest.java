package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.event.GameEventFlipCoin;
import forge.game.player.Player;
import org.junit.BeforeClass;
import org.junit.Test;

/** O d6 de quem começa (item 112): rodadas, desempate só entre os empatados e o evento para a mesa. */
public class StartingRollTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    /** Um Random que devolve os números dados, para montar empates (nextInt(6) + 1 = o valor). */
    private static Random dice(int... values) {
        return new Random() {
            int i;
            @Override public int nextInt(int bound) { return values[i++ % values.length] - 1; }
        };
    }

    @Test public void onlyTheTiedPlayersRollAgainUntilOneIsLeft() {
        // Rodada 1: 0→6, 1→2, 2→6, 3→6; rodada 2 (0, 2, 3): 4, 5, 5; rodada 3 (2, 3): 3, 1.
        List<List<int[]>> rounds = StartingRoll.contest(List.of(0, 1, 2, 3), dice(6, 2, 6, 6, 4, 5, 5, 3, 1));
        assertEquals(3, rounds.size());
        assertEquals(4, rounds.get(0).size());
        assertEquals(List.of(0, 2, 3), rounds.get(1).stream().map(r -> r[0]).toList());
        assertEquals(List.of(2, 3), rounds.get(2).stream().map(r -> r[0]).toList());
        assertEquals(List.of(2), StartingRoll.best(rounds.get(2)));
    }

    @Test public void theRollsAlwaysEndWithTheEngineChoiceWinningAlone() {
        Random random = new Random(7);
        for (int winner = 0; winner < 4; winner++) for (int i = 0; i < 200; i++) {
            List<List<int[]>> rounds = StartingRoll.roll(List.of(0, 1, 2, 3), winner, random);
            assertEquals(List.of(winner), StartingRoll.best(rounds.get(rounds.size() - 1)));
            for (List<int[]> round : rounds) for (int[] r : round) assertTrue(r[1] >= 1 && r[1] <= 6);
        }
    }

    /** Condicionar ao vencedor não vicia os números: o vencedor tira 6 tanto quanto numa disputa sem condição. */
    @Test public void conditioningOnTheWinnerKeepsTheDiceHonest() {
        Random random = new Random(11);
        int n = 20_000;
        Map<Integer, Integer> free = new HashMap<>(), conditioned = new HashMap<>();
        for (int i = 0; i < n; i++) {
            List<List<int[]>> a = StartingRoll.contest(List.of(0, 1), random);
            int winner = StartingRoll.best(a.get(a.size() - 1)).get(0);
            free.merge(a.get(0).stream().filter(r -> r[0] == winner).findFirst().get()[1], 1, Integer::sum);
            List<List<int[]>> b = StartingRoll.roll(List.of(0, 1), 0, random);
            conditioned.merge(b.get(0).get(0)[1], 1, Integer::sum);
        }
        for (int face = 1; face <= 6; face++) {
            double f = free.getOrDefault(face, 0) / (double) n, c = conditioned.getOrDefault(face, 0) / (double) n;
            assertEquals("face " + face, f, c, 0.02);
        }
    }

    @Test public void theStartingTossBecomesTheDiceOfEveryPlayer() {
        Game game = CommanderEngineTest.game(4);
        Player chooser = game.getPlayers().get(2);
        VisibleEvents events = new VisibleEvents(() -> {}, () -> 1);
        events.attach(game);
        game.fireEvent(new GameEventFlipCoin(chooser.getView(), true, true));
        JsonArray all = events.json(0);
        assertEquals(1, all.size());
        JsonObject e = all.get(0).getAsJsonObject();
        assertEquals("starting-roll", e.get("type").getAsString());
        assertEquals(chooser.getId(), e.get("actor").getAsInt());
        JsonArray rounds = e.getAsJsonArray("rolls");
        assertEquals("todos rolam na primeira rodada", 4, rounds.get(0).getAsJsonArray().size());
        JsonArray last = rounds.get(rounds.size() - 1).getAsJsonArray();
        int best = 0, winner = -1, ties = 0;
        for (var r : last) {
            int roll = r.getAsJsonObject().get("roll").getAsInt();
            if (roll > best) { best = roll; winner = r.getAsJsonObject().get("player").getAsInt(); ties = 1; }
            else if (roll == best) ties++;
        }
        assertEquals(1, ties);
        assertEquals(chooser.getId(), winner);
    }
}
