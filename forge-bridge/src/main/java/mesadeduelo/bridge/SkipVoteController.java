package mesadeduelo.bridge;

import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
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
 * Pular o turno de quem caiu numa sala em rede: a votação ({type:"skip-vote"}), os assentos aprovados e o piloto
 * automático que passa a vez por eles. Tudo sob o lock {@link #approved}; ordem dos locks: Rooms → Session → este.
 */
final class SkipVoteController {
    private final Session session;
    /** Votação aberta para pular o turno de quem caiu, e os assentos com o turno já aprovado para pular. */
    private SkipVote vote;
    private final Set<Integer> approved = new HashSet<>();
    /** Assentos aprovados cujo turno já começou: quando o turno passar para outro, a aprovação acaba. */
    private final Set<Integer> turnStarted = new HashSet<>();

    SkipVoteController(Session session) { this.session = session; }

    /** O turno deste assento está sendo pulado: a ponte passa por ele, e os prompts não guardam retrato para o Desfazer. */
    boolean approved(int seat) { synchronized (approved) { return approved.contains(seat); } }

    /** Assentos que podem votar agora: conectados, ainda no jogo e diferentes do alvo. */
    private Set<Integer> voters(int target) {
        Set<Integer> voters = new LinkedHashSet<>();
        for (Seat each : session.seats) if (each.index != target && each.channel != null && each.me != null && !each.eliminated()) voters.add(each.index);
        return voters;
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
        if (target == null || target == voter || target.channel != null || target.eliminated() || target.departed) {
            voter.send(Session.toast("error", "Só dá para votar para pular o turno de um jogador desconectado.")); return;
        }
        boolean value = !msg.has("value") || msg.get("value").getAsBoolean();
        synchronized (approved) {
            if (approved.contains(target.index)) return;
            if (vote != null && vote.target != target.index) {
                voter.send(Session.toast("error", "Já há uma votação aberta. Espere ela terminar.")); return;
            }
            boolean opened = vote == null;
            if (opened) vote = new SkipVote(target.index);
            vote.vote(voter.index, value);
            if (opened) for (Seat each : session.seats) if (each != voter && each != target)
                each.send(Session.toast("toast", voter.name + " abriu uma votação para pular o turno de " + target.name + "."));
            settle();
        }
        session.markDirty();
    }

    /** Fecha a votação se já há maioria (ou se ela ficou impossível). Chamado com o lock de {@link #approved}. */
    private void settle() {
        if (vote == null) return;
        Seat target = session.seats[vote.target];
        if (target.channel != null) { vote = null; return; }
        SkipVote.Result r = vote.result(voters(vote.target));
        if (r == SkipVote.Result.OPEN) return;
        vote = null;
        if (r == SkipVote.Result.APPROVED) {
            approved.add(target.index);
            session.broadcast(Session.toast("toast", "Aprovado: o turno de " + target.name + " será pulado."));
        } else session.broadcast(Session.toast("toast", "A votação para pular o turno de " + target.name + " não passou."));
    }

    /** A cada tick: quem voltou cancela tudo; quem foi aprovado tem o turno passado pela ponte. */
    void tick() {
        if (!session.isRoom()) return;
        boolean changed = false;
        synchronized (approved) {
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
                boolean back = seat.channel != null, gone = seat.eliminated() || gv == null || gv.isGameOver();
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
            if (vote == null && approved.isEmpty()) return null;
            JsonObject o = new JsonObject();
            if (vote != null) {
                Seat target = session.seats[vote.target];
                Set<Integer> voters = voters(vote.target);
                JsonObject v = new JsonObject();
                if (target.me != null) v.addProperty("target", target.me.getId());
                v.addProperty("name", target.name);
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
            return o;
        }
    }
}
