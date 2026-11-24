package mesadeduelo.bridge;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import io.netty.buffer.ByteBufUtil;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelInboundHandlerAdapter;
import io.netty.handler.codec.http.FullHttpRequest;
import io.netty.handler.codec.http.HttpMethod;
import io.netty.handler.codec.http.QueryStringDecoder;

import mesadeduelo.bridge.Admin.Response;

/**
 * A tela de detalhes do deck, em /api/deck/ (sem login):
 *
 *   GET  publico/CÓDIGO                  o deck público do link /d/CÓDIGO ({@link PublicDecks})
 *   GET  impressoes?carta=ORACLE&nome=N  as impressões da carta que a partida mostra ({@link CardPrints})
 *   POST funcoes {cartas: [oracle_id]}   as tags de função do Tagger de cada carta ({@link CardTags})
 */
final class DeckApi {
    static final String PREFIX = "/api/deck/";

    private final PublicDecks publics;
    private final CardPrints prints;
    private final ExecutorService files = Executors.newSingleThreadExecutor(r -> { Thread t = new Thread(r, "decks-publicos"); t.setDaemon(true); return t; });

    /** Qualquer um pode faltar: a rota dele responde 503. */
    DeckApi(PublicDecks publics, CardPrints prints) { this.publics = publics; this.prints = prints; }

    CompletableFuture<Response> handle(String method, String path, QueryStringDecoder query, byte[] body) {
        try {
            if (path.startsWith("publico/") && "GET".equals(method)) return publicDeck(path.substring("publico/".length()));
            if (path.equals("impressoes") && "GET".equals(method)) return prints(param(query, "carta"), param(query, "nome"));
            if (path.equals("funcoes") && "POST".equals(method)) return functions(body);
            return done(Response.error(404, "Rota desconhecida."));
        } catch (IllegalArgumentException e) {
            return done(Response.error(400, e.getMessage()));
        }
    }

    private CompletableFuture<Response> publicDeck(String code) {
        if (publics == null) return done(Response.error(503, "Decks públicos desligados neste servidor."));
        return CompletableFuture.supplyAsync(() -> {
            try {
                JsonObject deck = publics.read(code);
                return deck == null ? Response.error(404, "Este deck não está mais compartilhado.") : Response.json(200, deck);
            } catch (Exception e) {
                return Response.error(500, "Não foi possível abrir o deck agora. Tente de novo.");
            }
        }, files);
    }

    private CompletableFuture<Response> prints(String oracleId, String name) {
        if (prints == null) return done(Response.error(503, "Trocar a arte está desligado neste servidor."));
        return prints.list(oracleId, name).handle((json, error) -> error == null ? Response.json(200, json)
            : Response.error(502, "Não foi possível buscar as artes desta carta agora. Tente de novo em instantes."));
    }

    private CompletableFuture<Response> functions(byte[] body) {
        List<String> ids = new ArrayList<>();
        try {
            for (JsonElement e : JsonParser.parseString(new String(body, StandardCharsets.UTF_8)).getAsJsonObject().getAsJsonArray("cartas"))
                ids.add(e.getAsString());
        } catch (RuntimeException e) { throw new IllegalArgumentException("Pedido inválido."); }
        return CardTags.functions(ids).handle((json, error) -> {
            if (error == null) return Response.json(200, json);
            Throwable cause = error instanceof CompletionException && error.getCause() != null ? error.getCause() : error;
            return Response.error(502, cause instanceof IllegalArgumentException && cause.getMessage() != null ? cause.getMessage()
                : "Não foi possível ler as funções das cartas agora. Tente de novo mais tarde.");
        });
    }

    private static String param(QueryStringDecoder q, String key) {
        List<String> v = q.parameters().get(key);
        return v == null || v.isEmpty() ? null : v.get(0);
    }

    private static CompletableFuture<Response> done(Response r) { return CompletableFuture.completedFuture(r); }

    /** Depois do agregador de 64 KB: OPTIONS (CORS) e as rotas de /api/deck/, respondidas quando terminarem. */
    final class Handler extends ChannelInboundHandlerAdapter {
        @Override public void channelRead(ChannelHandlerContext ctx, Object msg) {
            QueryStringDecoder query = msg instanceof FullHttpRequest r ? new QueryStringDecoder(r.uri()) : null;
            if (!(msg instanceof FullHttpRequest req) || !query.path().startsWith(PREFIX)) { ctx.fireChannelRead(msg); return; }
            try {
                if (req.method() == HttpMethod.OPTIONS) { Admin.respond(ctx, new Response(204, null, new byte[0])); return; }
                byte[] body = ByteBufUtil.getBytes(req.content());
                handle(req.method().name(), query.path().substring(PREFIX.length()), query, body)
                    .whenComplete((r, error) -> Admin.respond(ctx, error == null ? r : Response.error(500, "Falha no servidor. Tente de novo.")));
            } catch (RuntimeException e) {
                Admin.respond(ctx, Response.error(500, "Falha no servidor. Tente de novo."));
            } finally {
                req.release();
            }
        }
    }
}
