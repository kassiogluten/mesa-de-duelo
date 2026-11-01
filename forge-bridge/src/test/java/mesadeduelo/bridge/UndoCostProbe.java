package mesadeduelo.bridge;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import com.google.common.eventbus.Subscribe;
import forge.ai.LobbyPlayerAi;
import forge.deck.Deck;
import forge.game.Game;
import forge.game.GameEndReason;
import forge.game.Match;
import forge.game.event.GameEventPlayerPriority;
import forge.game.event.GameEventTurnBegan;
import forge.game.player.RegisteredPlayer;
import forge.game.undo.GameMemento;
import org.junit.Assume;
import org.junit.BeforeClass;
import org.junit.Test;

/**
 * Medição, não é teste de regra: quanto custa o Desfazer (sempre ligado) guardar um retrato do jogo a cada prioridade
 * de quem joga, em partidas IA x IA de 15 turnos (Commander com 4 e com 1 "humano", Pauper 1x1). Fica de fora do
 * {@code mvn test} normal; para rodar: {@code mvn test -Dforge.dir=... -Dtest=UndoCostProbe -Dmesa.medir=true}.
 */
public class UndoCostProbe {
    @BeforeClass public static void engine() {
        Assume.assumeTrue("Só com -Dmesa.medir=true", Boolean.getBoolean("mesa.medir"));
        BridgeRulesTest.engine();
    }

    static long used() {
        Runtime r = Runtime.getRuntime();
        for (int i = 0; i < 4; i++) { System.gc(); try { Thread.sleep(80); } catch (InterruptedException e) { } }
        return r.totalMemory() - r.freeMemory();
    }

    @Test public void commanderFourPlayers() throws Exception {
        for (String[] ids : List.of(new String[]{"commander-atraxa", "commander-goblins", "commander-elfos", "commander-zumbis"},
                                    new String[]{"commander-fichas", "commander-dragoes", "commander-muldrotha", "commander-voadores"}))
            { run(ids, 14, 4); run(ids, 14, 1); }
        run(new String[]{"pauper-brasa", "pauper-floresta"}, 14, 1);
    }

    static int seat(Game g, GameEventPlayerPriority e) { for (int i = 0; i < g.getPlayers().size(); i++) if (g.getPlayers().get(i).getId() == e.priority().getId()) return i; return 99; }

    void run(String[] ids, int turns, int humans) throws Exception {
        boolean cmd = ids.length > 2;
        MatchConfig config = cmd ? new MatchConfig("commander", "bo1", ids.length) : new MatchConfig("pauper", "bo1");
        long base = used();
        List<RegisteredPlayer> players = new ArrayList<>();
        for (int i = 0; i < ids.length; i++) {
            Deck d = Decks.build(ids[i]);
            players.add((cmd ? RegisteredPlayer.forCommander(d) : new RegisteredPlayer(d)).setPlayer(new LobbyPlayerAi("IA " + i, null)));
        }
        Match match = new Match(config.rules(), players, "Custo");
        Game game = match.createGame();
        game.setNoGUIUser();
        AtomicReference<GameMemento.Recorder> recorder = new AtomicReference<>(new GameMemento.Recorder());
        ArrayDeque<GameMemento> kept = new ArrayDeque<>();
        List<Long> times = new ArrayList<>();
        int[] objects = {0};
        game.subscribeToEvents(new Object() {
            @Subscribe public void turn(GameEventTurnBegan e) { if (e.turnNumber() > turns) game.setGameOver(GameEndReason.Draw); }
            @Subscribe public void priority(GameEventPlayerPriority e) {
                if (game.isGameOver() || e.priority() == null || seat(game, e) >= humans) return;
                long t0 = System.nanoTime();
                GameMemento m = recorder.get().capture(game);
                times.add(System.nanoTime() - t0);
                objects[0] = Math.max(objects[0], m.objectCount());
                kept.push(m);
                while (kept.size() > UndoHistory.MAX) kept.removeLast();
            }
        });
        AtomicReference<Throwable> error = new AtomicReference<>();
        long g0 = System.nanoTime();
        Thread t = new Thread(() -> { try { match.startGame(game); } catch (Throwable e) { error.set(e); } }, "Game custo");
        t.start(); t.join(600_000);
        long gameNs = System.nanoTime() - g0;
        if (error.get() != null) throw new AssertionError(error.get());
        long withHistory = used();
        int n = kept.size();
        kept.clear();
        // O registro do Recorder segura o último retrato de cada objeto: soltá-lo também.
        recorder.set(null);
        long without = used();
        double gameMb = (without - base) / 1048576.0;
        long[] sorted = times.stream().mapToLong(Long::longValue).sorted().toArray();
        long total = Arrays.stream(sorted).sum();
        System.out.printf("UNDO-COST humanos=%d decks=%s turnos=%d capturas=%d objetos(max)=%d | média=%.2f ms p50=%.2f p95=%.2f max=%.2f | total=%.0f ms de %.0f ms de partida (%.1f%%) | memória: %d retratos + registro = %.1f MB (partida sem histórico: %.1f MB)%n", humans,
            String.join(",", ids), game.getPhaseHandler().getTurn(), sorted.length, objects[0],
            total / 1e6 / sorted.length, sorted[sorted.length / 2] / 1e6, sorted[(int) (sorted.length * .95)] / 1e6, sorted[sorted.length - 1] / 1e6,
            total / 1e6, gameNs / 1e6, 100.0 * total / gameNs, n, (withHistory - without) / 1048576.0, gameMb);
    }
}
