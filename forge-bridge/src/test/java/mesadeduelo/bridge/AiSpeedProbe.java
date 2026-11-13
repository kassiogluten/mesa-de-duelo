package mesadeduelo.bridge;

import java.io.PrintWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import com.google.common.eventbus.Subscribe;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import forge.ai.LobbyPlayerAi;
import forge.deck.Deck;
import forge.game.Game;
import forge.game.GameEndReason;
import forge.game.Match;
import forge.game.event.GameEventTurnBegan;
import forge.game.player.Player;
import forge.game.player.RegisteredPlayer;
import forge.game.zone.ZoneType;
import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import org.junit.Assume;
import org.junit.BeforeClass;
import org.junit.Test;

/**
 * Medição, não é teste de regra (estudo em docs/velocidade-bots-2026-11-13.md, plano no item 124 do ROADMAP): quanto
 * tempo o computador leva por turno com a mesa cheia (Commander com 4) e onde esse tempo vai na thread do jogo (IA
 * pensando, regras do Forge, trabalho do servidor, esperando). Uma amostragem da pilha das threads do laço do jogo a
 * cada 5 ms classifica o tempo; a IA também avalia numa thread própria ("Game AI Eval"), que não entra na amostragem
 * e aparece como "esperando" em {@code AiController.chooseSpellAbilitiesToPlayFromList}.
 * <ul>
 *   <li>{@link #engineOnly}: 4 (e 2) IAs direto no Forge, sem servidor e sem Monte Carlo: o custo puro da IA.</li>
 *   <li>{@link #realSession}: a partida contra o computador de verdade ({@link Rooms}, "start"), com as preferências do
 *   servidor e um humano automático que passa tudo; grava os eventos que a mesa recebe em target/ai-speed-events*.jsonl
 *   (para o scripts/medir-apresentacao.mjs).</li>
 *   <li>{@link #boardSize}: a mesma partida começando com N permanentes por jogador já em jogo
 *   ({@code -Dmesa.campo=0,10,25,40}, {@code -Dmesa.turnosCampo=9}).</li>
 * </ul>
 * Fora do {@code mvn test} normal: {@code mvn -o test -Dtest=AiSpeedProbe#realSession -Dmesa.medir=true}. Para comparar:
 * {@code -Dmesa.semPausa=true} (sem a pausa do Forge quando o humano passa sozinho), {@code -Dmesa.semMC=true} (IA sem
 * Monte Carlo), {@code -Dmesa.umaMesa=true} (só a primeira mesa), {@code -Dmesa.turnos=16}.
 */
public class AiSpeedProbe {
    @BeforeClass public static void engine() {
        Assume.assumeTrue("Só com -Dmesa.medir=true", Boolean.getBoolean("mesa.medir"));
        BridgeRulesTest.engine();
    }

    static final String[][] TABLES = {
        {"commander-atraxa", "commander-goblins", "commander-elfos", "commander-zumbis"},
        {"commander-fichas", "commander-dragoes", "commander-muldrotha", "commander-voadores"},
    };
    static final int TURNS = Integer.getInteger("mesa.turnos", 16);

    // ---------- Amostragem ----------

    /** Amostra a pilha das threads que estão rodando o laço do jogo. */
    static final class Sampler implements AutoCloseable {
        final Map<String, Long> who = new ConcurrentHashMap<>(), waits = new ConcurrentHashMap<>(), leaf = new ConcurrentHashMap<>(), ai = new ConcurrentHashMap<>();
        final AtomicBoolean on = new AtomicBoolean(true);
        final Thread thread;
        volatile long samples;
        Sampler() {
            thread = new Thread(() -> {
                while (on.get()) {
                    for (var e : Thread.getAllStackTraces().entrySet()) {
                        StackTraceElement[] st = e.getValue();
                        if (!inGameLoop(st)) continue;
                        samples++;
                        classify(e.getKey().getState(), st);
                    }
                    try { Thread.sleep(5); } catch (InterruptedException ex) { return; }
                }
            }, "Amostragem");
            thread.setDaemon(true);
            thread.start();
        }
        static boolean inGameLoop(StackTraceElement[] st) {
            for (StackTraceElement f : st) if (f.getClassName().equals("forge.game.phase.PhaseHandler")) return true;
            return false;
        }
        void add(Map<String, Long> m, String k) { m.merge(k, 1L, Long::sum); }
        void classify(Thread.State state, StackTraceElement[] st) {
            String top = st.length > 0 ? st[0].getClassName() + "." + st[0].getMethodName() : "?";
            boolean parked = state == Thread.State.WAITING || state == Thread.State.TIMED_WAITING || state == Thread.State.BLOCKED
                || top.startsWith("jdk.internal.misc.Unsafe.park") || top.startsWith("java.lang.Object.wait");
            if (parked) {
                add(who, "esperando (jogador humano ou outra thread)");
                StringBuilder w = new StringBuilder();
                int k = 0;
                for (StackTraceElement f : st) {
                    String c = f.getClassName();
                    if (c.startsWith("java.") || c.startsWith("jdk.") || c.startsWith("sun.") || c.startsWith("com.google.")) continue;
                    w.append(k > 0 ? " < " : "").append(c.replaceFirst("^(forge|mesadeduelo\\.bridge)\\.", "")).append('.').append(f.getMethodName());
                    if (++k == 4) break;
                }
                add(waits, w.toString());
                return;
            }
            // Do mais externo para o mais interno.
            String bridge = null, aiFrame = null; boolean aiSeen = false, humanActions = false;
            for (int i = st.length - 1; i >= 0; i--) {
                String c = st[i].getClassName(), m = st[i].getMethodName();
                if (c.equals("forge.ai.AvailableActions")) humanActions = true;
                if (c.startsWith("forge.ai.") && !c.equals("forge.ai.AvailableActions") && !c.equals("forge.ai.PlayerControllerAi")) {
                    if (!aiSeen) aiFrame = c.substring(9) + "." + m;
                    aiSeen = true;
                }
                if (c.startsWith("mesadeduelo.bridge.") && bridge == null && !c.endsWith("Probe") && !c.contains("Probe$")) bridge = c.substring(19) + "." + m;
            }
            String l = st.length > 0 ? st[0].getClassName().replaceFirst("^forge\\.", "") + "." + st[0].getMethodName() : "?";
            add(leaf, l);
            if (humanActions) { add(who, "servidor: o que o humano pode fazer (AvailableActions)"); return; }
            if (aiSeen && bridge == null) { add(who, "IA pensando"); add(ai, aiFrame); return; }
            if (bridge != null) { add(who, "servidor: " + bridge.replaceFirst("\\$.*?\\.", ".")); return; }
            add(who, "regras do Forge (fora da IA)");
        }
        @Override public void close() throws InterruptedException { on.set(false); thread.join(1000); }
        void print(String title) {
            System.out.printf("%n== %s: %d amostras (~%.1f s de thread do jogo)%n", title, samples, samples * 5 / 1000.0);
            top("onde vai o tempo", who, 20);
            top("esperando onde", waits, 8);
            top("IA: decisão mais externa", ai, 15);
            top("método no topo da pilha", leaf, 15);
        }
        void top(String title, Map<String, Long> m, int n) {
            long total = m.values().stream().mapToLong(Long::longValue).sum();
            System.out.println("  -- " + title);
            m.entrySet().stream().sorted(Map.Entry.<String, Long>comparingByValue().reversed()).limit(n)
                .forEach(e -> System.out.printf("     %5.1f%%  %s%n", 100.0 * e.getValue() / Math.max(1, total), e.getKey()));
        }
    }

    // ---------- Turnos ----------

    record TurnRow(int turn, String player, boolean ai, int permanents, long ms) { }

    static int permanents(Game g) { int n = 0; for (Player p : g.getPlayers()) n += p.getZone(ZoneType.Battlefield).size(); return n; }

    static void printTurns(String title, List<TurnRow> rows) {
        System.out.println("  -- turnos (" + title + ")");
        for (TurnRow r : rows) System.out.printf("     turno %2d  %-22s %s  permanentes=%3d  %6.2f s%n", r.turn, r.player, r.ai ? "IA    " : "humano", r.permanents, r.ms / 1000.0);
        var ai = rows.stream().filter(TurnRow::ai).mapToLong(TurnRow::ms).sorted().toArray();
        if (ai.length > 0) System.out.printf("     turnos da IA: n=%d mediana=%.2f s p90=%.2f s máx=%.2f s soma=%.1f s%n", ai.length,
            ai[ai.length / 2] / 1000.0, ai[(int) (ai.length * .9)] / 1000.0, ai[ai.length - 1] / 1000.0, java.util.Arrays.stream(ai).sum() / 1000.0);
    }

    // ---------- Só o Forge ----------

    @Test public void engineOnly() throws Exception {
        for (String[] ids : TABLES) {
            runEngine(ids);
            runEngine(new String[]{ids[0], ids[1]});
        }
    }

    void runEngine(String[] ids) throws Exception {
        MatchConfig config = new MatchConfig("commander", "bo1", ids.length);
        List<RegisteredPlayer> players = new ArrayList<>();
        for (int i = 0; i < ids.length; i++)
            players.add(RegisteredPlayer.forCommander(Decks.build(ids[i])).setPlayer(new LobbyPlayerAi(ids[i].replace("commander-", ""), null)));
        Match match = new Match(config.rules(), players, "Velocidade");
        Game game = match.createGame();
        game.setNoGUIUser();
        List<TurnRow> rows = new ArrayList<>();
        long[] began = {System.nanoTime()}; String[] who = {null}; int[] perms = {0}; int[] turn = {0};
        game.subscribeToEvents(new Object() {
            @Subscribe public void turn(GameEventTurnBegan e) {
                long now = System.nanoTime();
                if (who[0] != null) rows.add(new TurnRow(turn[0], who[0], true, perms[0], (now - began[0]) / 1_000_000));
                began[0] = now; turn[0] = e.turnNumber(); who[0] = e.turnOwner().getName(); perms[0] = permanents(game);
                if (e.turnNumber() > TURNS) game.setGameOver(GameEndReason.Draw);
            }
        });
        AtomicReference<Throwable> error = new AtomicReference<>();
        long t0 = System.nanoTime();
        try (Sampler sampler = new Sampler()) {
            Thread t = new Thread(() -> { try { match.startGame(game); } catch (Throwable e) { error.set(e); } }, "Game velocidade");
            t.start(); t.join(900_000);
            if (error.get() != null) throw new AssertionError(error.get());
            String title = "SÓ O FORGE " + ids.length + " IAs " + String.join(",", ids) + " — " + (System.nanoTime() - t0) / 1_000_000_000.0 + " s";
            sampler.close();
            sampler.print(title);
            printTurns(title, rows);
        }
    }

    // ---------- Partida de verdade ----------

    /** As mesmas preferências do servidor (Main); -Dmesa.semPausa e -Dmesa.semMC tiram a pausa e o Monte Carlo. */
    static void productionPrefs() {
        // As mesmas preferências do servidor (Main); com -Dmesa.semPausa=true, sem a pausa do Forge ao passar sozinho.
        var prefs = forge.model.FModel.getPreferences();
        prefs.setPref(forge.localinstance.properties.ForgePreferences.FPref.UI_SHOW_ACTIONABLE_HIGHLIGHTS, "true");
        prefs.setPref(forge.localinstance.properties.ForgePreferences.FPref.UI_SELECT_FROM_CARD_DISPLAYS, "false");
        prefs.setPref(forge.localinstance.properties.ForgePreferences.FPref.YIELD_AUTO_PASS_NO_ACTIONS, "true");
        prefs.setPref(forge.localinstance.properties.ForgePreferences.FPref.UI_UNDO_MODE, forge.localinstance.properties.ForgeConstants.UNDO_MODE_OFF);
        String skip = Boolean.toString(Boolean.getBoolean("mesa.semPausa"));
        prefs.setPref(forge.localinstance.properties.ForgePreferences.FPref.YIELD_SKIP_PHASE_DELAY, skip);
        prefs.setPref(forge.localinstance.properties.ForgePreferences.FPref.YIELD_SKIP_RESOLVE_DELAY, skip);
        // Com -Dmesa.semMC=true, a IA sem as simulações de Monte Carlo (só as heurísticas).
        prefs.setPref(forge.localinstance.properties.ForgePreferences.FPref.MATCH_AI_FLAT_MONTE_CARLO, Boolean.toString(!Boolean.getBoolean("mesa.semMC")));
        System.out.println("MONTE CARLO DA IA: " + (Boolean.getBoolean("mesa.semMC") ? "desligado" : "ligado (como hoje)"));
        System.out.println("PAUSA DO FORGE AO PASSAR SOZINHO: " + (Boolean.getBoolean("mesa.semPausa") ? "desligada" : "ligada (como hoje)"));
    }

    @Test public void realSession() throws Exception {
        productionPrefs();
        Path out = Path.of("target", "ai-speed-events" + (Boolean.getBoolean("mesa.semPausa") ? "-sem-pausa" : "") + (Boolean.getBoolean("mesa.semMC") ? "-sem-mc" : "") + ".jsonl");
        try (PrintWriter events = new PrintWriter(Files.newBufferedWriter(out))) {
            for (String[] ids : TABLES) { runSession(ids, events); if (Boolean.getBoolean("mesa.umaMesa")) break; }
        }
        System.out.println("Eventos gravados em " + out.toAbsolutePath());
    }

    static String json(String[] ids) {
        StringBuilder b = new StringBuilder("[");
        for (int i = 1; i < ids.length; i++) b.append(i > 1 ? "," : "").append('"').append(ids[i]).append('"');
        return b.append(']').toString();
    }

    void runSession(String[] ids, PrintWriter events) throws Exception {
        Rooms rooms = new Rooms();
        EmbeddedChannel ch = new EmbeddedChannel();
        try (Sampler sampler = new Sampler()) {
            rooms.onMessage(ch, "{\"type\":\"start\",\"config\":{\"format\":\"commander\",\"matchLength\":\"bo1\",\"playerCount\":" + ids.length + "},\"you\":\"" + ids[0] + "\",\"opponents\":" + json(ids) + "}");
            Drive d = drive(ch, m -> rooms.onMessage(ch, m), String.join(",", ids), events, TURNS);
            rooms.onMessage(ch, "{\"type\":\"leave\"}");
            sampler.close();
            String title = "PARTIDA DE VERDADE (1 humano automático + " + (ids.length - 1) + " IAs) " + String.join(",", ids) + " — " + d.totalMs / 1000.0 + " s";
            sampler.print(title);
            printTurns(title, d.rows);
            System.out.printf("  -- estados recebidos=%d (%.1f KB em média), paradas do humano=%d, perguntas=%s%n", d.states, d.bytes / 1024.0 / Math.max(1, d.states), d.stops, d.answered);
        }
    }

    record Drive(List<TurnRow> rows, int states, long bytes, long stops, Map<String, Long> answered, long totalMs) { }

    /** Humano automático: lê os estados do canal, responde as perguntas e passa a prioridade, sem jogar nada. */
    static Drive drive(EmbeddedChannel ch, java.util.function.Consumer<String> send, String table, PrintWriter events, int turns) throws Exception {
        List<TurnRow> rows = new ArrayList<>();
        Map<String, Long> answered = new HashMap<>();
        long t0 = System.nanoTime();
        long lastGen = Long.MIN_VALUE, lastQuestion = Long.MIN_VALUE;
        int turn = -1; String turnPlayer = null; boolean turnAi = false; long turnStart = t0; int turnPerms = 0;
        Map<Integer, String> names = new HashMap<>(); Map<Integer, Boolean> isAi = new HashMap<>();
        int states = 0; long bytes = 0, humanStops = 0;
        {
            boolean over = false;
            long deadline = System.nanoTime() + 900_000_000_000L;
            while (!over && System.nanoTime() < deadline) {
                Object message; JsonObject latest = null;
                while ((message = ch.readOutbound()) != null) if (message instanceof TextWebSocketFrame frame) {
                    try {
                        String text = frame.text();
                        JsonObject o = JsonParser.parseString(text).getAsJsonObject();
                        if (!"state".equals(o.has("type") ? o.get("type").getAsString() : "")) continue;
                        states++; bytes += text.length();
                        long ms = (System.nanoTime() - t0) / 1_000_000;
                        if (events != null && o.has("events") && o.getAsJsonArray("events").size() > 0) {
                            JsonObject line = new JsonObject();
                            line.addProperty("table", table); line.addProperty("ms", ms); line.addProperty("turn", o.get("turn").getAsInt());
                            line.add("activePlayer", o.get("activePlayer")); line.add("events", o.getAsJsonArray("events"));
                            events.println(line);
                        }
                        latest = o;
                    } finally { frame.release(); }
                }
                if (latest == null) { Thread.sleep(5); continue; }
                JsonObject s = latest;
                if (names.isEmpty() && s.has("players")) for (JsonElement p : s.getAsJsonArray("players")) {
                    JsonObject po = p.getAsJsonObject();
                    names.put(po.get("id").getAsInt(), po.has("name") ? po.get("name").getAsString() : "?");
                    isAi.put(po.get("id").getAsInt(), po.get("id").getAsInt() != s.get("you").getAsInt());
                }
                int t = s.get("turn").getAsInt();
                if (t != turn && s.has("activePlayer") && !s.get("activePlayer").isJsonNull()) {
                    long now = System.nanoTime();
                    if (turnPlayer != null && turn > 0) rows.add(new TurnRow(turn, turnPlayer, turnAi, turnPerms, (now - turnStart) / 1_000_000));
                    turn = t; turnStart = now; int ap = s.get("activePlayer").getAsInt();
                    turnPlayer = names.getOrDefault(ap, "?"); turnAi = isAi.getOrDefault(ap, true);
                    turnPerms = 0; for (JsonElement p : s.getAsJsonArray("players")) { var po = p.getAsJsonObject(); if (po.has("battlefield")) turnPerms += po.getAsJsonArray("battlefield").size(); }
                    if (t > turns) { over = true; break; }
                }
                if (s.get("gameOver").getAsBoolean() || (s.has("spectating") && s.get("spectating").getAsBoolean())) {
                    System.out.println("  -- fim no turno " + t + " fase " + s.get("phase") + ": gameOver=" + s.get("gameOver") + " vencedor=" + s.get("winner") + " log=" + s.get("log"));
                    over = true; break;
                }
                // Humano automático: responde a pergunta e passa a prioridade, sem jogar nada.
                if (s.has("question") && !s.get("question").isJsonNull()) {
                    JsonObject q = s.getAsJsonObject("question");
                    long id = q.get("id").getAsLong();
                    if (id != lastQuestion) {
                        lastQuestion = id; humanStops++;
                        answered.merge(q.get("kind").getAsString() + ":" + q.get("method").getAsString(), 1L, Long::sum);
                        send.accept(answer(q).toString());
                    }
                    continue;
                }
                if (s.has("input") && !s.get("input").isJsonNull()) {
                    JsonObject in = s.getAsJsonObject("input");
                    long gen = in.get("gen").getAsLong();
                    boolean ok = in.has("ok") && in.get("ok").isJsonObject() && in.getAsJsonObject("ok").get("enabled").getAsBoolean();
                    if (gen != lastGen && in.has("selectablePlayers") && in.getAsJsonArray("selectablePlayers").size() > 0) {
                        // Quem começa (e outras escolhas de jogador): o próprio, se der.
                        lastGen = gen; humanStops++;
                        JsonElement pick = in.getAsJsonArray("selectablePlayers").get(0);
                        for (JsonElement p : in.getAsJsonArray("selectablePlayers")) if (p.getAsInt() == s.get("you").getAsInt()) pick = p;
                        send.accept("{\"type\":\"player\",\"id\":" + pick + ",\"gen\":" + gen + "}");
                    } else if (gen != lastGen && ok) {
                        lastGen = gen; humanStops++;
                        send.accept("{\"type\":\"ok\",\"gen\":" + gen + "}");
                    } else if (gen != lastGen && in.has("selectable") && in.getAsJsonArray("selectable").size() > 0) {
                        // Descartar no fim do turno e outras escolhas de carta sem OK: a primeira que der.
                        lastGen = gen; humanStops++;
                        send.accept("{\"type\":\"card\",\"id\":" + in.getAsJsonArray("selectable").get(0) + ",\"gen\":" + gen + "}");
                    }
                }
            }
            if (turnPlayer != null && turn > 0 && !over) rows.add(new TurnRow(turn, turnPlayer, turnAi, turnPerms, (System.nanoTime() - turnStart) / 1_000_000));
            return new Drive(rows, states, bytes, humanStops, answered, (System.nanoTime() - t0) / 1_000_000);
        }
    }

    // ---------- Campo cheio ----------

    /** Permanentes comuns, com habilidades estáticas, gatilhos e mana, sem nada que mate ou trave a mesa. */
    static final String[] FILL = {"Forest", "Plains", "Island", "Swamp", "Mountain", "Command Tower", "Sol Ring", "Arcane Signet",
        "Grizzly Bears", "Llanowar Elves", "Serra Angel", "Wall of Omens", "Soul Warden", "Glorious Anthem", "Elvish Mystic",
        "Hill Giant", "Lightning Greaves", "Gilded Lotus", "Wood Elves"};

    /**
     * O tamanho do campo pesa na resposta? Commander com 1 humano automático e 3 IAs, começando com N permanentes por
     * jogador já em jogo (0, 10, 25, 40: 0 a 160 na mesa). Mede o turno das IAs, quanto o servidor leva para montar o
     * estado que vai para a mesa (a cada 50 ms) e o tamanho dele, e o que a thread do jogo faz.
     */
    @Test public void boardSize() throws Exception {
        productionPrefs();
        String[] ids = TABLES[0];
        for (String each : System.getProperty("mesa.campo", "0,10,25,40").split(",")) runLoaded(ids, Integer.parseInt(each.trim()));
    }

    void runLoaded(String[] ids, int perPlayer) throws Exception {
        Deck you = Decks.build(ids[0]);
        List<Deck> opponents = new ArrayList<>(); List<String> names = new ArrayList<>();
        for (int i = 1; i < ids.length; i++) { opponents.add(Decks.build(ids[i])); names.add("Oponente " + i); }
        EmbeddedChannel ch = new EmbeddedChannel();
        // Direto no campo, sem o GameState (que esvazia todas as zonas do jogador): mão, grimório e comandante ficam.
        Session s = Session.replay("CAMPO" + perPlayer, ch, "Você", you, opponents, names, new MatchConfig("commander", "bo1", ids.length), game -> {
            for (int p = 0; p < game.getPlayers().size(); p++) {
                forge.game.player.Player player = game.getPlayers().get(p);
                for (int i = 0; i < perPlayer; i++) {
                    forge.game.card.Card c = forge.game.card.Card.fromPaperCard(DeckValidation.resolve(FILL[(i + p) % FILL.length]), player);
                    player.getZone(ZoneType.Battlefield).add(c);
                    c.setSickness(false);
                }
            }
            game.getAction().checkStaticAbilities();
        });
        List<Long> ticks = java.util.Collections.synchronizedList(new ArrayList<>());
        var publisher = java.util.concurrent.Executors.newSingleThreadScheduledExecutor();
        publisher.scheduleWithFixedDelay(() -> {
            long t0 = System.nanoTime();
            try { s.tick(); } catch (RuntimeException e) { e.printStackTrace(); }
            long ns = System.nanoTime() - t0;
            if (ns > 300_000) ticks.add(ns); // só os ciclos que publicaram algo
        }, 50, 50, java.util.concurrent.TimeUnit.MILLISECONDS);
        try (Sampler sampler = new Sampler()) {
            s.start();
            Seat seat = s.seats[0];
            Drive d = drive(ch, m -> { JsonObject o = JsonParser.parseString(m).getAsJsonObject(); s.onClientMessage(seat, ch, o.get("type").getAsString(), o); },
                "campo " + perPlayer, null, Integer.getInteger("mesa.turnosCampo", 9));
            sampler.close();
            s.concede(seat);
            s.stop();
            publisher.shutdownNow();
            String title = "CAMPO CHEIO: " + perPlayer + " permanentes por jogador no começo (" + perPlayer * ids.length + " na mesa) — " + d.totalMs / 1000.0 + " s";
            sampler.print(title);
            printTurns(title, d.rows);
            long[] t = ticks.stream().mapToLong(Long::longValue).sorted().toArray();
            if (t.length == 0) t = new long[]{0};
            System.out.printf("  -- estado para a mesa: %.1f KB em média | montar e mandar: mediana %.1f ms, p95 %.1f ms, máx %.1f ms (%d publicações) | paradas do humano=%d%n",
                d.bytes / 1024.0 / Math.max(1, d.states), t[t.length / 2] / 1e6, t[(int) (t.length * .95)] / 1e6, t[t.length - 1] / 1e6, t.length, d.stops);
        } finally { publisher.shutdownNow(); }
    }

    static JsonObject answer(JsonObject q) {
        JsonObject a = new JsonObject();
        a.addProperty("type", "answer"); a.add("id", q.get("id"));
        String kind = q.get("kind").getAsString();
        int n = q.has("options") ? q.getAsJsonArray("options").size() : 0;
        int min = q.has("min") ? q.get("min").getAsInt() : 1;
        JsonArray idx = new JsonArray();
        switch (kind) {
            case "confirm" -> a.addProperty("value", false);
            case "order" -> { for (int i = 0; i < n; i++) idx.add(i); a.add("indices", idx); }
            case "reveal" -> a.add("indices", idx);
            case "text" -> { if (n > 0) { idx.add(0); a.add("indices", idx); } else a.addProperty("text", q.has("initial") ? q.get("initial").getAsString() : "0"); }
            case "amount" -> {
                if (q.has("suggested")) a.add("amounts", q.get("suggested"));
                else { JsonArray am = new JsonArray(); int total = q.has("total") ? q.get("total").getAsInt() : 0; for (int i = 0; i < n; i++) am.add(i == 0 ? total : 0); a.add("amounts", am); }
            }
            default -> { for (int i = 0; i < Math.max(min, n > 0 ? 1 : 0) && i < n; i++) idx.add(i); a.add("indices", idx); }
        }
        return a;
    }
}
