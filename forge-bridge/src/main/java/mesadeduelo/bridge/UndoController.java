package mesadeduelo.bridge;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.gamemodes.match.input.InputPassPriority;
import forge.gui.FThreads;
import forge.player.PlayerControllerHuman;

/**
 * Desfazer (sempre ligado): os retratos de cada decisão ({@link UndoHistory}) e o pedido aberto, que os outros
 * humanos aceitam ou recusam ({type:"undo-request" | "undo-vote" | "undo-cancel"}). O pedido fica sob {@link #lock};
 * ordem dos locks: Rooms → Session → este.
 */
final class UndoController {
    private final Session session;
    /** Os retratos; vão para o {@link AskingController.Lobby} de cada humano. */
    final UndoHistory history = new UndoHistory();
    private UndoRequest request;
    private final Object lock = new Object();

    UndoController(Session session) {
        this.session = session;
        history.undone = this::undone;
    }

    /** Partida nova ou fim de um jogo: sem retratos nem pedido aberto. */
    void clear() { history.clear(); synchronized (lock) { request = null; } }

    /** Quem precisa aceitar um pedido de {@code requester}: os outros humanos conectados e ainda no jogo. */
    private Set<Integer> voters(int requester) {
        Set<Integer> voters = new LinkedHashSet<>();
        if (session.isLab()) return voters;
        for (Seat each : session.seats) if (each.index != requester && each.channel != null && each.me != null && !each.eliminated()) voters.add(each.index);
        return voters;
    }

    /** {type:"undo-request"}: pede para voltar à última decisão deste assento. Contra a IA, volta na hora. */
    void request(Seat seat) {
        if (!session.started() || !"playing".equals(session.matchPhase) || session.gameOver() || seat.me == null || seat.eliminated()) return;
        synchronized (lock) {
            if (request != null || history.hasPending()) { seat.send(Session.toast("error", "Já há um pedido de desfazer em andamento. Espere ele terminar.")); return; }
            UndoHistory.Step step = history.lastOf(seat.me.getId());
            if (step == null) { seat.send(Session.toast("error", "Ainda não há nada seu para desfazer.")); return; }
            Set<Integer> voters = voters(seat.index);
            if (session.isRoom() && !session.isLab() && voters.isEmpty()) { seat.send(Session.toast("error", "Não há ninguém conectado para aceitar o pedido agora.")); return; }
            request = new UndoRequest(seat.index, step);
            for (Integer v : voters) session.seats[v].send(Session.toast("toast", seat.name + " pediu para desfazer: " + step.text() + "."));
            settle();
        }
        session.markDirty();
    }

    /** {type:"undo-vote", value}: aceitar (true) ou recusar o pedido aberto. */
    void vote(Seat seat, boolean value) {
        synchronized (lock) {
            if (request == null || request.requester == seat.index || !voters(request.requester).contains(seat.index)) return;
            request.vote(seat.index, value);
            settle();
        }
        session.markDirty();
    }

    /** {type:"undo-cancel"}: quem pediu desiste antes de os outros responderem. */
    void cancel(Seat seat) {
        synchronized (lock) {
            if (request == null || request.requester != seat.index) return;
            request = null;
            for (Seat each : session.seats) if (each != seat) each.send(Session.toast("toast", seat.name + " desistiu de desfazer."));
        }
        session.markDirty();
    }

    /** A cada tick: fecha o pedido que já tem resposta (ou que ficou sem sentido). */
    void tick() {
        synchronized (lock) {
            UndoRequest before = request;
            settle();
            if (request != before) session.markDirty();
        }
    }

    /** Fecha o pedido quando todos aceitaram ou alguém recusou. Chamado com o {@link #lock}. */
    private void settle() {
        UndoRequest r = request;
        if (r == null) return;
        Seat requester = session.seats[r.requester];
        if (session.gameOver() || requester.channel == null || requester.eliminated()) { request = null; return; }
        Set<Integer> voters = voters(r.requester);
        UndoRequest.Result result = r.result(voters);
        if (result == UndoRequest.Result.OPEN) return;
        request = null;
        if (result == UndoRequest.Result.REJECTED) {
            List<String> refused = r.no.stream().map(i -> session.seats[i].name).toList();
            requester.send(Session.toast("toast", String.join(" e ", refused) + (refused.size() > 1 ? " recusaram" : " recusou") + " desfazer: " + r.step.text() + "."));
            for (Seat each : session.seats) if (each != requester && !r.no.contains(each.index)) each.send(Session.toast("toast", "O pedido de " + requester.name + " para desfazer foi recusado."));
            return;
        }
        List<String> accepted = r.yes.stream().map(i -> session.seats[i].name).toList();
        history.approve(r.step, accepted.isEmpty() ? null : (accepted.size() > 1 ? "aceito por " + String.join(" e ", accepted) : "aceito por " + accepted.get(0)));
        // Quem está com a prioridade aberta tem o prompt reaberto: o Forge volta para a thread do jogo, que restaura.
        // Em outra escolha (bloqueio, alvo, pergunta), o jogo volta assim que ela terminar e alguém tiver a prioridade.
        for (Seat each : session.seats) if (each.controller() instanceof PlayerControllerHuman human && human.getInputQueue().getInput() instanceof InputPassPriority priority)
            FThreads.invokeInEdtLater(priority::restartPrompt);
    }

    /** Thread do jogo, logo depois de voltar: avisa todo mundo e registra no diário. */
    private void undone(UndoHistory.Step step) {
        Seat requester = null;
        for (Seat each : session.seats) if (each.me != null && each.me.getId() == step.player().getId()) requester = each;
        if (requester != null) session.actions.log(requester, "undo", -1, "aplicada", step.text());
        String who = requester == null ? step.player().getName() : requester.name;
        for (Seat each : session.seats) each.send(Session.toast("toast", each == requester ? "Desfeito: " + step.text() + "." : who + " desfez: " + step.text() + "."));
        for (Seat each : session.seats) each.inputGen.incrementAndGet();
        session.markDirty();
    }

    /** Para a mesa: o que este assento desfaria agora e o pedido aberto, com o voto dele. */
    JsonObject json(Seat seat) {
        if (seat.me == null) return null;
        JsonObject o = new JsonObject();
        synchronized (lock) {
            UndoHistory.Step last = session.gameOver() || seat.eliminated() ? null : history.lastOf(seat.me.getId());
            if (last != null) o.add("last", last.json());
            o.addProperty("pending", history.hasPending());
            UndoRequest r = request;
            if (r != null) {
                Seat requester = session.seats[r.requester];
                Set<Integer> voters = voters(r.requester);
                JsonObject req = new JsonObject();
                if (requester.me != null) req.addProperty("player", requester.me.getId());
                req.addProperty("name", requester.name);
                req.add("step", r.step.json());
                req.addProperty("mine", requester == seat);
                req.addProperty("canVote", voters.contains(seat.index));
                if (r.yes.contains(seat.index)) req.addProperty("vote", "yes");
                else if (r.no.contains(seat.index)) req.addProperty("vote", "no");
                JsonArray waiting = new JsonArray();
                for (Integer v : voters) if (!r.yes.contains(v)) waiting.add(session.seats[v].name);
                req.add("waiting", waiting);
                o.add("request", req);
            }
        }
        return o;
    }
}
