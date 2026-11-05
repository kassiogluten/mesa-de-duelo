package mesadeduelo.bridge;

import static mesadeduelo.bridge.LobbyFields.*;

import java.security.SecureRandom;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import forge.deck.Deck;
import io.netty.channel.Channel;

/**
 * Distribui as conexões entre as partidas. Cada conexão está em no máximo uma {@link Session}:
 * uma partida contra a IA ({type:"start"}) ou uma sala em rede com código de 4 letras.
 *
 * Salas: {type:"host", name, deck, visibility, code} cria (privada, a não ser com visibility:"public";
 * com o código pedido em code, ou sorteado sem ele);
 * {type:"join", code, name, deck} entra, e a partida começa quando a sala enche e todos têm deck; em host e join o deck
 * é opcional, e {type:"room-deck", deck} escolhe ou troca o deck dentro da sala até a partida começar; host, join e room-deck aceitam cover, a carta
 * cuja arte representa o deck no lobby, e bracket (1 a 5), a faixa de poder que o jogador deu ao deck de Commander
 * (start também, com o de cada deck escolhido para o computador dentro do próprio deck); {type:"room-say", key} manda uma mensagem pronta aos outros da sala;
 * {type:"list-rooms"} lista as salas públicas abertas e as em andamento;
 * {type:"watch", code, name} assiste à partida já começada de uma sala, sem ocupar assento (pública ou privada, com o código);
 * {type:"watch-player", player} troca o jogador de cuja mesa o espectador vê a partida;
 * {type:"rematch"} pede revanche (contra a IA começa na hora, em rede quando os dois pedirem);
 * {type:"leave"} concede e sai;
 * {type:"lab-close"} fecha a sala de teste do Laboratório para os dois lados (quem fica recebe um "gone").
 *
 * Volta à partida: todo estado traz session:{code, token}. Se a conexão cair, a partida fica guardada e
 * {type:"rejoin", code, token} devolve o jogador ao seu assento, inclusive depois de recarregar a página.
 * Uma partida sem ninguém conectado é encerrada depois de {@link #GRACE_SECONDS}.
 */
final class Rooms implements BridgeServer.Listener, Feedback.Journals {
    /** Sem letras e números fáceis de confundir (O/0, I/1). */
    private static final String CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final long GRACE_SECONDS = Long.getLong("mesa.grace", 300);
    /** Quantas salas públicas a lista mostra de uma vez (as que esperam há mais tempo primeiro). */
    private static final int MAX_LISTED = 30;
    /** Espectadores por sala, para uma sala muito assistida não pesar na partida. */
    private static final int MAX_WATCHERS = Integer.getInteger("mesa.maxWatchers", 20);

    private final Map<Channel, Session> byChannel = new ConcurrentHashMap<>();
    /** Todas as partidas vivas, salas e partidas contra a IA, pelo código de volta. */
    private final Map<String, Session> byCode = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();
    /** Códigos de sala que não existem, por IP: sem isso daria para varrer os códigos até achar uma sala alheia. */
    private final FeedbackRateLimit codeMisses = new FeedbackRateLimit(
        Integer.getInteger("mesa.codeMisses", 10), Long.getLong("mesa.codeMissesMinutes", 10) * 60_000);
    /** Diários de partidas encerradas há pouco, para quem relata da tela inicial logo depois de sair. */
    private final Map<String, Closed> closed = new java.util.LinkedHashMap<>();
    private static final long CLOSED_KEEP_MS = Long.getLong("mesa.journal.keepMinutes", 30) * 60_000;
    private static final int MAX_CLOSED = 20;
    /** Modo de repetição: o primeiro "start" vira a partida do relato (veja {@link Replay}). */
    private volatile Replay replay;

    private record Closed(MatchJournal journal, Map<String, Integer> tokens, long until) { }
    private final ScheduledExecutorService publisher = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "BridgePublisher");
        t.setDaemon(true);
        return t;
    });

    Rooms() {
        publisher.scheduleWithFixedDelay(() -> Metrics.TICK.record(this::tick), 50, 50, TimeUnit.MILLISECONDS);
        registerMetrics();
    }

    private void tick() {
        for (Session s : byCode.values()) {
            try { s.tick(); } catch (RuntimeException e) { Metrics.TICK_ERRORS.increment(); e.printStackTrace(); }
        }
    }

    /** Contagens lidas na hora da coleta, direto das partidas vivas. */
    private void registerMetrics() {
        for (String format : Metrics.FORMATS) for (boolean room : new boolean[]{false, true}) {
            Metrics.gauge("mesa.sessions", "Partidas vivas: jogando ou, em rede, sala aguardando jogadores",
                () -> byCode.values().stream().filter(s -> s.isRoom() == room && format.equals(s.config.format()) && s.started()).count(),
                "format", format, "mode", Metrics.mode(room), "state", "jogando");
            if (room) Metrics.gauge("mesa.sessions", "Partidas vivas: jogando ou, em rede, sala aguardando jogadores",
                () -> byCode.values().stream().filter(s -> s.isRoom() && format.equals(s.config.format()) && !s.started()).count(),
                "format", format, "mode", Metrics.mode(true), "state", "aguardando");
        }
        Metrics.gauge("mesa.players.connected", "Jogadores humanos conectados a uma partida ou sala",
            () -> byCode.values().stream().mapToLong(s -> java.util.Arrays.stream(s.seats).filter(seat -> seat.channel != null).count()).sum());
        Metrics.gauge("mesa.players.reconnecting", "Jogadores que caíram de uma partida em andamento e ainda podem voltar",
            () -> byCode.values().stream().filter(Session::started).mapToLong(s -> java.util.Arrays.stream(s.seats).filter(seat -> seat.taken && seat.channel == null).count()).sum());
    }

    void replay(Replay r) { replay = r; }

    /** Resumo das partidas concluídas (veja {@link MatchHistory}); sem ele, nada é gravado. */
    private volatile java.util.function.Consumer<JsonObject> history = ignored -> { };
    void history(java.util.function.Consumer<JsonObject> sink) { history = sink; }

    /** Quem joga com a conta conectada: o id da conta e o deck salvo dela (o id do deck no navegador, igual ao da conta). */
    record Owner(String account, String deckId) { }
    /** Token da sessão da conta → id da conta, ou null; sem contas ligadas, ninguém tem dono. */
    private volatile java.util.function.Function<String, String> accountOf = token -> null;
    void accounts(java.util.function.Function<String, String> resolver) { accountOf = resolver; }

    /** {conta: token, deckId} da mensagem de começar, criar ou entrar; null sem token válido. */
    private Owner owner(JsonObject msg) {
        JsonElement token = msg.get("conta");
        if (token == null || !token.isJsonPrimitive()) return null;
        String account;
        try { account = accountOf.apply(token.getAsString()); }
        catch (RuntimeException e) { Log.bridge().warn("Contas: não deu para ligar o assento à conta: " + e); return null; }
        if (account == null) return null;
        JsonElement deck = msg.get("deckId");
        String deckId = deck != null && deck.isJsonPrimitive() ? deck.getAsString() : null;
        return new Owner(account, deckId != null && deckId.matches("[A-Za-z0-9_.:-]{1,80}") ? deckId : null);
    }

    /** O diário da partida em que o token ocupa um assento, viva ou encerrada há pouco; null se não houver. */
    /** Partidas e salas vivas, para a área de admin (mais recentes primeiro). */
    JsonArray adminSessions() {
        JsonArray all = new JsonArray();
        byCode.values().stream().map(Session::adminJson)
            .sorted(java.util.Comparator.comparing((JsonObject o) -> o.get("createdAt").getAsString()).reversed()).forEach(all::add);
        return all;
    }

    @Override public JsonObject journal(String code, String token) {
        if (code == null || token == null || token.isEmpty()) return null;
        MatchJournal journal = null;
        Integer seat = null;
        boolean live = false;
        synchronized (this) {
            Session s = byCode.get(code);
            if (s != null) for (Seat each : s.seats) if (sameToken(each.token, token)) { journal = s.journal(); seat = each.index; live = true; }
            if (journal == null) {
                long now = System.currentTimeMillis();
                closed.values().removeIf(c -> c.until < now);
                Closed c = closed.get(code);
                if (c != null) for (var e : c.tokens.entrySet()) if (sameToken(e.getKey(), token)) { journal = c.journal; seat = e.getValue(); }
            }
        }
        // Fora da trava das salas: o retrato do instante do relato pode demorar alguns milissegundos.
        return journal == null ? null : journal.json(seat, live);
    }

    private static boolean sameToken(String a, String b) {
        return a != null && java.security.MessageDigest.isEqual(a.getBytes(java.nio.charset.StandardCharsets.UTF_8), b.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    @Override public void onConnect(Channel ch) {
        JsonObject hello = new JsonObject();
        hello.addProperty("type", "hello");
        JsonArray formats = new JsonArray(); MatchConfig.FORMATS.forEach(formats::add);
        hello.add("supportedFormats", formats);
        MatchConfig.versions(hello);
        BridgeServer.send(ch, hello.toString());
    }

    @Override
    public synchronized void onDisconnect(Channel ch) {
        Session s = byChannel.remove(ch);
        if (s == null) return;
        if (dropWatcher(s, ch)) return;
        Seat seat = s.seatOf(ch);
        if (seat == null) return;
        seat.channel = null;
        Log.of(s).info("%s: %s desconectou", label(s), seat.name);
        if (!s.isRoom() || !s.started()) {
            if (s.isRoom()) broadcastRoom(s);
            expireIfAbandoned(s);
            s.markDirty();
            return;
        }
        notifyOthers(s, seat, seat.name + " desconectou. Aguardando a reconexão…");
        expireIfAbandoned(s);
        s.markDirty();
    }

    /** Agenda o fim da partida se ninguém voltar a tempo. */
    private void expireIfAbandoned(Session s) {
        if (s.anyoneConnected()) return;
        publisher.schedule(() -> {
            synchronized (this) {
                if (byCode.get(s.code) == s && !s.anyoneConnected()) {
                    Log.of(s).info("%s: ninguém voltou em %d s", label(s), GRACE_SECONDS);
                    close(s, null);
                }
            }
        }, GRACE_SECONDS, TimeUnit.SECONDS);
    }

    @Override
    public void onMessage(Channel ch, String text) {
        Metrics.MESSAGES.increment();
        JsonObject msg;
        try { msg = JsonParser.parseString(text).getAsJsonObject(); }
        catch (RuntimeException e) { Metrics.INVALID_MESSAGES.increment(); BridgeServer.send(ch, Session.toast("error", "Mensagem inválida.")); return; }
        String requestId = msg.has("requestId") && msg.get("requestId").isJsonPrimitive() ? msg.get("requestId").getAsString() : null;
        try {
            String type = MatchConfig.string(msg, "type");
            switch (type) {
                case "validate-deck", "fetch-deck", "similar-cards" -> LobbyRequests.handle(ch, type, msg, requestId);
                case "lookup-room" -> lookup(ch, code(msg), requestId);
                case "list-rooms" -> {
                    JsonObject response = new JsonObject(); response.addProperty("type", "room-list");
                    response.addProperty("requestId", requestId); response.add("rooms", publicRooms());
                    BridgeServer.send(ch, response.toString());
                }
                case "hello" -> onConnect(ch);
                case "start" -> {
                    // Modo de repetição: o primeiro "start" vira a partida do relato, com os decks gravados nele.
                    Replay r = replay;
                    if (r != null) { replay = null; replayed(ch, r); }
                    else {
                        MatchConfig config = MatchConfig.parse(msg.get("config"));
                        Deck you = validated(msg.get("you"), config.format(), "you");
                        java.util.List<Deck> opponents = new java.util.ArrayList<>();
                        java.util.List<Integer> brackets = new java.util.ArrayList<>();
                        brackets.add(bracket(msg));
                        // Os escolhidos primeiro, para o sorteio dos outros não repetir nenhum deles nem o seu.
                        var taken = new java.util.HashSet<>(Decks.tableKeys(you));
                        if (msg.has("opponents")) {
                            if (!msg.get("opponents").isJsonArray() || msg.getAsJsonArray("opponents").size() != config.playerCount() - 1)
                                throw new IllegalArgumentException("Escolha um deck para cada oponente.");
                            var list = msg.getAsJsonArray("opponents");
                            for (JsonElement opponent : list) if (opponent.isJsonObject()) taken.addAll(Decks.tableKeys(validated(opponent, config.format(), "opponent")));
                            for (JsonElement opponent : list) { Deck d = aiDeck(opponent, config, taken); opponents.add(d); brackets.add(aiBracket(opponent, d)); }
                        } else {
                            for (int i = 1; i < config.playerCount(); i++) { Deck d = aiDeck(msg.get("opponent"), config, taken); opponents.add(d); brackets.add(aiBracket(msg.get("opponent"), d)); }
                        }
                        solo(ch, you, opponents, config, brackets, owner(msg), nick(msg));
                    }
                }
                case "host" -> {
                    MatchConfig config = MatchConfig.parse(msg.get("config"));
                    host(ch, name(msg), optionalDeck(msg.get("deck"), config.format()), config, publicRoom(msg), chosenCode(msg), cover(msg), bracket(msg), owner(msg));
                }
                case "lab-host" -> labHost(ch, name(msg), Lab.parse(msg.get("scenario")));
                case "join" -> join(ch, code(msg), name(msg), msg.get("deck"), cover(msg), bracket(msg), owner(msg));
                case "room-deck" -> {
                    roomDeck(ch, msg.get("deck"), cover(msg), bracket(msg), owner(msg));
                    // Com requestId, a mesa espera a resposta para saber que o deck valeu (os erros voltam com o mesmo id).
                    if (requestId != null) { JsonObject ok = new JsonObject(); ok.addProperty("type", "room-deck"); ok.addProperty("requestId", requestId); BridgeServer.send(ch, ok.toString()); }
                }
                case "watch" -> watch(ch, code(msg), name(msg));
                case "watch-player" -> watchPlayer(ch, msg);
                case "watchable" -> watchable(ch, msg.has("on") && msg.get("on").getAsBoolean());
                case "fill-computers" -> fillWithComputers(ch);
                case "room-say" -> say(ch, MatchConfig.string(msg, "key"));
                case "rejoin" -> rejoin(ch, code(msg), msg.has("token") ? MatchConfig.string(msg, "token") : "");
                case "rematch" -> rematch(ch);
                case "leave" -> leave(ch);
                case "lab-close" -> labClose(ch);
                default -> {
                    Session s = byChannel.get(ch);
                    Seat seat = s == null ? null : s.seatOf(ch);
                    if (seat != null) s.onClientMessage(seat, ch, type, msg);
                }
            }
        } catch (InvalidDeck e) {
            Metrics.REQUEST_ERRORS.increment();
            JsonObject response = new JsonObject(); response.addProperty("type", "validation-error");
            response.addProperty("target", e.target); response.add("validation", e.result.json());
            if (requestId != null) response.addProperty("requestId", requestId);
            BridgeServer.send(ch, response.toString());
        } catch (RuntimeException e) {
            Metrics.REQUEST_ERRORS.increment();
            JsonObject response = new JsonObject();
            response.addProperty("type", requestId == null ? "error" : "request-error");
            response.addProperty("text", e.getMessage() == null ? "Não foi possível concluir esta ação." : e.getMessage());
            if (requestId != null) response.addProperty("requestId", requestId);
            // O link de convite cria a sala que não existe: o motivo vem à parte, sem depender do texto.
            if (e instanceof RoomNotFound) response.addProperty("reason", "room-not-found");
            BridgeServer.send(ch, response.toString());
        }
    }

    private static final class RoomNotFound extends IllegalArgumentException {
        RoomNotFound(String code) { super("Não existe sala com o código " + code + "."); }
    }

    private synchronized void lookup(Channel ch, String code, String requestId) {
        Session s = room(ch, code);
        JsonObject response = new JsonObject(); response.addProperty("type", "room-info");
        response.addProperty("requestId", requestId); response.add("room", s.publicRoomJson());
        BridgeServer.send(ch, response.toString());
    }

    /** A sala do código; depois de muitos códigos errados seguidos, recusa até mesmo os certos por um tempo. */
    private Session room(Channel ch, String code) {
        String key = codeMisses.key(BridgeServer.ip(ch));
        long now = System.currentTimeMillis();
        if (codeMisses.exceeded(key, now)) {
            Metrics.CODE_MISSES_BLOCKED.increment();
            throw new IllegalArgumentException("Muitas tentativas com códigos que não existem. Espere alguns minutos e tente de novo.");
        }
        Session s = byCode.get(code);
        if (s == null || !(s.isRoom() || s.soloWatchable())) {
            codeMisses.record(key, now);
            throw new RoomNotFound(code);
        }
        return s;
    }

    /** Salas públicas com lugar ou em andamento (para assistir), sem as que ficaram sem ninguém conectado. */
    synchronized JsonArray publicRooms() {
        JsonArray rooms = new JsonArray();
        byCode.values().stream().filter(Session::listed)
            .sorted(java.util.Comparator.comparingLong(Session::createdAt)).limit(MAX_LISTED)
            .map(Session::listingJson).forEach(rooms::add);
        return rooms;
    }

    /**
     * O código escolhido, se estiver livre. Um código ocupado conta como tentativa errada na busca:
     * senão daria para descobrir as salas alheias criando salas com cada código.
     */
    private String freeCode(Channel ch, String code) {
        String key = codeMisses.key(BridgeServer.ip(ch));
        long now = System.currentTimeMillis();
        if (codeMisses.exceeded(key, now)) {
            Metrics.CODE_MISSES_BLOCKED.increment();
            throw new IllegalArgumentException("Muitas tentativas com códigos já usados. Espere alguns minutos e tente de novo.");
        }
        if (byCode.containsKey(code)) {
            codeMisses.record(key, now);
            throw new IllegalArgumentException("O código " + code + " já está em uso. Escolha outro ou deixe o campo vazio para sortear.");
        }
        return code;
    }

    private static String label(Session s) {
        return (s.isRoom() ? "Sala " : "Partida contra a IA ") + s.code;
    }

    /** Código livre; as partidas contra a IA usam 8 caracteres para nunca colidir com os de sala. */
    private String newCode(int length) {
        String code;
        do {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < length; i++) sb.append(CODE_CHARS.charAt(random.nextInt(CODE_CHARS.length())));
            code = sb.toString();
        } while (byCode.containsKey(code));
        return code;
    }

    // ---------- Partidas ----------

    private synchronized void solo(Channel ch, Deck you, java.util.List<Deck> opponents, MatchConfig config, java.util.List<Integer> brackets, Owner owner, String nick) {
        leave(ch);
        Session s = Session.solo(newCode(8), ch, you, opponents, config);
        s.seats[0].owner(owner);
        s.seats[0].nick = nick;
        s.watchable = true;
        s.seats[0].bracket = config.commander() ? brackets.get(0) : 0;
        if (config.commander()) s.aiBrackets(brackets.subList(1, brackets.size()));
        s.history(history);
        byCode.put(s.code, s);
        byChannel.put(ch, s);
        s.start();
    }

    private synchronized void replayed(Channel ch, Replay r) {
        leave(ch);
        Session s = r.session(newCode(8), ch);
        byCode.put(s.code, s);
        byChannel.put(ch, s);
        s.start();
    }

    private synchronized void host(Channel ch, String name, Deck deck, MatchConfig config, boolean publicRoom, String chosen, String cover, int bracket, Owner owner) {
        String code = chosen == null ? null : freeCode(ch, chosen);
        leave(ch);
        Session s = Session.room(code != null ? code : newCode(4), ch, name, deck, config, publicRoom);
        s.seats[0].owner(owner);
        s.seats[0].cover = deck == null ? null : Session.coverOf(deck, cover);
        s.seats[0].bracket = config.commander() && deck != null ? bracket : 0;
        s.history(history);
        byCode.put(s.code, s);
        byChannel.put(ch, s);
        s.sendRoom(s.seats[0]);
        Log.of(s).info("Sala %s %s criada por %s (%s)", s.code, publicRoom ? "pública" : "privada", name, deckName(deck));
    }

    /** Sala de teste do Laboratório: privada, fora do histórico, e começa quando o segundo lado entra. */
    private synchronized void labHost(Channel ch, String name, Lab lab) {
        leave(ch);
        Session s = Session.lab(newCode(4), ch, name, lab);
        byCode.put(s.code, s);
        byChannel.put(ch, s);
        s.sendRoom(s.seats[0]);
        Log.of(s).info("Sala de teste %s criada por %s", s.code, name);
    }

    private synchronized void join(Channel ch, String code, String name, JsonElement payload, String cover, int bracket, Owner owner) {
        Session s = room(ch, code);
        if (s.seatOf(ch) != null) return;
        if (s.full() || s.started()) throw new IllegalArgumentException("A sala " + code + " já está cheia.");
        Seat seat = java.util.Arrays.stream(s.seats).filter(each -> !each.taken).findFirst().orElseThrow();
        // Na sala de teste, cada lado joga com as cartas do cenário: o deck de quem entra não importa.
        Deck deck = s.isLab() ? s.labDeck(seat.index) : optionalDeck(payload, s.config.format());
        leave(ch);
        seat.bind(ch, name, deck);
        seat.owner(s.isLab() ? null : owner);
        seat.cover = deck == null ? null : Session.coverOf(deck, cover);
        seat.bracket = s.config.commander() && deck != null ? bracket : 0;
        byChannel.put(ch, s);
        Log.of(s).info("Sala %s: %s entrou (%s)", code, name, deckName(deck));
        for (Seat each : s.seats) s.sendRoom(each);
        if (s.ready()) s.start();
        else s.markDirty();
    }

    /** {type:"room-deck", deck}: escolhe ou troca o deck do próprio lugar, na sala que ainda não começou. */
    private synchronized void roomDeck(Channel ch, JsonElement payload, String cover, int bracket, Owner owner) {
        Session s = byChannel.get(ch);
        Seat seat = s == null ? null : s.seatOf(ch);
        if (seat == null || !s.isRoom() || s.isLab()) return;
        if (s.started()) throw new IllegalArgumentException("A partida já começou: não dá mais para trocar o deck.");
        if (payload == null || payload.isJsonNull()) throw new IllegalArgumentException("Escolha um deck.");
        Deck deck = validated(payload, s.config.format(), "deck");
        seat.deck = deck;
        seat.owner(owner);
        seat.cover = Session.coverOf(deck, cover);
        seat.bracket = s.config.commander() ? bracket : 0;
        Log.of(s).info("Sala %s: %s escolheu o deck %s", s.code, seat.name, deck.getName());
        broadcastRoom(s);
        if (s.ready()) s.start();
        else s.markDirty();
    }

    /** Entra como espectador numa partida já começada; quem estava em outra partida sai dela antes. */
    private synchronized void watch(Channel ch, String code, String name) {
        Session s = room(ch, code);
        if (s.seatOf(ch) != null) throw new IllegalArgumentException("Você já está jogando nesta sala.");
        if (s.watcherOf(ch) != null) return;
        if (!s.started()) throw new IllegalArgumentException("A partida da sala " + code + " ainda não começou. Entre na sala para jogar.");
        if (s.watchers.size() >= MAX_WATCHERS) throw new IllegalArgumentException("A sala " + code + " já tem o máximo de espectadores.");
        leave(ch);
        s.watchers.add(new Session.Watcher(ch, name, s.eventCursor()));
        byChannel.put(ch, s);
        Log.of(s).info("%s: %s está assistindo", label(s), name);
        // Contra a IA o jogador não escolheu abrir a partida: avisa, e o Menu tem como tirá-la da lista.
        if (!s.isRoom()) for (Seat seat : s.seats) if (seat.channel != null)
            seat.send(Session.toast("toast", name + " está assistindo à sua partida. Para fechá-la, use Menu › Tirar da lista de salas."));
        s.markDirty();
    }

    private synchronized void watchPlayer(Channel ch, JsonObject msg) {
        Session s = byChannel.get(ch);
        Session.Watcher w = s == null ? null : s.watcherOf(ch);
        JsonElement player = msg.get("player");
        if (w == null || player == null || !player.isJsonPrimitive()) return;
        w.player = player.getAsInt();
        s.markDirty();
    }

    /**
     * Contra a IA, o jogador põe a partida na lista de salas ou a tira dela. Tirando, quem assistia volta ao início:
     * a partida deixa de estar aberta, não só de aparecer.
     */
    private synchronized void watchable(Channel ch, boolean on) {
        Session s = byChannel.get(ch);
        if (s == null || s.isRoom() || s.seatOf(ch) == null || s.watchable == on) return;
        s.watchable = on;
        if (!on) {
            for (Session.Watcher w : s.watchers) {
                byChannel.remove(w.channel, s);
                BridgeServer.send(w.channel, Session.toast("gone", "Quem jogava fechou a partida para quem assiste."));
            }
            s.watchers.clear();
        }
        Seat seat = s.seatOf(ch);
        seat.send(Session.toast("toast", on ? "A partida voltou para a lista de salas: outros jogadores podem assistir." : "A partida saiu da lista de salas: ninguém mais pode assistir."));
        Log.of(s).info("%s %s da lista de salas", label(s), on ? "voltou para a" : "saiu");
        s.markDirty();
    }

    /** O anfitrião completa os lugares vazios da sala com computadores e a partida começa. */
    private synchronized void fillWithComputers(Channel ch) {
        Session s = byChannel.get(ch);
        Seat seat = s == null ? null : s.seatOf(ch);
        if (seat == null || !s.isRoom()) return;
        if (seat.index != 0) throw new IllegalArgumentException("Só quem criou a sala pode completar com computadores.");
        int added = s.fillWithComputers();
        if (added == 0) return;
        Log.of(s).info("Sala %s: completada com %d computador(es)", s.code, added);
        for (Seat each : s.seats) s.sendRoom(each);
        s.start();
    }

    /** Tira o espectador da sala; false se a conexão não era de um espectador. */
    private boolean dropWatcher(Session s, Channel ch) {
        Session.Watcher w = s.watcherOf(ch);
        if (w == null) return false;
        s.watchers.remove(w);
        Log.of(s).info("%s: %s parou de assistir", label(s), w.name);
        s.markDirty();
        return true;
    }

    private synchronized void rejoin(Channel ch, String code, String token) {
        Session s = byCode.get(code);
        Seat seat = null;
        if (s != null) for (Seat each : s.seats) if (!each.departed && each.taken && each.token.equals(token)) seat = each;
        if (seat == null) {
            // Resposta própria para o navegador esquecer a partida guardada em vez de tentar de novo.
            BridgeServer.send(ch, Session.toast("gone", "A partida " + code + " não existe mais."));
            return;
        }
        Seat currentSeat = s.seatOf(ch);
        if (currentSeat != null && currentSeat != seat)
            throw new IllegalArgumentException("Saia do seu assento antes de voltar a outro assento nesta sala.");
        if (seat.channel != null && seat.channel != ch) {
            // A conexão antiga pode ter caído sem a ponte perceber (Wi-Fi que some, notebook que dorme).
            // Ou a partida foi aberta em outra aba: a antiga é avisada para não tentar voltar sozinha.
            Channel old = seat.channel;
            byChannel.remove(old);
            BridgeServer.send(old, Session.toast("replaced", "A partida foi aberta em outra janela."));
            old.close();
        }
        if (byChannel.get(ch) != s) leave(ch);
        seat.channel = ch;
        byChannel.put(ch, s);
        Log.of(s).info("%s: %s voltou", label(s), seat.name);
        if (s.isRoom()) {
            if (s.started()) s.sendRoom(seat);
            else broadcastRoom(s);
            notifyOthers(s, seat, seat.name + " voltou.");
        }
        s.markDirty();
    }

    private synchronized void rematch(Channel ch) {
        Session s = byChannel.get(ch);
        Seat seat = s == null ? null : s.seatOf(ch);
        if (seat == null) return;
        if (!s.matchOver()) throw new IllegalArgumentException("Conclua a partida antes de pedir uma revanche.");
        if (!s.isRoom()) { s.start(); return; }
        if (!s.full()) return;
        for (Seat each : s.seats) {
            if (each.channel == null) throw new IllegalArgumentException(each.name + " não está conectado.");
        }
        seat.rematch = true;
        boolean all = true;
        for (Seat each : s.seats) all &= each.rematch;
        if (all) s.start();
        else notifyOthers(s, seat, seat.name + " quer jogar de novo.");
        s.markDirty();
    }

    /** Sai da partida atual e encerra a série; a sala fecha quando não sobra ninguém. */
    private synchronized void leave(Channel ch) {
        Session s = byChannel.remove(ch);
        if (s == null) return;
        if (dropWatcher(s, ch)) return;
        Seat seat = s.seatOf(ch);
        if (!s.isRoom()) { close(s, seat); return; }
        if (seat != null && !s.started() && seat.index != 0) {
            seat.channel = null; seat.deck = null; seat.taken = false; seat.departed = true; seat.owner(null);
            for (Seat each : s.seats) if (each.taken) s.sendRoom(each);
            s.markDirty(); expireIfAbandoned(s); return;
        }
        if (seat != null) {
            seat.conceded = true;
            s.abandon(seat);
            seat.channel = null;
            seat.rematch = false;
        }
        if (!s.started() || !s.anyoneConnected()) { close(s, seat); return; }
        notifyOthers(s, seat, (seat == null ? "O oponente" : seat.name) + " saiu da sala.");
        s.markDirty();
    }

    /** Na sala de teste, qualquer um dos lados fecha a sala: o outro volta ao início com o aviso. */
    private synchronized void labClose(Channel ch) {
        Session s = byChannel.get(ch);
        Seat seat = s == null ? null : s.seatOf(ch);
        if (seat == null || !s.isLab()) { leave(ch); return; }
        byChannel.remove(ch);
        seat.channel = null;
        for (Seat each : s.seats) if (each.channel != null) {
            byChannel.remove(each.channel, s);
            each.send(Session.toast("gone", seat.name + " fechou a sala de teste " + s.code + "."));
            each.channel = null;
        }
        close(s, seat);
    }

    /** Fecha a partida; {@code quitter} saiu por vontade própria (sem ele, ninguém voltou a tempo). */
    private void close(Session s, Seat quitter) {
        MatchJournal journal = s.journal();
        if (journal != null) {
            journal.detach();
            Map<String, Integer> tokens = new java.util.HashMap<>();
            for (Seat seat : s.seats) if (seat.token != null) tokens.put(seat.token, seat.index);
            closed.remove(s.code);
            closed.put(s.code, new Closed(journal, tokens, System.currentTimeMillis() + CLOSED_KEEP_MS));
            for (var it = closed.keySet().iterator(); closed.size() > MAX_CLOSED && it.hasNext(); ) { it.next(); it.remove(); }
        }
        s.recordAbandoned(quitter);
        s.stop();
        byCode.remove(s.code, s);
        for (Seat seat : s.seats) {
            if (seat.channel != null) {
                byChannel.remove(seat.channel, s);
                if (s.isRoom()) seat.send(Session.toast("error", "A sala " + s.code + " foi fechada."));
                seat.channel = null;
            }
        }
        // Quem assiste volta ao início: não há assento para onde voltar.
        for (Session.Watcher w : s.watchers) {
            byChannel.remove(w.channel, s);
            BridgeServer.send(w.channel, Session.toast("gone", s.isRoom() ? "A partida da sala " + s.code + " terminou." : "A partida terminou."));
        }
        s.watchers.clear();
        if (s.isRoom()) Log.of(s).info("Sala %s fechada", s.code);
    }

    /** Mensagens prontas do lobby: sem texto livre, não há o que moderar. */
    private static final java.util.Set<String> SAYINGS = java.util.Set.of("hello", "back", "invite", "glhf");
    private static final long SAY_EVERY_MS = 1500;

    /** {type:"room-say", key}: o balão vai para todos da sala, enquanto a partida não começa. */
    private synchronized void say(Channel ch, String key) {
        Session s = byChannel.get(ch);
        Seat seat = s == null ? null : s.seatOf(ch);
        if (seat == null || !s.isRoom() || s.started()) return;
        if (!SAYINGS.contains(key)) throw new IllegalArgumentException("Mensagem desconhecida.");
        long now = System.currentTimeMillis();
        if (now - seat.saidAt < SAY_EVERY_MS) return;
        seat.saidAt = now;
        JsonObject o = new JsonObject();
        o.addProperty("type", "room-say"); o.addProperty("seat", seat.index); o.addProperty("key", key);
        for (Seat each : s.seats) if (each.taken) each.send(o.toString());
    }

    private static void broadcastRoom(Session s) {
        for (Seat each : s.seats) if (each.taken && each.channel != null) s.sendRoom(each);
    }

    private static void notifyOthers(Session s, Seat from, String text) {
        for (Seat each : s.seats) if (each != from) each.send(Session.toast("toast", text));
    }
}
