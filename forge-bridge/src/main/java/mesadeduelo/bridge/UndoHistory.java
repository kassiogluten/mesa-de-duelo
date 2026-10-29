package mesadeduelo.bridge;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Map;

import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.GameLogEntryType;
import forge.game.card.Card;
import forge.game.event.GameEventCardStatsChanged;
import forge.game.event.GameEventPlayerStatsChanged;
import forge.game.event.GameEventSnapshotRestored;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.undo.GameMemento;

/**
 * Desfazer da sala (opção "Desfazer" ao criar a partida): um retrato do jogo antes de cada decisão de prioridade de
 * cada humano, e a volta para o retrato da última decisão de quem pediu, depois que os outros aceitam.
 *
 * Usa só o retrato e a restauração do Forge ({@link GameMemento}). O {@code UndoManager} dele fica desligado: ele só
 * deixa o próprio jogador voltar enquanto ninguém mais agiu, e trava com qualquer sorteio do servidor inteiro
 * (o contador do {@code MyRandom} é global), o que numa ponte com várias partidas trava sempre.
 *
 * Tudo que mexe no jogo roda na thread do jogo: {@link #capture} antes do prompt, {@link #decided} depois dele e
 * {@link #applyPending} quando há um pedido aprovado.
 */
final class UndoHistory {
    /** Quantas decisões ficam guardadas (memória); bem mais do que alguém volta numa partida. */
    static final int MAX = 60;

    /** Uma decisão: o jogo logo antes do prompt, quem decidiu e o que fez ("pass", "land", "cast" ou "ability"). */
    record Step(GameMemento memento, int logSize, Player player, int turn, PhaseType phase, String action, String card) {
        Step decided(String action, String card) { return new Step(memento, logSize, player, turn, phase, action, card); }

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

    private final GameMemento.Recorder recorder = new GameMemento.Recorder();
    private final Deque<Step> steps = new ArrayDeque<>();   // a mais recente primeiro
    private Game game;
    /** Pedido aprovado esperando a thread do jogo: volta para este passo. */
    private Step pending;
    /** Quem aceitou o pedido aprovado, para a linha do histórico. */
    private String pendingNote;

    /** Retrato do jogo antes do prompt de prioridade de {@code who}; só entra no histórico em {@link #decided}. */
    Step capture(Game g, Player who) {
        synchronized (this) { if (g != game) { game = g; steps.clear(); pending = null; } }
        var ph = g.getPhaseHandler();
        return new Step(recorder.capture(g), g.getGameLog().size(), who, ph.getTurn(), ph.getPhase(), null, null);
    }

    /** O jogador respondeu ao prompt: {@code chosen} null é passar; vazio é um prompt reaberto, que não conta. */
    synchronized void decided(Step step, List<SpellAbility> chosen) {
        if (step.memento().problems.size() > 0) System.err.println("Desfazer: retrato com problemas: " + step.memento().problems);
        if (chosen != null && chosen.isEmpty()) return;
        String action = "pass", card = null;
        if (chosen != null) {
            SpellAbility sa = chosen.get(0);
            Card host = sa.getHostCard();
            action = sa.isLandAbility() ? "land" : sa.isSpell() ? "cast" : "ability";
            card = host == null ? "uma carta" : host.isFaceDown() ? "uma carta virada para baixo" : host.getName();
        }
        steps.push(step.decided(action, card));
        while (steps.size() > MAX) steps.removeLast();
    }

    /** A última decisão do jogador {@code playerId} que ainda dá para desfazer, ou null. */
    synchronized Step lastOf(int playerId) {
        for (Step s : steps) if (s.player().getId() == playerId) return s;
        return null;
    }

    /** Avisado (na thread do jogo) depois de cada volta, com o passo desfeito. */
    volatile java.util.function.Consumer<Step> undone = step -> { };

    synchronized boolean hasPending() { return pending != null; }

    /** Pedido aprovado: a próxima volta da thread do jogo por um prompt de prioridade restaura {@code target}. */
    synchronized void approve(Step target, String note) { pending = target; pendingNote = note; }

    /** Esquece tudo (jogo novo, fim do jogo). */
    synchronized void clear() { steps.clear(); pending = null; }

    /**
     * Thread do jogo: com um pedido aprovado, volta para o retrato dele e devolve o passo desfeito; sem pedido (ou
     * com o passo já fora do histórico), null. Os passos depois dele saem do histórico junto.
     */
    Step applyPending(Game g) {
        Step target; String note;
        synchronized (this) {
            target = pending; note = pendingNote; pending = null;
            if (target == null || g != game || !steps.contains(target)) return null;
            while (steps.peek() != target) steps.pop();
            steps.pop();
        }
        g.fireEvent(new GameEventSnapshotRestored(true));
        target.memento().restore();
        g.getGameLog().truncateTo(target.logSize());
        if (!target.memento().problems.isEmpty()) System.err.println("Desfazer: problemas ao restaurar: " + target.memento().problems);
        refreshViews(g);
        g.fireEvent(new GameEventSnapshotRestored(false));
        g.getGameLog().add(GameLogEntryType.INFORMATION, target.player().getName() + " desfez: " + target.text() + (note == null ? "." : " (" + note + ")."));
        undone.accept(target);
        return target;
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
