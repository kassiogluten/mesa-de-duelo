package mesadeduelo.bridge;

import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;
import java.util.function.LongSupplier;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelInboundHandlerAdapter;
import io.netty.handler.codec.http.FullHttpRequest;
import io.netty.handler.codec.http.HttpMethod;
import io.netty.handler.codec.http.QueryStringDecoder;

/**
 * Aviso do servidor para todos os jogadores (manutenção, reinício marcado): o admin escreve o texto e o horário
 * (PUT /api/admin/aviso), e o aviso vai na hora para todas as conexões abertas ({type:"server-notice", notice}), para
 * quem conecta enquanto ele vale e para quem está na tela inicial (GET /api/aviso, sem login). Some sozinho
 * {@link #EXPIRES_AFTER_MS} depois do horário, ou quando o admin o retira (notice:null).
 */
final class ServerNotice {
    static final String PATH = "/api/aviso";
    static final int MAX_TEXT = 500;
    /** Até quando o aviso vale depois do horário marcado: o reinício pode atrasar um pouco. */
    static final long EXPIRES_AFTER_MS = 10 * 60_000L;
    /** O horário pode ser marcado até uma semana à frente. */
    static final long MAX_AHEAD_MS = 7 * 24 * 3_600_000L;

    /** at: o horário marcado, em milissegundos desde 1970; 0 sem horário (vale até ser retirado). */
    record Notice(String id, String text, long at) {
        JsonObject json() {
            JsonObject o = new JsonObject();
            o.addProperty("id", id);
            o.addProperty("text", text);
            if (at > 0) o.addProperty("at", at);
            return o;
        }
    }

    private final LongSupplier clock;
    private final AtomicLong ids = new AtomicLong();
    private volatile Notice current;
    /** Manda uma mensagem a todas as conexões WebSocket abertas. */
    private volatile Consumer<String> broadcast = json -> { };

    ServerNotice(LongSupplier clock) { this.clock = clock; }

    void broadcaster(Consumer<String> sendAll) { broadcast = sendAll; }

    /** O aviso que vale agora, ou null. */
    Notice current() {
        Notice n = current;
        if (n != null && n.at() > 0 && clock.getAsLong() > n.at() + EXPIRES_AFTER_MS) { current = null; return null; }
        return n;
    }

    /** Marca o aviso (substitui o anterior) e manda a todos; recusa texto vazio ou longo e horário no passado. */
    Notice set(String text, long at) {
        String clean = text == null ? "" : text.strip();
        if (clean.isEmpty()) throw new IllegalArgumentException("Escreva o texto do aviso.");
        if (clean.length() > MAX_TEXT) throw new IllegalArgumentException("O aviso pode ter até " + MAX_TEXT + " caracteres.");
        long now = clock.getAsLong();
        if (at < 0 || (at > 0 && at <= now)) throw new IllegalArgumentException("Escolha um horário que ainda não passou.");
        if (at > now + MAX_AHEAD_MS) throw new IllegalArgumentException("O horário pode ser marcado até uma semana à frente.");
        if (at == 0 && clean.contains("{hora}")) throw new IllegalArgumentException("O texto usa {hora}: escolha o horário.");
        Notice n = new Notice(Long.toString(now, 36) + "-" + ids.incrementAndGet(), clean, at);
        current = n;
        broadcast.accept(message(n));
        Log.bridge().info("Aviso do servidor enviado%s: %s", at > 0 ? " (horário " + java.time.Instant.ofEpochMilli(at) + ")" : "", clean);
        return n;
    }

    /** Retira o aviso de todas as telas. */
    void clear() {
        if (current == null) return;
        current = null;
        broadcast.accept(message(null));
        Log.bridge().info("Aviso do servidor retirado");
    }

    /** A mensagem do WebSocket com o aviso (null: nenhum, a mesa tira a faixa). */
    static String message(Notice n) {
        JsonObject o = new JsonObject();
        o.addProperty("type", "server-notice");
        o.add("notice", n == null ? com.google.gson.JsonNull.INSTANCE : n.json());
        return o.toString();
    }

    /** {notice}: o corpo de GET /api/aviso e de GET /api/admin/aviso. */
    JsonObject json() {
        Notice n = current();
        JsonObject o = new JsonObject();
        o.add("notice", n == null ? com.google.gson.JsonNull.INSTANCE : n.json());
        return o;
    }

    /** PUT /api/admin/aviso {text, at}: at em milissegundos desde 1970 (ausente ou 0: sem horário). */
    Admin.Response put(JsonElement body) {
        if (body == null || !body.isJsonObject()) return Admin.Response.error(400, "Mande {text, at}.");
        JsonObject o = body.getAsJsonObject();
        try {
            String text = o.has("text") && o.get("text").isJsonPrimitive() ? o.get("text").getAsString() : "";
            long at = o.has("at") && o.get("at").isJsonPrimitive() ? o.get("at").getAsLong() : 0;
            set(text, at);
            return Admin.Response.json(200, json());
        } catch (NumberFormatException e) {
            return Admin.Response.error(400, "Horário inválido.");
        } catch (IllegalArgumentException e) {
            return Admin.Response.error(400, e.getMessage());
        }
    }

    /** GET /api/aviso, sem login: a tela inicial pergunta de tempos em tempos. */
    final class Handler extends ChannelInboundHandlerAdapter {
        @Override public void channelRead(ChannelHandlerContext ctx, Object msg) {
            if (!(msg instanceof FullHttpRequest req) || !PATH.equals(new QueryStringDecoder(req.uri()).path())) {
                ctx.fireChannelRead(msg);
                return;
            }
            try {
                if (req.method() == HttpMethod.OPTIONS) { Admin.respond(ctx, new Admin.Response(204, null, new byte[0])); return; }
                if (req.method() != HttpMethod.GET) { Admin.respond(ctx, Admin.Response.error(405, "Use GET.")); return; }
                Admin.respond(ctx, Admin.Response.json(200, json()));
            } finally {
                req.release();
            }
        }
    }
}
