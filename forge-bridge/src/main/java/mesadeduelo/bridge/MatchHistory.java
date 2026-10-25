package mesadeduelo.bridge;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * Histórico das partidas concluídas: uma linha JSON por partida em {@code <dir>/AAAA-MM.jsonl} (mês do fim, em UTC).
 * Só o resumo final (formato, jogadores, decks, quem venceu cada jogo, turnos, duração), algumas centenas de bytes
 * por partida, então nada é apagado. Sem banco de dados: os arquivos se importam direto quando houver um.
 * Só a área de admin lê; o formato da linha está em {@link Session#historyJson}.
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
            System.err.println("Histórico: não gravei a partida: " + e);
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
}
