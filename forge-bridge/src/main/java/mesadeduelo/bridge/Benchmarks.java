package mesadeduelo.bridge;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.HexFormat;
import java.util.List;
import java.util.function.LongSupplier;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;

import io.netty.buffer.ByteBufUtil;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelInboundHandlerAdapter;
import io.netty.handler.codec.http.FullHttpRequest;
import io.netty.handler.codec.http.HttpMethod;
import io.netty.handler.codec.http.QueryStringDecoder;

/**
 * Guarda os resultados do teste de desempenho da mesa (a página /desempenho), que chegam em POST /api/desempenho.
 * Cada um traz nota, FPS, quadros travados, o degrau a que o regulador de efeitos chegou e um resumo do aparelho, num
 * arquivo {@code desempenho.json} ao lado do funil. Só os 1000 mais recentes ficam. O IP serve só, como resumo em memória, para limitar quem manda
 * resultados sem parar; não se guarda IP nem user-agent. A área de admin lê em GET /api/admin/desempenho e apaga um
 * em DELETE /api/admin/desempenho/{id}.
 *
 * Tudo o que chega é conferido e refeito ({@link #normalize}): campos desconhecidos saem, textos são cortados e
 * números fora da faixa recusam o resultado inteiro (400).
 */
final class Benchmarks {
    static final String PATH = "/api/desempenho";
    static final int MAX_BODY = 8 * 1024;
    static final int MAX_RESULTS = 1000;
    static final int MAX_SCENES = 20;
    static final int MAX_TEXT = 120;
    static final int MAX_MODEL = 60;
    static final List<String> MODES = List.of("duelo", "commander");
    /** Por IP: dá para repetir o teste algumas vezes seguidas, nada além disso. */
    static final int MAX_PER_WINDOW = 20;
    static final long WINDOW = 10 * 60_000L;

    private final Path file;
    private final LongSupplier clock;
    private final FeedbackRateLimit limit = new FeedbackRateLimit(MAX_PER_WINDOW, WINDOW);
    private final SecureRandom random = new SecureRandom();
    /** Do mais novo (primeiro) ao mais antigo. */
    private final ArrayDeque<JsonObject> results = new ArrayDeque<>();

    Benchmarks(Path file, LongSupplier clock) {
        this.file = file;
        this.clock = clock;
        load();
    }

    /** Ao lado do funil, dos relatos e do histórico de partidas. */
    static Benchmarks inDir(Path dir) { return new Benchmarks(dir.resolve("desempenho.json"), System::currentTimeMillis); }

    private synchronized void load() {
        if (!Files.isRegularFile(file)) return;
        try {
            JsonArray list = JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8)).getAsJsonObject().getAsJsonArray("resultados");
            for (JsonElement e : list) {
                if (results.size() >= MAX_RESULTS) break;
                if (e.isJsonObject() && e.getAsJsonObject().has("id")) results.addLast(e.getAsJsonObject());
            }
        } catch (IOException | RuntimeException e) {
            Log.bridge().error("Desempenho: não li " + file + ": " + e);
        }
    }

    /** 204 guardado; 400 corpo inválido; 413 corpo grande demais; 429 IP mandando demais. */
    int handle(byte[] body, String ip) {
        if (body.length > MAX_BODY) return 413;
        JsonObject result;
        try { result = normalize(JsonParser.parseString(new String(body, StandardCharsets.UTF_8))); }
        catch (RuntimeException e) { return 400; }
        long now = clock.getAsLong();
        String key = limit.key(ip);
        if (limit.exceeded(key, now)) return 429;
        limit.record(key, now);
        add(result, now);
        return 204;
    }

    /** Guarda um resultado já normalizado, com id e data, e corta os mais antigos. */
    synchronized void add(JsonObject result, long now) {
        JsonObject o = new JsonObject();
        o.addProperty("id", newId());
        o.addProperty("quando", Instant.ofEpochMilli(now).toString());
        result.entrySet().forEach(e -> o.add(e.getKey(), e.getValue()));
        results.addFirst(o);
        while (results.size() > MAX_RESULTS) results.removeLast();
        save();
    }

    /** Apaga um resultado; false se não havia. */
    synchronized boolean delete(String id) {
        boolean removed = results.removeIf(o -> id.equals(o.get("id").getAsString()));
        if (removed) save();
        return removed;
    }

    synchronized int size() { return results.size(); }

    private String newId() {
        byte[] raw = new byte[5];
        while (true) {
            random.nextBytes(raw);
            String id = HexFormat.of().formatHex(raw);
            if (results.stream().noneMatch(o -> o.get("id").getAsString().equals(id))) return id;
        }
    }

    private void save() {
        try {
            Files.createDirectories(file.getParent());
            Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
            Files.writeString(tmp, json().toString(), StandardCharsets.UTF_8);
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException | RuntimeException e) {
            Log.bridge().error("Desempenho: não gravei " + file + ": " + e);
        }
    }

    /** {resultados: [...]}, do mais novo ao mais antigo. */
    synchronized JsonObject json() {
        JsonArray list = new JsonArray();
        results.forEach(o -> list.add(o.deepCopy()));
        JsonObject o = new JsonObject();
        o.add("resultados", list);
        return o;
    }

    // ---------- validação ----------

    /** Refaz o resultado só com os campos conhecidos; IllegalArgumentException se algo não cabe. */
    static JsonObject normalize(JsonElement json) {
        if (json == null || !json.isJsonObject()) throw new IllegalArgumentException("Mande um objeto.");
        JsonObject in = json.getAsJsonObject(), out = new JsonObject();
        String mode = text(in, "modo");
        if (mode == null || !MODES.contains(mode)) throw new IllegalArgumentException("Modo desconhecido.");
        Long score = integer(in, "nota", 0, 100);
        if (score == null) throw new IllegalArgumentException("Falta a nota.");
        out.add("versao", primitive(text(in, "versao")));
        out.addProperty("modo", mode);
        out.addProperty("nota", score);
        out.add("fps", primitive(number(in, "fps", 0, 1000)));
        out.add("fps1", primitive(number(in, "fps1", 0, 1000)));
        out.add("travadas", primitive(integer(in, "travadas", 0, 1_000_000)));
        out.add("quadros", primitive(integer(in, "quadros", 0, 10_000_000)));
        out.add("duracaoMs", primitive(integer(in, "duracaoMs", 0, 3_600_000)));
        out.add("degrau", primitive(integer(in, "degrau", 0, 3)));
        out.add("efeitos", primitive(text(in, "efeitos")));
        out.add("aparelho", device(in.get("aparelho")));
        JsonArray scenes = new JsonArray();
        JsonElement list = in.get("cenas");
        if (list != null && !list.isJsonNull()) {
            if (!list.isJsonArray()) throw new IllegalArgumentException("Cenas inválidas.");
            for (JsonElement s : list.getAsJsonArray()) {
                if (scenes.size() >= MAX_SCENES) break;
                if (!s.isJsonObject()) throw new IllegalArgumentException("Cena inválida.");
                JsonObject si = s.getAsJsonObject(), so = new JsonObject();
                String name = text(si, "nome");
                if (name == null) throw new IllegalArgumentException("Cena sem nome.");
                so.addProperty("nome", name);
                so.add("fps", primitive(number(si, "fps", 0, 1000)));
                so.add("fps1", primitive(number(si, "fps1", 0, 1000)));
                so.add("travadas", primitive(integer(si, "travadas", 0, 1_000_000)));
                scenes.add(so);
            }
        }
        out.add("cenas", scenes);
        return out;
    }

    private static JsonElement device(JsonElement json) {
        if (json == null || json.isJsonNull()) return JsonNull.INSTANCE;
        if (!json.isJsonObject()) throw new IllegalArgumentException("Aparelho inválido.");
        JsonObject in = json.getAsJsonObject(), out = new JsonObject();
        out.add("tela", primitive(text(in, "tela")));
        out.add("nucleos", primitive(integer(in, "nucleos", 1, 1024)));
        out.add("memoria", primitive(number(in, "memoria", 0, 1024)));
        out.add("gpu", primitive(text(in, "gpu")));
        // O modelo do celular, quando o navegador conta (Client Hints no Android): "SM-A515F", "Pixel 7".
        out.add("modelo", primitive(text(in, "modelo", MAX_MODEL)));
        out.add("navegador", primitive(text(in, "navegador")));
        out.add("sistema", primitive(text(in, "sistema")));
        JsonElement mobile = in.get("movel");
        if (mobile != null && !mobile.isJsonNull() && !(mobile.isJsonPrimitive() && mobile.getAsJsonPrimitive().isBoolean()))
            throw new IllegalArgumentException("Campo movel inválido.");
        out.addProperty("movel", mobile != null && !mobile.isJsonNull() && mobile.getAsBoolean());
        out.add("hz", primitive(integer(in, "hz", 1, 1000)));
        return out;
    }

    private static JsonElement primitive(Object value) {
        if (value == null) return JsonNull.INSTANCE;
        if (value instanceof String s) return new JsonPrimitive(s);
        return new JsonPrimitive((Number) value);
    }

    /** Texto sem espaços nas pontas, cortado em {@link #MAX_TEXT}; null se ausente ou vazio. */
    private static String text(JsonObject o, String key) { return text(o, key, MAX_TEXT); }

    private static String text(JsonObject o, String key, int max) {
        JsonElement e = o.get(key);
        if (e == null || e.isJsonNull()) return null;
        if (!e.isJsonPrimitive() || !e.getAsJsonPrimitive().isString()) throw new IllegalArgumentException(key + " deve ser texto.");
        String s = e.getAsString().replaceAll("\\p{Cntrl}", " ").strip();
        if (s.isEmpty()) return null;
        return s.length() > max ? s.substring(0, max) : s;
    }

    /** Número finito entre min e max, com uma casa decimal; null se ausente. */
    private static Double number(JsonObject o, String key, double min, double max) {
        JsonElement e = o.get(key);
        if (e == null || e.isJsonNull()) return null;
        if (!e.isJsonPrimitive() || !e.getAsJsonPrimitive().isNumber()) throw new IllegalArgumentException(key + " deve ser número.");
        double v = e.getAsDouble();
        if (!Double.isFinite(v) || v < min || v > max) throw new IllegalArgumentException(key + " fora da faixa.");
        return Math.round(v * 10) / 10.0;
    }

    /** Inteiro entre min e max (aceita 12.0); null se ausente. */
    private static Long integer(JsonObject o, String key, long min, long max) {
        Double v = number(o, key, min, max);
        if (v == null) return null;
        if (v != Math.rint(v)) throw new IllegalArgumentException(key + " deve ser inteiro.");
        return v.longValue();
    }

    /** Depois do agregador de 64 KB: OPTIONS (CORS) e POST em /api/desempenho, respondidos na hora. */
    final class Handler extends ChannelInboundHandlerAdapter {
        @Override public void channelRead(ChannelHandlerContext ctx, Object msg) {
            if (!(msg instanceof FullHttpRequest req) || !PATH.equals(new QueryStringDecoder(req.uri()).path())) {
                ctx.fireChannelRead(msg);
                return;
            }
            try {
                if (req.method() == HttpMethod.OPTIONS) { Admin.respond(ctx, new Admin.Response(204, null, new byte[0])); return; }
                if (req.method() != HttpMethod.POST) { Admin.respond(ctx, Admin.Response.error(405, "Use POST.")); return; }
                String ip = req.headers().get("X-Real-IP");
                if (ip == null || ip.isBlank())
                    ip = ctx.channel().remoteAddress() instanceof InetSocketAddress a && a.getAddress() != null ? a.getAddress().getHostAddress() : "?";
                int status = handle(ByteBufUtil.getBytes(req.content()), ip);
                Admin.respond(ctx, status == 204 ? new Admin.Response(204, null, new byte[0]) : Admin.Response.error(status, switch (status) {
                    case 429 -> "Resultados demais. Tente de novo daqui a pouco.";
                    case 413 -> "Resultado grande demais.";
                    default -> "Resultado inválido.";
                }));
            } finally {
                req.release();
            }
        }
    }
}
