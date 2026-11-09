package mesadeduelo.bridge;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import forge.game.GameStage;
import forge.game.GameView;
import forge.game.card.CardView;
import forge.game.phase.PhaseType;
import forge.game.player.PlayerView;
import forge.game.spellability.SpellAbility;
import forge.gamemodes.match.HostedMatch;
import forge.gamemodes.match.input.InputAttack;
import forge.gamemodes.match.input.InputBlock;
import forge.gamemodes.match.input.InputConfirm;
import forge.gamemodes.match.input.InputConfirmMulligan;
import forge.gamemodes.match.input.InputLondonMulligan;
import forge.gamemodes.match.input.InputPassPriority;
import forge.gamemodes.match.input.InputPayMana;
import forge.gamemodes.match.input.InputSelectTargets;
import forge.gamemodes.match.input.TargetingProgress;
import forge.player.PlayerControllerHuman;

/**
 * O estado ({type:"state"}) que a {@link Session} publica a cada ciclo: o de cada assento (mesa, prompt, botões,
 * pergunta, preferências, sala) e o de quem assiste (a mesa sem mãos nem botões). Os campos ficam listados em
 * {@code tests/protocol/state-keys.txt} ({@code ProtocolContractTest}). Null quando uma leitura concorrente falha:
 * o assento tenta de novo no próximo ciclo.
 */
final class SeatStateView {
    private final Session session;

    SeatStateView(Session session) { this.session = session; }

    /** A mesa vista pelo jogador {@code viewer} (-2: ninguém), com os tempos de turno, a vida, os versos e os brackets. */
    private JsonObject gameState(GameView gv, int viewer, forge.game.Game game) {
        JsonObject state = StateJson.game(gv, viewer, game);
        session.events.addTurnTimes(state); session.events.addLifeHistory(state);
        addBrackets(state);
        return state;
    }

    /** O bracket de cada jogador no estado, pela ordem em que entraram no jogo: os assentos e depois os computadores. */
    private void addBrackets(JsonObject state) {
        int[] colors = session.sleeves;
        if (colors != null && state.has("players")) for (JsonElement e : state.getAsJsonArray("players")) {
            JsonObject p = e.getAsJsonObject();
            if (p.has("seat") && p.get("seat").getAsInt() < colors.length) p.addProperty("sleeve", colors[p.get("seat").getAsInt()]);
        }
        if (!session.config.commander() || !state.has("players")) return;
        for (JsonElement e : state.getAsJsonArray("players")) {
            JsonObject p = e.getAsJsonObject();
            if (!p.has("seat")) continue;
            int i = p.get("seat").getAsInt(), ai = i - session.seats.length;
            int bracket = i < session.seats.length ? session.seats[i].bracket : ai < session.aiBrackets.size() ? session.aiBrackets.get(ai) : 0;
            if (bracket > 0) p.addProperty("bracket", bracket);
        }
    }

    /** Ciclos seguidos (de 50 ms) em que montar o estado deu erro. Uma falha solta é leitura concorrente e se refaz sozinha. */
    private int stateFailures;
    private static final int STATE_FAILURES_TO_LOG = 40;

    /** Um ciclo inteiro saiu sem erro: a próxima falha começa a contar do zero. */
    void stateRecovered() { stateFailures = 0; }

    /** Registra no log quando o estado falha por uns 2 s seguidos, uma vez por sequência, em vez de a mesa parar sem aviso. */
    private void stateFailed(RuntimeException e) {
        if (++stateFailures != STATE_FAILURES_TO_LOG) return;
        Log.of(session).error("Sessão " + session.code + ": o estado não sai há " + STATE_FAILURES_TO_LOG + " ciclos: " + e);
        e.printStackTrace();
    }

    /**
     * O estado visto por quem assiste: a mesa do jogador escolhido, sem a mão de ninguém (como um oponente veria),
     * sem botões, perguntas nem preferências, e sem token para voltar a um assento.
     */
    JsonObject state(Session.Watcher w) {
        HostedMatch m = session.match;
        GameView gv = m == null ? null : m.getGameView();
        if (gv == null) return null;
        JsonObject state;
        try {
            state = gameState(gv, -2, m.getGame());
            // O jogador escolhido; sem escolha (ou se ele não está mais no jogo), o anfitrião.
            int you = -1, host = session.seats[0].me == null ? -1 : session.seats[0].me.getId();
            for (PlayerView p : gv.getPlayers()) if (p.getId() == w.player) you = p.getId();
            if (you < 0) for (PlayerView p : gv.getPlayers()) if (p.getId() == host || you < 0) you = p.getId();
            state.addProperty("you", you);
            state.addProperty("spectating", true);
            state.addProperty("watching", true);
            JsonObject input = new JsonObject();
            input.addProperty("gen", 0);
            input.addProperty("message", "");
            input.add("ok", button("", false));
            input.add("cancel", button("", false));
            for (String empty : new String[]{"selectable", "selectableStacks", "selectablePlayers", "actionable"}) input.add(empty, new JsonArray());
            state.add("input", input);
            state.add("deciding", deciding(null));
            state.add("waiting", waiting());
            state.add("castable", new JsonArray());
        } catch (RuntimeException e) {
            stateFailed(e);
            return null;
        }
        envelope(state, null, w.sentEventCursor);
        state.add("room", roomJson(-1, null));
        state.add("decks", new JsonArray());
        if (!session.isRoom()) renameHuman(state);
        return state;
    }

    /** Contra a IA o humano se chama "Você" no Forge; quem assiste o vê pelo nome que ele usa, ou "Jogador". */
    private void renameHuman(JsonObject state) {
        String forgeName = session.seats[0].name, shown = session.seats[0].nick != null ? session.seats[0].nick : "Jogador";
        if (forgeName == null || !state.has("players")) return;
        for (JsonElement e : state.getAsJsonArray("players")) {
            JsonObject p = e.getAsJsonObject();
            if (p.has("name") && forgeName.equals(p.get("name").getAsString())) p.addProperty("name", shown);
        }
    }

    /**
     * Mágica sendo conjurada (escolhendo alvos ou pagando o custo): a carta que alveja ({@code source}) e os alvos
     * já escolhidos, para a mesa desenhar as setas. O Forge não expõe a habilidade desses inputs, então ela é lida
     * por reflexão. No pagamento só vale para o que ainda não está na pilha (lá os alvos vão com o item).
     */
    private static JsonObject targeting(Seat seat) {
        if (!(seat.controller() instanceof PlayerControllerHuman pch)) return null;
        Object in = pch.getInputQueue().getInput();
        try {
            SpellAbility sa;
            if (in instanceof InputSelectTargets) {
                sa = InputContext.casting(in);
            } else if (in instanceof InputPayMana) {
                sa = InputContext.casting(in);
                if (sa != null && sa.getHostCard() != null
                    && sa.getHostCard().getGame().getStack().getInstanceMatchingSpellAbilityID(sa.getRootAbility()) != null) return null;
            } else {
                return null;
            }
            if (sa == null || sa.getHostCard() == null) return null;
            JsonObject o = StateJson.targets(TargetingProgress.chosenTargets(sa));
            if (o == null) {
                if (in instanceof InputPayMana) return null;
                o = new JsonObject();
            }
            o.addProperty("source", sa.getHostCard().getId());
            // Ao conjurar, a carta já saiu da mão: vai junto para a mesa mostrar de onde sai a seta.
            o.add("card", StateJson.card(CardView.get(sa.getHostCard())));
            // Na escolha de alvos: a habilidade que pede o alvo, o que serve e quantos faltam.
            JsonObject details = InputContext.targetDetails(in);
            if (details != null) for (var entry : details.entrySet()) o.add(entry.getKey(), entry.getValue());
            return o;
        } catch (RuntimeException e) {
            return null;
        }
    }

    /**
     * Outros jogadores humanos com uma decisão aberta (alvo, sacrifício, pergunta, ataque ou bloqueio), para a mesa
     * avisar "Aguardando Fulano escolher" em vez de parecer travada. Prioridade comum fica de fora.
     */
    private JsonArray deciding(Seat viewer) {
        JsonArray list = new JsonArray();
        for (Seat other : session.seats) {
            if (other == viewer || other.me == null || other.eliminated()) continue;
            Object in = other.controller() instanceof PlayerControllerHuman human ? human.getInputQueue().getInput() : null;
            String kind = other.question != null ? "choice"
                : in instanceof InputAttack ? "attack" : in instanceof InputBlock ? "block"
                : in != null && !(in instanceof InputPassPriority) ? "choice" : null;
            if (kind == null) continue;
            JsonObject entry = new JsonObject();
            entry.addProperty("player", other.me.getId()); entry.addProperty("kind", kind);
            list.add(entry);
        }
        return list;
    }

    /** A decisão de abertura que o pedido do Forge representa (quem começa, manter a mão, devolver cartas), ou null. */
    private String opening(Object in, forge.game.Game game) {
        if (in instanceof InputLondonMulligan) return "mulligan-bottom";
        if (in instanceof InputConfirmMulligan) return "mulligan";
        if (game.getAge() != GameStage.BeforeMulligan || session.events.gameStarted()) return null;
        if (in instanceof InputConfirm) return "play-draw";
        return InputContext.playerChoices(in).isEmpty() ? null : "starting-player";
    }

    /**
     * Outro jogador numa decisão de abertura enquanto este espera: o Forge decide as mãos uma de cada vez, e sem isso a
     * mesa parece ter pulado o mulligan. step "start" (quem começa) ou "hand" (manter ou devolver); kept quando este
     * assento já manteve a mão.
     */
    private JsonObject openingWait(Seat viewer, forge.game.Game game) {
        for (Seat other : session.seats) {
            if (other == viewer || other.me == null || other.eliminated()) continue;
            Object in = other.controller() instanceof PlayerControllerHuman human ? human.getInputQueue().getInput() : null;
            String kind = opening(in, game);
            if (kind == null) continue;
            JsonObject wait = new JsonObject();
            wait.addProperty("player", other.me.getId());
            wait.addProperty("step", kind.startsWith("mulligan") ? "hand" : "start");
            if (viewer.keptHand) wait.addProperty("kept", true);
            return wait;
        }
        return null;
    }

    /**
     * Jogadores humanos que a mesa espera agora (inclusive na prioridade comum) e há quanto tempo, para o alerta de
     * espera demorada. Cada pedido novo do Forge (outra prioridade, outra escolha) é uma espera nova: o relógio zera a
     * cada resposta e quando o turno passa. A IA não tem assento e nunca entra.
     */
    private JsonArray waiting() {
        JsonArray list = new JsonArray();
        long now = System.currentTimeMillis();
        for (Seat seat : session.seats) {
            if (seat.me == null || seat.eliminated()) continue;
            Object pending = seat.pending();
            long ms = seat.waited(pending, now);
            if (pending == null) continue;
            Object in = pending instanceof QuestionBroker.Question ? null : pending;
            String kind = in == null ? "choice" : in instanceof InputPassPriority ? "priority"
                : in instanceof InputAttack ? "attack" : in instanceof InputBlock ? "block" : "choice";
            JsonObject entry = new JsonObject();
            entry.addProperty("player", seat.me.getId()); entry.addProperty("kind", kind); entry.addProperty("ms", ms);
            list.add(entry);
        }
        return list;
    }

    /** Monta o estado visto por um jogador; null se uma leitura concorrente falhar (refeita no próximo ciclo). */
    JsonObject state(Seat seat) {
        HostedMatch m = session.match;
        GameView gv = m == null ? null : m.getGameView();
        JsonObject state;
        try {
            if (gv == null) {
                state = new JsonObject();
                state.addProperty("type", "lobby");
            } else {
                PlayerView p = seat.me;
                state = gameState(gv, p == null ? -2 : p.getId(), m.getGame());
                state.addProperty("you", p == null ? -1 : p.getId());
                boolean spectating = seat.eliminated();
                state.addProperty("spectating", spectating);
                JsonObject input = new JsonObject();
                int generation = seat.inputGen.get();
                Object currentInput = !spectating && seat.controller() instanceof PlayerControllerHuman human ? human.getInputQueue().getInput() : null;
                boolean priority = currentInput instanceof InputPassPriority;
                input.addProperty("priority", priority);
                JsonObject attacking = InputContext.attacking(currentInput);
                if (attacking != null) input.add("attacking", attacking);
                JsonObject blocking = InputContext.blocking(currentInput);
                if (blocking != null) input.add("blocking", blocking);
                JsonObject suspendCast = InputContext.suspendCast(currentInput);
                if (suspendCast != null) input.add("suspendCast", suspendCast);
                JsonObject commanderMove = InputContext.commanderMove(currentInput);
                if (commanderMove != null) input.add("commanderMove", commanderMove);
                JsonObject selection = InputContext.selection(currentInput);
                if (selection != null) input.add("selection", selection);
                JsonObject tapToPay = InputContext.tapToPay(currentInput);
                if (tapToPay != null) input.add("tapToPay", tapToPay);
                JsonObject proliferate = InputContext.proliferate(currentInput);
                if (proliferate != null) input.add("proliferate", proliferate);
                Set<Integer> playerChoices = InputContext.playerChoices(currentInput);
                String opening = opening(currentInput, m.getGame());
                if (opening != null) input.addProperty("opening", opening);
                else if (!spectating) {
                    JsonObject wait = openingWait(seat, m.getGame());
                    if (wait != null) input.add("openingWait", wait);
                }
                if (input.has("opening")) {
                    if (currentInput instanceof InputConfirmMulligan mulligan) {
                        forge.game.player.Player first = InputContext.mulliganStartingPlayer(mulligan);
                        if (first != null) seat.openingStartingPlayer = first.getId();
                    }
                    if (seat.openingStartingPlayer >= 0) input.addProperty("openingStartingPlayer", seat.openingStartingPlayer);
                    // Mão nova do mulligan, antes de decidir: quantas cartas vão para o fundo se ele mantiver.
                    if (currentInput instanceof InputConfirmMulligan && seat.controller() instanceof AskingController asking && asking.mulliganReturn() > 0)
                        input.addProperty("openingReturnCount", asking.mulliganReturn());
                    Integer total;
                    if (currentInput instanceof InputLondonMulligan london && (total = InputContext.londonReturnCount(london)) != null) {
                        input.addProperty("openingReturnCount", total);
                        input.addProperty("openingReturnRemaining", total - london.getSelectedCards().size());
                        JsonArray selected = new JsonArray(); london.getSelectedCards().forEach(card -> selected.add(card.getId()));
                        input.add("openingSelected", selected);
                    }
                }
                boolean locked = seat.buttonsLocked();
                seat.lockedAtLastFlush = locked;
                // Sem input aberto (outro jogador com prioridade), os botões do último prompt ficam velhos: nada a confirmar.
                if (currentInput == null) locked = true;
                input.addProperty("gen", generation);
                input.addProperty("message", seat.message);
                input.add("ok", button(priority && "OK".equalsIgnoreCase(seat.okLabel) ? "Passar prioridade" : seat.okLabel, seat.okEnabled && !locked && !spectating));
                input.add("cancel", button(seat.cancelLabel, seat.cancelEnabled && !locked && !spectating));
                JsonArray sel = new JsonArray();
                Set<Integer> selectableIds = new LinkedHashSet<>(seat.selectable);
                selectableIds.addAll(InputContext.tapToPayChoices(currentInput));
                selectableIds.forEach(sel::add);
                input.add("selectable", sel);
                JsonArray stackTargets = new JsonArray(); seat.selectableStacks.forEach(stackTargets::add);
                input.add("selectableStacks", stackTargets);
                Set<Integer> playerIds = new LinkedHashSet<>(seat.selectablePlayers); playerIds.addAll(playerChoices);
                JsonObject phyrexianLife = InputContext.phyrexianLife(currentInput);
                if (phyrexianLife != null) playerIds.add(phyrexianLife.get("player").getAsInt());
                JsonArray playerTargets = new JsonArray(); playerIds.forEach(playerTargets::add);
                input.add("selectablePlayers", playerTargets);
                JsonArray act = new JsonArray();
                seat.actionable.forEach(act::add);
                input.add("actionable", act);
                if (priority && !locked) {
                    JsonArray untap = new JsonArray();
                    ManaUndo.untappable(seat.controller()).forEach(untap::add);
                    if (!untap.isEmpty()) input.add("untappable", untap);
                    JsonArray manaOnly = new JsonArray();
                    ManaOnly.ids(seat.controller()).forEach(manaOnly::add);
                    if (!manaOnly.isEmpty()) input.add("manaOnly", manaOnly);
                }
                // Pagando um custo de mana: a reserva fica clicável no retrato.
                if (seat.controller() instanceof PlayerControllerHuman pch && pch.getInputQueue().getInput() instanceof InputPayMana pay) {
                    input.addProperty("paying", true);
                    // O OK é o Automático; ele vem desligado também na trava curta depois de um clique, e só aqui quer dizer falta de mana.
                    input.addProperty("canAutoPay", seat.okEnabled && !seat.okLabel.isEmpty());
                    String payingFor = InputContext.payingFor(pay);
                    if (payingFor != null) input.addProperty("payingFor", payingFor);
                    // Mana phyrexiana: o retrato (ou o botão) paga um símbolo com 2 de vida.
                    if (phyrexianLife != null) input.addProperty("phyrexianLife", phyrexianLife.get("pending").getAsInt());
                    // O custo que falta, descontado a cada mana gerada, para a caixa de ação mostrar com os símbolos.
                    JsonObject manaCost = InputContext.manaCost(pay);
                    if (manaCost != null) input.add("manaCost", manaCost);
                }
                JsonObject targeting = targeting(seat);
                if (targeting != null) input.add("targeting", targeting);
                CardView promptCard = seat.promptCard;
                if (promptCard == null) promptCard = QuestionBroker.asking(seat, currentInput, m.getGame());
                if (promptCard != null) input.add("card", StateJson.card(promptCard));
                // Voto numa permanente (Council's Judgment): escolhido tocando no campo, com a carta que vota à vista.
                SpellAbility voting = Votes.isVotePrompt(seat.message) ? Votes.current(m.getGame()) : null;
                if (voting != null && voting.getHostCard() != null) {
                    JsonObject vote = new JsonObject();
                    vote.add("card", StateJson.card(voting.getHostCard().getView()));
                    vote.add("votes", QuestionBroker.votesJson(m.getGame(), session.questions.voteTally.of(voting)));
                    input.add("vote", vote);
                }
                state.add("input", input);
                QuestionBroker.Question q = seat.question;
                if (q != null && !spectating) state.add("question", q.json());
                // Cartas reveladas do topo de um grimório, numa janela que não segura o jogo (LibraryReveal).
                if (!spectating && seat.controller() instanceof AskingController asking && asking.libraryView() != null) {
                    JsonObject revealView = LibraryReveal.json(asking.libraryView(), m.getGame());
                    if (revealView != null) state.add("revealView", revealView);
                }
                state.add("deciding", deciding(seat));
                state.add("waiting", waiting());
                // Phase/zone events can precede the actionable input. Never advertise an early cast.
                if (!priority || !seat.okEnabled || locked || q != null) state.add("castable", new JsonArray());
                if (generation != seat.inputGen.get()) return null;
            }
        } catch (RuntimeException e) {
            stateFailed(e);
            return null;
        }
        envelope(state, preferences(seat), seat.sentEventCursor);
        if ("sideboarding".equals(session.matchPhase) && seat.registered != null) state.add("sideboarding", session.sideboardingJson(seat));
        state.add("session", sessionJson(seat));
        if (session.isRoom()) state.add("room", roomJson(seat.index, seat.token));
        else state.add("audience", audienceJson());
        JsonObject skip = session.skips.json(seat);
        if (skip != null) state.add("skip", skip);
        JsonObject undoState = session.undo.json(seat);
        if (undoState != null) state.add("undo", undoState);
        JsonArray decks = new JsonArray();
        Decks.LISTS.keySet().forEach(decks::add);
        state.add("decks", decks);
        return state;
    }

    /**
     * O que é igual para assentos e espectadores, na ordem do protocolo: {@code config}, {@code preferences} (só do
     * assento), {@code match}, {@code matchId}, as versões, e os eventos novos desde {@code cursor} com o cursor e a
     * versão do estado lidos juntos.
     */
    private void envelope(JsonObject state, JsonObject preferences, long cursor) {
        state.add("config", session.config.json());
        if (preferences != null) state.add("preferences", preferences);
        state.add("match", session.matchJson());
        state.addProperty("matchId", session.matchId);
        MatchConfig.versions(state);
        synchronized (session.events) {
            state.add("events", session.events.json(cursor));
            state.addProperty("eventCursor", session.events.cursor());
            state.addProperty("stateVersion", session.stateVersion.get());
        }
    }

    /** Nível de passar automaticamente, o "Passar até o fim do turno" e as paradas no turno dos oponentes. */
    private static JsonObject preferences(Seat seat) {
        JsonObject preferences = new JsonObject();
        PassLevel level = seat.passLevel;
        preferences.addProperty("passLevel", level.id);
        // Os dois interruptores antigos continuam no estado, derivados do nível, para clientes de versões anteriores.
        preferences.addProperty("autoPassNoActions", level.autoPassNoActions());
        preferences.addProperty("passResponses", level.passesResponses());
        WebGuiGame passing = seat.gui;
        preferences.addProperty("passingTurn", passing != null && passing.passingTurn());
        JsonArray stops = new JsonArray();
        for (PhaseType phase : seat.opponentStops) stops.add(phase.name());
        preferences.add("opponentStops", stops);
        return preferences;
    }

    /** {code, token, room}: o que o navegador guarda para voltar a esta partida se a conexão cair. */
    JsonObject sessionJson(Seat seat) {
        JsonObject o = new JsonObject();
        o.addProperty("code", session.code);
        o.addProperty("token", seat.token);
        o.addProperty("room", session.isRoom());
        return o;
    }

    /** {code, seat, token, started, players:[{name, connected, rematch}], spectators:[nome]}; quem assiste vai com assento -1 e sem token. */
    JsonObject roomJson(int seatIndex, String token) {
        JsonObject r = new JsonObject();
        r.addProperty("code", session.code);
        r.addProperty("seat", seatIndex);
        if (token != null) r.addProperty("token", token);
        r.addProperty("started", session.started());
        r.addProperty("public", session.isPublic());
        if (session.isLab()) r.addProperty("lab", true);
        if (!session.isRoom()) r.addProperty("computer", true);
        r.addProperty("capacity", session.config.playerCount());
        r.add("config", session.config.json());
        MatchConfig.versions(r);
        JsonArray ps = new JsonArray();
        for (Seat s : session.seats) {
            if (!s.taken) continue;
            JsonObject p = new JsonObject();
            p.addProperty("seat", s.index);
            p.addProperty("playerId", s.me == null ? null : s.me.getId());
            p.addProperty("eliminated", s.eliminated());
            // Desistiu (pelo menu ou saindo da sala): a mesa tira o jogador de vista, em vez de mostrar o assento eliminado.
            if (s.conceded && s.eliminated()) p.addProperty("conceded", true);
            p.addProperty("name", s.name);
            p.addProperty("connected", s.channel != null);
            p.addProperty("rematch", s.rematch);
            // Na sala de espera, quem ainda está escolhendo o deck aparece sem capa e sem comandante.
            p.addProperty("ready", s.deck != null);
            p.addProperty("confirmed", s.confirmed);
            // O lobby mostra a capa e o comandante (que já é público na partida); o resto do deck fica escondido.
            List<String> commanders = s.deck == null ? List.of() : Session.commanderNames(s.deck);
            if (!commanders.isEmpty()) p.addProperty("commander", String.join(" + ", commanders));
            String cover = s.deck == null ? null : commanders.isEmpty() ? s.cover : commanders.get(0);
            if (cover != null) p.addProperty("cover", cover);
            if (s.bracket > 0) p.addProperty("bracket", s.bracket);
            ps.add(p);
        }
        r.add("players", ps);
        JsonArray spectators = new JsonArray();
        for (Session.Watcher w : session.watchers) spectators.add(w.name);
        r.add("spectators", spectators);
        return r;
    }

    /** Contra a IA: se a partida está na lista de salas e quem assiste. {listed, spectators:[nome]} */
    JsonObject audienceJson() {
        JsonObject o = new JsonObject();
        o.addProperty("listed", session.soloWatchable());
        JsonArray spectators = new JsonArray();
        for (Session.Watcher w : session.watchers) spectators.add(w.name);
        o.add("spectators", spectators);
        return o;
    }

    private static JsonObject button(String label, boolean enabled) {
        JsonObject b = new JsonObject();
        b.addProperty("label", label == null ? "" : label);
        b.addProperty("enabled", enabled);
        return b;
    }
}
