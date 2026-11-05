package mesadeduelo.bridge;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * Histórico das partidas concluídas: uma linha JSON por partida em {@code <dir>/AAAA-MM.jsonl} (mês do fim, em UTC).
 * Só o resumo final (formato, jogadores, decks, quem venceu cada jogo, turnos, duração), algumas centenas de bytes
 * por partida, então nada é apagado. Sem banco de dados: os arquivos se importam direto quando houver um.
 * A área de admin lê tudo; cada jogador lê só as partidas em que jogou com a conta ({@link #readFor}, para
 * {@link AccountMatches}). O formato da linha está em {@link Session#historyJson}.
 */
final class MatchHistory {
    private static final Pattern MONTH = Pattern.compile("\\d{4}-\\d{2}");
    private final Path dir;

    MatchHistory(Path dir) throws IOException {
        this.dir = dir;
        Files.createDirectories(dir);
    }

    Path dir() { return dir; }

    /** Acrescenta a partida no arquivo do mês de {@code endedAt}. Falhas só vão para o log: o jogo segue. */
    synchronized void record(JsonObject match) {
        try {
            String month = match.get("endedAt").getAsString().substring(0, 7);
            Files.writeString(dir.resolve(month + ".jsonl"), match + "\n", StandardCharsets.UTF_8,
                StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException | RuntimeException e) {
            Log.bridge().error("Histórico: não gravei a partida: " + e);
        }
    }

    /** Meses com partidas, do mais recente ao mais antigo. */
    synchronized List<String> months() throws IOException {
        List<String> months = new ArrayList<>();
        try (Stream<Path> files = Files.list(dir)) {
            for (Path f : (Iterable<Path>) files::iterator) {
                String name = f.getFileName().toString();
                if (name.endsWith(".jsonl") && MONTH.matcher(name.substring(0, name.length() - 6)).matches())
                    months.add(name.substring(0, name.length() - 6));
            }
        }
        months.sort(Comparator.reverseOrder());
        return months;
    }

    /** O arquivo do mês, ou null se o mês é inválido ou não tem partidas. */
    synchronized Path file(String month) {
        if (month == null || !MONTH.matcher(month).matches()) return null;
        Path f = dir.resolve(month + ".jsonl");
        return Files.isRegularFile(f) ? f : null;
    }

    /** As partidas do mês, mais recentes primeiro; linhas ilegíveis ficam de fora. */
    synchronized JsonArray read(String month) throws IOException {
        JsonArray all = new JsonArray();
        Path f = file(month);
        if (f == null) return all;
        List<String> lines = Files.readAllLines(f, StandardCharsets.UTF_8);
        for (int i = lines.size() - 1; i >= 0; i--) {
            if (lines.get(i).isBlank()) continue;
            try { all.add(JsonParser.parseString(lines.get(i)).getAsJsonObject()); }
            catch (RuntimeException ignored) { /* linha cortada por uma queda no meio da gravação */ }
        }
        return all;
    }

    /**
     * As partidas em que a conta jogou, mais recentes primeiro, de todos os meses. Só lê como JSON as linhas que citam
     * a conta: o resto do arquivo passa direto.
     */
    synchronized List<JsonObject> readFor(String account) throws IOException {
        List<JsonObject> mine = new ArrayList<>();
        String quoted = "\"" + account + "\"";
        for (String month : months()) {
            List<String> lines = Files.readAllLines(dir.resolve(month + ".jsonl"), StandardCharsets.UTF_8);
            for (int i = lines.size() - 1; i >= 0; i--) {
                if (!lines.get(i).contains(quoted)) continue;
                try {
                    JsonObject match = JsonParser.parseString(lines.get(i)).getAsJsonObject();
                    if (seatOf(match, account) >= 0) mine.add(match);
                } catch (RuntimeException ignored) { /* linha cortada */ }
            }
        }
        return mine;
    }

    /** O assento da conta na partida, ou -1. */
    static int seatOf(JsonObject match, String account) {
        JsonArray players = match.has("players") && match.get("players").isJsonArray() ? match.getAsJsonArray("players") : new JsonArray();
        for (int i = 0; i < players.size(); i++) {
            JsonElement p = players.get(i);
            if (p.isJsonObject() && p.getAsJsonObject().has("account") && account.equals(p.getAsJsonObject().get("account").getAsString())) return i;
        }
        return -1;
    }

    /**
     * A conta foi apagada: as partidas continuam no histórico (como as de antes das contas), mas sem a ligação com ela.
     * Reescreve só os meses que a citam, num temporário renomeado no fim.
     */
    synchronized void forget(String account) throws IOException {
        String quoted = "\"" + account + "\"";
        for (String month : months()) {
            Path f = dir.resolve(month + ".jsonl");
            List<String> lines = Files.readAllLines(f, StandardCharsets.UTF_8);
            boolean changed = false;
            for (int i = 0; i < lines.size(); i++) {
                if (!lines.get(i).contains(quoted)) continue;
                try {
                    JsonObject match = JsonParser.parseString(lines.get(i)).getAsJsonObject();
                    for (JsonElement p : match.getAsJsonArray("players")) {
                        JsonObject player = p.getAsJsonObject();
                        if (player.has("account") && account.equals(player.get("account").getAsString())) { player.remove("account"); player.remove("deckId"); }
                    }
                    lines.set(i, match.toString());
                    changed = true;
                } catch (RuntimeException ignored) { /* linha cortada: fica como está */ }
            }
            if (!changed) continue;
            Path tmp = Files.createTempFile(dir, ".gravando-", ".tmp");
            try {
                Files.writeString(tmp, String.join("\n", lines) + "\n", StandardCharsets.UTF_8);
                Files.move(tmp, f, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } finally {
                Files.deleteIfExists(tmp);
            }
        }
    }
}
