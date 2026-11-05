package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import forge.card.MagicColor;
import forge.deck.Deck;
import forge.deck.DeckSection;
import forge.game.player.RegisteredPlayer;
import forge.gamemodes.match.HostedMatch;

/**
 * Relógios, métricas e a linha do histórico de uma {@link Session}: quando a partida e cada jogo começaram, quanto
 * cada jogo durou, e o resumo gravado no {@link MatchHistory} quando a série acaba (concluída, concedida ou queda).
 * Chamado com o monitor da Session (start, ended, abandon, concede); os campos ficam voláteis para quem só lê.
 */
final class MatchRecorder {
    private final Session session;
    /** Onde vai o resumo de cada partida concluída (veja {@link MatchHistory}); a repetição de relatos não grava. */
    volatile Consumer<JsonObject> history = ignored -> { };
    /** A linha do histórico da partida atual já foi gravada. */
    private volatile boolean recorded;
    /** Início da partida em andamento para as métricas; 0 quando já foi contada como encerrada. */
    private volatile long startedAt;
    /** Quando começou a partida atual (para a área de admin e o histórico). */
    volatile long playingSince;
    /** Início do jogo atual (cada jogo de uma melhor de três conta do zero) e quanto ele durou, -1 enquanto não termina. */
    private volatile long gameSince;
    private volatile long gameMs = -1;
    /** Duração de cada jogo já terminado da partida atual, na ordem, para o histórico. */
    private final List<Long> gameDurations = new ArrayList<>();

    MatchRecorder(Session session) { this.session = session; }

    /** Partida nova: nada gravado ainda e nenhum jogo terminado. */
    void reset() {
        recorded = false;
        gameDurations.clear();
    }

    /** A partida acabou de começar com {@code players} jogadores. */
    void started(int players) {
        startedAt = playingSince = gameSince = System.currentTimeMillis(); gameMs = -1;
        Metrics.matchStarted(session.config.format(), session.isRoom(), players);
    }

    /** O próximo jogo da série começa (depois do sideboard). */
    void nextGame() { gameSince = System.currentTimeMillis(); gameMs = -1; }

    /** A partida saiu antes de acabar (fechada, saída ou trocada por outra): conta como abandonada nas métricas. */
    void abandoned(boolean finished) {
        if (startedAt > 0 && !finished) Metrics.matchEnded(session.config.format(), session.isRoom(), "abandonada", startedAt);
        startedAt = 0;
    }

    /** Fim de um jogo: guarda a duração e, se a série acabou (ou foi abandonada), grava a linha do histórico. */
    void gameEnded(HostedMatch ended) {
        if (gameSince > 0) gameMs = System.currentTimeMillis() - gameSince;
        Metrics.gameFinished(session.config.format(), session.isRoom());
        gameDurations.add(gameMs);
        if (ended.getMatch() != null && ended.getMatch().isMatchOver()) record(ended.getMatch(), null, null, null);
        else if (session.abandoned) unfinished(session.conceder);
        if (startedAt > 0 && ended.getMatch() != null && ended.getMatch().isMatchOver()) { Metrics.matchEnded(session.config.format(), session.isRoom(), "concluida", startedAt); startedAt = 0; }
    }

    /** No estado da partida: quanto o jogo durou ({@code gameMs}) ou, com ele correndo, quanto já passou ({@code elapsedMs}). */
    void gameClock(JsonObject o, boolean playing) {
        if (gameMs >= 0) o.addProperty("gameMs", gameMs);
        // Enquanto o jogo corre, quanto tempo já passou (não a hora de início, para o relógio do navegador não importar).
        else if (gameSince > 0 && playing) o.addProperty("elapsedMs", System.currentTimeMillis() - gameSince);
    }

    /** Grava a série que acabou antes da hora, com o jogo em andamento: {@code quitter} concede, sem ele é queda. */
    void unfinished(Seat quitter) {
        HostedMatch m = session.match;
        if (recorded || m == null || m.getMatch() == null || m.getMatch().isMatchOver()) return;
        record(m.getMatch(), quitter == null ? "queda" : "concedida", quitter, m.getGame());
    }

    /** Uma linha por partida; a que não chegou ao primeiro turno (mulligan, sala recém-começada) não é gravada. */
    private void record(forge.game.Match fm, String end, Seat quitter, forge.game.Game current) {
        if (recorded) return;
        recorded = true;
        try {
            JsonObject line = historyJson(fm, end, quitter, current);
            boolean played = false;
            for (JsonElement g : line.getAsJsonArray("games")) played |= g.getAsJsonObject().get("turns").getAsInt() > 0;
            if (played && history != null) history.accept(line);
        } catch (RuntimeException e) { Log.of(session).warn("Histórico: resumo da partida falhou: " + e); }
    }

    /**
     * Resumo final de uma partida concluída, uma linha do {@link MatchHistory}. Os índices de {@code winner} e dos
     * arrays de cada jogo apontam para {@code players}, na ordem do Forge (humanos antes da IA). O apelido só entra
     * nas salas em rede: contra a IA, o humano vai com o nome que usa ({@link Seat#nick}), quando tem um. {@code account} e {@code deckId} só vêm de quem
     * jogou com a conta conectada (veja {@link AccountMatches}); apagar a conta os tira ({@link MatchHistory#forget}).
     *
     * {id, startedAt, endedAt, ms, format, length, mode:"ia"|"rede", public?, end, winner: índice|null,
     *  players:[{name?, ai, account?, deckId?, deck, colors, commander?, wins}],
     *  games:[{winner: índice|null, turns, ms?, end, result:["win"|"draw"|"playing"|motivo da derrota do Forge], mull:[n]}]}
     */
    JsonObject historyJson(forge.game.Match fm) { return historyJson(fm, null, null, null); }

    /**
     * {@code end}: "concluida" (jogada até o fim), "concedida" (decidida por desistência ou saída) ou "queda" (ninguém
     * voltou; a série fica sem vencedor). Null deduz do último jogo: concedida quando todos os que perderam desistiram.
     * {@code quitter} é quem saiu antes de a série acabar: a série vai para o outro (só com dois jogadores). O jogo
     * {@code current} ainda em andamento entra no fim, com o motivo "Conceded" de quem saiu ou "Interrupted" na queda.
     */
    JsonObject historyJson(forge.game.Match fm, String end, Seat quitter, forge.game.Game current) {
        long now = System.currentTimeMillis();
        JsonObject o = new JsonObject();
        o.addProperty("id", session.matchId);
        o.addProperty("startedAt", java.time.Instant.ofEpochMilli(playingSince).truncatedTo(java.time.temporal.ChronoUnit.SECONDS).toString());
        o.addProperty("endedAt", java.time.Instant.ofEpochMilli(now).truncatedTo(java.time.temporal.ChronoUnit.SECONDS).toString());
        o.addProperty("ms", now - playingSince);
        o.addProperty("format", session.config.format()); o.addProperty("length", session.config.matchLength());
        o.addProperty("mode", Metrics.mode(session.isRoom()));
        if (session.isRoom()) o.addProperty("public", session.isPublic());
        List<RegisteredPlayer> order = fm.getPlayers();
        int quit = quitter == null ? -1 : order.indexOf(quitter.registered);
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
        // O jogo interrompido: quem saiu concede (com dois jogadores, o outro vence); na queda, ninguém vence.
        int unfinishedWinner = -1;
        if (current != null && !current.isGameOver() && current.getMatch() == fm) {
            unfinishedWinner = quit >= 0 && order.size() == 2 ? 1 - quit : -1;
            JsonObject g = new JsonObject();
            if (unfinishedWinner >= 0) g.addProperty("winner", unfinishedWinner); else g.add("winner", com.google.gson.JsonNull.INSTANCE);
            g.addProperty("turns", current.getPhaseHandler().getTurn());
            if (gameSince > 0) g.addProperty("ms", now - gameSince);
            g.addProperty("end", quit >= 0 ? "Conceded" : "Interrupted");
            JsonArray result = new JsonArray(), mull = new JsonArray();
            for (int i = 0; i < order.size(); i++) {
                forge.game.player.Player p = null;
                for (var each : current.getRegisteredPlayers()) if (each.getRegisteredPlayer() == order.get(i)) p = each;
                var po = p == null ? null : p.getOutcome();
                result.add(i == quit ? "Conceded" : i == unfinishedWinner ? "win"
                    : p != null && p.hasLost() && po != null && po.lossState != null ? po.lossState.name() : "playing");
                mull.add(p == null ? 0 : p.getStats().getMulliganCount());
            }
            g.add("result", result); g.add("mull", mull);
            games.add(g);
        }
        if (end == null) {
            // Decidida por desistência quando todos os que perderam o último jogo desistiram.
            boolean conceded = false, other = false;
            if (!games.isEmpty()) for (JsonElement r : games.get(games.size() - 1).getAsJsonObject().getAsJsonArray("result")) {
                String why = r.getAsString();
                if ("Conceded".equals(why)) conceded = true; else if (!"win".equals(why) && !"draw".equals(why)) other = true;
            }
            end = conceded && !other ? "concedida" : "concluida";
        }
        o.addProperty("end", end);
        JsonArray players = new JsonArray();
        int best = -1, bestWins = -1;
        boolean tie = false;
        for (int i = 0; i < order.size(); i++) {
            RegisteredPlayer rp = order.get(i);
            Seat seat = null;
            for (Seat each : session.seats) if (each.registered == rp) seat = each;
            JsonObject p = new JsonObject();
            String name = seat == null ? null : session.isRoom() ? seat.name : seat.nick;
            if (name != null) p.addProperty("name", name);
            p.addProperty("ai", seat == null);
            if (seat != null && seat.account != null) {
                p.addProperty("account", seat.account);
                if (seat.deckId != null) p.addProperty("deckId", seat.deckId);
            }
            Deck deck = seat != null && seat.deck != null ? seat.deck : rp.getDeck();
            p.addProperty("deck", deck.getName());
            p.addProperty("colors", colors(deck));
            if (session.config.commandZone()) {
                List<String> commanders = new ArrayList<>();
                for (var e : deck.getOrCreate(DeckSection.Commander)) commanders.add(e.getKey().getDisplayName());
                if (!commanders.isEmpty()) p.addProperty("commander", String.join(" + ", commanders));
            }
            int wins = fm.getGamesWonBy(rp.getPlayer()) + (i == unfinishedWinner ? 1 : 0);
            p.addProperty("wins", wins);
            if (wins > bestWins) { best = i; bestWins = wins; tie = false; } else if (wins == bestWins) tie = true;
            players.add(p);
        }
        // Quem sai entrega a série a quem ficou; na queda, ela fica sem vencedor.
        int winner = "queda".equals(end) ? -1 : quit >= 0 && order.size() == 2 ? 1 - quit : bestWins > 0 && !tie ? best : -1;
        if (winner >= 0) o.addProperty("winner", winner); else o.add("winner", com.google.gson.JsonNull.INSTANCE);
        o.add("players", players);
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
}
