package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.Set;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;

/**
 * Um torneio suíço presencial: jogadores, rodadas sorteadas, placares em jogos e a classificação, sem disco nem rede
 * (quem grava e responde é {@link Tournaments}).
 *
 * Pontos de partida: vitória 3, empate 1, derrota 0; o bye vale uma vitória por 2-0. Desempates como no Magic (MTR,
 * apêndice C): % de vitórias dos oponentes, % de jogos ganhos e % de jogos ganhos dos oponentes, com piso de 1/3.
 * Quem entra atrasado (inscrito depois do sorteio da 1ª rodada e antes da 2ª) começa com uma derrota por 0-2 na 1ª,
 * sem oponente: ela conta para ele e não entra no desempate de ninguém, como o bye.
 *
 * Sorteio: a 1ª rodada é aleatória; nas seguintes, os jogadores vão por pontos (embaralhados dentro dos mesmos pontos)
 * e cada um enfrenta o mais próximo com quem ainda não jogou. Com número ímpar, o bye vai para o de menos pontos que
 * ainda não teve bye.
 */
final class Tournament {
    static final int MAX_PLAYERS = 256;
    static final int MAX_ROUNDS = 15;
    static final int NAME_MAX = 40;
    static final int TITLE_MAX = 60;
    static final int FORMAT_MAX = 30;
    /** Mais jogos que isso numa partida é erro de digitação. */
    static final int MAX_GAMES = 5;
    /** Passos da busca de confrontos sem revanche antes de aceitar revanches. */
    private static final int PAIRING_STEPS = 200_000;

    static final class Player {
        final int id;
        String name;
        /** 1: desde o começo; 2: entrou atrasado e perdeu a 1ª rodada. */
        int joined = 1;
        /** 0: no torneio; N: saiu depois da rodada N e não é mais sorteado. */
        int dropped;
        Player(int id, String name) { this.id = id; this.name = name; }
    }

    /** Placar em jogos do jogador {@code a} contra o {@code b}, com os jogos empatados. */
    record Score(int a, int b, int draws) {
        static final Score BYE = new Score(2, 0, 0);
        Score swap() { return new Score(b, a, draws); }
        int matchPoints() { return a > b ? 3 : a == b ? 1 : 0; }
    }

    static final class Table {
        final int number;
        final int a;
        /** 0: bye. */
        final int b;
        Score result;
        Table(int number, int a, int b, Score result) { this.number = number; this.a = a; this.b = b; this.result = result; }
        boolean bye() { return b == 0; }
    }

    /** {@code extra}: sorteada além das planejadas, com o botão Rodada extra. */
    record Round(int number, List<Table> tables, boolean extra) {
        Round(int number, List<Table> tables) { this(number, tables, false); }
        boolean complete() { return tables.stream().allMatch(t -> t.result != null); }
    }

    /** Uma linha da classificação. */
    record Standing(Player player, int points, int wins, int losses, int draws, double omw, double gw, double ogw, boolean hasOpponents) { }

    final String id;
    String title;
    String format;
    final String organizer;
    String organizerName;
    final long created;
    int plannedRounds;
    boolean finished;
    /** O relógio da rodada atual; sortear ou desfazer uma rodada o volta ao tempo cheio. */
    RoundClock clock = new RoundClock();
    final List<Player> players = new ArrayList<>();
    final List<Round> rounds = new ArrayList<>();
    private int nextPlayer = 1;

    Tournament(String id, String title, String format, String organizer, String organizerName, long created) {
        this.id = id; this.organizer = organizer; this.organizerName = organizerName; this.created = created;
        this.title = cleanTitle(title);
        this.format = clean(format, FORMAT_MAX);
    }

    // ---------- Estado ----------

    String status() { return finished ? "encerrado" : rounds.isEmpty() ? "inscricoes" : "andamento"; }

    Round current() { return rounds.isEmpty() ? null : rounds.get(rounds.size() - 1); }

    /** Inscrição aberta: antes de começar, ou atrasado enquanto a 2ª rodada não foi sorteada. */
    boolean canRegister() { return !finished && rounds.size() <= 1; }

    /** Rodadas sugeridas pela tabela da Wizards: 2 jogadores → 1, até 4 → 2, até 8 → 3, até 16 → 4... */
    static int suggestedRounds(int players) {
        int rounds = 1;
        while ((1 << rounds) < players) rounds++;
        return Math.min(rounds, MAX_ROUNDS);
    }

    /** As rodadas planejadas; sem escolha do organizador, as sugeridas para os jogadores de agora. */
    int rounds() { return plannedRounds > 0 ? plannedRounds : Math.max(suggestedRounds(players.size()), rounds.size()); }

    Player player(int id) {
        for (Player p : players) if (p.id == id) return p;
        throw new IllegalArgumentException("Esse jogador não está no torneio.");
    }

    // ---------- Organizador ----------

    void rename(String title) { this.title = cleanTitle(title); }
    void format(String format) { this.format = clean(format, FORMAT_MAX); }

    /** 0 volta para a sugestão automática. */
    void plannedRounds(int n) {
        if (finished) throw new IllegalArgumentException("O torneio já terminou. Reabra para mudar as rodadas.");
        if (n != 0 && (n < Math.max(1, rounds.size()) || n > MAX_ROUNDS))
            throw new IllegalArgumentException("Escolha de " + Math.max(1, rounds.size()) + " a " + MAX_ROUNDS + " rodadas.");
        plannedRounds = n;
    }

    Player addPlayer(String name) {
        String n = clean(name, NAME_MAX);
        if (n == null) throw new IllegalArgumentException("Digite o nome do jogador.");
        if (!canRegister()) throw new IllegalArgumentException(finished ? "O torneio já terminou." : "As inscrições fecharam: a 2ª rodada já foi sorteada.");
        if (players.size() >= MAX_PLAYERS) throw new IllegalArgumentException("O torneio já tem " + MAX_PLAYERS + " jogadores.");
        for (Player p : players) if (p.name.equalsIgnoreCase(n)) throw new IllegalArgumentException("Já há um jogador com esse nome.");
        Player p = new Player(nextPlayer++, n);
        if (!rounds.isEmpty()) p.joined = 2;
        players.add(p);
        return p;
    }

    void renamePlayer(int id, String name) {
        String n = clean(name, NAME_MAX);
        if (n == null) throw new IllegalArgumentException("Digite o nome do jogador.");
        for (Player p : players) if (p.id != id && p.name.equalsIgnoreCase(n)) throw new IllegalArgumentException("Já há um jogador com esse nome.");
        player(id).name = n;
    }

    /** Só quem ainda não foi sorteado sai da lista; quem já jogou deixa o torneio com {@link #drop}. */
    void removePlayer(int id) {
        Player p = player(id);
        if (playedAny(id)) throw new IllegalArgumentException("Esse jogador já foi sorteado: use Sair do torneio.");
        players.remove(p);
    }

    /** Sai do torneio: fica na classificação e deixa de ser sorteado a partir da próxima rodada. */
    void drop(int id, boolean out) {
        if (finished) throw new IllegalArgumentException("O torneio já terminou.");
        if (rounds.isEmpty()) throw new IllegalArgumentException("O torneio ainda não começou: tire o jogador da lista.");
        player(id).dropped = out ? rounds.size() : 0;
    }

    /** Sorteia a próxima rodada. */
    Round pairNext(Random random) {
        if (finished) throw new IllegalArgumentException("O torneio já terminou.");
        Round last = current();
        if (last != null && !last.complete()) throw new IllegalArgumentException("Falta lançar resultados da rodada " + last.number() + ".");
        if (rounds.size() >= rounds()) throw new IllegalArgumentException("Todas as " + rounds() + " rodadas já foram jogadas. Encerre o torneio ou aumente as rodadas.");
        List<Player> active = new ArrayList<>(players.stream().filter(p -> p.dropped == 0).toList());
        if (active.size() < 2) throw new IllegalArgumentException("São precisos ao menos 2 jogadores no torneio.");
        // A sugestão automática passa a valer como escolha ao começar: inscrições atrasadas não mudam o número.
        if (rounds.isEmpty() && plannedRounds == 0) plannedRounds = suggestedRounds(active.size());
        int number = rounds.size() + 1;
        Round round = new Round(number, number == 1 ? firstRound(active, random) : swissRound(active, random));
        rounds.add(round);
        clock.reset();
        return round;
    }

    /**
     * Rodada extra, depois de jogadas todas as planejadas e antes de encerrar: mais uma rodada no planejado e o sorteio
     * dela, de uma vez. Desfazer o sorteio dela tira a rodada a mais de novo.
     */
    Round pairExtra(Random random) {
        if (finished) throw new IllegalArgumentException("O torneio já terminou. Reabra para sortear mais uma rodada.");
        if (rounds.isEmpty()) throw new IllegalArgumentException("O torneio ainda não começou.");
        if (rounds.size() < rounds()) throw new IllegalArgumentException("Ainda há rodadas planejadas: sorteie a rodada " + (rounds.size() + 1) + ".");
        if (rounds.size() >= MAX_ROUNDS) throw new IllegalArgumentException("O torneio já tem " + MAX_ROUNDS + " rodadas, o máximo.");
        int planned = plannedRounds;
        plannedRounds = rounds.size() + 1;
        try {
            Round r = pairNext(random);
            Round extra = new Round(r.number(), r.tables(), true);
            rounds.set(rounds.size() - 1, extra);
            return extra;
        } catch (IllegalArgumentException e) {
            plannedRounds = planned;
            throw e;
        }
    }

    /** Desfaz o sorteio da última rodada, enquanto ela não tem nenhum resultado lançado. */
    void undoPairing() {
        Round last = current();
        if (last == null) throw new IllegalArgumentException("Nenhuma rodada foi sorteada.");
        if (finished) throw new IllegalArgumentException("O torneio já terminou.");
        if (last.tables().stream().anyMatch(t -> !t.bye() && t.result != null)) throw new IllegalArgumentException("A rodada já tem resultados: apague-os antes de desfazer o sorteio.");
        rounds.remove(rounds.size() - 1);
        clock.reset();
        if (last.extra()) plannedRounds = Math.max(1, plannedRounds - 1);
        for (Player p : players) {
            if (p.dropped > rounds.size()) p.dropped = rounds.isEmpty() ? 0 : rounds.size();
            // Sem a 1ª rodada, quem entrou atrasado passa a ser um inscrito comum.
            if (rounds.isEmpty()) { p.joined = 1; p.dropped = 0; }
        }
    }

    /** Lança (ou corrige) o placar de uma mesa; null apaga, só na rodada atual. */
    void result(int round, int table, Score score) {
        if (finished) throw new IllegalArgumentException("O torneio já terminou. Reabra para corrigir resultados.");
        if (round < 1 || round > rounds.size()) throw new IllegalArgumentException("Essa rodada não existe.");
        Table t = rounds.get(round - 1).tables().stream().filter(x -> x.number == table).findFirst()
            .orElseThrow(() -> new IllegalArgumentException("Essa mesa não existe."));
        if (t.bye()) throw new IllegalArgumentException("O bye é uma vitória automática.");
        if (score == null) {
            if (round != rounds.size()) throw new IllegalArgumentException("Só dá para apagar resultados da rodada atual.");
            t.result = null;
            return;
        }
        if (score.a() < 0 || score.b() < 0 || score.draws() < 0 || score.a() + score.b() + score.draws() > MAX_GAMES)
            throw new IllegalArgumentException("Placar inválido.");
        t.result = score;
    }

    void finish() {
        Round last = current();
        if (last == null) throw new IllegalArgumentException("O torneio ainda não começou.");
        if (!last.complete()) throw new IllegalArgumentException("Falta lançar resultados da rodada " + last.number() + ".");
        finished = true;
        clock.reset();
    }

    void reopen() { finished = false; }

    /** O relógio, só com uma rodada em andamento. */
    RoundClock liveClock() {
        if (!"andamento".equals(status())) throw new IllegalArgumentException("O relógio só corre com uma rodada em andamento.");
        return clock;
    }

    // ---------- Classificação ----------

    private static final class Tally {
        int points, played, gamePoints, games, wins, losses, draws;
        final List<Integer> opponents = new ArrayList<>();
        void add(Score s, int opponent) {
            int mp = s.matchPoints();
            points += mp; played++;
            if (mp == 3) wins++; else if (mp == 1) draws++; else losses++;
            gamePoints += 3 * s.a() + s.draws(); games += s.a() + s.b() + s.draws();
            if (opponent != 0) opponents.add(opponent);
        }
        double mwp() { return played == 0 ? 1 / 3.0 : Math.max(1 / 3.0, points / (3.0 * played)); }
        double gwp() { return games == 0 ? 1 / 3.0 : Math.max(1 / 3.0, gamePoints / (3.0 * games)); }
    }

    private Map<Integer, Tally> tallies() {
        Map<Integer, Tally> all = new HashMap<>();
        for (Player p : players) {
            Tally t = new Tally();
            for (int r = 1; r < p.joined && r <= rounds.size(); r++) t.add(new Score(0, 2, 0), 0);
            all.put(p.id, t);
        }
        for (Round r : rounds) for (Table t : r.tables()) {
            if (t.result == null) continue;
            all.get(t.a).add(t.result, t.b);
            if (!t.bye()) all.get(t.b).add(t.result.swap(), t.a);
        }
        return all;
    }

    /** A classificação de agora, com os resultados já lançados. */
    List<Standing> standings() {
        Map<Integer, Tally> all = tallies();
        List<Standing> out = new ArrayList<>();
        for (Player p : players) {
            Tally t = all.get(p.id);
            double omw = 0, ogw = 0;
            for (int o : t.opponents) { omw += all.get(o).mwp(); ogw += all.get(o).gwp(); }
            int n = t.opponents.size();
            out.add(new Standing(p, t.points, t.wins, t.losses, t.draws, n == 0 ? 0 : omw / n, t.played == 0 ? 0 : t.gwp(), n == 0 ? 0 : ogw / n, n > 0));
        }
        out.sort(ORDER);
        return out;
    }

    private static final Comparator<Standing> ORDER = Comparator.comparingInt(Standing::points).reversed()
        .thenComparing(Comparator.comparingDouble(Standing::omw).reversed())
        .thenComparing(Comparator.comparingDouble(Standing::gw).reversed())
        .thenComparing(Comparator.comparingDouble(Standing::ogw).reversed())
        .thenComparing(s -> s.player().name.toLowerCase(Locale.ROOT));

    /** Mesma posição para quem empata em pontos e em todos os desempates. */
    static boolean tied(Standing a, Standing b) {
        return a.points() == b.points() && same(a.omw(), b.omw()) && same(a.gw(), b.gw()) && same(a.ogw(), b.ogw());
    }
    private static boolean same(double a, double b) { return Math.abs(a - b) < 1e-9; }

    // ---------- Sorteio ----------

    private boolean playedAny(int id) {
        for (Round r : rounds) for (Table t : r.tables()) if (t.a == id || t.b == id) return true;
        return false;
    }

    private Set<Long> pastPairs() {
        Set<Long> pairs = new HashSet<>();
        for (Round r : rounds) for (Table t : r.tables()) if (!t.bye()) pairs.add(key(t.a, t.b));
        return pairs;
    }
    private static long key(int a, int b) { return ((long) Math.min(a, b) << 32) | Math.max(a, b); }

    private boolean hadBye(int id) {
        for (Round r : rounds) for (Table t : r.tables()) if (t.bye() && t.a == id) return true;
        return false;
    }

    private static List<Table> firstRound(List<Player> active, Random random) {
        List<Player> order = new ArrayList<>(active);
        Collections.shuffle(order, random);
        List<Table> tables = new ArrayList<>();
        for (int i = 0; i + 1 < order.size(); i += 2) tables.add(new Table(tables.size() + 1, order.get(i).id, order.get(i + 1).id, null));
        if (order.size() % 2 == 1) tables.add(new Table(0, order.get(order.size() - 1).id, 0, Score.BYE));
        return tables;
    }

    private List<Table> swissRound(List<Player> active, Random random) {
        Map<Integer, Tally> all = tallies();
        List<Player> order = new ArrayList<>(active);
        Collections.shuffle(order, random);
        order.sort(Comparator.comparingInt((Player p) -> all.get(p.id).points).reversed());
        Player bye = null;
        if (order.size() % 2 == 1) {
            for (int i = order.size() - 1; i >= 0 && bye == null; i--) if (!hadBye(order.get(i).id)) bye = order.get(i);
            if (bye == null) bye = order.get(order.size() - 1);
            order.remove(bye);
        }
        List<Integer> ids = order.stream().map(p -> p.id).toList();
        Set<Long> past = pastPairs();
        int[] steps = {0};
        List<int[]> pairs = new ArrayList<>();
        if (!pair(new ArrayList<>(ids), past, pairs, steps)) {
            // Sem saída sem revanche (poucos jogadores para tantas rodadas): os vizinhos da classificação se enfrentam.
            pairs.clear();
            for (int i = 0; i + 1 < ids.size(); i += 2) pairs.add(new int[]{ids.get(i), ids.get(i + 1)});
        }
        List<Table> tables = new ArrayList<>();
        for (int[] p : pairs) tables.add(new Table(tables.size() + 1, p[0], p[1], null));
        if (bye != null) tables.add(new Table(0, bye.id, 0, Score.BYE));
        return tables;
    }

    /** O primeiro da lista contra o mais próximo dele com quem ainda não jogou, voltando atrás quando o resto não fecha. */
    private static boolean pair(List<Integer> left, Set<Long> past, List<int[]> out, int[] steps) {
        if (left.isEmpty()) return true;
        if (++steps[0] > PAIRING_STEPS) return false;
        int first = left.get(0);
        for (int j = 1; j < left.size(); j++) {
            int other = left.get(j);
            if (past.contains(key(first, other))) continue;
            List<Integer> rest = new ArrayList<>(left);
            rest.remove(j); rest.remove(0);
            out.add(new int[]{first, other});
            if (pair(rest, past, out, steps)) return true;
            out.remove(out.size() - 1);
            if (steps[0] > PAIRING_STEPS) return false;
        }
        return false;
    }

    // ---------- JSON ----------

    /** O que fica no arquivo. */
    JsonObject toJson() {
        JsonObject o = new JsonObject();
        o.addProperty("version", 1);
        o.addProperty("id", id);
        o.addProperty("nome", title);
        if (format != null) o.addProperty("formato", format);
        o.addProperty("organizador", organizer);
        if (organizerName != null) o.addProperty("organizadorNome", organizerName);
        o.addProperty("criadoEm", created);
        o.addProperty("rodadasPlanejadas", plannedRounds);
        o.addProperty("encerrado", finished);
        o.addProperty("proximoJogador", nextPlayer);
        o.add("relogio", clock.toJson());
        o.add("jogadores", playersJson());
        o.add("rodadas", roundsJson());
        return o;
    }

    static Tournament fromJson(JsonObject o) {
        Tournament t = new Tournament(o.get("id").getAsString(), o.get("nome").getAsString(), text(o, "formato"),
            o.get("organizador").getAsString(), text(o, "organizadorNome"), o.get("criadoEm").getAsLong());
        t.plannedRounds = o.get("rodadasPlanejadas").getAsInt();
        t.finished = o.get("encerrado").getAsBoolean();
        t.nextPlayer = o.get("proximoJogador").getAsInt();
        t.clock = RoundClock.fromJson(o.has("relogio") ? o.getAsJsonObject("relogio") : null);
        for (JsonElement e : o.getAsJsonArray("jogadores")) {
            JsonObject p = e.getAsJsonObject();
            Player player = new Player(p.get("id").getAsInt(), p.get("nome").getAsString());
            player.joined = p.has("entrou") ? p.get("entrou").getAsInt() : 1;
            player.dropped = p.has("saiu") ? p.get("saiu").getAsInt() : 0;
            t.players.add(player);
        }
        for (JsonElement e : o.getAsJsonArray("rodadas")) {
            JsonObject r = e.getAsJsonObject();
            List<Table> tables = new ArrayList<>();
            for (JsonElement m : r.getAsJsonArray("mesas")) {
                JsonObject table = m.getAsJsonObject();
                JsonElement res = table.get("resultado");
                Score score = res == null || res.isJsonNull() ? null : new Score(res.getAsJsonObject().get("a").getAsInt(), res.getAsJsonObject().get("b").getAsInt(), res.getAsJsonObject().get("empates").getAsInt());
                tables.add(new Table(table.get("mesa").getAsInt(), table.get("a").getAsInt(), table.get("b").getAsInt(), score));
            }
            t.rounds.add(new Round(r.get("numero").getAsInt(), tables, r.has("extra") && r.get("extra").getAsBoolean()));
        }
        return t;
    }

    /** O que a página mostra, para qualquer um com o link; {@code mine} diz se quem pede é o organizador. */
    JsonObject publicJson(boolean mine, long now) {
        JsonObject o = new JsonObject();
        o.addProperty("id", id);
        o.addProperty("nome", title);
        if (format != null) o.addProperty("formato", format);
        if (organizerName != null) o.addProperty("organizador", organizerName);
        o.addProperty("criadoEm", java.time.Instant.ofEpochMilli(created).toString());
        o.addProperty("estado", status());
        o.addProperty("rodadas", rounds());
        o.addProperty("rodadasEscolhidas", plannedRounds > 0);
        o.addProperty("rodadasSugeridas", suggestedRounds(players.size()));
        o.addProperty("inscricoesAbertas", canRegister());
        o.addProperty("organizadorSouEu", mine);
        o.addProperty("minutosPorRodada", clock.minutes());
        if ("andamento".equals(status())) o.add("relogio", clock.publicJson(now));
        o.add("jogadores", playersJson());
        o.add("rodadasJogadas", roundsJson());
        JsonArray table = new JsonArray();
        List<Standing> list = standings();
        for (int i = 0, position = 1; i < list.size(); i++) {
            Standing s = list.get(i);
            if (i > 0 && !tied(list.get(i - 1), s)) position = i + 1;
            JsonObject row = new JsonObject();
            row.addProperty("posicao", position);
            row.addProperty("id", s.player().id);
            row.addProperty("pontos", s.points());
            row.addProperty("vitorias", s.wins());
            row.addProperty("derrotas", s.losses());
            row.addProperty("empates", s.draws());
            if (s.hasOpponents()) { row.addProperty("omw", s.omw()); row.addProperty("ogw", s.ogw()); }
            if (s.wins() + s.losses() + s.draws() > 0) row.addProperty("gw", s.gw());
            table.add(row);
        }
        o.add("classificacao", table);
        return o;
    }

    /** A linha de Meus torneios. */
    JsonObject summaryJson() {
        JsonObject o = new JsonObject();
        o.addProperty("id", id);
        o.addProperty("nome", title);
        if (format != null) o.addProperty("formato", format);
        o.addProperty("criadoEm", java.time.Instant.ofEpochMilli(created).toString());
        o.addProperty("estado", status());
        o.addProperty("jogadores", players.size());
        o.addProperty("rodada", rounds.size());
        o.addProperty("rodadas", rounds());
        return o;
    }

    private JsonArray playersJson() {
        JsonArray a = new JsonArray();
        for (Player p : players) {
            JsonObject o = new JsonObject();
            o.addProperty("id", p.id);
            o.addProperty("nome", p.name);
            if (p.joined > 1) o.addProperty("entrou", p.joined);
            if (p.dropped > 0) o.addProperty("saiu", p.dropped);
            a.add(o);
        }
        return a;
    }

    private JsonArray roundsJson() {
        JsonArray a = new JsonArray();
        for (Round r : rounds) {
            JsonObject o = new JsonObject();
            o.addProperty("numero", r.number());
            if (r.extra()) o.addProperty("extra", true);
            JsonArray tables = new JsonArray();
            for (Table t : r.tables()) {
                JsonObject m = new JsonObject();
                m.addProperty("mesa", t.number);
                m.addProperty("a", t.a);
                m.addProperty("b", t.b);
                if (t.result == null) m.add("resultado", JsonNull.INSTANCE);
                else {
                    JsonObject s = new JsonObject();
                    s.addProperty("a", t.result.a()); s.addProperty("b", t.result.b()); s.addProperty("empates", t.result.draws());
                    m.add("resultado", s);
                }
                tables.add(m);
            }
            o.add("mesas", tables);
            a.add(o);
        }
        return a;
    }

    // ---------- Auxiliares ----------

    private static String cleanTitle(String title) {
        String t = clean(title, TITLE_MAX);
        if (t == null) throw new IllegalArgumentException("Dê um nome ao torneio.");
        return t;
    }

    static String clean(String text, int max) {
        if (text == null) return null;
        String t = text.strip().replaceAll("\\p{Cntrl}", "").replaceAll("\\s+", " ");
        if (t.isEmpty()) return null;
        return t.codePointCount(0, t.length()) <= max ? t : t.substring(0, t.offsetByCodePoints(0, max)).strip();
    }

    private static String text(JsonObject o, String key) {
        JsonElement e = o.get(key);
        return e == null || e.isJsonNull() ? null : e.getAsString();
    }
}
