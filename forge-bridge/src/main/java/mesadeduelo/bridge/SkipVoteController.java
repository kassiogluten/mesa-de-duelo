package mesadeduelo.bridge;

import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.game.GameView;
import forge.game.card.CardView;
import forge.game.player.PlayerView;
import forge.gamemodes.match.HostedMatch;
import forge.gamemodes.match.input.InputAttack;
import forge.gamemodes.match.input.InputBlock;
import forge.gamemodes.match.input.InputConfirm;
import forge.gamemodes.match.input.InputConfirmMulligan;
import forge.gamemodes.match.input.InputPassPriority;
import forge.gamemodes.match.input.InputPayMana;
import forge.interfaces.IGameController;
import forge.player.PlayerControllerHuman;

/**
 * Pular o turno de quem caiu numa sala em rede, ou a vez de quem a mesa espera há mais de 2 minutos: a votação
 * ({type:"skip-vote"}), os assentos aprovados e o piloto automático que passa a vez por eles. Tudo sob o lock {@link #approved}; ordem dos locks: Rooms → Session → este.
 */
final class SkipVoteController {
    private final Session session;
    /** Votação aberta para pular o turno de quem caiu, e os assentos com o turno já aprovado para pular. */
    private SkipVote vote;
    private final Set<Integer> approved = new HashSet<>();
    /** Assentos aprovados cujo turno já começou: quando o turno passar para outro, a aprovação acaba. */
    private final Set<Integer> turnStarted = new HashSet<>();
    /**
     * Quanto a mesa espera uma decisão antes de dar para votar para pular a vez de quem demora: os 2 min do "Demorando…"
     * da mesa (waitAlert.ts). MESA_SLOW_MS muda o prazo, só para os testes de partida não esperarem 2 min.
     */
    static final long SLOW_MS = slowMs();

    private static long slowMs() {
        try { String v = System.getenv("MESA_SLOW_MS"); return v == null || v.isBlank() ? 120_000 : Long.parseLong(v.trim()); }
        catch (NumberFormatException e) { return 120_000; }
    }
    /** Aprovados por demora (conectados): a vez é pulada só até o fim do turno em que a votação passou, guardado aqui. */
    private final Map<Integer, Integer> slowUntilTurn = new HashMap<>();
    /** Quem já passou de {@link #SLOW_MS}, para publicar o estado quando alguém entra ou sai da lista. */
    private Set<Integer> slowSeats = Set.of();

    SkipVoteController(Session session) { this.session = session; }

    /** O turno deste assento está sendo pulado: a ponte passa por ele, e os prompts não guardam retrato para o Desfazer. */
    boolean approved(int seat) { synchronized (approved) { return approved.contains(seat); } }

    /** Assentos que podem votar agora: conectados, ainda no jogo e diferentes do alvo. */
    private Set<Integer> voters(int target) {
        Set<Integer> voters = new LinkedHashSet<>();
        for (Seat each : session.seats) if (each.index != target && each.channel != null && each.me != null && !each.eliminated()) voters.add(each.index);
        return voters;
    }

    /** Conectado, ainda no jogo, e a mesa espera a decisão dele há mais de {@link #SLOW_MS}. */
    private static boolean slow(Seat seat, long now) {
        return seat.channel != null && seat.me != null && !seat.eliminated() && seat.waitedNow(now) >= SLOW_MS;
    }

    /** Dá para votar contra este assento pelo motivo da votação: caiu (desconectado) ou está demorando. */
    private static boolean eligible(Seat target, boolean slow, long now) {
        if (target.eliminated() || target.departed) return false;
        return slow ? slow(target, now) : target.channel == null;
    }

    private Seat seatOfPlayer(int playerId) {
        for (Seat each : session.seats) if (each.me != null && each.me.getId() == playerId) return each;
        return null;
    }

    /** {type:"skip-vote", target: id do jogador, value: true|false}. Abre a votação ou registra o voto. */
    void vote(Seat voter, JsonObject msg) {
        if (!session.isRoom() || !session.started() || !"playing".equals(session.matchPhase) || voter.channel == null || voter.eliminated()) return;
        if (!msg.has("target")) return;
        Seat target = seatOfPlayer(ClientActions.exactInt(msg.get("target")));
        long now = System.currentTimeMillis();
        boolean slow = target != null && target.channel != null;
        if (target == null || target == voter || !eligible(target, slow, now)) {
            voter.send(Session.toast("error", "Só dá para votar para pular a vez de quem caiu ou de quem a mesa espera há mais de 2 minutos.")); return;
        }
        boolean value = !msg.has("value") || msg.get("value").getAsBoolean();
        synchronized (approved) {
            if (approved.contains(target.index)) return;
            if (vote != null && vote.target != target.index) {
                voter.send(Session.toast("error", "Já há uma votação aberta. Espere ela terminar.")); return;
            }
            boolean opened = vote == null;
            if (opened) vote = new SkipVote(target.index, slow);
            vote.vote(voter.index, value);
            if (opened) for (Seat each : session.seats) if (each != voter)
                each.send(Session.toast("toast", each == target ? voter.name + " abriu uma votação para pular a sua vez: a mesa espera você há mais de 2 minutos."
                    : voter.name + " abriu uma votação para pular " + (slow ? "a vez" : "o turno") + " de " + target.name + "."));
            settle();
        }
        session.markDirty();
    }

    /** Fecha a votação se já há maioria (ou se ela ficou impossível). Chamado com o lock de {@link #approved}. */
    private void settle() {
        if (vote == null) return;
        Seat target = session.seats[vote.target];
        boolean slow = vote.slow;
        // Quem voltou (ou, demorando, decidiu) derruba a votação.
        if (!eligible(target, slow, System.currentTimeMillis())) {
            vote = null;
            if (slow && !target.eliminated()) session.broadcast(Session.toast("toast", target.name + " jogou, e a votação para pular a vez foi encerrada."));
            return;
        }
        SkipVote.Result r = vote.result(voters(vote.target));
        if (r == SkipVote.Result.OPEN) return;
        vote = null;
        if (r == SkipVote.Result.APPROVED) {
            approved.add(target.index);
            if (slow) {
                HostedMatch m = session.match;
                GameView gv = m == null ? null : m.getGameView();
                slowUntilTurn.put(target.index, gv == null ? -1 : gv.getTurn());
                session.broadcast(Session.toast("toast", "Aprovado: a mesa passa a vez de " + target.name + " até o fim deste turno."));
            } else session.broadcast(Session.toast("toast", "Aprovado: o turno de " + target.name + " será pulado."));
        } else session.broadcast(Session.toast("toast", "A votação para pular " + (slow ? "a vez" : "o turno") + " de " + target.name + " não passou."));
    }

    /** A cada tick: quem voltou cancela tudo; quem foi aprovado tem o turno passado pela ponte. */
    void tick() {
        if (!session.isRoom()) return;
        boolean changed = false;
        long now = System.currentTimeMillis();
        Set<Integer> slowNow = new HashSet<>();
        if (session.started() && "playing".equals(session.matchPhase)) for (Seat each : session.seats) if (slow(each, now)) slowNow.add(each.index);
        synchronized (approved) {
            if (!slowNow.equals(slowSeats)) { slowSeats = Set.copyOf(slowNow); changed = true; }
            if (vote != null) {
                SkipVote before = vote;
                settle();
                changed |= vote != before;
            }
            if (approved.isEmpty()) { if (changed) session.markDirty(); return; }
            HostedMatch m = session.match;
            GameView gv = m == null ? null : m.getGameView();
            PlayerView active = gv == null ? null : gv.getPlayerTurn();
            for (Integer index : List.copyOf(approved)) {
                Seat seat = session.seats[index];
                boolean gone = seat.eliminated() || gv == null || gv.isGameOver();
                Integer slowTurn = slowUntilTurn.get(index);
                if (slowTurn != null) {
                    // Demorando: a mesa passa a vez até o turno da votação acabar, mesmo com a pessoa conectada.
                    boolean over = gv != null && gv.getTurn() != slowTurn;
                    if (gone || over) {
                        approved.remove(index); slowUntilTurn.remove(index); changed = true;
                        if (over && !gone) session.broadcast(Session.toast("toast", seat.name + " volta a jogar normalmente."));
                        continue;
                    }
                    autopilot(seat);
                    continue;
                }
                boolean back = seat.channel != null;
                boolean theirTurn = active != null && seat.me != null && active.getId() == seat.me.getId();
                if (theirTurn) turnStarted.add(index);
                boolean turnOver = turnStarted.contains(index) && !theirTurn;
                if (back || gone || turnOver) {
                    approved.remove(index); turnStarted.remove(index); changed = true;
                    if (turnOver && !back && !gone) session.broadcast(Session.toast("toast", "O turno de " + seat.name + " foi pulado."));
                    if (back) session.broadcast(Session.toast("toast", seat.name + " voltou e joga normalmente."));
                    continue;
                }
                autopilot(seat);
            }
        }
        if (changed) session.markDirty();
    }

    /**
     * Passa a vez pelo jogador desconectado, sem jogar nada: responde perguntas com a escolha padrão, passa a
     * prioridade, não ataca nem bloqueia e, na limpeza, descarta as primeiras cartas que o Forge oferecer.
     */
    private void autopilot(Seat seat) {
        QuestionBroker.Question q = seat.question;
        if (q != null) { if (!q.answer().isDone()) q.answer().complete(QuestionBroker.defaultAnswer(q)); return; }
        if (!(seat.controller() instanceof PlayerControllerHuman human)) return;
        Object input = human.getInputQueue().getInput();
        if (input == null) return;
        int gen = seat.inputGen.get();
        long now = System.currentTimeMillis();
        if (seat.autopilotGen == gen && now - seat.autopilotAt < 1200) return;
        seat.autopilotGen = gen; seat.autopilotAt = now;
        if (input instanceof InputPayMana) { if (seat.cancelEnabled) seat.onEdt(gen, IGameController::selectButtonCancel); return; }
        boolean passes = input instanceof InputPassPriority || input instanceof InputAttack || input instanceof InputBlock
            || input instanceof InputConfirm || input instanceof InputConfirmMulligan;
        if (!passes && !seat.okEnabled && !seat.selectable.isEmpty()) {
            CardView cv = session.actions.findCard(seat, seat.selectable.iterator().next());
            if (cv != null) { seat.onEdt(gen, c -> c.selectCard(cv, null, null)); return; }
        }
        if (seat.okEnabled) seat.onEdt(gen, IGameController::selectButtonOk);
        else if (seat.cancelEnabled) seat.onEdt(gen, IGameController::selectButtonCancel);
    }

    /** Para a mesa: a votação aberta, como está e o voto deste assento; e quem já tem o turno aprovado para pular. */
    JsonObject json(Seat seat) {
        if (!session.isRoom()) return null;
        synchronized (approved) {
            if (vote == null && approved.isEmpty() && slowSeats.isEmpty()) return null;
            JsonObject o = new JsonObject();
            if (vote != null) {
                Seat target = session.seats[vote.target];
                Set<Integer> voters = voters(vote.target);
                JsonObject v = new JsonObject();
                if (target.me != null) v.addProperty("target", target.me.getId());
                v.addProperty("name", target.name);
                if (vote.slow) v.addProperty("slow", true);
                v.addProperty("yes", vote.yes.size());
                v.addProperty("no", vote.no.size());
                v.addProperty("voters", voters.size());
                v.addProperty("needed", SkipVote.needed(voters.size()));
                v.addProperty("canVote", voters.contains(seat.index));
                if (vote.yes.contains(seat.index)) v.addProperty("mine", "yes");
                else if (vote.no.contains(seat.index)) v.addProperty("mine", "no");
                o.add("vote", v);
            }
            JsonArray skipping = new JsonArray();
            for (Integer index : approved) if (session.seats[index].me != null) skipping.add(session.seats[index].me.getId());
            o.add("skipping", skipping);
            JsonArray slowList = new JsonArray();
            for (Integer index : slowSeats) if (session.seats[index].me != null && !approved.contains(index)) slowList.add(session.seats[index].me.getId());
            if (!slowList.isEmpty()) o.add("slow", slowList);
            return o;
        }
    }
}
