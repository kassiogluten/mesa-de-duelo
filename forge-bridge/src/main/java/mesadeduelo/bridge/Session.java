package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.deck.Deck;
import forge.deck.DeckSection;
import forge.game.GameType;
import forge.game.GameView;
import forge.game.player.PlayerView;
import forge.game.player.RegisteredPlayer;
import forge.gamemodes.match.HostedMatch;
import forge.gui.FThreads;
import forge.gui.interfaces.IGuiGame;
import forge.player.GamePlayerUtil;
import io.netty.channel.Channel;

/**
 * Uma partida controlada pelo navegador: um humano contra a IA, ou de dois a quatro humanos numa sala em rede.
 * Cada humano ocupa um {@link Seat}, com a sua conexão, o seu prompt e as suas perguntas.
 *
 * Servidor → cliente: {type:"state", ..., you, input:{message, ok, cancel, selectable}, question, room?}
 * Cliente → servidor: {type:"card", id} | {type:"player", id} | {type:"ok"} | {type:"cancel"}
 *                     | {type:"concede"} | {type:"answer", id, indices|value|text}
 * As mensagens de sala (host, join, rejoin, rematch, leave) e o "start" contra a IA ficam em {@link Rooms}.
 *
 * Esta classe guarda o ciclo da partida (começar, fim de jogo, sideboard, desistir, abandonar) e a publicação a cada
 * tick; cada assunto tem o seu arquivo:
 * <ul>
 *   <li>{@link Seat}: o assento, o prompt atual do Forge e o {@code IRemote} que o recebe;</li>
 *   <li>{@link ClientActions}: as mensagens do navegador ({@link #onClientMessage});</li>
 *   <li>{@link QuestionBroker}: as perguntas que seguram a thread do jogo e as respostas;</li>
 *   <li>{@link SeatStateView}: o estado de cada assento e de quem assiste, e o JSON da sala;</li>
 *   <li>{@link MatchRecorder}: relógios, métricas e a linha do histórico;</li>
 *   <li>{@link SkipVoteController} e {@link UndoController}: pular o turno de quem caiu e o Desfazer.</li>
 * </ul>
 *
 * Ordem dos locks: Rooms → Session (o monitor desta classe) → o lock do {@link UndoController} ou do
 * {@link SkipVoteController}. Nunca pegue o monitor da Session (nem o de Rooms) segurando um desses dois.
 */
final class Session {
    /** Código para voltar à partida ({type:"rejoin", code, token}); numa sala em rede é o código que os jogadores digitam. */
    final String code;
    private final boolean room;
    /** Sala pública: aparece na lista da tela inicial ({type:"list-rooms"}); a privada só se acha pelo código. */
    private volatile boolean publicRoom;
    /** Os assentos humanos; numa sala completada por computadores, só os ocupados ({@link #fillWithComputers}). */
    volatile Seat[] seats;
    /** Decks dos computadores: os da partida contra a IA ou os que completaram a sala ({@link #fillWithComputers}). */
    private volatile List<Deck> aiDecks;
    final MatchConfig config;
    final AtomicLong stateVersion = new AtomicLong();
    final VisibleEvents events = new VisibleEvents(this::markDirty, stateVersion::get);
    volatile String matchId = UUID.randomUUID().toString();
    volatile String matchPhase = "playing";
    volatile int gameNumber = 1;
    private volatile int sideboardId;
    volatile boolean abandoned;
    /** Quem desistiu primeiro da partida atual (o humano contra a IA sai por aqui). */
    volatile Seat conceder;
    /** Quando a sala ou partida foi criada (para a área de admin). */
    private final long createdAt = System.currentTimeMillis();
    /** Relógios da partida, métricas e a linha do histórico. */
    final MatchRecorder recorder = new MatchRecorder(this);
    /** Os cliques e comandos do navegador. */
    final ClientActions actions = new ClientActions(this);
    /** As perguntas que seguram a thread do jogo até o navegador responder. */
    final QuestionBroker questions = new QuestionBroker(this);
    /** O estado que cada assento e cada espectador recebem. */
    private final SeatStateView view = new SeatStateView(this);
    private final AtomicBoolean dirty = new AtomicBoolean();
    volatile HostedMatch match;
    private volatile MatchLifecycle lifecycle = new MatchLifecycle();
    /** Diário desta partida (decks, retratos, ações), refeito a cada {@link #start()}; só sai num relato. */
    volatile MatchJournal journal;
    /** Nomes da IA: os da repetição (veja {@link Replay}) ou "Computador 1", "Computador 2"... numa sala completada. */
    private volatile List<String> aiNames;
    /** Bracket do deck de cada computador, na ordem dos decks (0 sem bracket); vazio fora do Commander. */
    volatile List<Integer> aiBrackets = List.of();
    private volatile java.util.function.Consumer<forge.game.Game> startHook;
    /** Sala de teste do Laboratório: a mesa montada à mão, aplicada no começo de cada jogo (veja {@link Lab}). */
    private volatile Lab lab;
    /**
     * Partida contra a IA na lista de salas, para assistir: ligada ao começar pela tela inicial ({@link Rooms}), e o
     * jogador pode tirá-la pelo Menu. A repetição de relatos e os testes ficam de fora.
     */
    volatile boolean watchable;

    /** Pular o turno de quem caiu e o Desfazer, cada um com o seu lock (veja a ordem dos locks acima). */
    final SkipVoteController skips = new SkipVoteController(this);
    final UndoController undo;

    private Session(String code, boolean room, int humans, List<Deck> aiDecks, MatchConfig config) {
        this.code = code;
        this.room = room;
        this.aiDecks = List.copyOf(aiDecks);
        this.config = config;
        seats = new Seat[humans];
        for (int i = 0; i < humans; i++) seats[i] = new Seat(this, i);
        undo = new UndoController(this);
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

    /**
     * Sala de teste do Laboratório: dois assentos, o segundo para outra pessoa ou outra aba de quem criou. Os decks
     * são os do cenário, a partida fica fora do histórico e o desfazer não precisa do aceite do outro lado.
     */
    static Session lab(String code, Channel host, String name, Lab lab) {
        Session s = new Session(code, true, 2, List.of(), new MatchConfig("free", "bo1"));
        s.lab = lab;
        s.startHook = lab::apply;
        s.seats[0].bind(host, name, lab.decks.get(0));
        return s;
    }

    boolean isLab() { return lab != null; }
    /** Deck do cenário para o assento que entra na sala de teste. */
    Deck labDeck(int seat) { return lab.decks.get(seat); }

    void history(java.util.function.Consumer<JsonObject> sink) { recorder.history = sink; }
    void aiBrackets(List<Integer> brackets) { aiBrackets = List.copyOf(brackets); }

    /**
     * Sala ainda não começada: os lugares vazios viram computadores, com um deck pronto sorteado do formato cada (no
     * Commander, de bracket perto do maior da mesa), e os assentos ocupados ficam juntos no começo. Quem chamar começa
     * a partida em seguida. Devolve quantos computadores entraram.
     */
    synchronized int fillWithComputers() {
        if (!room || lab != null || started()) throw new IllegalArgumentException("Só dá para completar com computadores antes de a partida começar.");
        List<Seat> taken = new ArrayList<>();
        for (Seat s : seats) if (s.taken) {
            if (s.deck == null) throw new IllegalArgumentException("Espere todos escolherem o deck antes de completar com computadores.");
            taken.add(s);
        }
        int missing = config.playerCount() - taken.size();
        if (missing <= 0) return 0;
        int bracket = 0;
        if (config.commander()) for (Seat s : taken) bracket = Math.max(bracket, s.bracket);
        List<Deck> decks = new ArrayList<>();
        List<Integer> brackets = new ArrayList<>();
        List<String> names = new ArrayList<>();
        // Nenhum computador repete o comandante (ou o deck) de alguém da mesa enquanto houver outro.
        var tableDecks = new java.util.HashSet<String>();
        for (Seat s : taken) tableDecks.addAll(Decks.tableKeys(s.deck));
        for (int i = 0; i < missing; i++) {
            Deck d = Decks.random(config.format(), bracket, tableDecks);
            tableDecks.addAll(Decks.tableKeys(d));
            decks.add(d); brackets.add(Decks.bracket(d));
            names.add(missing == 1 ? "Computador" : "Computador " + (i + 1));
        }
        Seat[] compact = taken.toArray(new Seat[0]);
        for (int i = 0; i < compact.length; i++) compact[i].index = i;
        seats = compact;
        aiDecks = List.copyOf(decks);
        aiNames = List.copyOf(names);
        if (config.commander()) aiBrackets(brackets);
        return missing;
    }

    /** Quantas cores de verso a mesa tem (veja {@code .sleeve-N} no CSS). */
    static final int SLEEVE_COLORS = 8;
    /** A cor do verso de cada jogador, na ordem do jogo (os assentos e depois os computadores). */
    volatile int[] sleeves;

    /** Cores diferentes para cada jogador, sorteadas entre as {@link #SLEEVE_COLORS}. */
    static int[] drawSleeves(int players) {
        List<Integer> palette = new ArrayList<>();
        for (int i = 0; i < SLEEVE_COLORS; i++) palette.add(i);
        java.util.Collections.shuffle(palette, java.util.concurrent.ThreadLocalRandom.current());
        int[] out = new int[players];
        for (int i = 0; i < players; i++) out[i] = palette.get(i % SLEEVE_COLORS);
        return out;
    }

    boolean isRoom() { return room; }
    boolean isPublic() { return room && publicRoom; }
    long createdAt() { return createdAt; }
    /**
     * Entra na lista de salas públicas, com alguém conectado: com lugar, para entrar, ou já com a partida
     * começada, para assistir.
     */
    boolean listed() { return (isPublic() || soloWatchable()) && anyoneConnected() && (started() || !full()); }
    /** Partida contra a IA aberta para assistir (veja {@link #watchable}). */
    boolean soloWatchable() { return !room && watchable && lab == null; }
    boolean started() { return match != null; }
    boolean full() { for (Seat s : seats) if (!s.taken) return false; return true; }
    /** Mesa cheia e todos com deck: a sala pode começar. */
    boolean ready() { for (Seat s : seats) if (!s.taken || s.deck == null) return false; return true; }

    Seat seatOf(Channel ch) {
        for (Seat s : seats) if (s.channel == ch) return s;
        return null;
    }

    /** Quem assiste sem jogar ({type:"watch"}); não ocupa assento nem segura a partida aberta. */
    final List<Watcher> watchers = new java.util.concurrent.CopyOnWriteArrayList<>();

    Watcher watcherOf(Channel ch) {
        for (Watcher w : watchers) if (w.channel == ch) return w;
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
        // Dá para assistir: sala já começada (pública ou privada, pelo código) ou partida contra a IA na lista de salas.
        o.addProperty("watchable", started() && (room || soloWatchable()));
        o.addProperty("format", config.format()); o.addProperty("matchLength", config.matchLength()); o.addProperty("playerCount", config.playerCount());
        o.addProperty("createdAt", java.time.Instant.ofEpochMilli(createdAt).toString());
        if (recorder.playingSince > 0) o.addProperty("startedAt", java.time.Instant.ofEpochMilli(recorder.playingSince).toString());
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
        // O nome do jogador no Forge, para achar a vida dele; contra a IA, o admin vê o nome que ele usa, não "Você".
        List<String> forgeNames = new ArrayList<>();
        for (Seat seat : seats) {
            if (!seat.taken) continue;
            JsonObject p = new JsonObject();
            p.addProperty("name", room || seat.nick == null ? seat.name : seat.nick); p.addProperty("ai", false); p.addProperty("seat", seat.index);
            forgeNames.add(seat.name);
            p.addProperty("connected", seat.channel != null); p.addProperty("conceded", seat.conceded);
            if (seat.deck != null) p.addProperty("deck", seat.deck.getName());
            players.add(p);
        }
        for (int i = 0; i < aiDecks.size(); i++) {
            JsonObject p = new JsonObject();
            p.addProperty("name", aiNames != null ? aiNames.get(i) : aiDecks.size() == 1 ? "Oponente" : "Oponente " + (i + 1));
            p.addProperty("ai", true); p.addProperty("deck", aiDecks.get(i).getName());
            players.add(p);
            forgeNames.add(p.get("name").getAsString());
        }
        if (gv != null && gv.getPlayers() != null) for (PlayerView pv : gv.getPlayers()) for (int i = 0; i < players.size(); i++) {
            JsonObject p = players.get(i).getAsJsonObject();
            if (forgeNames.get(i).equals(pv.getName())) { p.addProperty("life", pv.getLife()); p.addProperty("lost", pv.getHasLost()); }
        }
        o.add("players", players);
        return o;
    }

    // ---------- Partida ----------

    synchronized void start() {
        recordAbandoned(null);
        stop();
        matchId = UUID.randomUUID().toString();
        events.reset(); stateVersion.set(0);
        matchPhase = "playing"; gameNumber = 1; abandoned = false; conceder = null;
        recorder.reset();
        undo.clear();
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
        // Revanche: os eventos recomeçam do zero, também para quem assiste.
        for (Watcher w : watchers) w.sentEventCursor = 0;
        for (Seat seat : seats) {
            seat.reset();
            // O frontend reconhece o vencedor pelo nome, então os humanos precisam de nomes diferentes.
            String name = seat.name;
            for (int n = 2; !names.add(name); n++) name = seat.name + " (" + n + ")";
            seat.name = name;
            WebGuiGame g = new WebGuiGame(seat.remote(m, life), () -> seat.passLevel, () -> seat.opponentStops, life, m::getGame);
            seat.gui = g;
            // O turno pulado por votação: a ponte passa por ele, então esses prompts não guardam retrato para o Desfazer.
            g.autopilot = () -> skips.approved(seat.index);
            RegisteredPlayer rp = registered(seat.deck).setPlayer(new AskingController.Lobby(name, undo.history));
            seat.registered = rp;
            players.add(rp);
            guis.put(rp, g);
        }
        for (int i = 0; i < aiDecks.size(); i++) {
            String name = aiNames != null ? aiNames.get(i) : aiDecks.size() == 1 ? "Oponente" : "Oponente " + (i + 1);
            players.add(registered(aiDecks.get(i)).setPlayer(GamePlayerUtil.createAiPlayer(name)));
        }
        // A cor do verso das cartas de cada jogador, sorteada na primeira partida e mantida nas revanches e entre os jogos.
        if (sleeves == null || sleeves.length != players.size()) sleeves = drawSleeves(players.size());
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
        m.startMatch(lab != null ? Lab.rules() : config.rules(), null, players, guis, null);
        recorder.started(players.size());
        Log.of(this).info("Nova partida%s: %s", room ? " na sala " + code : "",
            String.join(" x ", players.stream().map(p -> p.getDeck().getName()).toList()));
        markDirty();
    }

    private RegisteredPlayer registered(Deck deck) {
        if (config.oathbreaker()) return RegisteredPlayer.forVariants(config.playerCount(), java.util.Set.of(GameType.Oathbreaker), deck, null, false, null, null);
        return config.commander() ? RegisteredPlayer.forCommander(deck) : new RegisteredPlayer(deck);
    }

    /**
     * Conta como abandonada a partida que ainda não terminou (fechada, saída ou trocada por outra) e grava a linha do
     * histórico: {@code quitter} saiu e concede; sem ele, contra a IA vale quem já tinha desistido, senão é queda.
     */
    synchronized void recordAbandoned(Seat quitter) {
        // Não usa matchOver(): sair no meio também marca a série como encerrada, mas ela não foi concluída.
        HostedMatch m = match;
        boolean finished = m != null && m.getMatch() != null && m.getMatch().isMatchOver();
        recorder.abandoned(finished);
        recorder.unfinished(quitter != null ? (othersGone(quitter) ? null : quitter) : room ? null : conceder);
    }

    /** Numa sala, todos os outros já caíram ou saíram: quem sai agora não está desistindo contra ninguém. */
    private boolean othersGone(Seat seat) {
        if (!room) return false;
        for (Seat each : seats) if (each != seat && each.taken && !each.conceded && each.channel != null) return false;
        return true;
    }

    boolean matchOver() {
        HostedMatch m = match;
        return abandoned || (m != null && m.getMatch() != null && m.getMatch().isMatchOver());
    }

    private synchronized void ended(HostedMatch ended) {
        if (match != ended) return;
        matchPhase = matchOver() ? "complete" : "sideboarding";
        recorder.gameEnded(ended);
        sideboardId++;
        undo.clear();
        for (Seat seat : seats) { seat.sideboardReady = false; seat.approvedDeck = null; }
        markDirty();
    }

    synchronized void submitSideboard(Seat seat, JsonObject msg, boolean unchanged) {
        if (!"sideboarding".equals(matchPhase) || match == null) return;
        if (!msg.has("id") || ClientActions.exactInt(msg.get("id")) != sideboardId) { markDirty(); return; }
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
        // As séries das fichas são do deck registrado: a troca de sideboard não as manda de novo.
        validation.deck().setDraftNotes(current.getDraftNotes());
        seat.approvedDeck = validation.deck(); seat.sideboardReady = true; markDirty();
        for (Seat each : seats) if (!each.sideboardReady) return;
        HostedMatch continuing = match;
        matchPhase = "playing"; gameNumber++; recorder.nextGame();
        for (Seat each : seats) { each.inputGen.incrementAndGet(); each.clearInput(); }
        FThreads.invokeInEdtLater(() -> {
            if (match != continuing || abandoned) return;
            continuing.continueMatch();
            markDirty();
        });
    }

    JsonObject matchJson() {
        JsonObject o = new JsonObject();
        o.addProperty("gameNumber", gameNumber); o.addProperty("over", matchOver()); o.addProperty("phase", matchPhase);
        o.addProperty("abandoned", abandoned);
        recorder.gameClock(o, "playing".equals(matchPhase));
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

    JsonObject sideboardingJson(Seat seat) {
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
            QuestionBroker.Question q = seat.question;
            seat.question = null;
            if (q != null) q.answer().complete(QuestionBroker.defaultAnswer(q));
        }
    }

    /** Explicit departure ends an unfinished series; a completed result remains intact. */
    synchronized void abandon(Seat seat) {
        if (!config.commandZone() && !matchOver()) {
            // Com o jogo em andamento, a linha sai quando a desistência terminar o jogo (veja ended).
            HostedMatch m = match;
            boolean playing = m != null && m.getGame() != null && !m.getGame().isGameOver();
            if (othersGone(seat)) recorder.unfinished(null);
            else if (!playing) recorder.unfinished(seat);
            if (conceder == null) conceder = seat;
            abandoned = true;
            matchPhase = "complete";
            markDirty();
        }
        concede(seat);
    }

    /** Concede o jogo atual; entre jogos, encerra a partida sem inventar vitórias. */
    synchronized void concede(Seat seat) {
        if (conceder == null && !matchOver()) conceder = seat;
        if ("sideboarding".equals(matchPhase)) { recorder.unfinished(seat); abandoned = true; matchPhase = "complete"; markDirty(); }
        HostedMatch current = match;
        if (current == null || current.getGame() == null || gameOver() || seat.me == null) return;
        lifecycle.requestConcede(current.getGame(), seat.me.getId());
        // Release answers after publishing the request, so the game thread sees it on wake-up.
        for (Seat each : seats) {
            if (config.commandZone() && each != seat) continue;
            QuestionBroker.Question q = each.question;
            each.question = null;
            each.inputGen.incrementAndGet(); each.clearInput();
            if (q != null) q.answer().complete(QuestionBroker.defaultAnswer(q));
        }
        markDirty();
    }

    // ---------- Mensagens do navegador ----------

    /** Diário atual (null antes de a partida começar). */
    MatchJournal journal() { return journal; }

    /** Uma mensagem do navegador deste assento (veja {@link ClientActions}). */
    void onClientMessage(Seat seat, Channel source, String type, JsonObject msg) { actions.onClientMessage(seat, source, type, msg); }

    /** Manda a mesma mensagem a todos os assentos. */
    void broadcast(String message) { for (Seat each : seats) each.send(message); }

    // ---------- Publicação do estado ----------

    void markDirty() { stateVersion.incrementAndGet(); dirty.set(true); }

    /** Chamado pelo publicador de {@link Rooms} a cada 50 ms. */
    void tick() {
        skips.tick();
        undo.tick();
        // Se o Forge não abriu um prompt novo depois do clique, os botões voltam a funcionar.
        for (Seat seat : seats) if (seat.lockedAtLastFlush && !seat.buttonsLocked()) dirty.set(true);
        if (!dirty.getAndSet(false)) return;
        boolean failed = false;
        for (Seat seat : seats) {
            if (seat.channel == null) continue;
            JsonObject state = view.state(seat);
            // Leitura concorrente falhou: este assento tenta de novo no próximo ciclo, os outros recebem agora.
            if (state == null) { dirty.set(true); failed = true; continue; }
            seat.send(state.toString());
            if (state.has("eventCursor")) seat.sentEventCursor = state.get("eventCursor").getAsLong();
        }
        for (Watcher w : watchers) {
            JsonObject state = view.state(w);
            if (state == null) { dirty.set(true); failed = true; continue; }
            BridgeServer.send(w.channel, state.toString());
            if (state.has("eventCursor")) w.sentEventCursor = state.get("eventCursor").getAsLong();
        }
        if (!failed) view.stateRecovered();
    }

    /** {code, seat, token, started, players:[{name, connected, rematch}], spectators:[nome]} */
    JsonObject roomJson(Seat seat) { return view.roomJson(seat.index, seat.token); }

    JsonObject publicRoomJson() {
        JsonObject r = new JsonObject();
        r.addProperty("code", code); r.addProperty("available", !full() && !started()); r.addProperty("started", started());
        if (lab != null) r.addProperty("lab", true);
        if (!room) r.addProperty("computer", true);
        r.addProperty("capacity", config.playerCount());
        r.add("config", config.json()); MatchConfig.versions(r);
        JsonArray players = new JsonArray();
        for (Seat seat : seats) if (seat.taken) {
            JsonObject p = new JsonObject(); p.addProperty("seat", seat.index); p.addProperty("name", seat.name); p.addProperty("connected", seat.channel != null); players.add(p);
        }
        r.add("players", players); return r;
    }

    /**
     * Uma linha da lista de salas públicas. Só o que a mesa mostra a quem ainda não entrou: o código
     * (que já é público nesta sala), o anfitrião, o formato, os lugares ocupados e, no Commander, os brackets. Nada de tokens ou decks.
     */
    JsonObject listingJson() {
        JsonObject r = new JsonObject();
        r.addProperty("code", code);
        // Contra a IA, o nome que o jogador usa (na mesa ele é "Você"); a mesa mostra "Ana contra o computador".
        r.addProperty("host", room ? seats[0].taken ? seats[0].name : "Jogador" : seats[0].nick != null ? seats[0].nick : "Jogador");
        if (!room) r.addProperty("computer", true);
        r.add("config", config.json());
        r.addProperty("capacity", config.playerCount());
        int players = 0;
        JsonArray brackets = new JsonArray();
        for (Seat seat : seats) if (seat.taken) { players++; if (seat.bracket > 0) brackets.add(seat.bracket); }
        r.addProperty("players", room ? players : config.playerCount());
        // No Commander, o bracket de cada lugar ocupado, para quem procura uma mesa de força parecida.
        if (!brackets.isEmpty()) r.add("brackets", brackets);
        r.addProperty("started", started());
        r.addProperty("spectators", watchers.size());
        return r;
    }

    static List<String> commanderNames(Deck deck) {
        List<String> names = new ArrayList<>();
        for (var e : deck.getOrCreate(DeckSection.Commander)) names.add(e.getKey().getDisplayName());
        return names;
    }

    /** A carta de capa pedida pelo jogador, se estiver mesmo no deck; senão nenhuma. */
    static String coverOf(Deck deck, String requested) {
        if (requested == null || requested.isBlank()) return null;
        for (var e : deck.getMain()) if (e.getKey().getDisplayName().equals(requested)) return requested;
        return null;
    }

    void sendRoom(Seat seat) {
        JsonObject o = new JsonObject();
        o.addProperty("type", "room");
        o.add("room", roomJson(seat));
        seat.send(o.toString());
    }

    static String toast(String type, String text) {
        JsonObject o = new JsonObject();
        o.addProperty("type", type);
        o.addProperty("text", text);
        return o.toString();
    }

    /** Quem assiste: a conexão, o nome que os jogadores veem e de qual jogador vê a mesa (-1: o anfitrião). */
    static final class Watcher {
        final Channel channel;
        final String name;
        volatile int player = -1;
        /** Começa no evento atual: quem chega no meio não revê as animações do que já passou. */
        volatile long sentEventCursor;
        Watcher(Channel channel, String name, long cursor) { this.channel = channel; this.name = name; this.sentEventCursor = cursor; }
    }

    long eventCursor() { return events.cursor(); }
}
