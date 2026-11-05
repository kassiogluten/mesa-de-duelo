package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletionException;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import io.netty.channel.Channel;

/**
 * Pedidos da tela inicial que não dependem de sala nem de partida: {type:"validate-deck"}, {type:"fetch-deck"}
 * (a lista de um site de decks) e {type:"similar-cards"} (pelas tags do Tagger). A resposta volta com o mesmo
 * requestId; um erro síncrono sobe para o {@link Rooms#onMessage}, que responde como nos outros pedidos.
 */
final class LobbyRequests {
    private LobbyRequests() { }

    static void handle(Channel ch, String type, JsonObject msg, String requestId) {
        switch (type) {
            case "validate-deck" -> validateDeck(ch, msg, requestId);
            case "fetch-deck" -> fetchDeck(ch, msg, requestId);
            case "similar-cards" -> similarCards(ch, msg, requestId);
            default -> throw new IllegalArgumentException("Pedido desconhecido: " + type);
        }
    }

    private static void validateDeck(Channel ch, JsonObject msg, String requestId) {
        var result = DeckValidation.validate(msg.get("deck"), MatchConfig.string(msg, "format"));
        JsonObject response = new JsonObject(); response.addProperty("type", "validation");
        response.addProperty("requestId", requestId); response.add("validation", result.json());
        BridgeServer.send(ch, response.toString());
    }

    /** A busca roda fora da thread da rede; a resposta volta com o mesmo requestId. */
    private static void fetchDeck(Channel ch, JsonObject msg, String requestId) {
        String site = MatchConfig.string(msg, "site"), id = MatchConfig.string(msg, "id");
        DeckLinks.fetch(site, id).whenComplete((body, error) -> {
            JsonObject response = new JsonObject(); response.addProperty("requestId", requestId);
            if (error == null) { response.addProperty("type", "deck-source"); response.addProperty("body", body); }
            else failed(response, error, "Não foi possível falar com o site do deck. Confira a conexão ou cole a lista em texto.");
            BridgeServer.send(ch, response.toString());
        });
    }

    /** Cartas parecidas pelas tags do Tagger: o primeiro pedido do dia baixa o arquivo, fora da thread da rede. */
    private static void similarCards(Channel ch, JsonObject msg, String requestId) {
        String target = MatchConfig.string(msg, "oracleId");
        List<String> candidates = new ArrayList<>();
        if (msg.has("candidates") && msg.get("candidates").isJsonArray())
            for (JsonElement c : msg.getAsJsonArray("candidates")) if (c.isJsonPrimitive()) candidates.add(c.getAsString());
        int limit = msg.has("limit") && msg.get("limit").isJsonPrimitive() ? Math.max(1, Math.min(100, msg.get("limit").getAsInt())) : 40;
        CardTags.similar(target, candidates, limit).whenComplete((matches, error) -> {
            JsonObject response = error == null ? CardTags.json(matches) : new JsonObject();
            response.addProperty("requestId", requestId);
            if (error == null) response.addProperty("type", "similar-cards");
            else failed(response, error, "Não foi possível buscar as cartas parecidas agora. Tente de novo mais tarde.");
            BridgeServer.send(ch, response.toString());
        });
    }

    /**
     * Um pedido assíncrono que falhou: {@code request-error} com o motivo, que é o texto da exceção quando ela é um
     * pedido inválido (IllegalArgumentException) e, nas outras (rede, site fora do ar), o {@code fallback}.
     */
    private static void failed(JsonObject response, Throwable error, String fallback) {
        Throwable cause = error instanceof CompletionException && error.getCause() != null ? error.getCause() : error;
        response.addProperty("type", "request-error");
        response.addProperty("text", cause instanceof IllegalArgumentException && cause.getMessage() != null ? cause.getMessage() : fallback);
    }
}
