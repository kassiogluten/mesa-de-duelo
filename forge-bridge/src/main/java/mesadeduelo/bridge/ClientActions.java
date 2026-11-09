package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import forge.card.MagicColor;
import forge.card.mana.ManaAtom;
import forge.game.GameView;
import forge.game.card.CardView;
import forge.game.player.PlayerView;
import forge.game.spellability.StackItemView;
import forge.gui.FThreads;
import forge.interfaces.IGameController;
import forge.gamemodes.match.input.InputConfirmMulligan;
import forge.player.PlayerControllerHuman;
import io.netty.channel.Channel;

/**
 * As mensagens do navegador para a partida ({type:"card", id} | {type:"ok"} | {type:"attack", ...} | ...): confere
 * se a ação ainda vale para o prompt que o jogador via ({@code gen}), registra no diário e repassa ao controlador
 * do assento na thread de interface. As de sala (host, join, rejoin, rematch, leave) ficam em {@link Rooms}.
 */
final class ClientActions {
    private final Session session;

    ClientActions(Session session) { this.session = session; }

    void onClientMessage(Seat seat, Channel source, String type, JsonObject msg) {
        if (seat.eliminated() && !Set.of("preferences", "hello").contains(type)) { rejectStaleAction(seat, type); return; }
        int actionGen = -1;
        if (Set.of("card", "attack", "attack-all", "attack-group", "block", "player", "stack", "mana", "ok", "cancel", "pass-turn", "resolve-all", "select-set").contains(type)) {
            if (!msg.has("gen") || !msg.get("gen").isJsonPrimitive() || !msg.get("gen").getAsJsonPrimitive().isNumber()) { rejectStaleAction(seat, type); return; }
            actionGen = exactInt(msg.get("gen"));
            if (actionGen != seat.inputGen.get() || seat.question != null || !"playing".equals(session.matchPhase)) { rejectStaleAction(seat, type, actionGen); return; }
        }
        final int genAtClick = actionGen;
        log(seat, type, genAtClick, "recebida", actionDetail(seat, type, msg));
        switch (type) {
            case "preferences" -> seat.updatePreferences(source, msg);
            case "sideboard" -> session.submitSideboard(seat, msg, false);
            case "next-game" -> session.submitSideboard(seat, msg, true);
            case "sideboard-cancel" -> session.cancelSideboard(seat, msg);
            case "hello" -> session.markDirty();
            case "ok", "cancel" -> {
                int gen = genAtClick;
                // Clique repetido no mesmo prompt só vale depois da trava: se o Forge recusou a ação (bloqueio
                // inválido, por exemplo), o prompt continua o mesmo e o jogador precisa poder tentar de novo.
                if (gen != seat.inputGen.get() || seat.buttonsLocked()) { session.markDirty(); break; }
                seat.consumedGen = gen;
                seat.consumedAt = System.currentTimeMillis();
                if ("ok".equals(type) && seat.controller() instanceof PlayerControllerHuman human
                    && human.getInputQueue().getInput() instanceof InputConfirmMulligan) seat.keptHand = true;
                session.markDirty();
                // O OK de um pagamento é o Automático: a parte genérica sai antes das pedras de mana (AutoPay).
                seat.onEdt(genAtClick, "ok".equals(type)
                    ? c -> { if (!(c instanceof PlayerControllerHuman human) || !AutoPay.ok(human)) c.selectButtonOk(); }
                    : IGameController::selectButtonCancel);
            }
            case "pass-turn" -> {
                if (!seat.livePriority() || seat.buttonsLocked() || !seat.okEnabled || seat.question != null) { session.markDirty(); break; }
                seat.consumedGen = genAtClick; seat.consumedAt = System.currentTimeMillis();
                // "Fim de turno" no seu turno e "Passar até o fim do turno" no dos outros: passa até o turno acabar,
                // até algo afetar você ou até uma etapa marcada; depois, volta ao nível escolhido.
                seat.onEdt(genAtClick, c -> {
                    WebGuiGame g = seat.gui;
                    if (seat.livePriority() && seat.question == null && g != null) g.passUntilEndOfTurn(c);
                    session.markDirty();
                });
                session.markDirty();
            }
            case "resolve-all" -> {
                // Passa até a pilha esvaziar, como o "Resolver tudo" do Forge. Respeita interrupções: se alguém
                // acrescentar algo à pilha ou o jogo pedir uma decisão sua, a vez volta para você.
                if (!seat.livePriority() || seat.buttonsLocked() || !seat.okEnabled || seat.question != null) { session.markDirty(); break; }
                seat.consumedGen = genAtClick; seat.consumedAt = System.currentTimeMillis();
                seat.onEdt(genAtClick, c -> {
                    WebGuiGame g = seat.gui;
                    if (seat.livePriority() && seat.question == null && g != null) g.resolveAll(c);
                    session.markDirty();
                });
                session.markDirty();
            }
            case "pass-turn-stop" -> {
                // Desliga o "Passar até o fim do turno" a qualquer momento, também enquanto o Forge passa sozinho.
                FThreads.invokeInEdtLater(() -> {
                    WebGuiGame g = seat.gui;
                    if (g != null && seat.channel == source) g.stopPassingTurn();
                    session.markDirty();
                });
            }
            case "skip-vote" -> session.skips.vote(seat, msg);
            case "undo-request" -> session.undo.request(seat);
            case "undo-vote" -> session.undo.vote(seat, !msg.has("value") || msg.get("value").getAsBoolean());
            case "undo-cancel" -> session.undo.cancel(seat);
            case "concede" -> { if (session.isRoom()) seat.conceded = true; session.concede(seat); }
            case "attack" -> {
                int attacker = exactInt(msg.get("attacker")), defender = exactInt(msg.get("defender"));
                String kind = MatchConfig.string(msg, "defenderKind");
                seat.onEdt(genAtClick, c -> {
                    if (!(c instanceof PlayerControllerHuman human)
                        || !InputContext.assignAttack(human.getInputQueue().getInput(), attacker, defender, kind))
                        seat.send(Session.toast("error", "Esse ataque não é válido. Escolha um defensor permitido."));
                    session.markDirty();
                });
            }
            case "attack-all" -> {
                int defender = exactInt(msg.get("defender"));
                String kind = MatchConfig.string(msg, "defenderKind");
                seat.onEdt(genAtClick, type, c -> {
                    if (!(c instanceof PlayerControllerHuman human)
                        || !InputContext.assignAllAttackers(human.getInputQueue().getInput(), defender, kind))
                        seat.send(Session.toast("error", "Não foi possível atacar com todas as criaturas. Escolha um defensor permitido antes de declarar atacantes."));
                    session.markDirty();
                });
            }
            case "attack-group" -> {
                if (!msg.has("defender")) throw new IllegalArgumentException("Informe o defensor ou retire o grupo do combate.");
                Integer defender = msg.get("defender").isJsonNull() ? null : exactInt(msg.get("defender"));
                String kind = defender == null ? null : MatchConfig.string(msg, "defenderKind");
                if (!msg.has("attackers") || !msg.get("attackers").isJsonArray())
                    throw new IllegalArgumentException("Escolha um grupo de criaturas para atacar.");
                List<Integer> attackers = new ArrayList<>();
                for (JsonElement id : msg.getAsJsonArray("attackers")) attackers.add(exactInt(id));
                seat.onEdt(genAtClick, type, c -> {
                    if (!(c instanceof PlayerControllerHuman human)
                        || !InputContext.assignAttackGroup(human.getInputQueue().getInput(), attackers, defender, kind))
                        seat.send(Session.toast("error", "Não foi possível atualizar os ataques desse grupo. Revise as criaturas selecionadas."));
                    session.markDirty();
                });
            }
            case "block" -> {
                int attacker = exactInt(msg.get("attacker")), blocker = exactInt(msg.get("blocker"));
                seat.onEdt(genAtClick, c -> {
                    if (!(c instanceof PlayerControllerHuman human)
                        || !InputContext.assignBlock(human.getInputQueue().getInput(), attacker, blocker))
                        seat.send(Session.toast("error", "Esse bloqueio não é válido. Escolha um atacante permitido."));
                    session.markDirty();
                });
            }
            case "card" -> {
                CardView cv = findCard(seat, msg.get("id").getAsInt());
                // Uma carta virada para mana que ainda está na reserva: o clique desvira e devolve a mana. Uma carta que o
                // Forge não deixa jogar agora vira um aviso com o motivo, em vez de um clique que não faz nada.
                if (cv != null) seat.onEdt(genAtClick, c -> {
                    if (ManaUndo.untap(c, cv.getId())) { session.markDirty(); return; }
                    String refusal = PlayRefusal.toast(c, cv.getId());
                    if (refusal != null) seat.send(refusal); else c.selectCard(cv, null, null);
                });
            }
            case "stack" -> {
                int id = exactInt(msg.get("id"));
                if (!seat.selectableStacks.contains(id)) { session.markDirty(); break; }
                GameView view = session.match == null ? null : session.match.getGameView();
                if (view != null && view.getStack() != null) for (StackItemView item : view.getStack())
                    if (item.getId() == id) { seat.onEdt(genAtClick, c -> c.selectStackItem(item)); break; }
            }
            case "mana" -> {
                // Gastar a mana da reserva no pagamento (o Forge não a usa sozinho, só no Automático).
                byte color = switch (str(msg, "color", "")) {
                    case "W" -> MagicColor.WHITE; case "U" -> MagicColor.BLUE; case "B" -> MagicColor.BLACK;
                    case "R" -> MagicColor.RED; case "G" -> MagicColor.GREEN; case "C" -> (byte) ManaAtom.COLORLESS;
                    default -> -1;
                };
                if (color >= 0) seat.onEdt(genAtClick, c -> c.useMana(color));
            }
            case "select-set" -> {
                List<Integer> cards = new ArrayList<>(), players = new ArrayList<>();
                if (msg.has("cards") && msg.get("cards").isJsonArray()) for (JsonElement id : msg.getAsJsonArray("cards")) cards.add(exactInt(id));
                if (msg.has("players") && msg.get("players").isJsonArray()) for (JsonElement id : msg.getAsJsonArray("players")) players.add(exactInt(id));
                seat.onEdt(genAtClick, type, c -> {
                    if (!(c instanceof PlayerControllerHuman human)
                        || !InputContext.selectExactly(human.getInputQueue().getInput(), cards, players))
                        seat.send(Session.toast("error", "Não foi possível marcar essa escolha. Toque de novo nas permanentes e jogadores."));
                    session.markDirty();
                });
            }
            case "player" -> {
                PlayerView pv = findPlayer(msg.get("id").getAsInt());
                if (pv != null) seat.onEdt(genAtClick, c -> c.selectPlayer(pv, null));
            }
            case "answer" -> session.questions.answer(seat, msg);
            case "reveal-seen" -> {
                if (seat.controller() instanceof AskingController asking && msg.has("seq")) asking.libraryViewSeen(msg.get("seq").getAsInt());
                session.markDirty();
            }
            default -> { }
        }
    }

    void log(Seat seat, String type, int gen, String result, String detail) {
        MatchJournal j = session.journal;
        if (j != null && type != null) j.action(seat.index, type, gen, session.stateVersion.get(), result, detail);
    }

    /** Resumo curto da ação para o diário: ids de cartas e jogadores e as respostas, nunca o que o jogador não vê. */
    private static String actionDetail(Seat seat, String type, JsonObject msg) {
        try {
            return switch (type) {
                case "card", "player", "stack" -> type + " " + msg.get("id");
                case "attack" -> "atacante " + msg.get("attacker") + " → " + msg.get("defenderKind") + " " + msg.get("defender");
                case "attack-all" -> "todos → " + msg.get("defenderKind") + " " + msg.get("defender");
                case "attack-group" -> "grupo " + msg.get("attackers") + " → " + msg.get("defender");
                case "block" -> "bloqueador " + msg.get("blocker") + " → atacante " + msg.get("attacker");
                case "mana" -> "cor " + msg.get("color");
                case "select-set" -> "cartas " + msg.get("cards") + " jogadores " + msg.get("players");
                case "skip-vote" -> "alvo " + msg.get("target") + " voto " + (msg.has("value") ? msg.get("value") : "true");
                case "undo-vote" -> "voto " + (msg.has("value") ? msg.get("value") : "true");
                case "answer" -> {
                    QuestionBroker.Question q = seat.question;
                    String asked = q == null ? "pergunta já respondida" : q.method() + (q.json().has("title") ? " \"" + q.json().get("title").getAsString() + "\"" : "");
                    StringBuilder answer = new StringBuilder(asked).append(":");
                    for (String key : List.of("indices", "value", "text", "amounts")) if (msg.has(key)) answer.append(' ').append(key).append('=').append(msg.get(key));
                    yield answer.toString();
                }
                default -> null;
            };
        } catch (RuntimeException e) {
            return null;
        }
    }

    void rejectStaleAction(Seat seat, String type) { rejectStaleAction(seat, type, -1); }

    private void rejectStaleAction(Seat seat, String type, int gen) {
        log(seat, type, gen, "recusada", null);
        // Só para o painel de erros da mesa: o jogador não vê aviso, mas fica registrado que a ação foi ignorada.
        if (type != null) {
            JsonObject diagnostic = new JsonObject();
            diagnostic.addProperty("type", "diagnostic"); diagnostic.addProperty("code", "stale-action"); diagnostic.addProperty("action", type);
            diagnostic.addProperty("text", "Ação ignorada: a tela estava desatualizada ou a vez já tinha mudado.");
            seat.send(diagnostic.toString());
        }
        if ("attack-group".equals(type) || "attack-all".equals(type)) {
            JsonObject error = new JsonObject();
            error.addProperty("type", "error"); error.addProperty("code", "stale-action"); error.addProperty("action", type);
            error.addProperty("text", "A etapa de ataque mudou. Revise a seleção e tente novamente.");
            seat.send(error.toString());
        }
        session.markDirty();
    }

    static int exactInt(JsonElement value) {
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber())
            throw new IllegalArgumentException("Identificador inválido.");
        try { return value.getAsBigDecimal().intValueExact(); }
        catch (ArithmeticException e) { throw new IllegalArgumentException("Identificador inválido."); }
    }

    static String str(JsonObject o, String key, String def) {
        return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString() : def;
    }

    /** Procura a carta só nas zonas que este jogador pode ver: a mão do oponente fica de fora. */
    CardView findCard(Seat seat, int id) {
        GameView gv = session.match == null ? null : session.match.getGameView();
        if (gv == null) return null;
        for (PlayerView p : gv.getPlayers()) {
            List<Iterable<CardView>> zones = new ArrayList<>(List.of(nz(p.getBattlefield()), nz(p.getGraveyard()), nz(p.getExile()), nz(p.getCommand())));
            if (p.equals(seat.me)) zones.add(nz(p.getHand()));
            // Topo do grimório que o jogador pode ver: dá para jogá-lo com Future Sight e afins.
            for (CardView top : nz(p.getLibrary())) { if (top.canBeShownTo(seat.me)) zones.add(List.of(top)); break; }
            for (Iterable<CardView> zone : zones) {
                for (CardView c : zone) if (c.getId() == id) return c;
            }
        }
        if (gv.getStack() != null) {
            for (StackItemView si : gv.getStack()) if (si.getSourceCard() != null && si.getSourceCard().getId() == id) return si.getSourceCard();
        }
        return null;
    }

    private PlayerView findPlayer(int id) {
        GameView gv = session.match == null ? null : session.match.getGameView();
        if (gv == null) return null;
        for (PlayerView p : gv.getPlayers()) if (p.getId() == id) return p;
        return null;
    }

    private static Iterable<CardView> nz(Iterable<CardView> it) { return it == null ? List.of() : it; }
}
