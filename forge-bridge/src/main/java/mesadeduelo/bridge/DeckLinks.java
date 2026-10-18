package mesadeduelo.bridge;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.regex.Pattern;

/**
 * Busca a lista pública de um deck no Moxfield ou no Archidekt para o navegador, que não pode chamar essas
 * APIs direto (CORS). Só esses dois sites: o navegador manda o site e o id, e o endereço é montado aqui,
 * para a ponte nunca virar um proxy para endereços quaisquer. A conversão para lista fica no frontend.
 */
final class DeckLinks {
    private static final Pattern MOXFIELD_ID = Pattern.compile("[A-Za-z0-9_-]{4,64}");
    private static final Pattern ARCHIDEKT_ID = Pattern.compile("\\d{1,12}");
    private static final int MAX_BYTES = 4 * 1024 * 1024;
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8)).followRedirects(HttpClient.Redirect.NORMAL).build();

    private DeckLinks() {}

    static URI uri(String site, String id) {
        if (site == null || id == null) throw new IllegalArgumentException("Link de deck inválido.");
        return switch (site) {
            case "moxfield" -> {
                if (!MOXFIELD_ID.matcher(id).matches()) throw new IllegalArgumentException("Link do Moxfield inválido.");
                yield URI.create("https://api2.moxfield.com/v3/decks/all/" + id);
            }
            case "archidekt" -> {
                if (!ARCHIDEKT_ID.matcher(id).matches()) throw new IllegalArgumentException("Link do Archidekt inválido.");
                yield URI.create("https://archidekt.com/api/decks/" + id + "/");
            }
            default -> throw new IllegalArgumentException("Só dá para importar links do Moxfield ou do Archidekt.");
        };
    }

    /** Corpo JSON da API do site; falha com uma mensagem pronta para o jogador. */
    static CompletableFuture<String> fetch(String site, String id) {
        HttpRequest request = HttpRequest.newBuilder(uri(site, id)).timeout(Duration.ofSeconds(12))
                .header("Accept", "application/json")
                .header("User-Agent", "MesaDeDuelo/0.1 (+deck import)").GET().build();
        return HTTP.sendAsync(request, HttpResponse.BodyHandlers.ofString()).thenApply(response -> {
            int status = response.statusCode();
            if (status == 404) throw new IllegalArgumentException("Deck não encontrado. Confira o link.");
            if (status == 401 || status == 403) throw new IllegalArgumentException("O site não liberou este deck. Ele precisa ser público; se for, cole a lista em texto.");
            if (status >= 400) throw new IllegalArgumentException("O site respondeu com erro (" + status + "). Tente de novo ou cole a lista em texto.");
            String body = response.body();
            if (body == null || body.isBlank()) throw new IllegalArgumentException("O site devolveu um deck vazio.");
            if (body.length() > MAX_BYTES) throw new IllegalArgumentException("Deck grande demais para importar por link.");
            return body;
        });
    }
}
