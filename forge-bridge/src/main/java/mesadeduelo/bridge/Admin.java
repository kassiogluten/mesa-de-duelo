package mesadeduelo.bridge;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.function.LongSupplier;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import io.netty.buffer.ByteBufUtil;
import io.netty.buffer.Unpooled;
import io.netty.channel.ChannelFutureListener;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelInboundHandlerAdapter;
import io.netty.handler.codec.http.DefaultFullHttpResponse;
import io.netty.handler.codec.http.FullHttpRequest;
import io.netty.handler.codec.http.FullHttpResponse;
import io.netty.handler.codec.http.HttpHeaderNames;
import io.netty.handler.codec.http.HttpResponseStatus;
import io.netty.handler.codec.http.HttpVersion;
import io.netty.handler.codec.http.QueryStringDecoder;

/**
 * Área de admin dos relatos, em /api/admin/ (a página fica em /admin.html, no site).
 *
 * Senha em MESA_ADMIN_PASSWORD (ou -Dmesa.admin.password); sem ela, a área fica desligada e toda rota responde 503.
 * POST login {password} devolve {token, expiresAt}; as outras rotas pedem "Authorization: Bearer <token>".
 * Erros de senha contam por IP (só o resumo, como nos relatos): 5 em 15 minutos e o login fica bloqueado.
 *
 *   GET    partidas                partidas e salas vivas na ponte (quem joga, conectado ou não, turno)
 *   GET    historico[/AAAA-MM]     {meses, mes, partidas}: as partidas concluídas do mês (o mais recente sem mês)
 *   GET    historico/AAAA-MM.jsonl o arquivo do mês, para baixar
 *   GET    relatos                 índice com o estado de cada relato
 *   GET    relatos/{código}        o arquivo .json.gz guardado
 *   PUT    relatos/{código}/estado {status, note?, issue?}
 *   DELETE relatos/{código}
 *   POST   logout
 */
final class Admin {
    static final String PREFIX = "/api/admin/";
    static final long SESSION_MILLIS = 12 * 3_600_000L;
    static final int MAX_FAILURES = 5;
    static final long FAILURE_WINDOW = 15 * 60_000L;

    record Response(int status, String contentType, byte[] body) {
        static Response json(int status, JsonElement json) { return new Response(status, "application/json; charset=utf-8", json.toString().getBytes(StandardCharsets.UTF_8)); }
        static Response error(int status, String message) { JsonObject o = new JsonObject(); o.addProperty("error", message); return json(status, o); }
    }

    private final FeedbackStore store;
    /** Partidas vivas (as salas da ponte); devolve uma lista vazia nos testes. */
    private final java.util.function.Supplier<JsonArray> matches;
    /** Partidas concluídas; null nos testes que não usam o histórico. */
    private final MatchHistory history;
    private final byte[] password;
    private final FeedbackRateLimit failures = new FeedbackRateLimit(MAX_FAILURES, FAILURE_WINDOW);
    /** Sessões abertas: token → fim. Só em memória: reiniciar a ponte pede login de novo. */
    private final Map<String, Long> sessions = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();
    private final LongSupplier clock;
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(1, 1, 0, TimeUnit.SECONDS, new LinkedBlockingQueue<>(32),
        r -> { Thread t = new Thread(r, "Admin"); t.setDaemon(true); return t; });

    Admin(FeedbackStore store, String password, LongSupplier clock) { this(store, JsonArray::new, null, password, clock); }

    Admin(FeedbackStore store, java.util.function.Supplier<JsonArray> matches, MatchHistory history, String password, LongSupplier clock) {
        this.store = store;
        this.matches = matches;
        this.history = history;
        this.password = password == null || password.isBlank() ? null : sha(password);
        this.clock = clock;
    }

    /** Senha de MESA_ADMIN_PASSWORD ou -Dmesa.admin.password. */
    static Admin fromEnvironment(FeedbackStore store, java.util.function.Supplier<JsonArray> matches, MatchHistory history) {
        String password = System.getProperty("mesa.admin.password", System.getenv("MESA_ADMIN_PASSWORD"));
        return new Admin(store, matches, history, password, System::currentTimeMillis);
    }

    boolean enabled() { return password != null; }

    private static byte[] sha(String text) {
        try { return MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    /** Trata um pedido já lido inteiro; path é o que vem depois de /api/admin/. */
    Response handle(String method, String path, String authorization, byte[] body, String ip) {
        if (!enabled()) return Response.error(503, "Área de admin desligada: defina MESA_ADMIN_PASSWORD na ponte.");
        try {
            if (path.equals("login")) return "POST".equals(method) ? login(body, ip) : Response.error(405, "Use POST para entrar.");
            if (!authorized(authorization)) return Response.error(401, "Entre de novo: a sessão acabou ou a senha mudou.");
            if (path.equals("logout") && "POST".equals(method)) { sessions.remove(token(authorization)); return Response.json(200, new JsonObject()); }
            if (path.equals("relatos") && "GET".equals(method)) return list();
            if (path.equals("partidas") && "GET".equals(method)) { JsonObject o = new JsonObject(); o.add("partidas", matches.get()); return Response.json(200, o); }
            if ((path.equals("historico") || path.startsWith("historico/")) && "GET".equals(method)) return history(path.substring("historico".length()));
            String[] parts = path.split("/");
            if (parts.length >= 2 && parts[0].equals("relatos")) {
                String code = parts[1].toUpperCase();
                if (parts.length == 2 && "GET".equals(method)) return download(code);
                if (parts.length == 2 && "DELETE".equals(method)) return store.delete(code) ? Response.json(200, new JsonObject()) : notFound(code);
                if (parts.length == 3 && parts[2].equals("estado") && "PUT".equals(method)) return status(code, body);
            }
            return Response.error(404, "Rota desconhecida da área de admin.");
        } catch (IllegalArgumentException e) {
            return Response.error(400, e.getMessage());
        } catch (IOException | RuntimeException e) {
            e.printStackTrace();
            return Response.error(500, "Falha ao ler ou gravar os relatos: " + e.getMessage());
        }
    }

    private Response login(byte[] body, String ip) {
        String key = failures.key(ip);
        long now = clock.getAsLong();
        if (failures.exceeded(key, now)) return Response.error(429, "Muitas tentativas erradas. Espere 15 minutos.");
        String given;
        try { given = JsonParser.parseString(new String(body, StandardCharsets.UTF_8)).getAsJsonObject().get("password").getAsString(); }
        catch (RuntimeException e) { given = ""; }
        if (!MessageDigest.isEqual(sha(given), password)) {
            failures.record(key, now);
            System.out.println("Admin: senha errada");
            return Response.error(401, "Senha errada.");
        }
        sessions.values().removeIf(end -> end < now);
        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String token = HexFormat.of().formatHex(raw);
        long end = now + SESSION_MILLIS;
        sessions.put(token, end);
        JsonObject o = new JsonObject();
        o.addProperty("token", token); o.addProperty("expiresAt", Instant.ofEpochMilli(end).toString());
        return Response.json(200, o);
    }

    private static String token(String authorization) {
        return authorization != null && authorization.startsWith("Bearer ") ? authorization.substring(7).strip() : "";
    }

    private boolean authorized(String authorization) {
        Long end = sessions.get(token(authorization));
        if (end == null) return false;
        if (end < clock.getAsLong()) { sessions.remove(token(authorization)); return false; }
        return true;
    }

    private Response list() {
        JsonArray items = new JsonArray();
        for (FeedbackStore.Entry e : store.entries()) {
            JsonObject o = e.json();
            o.remove("path");
            FeedbackStore.Status s = store.status(e.code());
            o.add("status", s == null ? new FeedbackStore.Status("novo", null, null, e.receivedAt()).json() : s.json());
            items.add(o);
        }
        JsonObject o = new JsonObject();
        o.add("relatos", items); o.addProperty("totalBytes", store.totalBytes());
        return Response.json(200, o);
    }

    /** {@code rest} é "", "/AAAA-MM" ou "/AAAA-MM.jsonl". */
    private Response history(String rest) throws IOException {
        if (history == null) return Response.error(404, "Histórico de partidas desligado.");
        String month = rest.startsWith("/") ? rest.substring(1) : "";
        if (month.endsWith(".jsonl")) {
            Path file = history.file(month.substring(0, month.length() - ".jsonl".length()));
            return file == null ? Response.error(404, "Sem partidas nesse mês.") : new Response(200, "application/x-ndjson; charset=utf-8", Files.readAllBytes(file));
        }
        java.util.List<String> months = history.months();
        if (month.isEmpty()) month = months.isEmpty() ? "" : months.get(0);
        else if (!month.matches("\\d{4}-\\d{2}")) throw new IllegalArgumentException("Mês inválido: use AAAA-MM.");
        JsonObject o = new JsonObject();
        JsonArray list = new JsonArray();
        months.forEach(list::add);
        o.add("meses", list); o.addProperty("mes", month);
        o.add("partidas", month.isEmpty() ? new JsonArray() : history.read(month));
        return Response.json(200, o);
    }

    private Response download(String code) throws IOException {
        Path file = store.file(code);
        if (file == null || !Files.isRegularFile(file)) return notFound(code);
        return new Response(200, "application/gzip", Files.readAllBytes(file));
    }

    private Response status(String code, byte[] body) throws IOException {
        JsonObject o;
        try { o = JsonParser.parseString(new String(body, StandardCharsets.UTF_8)).getAsJsonObject(); }
        catch (RuntimeException e) { throw new IllegalArgumentException("Corpo inválido."); }
        String status = FeedbackStore.Entry.text(o, "status");
        String note = FeedbackStore.Entry.text(o, "note"), issue = FeedbackStore.Entry.text(o, "issue");
        if (note != null && note.length() > 2000) throw new IllegalArgumentException("A nota passou de 2.000 caracteres.");
        if (issue != null && issue.length() > 200) throw new IllegalArgumentException("Issue longa demais.");
        FeedbackStore.Status saved = store.setStatus(code, status, note == null ? null : note.strip(), issue == null ? null : issue.strip());
        return saved == null ? notFound(code) : Response.json(200, saved.json());
    }

    private static Response notFound(String code) { return Response.error(404, "Relato " + code + " não encontrado."); }

    // ---------- Netty ----------

    /** Depois do agregador de 64 KB: tudo em /api/admin/, fora da thread da rede. */
    final class Handler extends ChannelInboundHandlerAdapter {
        @Override public void channelRead(ChannelHandlerContext ctx, Object msg) {
            String path = msg instanceof FullHttpRequest req ? new QueryStringDecoder(req.uri()).path() : "";
            if (!(msg instanceof FullHttpRequest req) || !path.startsWith(PREFIX)) { ctx.fireChannelRead(msg); return; }
            try {
                String method = req.method().name();
                if ("OPTIONS".equals(method)) { respond(ctx, new Response(204, null, new byte[0])); return; }
                byte[] body = ByteBufUtil.getBytes(req.content());
                String auth = req.headers().get(HttpHeaderNames.AUTHORIZATION), ip = req.headers().get("X-Real-IP");
                if (ip == null || ip.isBlank())
                    ip = ctx.channel().remoteAddress() instanceof InetSocketAddress a && a.getAddress() != null ? a.getAddress().getHostAddress() : "?";
                String from = ip, rest = path.substring(PREFIX.length());
                try { workers.execute(() -> respond(ctx, handle(method, rest, auth, body, from))); }
                catch (RejectedExecutionException e) { respond(ctx, Response.error(503, "A ponte está ocupada. Tente de novo.")); }
            } finally {
                req.release();
            }
        }
    }

    static void respond(ChannelHandlerContext ctx, Response r) {
        FullHttpResponse res = new DefaultFullHttpResponse(HttpVersion.HTTP_1_1, HttpResponseStatus.valueOf(r.status()), Unpooled.wrappedBuffer(r.body()));
        if (r.contentType() != null) res.headers().set(HttpHeaderNames.CONTENT_TYPE, r.contentType());
        res.headers().setInt(HttpHeaderNames.CONTENT_LENGTH, r.body().length);
        res.headers().set(HttpHeaderNames.CACHE_CONTROL, "no-store");
        // No `npm run dev` a página vem de outra porta. O acesso é pelo token no cabeçalho, sem cookie.
        res.headers().set(HttpHeaderNames.ACCESS_CONTROL_ALLOW_ORIGIN, "*");
        res.headers().set(HttpHeaderNames.ACCESS_CONTROL_ALLOW_METHODS, "GET, POST, PUT, DELETE, OPTIONS");
        res.headers().set(HttpHeaderNames.ACCESS_CONTROL_ALLOW_HEADERS, "Authorization, Content-Type");
        res.headers().set(HttpHeaderNames.ACCESS_CONTROL_MAX_AGE, "600");
        ctx.writeAndFlush(res).addListener(ChannelFutureListener.CLOSE);
    }

    /** Para os testes: quantas sessões abertas. */
    int sessions() {
        long now = clock.getAsLong();
        int n = 0;
        for (Iterator<Long> it = sessions.values().iterator(); it.hasNext(); ) if (it.next() >= now) n++;
        return n;
    }
}
