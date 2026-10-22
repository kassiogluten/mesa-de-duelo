package mesadeduelo.bridge;

import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;
import java.util.zip.GZIPOutputStream;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * Relatos em arquivos: {@code <dir>/relatos/AAAA-MM/<código>.json.gz} e um índice em linhas JSON
 * ({@code <dir>/relatos/indice.jsonl}). Sem banco de dados: o volume esperado é pequeno e os arquivos
 * se copiam e se abrem direto na página de repetição.
 *
 * Retenção: some o que passou de {@link #maxAge} e, depois, os mais antigos até o total caber em {@link #maxBytes}.
 */
final class FeedbackStore {
    static final String CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("yyyy-MM").withZone(ZoneOffset.UTC);

    /** Uma linha do índice. {@code path} é relativo a {@code relatos/}. */
    record Entry(String code, Instant receivedAt, String kind, String version, String format, long bytes,
                 boolean match, boolean bridge, String path, String summary) {
        JsonObject json() {
            JsonObject o = new JsonObject();
            o.addProperty("code", code); o.addProperty("receivedAt", receivedAt.toString());
            o.addProperty("kind", kind); o.addProperty("version", version); o.addProperty("format", format);
            o.addProperty("bytes", bytes); o.addProperty("match", match); o.addProperty("bridge", bridge);
            o.addProperty("path", path);
            if (summary != null) o.addProperty("summary", summary);
            return o;
        }

        static Entry parse(String line) {
            JsonObject o = JsonParser.parseString(line).getAsJsonObject();
            return new Entry(o.get("code").getAsString(), Instant.parse(o.get("receivedAt").getAsString()),
                text(o, "kind"), text(o, "version"), text(o, "format"), o.get("bytes").getAsLong(),
                o.has("match") && o.get("match").getAsBoolean(), o.has("bridge") && o.get("bridge").getAsBoolean(),
                o.get("path").getAsString(), text(o, "summary"));
        }

        static String text(JsonObject o, String key) {
            return o.has(key) && o.get(key).isJsonPrimitive() ? o.get(key).getAsString() : null;
        }
    }

    /** Dados lidos do relato para o índice. summary é o começo da descrição, para a lista da área de admin. */
    record Meta(String kind, String version, String format, boolean recording, String summary) {
        Meta(String kind, String version, String format, boolean recording) { this(kind, version, format, recording, null); }
    }

    /** Tratamento de um relato na área de admin: novo, visto, issue, resolvido ou descartado, com nota e número da issue. */
    record Status(String status, String note, String issue, Instant updatedAt) {
        static final Set<String> VALUES = Set.of("novo", "visto", "issue", "resolvido", "descartado");
        JsonObject json() {
            JsonObject o = new JsonObject();
            o.addProperty("status", status);
            if (note != null && !note.isEmpty()) o.addProperty("note", note);
            if (issue != null && !issue.isEmpty()) o.addProperty("issue", issue);
            o.addProperty("updatedAt", updatedAt.toString());
            return o;
        }
    }

    /** Sem espaço no volume ou no limite do armazenamento mesmo depois de apagar os antigos. */
    static final class Full extends IOException {
        Full(String message) { super(message); }
    }

    interface Source { InputStream open() throws IOException; }

    private final Path dir, index, statusFile;
    private final java.util.Map<String, Status> statuses = new java.util.HashMap<>();
    private final long maxBytes, minFree;
    private final Duration maxAge;
    private final List<Entry> entries = new ArrayList<>();
    private final Set<String> codes = new HashSet<>();
    private final SecureRandom random = new SecureRandom();
    private long total;

    FeedbackStore(Path base, long maxBytes, Duration maxAge, long minFree) throws IOException {
        this.dir = base.resolve("relatos");
        this.index = dir.resolve("indice.jsonl");
        this.statusFile = dir.resolve("estado.json");
        this.maxBytes = maxBytes; this.maxAge = maxAge; this.minFree = minFree;
        Files.createDirectories(dir);
        load();
        loadStatuses();
    }

    /** Pasta e limites pelas propriedades do sistema: mesa.feedback.dir, .maxBytes, .maxAgeDays, .minFreeBytes. */
    static FeedbackStore fromSystem() throws IOException {
        Path base = Path.of(System.getProperty("mesa.feedback.dir", System.getProperty("user.home") + "/.forge/mesa-relatos"));
        return new FeedbackStore(base, Long.getLong("mesa.feedback.maxBytes", 1L << 30),
            Duration.ofDays(Long.getLong("mesa.feedback.maxAgeDays", 90)), Long.getLong("mesa.feedback.minFreeBytes", 50L << 20));
    }

    Path dir() { return dir; }
    synchronized long totalBytes() { return total; }
    synchronized int files() { return entries.size(); }
    synchronized List<Entry> entries() { return List.copyOf(entries); }

    /** Lê o índice e acrescenta arquivos que ficaram fora dele (com a data do arquivo); esquece linhas sem arquivo. */
    private synchronized void load() throws IOException {
        entries.clear(); codes.clear(); total = 0;
        Set<String> paths = new HashSet<>();
        boolean dirty = false;
        if (Files.exists(index)) for (String line : Files.readAllLines(index, StandardCharsets.UTF_8)) {
            if (line.isBlank()) continue;
            try {
                Entry e = Entry.parse(line);
                if (Files.isRegularFile(dir.resolve(e.path())) && paths.add(e.path())) add(e);
                else dirty = true;
            } catch (RuntimeException e) { dirty = true; }
        }
        try (Stream<Path> files = Files.walk(dir, 2)) {
            for (Path f : (Iterable<Path>) files::iterator) {
                String name = f.getFileName().toString();
                if (!Files.isRegularFile(f) || !name.endsWith(".json.gz")) continue;
                String rel = dir.relativize(f).toString().replace('\\', '/');
                if (paths.contains(rel)) continue;
                add(new Entry(name.substring(0, name.length() - ".json.gz".length()), Files.getLastModifiedTime(f).toInstant(),
                    null, null, null, Files.size(f), false, false, rel, null));
                dirty = true;
            }
        }
        entries.sort(Comparator.comparing(Entry::receivedAt));
        if (dirty) rewriteIndex();
    }

    // ---------- Área de admin ----------

    synchronized Entry entry(String code) {
        for (Entry e : entries) if (e.code().equals(code)) return e;
        return null;
    }

    /** O arquivo do relato, ou null se o código não existe. */
    synchronized Path file(String code) {
        Entry e = entry(code);
        return e == null ? null : dir.resolve(e.path());
    }

    synchronized Status status(String code) { return statuses.get(code); }

    synchronized Status setStatus(String code, String status, String note, String issue) throws IOException {
        if (entry(code) == null) return null;
        if (!Status.VALUES.contains(status)) throw new IllegalArgumentException("Estado inválido.");
        Status s = new Status(status, note, issue, Instant.now().truncatedTo(ChronoUnit.SECONDS));
        statuses.put(code, s);
        writeStatuses();
        return s;
    }

    /** Apaga o relato, a linha do índice e o estado dele. */
    synchronized boolean delete(String code) throws IOException {
        Entry e = entry(code);
        if (e == null) return false;
        Files.deleteIfExists(dir.resolve(e.path()));
        entries.remove(e); codes.remove(code); total -= e.bytes();
        rewriteIndex();
        if (statuses.remove(code) != null) writeStatuses();
        return true;
    }

    private void loadStatuses() throws IOException {
        if (!Files.exists(statusFile)) return;
        try {
            JsonObject all = JsonParser.parseString(Files.readString(statusFile, StandardCharsets.UTF_8)).getAsJsonObject();
            for (var item : all.entrySet()) {
                JsonObject o = item.getValue().getAsJsonObject();
                if (!codes.contains(item.getKey())) continue;
                statuses.put(item.getKey(), new Status(o.get("status").getAsString(), Entry.text(o, "note"), Entry.text(o, "issue"),
                    o.has("updatedAt") ? Instant.parse(o.get("updatedAt").getAsString()) : Instant.EPOCH));
            }
        } catch (RuntimeException e) {
            System.err.println("Relatos: estado.json ilegível, começando sem estados: " + e);
        }
    }

    private void writeStatuses() throws IOException {
        JsonObject all = new JsonObject();
        for (var item : statuses.entrySet()) all.add(item.getKey(), item.getValue().json());
        Path tmp = dir.resolve("estado.json.tmp");
        Files.writeString(tmp, all.toString(), StandardCharsets.UTF_8);
        Files.move(tmp, statusFile, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }

    private void add(Entry e) { entries.add(e); codes.add(e.code()); total += e.bytes(); }

    /** "R-" e 4 caracteres sem letras confusas; passa a 5 se os de 4 estiverem difíceis de achar. */
    synchronized String newCode() {
        for (int length = 4; ; length++) {
            for (int attempt = 0; attempt < 64; attempt++) {
                StringBuilder sb = new StringBuilder("R-");
                for (int i = 0; i < length; i++) sb.append(CODE_CHARS.charAt(random.nextInt(CODE_CHARS.length())));
                if (!codes.contains(sb.toString())) return sb.toString();
            }
        }
    }

    /**
     * Grava {@code {"code","receivedAt","bridge","report"}} comprimido, com o JSON do aparelho copiado byte a byte
     * (sem ler de novo), e acrescenta a linha no índice.
     */
    synchronized Entry store(Meta meta, JsonObject bridge, Source report) throws IOException {
        if (Files.getFileStore(dir).getUsableSpace() < minFree) throw new Full("pouco espaço no volume");
        String code = newCode();
        Instant at = Instant.now().truncatedTo(ChronoUnit.MILLIS);
        Path month = dir.resolve(MONTH.format(at));
        Files.createDirectories(month);
        Path tmp = month.resolve(code + ".json.gz.tmp"), file = month.resolve(code + ".json.gz");
        try {
            try (OutputStream out = new GZIPOutputStream(new BufferedOutputStream(Files.newOutputStream(tmp)), 1 << 16);
                 InputStream in = report.open()) {
                JsonObject head = new JsonObject();
                head.addProperty("code", code); head.addProperty("receivedAt", at.toString());
                String prefix = head.toString();
                out.write((prefix.substring(0, prefix.length() - 1) + ",\"bridge\":" + (bridge == null ? "null" : bridge.toString())
                    + ",\"report\":").getBytes(StandardCharsets.UTF_8));
                in.transferTo(out);
                out.write('}');
            }
            long size = Files.size(tmp);
            if (size > maxBytes) throw new Full("relato maior que o limite do armazenamento");
            makeRoom(size, at);
            if (total + size > maxBytes) throw new Full("limite do armazenamento");
            Files.move(tmp, file, StandardCopyOption.ATOMIC_MOVE);
        } finally {
            Files.deleteIfExists(tmp);
        }
        Entry e = new Entry(code, at, meta.kind(), meta.version(), meta.format(), Files.size(file), meta.recording(), bridge != null,
            dir.relativize(file).toString().replace('\\', '/'), meta.summary());
        add(e);
        Files.writeString(index, e.json() + "\n", StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        return e;
    }

    /** Retenção: apaga os relatos velhos demais e, depois, os mais antigos até caber no limite. Devolve quantos apagou. */
    synchronized int cleanup(Instant now) throws IOException {
        return evict(now, 0);
    }

    private void makeRoom(long incoming, Instant now) throws IOException {
        if (total + incoming > maxBytes) evict(now, incoming);
    }

    private int evict(Instant now, long incoming) throws IOException {
        Instant oldest = now.minus(maxAge);
        List<Entry> removed = new ArrayList<>();
        for (Entry e : entries) {
            boolean old = e.receivedAt().isBefore(oldest);
            if (!old && total + incoming <= maxBytes) continue;
            Files.deleteIfExists(dir.resolve(e.path()));
            total -= e.bytes();
            removed.add(e);
        }
        if (removed.isEmpty()) return 0;
        entries.removeAll(removed);
        for (Entry e : removed) codes.remove(e.code());
        rewriteIndex();
        if (statuses.keySet().removeIf(code -> !codes.contains(code))) writeStatuses();
        for (Entry e : removed) {
            Path parent = dir.resolve(e.path()).getParent();
            try (Stream<Path> left = Files.list(parent)) { if (left.findAny().isEmpty()) Files.deleteIfExists(parent); }
            catch (IOException ignored) { /* a pasta do mês fica para a próxima limpeza */ }
        }
        return removed.size();
    }

    private void rewriteIndex() throws IOException {
        Path tmp = dir.resolve("indice.jsonl.tmp");
        StringBuilder sb = new StringBuilder();
        for (Entry e : entries) sb.append(e.json()).append('\n');
        Files.writeString(tmp, sb, StandardCharsets.UTF_8);
        Files.move(tmp, index, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }
}
