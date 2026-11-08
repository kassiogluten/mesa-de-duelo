package mesadeduelo.bridge;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.LongSupplier;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import io.netty.buffer.ByteBufUtil;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelInboundHandlerAdapter;
import io.netty.handler.codec.http.FullHttpRequest;
import io.netty.handler.codec.http.HttpMethod;
import io.netty.handler.codec.http.QueryStringDecoder;

/**
 * Quantos visitantes começam a jogar (item 109), em POST /api/funil {evento}: só contadores por semana, num
 * arquivo {@code funil.json}. Nada do jogador é guardado; o IP serve só, como resumo em memória, para limitar quem
 * manda eventos sem parar. A área de admin lê as semanas em GET /api/admin/funil.
 *
 * Eventos: {@code jogar} (Jogar na /sobre), {@code deck} (deck escolhido), {@code partida-ia} e {@code partida-sala}
 * (partida começou). A mesa manda cada um no máximo uma vez por aba (src/funnel.ts).
 */
final class Funnel {
    static final String PATH = "/api/funil";
    static final List<String> EVENTS = List.of("jogar", "deck", "partida-ia", "partida-sala");
    /** Por IP: folga para várias abas e recarregar, nada além disso. */
    static final int MAX_PER_WINDOW = 30;
    static final long WINDOW = 10 * 60_000L;

    private final Path file;
    private final LongSupplier clock;
    private final FeedbackRateLimit limit = new FeedbackRateLimit(MAX_PER_WINDOW, WINDOW);
    /** Semana (segunda-feira, em UTC, AAAA-MM-DD) → evento → quantos. */
    private final TreeMap<String, Map<String, Integer>> weeks = new TreeMap<>();

    Funnel(Path file, LongSupplier clock) {
        this.file = file;
        this.clock = clock;
        load();
    }

    /** Ao lado dos relatos e do histórico de partidas. */
    static Funnel inDir(Path dir) { return new Funnel(dir.resolve("funil.json"), System::currentTimeMillis); }

    private synchronized void load() {
        if (!Files.isRegularFile(file)) return;
        try {
            JsonObject root = JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8)).getAsJsonObject();
            for (var week : root.entrySet()) {
                Map<String, Integer> counts = new TreeMap<>();
                for (var e : week.getValue().getAsJsonObject().entrySet()) if (EVENTS.contains(e.getKey())) counts.put(e.getKey(), e.getValue().getAsInt());
                weeks.put(week.getKey(), counts);
            }
        } catch (IOException | RuntimeException e) {
            Log.bridge().error("Funil: não li " + file + ": " + e);
        }
    }

    /** Segunda-feira da semana de {@code millis}, em UTC. */
    static String week(long millis) {
        LocalDate day = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate();
        return day.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).toString();
    }

    /** 204 contado; 400 evento desconhecido; 429 IP mandando demais. */
    int handle(byte[] body, String ip) {
        String event;
        try { event = JsonParser.parseString(new String(body, StandardCharsets.UTF_8)).getAsJsonObject().get("evento").getAsString(); }
        catch (RuntimeException e) { return 400; }
        if (!EVENTS.contains(event)) return 400;
        long now = clock.getAsLong();
        String key = limit.key(ip);
        if (limit.exceeded(key, now)) return 429;
        limit.record(key, now);
        count(event, now);
        return 204;
    }

    synchronized void count(String event, long now) {
        weeks.computeIfAbsent(week(now), w -> new TreeMap<>()).merge(event, 1, Integer::sum);
        save();
    }

    private void save() {
        JsonObject root = new JsonObject();
        weeks.forEach((week, counts) -> {
            JsonObject o = new JsonObject();
            counts.forEach(o::addProperty);
            root.add(week, o);
        });
        try {
            Files.createDirectories(file.getParent());
            Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
            Files.writeString(tmp, root.toString(), StandardCharsets.UTF_8);
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException | RuntimeException e) {
            Log.bridge().error("Funil: não gravei " + file + ": " + e);
        }
    }

    /** {semanas: [{semana, jogar, deck, partida-ia, partida-sala}]}, da mais recente à mais antiga. */
    synchronized JsonObject json() {
        JsonArray list = new JsonArray();
        for (var week : weeks.descendingMap().entrySet()) {
            JsonObject o = new JsonObject();
            o.addProperty("semana", week.getKey());
            for (String event : EVENTS) o.addProperty(event, week.getValue().getOrDefault(event, 0));
            list.add(o);
        }
        JsonObject o = new JsonObject();
        o.add("semanas", list);
        return o;
    }

    /** Depois do agregador de 64 KB: OPTIONS (CORS) e POST em /api/funil, respondidos na hora (só contam). */
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
                Admin.respond(ctx, status == 204 ? new Admin.Response(204, null, new byte[0]) : Admin.Response.error(status, status == 429 ? "Eventos demais." : "Evento desconhecido."));
            } finally {
                req.release();
            }
        }
    }
}
