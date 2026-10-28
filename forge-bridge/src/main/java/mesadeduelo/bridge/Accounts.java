package mesadeduelo.bridge;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.function.LongSupplier;
import java.util.stream.Stream;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import io.netty.buffer.ByteBufUtil;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelInboundHandlerAdapter;
import io.netty.handler.codec.http.FullHttpRequest;
import io.netty.handler.codec.http.HttpHeaderNames;
import io.netty.handler.codec.http.QueryStringDecoder;

import io.micrometer.core.instrument.Counter;

import mesadeduelo.bridge.Admin.Response;

/**
 * Contas dos jogadores, em /api/conta/ (spec em docs/spec-login-google.md).
 *
 * O navegador entra com o ID token do Google Identity Services; a ponte confere o token uma vez e devolve um token
 * próprio, que vale 180 dias e se renova com o uso. Cada conta é um arquivo em {@code <dir>/<sha256(sub)>.json};
 * as sessões ficam em {@code <dir>/sessoes.json}, só com o hash do token, e sobrevivem a um reinício da ponte.
 * Sem client ID (MESA_GOOGLE_CLIENT_ID ou -Dmesa.google.clientId), toda rota responde 503.
 *
 *   POST   entrar   {credential}   → {token, expiresAt, conta: {id, nome, foto, apelido}}
 *   GET    eu                      → {conta}
 *   POST   sair                    invalida o token
 *   DELETE conta                   apaga a conta e todas as sessões dela
 *   GET    estado[/REV]            {rev, decks}: os decks que mudaram depois de REV (sem REV, todos os vivos)
 *   POST   sincronizar {mudancas}  {rev, aplicadas, conflitos, recusadas} (ver {@link AccountDecks#sync})
 *   GET    lixeira                 {decks}: os apagados nos últimos 30 dias
 *   POST   lixeira/{id}/restaurar  {id, rev, deck, contaRev}
 *
 * Só "sincronizar" aceita corpo grande (até {@link #MAX_SYNC_BYTES}, para o primeiro login com muitos decks);
 * o resto passa pelo agregador de 64 KB.
 */
final class Accounts {
    static final String PREFIX = "/api/conta/";
    static final long SESSION_MILLIS = 180 * 86_400_000L;
    /** Renovar a sessão grava em disco: só quando ela já andou um dia. */
    static final long RENEW_AFTER = 86_400_000L;
    static final int MAX_SESSIONS_PER_ACCOUNT = 20;
    static final int MAX_LOGINS = 20;
    static final long LOGIN_WINDOW = 15 * 60_000L;
    static final int NICKNAME_MAX = 24;
    static final int MAX_SYNC_BYTES = 4 << 20;
    static final String SYNC_PATH = PREFIX + "sincronizar";

    private record Login(String account, long expires) { }

    private final Path dir;
    private final GoogleIdToken google;
    private final LongSupplier clock;
    private final FeedbackRateLimit logins = new FeedbackRateLimit(MAX_LOGINS, LOGIN_WINDOW);
    private final SecureRandom random = new SecureRandom();
    /** hash do token → conta e fim; espelho de sessoes.json. */
    private final Map<String, Login> sessions = new HashMap<>();
    private int accounts;
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(1, 1, 0, TimeUnit.SECONDS, new LinkedBlockingQueue<>(64),
        r -> { Thread t = new Thread(r, "Contas"); t.setDaemon(true); return t; });

    /** {@code google} null desliga as contas. */
    Accounts(Path dir, GoogleIdToken google, LongSupplier clock) throws IOException {
        this.dir = dir; this.google = google; this.clock = clock;
        if (google != null) load();
    }

    /** Client ID de MESA_GOOGLE_CLIENT_ID ou -Dmesa.google.clientId; as contas ficam em {@code base}/contas. */
    static Accounts fromEnvironment(Path base) throws IOException {
        String clientId = System.getProperty("mesa.google.clientId", System.getenv("MESA_GOOGLE_CLIENT_ID"));
        GoogleIdToken google = clientId == null || clientId.isBlank() ? null
            : new GoogleIdToken(clientId.strip(), new GoogleIdToken.GoogleKeys(System::currentTimeMillis), System::currentTimeMillis);
        Accounts a = new Accounts(base.resolve("contas"), google, System::currentTimeMillis);
        Metrics.gauge("mesa.accounts", "Contas de jogadores", a, Accounts::count);
        Metrics.gauge("mesa.accounts.sessions", "Sessões de conta abertas (aparelhos logados)", a, Accounts::sessionCount);
        // Séries com zero desde o início, para o painel não ficar vazio antes do primeiro login.
        for (String result : new String[]{"ok", "recusado", "limite", "erro"}) loginCounter(result);
        syncCounter();
        return a;
    }

    boolean enabled() { return google != null; }
    Path dir() { return dir; }
    synchronized int count() { return accounts; }
    synchronized int sessionCount() { return sessions.size(); }

    /** Trata um pedido já lido inteiro; path é o que vem depois de /api/conta/. */
    Response handle(String method, String path, String authorization, byte[] body, String ip) {
        if (!enabled()) return Response.error(503, "Contas desligadas: defina MESA_GOOGLE_CLIENT_ID na ponte.");
        try {
            if (path.equals("entrar")) return "POST".equals(method) ? login(body, ip) : Response.error(405, "Use POST para entrar.");
            String account = authorized(authorization);
            if (account == null) return Response.error(401, "Entre de novo: a sessão acabou.");
            if (path.equals("eu") && "GET".equals(method)) return me(account);
            if (path.equals("sair") && "POST".equals(method)) { logout(authorization); return Response.json(200, new JsonObject()); }
            if (path.equals("conta") && "DELETE".equals(method)) { delete(account); return Response.json(200, new JsonObject()); }
            if ((path.equals("estado") || path.startsWith("estado/")) && "GET".equals(method)) return state(account, path.substring("estado".length()));
            if (path.equals("sincronizar") && "POST".equals(method)) return sync(account, body);
            if (path.equals("lixeira") && "GET".equals(method)) return withDecks(account, false, AccountDecks::trash);
            String[] parts = path.split("/");
            if (parts.length == 3 && parts[0].equals("lixeira") && parts[2].equals("restaurar") && "POST".equals(method)) return restore(account, parts[1]);
            return Response.error(404, "Rota desconhecida das contas.");
        } catch (IllegalArgumentException e) {
            return Response.error(400, e.getMessage());
        } catch (IOException | RuntimeException e) {
            e.printStackTrace();
            return Response.error(500, "Falha ao ler ou gravar a conta. Tente de novo.");
        }
    }

    private Response login(byte[] body, String ip) throws IOException {
        String key = logins.key(ip);
        long now = clock.getAsLong();
        if (logins.exceeded(key, now)) { loginCounter("limite").increment(); return Response.error(429, "Muitas tentativas de entrar. Espere 15 minutos."); }
        logins.record(key, now);
        String credential;
        try { credential = JsonParser.parseString(new String(body, StandardCharsets.UTF_8)).getAsJsonObject().get("credential").getAsString(); }
        catch (RuntimeException e) { throw new IllegalArgumentException("Pedido sem a credencial do Google."); }
        GoogleIdToken.Claims claims;
        try { claims = google.verify(credential); }
        catch (IllegalArgumentException e) {
            System.out.println("Contas: login recusado (" + e.getMessage() + ")");
            loginCounter("recusado").increment();
            return Response.error(401, "O Google não confirmou o login. Tente entrar de novo.");
        } catch (IllegalStateException e) {
            System.out.println("Contas: " + e.getMessage());
            loginCounter("erro").increment();
            return Response.error(503, "Não foi possível falar com o Google agora. Tente de novo em instantes.");
        }
        String id = accountId(claims.sub());
        String token;
        JsonObject profile;
        synchronized (this) {
            JsonObject account = read(id);
            boolean created = account == null;
            if (created) {
                account = new JsonObject();
                account.addProperty("version", 1);
                account.addProperty("criadaEm", Instant.ofEpochMilli(now).toString());
                account.addProperty("rev", 0);
                account.add("perfil", new JsonObject());
            }
            profile = account.getAsJsonObject("perfil");
            String name = clean(claims.givenName(), 40);
            if (name != null) profile.addProperty("nome", name); else profile.remove("nome");
            String picture = picture(claims.picture());
            if (picture != null) profile.addProperty("foto", picture); else profile.remove("foto");
            if (!profile.has("apelido") && name != null) profile.addProperty("apelido", clean(name, NICKNAME_MAX));
            write(id, account);
            if (created) accounts++;
            token = newSession(id, now);
        }
        loginCounter("ok").increment();
        JsonObject o = new JsonObject();
        o.addProperty("token", token);
        o.addProperty("expiresAt", Instant.ofEpochMilli(now + SESSION_MILLIS).toString());
        o.add("conta", publicProfile(id, profile));
        return Response.json(200, o);
    }

    private synchronized Response me(String account) throws IOException {
        JsonObject a = read(account);
        if (a == null) return Response.error(401, "Entre de novo: a conta não existe mais.");
        JsonObject o = new JsonObject();
        o.add("conta", publicProfile(account, a.getAsJsonObject("perfil")));
        return Response.json(200, o);
    }

    private Response state(String account, String rest) throws IOException {
        long since;
        try { since = rest.isEmpty() ? 0 : Long.parseLong(rest.substring(1)); }
        catch (NumberFormatException e) { throw new IllegalArgumentException("Revisão inválida."); }
        if (since < 0) throw new IllegalArgumentException("Revisão inválida.");
        return withDecks(account, false, a -> AccountDecks.state(a, since));
    }

    private Response sync(String account, byte[] body) throws IOException {
        JsonObject changes;
        try { changes = JsonParser.parseString(new String(body, StandardCharsets.UTF_8)).getAsJsonObject(); }
        catch (RuntimeException e) { throw new IllegalArgumentException("Corpo inválido."); }
        long now = clock.getAsLong();
        Response r = withDecks(account, true, a -> AccountDecks.sync(a, changes, now));
        syncCounter().increment();
        return r;
    }

    private Response restore(String account, String id) throws IOException { return withDecks(account, true, a -> AccountDecks.restore(a, id)); }

    /**
     * Lê a conta, limpa a lixeira vencida, roda {@code action} e grava se for uma escrita (ou se a limpeza mudou algo).
     * Só restaurar devolve null: o deck não está mais na lixeira.
     */
    private synchronized Response withDecks(String account, boolean write, java.util.function.Function<JsonObject, JsonObject> action) throws IOException {
        JsonObject a = read(account);
        if (a == null) return Response.error(401, "Entre de novo: a conta não existe mais.");
        boolean purged = AccountDecks.purge(a, clock.getAsLong());
        JsonObject result = action.apply(a);
        if (write || purged) write(account, a);
        return result == null ? Response.error(404, "Esse deck não está mais na lixeira.") : Response.json(200, result);
    }

    /** O perfil com o id da conta: o navegador o usa para saber se quem entrou é a mesma conta dos decks dali. */
    private static JsonObject publicProfile(String id, JsonObject profile) {
        JsonObject o = profile.deepCopy();
        o.addProperty("id", id);
        return o;
    }

    private synchronized void logout(String authorization) throws IOException {
        if (sessions.remove(hash(token(authorization))) != null) saveSessions();
    }

    private synchronized void delete(String account) throws IOException {
        if (Files.deleteIfExists(file(account))) accounts--;
        sessions.values().removeIf(s -> s.account().equals(account));
        saveSessions();
        System.out.println("Contas: uma conta foi apagada pelo jogador");
    }

    /** A conta do token, renovando a sessão; null se não houver sessão válida. */
    private synchronized String authorized(String authorization) throws IOException {
        String h = hash(token(authorization));
        Login s = sessions.get(h);
        long now = clock.getAsLong();
        if (s == null) return null;
        if (s.expires() < now) { sessions.remove(h); saveSessions(); return null; }
        if (s.expires() - now < SESSION_MILLIS - RENEW_AFTER) { sessions.put(h, new Login(s.account(), now + SESSION_MILLIS)); saveSessions(); }
        return s.account();
    }

    private String newSession(String account, long now) throws IOException {
        sessions.values().removeIf(s -> s.expires() < now);
        List<Map.Entry<String, Login>> mine = new ArrayList<>(sessions.entrySet().stream().filter(e -> e.getValue().account().equals(account)).toList());
        mine.sort(Map.Entry.comparingByValue((a, b) -> Long.compare(a.expires(), b.expires())));
        for (int i = 0; i <= mine.size() - MAX_SESSIONS_PER_ACCOUNT; i++) sessions.remove(mine.get(i).getKey());
        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String token = HexFormat.of().formatHex(raw);
        sessions.put(hash(token), new Login(account, now + SESSION_MILLIS));
        saveSessions();
        return token;
    }

    // ---------- Disco ----------

    private void load() throws IOException {
        Files.createDirectories(dir);
        try (Stream<Path> files = Files.list(dir)) {
            accounts = (int) files.filter(p -> p.getFileName().toString().matches("[0-9a-f]{64}\\.json")).count();
        }
        Path file = dir.resolve("sessoes.json");
        if (!Files.isRegularFile(file)) return;
        long now = clock.getAsLong();
        JsonObject all = JsonParser.parseString(Files.readString(file)).getAsJsonObject();
        for (Map.Entry<String, JsonElement> e : all.entrySet()) {
            JsonObject s = e.getValue().getAsJsonObject();
            long until = s.get("ate").getAsLong();
            if (until >= now) sessions.put(e.getKey(), new Login(s.get("conta").getAsString(), until));
        }
    }

    private void saveSessions() throws IOException {
        JsonObject all = new JsonObject();
        sessions.forEach((h, s) -> { JsonObject o = new JsonObject(); o.addProperty("conta", s.account()); o.addProperty("ate", s.expires()); all.add(h, o); });
        atomicWrite(dir.resolve("sessoes.json"), all.toString());
    }

    private Path file(String account) { return dir.resolve(account + ".json"); }

    private JsonObject read(String account) throws IOException {
        Path f = file(account);
        return Files.isRegularFile(f) ? JsonParser.parseString(Files.readString(f)).getAsJsonObject() : null;
    }

    private void write(String account, JsonObject json) throws IOException { atomicWrite(file(account), json.toString()); }

    /** Grava num temporário e renomeia: o arquivo nunca fica pela metade. */
    private void atomicWrite(Path target, String text) throws IOException {
        Path tmp = Files.createTempFile(dir, ".gravando-", ".tmp");
        try {
            Files.writeString(tmp, text);
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } finally {
            Files.deleteIfExists(tmp);
        }
    }

    // ---------- Auxiliares ----------

    static String accountId(String sub) { return hash("google:" + sub); }

    private static String hash(String text) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    private static String token(String authorization) {
        return authorization != null && authorization.startsWith("Bearer ") ? authorization.substring(7).strip() : "";
    }

    private static String clean(String text, int max) {
        if (text == null) return null;
        String t = text.strip().replaceAll("\\p{Cntrl}", "");
        if (t.isEmpty()) return null;
        return t.codePointCount(0, t.length()) <= max ? t : t.substring(0, t.offsetByCodePoints(0, max));
    }

    /** Só fotos do próprio Google: a página nunca carrega um endereço qualquer vindo do token. */
    static String picture(String url) {
        return url != null && url.length() <= 1000 && url.matches("https://[a-z0-9-]+\\.googleusercontent\\.com/[^\\s\"'<>]*") ? url : null;
    }

    private static Counter syncCounter() {
        return Counter.builder("mesa.accounts.syncs").description("Envios de mudanças de decks para a conta").register(Metrics.REGISTRY);
    }

    private static Counter loginCounter(String result) {
        return Counter.builder("mesa.accounts.logins").description("Tentativas de entrar com Google: ok, recusado, limite ou erro")
            .tags("result", result).register(Metrics.REGISTRY);
    }

    // ---------- Netty ----------

    /** Antes do agregador: o POST de sincronizar troca o agregador de 64 KB por um de {@link #MAX_SYNC_BYTES}. */
    static final class Route extends ChannelInboundHandlerAdapter {
        private final String aggregator;
        Route(String aggregator) { this.aggregator = aggregator; }
        @Override public void channelRead(ChannelHandlerContext ctx, Object msg) {
            if (msg instanceof io.netty.handler.codec.http.HttpRequest req && !(msg instanceof FullHttpRequest)
                && req.method() == io.netty.handler.codec.http.HttpMethod.POST && SYNC_PATH.equals(new QueryStringDecoder(req.uri()).path())
                && ctx.pipeline().get(aggregator) != null && ctx.pipeline().get(aggregator).getClass() == io.netty.handler.codec.http.HttpObjectAggregator.class) {
                ctx.pipeline().replace(aggregator, aggregator, new Aggregator());
            }
            ctx.fireChannelRead(msg);
        }
    }

    /** Agregador grande que responde 413 em JSON, com a frase para o jogador. */
    static final class Aggregator extends io.netty.handler.codec.http.HttpObjectAggregator {
        Aggregator() { super(MAX_SYNC_BYTES); }
        @Override protected void handleOversizedMessage(ChannelHandlerContext ctx, io.netty.handler.codec.http.HttpMessage oversized) {
            Admin.respond(ctx, Response.error(413, "Decks demais para enviar de uma vez. Tente de novo: o jogo manda em partes."));
        }
    }

    /** Depois do agregador de 64 KB: tudo em /api/conta/, fora da thread da rede. */
    final class Handler extends ChannelInboundHandlerAdapter {
        @Override public void channelRead(ChannelHandlerContext ctx, Object msg) {
            String path = msg instanceof FullHttpRequest req ? new QueryStringDecoder(req.uri()).path() : "";
            if (!(msg instanceof FullHttpRequest req) || !path.startsWith(PREFIX)) { ctx.fireChannelRead(msg); return; }
            try {
                String method = req.method().name();
                if ("OPTIONS".equals(method)) { Admin.respond(ctx, new Response(204, null, new byte[0])); return; }
                byte[] body = ByteBufUtil.getBytes(req.content());
                String auth = req.headers().get(HttpHeaderNames.AUTHORIZATION), ip = req.headers().get("X-Real-IP");
                if (ip == null || ip.isBlank())
                    ip = ctx.channel().remoteAddress() instanceof InetSocketAddress a && a.getAddress() != null ? a.getAddress().getHostAddress() : "?";
                String from = ip, rest = path.substring(PREFIX.length());
                try { workers.execute(() -> Admin.respond(ctx, handle(method, rest, auth, body, from))); }
                catch (RejectedExecutionException e) { Admin.respond(ctx, Response.error(503, "A ponte está ocupada. Tente de novo.")); }
            } finally {
                req.release();
            }
        }
    }
}
