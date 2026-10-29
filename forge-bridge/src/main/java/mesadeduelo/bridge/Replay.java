package mesadeduelo.bridge;

import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.GZIPInputStream;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import forge.deck.Deck;
import forge.game.Game;
import forge.game.GameState;
import io.netty.channel.Channel;

/**
 * Modo de desenvolvimento: {@code --mode=replay --relato=<arquivo .json.gz> [--retrato=N]}.
 *
 * O primeiro {type:"start"} do navegador vira a partida do relato: mesma configuração, quem relatou como humano
 * com o próprio deck e os demais como IA com os seus decks. No começo do jogo (depois do mulligan) o retrato
 * escolhido do Forge ({@link GameState}) é aplicado; o que não voltou igual e as ações do diário dali em diante
 * saem no console, como roteiro.
 *
 * O Forge põe o humano antes da IA, então a ordem é girada para quem relatou ficar em primeiro sem mudar a ordem
 * dos turnos, e o retrato é renumerado (p0, p1...) do mesmo jeito.
 *
 * Limites conhecidos do GameState: efeitos "até o fim do turno", gatilhos atrasados, a pilha, escolhas feitas
 * em turnos anteriores e contadores do jogo (tempestade, mágicas conjuradas no turno) não voltam; por isso os
 * retratos são do começo do turno, logo depois do desvirar.
 */
final class Replay {
    final JsonObject journal;
    final JsonObject snapshot;
    final int snapshotIndex;
    final MatchConfig config;
    /** Posição original (no relato) de cada jogador na ordem nova: order.get(nova) = original. */
    final List<Integer> order;
    final List<JsonObject> players;

    Replay(JsonObject journal, Integer chosen) {
        this.journal = journal;
        JsonArray shots = journal.getAsJsonArray("snapshots");
        if (shots == null || shots.isEmpty()) throw new IllegalArgumentException("O diário deste relato não tem nenhum retrato do Forge.");
        snapshotIndex = chosen == null ? shots.size() - 1 : chosen;
        if (snapshotIndex < 0 || snapshotIndex >= shots.size())
            throw new IllegalArgumentException("Retrato " + snapshotIndex + " não existe (há " + shots.size() + ").");
        snapshot = shots.get(snapshotIndex).getAsJsonObject();
        JsonObject c = journal.getAsJsonObject("config");
        config = new MatchConfig(c.get("format").getAsString(), c.get("matchLength").getAsString(), c.get("playerCount").getAsInt(), c.has("undo") && c.get("undo").getAsBoolean());
        players = MatchJournal.players(journal);
        int reporter = reporterPosition(journal, players), n = players.size();
        order = new ArrayList<>();
        for (int i = 0; i < n; i++) order.add((reporter + i) % n);
    }

    /** Lê um relato guardado ({@code relatos/AAAA-MM/R-XXXX.json.gz}) e devolve o diário da ponte. */
    static JsonObject journalOf(Path relato) throws IOException {
        JsonObject stored;
        try (var in = new InputStreamReader(new GZIPInputStream(Files.newInputStream(relato)), StandardCharsets.UTF_8)) {
            stored = JsonParser.parseReader(in).getAsJsonObject();
        }
        JsonElement bridge = stored.get("bridge");
        if (bridge == null || !bridge.isJsonObject())
            throw new IllegalArgumentException("O relato " + relato.getFileName() + " não tem o diário da ponte (foi enviado sem a partida anexada ou de fora da partida).");
        return bridge.getAsJsonObject();
    }

    private static int reporterPosition(JsonObject journal, List<JsonObject> players) {
        JsonElement seat = journal.get("reporterSeat");
        for (JsonObject p : players)
            if (seat != null && !seat.isJsonNull() && !p.get("seat").isJsonNull() && p.get("seat").getAsInt() == seat.getAsInt())
                return p.get("position").getAsInt();
        for (JsonObject p : players) if (!p.get("ai").getAsBoolean()) return p.get("position").getAsInt();
        return 0;
    }

    static Deck deck(JsonObject player, String format) {
        var result = DeckValidation.validate(player.get("deck"), format);
        if (!result.valid()) System.out.println("Aviso: o deck de " + player.get("name").getAsString() + " não passa mais na validação: " + result.json().get("issues"));
        return result.deck();
    }

    /** O retrato renumerado para a ordem nova. */
    String state() {
        Map<Integer, Integer> newIndex = new LinkedHashMap<>();
        for (int i = 0; i < order.size(); i++) newIndex.put(order.get(i), i);
        return renumber(snapshot.get("state").getAsString(), newIndex);
    }

    private static final Pattern PLAYER_LINE = Pattern.compile("(?m)^(p)(\\d)(?=[a-z])|^(activeplayer=p)(\\d)\\s*$|(\\|(?:Owner|PhasedOut|EnchantingPlayer):P)(\\d)");

    /** Troca os índices de jogador (pN no começo da linha, activeplayer e Owner/PhasedOut/EnchantingPlayer:PN). */
    static String renumber(String state, Map<Integer, Integer> newIndex) {
        Matcher m = PLAYER_LINE.matcher(state);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            int group = m.group(1) != null ? 1 : m.group(3) != null ? 3 : 5;
            int old = Integer.parseInt(m.group(group + 1));
            m.appendReplacement(sb, Matcher.quoteReplacement(m.group(group) + newIndex.getOrDefault(old, old)));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    Session session(String code, Channel ch) {
        JsonObject reporter = players.get(order.get(0));
        List<Deck> decks = new ArrayList<>();
        List<String> names = new ArrayList<>();
        for (int i = 1; i < order.size(); i++) {
            JsonObject p = players.get(order.get(i));
            decks.add(deck(p, config.format()));
            names.add(p.get("name").getAsString());
        }
        String state = state();
        System.out.printf("Repetição: %s (humano) x %s; retrato %d, turno %s, %s%n", reporter.get("name").getAsString(),
            String.join(", ", names), snapshotIndex, snapshot.get("turn"), snapshot.get("reason").getAsString());
        System.out.println("Responda ao mulligan normalmente: o retrato é aplicado logo depois e substitui mãos, grimórios e campo.");
        return Session.replay(code, ch, reporter.get("name").getAsString(), deck(reporter, config.format()), decks, names, config,
            game -> apply(game, state));
    }

    /** Na thread do jogo (gancho do começo do jogo): aplica o retrato e mostra o que não voltou igual e o roteiro. */
    void apply(Game game, String state) {
        try {
            GameState gs = new GameState();
            gs.parse(Arrays.asList(state.split("\n")));
            gs.applyToGame(game);
            // O GameState muda o turno sem avisar a vista do jogo, que é o que a mesa recebe.
            game.updateTurnForView();
            game.updatePhaseForView();
            List<String> diff = diff(state, snapshotOf(game));
            if (diff.isEmpty()) System.out.println("Retrato aplicado: o jogo voltou igual.");
            else {
                System.out.println("Retrato aplicado, mas não voltou igual:");
                diff.forEach(line -> System.out.println("  " + line));
            }
        } catch (RuntimeException e) {
            System.out.println("Não foi possível aplicar o retrato: " + e);
            e.printStackTrace();
        }
        System.out.println(script(journal, snapshot.get("at").getAsString(), players));
    }

    static String snapshotOf(Game game) {
        GameState gs = new GameState();
        gs.initFromGame(game);
        return gs.toString();
    }

    private static final Pattern IDS = Pattern.compile("(\\|(?:Id|AttachedTo|ExiledWith|ChosenCards|RememberedCards|Imprinting):)[\\d,]+");

    /** Linhas do retrato que diferem: cartas a mais ou a menos em cada zona e os outros valores. Ids de carta são ignorados. */
    static List<String> diff(String expected, String actual) {
        Map<String, String> want = lines(expected), got = lines(actual);
        List<String> out = new ArrayList<>();
        java.util.Set<String> keys = new java.util.TreeSet<>(want.keySet());
        keys.addAll(got.keySet());
        for (String key : keys) {
            String a = want.getOrDefault(key, ""), b = got.getOrDefault(key, "");
            if (a.equals(b)) continue;
            if (key.matches("p\\d(hand|library|graveyard|exile|battlefield|command|sideboard)")) {
                List<String> missing = cards(a), extra = cards(b);
                for (String c : cards(b)) missing.remove(c);
                for (String c : cards(a)) extra.remove(c);
                if (missing.isEmpty() && extra.isEmpty()) {
                    if (!key.endsWith("library")) continue;
                    out.add(key + ": mesmas cartas em outra ordem");
                    continue;
                }
                if (!missing.isEmpty()) out.add(key + " faltando: " + String.join("; ", missing));
                if (!extra.isEmpty()) out.add(key + " a mais: " + String.join("; ", extra));
            } else {
                out.add(key + ": esperado \"" + a + "\", veio \"" + b + "\"");
            }
        }
        return out;
    }

    private static Map<String, String> lines(String state) {
        Map<String, String> map = new LinkedHashMap<>();
        for (String line : state.split("\n")) {
            int eq = line.indexOf('=');
            if (eq > 0) map.put(line.substring(0, eq), IDS.matcher(line.substring(eq + 1)).replaceAll("$1#"));
        }
        return map;
    }

    private static List<String> cards(String zone) {
        List<String> list = new ArrayList<>();
        for (String c : zone.split(";")) if (!c.isBlank()) list.add(c.strip());
        return list;
    }

    /** As ações do diário a partir de um instante, uma por linha, para seguir na mesa. */
    static String script(JsonObject journal, String from, List<JsonObject> players) {
        Map<Integer, String> seatNames = new LinkedHashMap<>();
        for (JsonObject p : players) if (!p.get("seat").isJsonNull()) seatNames.put(p.get("seat").getAsInt(), p.get("name").getAsString());
        StringBuilder sb = new StringBuilder("Roteiro (ações do diário depois do retrato):\n");
        int count = 0;
        for (JsonElement e : journal.getAsJsonArray("actions")) {
            JsonObject a = e.getAsJsonObject();
            if (a.get("at").getAsString().compareTo(from) < 0) continue;
            count++;
            sb.append("  ").append(a.get("at").getAsString(), 11, Math.min(23, a.get("at").getAsString().length()))
                .append("  ").append(seatNames.getOrDefault(a.get("seat").getAsInt(), "assento " + a.get("seat")))
                .append("  ").append(a.get("type").getAsString());
            if (a.has("gen")) sb.append(" gen=").append(a.get("gen"));
            sb.append(" v").append(a.get("stateVersion"));
            if (a.has("detail")) sb.append("  ").append(a.get("detail").getAsString());
            if ("recusada".equals(a.get("result").getAsString())) sb.append("  [recusada]");
            sb.append('\n');
        }
        if (count == 0) sb.append("  (nenhuma)\n");
        if (journal.has("droppedActions") && journal.get("droppedActions").getAsLong() > 0)
            sb.append("  (").append(journal.get("droppedActions")).append(" ações mais antigas foram descartadas)\n");
        return sb.toString();
    }

    /** Lista os retratos do diário, para escolher com --retrato. */
    static String list(JsonObject journal) {
        StringBuilder sb = new StringBuilder();
        JsonArray shots = journal.getAsJsonArray("snapshots");
        for (int i = 0; i < shots.size(); i++) {
            JsonObject s = shots.get(i).getAsJsonObject();
            sb.append(String.format("  [%d] jogo %s, turno %s, vez de p%s, %s (%s) %s%n", i, s.get("gameNumber"), s.get("turn"),
                s.get("activePlayer"), s.get("phase").isJsonNull() ? "?" : s.get("phase").getAsString(), s.get("reason").getAsString(), s.get("at").getAsString()));
        }
        return sb.toString();
    }
}
