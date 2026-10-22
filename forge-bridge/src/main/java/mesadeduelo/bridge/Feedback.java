package mesadeduelo.bridge;

import java.io.ByteArrayInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.InetSocketAddress;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.zip.GZIPInputStream;

import com.google.gson.JsonObject;
import com.google.gson.Strictness;
import com.google.gson.stream.JsonReader;
import com.google.gson.stream.JsonToken;

import io.netty.buffer.ByteBufUtil;
import io.netty.buffer.Unpooled;
import io.netty.channel.ChannelFutureListener;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelInboundHandlerAdapter;
import io.netty.handler.codec.http.DefaultFullHttpResponse;
import io.netty.handler.codec.http.FullHttpRequest;
import io.netty.handler.codec.http.FullHttpResponse;
import io.netty.handler.codec.http.HttpHeaderNames;
import io.netty.handler.codec.http.HttpMessage;
import io.netty.handler.codec.http.HttpMethod;
import io.netty.handler.codec.http.HttpObjectAggregator;
import io.netty.handler.codec.http.HttpRequest;
import io.netty.handler.codec.http.HttpResponseStatus;
import io.netty.handler.codec.http.HttpVersion;
import io.netty.handler.codec.http.QueryStringDecoder;

/**
 * POST /api/relatos: sugestões e relatos de erro do jogador, com a partida anexada se ele quiser.
 *
 * Corpo: JSON em UTF-8 comprimido com gzip (até 3 MB comprimido e 64 MB aberto). Lidos daqui: v, kind
 * ("sugestao" | "erro"), description (1 a 2.000 caracteres), app.version, match.format e recording; o resto
 * é guardado como veio. Com X-Mesa-Partida e X-Mesa-Token de um assento e uma gravação anexada, o diário da
 * partida na ponte ({@link MatchJournal}) vai junto. O token não é guardado.
 *
 * Respostas em JSON: 201 {code}, ou {error} com 400, 405, 413, 429 ou 507, sempre com uma frase para o jogador.
 */
final class Feedback {
    static final String PATH = "/api/relatos";
    static final int MAX_COMPRESSED = 3 << 20;
    static final long MAX_UNCOMPRESSED = 64L << 20;
    static final int MAX_DESCRIPTION = 2000, MAX_PER_HOUR = 10;

    static final String TOO_LARGE = "O relato ficou grande demais para enviar.";
    static final String TOO_MANY = "Muitos relatos seguidos, tente de novo em alguns minutos.";
    static final String NO_SPACE = "O servidor está sem espaço para guardar relatos agora. Tente de novo mais tarde.";

    /** De onde vem o diário de uma partida (as salas); null se o código e o token não baterem com nenhum assento. */
    interface Journals { JsonObject journal(String code, String token); }

    record Response(int status, String json) { }

    private final FeedbackStore store;
    private final Journals journals;
    private final FeedbackRateLimit limit;
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(2, 2, 0, TimeUnit.SECONDS, new LinkedBlockingQueue<>(16), daemon("Relatos"));
    private final ScheduledExecutorService cleaner = Executors.newSingleThreadScheduledExecutor(daemon("RelatosLimpeza"));

    Feedback(FeedbackStore store, Journals journals, FeedbackRateLimit limit) {
        this.store = store; this.journals = journals; this.limit = limit;
        Metrics.gauge("mesa.feedback.bytes", "Espaço ocupado pelos relatos guardados (bytes)", store, s -> s.totalBytes());
        Metrics.gauge("mesa.feedback.files", "Relatos guardados", store, s -> s.files());
    }

    Feedback(FeedbackStore store, Journals journals) { this(store, journals, new FeedbackRateLimit(MAX_PER_HOUR, 3_600_000)); }

    /** Limpeza agora e de hora em hora. */
    void startRetention() {
        cleaner.scheduleWithFixedDelay(this::cleanup, 0, 1, TimeUnit.HOURS);
    }

    private void cleanup() {
        try {
            int removed = store.cleanup(Instant.now());
            if (removed > 0) System.out.printf("Relatos: %d apagados pela retenção%n", removed);
        } catch (IOException | RuntimeException e) {
            System.err.println("Relatos: falha na limpeza: " + e);
        }
    }

    private static java.util.concurrent.ThreadFactory daemon(String name) {
        return r -> { Thread t = new Thread(r, name); t.setDaemon(true); return t; };
    }

    // ---------- Pedido ----------

    private static final class Invalid extends Exception {
        Invalid(String message) { super(message, null, false, false); }
    }

    private static final class TooLarge extends IOException {
        TooLarge() { super("grande demais"); }
    }

    /** Trata um relato já recebido inteiro. Roda fora da thread da rede. */
    Response handle(byte[] body, String code, String token, String ip) {
        String key = limit.key(ip);
        long now = System.currentTimeMillis();
        if (body.length > MAX_COMPRESSED) return reject(413, "grande", TOO_LARGE);
        if (limit.exceeded(key, now)) return reject(429, "limite", TOO_MANY);
        FeedbackStore.Meta meta;
        try (InputStream in = open(body)) {
            meta = parse(in);
        } catch (TooLarge e) {
            return reject(413, "grande", TOO_LARGE);
        } catch (Invalid e) {
            return reject(400, "invalido", e.getMessage());
        } catch (IOException | RuntimeException e) {
            return reject(400, "invalido", "O relato chegou com defeito. Tente enviar de novo.");
        }
        JsonObject bridge = null;
        if (meta.recording() && code != null && token != null) {
            try { bridge = journals.journal(code.strip().toUpperCase(), token.strip()); }
            catch (RuntimeException e) { System.err.println("Relatos: diário da partida indisponível: " + e); }
        }
        try {
            FeedbackStore.Entry entry = store.store(meta, bridge, () -> open(body));
            limit.record(key, now);
            Metrics.feedbackReceived(meta.kind(), meta.recording());
            System.out.printf("Relato %s recebido (%s, %d bytes%s)%n", entry.code(), meta.kind(), entry.bytes(), bridge != null ? ", com o diário da ponte" : "");
            JsonObject o = new JsonObject(); o.addProperty("code", entry.code());
            return new Response(201, o.toString());
        } catch (FeedbackStore.Full e) {
            System.err.println("Relatos: sem espaço (" + e.getMessage() + ")");
            return reject(507, "disco", NO_SPACE);
        } catch (TooLarge e) {
            return reject(413, "grande", TOO_LARGE);
        } catch (IOException | RuntimeException e) {
            e.printStackTrace();
            return reject(500, "erro", "Não foi possível guardar o relato agora. Tente de novo mais tarde.");
        }
    }

    static Response reject(int status, String reason, String message) {
        Metrics.feedbackRejected(reason);
        return error(status, message);
    }

    static Response error(int status, String message) {
        JsonObject o = new JsonObject(); o.addProperty("error", message);
        return new Response(status, o.toString());
    }

    /** O JSON do aparelho, aberto do gzip (ou como veio, se não estiver comprimido) e cortado em 64 MB. */
    static InputStream open(byte[] body) throws IOException {
        InputStream raw = new ByteArrayInputStream(body);
        boolean gzip = body.length >= 2 && (body[0] & 0xff) == 0x1f && (body[1] & 0xff) == 0x8b;
        return new Capped(gzip ? new GZIPInputStream(raw, 1 << 16) : raw, MAX_UNCOMPRESSED);
    }

    /** Lê só os campos que importam, sem montar a árvore do relato inteiro (a gravação pode ter dezenas de MB). */
    static FeedbackStore.Meta parse(InputStream in) throws IOException, Invalid {
        var decoder = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT);
        JsonReader r = new JsonReader(new InputStreamReader(in, decoder));
        r.setStrictness(Strictness.STRICT);
        String kind = null, description = null, version = null, format = null;
        boolean recording = false;
        if (r.peek() != JsonToken.BEGIN_OBJECT) throw new Invalid("O relato chegou com defeito. Tente enviar de novo.");
        r.beginObject();
        while (r.hasNext()) {
            switch (r.nextName()) {
                case "v" -> {
                    if (r.peek() != JsonToken.NUMBER || r.nextDouble() != 1)
                        throw new Invalid("Esta versão do relato não é aceita. Atualize a página e tente de novo.");
                }
                case "kind" -> kind = string(r);
                case "description" -> description = string(r);
                case "app" -> version = field(r, "version");
                case "match" -> format = field(r, "format");
                case "recording" -> {
                    JsonToken t = r.peek();
                    if (t == JsonToken.NULL) r.nextNull();
                    else if (t == JsonToken.BEGIN_OBJECT) { recording = true; r.skipValue(); }
                    else throw new Invalid("A partida anexada chegou com defeito. Tente enviar de novo.");
                }
                default -> r.skipValue();
            }
        }
        r.endObject();
        if (r.peek() != JsonToken.END_DOCUMENT) throw new Invalid("O relato chegou com defeito. Tente enviar de novo.");
        if (!"sugestao".equals(kind) && !"erro".equals(kind)) throw new Invalid("Escolha se é uma sugestão ou algo que deu errado.");
        String text = description == null ? "" : description.strip();
        if (text.isEmpty()) throw new Invalid("Escreva o que aconteceu ou a sua sugestão.");
        if (text.length() > MAX_DESCRIPTION) throw new Invalid("A descrição passou de 2.000 caracteres. Resuma um pouco e envie de novo.");
        // Começo da descrição no índice, para a lista da área de admin sem abrir cada arquivo.
        String summary = text.replaceAll("\\s+", " ");
        return new FeedbackStore.Meta(kind, version, format, recording, summary.length() > 160 ? summary.substring(0, 159) + "…" : summary);
    }

    private static String string(JsonReader r) throws IOException {
        if (r.peek() == JsonToken.STRING) return r.nextString();
        r.skipValue();
        return null;
    }

    /** Um texto dentro de um objeto ({@code app.version}, {@code match.format}); o resto do objeto é pulado. */
    private static String field(JsonReader r, String name) throws IOException {
        if (r.peek() != JsonToken.BEGIN_OBJECT) { r.skipValue(); return null; }
        String value = null;
        r.beginObject();
        while (r.hasNext()) {
            if (name.equals(r.nextName())) value = string(r);
            else r.skipValue();
        }
        r.endObject();
        return value;
    }

    /** Para de ler (com {@link TooLarge}) quando o relato aberto passa do limite. */
    private static final class Capped extends FilterInputStream {
        private final long max;
        private long count;
        Capped(InputStream in, long max) { super(in); this.max = max; }
        @Override public int read() throws IOException {
            int b = super.read();
            if (b >= 0 && ++count > max) throw new TooLarge();
            return b;
        }
        @Override public int read(byte[] b, int off, int len) throws IOException {
            int n = super.read(b, off, len);
            if (n > 0 && (count += n) > max) throw new TooLarge();
            return n;
        }
        @Override public long skip(long n) throws IOException {
            long s = super.skip(n);
            if ((count += s) > max) throw new TooLarge();
            return s;
        }
    }

    // ---------- Netty ----------

    /**
     * Antes do agregador de 64 KB: num POST em /api/relatos troca o agregador desta conexão por um de 3 MB.
     * A conexão fecha depois da resposta, então as outras rotas continuam com o limite de sempre.
     */
    static final class Route extends ChannelInboundHandlerAdapter {
        private final String aggregator;
        Route(String aggregator) { this.aggregator = aggregator; }
        @Override public void channelRead(ChannelHandlerContext ctx, Object msg) {
            if (msg instanceof HttpRequest req && !(msg instanceof FullHttpRequest) && req.method() == HttpMethod.POST
                && PATH.equals(new QueryStringDecoder(req.uri()).path()) && ctx.pipeline().get(aggregator) != null
                && !(ctx.pipeline().get(aggregator) instanceof Aggregator)) {
                ctx.pipeline().replace(aggregator, aggregator, new Aggregator());
            }
            ctx.fireChannelRead(msg);
        }
    }

    /** Agregador de 3 MB que responde 413 em JSON, com a frase para o jogador. */
    static final class Aggregator extends HttpObjectAggregator {
        Aggregator() { super(MAX_COMPRESSED); }
        @Override protected void handleOversizedMessage(ChannelHandlerContext ctx, HttpMessage oversized) {
            Metrics.feedbackRejected("grande");
            respond(ctx, error(413, TOO_LARGE));
        }
    }

    /** Depois do agregador: OPTIONS (CORS), POST e 405 para o resto em /api/relatos. */
    final class Handler extends ChannelInboundHandlerAdapter {
        @Override public void channelRead(ChannelHandlerContext ctx, Object msg) {
            if (!(msg instanceof FullHttpRequest req) || !PATH.equals(new QueryStringDecoder(req.uri()).path())) {
                ctx.fireChannelRead(msg);
                return;
            }
            try {
                if (req.method() == HttpMethod.OPTIONS) { respond(ctx, new Response(204, null)); return; }
                if (req.method() != HttpMethod.POST) { respond(ctx, error(405, "Use POST para enviar um relato.")); return; }
                byte[] body = ByteBufUtil.getBytes(req.content());
                String code = req.headers().get("X-Mesa-Partida"), token = req.headers().get("X-Mesa-Token");
                String ip = req.headers().get("X-Real-IP");
                if (ip == null || ip.isBlank())
                    ip = ctx.channel().remoteAddress() instanceof InetSocketAddress a && a.getAddress() != null ? a.getAddress().getHostAddress() : "?";
                String from = ip;
                try {
                    workers.execute(() -> respond(ctx, handle(body, code, token, from)));
                } catch (RejectedExecutionException e) {
                    respond(ctx, reject(503, "erro", "O servidor está ocupado agora. Tente de novo em alguns minutos."));
                }
            } finally {
                req.release();
            }
        }
    }

    static void respond(ChannelHandlerContext ctx, Response r) {
        byte[] body = r.json() == null ? new byte[0] : r.json().getBytes(StandardCharsets.UTF_8);
        FullHttpResponse res = new DefaultFullHttpResponse(HttpVersion.HTTP_1_1, HttpResponseStatus.valueOf(r.status()), Unpooled.wrappedBuffer(body));
        if (r.json() != null) res.headers().set(HttpHeaderNames.CONTENT_TYPE, "application/json; charset=utf-8");
        res.headers().setInt(HttpHeaderNames.CONTENT_LENGTH, body.length);
        res.headers().set(HttpHeaderNames.ACCESS_CONTROL_ALLOW_ORIGIN, "*");
        res.headers().set(HttpHeaderNames.ACCESS_CONTROL_ALLOW_METHODS, "POST, OPTIONS");
        res.headers().set(HttpHeaderNames.ACCESS_CONTROL_ALLOW_HEADERS, "Content-Type, Content-Encoding, X-Mesa-Partida, X-Mesa-Token");
        res.headers().set(HttpHeaderNames.ACCESS_CONTROL_MAX_AGE, "600");
        ctx.writeAndFlush(res).addListener(ChannelFutureListener.CLOSE);
    }
}
