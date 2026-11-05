package mesadeduelo.bridge;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

import com.google.common.eventbus.Subscribe;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.GameLogEntryType;
import forge.game.card.Card;
import forge.game.event.GameEventCardStatsChanged;
import forge.game.event.GameEventPlayerStatsChanged;
import forge.game.event.GameEventSnapshotRestored;
import forge.game.event.GameEventTurnBegan;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.undo.GameMemento;

/**
 * Desfazer (sempre ligado, em toda partida): um retrato do jogo antes de cada decisão de prioridade de
 * cada humano, e a volta para o retrato da última decisão de quem pediu, depois que os outros aceitam.
 *
 * Memória: só ficam as decisões do turno atual e do anterior ({@link #TURNS}); só há retrato quando o jogador de fato
 * vai decidir ({@link AskingController#chooseSpellAbilityToPlay}); e só o retrato mais novo fica inteiro, os outros
 * guardam o que muda em relação ao seguinte ({@link MementoDelta}).
 *
 * Usa só o retrato e a restauração do Forge ({@link GameMemento}). O {@code UndoManager} dele fica desligado: ele só
 * deixa o próprio jogador voltar enquanto ninguém mais agiu, e trava com qualquer sorteio do servidor inteiro
 * (o contador do {@code MyRandom} é global), o que numa ponte com várias partidas trava sempre.
 *
 * Tudo que mexe no jogo roda na thread do jogo: {@link #capture} antes do prompt, {@link #decided} depois dele e
 * {@link #applyPending} quando há um pedido aprovado.
 */
final class UndoHistory {
    /** Teto de decisões guardadas, além do limite de turnos; bem mais do que alguém volta numa partida. */
    static final int MAX = 60;
    /** Turnos guardados: o atual e o anterior. O Desfazer volta no máximo até o começo do turno anterior. */
    static final int TURNS = 2;

    /**
     * O retrato de uma decisão: inteiro ({@code full}) no passo mais novo do histórico; nos outros, só a diferença
     * ({@code delta}) para o passo seguinte, mais novo. Mexido só com o lock do histórico.
     */
    static final class Picture {
        GameMemento full;
        MementoDelta delta;
        Picture(GameMemento full) { this.full = full; }
    }

    /** Uma decisão: o jogo logo antes do prompt, quem decidiu e o que fez ("pass", "land", "cast" ou "ability"). */
    record Step(Picture picture, int logSize, Player player, int turn, PhaseType phase, String action, String card) {
        Step decided(String action, String card) { return new Step(picture, logSize, player, turn, phase, action, card); }

        /** "conjurar Raio", "passar a vez na fase principal 1"... para o aviso, o pedido e o histórico. */
        String text() {
            String where = PHASES.getOrDefault(phase, "fase atual");
            return switch (action) {
                case "land" -> "jogar " + card;
                case "cast" -> "conjurar " + card;
                case "ability" -> "ativar " + card;
                default -> "passar a vez " + where;
            };
        }

        JsonObject json() {
            JsonObject o = new JsonObject();
            o.addProperty("action", action);
            if (card != null) o.addProperty("card", card);
            o.addProperty("turn", turn);
            if (phase != null) o.addProperty("phase", phase.name());
            o.addProperty("text", text());
            return o;
        }
    }

    private static final Map<PhaseType, String> PHASES = Map.ofEntries(
        Map.entry(PhaseType.UNTAP, "no início do turno"), Map.entry(PhaseType.UPKEEP, "na manutenção"),
        Map.entry(PhaseType.DRAW, "na compra"), Map.entry(PhaseType.MAIN1, "na fase principal 1"),
        Map.entry(PhaseType.COMBAT_BEGIN, "no início do combate"), Map.entry(PhaseType.COMBAT_DECLARE_ATTACKERS, "na declaração de atacantes"),
        Map.entry(PhaseType.COMBAT_DECLARE_BLOCKERS, "na declaração de bloqueadores"), Map.entry(PhaseType.COMBAT_FIRST_STRIKE_DAMAGE, "no dano de iniciativa"),
        Map.entry(PhaseType.COMBAT_DAMAGE, "no dano de combate"), Map.entry(PhaseType.COMBAT_END, "no fim do combate"),
        Map.entry(PhaseType.MAIN2, "na fase principal 2"), Map.entry(PhaseType.END_OF_TURN, "na etapa final"),
        Map.entry(PhaseType.CLEANUP, "na limpeza"));

    /** Só na thread do jogo (o Recorder não é thread-safe); trocado com o lock quando o jogo muda. */
    private GameMemento.Recorder recorder = new GameMemento.Recorder();
    private final Deque<Step> steps = new ArrayDeque<>();   // a mais recente primeiro
    private Game game;
    /** Pedido aprovado esperando a thread do jogo: volta para este passo. */
    private Step pending;
    /** Quem aceitou o pedido aprovado, para a linha do histórico. */
    private String pendingNote;

    /** Retrato do jogo antes do prompt de prioridade de {@code who}; só entra no histórico em {@link #decided}. */
    Step capture(Game g, Player who) {
        GameMemento.Recorder r;
        synchronized (this) {
            if (g != game) {
                game = g; steps.clear(); pending = null;
                // O registro do Recorder segura o último retrato de cada objeto do jogo anterior: um novo solta tudo.
                recorder = new GameMemento.Recorder();
                g.subscribeToEvents(new Object() {
                    @Subscribe public void turn(GameEventTurnBegan e) { dropBefore(g, e.turnNumber()); }
                });
            }
            r = recorder;
        }
        var ph = g.getPhaseHandler();
        return new Step(new Picture(r.capture(g)), g.getGameLog().size(), who, ph.getTurn(), ph.getPhase(), null, null);
    }

    /** Começou o turno {@code turn}: as decisões de antes do turno anterior saem do histórico. */
    private synchronized void dropBefore(Game g, int turn) {
        if (g != game) return;
        while (!steps.isEmpty() && steps.peekLast().turn() <= turn - TURNS) steps.removeLast();
        // Sem nada guardado, o registro do Recorder (o último retrato de cada objeto, só para reaproveitar) também sai;
        // o próximo retrato sai inteiro, um pouco mais lento.
        if (steps.isEmpty()) recorder = new GameMemento.Recorder();
    }

    /** O jogador respondeu ao prompt: {@code chosen} null é passar; vazio é um prompt reaberto, que não conta. */
    synchronized void decided(Step step, List<SpellAbility> chosen) {
        GameMemento m = step.picture().full;
        if (!m.problems.isEmpty()) Log.bridge().warn("Desfazer: retrato com problemas: " + m.problems);
        if (chosen != null && chosen.isEmpty()) return;
        String action = "pass", card = null;
        if (chosen != null) {
            SpellAbility sa = chosen.get(0);
            Card host = sa.getHostCard();
            action = sa.isLandAbility() ? "land" : sa.isSpell() ? "cast" : "ability";
            card = host == null ? "uma carta" : host.isFaceDown() ? "uma carta virada para baixo" : host.getName();
        }
        Step newer = step.decided(action, card), older = steps.peek();
        steps.push(newer);
        // O passo de antes passa a guardar só o que muda em relação a este.
        if (older != null && MementoDelta.AVAILABLE) {
            older.picture().delta = MementoDelta.of(older.picture().full, m);
            older.picture().full = null;
        }
        while (steps.size() > MAX || steps.peekLast().turn() <= newer.turn() - TURNS) steps.removeLast();
    }

    /** A última decisão do jogador {@code playerId} que ainda dá para desfazer, ou null. */
    synchronized Step lastOf(int playerId) {
        for (Step s : steps) if (s.player().getId() == playerId) return s;
        return null;
    }

    /** Quantos passos estão guardados (testes e medição). */
    synchronized int size() { return steps.size(); }

    /** Quantos pares objeto/retrato o histórico guarda, somando os inteiros e as diferenças (medição). */
    synchronized long entries() {
        long n = 0;
        for (Step s : steps) n += s.picture().full != null ? s.picture().full.objectCount() : s.picture().delta.size();
        return n;
    }

    /** Avisado (na thread do jogo) depois de cada volta, com o passo desfeito. */
    volatile java.util.function.Consumer<Step> undone = step -> { };

    synchronized boolean hasPending() { return pending != null; }

    /** Pedido aprovado: a próxima volta da thread do jogo por um prompt de prioridade restaura {@code target}. */
    synchronized void approve(Step target, String note) { pending = target; pendingNote = note; }

    /** Esquece tudo (jogo novo, fim do jogo). */
    synchronized void clear() { steps.clear(); pending = null; game = null; recorder = new GameMemento.Recorder(); }

    /**
     * Thread do jogo: com um pedido aprovado, volta para o retrato dele e devolve o passo desfeito; sem pedido (ou
     * com o passo já fora do histórico), null. Os passos depois dele saem do histórico junto.
     */
    Step applyPending(Game g) {
        Step target; String note; GameMemento memento;
        synchronized (this) {
            target = pending; note = pendingNote; pending = null;
            if (target == null || g != game || !steps.contains(target)) return null;
            memento = rebuild(target);
            while (steps.peek() != target) steps.pop();
            steps.pop();
        }
        g.fireEvent(new GameEventSnapshotRestored(true));
        memento.restore();
        g.getGameLog().truncateTo(target.logSize());
        if (!memento.problems.isEmpty()) Log.bridge().warn("Desfazer: problemas ao restaurar: " + memento.problems);
        refreshViews(g);
        g.fireEvent(new GameEventSnapshotRestored(false));
        g.getGameLog().add(GameLogEntryType.INFORMATION, target.player().getName() + " desfez: " + target.text() + (note == null ? "." : " (" + note + ")."));
        undone.accept(target);
        return target;
    }

    /**
     * O memento inteiro de {@code target}, remontado do passo mais novo para trás. O passo logo antes dele, que vira o
     * mais novo quando ele e os seguintes saem, volta a ficar inteiro. Com o lock.
     */
    private GameMemento rebuild(Step target) {
        Iterator<Step> it = steps.iterator();
        Step s = it.next();
        GameMemento full = s.picture().full;   // o mais novo está sempre inteiro
        MementoDelta.Builder b = null;          // não nulo quando full é null
        while (s != target) {
            Picture p = (s = it.next()).picture();
            if (p.full != null) { full = p.full; b = null; continue; }
            if (b == null) b = new MementoDelta.Builder(full);
            b.apply(p.delta);
            full = null;
        }
        GameMemento found = full != null ? full : b.build();
        if (it.hasNext()) {
            Picture before = it.next().picture();
            if (before.full == null) {
                if (b == null) b = new MementoDelta.Builder(found);
                before.full = b.apply(before.delta).build();
                before.delta = null;
            }
        }
        return found;
    }

    /** Igual ao UndoManager do Forge: as views e os gatilhos ativos seguem o jogo restaurado. */
    private static void refreshViews(Game g) {
        g.getTriggerHandler().resetActiveTriggers();
        for (Player p : g.getPlayers()) { p.updateAllZonesForView(); p.updateManaForView(); }
        g.updateStackForView(); g.updatePhaseForView(); g.updatePlayerTurnForView();
        g.updateTurnForView(); g.updateCombatForView();
        g.fireEvent(new GameEventCardStatsChanged(g.getCardsInGame()));
        g.fireEvent(new GameEventPlayerStatsChanged(g.getPlayers()));
    }
}
