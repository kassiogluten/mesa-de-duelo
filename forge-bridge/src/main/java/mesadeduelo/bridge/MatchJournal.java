package mesadeduelo.bridge;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

import com.google.common.eventbus.Subscribe;
import com.google.gson.JsonArray;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;

import forge.deck.Deck;
import forge.game.Game;
import forge.game.GameState;
import forge.game.event.GameEvent;
import forge.game.event.GameEventTurnBegan;
import forge.game.event.GameEventTurnPhase;
import forge.game.phase.PhaseType;
import forge.game.player.Player;

/**
 * Diário de uma partida, só em memória: decks de todos, configuração, quem começou, mulligans, retratos do Forge
 * ({@link GameState}) no começo dos últimos turnos e as ações recebidas e recusadas de cada assento.
 * Só sai da ponte num relato com a partida anexada e nunca vai para nenhum jogador (tem mãos e grimórios de todos).
 */
final class MatchJournal {
    static final int MAX_SNAPSHOTS = 3, MAX_ACTIONS = 2000, MAX_DETAIL = 200;

    final String matchId;
    private final String code;
    private final boolean room;
    private final MatchConfig config;
    private final String startedAt = now();
    private final JsonArray players = new JsonArray();
    private final JsonArray games = new JsonArray();
    private final ArrayDeque<JsonObject> snapshots = new ArrayDeque<>();
    private final ArrayDeque<JsonObject> actions = new ArrayDeque<>();
    private long droppedActions;
    private Game game;
    private int gameNumber;
    /** Turno começou e o retrato espera o fim do desvirar (veja {@link #receive}). */
    private boolean pendingSnapshot;

    MatchJournal(String matchId, String code, boolean room, MatchConfig config) {
        this.matchId = matchId; this.code = code; this.room = room; this.config = config;
    }

    static String now() { return Instant.now().toString(); }

    /** Jogador na ordem da partida do Forge (a posição é o índice pN do retrato); seat é null para a IA. */
    synchronized void player(int position, String name, boolean ai, Integer seat, Deck deck) {
        JsonObject p = new JsonObject();
        p.addProperty("position", position); p.addProperty("name", name); p.addProperty("ai", ai);
        if (seat == null) p.add("seat", JsonNull.INSTANCE); else p.addProperty("seat", seat);
        p.add("deck", DeckValidation.deckJson(deck));
        players.add(p);
    }

    /** Passa a acompanhar o jogo atual (um por jogo da melhor de três); chamado de novo para o mesmo jogo não faz nada. */
    synchronized void attach(Game next, int number) {
        if (next == null || next == game) return;
        game = next; gameNumber = number; pendingSnapshot = false;
        next.subscribeToEvents(new Object() {
            @Subscribe public void receive(GameEvent event) { MatchJournal.this.receive(next, event); }
        });
    }

    /**
     * Na thread do jogo. O retrato do turno é tirado logo depois do passo de desvirar (quando começa a manutenção),
     * com a pilha vazia: restaurado na fase de desvirar, o turno segue dali com os gatilhos de manutenção.
     */
    private synchronized void receive(Game source, GameEvent event) {
        if (source != game) return;
        if (event instanceof GameEventTurnBegan) { pendingSnapshot = true; return; }
        if (pendingSnapshot && event instanceof GameEventTurnPhase phase && phase.phase() != PhaseType.UNTAP) {
            pendingSnapshot = false;
            if (!hasGame(gameNumber)) startedGame(source);
            try { snapshot(source, "turno", PhaseType.UNTAP); }
            catch (RuntimeException e) { System.err.println("Diário: retrato do turno falhou: " + e); }
        }
    }

    /** Partida encerrada: solta o jogo (o diário ainda fica guardado um tempo para relatos, sem prender o motor). */
    synchronized void detach() { game = null; pendingSnapshot = false; }

    private boolean hasGame(int number) {
        for (var g : games) if (g.getAsJsonObject().get("gameNumber").getAsInt() == number) return true;
        return false;
    }

    private void startedGame(Game source) {
        JsonObject g = new JsonObject();
        g.addProperty("gameNumber", gameNumber);
        Player first = source.getStartingPlayer() != null ? source.getStartingPlayer() : source.getPhaseHandler().getPlayerTurn();
        g.addProperty("startingPlayer", source.getPlayers().indexOf(first));
        JsonArray mulligans = new JsonArray();
        for (Player p : source.getPlayers()) {
            JsonObject m = new JsonObject();
            m.addProperty("position", source.getPlayers().indexOf(p));
            m.addProperty("count", p.getStats().getMulliganCount());
            mulligans.add(m);
        }
        g.add("mulligans", mulligans);
        games.add(g);
    }

    /** Retrato do jogo agora; {@code phase} substitui a fase gravada (null mantém a do jogo). */
    private JsonObject snapshot(Game source, String reason, PhaseType phase) {
        GameState state = new GameState();
        state.initFromGame(source);
        String text = state.toString();
        if (phase != null) text = text.replaceFirst("(?m)^activephase=.*$", "activephase=" + phase.name());
        JsonObject s = new JsonObject();
        s.addProperty("gameNumber", gameNumber);
        s.addProperty("turn", source.getPhaseHandler().getTurn());
        s.addProperty("activePlayer", source.getPlayers().indexOf(source.getPhaseHandler().getPlayerTurn()));
        PhaseType current = source.getPhaseHandler().getPhase();
        s.addProperty("phase", phase != null ? phase.name() : current == null ? null : current.name());
        s.addProperty("at", now());
        s.addProperty("reason", reason);
        JsonArray names = new JsonArray();
        for (Player p : source.getPlayers()) names.add(p.getName());
        s.add("players", names);
        s.addProperty("state", text);
        if ("turno".equals(reason)) {
            snapshots.addLast(s);
            while (snapshots.size() > MAX_SNAPSHOTS) snapshots.removeFirst();
        }
        return s;
    }

    /** Uma mensagem do navegador: "recebida" ou "recusada" (tela desatualizada, vez de outro...). */
    synchronized void action(int seat, String type, Integer gen, long stateVersion, String result, String detail) {
        JsonObject a = new JsonObject();
        a.addProperty("at", now()); a.addProperty("seat", seat); a.addProperty("type", type);
        if (gen != null && gen >= 0) a.addProperty("gen", gen);
        a.addProperty("stateVersion", stateVersion); a.addProperty("result", result);
        if (detail != null && !detail.isEmpty()) a.addProperty("detail", detail.length() > MAX_DETAIL ? detail.substring(0, MAX_DETAIL) + "…" : detail);
        actions.addLast(a);
        while (actions.size() > MAX_ACTIONS) { actions.removeFirst(); droppedActions++; }
    }

    synchronized int actionCount() { return actions.size(); }
    synchronized long droppedActions() { return droppedActions; }
    synchronized int snapshotCount() { return snapshots.size(); }

    /**
     * O diário para gravar com um relato. Com {@code live}, acrescenta um retrato do instante do relato
     * (melhor esforço: o jogo continua andando na sua thread enquanto o retrato é tirado).
     */
    synchronized JsonObject json(Integer reporterSeat, boolean live) {
        JsonObject o = new JsonObject();
        o.addProperty("matchId", matchId); o.addProperty("code", code); o.addProperty("room", room);
        o.addProperty("startedAt", startedAt);
        if (reporterSeat == null) o.add("reporterSeat", JsonNull.INSTANCE); else o.addProperty("reporterSeat", reporterSeat);
        JsonObject c = new JsonObject();
        c.addProperty("format", config.format()); c.addProperty("matchLength", config.matchLength()); c.addProperty("playerCount", config.playerCount());
        o.add("config", c);
        o.add("players", players.deepCopy());
        o.add("games", games.deepCopy());
        JsonArray shots = new JsonArray();
        for (JsonObject s : snapshots) shots.add(s.deepCopy());
        Game current = game;
        // Antes do primeiro turno (mulligan) não há fase: fica sem o retrato do instante.
        if (live && current != null && !current.isGameOver() && current.getPhaseHandler().getPhase() != null) {
            try {
                JsonObject s = snapshot(current, "relato", null);
                s.addProperty("bestEffort", true);
                shots.add(s);
            } catch (RuntimeException e) {
                System.err.println("Diário: retrato do relato falhou: " + e);
            }
        }
        o.add("snapshots", shots);
        JsonArray list = new JsonArray();
        for (JsonObject a : actions) list.add(a.deepCopy());
        o.add("actions", list);
        o.addProperty("droppedActions", droppedActions);
        return o;
    }

    /** Assentos e decks na ordem da partida, para a repetição. */
    static List<JsonObject> players(JsonObject journal) {
        List<JsonObject> list = new ArrayList<>();
        for (var p : journal.getAsJsonArray("players")) list.add(p.getAsJsonObject());
        list.sort(java.util.Comparator.comparingInt(p -> p.get("position").getAsInt()));
        return list;
    }
}
