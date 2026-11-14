package mesadeduelo.bridge;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;
import java.util.function.LongSupplier;
import java.util.stream.Stream;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import io.netty.buffer.ByteBufUtil;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelInboundHandlerAdapter;
import io.netty.handler.codec.http.FullHttpRequest;
import io.netty.handler.codec.http.HttpHeaderNames;
import io.netty.handler.codec.http.QueryStringDecoder;

import mesadeduelo.bridge.Admin.Response;

/**
 * Torneios suíços presenciais, em /api/torneios/ (a regra fica em {@link Tournament}).
 *
 * Qualquer conta conectada cria torneios; só quem criou mexe neles, e qualquer um com o link (o código) vê.
 * Cada torneio é um arquivo em {@code <dir>/<código>.json}; o índice código → organizador fica em memória.
 * Toda escrita devolve o torneio inteiro, como o GET.
 *
 *   GET    (vazio)                          {torneios: [resumo]}: os da conta, mais novos primeiro
 *   POST   (vazio) {nome, formato?}         cria
 *   GET    {código}                         {torneio}, sem login
 *   PUT    {código} {nome?, formato?, rodadas?}
 *   DELETE {código}
 *   POST   {código}/jogadores {nome}         inscreve (atrasado depois do sorteio da 1ª rodada, até o da 2ª)
 *   PUT    {código}/jogadores/{id} {nome}    corrige o nome
 *   DELETE {código}/jogadores/{id}           tira da lista quem ainda não foi sorteado
 *   POST   {código}/jogadores/{id}/sair | voltar
 *   POST   {código}/rodadas                  sorteia a próxima
 *   DELETE {código}/rodadas/{n}              desfaz o sorteio da última, sem resultados
 *   PUT    {código}/rodadas/{n}/mesas/{m} {a, b, empates}
 *   DELETE {código}/rodadas/{n}/mesas/{m}    apaga o resultado
 *   POST   {código}/encerrar | reabrir
 */
final class Tournaments {
    static final String PREFIX = "/api/torneios/";
    static final int MAX_PER_ACCOUNT = 200;
    private static final String CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int CODE_LENGTH = 8;

    /** Quem pede: a conta e o apelido, pelo token da sessão; null sem sessão válida. */
    interface Auth { FeedbackStore.Author of(String authorization); }

    private final Path dir;
    private final Auth auth;
    private final LongSupplier clock;
    private final Random random;
    /** código → conta do organizador. */
    private final Map<String, String> owners = new HashMap<>();
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(1, 1, 0, TimeUnit.SECONDS, new LinkedBlockingQueue<>(64),
        r -> { Thread t = new Thread(r, "Torneios"); t.setDaemon(true); return t; });

    Tournaments(Path dir, Auth auth, LongSupplier clock, Random random) throws IOException {
        this.dir = dir; this.auth = auth; this.clock = clock; this.random = random;
        load();
    }

    /** Os torneios ficam em {@code base}/torneios; quem pode criar vem das contas. */
    static Tournaments inDir(Path base, Accounts accounts) throws IOException {
        return new Tournaments(base.resolve("torneios"), accounts::reportAuthor, System::currentTimeMillis, new SecureRandom());
    }

    Path dir() { return dir; }
    synchronized int count() { return owners.size(); }

    /** Trata um pedido já lido inteiro; path é o que vem depois de /api/torneios/. */
    Response handle(String method, String path, String authorization, byte[] body) {
        try {
            String[] parts = path.isEmpty() ? new String[0] : path.split("/");
            FeedbackStore.Author me = authorization == null ? null : auth.of(authorization);
            if (parts.length == 0) {
                if (me == null || me.account() == null) return Response.error(401, "Entre com a conta para criar e ver seus torneios.");
                if ("GET".equals(method)) return mine(me.account());
                if ("POST".equals(method)) return create(me, json(body));
                return Response.error(405, "Use GET ou POST.");
            }
            String code = parts[0].toUpperCase(java.util.Locale.ROOT);
            if (!code.matches("[" + CODE_CHARS + "]{" + CODE_LENGTH + "}")) return Response.error(404, "Esse torneio não existe.");
            if (parts.length == 1 && "GET".equals(method)) return view(code, me);
            if (me == null || me.account() == null) return Response.error(401, "Entre com a conta de quem criou o torneio para mexer nele.");
            if (parts.length == 1 && "DELETE".equals(method)) return delete(code, me.account());
            JsonObject in = body.length == 0 ? new JsonObject() : json(body);
            return change(code, me, t -> { apply(t, method, parts, in); return t; });
        } catch (IllegalArgumentException e) {
            return Response.error(400, e.getMessage());
        } catch (IOException | RuntimeException e) {
            e.printStackTrace();
            return Response.error(500, "Falha ao ler ou gravar o torneio. Tente de novo.");
        }
    }

    /** As mudanças do organizador; rota desconhecida vira 400 com a frase. */
    private void apply(Tournament t, String method, String[] p, JsonObject in) {
        int n = p.length;
        if (n == 1 && "PUT".equals(method)) {
            if (in.has("nome")) t.rename(text(in, "nome"));
            if (in.has("formato")) t.format(text(in, "formato"));
            if (in.has("rodadas")) t.plannedRounds(number(in, "rodadas"));
            return;
        }
        if (n == 2 && p[1].equals("jogadores") && "POST".equals(method)) { t.addPlayer(text(in, "nome")); return; }
        if (n == 3 && p[1].equals("jogadores") && "PUT".equals(method)) { t.renamePlayer(id(p[2]), text(in, "nome")); return; }
        if (n == 3 && p[1].equals("jogadores") && "DELETE".equals(method)) { t.removePlayer(id(p[2])); return; }
        if (n == 4 && p[1].equals("jogadores") && "POST".equals(method) && (p[3].equals("sair") || p[3].equals("voltar"))) { t.drop(id(p[2]), p[3].equals("sair")); return; }
        if (n == 2 && p[1].equals("rodadas") && "POST".equals(method)) { t.pairNext(random); return; }
        if (n == 3 && p[1].equals("rodadas") && "DELETE".equals(method)) {
            if (id(p[2]) != t.rounds.size()) throw new IllegalArgumentException("Só dá para desfazer o sorteio da última rodada.");
            t.undoPairing();
            return;
        }
        if (n == 5 && p[1].equals("rodadas") && p[3].equals("mesas") && ("PUT".equals(method) || "DELETE".equals(method))) {
            Tournament.Score score = "DELETE".equals(method) ? null : new Tournament.Score(number(in, "a"), number(in, "b"), in.has("empates") ? number(in, "empates") : 0);
            t.result(id(p[2]), id(p[4]), score);
            return;
        }
        if (n == 2 && p[1].equals("encerrar") && "POST".equals(method)) { t.finish(); return; }
        if (n == 2 && p[1].equals("reabrir") && "POST".equals(method)) { t.reopen(); return; }
        throw new IllegalArgumentException("Pedido desconhecido para o torneio.");
    }

    private synchronized Response mine(String account) throws IOException {
        List<Tournament> list = new ArrayList<>();
        for (Map.Entry<String, String> e : owners.entrySet()) {
            if (!e.getValue().equals(account)) continue;
            Tournament t = read(e.getKey());
            if (t != null) list.add(t);
        }
        list.sort(Comparator.comparingLong((Tournament t) -> t.created).reversed());
        JsonArray a = new JsonArray();
        for (Tournament t : list) a.add(t.summaryJson());
        JsonObject o = new JsonObject();
        o.add("torneios", a);
        return Response.json(200, o);
    }

    private synchronized Response create(FeedbackStore.Author me, JsonObject in) throws IOException {
        long mine = owners.values().stream().filter(me.account()::equals).count();
        if (mine >= MAX_PER_ACCOUNT) return Response.error(400, "Você já tem " + MAX_PER_ACCOUNT + " torneios. Apague algum antigo para criar outro.");
        String code;
        do code = newCode(); while (owners.containsKey(code));
        Tournament t = new Tournament(code, text(in, "nome"), text(in, "formato"), me.account(), me.nickname(), clock.getAsLong());
        write(t);
        owners.put(code, me.account());
        Log.bridge().info("Torneios: torneio %s criado", code);
        return answer(t, true);
    }

    private synchronized Response view(String code, FeedbackStore.Author me) throws IOException {
        Tournament t = read(code);
        if (t == null) return Response.error(404, "Esse torneio não existe ou foi apagado.");
        return answer(t, me != null && t.organizer.equals(me.account()));
    }

    private synchronized Response delete(String code, String account) throws IOException {
        if (!owners.containsKey(code)) return Response.error(404, "Esse torneio não existe ou foi apagado.");
        if (!owners.get(code).equals(account)) return Response.error(403, "Só quem criou o torneio pode apagá-lo.");
        Files.deleteIfExists(file(code));
        owners.remove(code);
        return Response.json(200, new JsonObject());
    }

    /** Lê, confere o organizador, aplica e grava; o apelido dele acompanha a conta. */
    private synchronized Response change(String code, FeedbackStore.Author me, Function<Tournament, Tournament> action) throws IOException {
        Tournament t = read(code);
        if (t == null) return Response.error(404, "Esse torneio não existe ou foi apagado.");
        if (!t.organizer.equals(me.account())) return Response.error(403, "Só quem criou o torneio pode mexer nele.");
        action.apply(t);
        if (me.nickname() != null) t.organizerName = me.nickname();
        write(t);
        return answer(t, true);
    }

    private static Response answer(Tournament t, boolean mine) {
        JsonObject o = new JsonObject();
        o.add("torneio", t.publicJson(mine));
        return Response.json(200, o);
    }

    private String newCode() {
        StringBuilder s = new StringBuilder();
        for (int i = 0; i < CODE_LENGTH; i++) s.append(CODE_CHARS.charAt(random.nextInt(CODE_CHARS.length())));
        return s.toString();
    }

    // ---------- Disco ----------

    private void load() throws IOException {
        Files.createDirectories(dir);
        try (Stream<Path> files = Files.list(dir)) {
            for (Path f : files.filter(p -> p.getFileName().toString().matches("[" + CODE_CHARS + "]{" + CODE_LENGTH + "}\\.json")).toList()) {
                try {
                    JsonObject o = JsonParser.parseString(Files.readString(f)).getAsJsonObject();
                    owners.put(o.get("id").getAsString(), o.get("organizador").getAsString());
                } catch (RuntimeException e) {
                    Log.bridge().warn("Torneios: arquivo ilegível " + f.getFileName() + ": " + e);
                }
            }
        }
    }

    private Path file(String code) { return dir.resolve(code + ".json"); }

    private Tournament read(String code) throws IOException {
        Path f = file(code);
        return Files.isRegularFile(f) ? Tournament.fromJson(JsonParser.parseString(Files.readString(f)).getAsJsonObject()) : null;
    }

    /** Grava num temporário e renomeia: o arquivo nunca fica pela metade. */
    private void write(Tournament t) throws IOException {
        Path tmp = Files.createTempFile(dir, ".gravando-", ".tmp");
        try {
            Files.writeString(tmp, t.toJson().toString());
            Files.move(tmp, file(t.id), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } finally {
            Files.deleteIfExists(tmp);
        }
    }

    // ---------- Auxiliares ----------

    private static JsonObject json(byte[] body) {
        try { return JsonParser.parseString(new String(body, StandardCharsets.UTF_8)).getAsJsonObject(); }
        catch (RuntimeException e) { throw new IllegalArgumentException("Corpo inválido."); }
    }

    private static String text(JsonObject o, String key) {
        JsonElement e = o.get(key);
        if (e == null || e.isJsonNull()) return null;
        if (!e.isJsonPrimitive()) throw new IllegalArgumentException("Campo inválido: " + key + ".");
        return e.getAsString();
    }

    private static int number(JsonObject o, String key) {
        try { return o.get(key).getAsInt(); }
        catch (RuntimeException e) { throw new IllegalArgumentException("Campo inválido: " + key + "."); }
    }

    private static int id(String text) {
        try { return Integer.parseInt(text); }
        catch (NumberFormatException e) { throw new IllegalArgumentException("Pedido desconhecido para o torneio."); }
    }

    // ---------- Netty ----------

    /** Depois do agregador de 64 KB: tudo em /api/torneios/, fora da thread da rede. */
    final class Handler extends ChannelInboundHandlerAdapter {
        @Override public void channelRead(ChannelHandlerContext ctx, Object msg) {
            String path = msg instanceof FullHttpRequest req ? new QueryStringDecoder(req.uri()).path() : "";
            if (!(msg instanceof FullHttpRequest req) || !(path.startsWith(PREFIX) || path.equals(PREFIX.substring(0, PREFIX.length() - 1)))) { ctx.fireChannelRead(msg); return; }
            try {
                String method = req.method().name();
                if ("OPTIONS".equals(method)) { Admin.respond(ctx, new Response(204, null, new byte[0])); return; }
                byte[] body = ByteBufUtil.getBytes(req.content());
                String auth = req.headers().get(HttpHeaderNames.AUTHORIZATION);
                String rest = path.length() <= PREFIX.length() ? "" : path.substring(PREFIX.length()).replaceAll("/+$", "");
                try { workers.execute(() -> Admin.respond(ctx, handle(method, rest, auth, body))); }
                catch (RejectedExecutionException e) { Admin.respond(ctx, Response.error(503, "O servidor está ocupado. Tente de novo.")); }
            } finally {
                req.release();
            }
        }
    }
}
