package mesadeduelo.bridge;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import com.google.common.eventbus.Subscribe;
import forge.ai.AvailableActions;
import forge.ai.LobbyPlayerAi;
import forge.deck.Deck;
import forge.game.Game;
import forge.game.GameEndReason;
import forge.game.Match;
import forge.game.combat.Combat;
import forge.game.event.GameEventPlayerPriority;
import forge.game.event.GameEventTurnBegan;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.RegisteredPlayer;
import forge.game.undo.GameMemento;
import org.junit.Assume;
import org.junit.BeforeClass;
import org.junit.Test;

/**
 * Medição, não é teste de regra: quanto custa o Desfazer (sempre ligado), em partidas IA x IA de 15 turnos (Commander
 * com 4 e com 1 "humano", Pauper 1x1). Mede o jeito antigo ("antes": um retrato inteiro a cada prioridade de quem conta
 * como humano, até 60) e o atual ("agora": o {@link UndoHistory} da ponte, só nas prioridades em que um jogador no nível
 * padrão "Só com ações" veria o prompt, só o turno atual e o anterior, e os retratos antigos guardados como diferença).
 * Fica de fora do {@code mvn test} normal; para rodar:
 * {@code mvn test -Dforge.dir=... -Dtest=UndoCostProbe -Dmesa.medir=true}.
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
        for (boolean now : new boolean[]{false, true}) {
            for (String[] ids : List.of(new String[]{"commander-atraxa", "commander-goblins", "commander-elfos", "commander-zumbis"},
                                        new String[]{"commander-fichas", "commander-dragoes", "commander-muldrotha", "commander-voadores"}))
                { run(ids, 14, 4, now); run(ids, 14, 1, now); }
            run(new String[]{"pauper-brasa", "pauper-floresta"}, 14, 1, now);
        }
    }

    static int seat(Game g, Player p) { for (int i = 0; i < g.getPlayers().size(); i++) if (g.getPlayers().get(i).getId() == p.getId()) return i; return 99; }

    /**
     * Um jogador no nível padrão veria este pedido de prioridade? O Forge passa sozinho quando não há nenhuma ação
     * e, com a pilha vazia, nas etapas que a mesa pula ({@link WebGuiGame#isUiSetToSkipPhase}).
     */
    static boolean prompts(Game g, Player p) {
        var ph = g.getPhaseHandler();
        PhaseType phase = ph.getPhase();
        if (g.getStack().isEmpty()) {
            boolean mine = ph.getPlayerTurn() == p;
            Combat combat = ph.getCombat();
            boolean skip = mine ? !WebGuiGame.STOPS_MINE.contains(phase)
                : !WebGuiGame.STOPS_THEIRS.contains(phase) || (phase == PhaseType.COMBAT_DECLARE_ATTACKERS && (combat == null || combat.getAttackers().isEmpty()));
            if (skip) return false;
        }
        return AvailableActions.compute(p, 1500);
    }

    void run(String[] ids, int turns, int humans, boolean now) throws Exception {
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
        AtomicReference<UndoHistory> history = new AtomicReference<>(new UndoHistory());
        List<Long> times = new ArrayList<>(), shrink = new ArrayList<>();
        int[] objects = {0}, priorities = {0}, keptMax = {0};
        long[] deltas = {0, 0};
        game.subscribeToEvents(new Object() {
            @Subscribe public void turn(GameEventTurnBegan e) { if (e.turnNumber() > turns) game.setGameOver(GameEndReason.Draw); }
            @Subscribe public void priority(GameEventPlayerPriority e) {
                if (game.isGameOver() || e.priority() == null) return;
                Player p = game.getPlayer(e.priority());
                if (p == null || seat(game, p) >= humans) return;
                priorities[0]++;
                if (!now) {
                    long t0 = System.nanoTime();
                    GameMemento m = recorder.get().capture(game);
                    times.add(System.nanoTime() - t0);
                    objects[0] = Math.max(objects[0], m.objectCount());
                    kept.push(m);
                    while (kept.size() > UndoHistory.MAX) kept.removeLast();
                    return;
                }
                if (!prompts(game, p)) return;
                UndoHistory h = history.get();
                long t0 = System.nanoTime();
                UndoHistory.Step step = h.capture(game, p);
                long t1 = System.nanoTime();
                h.decided(step, null);
                long t2 = System.nanoTime();
                times.add(t2 - t0);
                shrink.add(t2 - t1);
                objects[0] = Math.max(objects[0], step.picture().full.objectCount());
                if (h.size() > 1) { deltas[0] += h.entries() - step.picture().full.objectCount(); deltas[1] += h.size() - 1; }
                keptMax[0] = Math.max(keptMax[0], h.size());
            }
        });
        AtomicReference<Throwable> error = new AtomicReference<>();
        long g0 = System.nanoTime();
        Thread t = new Thread(() -> { try { match.startGame(game); } catch (Throwable e) { error.set(e); } }, "Game custo");
        t.start(); t.join(600_000);
        long gameNs = System.nanoTime() - g0;
        if (error.get() != null) throw new AssertionError(error.get());
        long withHistory = used();
        int n = now ? history.get().size() : kept.size();
        long entries = now ? history.get().entries() : 0;
        kept.clear();
        // O registro do Recorder segura o último retrato de cada objeto: soltá-lo também.
        recorder.set(null);
        history.get().clear();
        long without = used();
        double gameMb = (without - base) / 1048576.0;
        long[] sorted = times.stream().mapToLong(Long::longValue).sorted().toArray();
        if (sorted.length == 0) sorted = new long[]{0};
        long total = Arrays.stream(sorted).sum();
        double shrinkMs = shrink.stream().mapToLong(Long::longValue).average().orElse(0) / 1e6;
        System.out.printf("UNDO-COST %s humanos=%d decks=%s turnos=%d prioridades=%d capturas=%d | média=%.2f ms (diferença %.2f) p50=%.2f p95=%.2f max=%.2f | total=%.0f ms de %.0f ms de partida (%.1f%%) | objetos(max)=%d, diferença média=%d pares | memória: %d retratos (máx %d, %d pares) + registro = %.1f MB (partida sem histórico: %.1f MB)%n",
            now ? "agora" : "antes", humans, String.join(",", ids), game.getPhaseHandler().getTurn(), priorities[0], times.size(),
            total / 1e6 / sorted.length, shrinkMs, sorted[sorted.length / 2] / 1e6, sorted[(int) (sorted.length * .95)] / 1e6, sorted[sorted.length - 1] / 1e6,
            total / 1e6, gameNs / 1e6, 100.0 * total / gameNs, objects[0], deltas[1] == 0 ? 0 : deltas[0] / deltas[1], n, now ? keptMax[0] : n, entries, (withHistory - without) / 1048576.0, gameMb);
    }
}
