package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import forge.card.MagicColor;
import forge.card.mana.ManaAtom;
import forge.deck.Deck;
import forge.deck.DeckSection;
import forge.game.GameEntityView;
import forge.game.GameType;
import forge.game.GameStage;
import forge.game.GameView;
import forge.game.card.CardView;
import forge.game.phase.PhaseType;
import forge.game.zone.ZoneType;
import forge.game.player.PlayerView;
import forge.game.player.RegisteredPlayer;
import forge.game.spellability.SpellAbility;
import forge.game.spellability.StackItemView;
import forge.gamemodes.match.HostedMatch;
import forge.gamemodes.match.YieldUpdate;
import forge.gamemodes.match.input.InputAttack;
import forge.gamemodes.match.input.InputBlock;
import forge.gamemodes.match.input.InputConfirm;
import forge.gamemodes.match.input.InputConfirmMulligan;
import forge.gamemodes.match.input.InputLondonMulligan;
import forge.gamemodes.match.input.InputPayMana;
import forge.gamemodes.match.input.InputPassPriority;
import forge.gamemodes.match.input.InputSelectTargets;
import forge.gamemodes.match.input.TargetingProgress;
import forge.gamemodes.net.IRemote;
import forge.gamemodes.net.ProtocolMethod;
import forge.gamemodes.net.event.GuiGameEvent;
import forge.gamemodes.net.event.IdentifiableNetEvent;
import forge.gamemodes.net.event.NetEvent;
import forge.gui.FThreads;
import forge.gui.GuiBase;
import forge.gui.interfaces.IGuiGame;
import forge.interfaces.IGameController;
import forge.player.GamePlayerUtil;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import forge.trackable.TrackableCollection;
import forge.util.FSerializableFunction;
import io.netty.channel.Channel;

/**
 * Uma partida controlada pelo navegador: um humano contra a IA, ou de dois a quatro humanos numa sala em rede.
 * Cada humano ocupa um {@link Seat}, com a sua conexão, o seu prompt e as suas perguntas.
 *
 * Servidor → cliente: {type:"state", ..., you, input:{message, ok, cancel, selectable}, question, room?}
 * Cliente → servidor: {type:"card", id} | {type:"player", id} | {type:"ok"} | {type:"cancel"}
 *                     | {type:"concede"} | {type:"answer", id, indices|value|text}
 * As mensagens de sala (host, join, rejoin, rematch, leave) e o "start" contra a IA ficam em {@link Rooms}.
 */
final class Session {
    /** Código para voltar à partida ({type:"rejoin", code, token}); numa sala em rede é o código que os jogadores digitam. */
    final String code;
    private final boolean room;
    /** Sala pública: aparece na lista da tela inicial ({type:"list-rooms"}); a privada só se acha pelo código. */
    private volatile boolean publicRoom;
    final Seat[] seats;
    private final List<Deck> aiDecks;
    final MatchConfig config;
    private final AtomicLong stateVersion = new AtomicLong();
    private final VisibleEvents events = new VisibleEvents(this::markDirty, stateVersion::get);
    private volatile String matchId = UUID.randomUUID().toString();
    private volatile String matchPhase = "playing";
    private volatile int gameNumber = 1;
    private volatile int sideboardId;
    private volatile boolean abandoned;
    /** Início da partida em andamento para as métricas; 0 quando já foi contada como encerrada. */
    private volatile long startedAt;
    /** Quando a sala ou partida foi criada e quando começou a partida atual (para a área de admin). */
    private final long createdAt = System.currentTimeMillis();
    private volatile long playingSince;
    /** Início do jogo atual (cada jogo de uma melhor de três conta do zero) e quanto ele durou, -1 enquanto não termina. */
    private volatile long gameSince;
    private volatile long gameMs = -1;
    /** Duração de cada jogo já terminado da partida atual, na ordem, para o histórico. */
    private final List<Long> gameDurations = new ArrayList<>();
    /** Onde vai o resumo de cada partida concluída (veja {@link MatchHistory}); a repetição de relatos não grava. */
    private volatile java.util.function.Consumer<JsonObject> history = ignored -> { };
    private final AtomicBoolean dirty = new AtomicBoolean();
    private final AtomicInteger questionSeq = new AtomicInteger();
    /** Votos já anunciados na votação do conselho em andamento. */
    private final Votes.Tally voteTally = new Votes.Tally();
    private volatile HostedMatch match;
    private volatile MatchLifecycle lifecycle = new MatchLifecycle();
    /** Diário desta partida (decks, retratos, ações), refeito a cada {@link #start()}; só sai num relato. */
    private volatile MatchJournal journal;
    /** Só no modo de repetição: nomes da IA e o retrato a aplicar no começo do jogo (veja {@link Replay}). */
    private volatile List<String> aiNames;
    private volatile java.util.function.Consumer<forge.game.Game> startHook;

    /** Votação aberta para pular o turno de quem caiu, e os assentos com o turno já aprovado para pular. */
    private SkipVote skipVote;
    private final Set<Integer> skipApproved = new java.util.HashSet<>();
    /** Assentos aprovados cujo turno já começou: quando o turno passar para outro, a aprovação acaba. */
    private final Set<Integer> skipTurnStarted = new java.util.HashSet<>();

    private record Question(int id, ProtocolMethod method, Object[] args, List<Object> options,
                            CompletableFuture<Object> answer, JsonObject json) { }

    private Session(String code, boolean room, int humans, List<Deck> aiDecks, MatchConfig config) {
        this.code = code;
        this.room = room;
        this.aiDecks = List.copyOf(aiDecks);
        this.config = config;
        seats = new Seat[humans];
        for (int i = 0; i < humans; i++) seats[i] = new Seat(i);
    }

    static Session solo(String code, Channel ch, Deck you, Deck opponent, MatchConfig config) {
        return solo(code, ch, you, List.of(opponent), config);
    }

    static Session solo(String code, Channel ch, Deck you, List<Deck> opponents, MatchConfig config) {
        if (opponents.size() != config.playerCount() - 1) throw new IllegalArgumentException("Quantidade de oponentes inválida.");
        Session s = new Session(code, false, 1, opponents, config);
        s.seats[0].bind(ch, "Você", you);
        return s;
    }

    /** Repetição de um relato: o humano e as IAs na ordem dada, e o gancho que aplica o retrato no jogo novo. */
    static Session replay(String code, Channel ch, String name, Deck you, List<Deck> opponents, List<String> opponentNames,
                          MatchConfig config, java.util.function.Consumer<forge.game.Game> hook) {
        Session s = solo(code, ch, you, opponents, config);
        s.seats[0].name = name;
        s.aiNames = List.copyOf(opponentNames);
        s.startHook = hook;
        return s;
    }

    static Session room(String code, Channel host, String name, Deck deck, MatchConfig config) {
        return room(code, host, name, deck, config, false);
    }

    static Session room(String code, Channel host, String name, Deck deck, MatchConfig config, boolean publicRoom) {
        Session s = new Session(code, true, config.playerCount(), List.of(), config);
        s.publicRoom = publicRoom;
        s.seats[0].bind(host, name, deck);
        return s;
    }

    void history(java.util.function.Consumer<JsonObject> sink) { history = sink; }

    boolean isRoom() { return room; }
    boolean isPublic() { return room && publicRoom; }
    long createdAt() { return createdAt; }
    /** Entra na lista de salas públicas: aberta, com lugar, sem partida começada e com alguém conectado. */
    boolean listed() { return isPublic() && !full() && !started() && anyoneConnected(); }
    boolean started() { return match != null; }
    boolean full() { for (Seat s : seats) if (s.deck == null) return false; return true; }

    Seat seatOf(Channel ch) {
        for (Seat s : seats) if (s.channel == ch) return s;
        return null;
    }

    boolean anyoneConnected() {
        for (Seat s : seats) if (s.channel != null) return true;
        return false;
    }

    boolean gameOver() {
        HostedMatch m = match;
        GameView gv = m == null ? null : m.getGameView();
        return gv != null && gv.isGameOver();
    }

    /**
     * Resumo para a área de admin: quem está na partida, conectado ou não, e em que turno ela está.
     * Só o que aparece na mesa de qualquer jogador; sem tokens, mãos nem decks.
     */
    JsonObject adminJson() {
        JsonObject o = new JsonObject();
        o.addProperty("code", code); o.addProperty("room", room);
        o.addProperty("format", config.format()); o.addProperty("matchLength", config.matchLength()); o.addProperty("playerCount", config.playerCount());
        o.addProperty("createdAt", java.time.Instant.ofEpochMilli(createdAt).toString());
        if (playingSince > 0) o.addProperty("startedAt", java.time.Instant.ofEpochMilli(playingSince).toString());
        o.addProperty("matchId", matchId);
        o.addProperty("state", !started() ? "aguardando" : matchOver() ? "encerrada" : "sideboarding".equals(matchPhase) ? "entre jogos" : gameOver() ? "jogo encerrado" : "jogando");
        o.addProperty("gameNumber", gameNumber);
        HostedMatch m = match;
        GameView gv = m == null ? null : m.getGameView();
        if (gv != null) {
            o.addProperty("turn", gv.getTurn());
            if (gv.getPhase() != null) o.addProperty("phase", gv.getPhase().name());
            if (gv.getPlayerTurn() != null) o.addProperty("activePlayer", gv.getPlayerTurn().getName());
        }
        JsonArray players = new JsonArray();
        for (Seat seat : seats) {
            if (seat.deck == null) continue;
            JsonObject p = new JsonObject();
            p.addProperty("name", seat.name); p.addProperty("ai", false); p.addProperty("seat", seat.index);
            p.addProperty("connected", seat.channel != null); p.addProperty("conceded", seat.conceded);
            p.addProperty("deck", seat.deck.getName());
            players.add(p);
        }
        for (int i = 0; i < aiDecks.size(); i++) {
            JsonObject p = new JsonObject();
            p.addProperty("name", aiNames != null ? aiNames.get(i) : aiDecks.size() == 1 ? "Oponente" : "Oponente " + (i + 1));
            p.addProperty("ai", true); p.addProperty("deck", aiDecks.get(i).getName());
            players.add(p);
        }
        if (gv != null && gv.getPlayers() != null) for (PlayerView pv : gv.getPlayers()) for (JsonElement e : players) {
            JsonObject p = e.getAsJsonObject();
            if (p.get("name").getAsString().equals(pv.getName())) { p.addProperty("life", pv.getLife()); p.addProperty("lost", pv.getHasLost()); }
        }
        o.add("players", players);
        return o;
    }

    // ---------- Partida ----------

    synchronized void start() {
        recordAbandoned();
        stop();
        matchId = UUID.randomUUID().toString();
        events.reset(); stateVersion.set(0);
        matchPhase = "playing"; gameNumber = 1; abandoned = false;
        gameDurations.clear();
        HostedMatch m = new HostedMatch();
        MatchLifecycle life = new MatchLifecycle(game -> {
            if (match != m) return;
            if (game.isGameOver()) releaseQuestions();
            markDirty();
        });
        lifecycle = life;
        List<RegisteredPlayer> players = new ArrayList<>();
        Map<RegisteredPlayer, IGuiGame> guis = new LinkedHashMap<>();
        Set<String> names = new java.util.HashSet<>();
        for (Seat seat : seats) {
            seat.reset();
            // O frontend reconhece o vencedor pelo nome, então os humanos precisam de nomes diferentes.
            String name = seat.name;
            for (int n = 2; !names.add(name); n++) name = seat.name + " (" + n + ")";
            seat.name = name;
            WebGuiGame g = new WebGuiGame(seat.new Remote(m, life), () -> seat.autoPassNoActions, () -> seat.opponentStops, life, m::getGame);
            seat.gui = g;
            RegisteredPlayer rp = registered(seat.deck).setPlayer(new LobbyPlayerHuman(name));
            seat.registered = rp;
            players.add(rp);
            guis.put(rp, g);
        }
        for (int i = 0; i < aiDecks.size(); i++) {
            String name = aiNames != null ? aiNames.get(i) : aiDecks.size() == 1 ? "Oponente" : "Oponente " + (i + 1);
            players.add(registered(aiDecks.get(i)).setPlayer(GamePlayerUtil.createAiPlayer(name)));
        }
        // O Forge põe os humanos antes da IA (HostedMatch), então esta é a ordem dos jogadores no jogo.
        MatchJournal j = new MatchJournal(matchId, code, room, config);
        for (int i = 0; i < players.size(); i++) {
            boolean ai = i >= seats.length;
            j.player(i, players.get(i).getPlayer().getName(), ai, ai ? null : seats[i].index, players.get(i).getDeck());
        }
        journal = j;
        match = m;
        m.setEndGameHook(() -> ended(m));
        var hook = startHook;
        if (hook != null) {
            // Só no primeiro jogo: numa melhor de três, os jogos seguintes começam normalmente.
            AtomicBoolean applied = new AtomicBoolean();
            m.setStartGameHook(() -> { if (applied.compareAndSet(false, true)) hook.accept(m.getGame()); });
        }
        m.startMatch(config.rules(), null, players, guis, null);
        startedAt = playingSince = gameSince = System.currentTimeMillis(); gameMs = -1;
        Metrics.matchStarted(config.format(), room, players.size());
        System.out.printf("Nova partida%s: %s%n", room ? " na sala " + code : "",
            String.join(" x ", players.stream().map(p -> p.getDeck().getName()).toList()));
        markDirty();
    }

    private RegisteredPlayer registered(Deck deck) {
        return config.commander() ? RegisteredPlayer.forCommander(deck) : new RegisteredPlayer(deck);
    }

    /** Conta como abandonada a partida que ainda não terminou (fechada, saída ou trocada por outra). */
    synchronized void recordAbandoned() {
        // Não usa matchOver(): sair no meio também marca a série como encerrada, mas ela não foi concluída.
        HostedMatch m = match;
        boolean finished = m != null && m.getMatch() != null && m.getMatch().isMatchOver();
        if (startedAt > 0 && !finished) Metrics.matchEnded(config.format(), room, "abandonada", startedAt);
        startedAt = 0;
    }

    boolean matchOver() {
        HostedMatch m = match;
        return abandoned || (m != null && m.getMatch() != null && m.getMatch().isMatchOver());
    }

    private synchronized void ended(HostedMatch ended) {
        if (match != ended) return;
        matchPhase = matchOver() ? "complete" : "sideboarding";
        if (gameSince > 0) gameMs = System.currentTimeMillis() - gameSince;
        Metrics.gameFinished(config.format(), room);
        gameDurations.add(gameMs);
        if (ended.getMatch() != null && ended.getMatch().isMatchOver()) {
            try { history.accept(historyJson(ended.getMatch())); }
            catch (RuntimeException e) { System.err.println("Histórico: resumo da partida falhou: " + e); }
        }
        if (startedAt > 0 && ended.getMatch() != null && ended.getMatch().isMatchOver()) { Metrics.matchEnded(config.format(), room, "concluida", startedAt); startedAt = 0; }
        sideboardId++;
        for (Seat seat : seats) { seat.sideboardReady = false; seat.approvedDeck = null; }
        markDirty();
    }

    /**
     * Resumo final de uma partida concluída, uma linha do {@link MatchHistory}. Os índices de {@code winner} e dos
     * arrays de cada jogo apontam para {@code players}, na ordem do Forge (humanos antes da IA). O apelido só entra
     * nas salas em rede: contra a IA o humano não digita nome ("Você").
     *
     * {id, startedAt, endedAt, ms, format, length, mode:"ia"|"rede", public?, winner: índice|null,
     *  players:[{name?, ai, deck, colors, commander?, wins}],
     *  games:[{winner: índice|null, turns, ms?, end, result:["win"|"draw"|motivo da derrota do Forge], mull:[n]}]}
     */
    JsonObject historyJson(forge.game.Match fm) {
        long now = System.currentTimeMillis();
        JsonObject o = new JsonObject();
        o.addProperty("id", matchId);
        o.addProperty("startedAt", java.time.Instant.ofEpochMilli(playingSince).truncatedTo(java.time.temporal.ChronoUnit.SECONDS).toString());
        o.addProperty("endedAt", java.time.Instant.ofEpochMilli(now).truncatedTo(java.time.temporal.ChronoUnit.SECONDS).toString());
        o.addProperty("ms", now - playingSince);
        o.addProperty("format", config.format()); o.addProperty("length", config.matchLength());
        o.addProperty("mode", Metrics.mode(room));
        if (room) o.addProperty("public", publicRoom);
        List<RegisteredPlayer> order = fm.getPlayers();
        JsonArray players = new JsonArray();
        int best = -1, bestWins = -1;
        boolean tie = false;
        for (int i = 0; i < order.size(); i++) {
            RegisteredPlayer rp = order.get(i);
            Seat seat = null;
            for (Seat each : seats) if (each.registered == rp) seat = each;
            JsonObject p = new JsonObject();
            if (room && seat != null) p.addProperty("name", seat.name);
            p.addProperty("ai", seat == null);
            Deck deck = seat != null && seat.deck != null ? seat.deck : rp.getDeck();
            p.addProperty("deck", deck.getName());
            p.addProperty("colors", colors(deck));
            if (config.commander()) {
                List<String> commanders = new ArrayList<>();
                for (var e : deck.getOrCreate(DeckSection.Commander)) commanders.add(e.getKey().getName());
                if (!commanders.isEmpty()) p.addProperty("commander", String.join(" + ", commanders));
            }
            int wins = fm.getGamesWonBy(rp.getPlayer());
            p.addProperty("wins", wins);
            if (wins > bestWins) { best = i; bestWins = wins; tie = false; } else if (wins == bestWins) tie = true;
            players.add(p);
        }
        if (bestWins > 0 && !tie) o.addProperty("winner", best); else o.add("winner", com.google.gson.JsonNull.INSTANCE);
        o.add("players", players);
        JsonArray games = new JsonArray();
        int n = 0;
        for (forge.game.GameOutcome outcome : fm.getOutcomes()) {
            JsonObject g = new JsonObject();
            int winner = outcome.getWinningPlayer() == null ? -1 : order.indexOf(outcome.getWinningPlayer());
            if (winner >= 0) g.addProperty("winner", winner); else g.add("winner", com.google.gson.JsonNull.INSTANCE);
            g.addProperty("turns", outcome.getLastTurnNumber());
            if (n < gameDurations.size() && gameDurations.get(n) >= 0) g.addProperty("ms", gameDurations.get(n));
            if (outcome.getWinCondition() != null) g.addProperty("end", outcome.getWinCondition().name());
            JsonArray result = new JsonArray(), mull = new JsonArray();
            for (RegisteredPlayer rp : order) {
                forge.game.player.PlayerStatistics stats = null;
                for (var e : outcome) if (e.getKey() == rp) stats = e.getValue();
                var po = stats == null ? null : stats.getOutcome();
                result.add(po == null ? "draw" : po.hasWon() ? "win" : po.lossState != null ? po.lossState.name() : "draw");
                mull.add(stats == null ? 0 : stats.getMulliganCount());
            }
            g.add("result", result); g.add("mull", mull);
            games.add(g);
            n++;
        }
        o.add("games", games);
        return o;
    }

    /** Cores do deck (comandantes e grimório) em WUBRG; "C" para incolor. */
    static String colors(Deck deck) {
        int mask = 0;
        for (var section : new DeckSection[]{DeckSection.Main, DeckSection.Commander})
            for (var e : deck.getOrCreate(section)) mask |= e.getKey().getRules().getColor().getColor();
        StringBuilder sb = new StringBuilder();
        for (byte c : MagicColor.WUBRG) if ((mask & c) != 0) sb.append(MagicColor.toShortString(c));
        return sb.length() == 0 ? "C" : sb.toString();
    }

    private synchronized void submitSideboard(Seat seat, JsonObject msg, boolean unchanged) {
        if (!"sideboarding".equals(matchPhase) || match == null) return;
        if (!msg.has("id") || exactInt(msg.get("id")) != sideboardId) { markDirty(); return; }
        if (seat.sideboardReady) return;
        Deck current = seat.registered.getDeck();
        var validation = DeckValidation.validate(unchanged ? DeckValidation.deckJson(current) : msg.get("deck"), config.format());
        if (validation.valid() && !DeckValidation.poolCounts(validation.deck()).equals(DeckValidation.poolCounts(seat.deck)))
            DeckValidation.issue(validation.issues(), "registered-pool", "Use somente as cartas registradas no início da partida, sem alterar suas quantidades totais.", null, null);
        if (!validation.valid()) {
            JsonObject error = new JsonObject(); error.addProperty("type", "validation-error");
            error.addProperty("target", "sideboard"); error.add("validation", validation.json());
            seat.send(error.toString()); return;
        }
        seat.approvedDeck = validation.deck(); seat.sideboardReady = true; markDirty();
        for (Seat each : seats) if (!each.sideboardReady) return;
        HostedMatch continuing = match;
        matchPhase = "playing"; gameNumber++; gameSince = System.currentTimeMillis(); gameMs = -1;
        for (Seat each : seats) { each.inputGen.incrementAndGet(); each.clearInput(); }
        FThreads.invokeInEdtLater(() -> {
            if (match != continuing || abandoned) return;
            continuing.continueMatch();
            markDirty();
        });
    }

    private JsonObject matchJson() {
        JsonObject o = new JsonObject();
        o.addProperty("gameNumber", gameNumber); o.addProperty("over", matchOver()); o.addProperty("phase", matchPhase);
        o.addProperty("abandoned", abandoned);
        if (gameMs >= 0) o.addProperty("gameMs", gameMs);
        // Enquanto o jogo corre, quanto tempo já passou (não a hora de início, para o relógio do navegador não importar).
        else if (gameSince > 0 && "playing".equals(matchPhase)) o.addProperty("elapsedMs", System.currentTimeMillis() - gameSince);
        JsonArray wins = new JsonArray(), ready = new JsonArray();
        int draws = 0;
        HostedMatch m = match;
        if (m != null && m.getMatch() != null) {
            for (RegisteredPlayer p : m.getMatch().getPlayers()) wins.add(m.getMatch().getGamesWonBy(p.getPlayer()));
            for (var outcome : m.getMatch().getOutcomes()) if (outcome.isDraw()) draws++;
        }
        for (Seat seat : seats) ready.add(seat.sideboardReady);
        for (Deck ignored : aiDecks) ready.add(true);
        o.add("wins", wins); o.add("ready", ready); o.addProperty("draws", draws);
        return o;
    }

    private JsonObject sideboardingJson(Seat seat) {
        Deck d = seat.approvedDeck == null ? seat.registered.getDeck() : seat.approvedDeck;
        JsonObject o = new JsonObject(); o.addProperty("id", sideboardId); o.addProperty("ready", seat.sideboardReady);
        o.add("main", DeckValidation.entries(d.getMain()));
        o.add("sideboard", DeckValidation.entries(d.getOrCreate(DeckSection.Sideboard)));
        return o;
    }

    /** Abandona a partida atual: concede e libera a thread do jogo se ela estiver esperando uma resposta. */
    synchronized void stop() {
        lifecycle.requestStop();
        releaseQuestions();
        match = null;
        for (Seat seat : seats) { seat.gui = null; seat.me = null; }
    }

    private void releaseQuestions() {
        for (Seat seat : seats) {
            seat.inputGen.incrementAndGet();
            Question q = seat.question;
            seat.question = null;
            if (q != null) q.answer().complete(defaultAnswer(q));
        }
    }

    /** Explicit departure ends an unfinished series; a completed result remains intact. */
    synchronized void abandon(Seat seat) {
        if (!config.commander() && !matchOver()) {
            abandoned = true;
            matchPhase = "complete";
            markDirty();
        }
        concede(seat);
    }

    /** Concede o jogo atual; entre jogos, encerra a partida sem inventar vitórias. */
    synchronized void concede(Seat seat) {
        if ("sideboarding".equals(matchPhase)) { abandoned = true; matchPhase = "complete"; markDirty(); }
        HostedMatch current = match;
        if (current == null || current.getGame() == null || gameOver() || seat.me == null) return;
        lifecycle.requestConcede(current.getGame(), seat.me.getId());
        // Release answers after publishing the request, so the game thread sees it on wake-up.
        for (Seat each : seats) {
            if (config.commander() && each != seat) continue;
            Question q = each.question;
            each.question = null;
            each.inputGen.incrementAndGet(); each.clearInput();
            if (q != null) q.answer().complete(defaultAnswer(q));
        }
        markDirty();
    }

    // ---------- Mensagens do navegador ----------

    /** Diário atual (null antes de a partida começar). */
    MatchJournal journal() { return journal; }

    void onClientMessage(Seat seat, Channel source, String type, JsonObject msg) {
        if (seat.eliminated() && !Set.of("preferences", "hello").contains(type)) { rejectStaleAction(seat, type); return; }
        int actionGen = -1;
        if (Set.of("card", "attack", "attack-all", "attack-group", "block", "player", "stack", "mana", "ok", "cancel", "pass-turn", "resolve-all", "select-set").contains(type)) {
            if (!msg.has("gen") || !msg.get("gen").isJsonPrimitive() || !msg.get("gen").getAsJsonPrimitive().isNumber()) { rejectStaleAction(seat, type); return; }
            actionGen = exactInt(msg.get("gen"));
            if (actionGen != seat.inputGen.get() || seat.question != null || !"playing".equals(matchPhase)) { rejectStaleAction(seat, type, actionGen); return; }
        }
        final int genAtClick = actionGen;
        log(seat, type, genAtClick, "recebida", actionDetail(seat, type, msg));
        switch (type) {
            case "preferences" -> seat.updatePreferences(source, msg);
            case "sideboard" -> submitSideboard(seat, msg, false);
            case "next-game" -> submitSideboard(seat, msg, true);
            case "hello" -> markDirty();
            case "ok", "cancel" -> {
                int gen = genAtClick;
                // Clique repetido no mesmo prompt só vale depois da trava: se o Forge recusou a ação (bloqueio
                // inválido, por exemplo), o prompt continua o mesmo e o jogador precisa poder tentar de novo.
                if (gen != seat.inputGen.get() || seat.buttonsLocked()) { markDirty(); break; }
                seat.consumedGen = gen;
                seat.consumedAt = System.currentTimeMillis();
                markDirty();
                seat.onEdt(genAtClick, "ok".equals(type) ? IGameController::selectButtonOk : IGameController::selectButtonCancel);
            }
            case "pass-turn" -> {
                if (!seat.livePriority() || seat.buttonsLocked() || !seat.okEnabled || seat.question != null) { markDirty(); break; }
                seat.consumedGen = genAtClick; seat.consumedAt = System.currentTimeMillis();
                seat.onEdt(genAtClick, c -> {
                    if (seat.livePriority() && seat.question == null)
                        c.applyYieldUpdate(new YieldUpdate.SetAutoPassUntilEndOfTurn(seat.me, true));
                    markDirty();
                });
                markDirty();
            }
            case "resolve-all" -> {
                // Passa até a pilha esvaziar, como o "Resolver tudo" do Forge. Respeita interrupções: se alguém
                // acrescentar algo à pilha ou o jogo pedir uma decisão sua, a vez volta para você.
                if (!seat.livePriority() || seat.buttonsLocked() || !seat.okEnabled || seat.question != null) { markDirty(); break; }
                seat.consumedGen = genAtClick; seat.consumedAt = System.currentTimeMillis();
                seat.onEdt(genAtClick, c -> {
                    if (seat.livePriority() && seat.question == null)
                        c.applyYieldUpdate(new YieldUpdate.StackYield(seat.me, true, true));
                    markDirty();
                });
                markDirty();
            }
            case "skip-vote" -> voteSkip(seat, msg);
            case "concede" -> { if (isRoom()) seat.conceded = true; concede(seat); }
            case "attack" -> {
                int attacker = exactInt(msg.get("attacker")), defender = exactInt(msg.get("defender"));
                String kind = MatchConfig.string(msg, "defenderKind");
                seat.onEdt(genAtClick, c -> {
                    if (!(c instanceof PlayerControllerHuman human)
                        || !InputContext.assignAttack(human.getInputQueue().getInput(), attacker, defender, kind))
                        seat.send(toast("error", "Esse ataque não é válido. Escolha um defensor permitido."));
                    markDirty();
                });
            }
            case "attack-all" -> {
                int defender = exactInt(msg.get("defender"));
                String kind = MatchConfig.string(msg, "defenderKind");
                seat.onEdt(genAtClick, type, c -> {
                    if (!(c instanceof PlayerControllerHuman human)
                        || !InputContext.assignAllAttackers(human.getInputQueue().getInput(), defender, kind))
                        seat.send(toast("error", "Não foi possível atacar com todas as criaturas. Escolha um defensor permitido antes de declarar atacantes."));
                    markDirty();
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
                        seat.send(toast("error", "Não foi possível atualizar os ataques desse grupo. Revise as criaturas selecionadas."));
                    markDirty();
                });
            }
            case "block" -> {
                int attacker = exactInt(msg.get("attacker")), blocker = exactInt(msg.get("blocker"));
                seat.onEdt(genAtClick, c -> {
                    if (!(c instanceof PlayerControllerHuman human)
                        || !InputContext.assignBlock(human.getInputQueue().getInput(), attacker, blocker))
                        seat.send(toast("error", "Esse bloqueio não é válido. Escolha um atacante permitido."));
                    markDirty();
                });
            }
            case "card" -> {
                CardView cv = findCard(seat, msg.get("id").getAsInt());
                // Uma carta virada para mana que ainda está na reserva: o clique desvira e devolve a mana.
                if (cv != null) seat.onEdt(genAtClick, c -> { if (ManaUndo.untap(c, cv.getId())) markDirty(); else c.selectCard(cv, null, null); });
            }
            case "stack" -> {
                int id = exactInt(msg.get("id"));
                if (!seat.selectableStacks.contains(id)) { markDirty(); break; }
                GameView view = match == null ? null : match.getGameView();
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
                        seat.send(toast("error", "Não foi possível marcar essa escolha. Toque de novo nas permanentes e jogadores."));
                    markDirty();
                });
            }
            case "player" -> {
                PlayerView pv = findPlayer(msg.get("id").getAsInt());
                if (pv != null) seat.onEdt(genAtClick, c -> c.selectPlayer(pv, null));
            }
            case "answer" -> answer(seat, msg);
            default -> { }
        }
    }

    private void log(Seat seat, String type, int gen, String result, String detail) {
        MatchJournal j = journal;
        if (j != null && type != null) j.action(seat.index, type, gen, stateVersion.get(), result, detail);
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
                case "answer" -> {
                    Question q = seat.question;
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

    private void rejectStaleAction(Seat seat, String type) { rejectStaleAction(seat, type, -1); }

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
        markDirty();
    }

    private static int exactInt(JsonElement value) {
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber())
            throw new IllegalArgumentException("Identificador inválido.");
        try { return value.getAsBigDecimal().intValueExact(); }
        catch (ArithmeticException e) { throw new IllegalArgumentException("Identificador inválido."); }
    }

    private static String str(JsonObject o, String key, String def) {
        return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString() : def;
    }

    /** Procura a carta só nas zonas que este jogador pode ver: a mão do oponente fica de fora. */
    private CardView findCard(Seat seat, int id) {
        GameView gv = match == null ? null : match.getGameView();
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
        GameView gv = match == null ? null : match.getGameView();
        if (gv == null) return null;
        for (PlayerView p : gv.getPlayers()) if (p.getId() == id) return p;
        return null;
    }

    private static Iterable<CardView> nz(Iterable<CardView> it) { return it == null ? List.of() : it; }

    // ---------- Perguntas que bloqueiam a thread do jogo ----------

    private Object ask(Seat seat, GuiGameEvent ev, HostedMatch hosted, MatchLifecycle life) {
        Object[] a = ev.getObjects();
        JsonObject q = new JsonObject();
        List<Object> options = new ArrayList<>();
        int id = questionSeq.incrementAndGet();
        q.addProperty("id", id);
        q.addProperty("method", ev.getMethod().name());

        switch (ev.getMethod()) {
            case sideboard -> {
                Deck approved = seat.approvedDeck;
                if (approved == null) throw new IllegalStateException("Confirme o sideboard antes de continuar.");
                return approved.getMain().toFlatList();
            }
            case getChoices -> {
                // min/max -1: é um reveal() do Forge (Explore, revelar o topo...), só para mostrar as cartas.
                q.addProperty("kind", (Integer) a[1] < 0 ? "reveal" : "choose");
                q.addProperty("title", String.valueOf(a[0]));
                q.addProperty("min", (Integer) a[1]);
                q.addProperty("max", (Integer) a[2]);
                @SuppressWarnings("unchecked") FSerializableFunction<Object, String> display = (FSerializableFunction<Object, String>) a[5];
                options.addAll((Collection<?>) a[3]);
                JsonArray rows = optionsJson(options, display);
                Dungeons.roomChoice(hosted.getGame(), options, rows, q);
                q.add("options", rows);
                CoinFlipText.choice(q);
                voteQuestion(q, hosted.getGame());
            }
            case getAbilityToPlay -> {
                Collection<?> abilities = (Collection<?>) a[1];
                if (abilities.size() == 1) return abilities.iterator().next();
                q.addProperty("kind", "choose");
                q.addProperty("title", "Qual habilidade usar?");
                q.addProperty("min", 0);
                q.addProperty("max", 1);
                if (a[0] != null) q.add("card", StateJson.card((CardView) a[0]));
                options.addAll((Collection<?>) a[1]);
                JsonArray rows = optionsJson(options, null);
                if (seat.controller() instanceof PlayerControllerHuman human) {
                    AbilityOptions.describe(human, options, rows);
                    AbilityOptions.addCosts(human, options, rows);
                }
                q.addProperty("purpose", "play-mode");
                q.add("options", rows);
            }
            case chooseSingleEntityForEffect -> {
                q.addProperty("kind", "choose");
                q.addProperty("title", String.valueOf(a[0]));
                q.addProperty("min", Boolean.TRUE.equals(a[3]) ? 0 : 1);
                q.addProperty("max", 1);
                options.addAll((Collection<?>) a[1]);
                q.add("options", optionsJson(options, null));
                voteQuestion(q, hosted.getGame());
            }
            case chooseEntitiesForEffect -> {
                q.addProperty("kind", "choose");
                q.addProperty("title", String.valueOf(a[0]));
                q.addProperty("min", (Integer) a[2]);
                q.addProperty("max", (Integer) a[3]);
                options.addAll((Collection<?>) a[1]);
                q.add("options", optionsJson(options, null));
            }
            case order -> {
                q.addProperty("title", String.valueOf(a[0]));
                options.addAll((Collection<?>) a[4]);
                int remMin = (Integer) a[2], remMax = (Integer) a[3];
                if (remMin == 0 && remMax == 0) {
                    // Uma ordem já escolhida antes (os mesmos gatilhos de novo) chega pronta na lista de destino.
                    if (a[5] instanceof Collection<?> placed) options.addAll(placed);
                    q.addProperty("kind", "order");
                } else {
                    // many(): escolher um subconjunto (ex.: vidência "quais vão para o fundo"); os que sobram ficam de fora.
                    q.addProperty("kind", "choose");
                    q.addProperty("min", remMax < 0 ? 0 : Math.max(0, options.size() - remMax));
                    q.addProperty("max", remMin < 0 ? options.size() : options.size() - remMin);
                }
                JsonArray rows = optionsJson(options, null);
                if ("order".equals(q.get("kind").getAsString()) && AbilityOptions.triggers(options, rows)) q.addProperty("purpose", "triggers");
                q.add("options", rows);
            }
            case confirm -> {
                q.addProperty("kind", "confirm");
                q.addProperty("title", String.valueOf(a[1]));
                if (a[0] != null) q.add("card", StateJson.card((CardView) a[0]));
                @SuppressWarnings("unchecked") List<String> labels = (List<String>) a[3];
                q.add("options", labelsJson(labels == null || labels.size() < 2 ? List.of("Sim", "Não") : labels));
                commanderZone(q, a[0] instanceof CardView cv ? cv : null, String.valueOf(a[1]));
            }
            case showConfirmDialog -> {
                q.addProperty("kind", "confirm");
                q.addProperty("title", String.valueOf(a[0]));
                q.add("options", labelsJson(List.of(String.valueOf(a[2]), String.valueOf(a[3]))));
            }
            case showOptionDialog -> {
                q.addProperty("kind", "choose");
                q.addProperty("title", String.valueOf(a[0]));
                q.addProperty("min", 1);
                q.addProperty("max", 1);
                @SuppressWarnings("unchecked") List<String> labels = (List<String>) a[3];
                options.addAll(labels);
                q.add("options", optionsJson(options, null));
            }
            case showInputDialog -> {
                @SuppressWarnings("unchecked") List<String> choices = (List<String>) a[4];
                q.addProperty("title", String.valueOf(a[0]));
                if (choices != null && !choices.isEmpty()) {
                    q.addProperty("kind", "choose");
                    q.addProperty("min", 1);
                    q.addProperty("max", 1);
                    options.addAll(choices);
                    q.add("options", optionsJson(options, null));
                } else {
                    q.addProperty("kind", "text");
                    q.addProperty("initial", a[3] == null ? "" : String.valueOf(a[3]));
                    q.addProperty("numeric", Boolean.TRUE.equals(a[5]));
                }
            }
            case assignGenericAmount -> {
                @SuppressWarnings("unchecked") Map<Object, Integer> limits = (Map<Object, Integer>) a[1];
                int total = (Integer) a[2], min = Boolean.TRUE.equals(a[3]) ? 1 : 0;
                if (total <= 0) return Map.of();
                options.addAll(limits.keySet());
                q.addProperty("kind", "amount"); q.addProperty("total", total);
                q.addProperty("title", "Distribua o total entre as opções");
                if (a[0] instanceof CardView card) q.add("card", StateJson.card(card));
                JsonArray rows = optionsJson(options, null);
                for (int i = 0; i < options.size(); i++) {
                    JsonObject row = rows.get(i).getAsJsonObject();
                    row.addProperty("min", min); row.addProperty("max", Math.min(total, limits.get(options.get(i))));
                }
                q.add("options", rows);
            }
            case assignCombatDamage -> {
                // Bloqueio duplo (ou atropelar): o jogador escolhe como dividir o dano, com a divisão automática pronta.
                @SuppressWarnings("unchecked") List<CardView> blockers = (List<CardView>) a[1];
                if (blockers == null || blockers.isEmpty() || (Integer) a[2] <= 0) return autoCombatDamage(a);
                CombatDamage.describe(q, options, a);
            }
            case manipulateCardList -> {
                List<CardView> out = new ArrayList<>();
                ((Iterable<?>) a[1]).forEach(o -> out.add((CardView) o));
                return out;
            }
            default -> {
                seat.send(toast("error", "Esta decisão ainda não é suportada: " + ev.getMethod() + "."));
                if (Boolean.getBoolean("mesa.strictPrompts")) throw new IllegalStateException("Unsupported prompt: " + ev.getMethod());
                return null;
            }
        }

        Question question = new Question(id, ev.getMethod(), a, options, new CompletableFuture<>(), q);
        var game = hosted.getGame();
        int playerId = seat.me == null ? -1 : seat.me.getId();
        if (life.cancelled() || life.isConceding(game, playerId) || seat.eliminated()) return defaultAnswer(question);
        seat.question = question;
        // A close can race the precheck: publish first, then observe its cancellation flag again.
        if (life.cancelled() || life.isConceding(game, playerId) || seat.eliminated() || (game != null && game.isGameOver()))
            question.answer().complete(defaultAnswer(question));
        markDirty();
        try {
            if (FThreads.isGuiThread() && GuiBase.getInterface() instanceof HeadlessGui headless)
                return headless.awaitBrowserAnswer(question.answer());
            while (true) {
                life.pump(game);
                if (life.cancelled() || game.isGameOver() || life.isConceding(game, playerId))
                    question.answer().complete(defaultAnswer(question));
                try {
                    return GuiBase.getInterface() instanceof HeadlessGui headless
                        ? headless.awaitGameAnswer(question.answer(), 50)
                        : question.answer().get(50, java.util.concurrent.TimeUnit.MILLISECONDS);
                }
                catch (java.util.concurrent.TimeoutException waiting) { /* Pump this game's lifecycle only. */ }
            }
        } catch (Exception e) {
            return defaultAnswer(question);
        } finally {
            if (seat.question == question) { seat.question = null; seat.inputGen.incrementAndGet(); }
            markDirty();
        }
    }

    private void answer(Seat seat, JsonObject msg) {
        Question q = seat.question;
        if (q == null || !msg.has("id") || exactInt(msg.get("id")) != q.id()) return;
        validateAnswer(q, msg);
        Object result;
        switch (q.method()) {
            case confirm, showConfirmDialog -> result = msg.get("value").getAsBoolean();
            case showOptionDialog -> result = firstIndex(msg);
            case showInputDialog -> result = q.options().isEmpty() ? str(msg, "text", "") : pick(q, msg).stream().findFirst().orElse(null);
            case getAbilityToPlay, chooseSingleEntityForEffect -> result = pick(q, msg).stream().findFirst().orElse(null);
            case order -> result = new IGuiGame.OrderResult<>(pick(q, msg), false);
            case assignCombatDamage -> result = CombatDamage.result(q.options(), CombatDamage.validate(q.json(), msg.get("amounts")));
            case assignGenericAmount -> {
                int[] values = AmountAllocation.validate(q.json(), msg.get("amounts"));
                Map<Object, Integer> allocation = new LinkedHashMap<>();
                for (int i = 0; i < values.length; i++) allocation.put(q.options().get(i), values[i]);
                result = allocation;
            }
            default -> result = pick(q, msg);
        }
        q.answer().complete(result);
    }

    /**
     * Regra 903.9a: o comandante foi para o cemitério ou o exílio e o dono pode mandá-lo para a zona de comando.
     * O Forge só manda o texto da regra em inglês; a pergunta ganha onde o comandante está, e a mesa nomeia os
     * botões ("Enviar à zona de comando" ou "Manter no cemitério"). "Sim" continua sendo enviar.
     */
    private static void commanderZone(JsonObject q, CardView commander, String text) {
        if (commander == null || !text.contains("its owner may put it into the command zone")) return;
        q.addProperty("purpose", "commander-zone");
        // Título curto em português para a barra da pergunta minimizada e mesas antigas.
        q.addProperty("title", "Enviar o comandante para a zona de comando?");
        ZoneType zone = commander.getZone();
        q.addProperty("zone", zone == null ? "Graveyard" : zone.name());
    }

    private static void validateAnswer(Question q, JsonObject msg) {
        if (q.method() == ProtocolMethod.confirm || q.method() == ProtocolMethod.showConfirmDialog) {
            if (!msg.has("value") || !msg.get("value").isJsonPrimitive() || !msg.get("value").getAsJsonPrimitive().isBoolean())
                throw new IllegalArgumentException("Escolha uma resposta válida.");
            return;
        }
        if (q.method() == ProtocolMethod.assignGenericAmount) { AmountAllocation.validate(q.json(), msg.get("amounts")); return; }
        if (q.method() == ProtocolMethod.assignCombatDamage) { CombatDamage.validate(q.json(), msg.get("amounts")); return; }
        if (q.method() == ProtocolMethod.showInputDialog && q.options().isEmpty()) {
            String text = MatchConfig.string(msg, "text");
            if (text.length() > 1000) throw new IllegalArgumentException("A resposta é longa demais.");
            if (Boolean.TRUE.equals(q.args()[5])) try { Integer.parseInt(text); }
                catch (NumberFormatException e) { throw new IllegalArgumentException("Informe um número inteiro."); }
            return;
        }
        JsonArray indices = msg.has("indices") && msg.get("indices").isJsonArray() ? msg.getAsJsonArray("indices") : new JsonArray();
        Set<Integer> unique = new java.util.HashSet<>();
        for (JsonElement e : indices) {
            int i;
            try { i = exactInt(e); } catch (RuntimeException ex) { throw new IllegalArgumentException("Seleção inválida."); }
            if (i < 0 || i >= q.options().size() || !unique.add(i)) throw new IllegalArgumentException("Seleção inválida.");
        }
        String kind = q.json().get("kind").getAsString();
        if ("order".equals(kind) && unique.size() != q.options().size()) throw new IllegalArgumentException("Ordene todas as opções.");
        if ("choose".equals(kind)) {
            int min = q.json().has("min") ? q.json().get("min").getAsInt() : 0;
            int max = q.json().has("max") ? q.json().get("max").getAsInt() : q.options().size();
            if (unique.size() < min || (max >= 0 && unique.size() > max)) throw new IllegalArgumentException("A quantidade de opções selecionadas é inválida.");
        }
    }

    private static int firstIndex(JsonObject msg) {
        JsonArray idx = msg.getAsJsonArray("indices");
        return idx == null || idx.isEmpty() ? 0 : idx.get(0).getAsInt();
    }

    private static List<Object> pick(Question q, JsonObject msg) {
        List<Object> out = new ArrayList<>();
        JsonArray idx = msg.getAsJsonArray("indices");
        if (idx != null) for (JsonElement e : idx) {
            int i = e.getAsInt();
            if (i >= 0 && i < q.options().size()) out.add(q.options().get(i));
        }
        return out;
    }

    private static Object defaultAnswer(Question q) {
        return switch (q.method()) {
            case confirm -> q.args()[2];
            case showConfirmDialog -> q.args()[4];
            case showOptionDialog -> q.args()[4];
            case showInputDialog -> q.args()[3];
            case order -> new IGuiGame.OrderResult<>(isSubset(q) ? new ArrayList<>() : new ArrayList<>(q.options()), false);
            // Only used while a game is being abandoned, to release the blocked engine safely.
            case assignGenericAmount -> {
                Map<Object, Integer> allocation = new LinkedHashMap<>();
                int remaining = q.json().get("total").getAsInt();
                JsonArray bounds = q.json().getAsJsonArray("options");
                for (int i = 0; i < q.options().size(); i++) {
                    int min = bounds.get(i).getAsJsonObject().get("min").getAsInt();
                    allocation.put(q.options().get(i), min); remaining -= min;
                }
                for (int i = 0; i < q.options().size() && remaining > 0; i++) {
                    Object target = q.options().get(i);
                    int extra = Math.min(remaining, bounds.get(i).getAsJsonObject().get("max").getAsInt() - allocation.get(target));
                    allocation.merge(target, extra, Integer::sum); remaining -= extra;
                }
                yield allocation;
            }
            case assignCombatDamage -> autoCombatDamage(q.args());
            case getChoices, chooseEntitiesForEffect -> new ArrayList<>(q.options().subList(0, Math.max(0, Math.min(q.options().size(), (Integer) (q.method() == ProtocolMethod.getChoices ? q.args()[1] : q.args()[2])))));
            default -> null;
        };
    }

    private static boolean isSubset(Question q) {
        return (Integer) q.args()[2] != 0 || (Integer) q.args()[3] != 0;
    }

    /** Dano letal em cada bloqueador, na ordem; o resto vai para o defensor (atropelar) ou para o último bloqueador. */
    private static Map<CardView, Integer> autoCombatDamage(Object[] a) {
        @SuppressWarnings("unchecked") List<CardView> blockers = (List<CardView>) a[1];
        int damage = (Integer) a[2];
        GameEntityView defender = (GameEntityView) a[3];
        Map<CardView, Integer> map = new HashMap<>();
        for (int i = 0; i < blockers.size() && damage > 0; i++) {
            CardView b = blockers.get(i);
            int lethal = Math.max(1, b.getLethalDamage());
            int amt = Math.min(damage, lethal);
            map.merge(b, amt, Integer::sum);
            damage -= amt;
        }
        if (damage > 0) {
            if (defender != null) map.put(null, damage);
            else if (!blockers.isEmpty()) map.merge(blockers.get(blockers.size() - 1), damage, Integer::sum);
        }
        return map;
    }

    private static JsonArray optionsJson(List<Object> options, FSerializableFunction<Object, String> display) {
        JsonArray arr = new JsonArray();
        for (Object o : options) {
            JsonObject j = new JsonObject();
            if (o instanceof CardView cv) { j.addProperty("kind", "card"); j.add("card", StateJson.card(cv)); }
            else if (o instanceof PlayerView pv) { j.addProperty("kind", "player"); j.addProperty("id", pv.getId()); }
            j.addProperty("label", display != null ? display.apply(o) : String.valueOf(o));
            arr.add(j);
        }
        return arr;
    }

    /** Pedido de voto: a carta que vota e os votos já dados, para a mesa explicar cada opção. */
    private void voteQuestion(JsonObject q, forge.game.Game game) {
        SpellAbility vote = Votes.current(game);
        if (vote == null || vote.getHostCard() == null || !Votes.isVotePrompt(q.get("title").getAsString())) return;
        q.addProperty("purpose", "vote");
        q.addProperty("title", "Votação: " + vote.getHostCard().getName());
        q.add("card", StateJson.card(vote.getHostCard().getView()));
        q.add("votes", votesJson(game, voteTally.of(vote)));
    }

    private static JsonArray votesJson(forge.game.Game game, List<String[]> votes) {
        JsonArray arr = new JsonArray();
        for (String[] v : votes) {
            for (forge.game.player.Player p : game.getRegisteredPlayers()) if (p.getName().equals(v[0])) {
                JsonObject j = new JsonObject(); j.addProperty("player", p.getId()); j.addProperty("label", v[1]); arr.add(j); break;
            }
        }
        return arr;
    }

    /** Anúncio de voto do Forge (em inglês, com a contagem crua): guarda a contagem e vira um aviso curto. */
    private String voteNotice(forge.game.Game game, String text) {
        SpellAbility vote = Votes.current(game);
        if (vote == null) return text;
        List<String> names = game.getRegisteredPlayers().stream().map(forge.game.player.Player::getName).toList();
        List<String[]> votes = Votes.parse(text, names);
        if (votes == null) return text;
        voteTally.observe(vote, votes);
        String notice = Votes.notice(text, names);
        return notice != null ? notice : text;
    }

    private static JsonArray labelsJson(List<String> labels) {
        JsonArray arr = new JsonArray();
        labels.forEach(arr::add);
        return arr;
    }

    // ---------- Pular o turno de quem caiu ----------

    /** Assentos que podem votar agora: conectados, ainda no jogo e diferentes do alvo. */
    private Set<Integer> skipVoters(int target) {
        Set<Integer> voters = new java.util.LinkedHashSet<>();
        for (Seat each : seats) if (each.index != target && each.channel != null && each.me != null && !each.eliminated()) voters.add(each.index);
        return voters;
    }

    private Seat seatOfPlayer(int playerId) {
        for (Seat each : seats) if (each.me != null && each.me.getId() == playerId) return each;
        return null;
    }

    /** {type:"skip-vote", target: id do jogador, value: true|false}. Abre a votação ou registra o voto. */
    private void voteSkip(Seat voter, JsonObject msg) {
        if (!isRoom() || !started() || !"playing".equals(matchPhase) || voter.channel == null || voter.eliminated()) return;
        if (!msg.has("target")) return;
        Seat target = seatOfPlayer(exactInt(msg.get("target")));
        if (target == null || target == voter || target.channel != null || target.eliminated() || target.departed) {
            voter.send(toast("error", "Só dá para votar para pular o turno de um jogador desconectado.")); return;
        }
        boolean value = !msg.has("value") || msg.get("value").getAsBoolean();
        synchronized (skipApproved) {
            if (skipApproved.contains(target.index)) return;
            if (skipVote != null && skipVote.target != target.index) {
                voter.send(toast("error", "Já há uma votação aberta. Espere ela terminar.")); return;
            }
            boolean opened = skipVote == null;
            if (opened) skipVote = new SkipVote(target.index);
            skipVote.vote(voter.index, value);
            if (opened) for (Seat each : seats) if (each != voter && each != target)
                each.send(toast("toast", voter.name + " abriu uma votação para pular o turno de " + target.name + "."));
            settleSkipVote();
        }
        markDirty();
    }

    /** Fecha a votação se já há maioria (ou se ela ficou impossível). Chamado com o lock de skipApproved. */
    private void settleSkipVote() {
        if (skipVote == null) return;
        Seat target = seats[skipVote.target];
        if (target.channel != null) { skipVote = null; return; }
        SkipVote.Result r = skipVote.result(skipVoters(skipVote.target));
        if (r == SkipVote.Result.OPEN) return;
        skipVote = null;
        if (r == SkipVote.Result.APPROVED) {
            skipApproved.add(target.index);
            broadcast(toast("toast", "Aprovado: o turno de " + target.name + " será pulado."));
        } else broadcast(toast("toast", "A votação para pular o turno de " + target.name + " não passou."));
    }

    private void broadcast(String message) { for (Seat each : seats) each.send(message); }

    /** A cada tick: quem voltou cancela tudo; quem foi aprovado tem o turno passado pela ponte. */
    private void tickSkips() {
        if (!isRoom()) return;
        boolean changed = false;
        synchronized (skipApproved) {
            if (skipVote != null) {
                SkipVote before = skipVote;
                settleSkipVote();
                changed |= skipVote != before;
            }
            if (skipApproved.isEmpty()) { if (changed) markDirty(); return; }
            HostedMatch m = match;
            GameView gv = m == null ? null : m.getGameView();
            PlayerView active = gv == null ? null : gv.getPlayerTurn();
            for (Integer index : List.copyOf(skipApproved)) {
                Seat seat = seats[index];
                boolean back = seat.channel != null, gone = seat.eliminated() || gv == null || gv.isGameOver();
                boolean theirTurn = active != null && seat.me != null && active.getId() == seat.me.getId();
                if (theirTurn) skipTurnStarted.add(index);
                boolean turnOver = skipTurnStarted.contains(index) && !theirTurn;
                if (back || gone || turnOver) {
                    skipApproved.remove(index); skipTurnStarted.remove(index); changed = true;
                    if (turnOver && !back && !gone) broadcast(toast("toast", "O turno de " + seat.name + " foi pulado."));
                    if (back) broadcast(toast("toast", seat.name + " voltou e joga normalmente."));
                    continue;
                }
                autopilot(seat);
            }
        }
        if (changed) markDirty();
    }

    /**
     * Passa a vez pelo jogador desconectado, sem jogar nada: responde perguntas com a escolha padrão, passa a
     * prioridade, não ataca nem bloqueia e, na limpeza, descarta as primeiras cartas que o Forge oferecer.
     */
    private void autopilot(Seat seat) {
        Question q = seat.question;
        if (q != null) { if (!q.answer().isDone()) q.answer().complete(defaultAnswer(q)); return; }
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
            CardView cv = findCard(seat, seat.selectable.iterator().next());
            if (cv != null) { seat.onEdt(gen, c -> c.selectCard(cv, null, null)); return; }
        }
        if (seat.okEnabled) seat.onEdt(gen, IGameController::selectButtonOk);
        else if (seat.cancelEnabled) seat.onEdt(gen, IGameController::selectButtonCancel);
    }

    /** Para a mesa: a votação aberta, como está e o voto deste assento; e quem já tem o turno aprovado para pular. */
    private JsonObject skipJson(Seat seat) {
        if (!isRoom()) return null;
        synchronized (skipApproved) {
            if (skipVote == null && skipApproved.isEmpty()) return null;
            JsonObject o = new JsonObject();
            if (skipVote != null) {
                Seat target = seats[skipVote.target];
                Set<Integer> voters = skipVoters(skipVote.target);
                JsonObject v = new JsonObject();
                if (target.me != null) v.addProperty("target", target.me.getId());
                v.addProperty("name", target.name);
                v.addProperty("yes", skipVote.yes.size());
                v.addProperty("no", skipVote.no.size());
                v.addProperty("voters", voters.size());
                v.addProperty("needed", SkipVote.needed(voters.size()));
                v.addProperty("canVote", voters.contains(seat.index));
                if (skipVote.yes.contains(seat.index)) v.addProperty("mine", "yes");
                else if (skipVote.no.contains(seat.index)) v.addProperty("mine", "no");
                o.add("vote", v);
            }
            JsonArray skipping = new JsonArray();
            for (Integer index : skipApproved) if (seats[index].me != null) skipping.add(seats[index].me.getId());
            o.add("skipping", skipping);
            return o;
        }
    }

    // ---------- Publicação do estado ----------

    void markDirty() { stateVersion.incrementAndGet(); dirty.set(true); }

    /** Chamado pelo publicador de {@link Rooms} a cada 50 ms. */
    void tick() {
        tickSkips();
        // Se o Forge não abriu um prompt novo depois do clique, os botões voltam a funcionar.
        for (Seat seat : seats) if (seat.lockedAtLastFlush && !seat.buttonsLocked()) dirty.set(true);
        if (!dirty.getAndSet(false)) return;
        for (Seat seat : seats) {
            if (seat.channel == null) continue;
            JsonObject state = state(seat);
            if (state == null) { dirty.set(true); return; }
            seat.send(state.toString());
            if (state.has("eventCursor")) seat.sentEventCursor = state.get("eventCursor").getAsLong();
        }
    }

    private static java.lang.reflect.Field selectTargetsSa, payManaSa, payManaEffect, mulliganStartingPlayer, londonReturnCount;

    /**
     * O que o pagamento de mana paga, para a mesa dizer o que o Cancelar desfaz: "spell" (a conjuração volta atrás),
     * "ability" (a ativação volta atrás) ou "effect" (um custo pedido no meio de um efeito, como "a menos que pague
     * {3}"; cancelar é só não pagar). O Forge guarda isso em campos protegidos do input.
     */
    static String payingFor(InputPayMana in) {
        try {
            if (payManaEffect == null) payManaEffect = accessible(InputPayMana.class, "effect");
            if (payManaEffect.getBoolean(in)) return "effect";
            if (payManaSa == null) payManaSa = accessible(InputPayMana.class, "saPaidFor");
            SpellAbility sa = (SpellAbility) payManaSa.get(in);
            return sa == null ? null : sa.isSpell() ? "spell" : "ability";
        } catch (ReflectiveOperationException | RuntimeException e) {
            return null;
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
                if (selectTargetsSa == null) selectTargetsSa = accessible(InputSelectTargets.class, "sa");
                sa = (SpellAbility) selectTargetsSa.get(in);
            } else if (in instanceof InputPayMana) {
                if (payManaSa == null) payManaSa = accessible(InputPayMana.class, "saPaidFor");
                sa = (SpellAbility) payManaSa.get(in);
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
            return o;
        } catch (ReflectiveOperationException | RuntimeException e) {
            return null;
        }
    }

    private static java.lang.reflect.Field accessible(Class<?> c, String name) throws NoSuchFieldException {
        java.lang.reflect.Field f = c.getDeclaredField(name);
        f.setAccessible(true);
        return f;
    }

    /**
     * Outros jogadores humanos com uma decisão aberta (alvo, sacrifício, pergunta, ataque ou bloqueio), para a mesa
     * avisar "Aguardando Fulano escolher" em vez de parecer travada. Prioridade comum fica de fora.
     */
    private JsonArray deciding(Seat viewer) {
        JsonArray list = new JsonArray();
        for (Seat other : seats) {
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

    /** Monta o estado visto por um jogador; null se uma leitura concorrente falhar (refeita no próximo ciclo). */
    private JsonObject state(Seat seat) {
        HostedMatch m = match;
        GameView gv = m == null ? null : m.getGameView();
        JsonObject state;
        try {
            if (gv == null) {
                state = new JsonObject();
                state.addProperty("type", "lobby");
            } else {
                PlayerView p = seat.me;
                state = StateJson.game(gv, p == null ? -2 : p.getId(), m.getGame());
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
                JsonObject proliferate = InputContext.proliferate(currentInput);
                if (proliferate != null) input.add("proliferate", proliferate);
                Set<Integer> playerChoices = InputContext.playerChoices(currentInput);
                if (currentInput instanceof InputLondonMulligan) input.addProperty("opening", "mulligan-bottom");
                else if (currentInput instanceof InputConfirmMulligan) input.addProperty("opening", "mulligan");
                else if (currentInput instanceof InputConfirm && m.getGame().getAge() == GameStage.BeforeMulligan && !events.gameStarted())
                    input.addProperty("opening", "play-draw");
                else if (!playerChoices.isEmpty() && m.getGame().getAge() == GameStage.BeforeMulligan && !events.gameStarted())
                    input.addProperty("opening", "starting-player");
                if (input.has("opening")) {
                    try {
                        if (currentInput instanceof InputConfirmMulligan) {
                            if (mulliganStartingPlayer == null) mulliganStartingPlayer = accessible(InputConfirmMulligan.class, "startingPlayer");
                            forge.game.player.Player first = (forge.game.player.Player) mulliganStartingPlayer.get(currentInput);
                            if (first != null) seat.openingStartingPlayer = first.getId();
                        }
                        if (seat.openingStartingPlayer >= 0) input.addProperty("openingStartingPlayer", seat.openingStartingPlayer);
                        if (currentInput instanceof InputLondonMulligan london) {
                            if (londonReturnCount == null) londonReturnCount = accessible(InputLondonMulligan.class, "toReturn");
                            int total = londonReturnCount.getInt(london);
                            input.addProperty("openingReturnCount", total);
                            input.addProperty("openingReturnRemaining", total - london.getSelectedCards().size());
                            JsonArray selected = new JsonArray(); london.getSelectedCards().forEach(card -> selected.add(card.getId()));
                            input.add("openingSelected", selected);
                        }
                    } catch (ReflectiveOperationException ignored) { /* Optional metadata; keep the actual input usable. */ }
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
                seat.selectable.forEach(sel::add);
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
                    String payingFor = payingFor(pay);
                    if (payingFor != null) input.addProperty("payingFor", payingFor);
                    // Mana phyrexiana: o retrato (ou o botão) paga um símbolo com 2 de vida.
                    if (phyrexianLife != null) input.addProperty("phyrexianLife", phyrexianLife.get("pending").getAsInt());
                }
                JsonObject targeting = targeting(seat);
                if (targeting != null) input.add("targeting", targeting);
                CardView promptCard = seat.promptCard;
                if (promptCard != null) input.add("card", StateJson.card(promptCard));
                // Voto numa permanente (Council's Judgment): escolhido tocando no campo, com a carta que vota à vista.
                SpellAbility voting = Votes.isVotePrompt(seat.message) ? Votes.current(m.getGame()) : null;
                if (voting != null && voting.getHostCard() != null) {
                    JsonObject vote = new JsonObject();
                    vote.add("card", StateJson.card(voting.getHostCard().getView()));
                    vote.add("votes", votesJson(m.getGame(), voteTally.of(voting)));
                    input.add("vote", vote);
                }
                state.add("input", input);
                Question q = seat.question;
                if (q != null && !spectating) state.add("question", q.json());
                state.add("deciding", deciding(seat));
                // Phase/zone events can precede the actionable input. Never advertise an early cast.
                if (!priority || !seat.okEnabled || locked || q != null) state.add("castable", new JsonArray());
                if (generation != seat.inputGen.get()) return null;
            }
        } catch (RuntimeException e) {
            return null;
        }
        state.add("config", config.json());
        JsonObject preferences = new JsonObject();
        preferences.addProperty("autoPassNoActions", seat.autoPassNoActions);
        preferences.addProperty("passResponses", seat.passResponses);
        JsonArray stops = new JsonArray();
        for (PhaseType phase : seat.opponentStops) stops.add(phase.name());
        preferences.add("opponentStops", stops);
        state.add("preferences", preferences);
        state.add("match", matchJson());
        state.addProperty("matchId", matchId);
        MatchConfig.versions(state);
        synchronized (events) {
            state.add("events", events.json(seat.sentEventCursor));
            state.addProperty("eventCursor", events.cursor());
            state.addProperty("stateVersion", stateVersion.get());
        }
        if ("sideboarding".equals(matchPhase) && seat.registered != null) state.add("sideboarding", sideboardingJson(seat));
        state.add("session", sessionJson(seat));
        if (isRoom()) state.add("room", roomJson(seat));
        JsonObject skip = skipJson(seat);
        if (skip != null) state.add("skip", skip);
        JsonArray decks = new JsonArray();
        Decks.LISTS.keySet().forEach(decks::add);
        state.add("decks", decks);
        return state;
    }

    /** {code, token, room}: o que o navegador guarda para voltar a esta partida se a conexão cair. */
    JsonObject sessionJson(Seat seat) {
        JsonObject o = new JsonObject();
        o.addProperty("code", code);
        o.addProperty("token", seat.token);
        o.addProperty("room", room);
        return o;
    }

    /** {code, seat, token, started, players:[{name, connected, rematch}]} */
    JsonObject roomJson(Seat seat) {
        JsonObject r = new JsonObject();
        r.addProperty("code", code);
        r.addProperty("seat", seat.index);
        r.addProperty("token", seat.token);
        r.addProperty("started", started());
        r.addProperty("public", isPublic());
        r.addProperty("capacity", config.playerCount());
        r.add("config", config.json());
        MatchConfig.versions(r);
        JsonArray ps = new JsonArray();
        for (Seat s : seats) {
            if (s.deck == null) continue;
            JsonObject p = new JsonObject();
            p.addProperty("seat", s.index);
            p.addProperty("playerId", s.me == null ? null : s.me.getId());
            p.addProperty("eliminated", s.eliminated());
            // Desistiu (pelo menu ou saindo da sala): a mesa tira o jogador de vista, em vez de mostrar o assento eliminado.
            if (s.conceded && s.eliminated()) p.addProperty("conceded", true);
            p.addProperty("name", s.name);
            p.addProperty("connected", s.channel != null);
            p.addProperty("rematch", s.rematch);
            // O lobby mostra a capa e o comandante (que já é público na partida); o resto do deck fica escondido.
            List<String> commanders = commanderNames(s.deck);
            if (!commanders.isEmpty()) p.addProperty("commander", String.join(" + ", commanders));
            String cover = commanders.isEmpty() ? s.cover : commanders.get(0);
            if (cover != null) p.addProperty("cover", cover);
            ps.add(p);
        }
        r.add("players", ps);
        return r;
    }

    JsonObject publicRoomJson() {
        JsonObject r = new JsonObject();
        r.addProperty("code", code); r.addProperty("available", !full() && !started());
        r.addProperty("capacity", config.playerCount());
        r.add("config", config.json()); MatchConfig.versions(r);
        JsonArray players = new JsonArray();
        for (Seat seat : seats) if (seat.deck != null) {
            JsonObject p = new JsonObject(); p.addProperty("seat", seat.index); p.addProperty("name", seat.name); p.addProperty("connected", seat.channel != null); players.add(p);
        }
        r.add("players", players); return r;
    }

    /**
     * Uma linha da lista de salas públicas. Só o que a mesa mostra a quem ainda não entrou: o código
     * (que já é público nesta sala), o anfitrião, o formato e os lugares ocupados. Nada de tokens ou decks.
     */
    JsonObject listingJson() {
        JsonObject r = new JsonObject();
        r.addProperty("code", code);
        r.addProperty("host", seats[0].deck != null ? seats[0].name : "Jogador");
        r.add("config", config.json());
        r.addProperty("capacity", config.playerCount());
        int players = 0;
        for (Seat seat : seats) if (seat.deck != null) players++;
        r.addProperty("players", players);
        r.addProperty("started", started());
        return r;
    }

    static List<String> commanderNames(Deck deck) {
        List<String> names = new ArrayList<>();
        for (var e : deck.getOrCreate(DeckSection.Commander)) names.add(e.getKey().getName());
        return names;
    }

    /** A carta de capa pedida pelo jogador, se estiver mesmo no deck; senão nenhuma. */
    static String coverOf(Deck deck, String requested) {
        if (requested == null || requested.isBlank()) return null;
        for (var e : deck.getMain()) if (e.getKey().getName().equals(requested)) return requested;
        return null;
    }

    void sendRoom(Seat seat) {
        JsonObject o = new JsonObject();
        o.addProperty("type", "room");
        o.add("room", roomJson(seat));
        seat.send(o.toString());
    }

    private static JsonObject button(String label, boolean enabled) {
        JsonObject b = new JsonObject();
        b.addProperty("label", label == null ? "" : label);
        b.addProperty("enabled", enabled);
        return b;
    }

    static String toast(String type, String text) {
        JsonObject o = new JsonObject();
        o.addProperty("type", type);
        o.addProperty("text", text);
        return o.toString();
    }

    // ---------- Assento de um jogador humano ----------

    final class Seat {
        final int index;
        /** Segredo para voltar ao assento depois de cair a conexão ({type:"rejoin", code, token}). */
        volatile String token = UUID.randomUUID().toString();
        volatile Channel channel;
        volatile String name;
        volatile Deck deck;
        volatile boolean rematch;
        volatile boolean departed;
        /** Carta cuja arte representa o deck no lobby (sem comandante); null sem capa. */
        volatile String cover;
        /** Última mensagem pronta no lobby, para ninguém encher a sala de balões. */
        volatile long saidAt;
        /** Desistiu deste jogo (no Commander com vários jogadores, a mesa tira o assento de vista). */
        volatile boolean conceded;
        private volatile RegisteredPlayer registered;
        private volatile Deck approvedDeck;
        private volatile boolean sideboardReady;
        private volatile long sentEventCursor;
        // A seat preference survives reconnects, the next game, and a rematch.
        private volatile boolean autoPassNoActions = true;
        /** "Passar respostas": passa sozinho no turno dos outros e com algo na pilha. O próprio turno e as escolhas continuam parando. */
        private volatile boolean passResponses;
        /** Etapas do turno dos oponentes em que o jogo segura a prioridade para este assento, mesmo sem ações. */
        private volatile Set<PhaseType> opponentStops = Set.of();

        private volatile WebGuiGame gui;
        private volatile PlayerView me;
        private volatile Question question;

        // Estado do "input" atual do Forge (prompt, botões e cartas selecionáveis).
        private volatile String message = "";
        private volatile int openingStartingPlayer = -1;
        /** Carta citada pelo prompt (ex.: a do topo na vidência de 1); pode estar numa zona oculta. */
        private volatile CardView promptCard;
        private volatile String okLabel = "", cancelLabel = "";
        private volatile boolean okEnabled, cancelEnabled;
        private volatile Set<Integer> selectable = Set.of();
        private volatile Set<Integer> selectableStacks = Set.of(), selectablePlayers = Set.of();
        /** Cartas que o Forge marca como utilizáveis agora: jogáveis, atacantes ou bloqueadores possíveis. */
        private volatile Set<Integer> actionable = Set.of();
        /**
         * Versão do prompt atual. Um clique em OK/Cancelar só vale para a versão que o jogador estava vendo:
         * sem isso, um clique duplo (ou um clique feito enquanto a tela ainda mostrava o prompt anterior)
         * cai no prompt seguinte e passa a prioridade, pulando uma fase.
         */
        private final AtomicInteger inputGen = new AtomicInteger();
        private volatile int consumedGen = -1;
        /** Última ação da ponte por este assento quando o turno dele está sendo pulado (uma por versão do prompt). */
        private volatile int autopilotGen = -1;
        private volatile long autopilotAt;
        private volatile long consumedAt;
        private static final long CONSUMED_TIMEOUT_MS = 1500;
        private volatile boolean lockedAtLastFlush;

        Seat(int index) { this.index = index; }

        Session session() { return Session.this; }

        void bind(Channel ch, String name, Deck deck) {
            this.token = UUID.randomUUID().toString();
            this.departed = false;
            this.channel = ch;
            this.name = name;
            this.deck = deck;
        }

        void send(String json) { BridgeServer.send(channel, json); }

        private void reset() {
            clearInput(); rematch = false; conceded = false; question = null; approvedDeck = null; sideboardReady = false; sentEventCursor = 0;
            inputGen.incrementAndGet(); consumedGen = -1;
        }

        private void clearInput() {
            openingStartingPlayer = -1; message = ""; promptCard = null; okLabel = cancelLabel = ""; okEnabled = cancelEnabled = false;
            selectable = Set.of(); selectableStacks = Set.of(); selectablePlayers = Set.of(); actionable = Set.of();
        }

        private boolean buttonsLocked() {
            return consumedGen == inputGen.get() && System.currentTimeMillis() - consumedAt < CONSUMED_TIMEOUT_MS;
        }

        private IGameController controller() {
            WebGuiGame g = gui;
            PlayerView p = me;
            return g == null || p == null ? null : g.getGameController(p);
        }

        boolean eliminated() { return config.commander() && me != null && me.getHasLost(); }

        private boolean livePriority() {
            return controller() instanceof PlayerControllerHuman human && human.getInputQueue().getInput() instanceof InputPassPriority;
        }

        private void updatePreferences(Channel source, JsonObject message) {
            Boolean autoPass = optionalBoolean(message, "autoPassNoActions"), responses = optionalBoolean(message, "passResponses");
            Set<PhaseType> stops = optionalStops(message);
            if (autoPass == null && responses == null && stops == null)
                throw new IllegalArgumentException("Informe um valor booleano para a passagem automática de prioridade.");
            // Settings are independent of a prompt generation, but a replaced or departed socket
            // cannot change this seat. Resolve the controller at execution time across Bo3 games.
            FThreads.invokeInEdtLater(() -> {
                if (channel != source) return;
                WebGuiGame current = gui;
                if (autoPass != null) {
                    autoPassNoActions = autoPass;
                    if (current != null) current.syncAutoPass();
                }
                if (stops != null) {
                    opponentStops = stops;
                    if (current != null) current.stopsChanged();
                }
                if (responses != null) {
                    passResponses = responses;
                    passResponseIfAsked();   // marcado com o pedido de resposta já aberto: passa este também
                }
                markDirty();
            });
        }

        /** As etapas marcadas, na ordem do turno; null quando a mensagem não muda as paradas. */
        private static Set<PhaseType> optionalStops(JsonObject message) {
            JsonElement value = message.get("opponentStops");
            if (value == null) return null;
            if (!value.isJsonArray()) throw new IllegalArgumentException("Escolha as etapas do turno do oponente em que o jogo para.");
            EnumSet<PhaseType> stops = EnumSet.noneOf(PhaseType.class);
            for (JsonElement each : value.getAsJsonArray()) {
                PhaseType phase = each.isJsonPrimitive() && each.getAsJsonPrimitive().isString()
                    ? Arrays.stream(PhaseType.values()).filter(p -> p.name().equals(each.getAsString())).findFirst().orElse(null) : null;
                if (phase == null || !WebGuiGame.HOLDABLE.contains(phase))
                    throw new IllegalArgumentException("Essa etapa do turno do oponente não dá prioridade. Escolha outra.");
                stops.add(phase);
            }
            return Collections.unmodifiableSet(stops);
        }

        private static Boolean optionalBoolean(JsonObject message, String key) {
            JsonElement value = message.get(key);
            if (value == null) return null;
            if (!value.isJsonPrimitive() || !value.getAsJsonPrimitive().isBoolean())
                throw new IllegalArgumentException("Informe um valor booleano para a passagem automática de prioridade.");
            return value.getAsBoolean();
        }

        /**
         * Com "Passar respostas" marcado, responde OK a um pedido de prioridade no turno de outro jogador
         * ou com algo na pilha. Só vale para o pedido em que foi agendado: se o jogo pedir outra coisa antes, não passa.
         */
        private void passResponseIfAsked() {
            WebGuiGame g = gui;
            PlayerView p = me;
            // Numa etapa marcada para segurar a prioridade, a vez fica com o jogador mesmo com "Passar respostas".
            if (!passResponses || question != null || !okEnabled || g == null || p == null || g.getGameView() == null || g.holding()) return;
            var view = g.getGameView();
            boolean othersTurn = !p.equals(view.getPlayerTurn());
            if (!othersTurn && (view.getStack() == null || view.getStack().isEmpty())) return;
            onEdt(inputGen.get(), c -> {
                if (passResponses && question == null && okEnabled && livePriority()) c.selectButtonOk();
                markDirty();
            });
        }

        private void onEdt(int generation, java.util.function.Consumer<IGameController> action) {
            onEdt(generation, null, action);
        }

        private void onEdt(int generation, String type, java.util.function.Consumer<IGameController> action) {
            IGameController c = controller();
            if (c == null) { rejectStaleAction(this, type); return; }
            FThreads.invokeInEdtLater(() -> {
                if (generation == inputGen.get() && question == null && "playing".equals(matchPhase) && c == controller()) action.accept(c);
                else rejectStaleAction(this, type);
            });
        }

        /** Recebe as chamadas do ProtocolGuiGame deste jogador. */
        private final class Remote implements IRemote {
            private final String belongsToMatch = matchId;
            private final HostedMatch hosted;
            private final MatchLifecycle life;
            Remote(HostedMatch hosted, MatchLifecycle life) { this.hosted = hosted; this.life = life; }
            @Override
            public void send(NetEvent event) {
                if (life.cancelled() || !belongsToMatch.equals(matchId) || !(event instanceof GuiGameEvent ev)) return;
                Object[] a = ev.getObjects();
                switch (ev.getMethod()) {
                    case openView -> {
                        @SuppressWarnings("unchecked") TrackableCollection<PlayerView> mine = (TrackableCollection<PlayerView>) a[0];
                        me = mine.iterator().next();
                        if (match != null) events.attach(match.getGame());
                        MatchJournal j = journal;
                        if (match != null && j != null && j.matchId.equals(belongsToMatch)) j.attach(match.getGame(), gameNumber);
                    }
                    case showPromptMessage -> {
                        message = a[1] == null ? "" : CoinFlipText.prompt(String.valueOf(a[1]));
                        promptCard = a.length > 2 && a[2] instanceof CardView cv ? cv : null;
                        inputGen.incrementAndGet();
                    }
                    case updateButtons -> {
                        inputGen.incrementAndGet();
                        okLabel = CoinFlipText.label(String.valueOf(a[1])); cancelLabel = CoinFlipText.label(String.valueOf(a[2]));
                        okEnabled = Boolean.TRUE.equals(a[3]); cancelEnabled = Boolean.TRUE.equals(a[4]);
                        passResponseIfAsked();
                    }
                    case setSelectables -> {
                        Set<Integer> ids = new LinkedHashSet<>();
                        if (a[0] != null) for (Object o : (Iterable<?>) a[0]) ids.add(((CardView) o).getId());
                        selectable = ids;
                    }
                    case setSelectableTargets -> {
                        Set<Integer> stackIds = new LinkedHashSet<>(), playerIds = new LinkedHashSet<>();
                        if (a[0] != null) for (Object target : (Iterable<?>) a[0]) {
                            if (target instanceof StackItemView item) stackIds.add(item.getId());
                            else if (target instanceof PlayerView player) playerIds.add(player.getId());
                        }
                        selectableStacks = stackIds; selectablePlayers = playerIds;
                    }
                    case clearSelectables -> { selectable = Set.of(); selectableStacks = Set.of(); selectablePlayers = Set.of(); }
                    case setWeaklySelectable -> {
                        Set<Integer> ids = new LinkedHashSet<>();
                        if (a[0] != null) for (Object o : (Iterable<?>) a[0]) ids.add(((CardView) o).getId());
                        actionable = ids;
                    }
                    case clearWeaklySelectable -> actionable = Set.of();
                    case message -> Seat.this.send(toast("toast", CoinFlipText.notice(voteNotice(hosted.getGame(), String.valueOf(a[0])), a.length > 1 && a[1] != null ? String.valueOf(a[1]) : null)));
                    case showErrorDialog -> Seat.this.send(toast("toast", String.valueOf(a[0])));
                    default -> { }
                }
                markDirty();
            }

            @Override
            public Object sendAndWait(IdentifiableNetEvent event) {
                return ask(Seat.this, (GuiGameEvent) event, hosted, life);
            }
        }
    }
}
