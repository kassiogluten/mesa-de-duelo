package mesadeduelo.bridge;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Busca a lista pública de um deck no Moxfield ou no Archidekt, ou o deck médio de um comandante no EDHREC,
 * para o navegador, que não pode chamar essas APIs direto (CORS). Só esses sites: o navegador manda o site e o
 * id (no EDHREC, o slug do comandante), e o endereço é montado aqui, para a ponte nunca virar um proxy para
 * endereços quaisquer. A conversão para lista fica no frontend.
 */
final class DeckLinks {
    private static final Pattern MOXFIELD_ID = Pattern.compile("[A-Za-z0-9_-]{4,64}");
    private static final Pattern ARCHIDEKT_ID = Pattern.compile("\\d{1,12}");
    /** Slug do comandante (ou da dupla), com uma variação opcional: {@code atraxa-praetors-voice/budget}. */
    private static final Pattern EDHREC_SLUG = Pattern.compile("[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)?");
    /** Dupla de parceiros na ordem inversa: o EDHREC responde só com o endereço da ordem dele. */
    private static final Pattern EDHREC_REDIRECT = Pattern.compile("/average-decks/(.+)");
    private static final int MAX_SLUG = 160;
    private static final int MAX_BYTES = 4 * 1024 * 1024;
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8)).followRedirects(HttpClient.Redirect.NORMAL).build();

    private DeckLinks() {}

    static boolean validEdhrecSlug(String slug) {
        return slug != null && slug.length() <= MAX_SLUG && EDHREC_SLUG.matcher(slug).matches();
    }

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
            case "edhrec" -> {
                if (!validEdhrecSlug(id)) throw new IllegalArgumentException("Comandante inválido para o EDHREC.");
                yield URI.create("https://json.edhrec.com/pages/average-decks/" + id + ".json");
            }
            default -> throw new IllegalArgumentException("Só dá para importar links do Moxfield, do Archidekt ou do EDHREC.");
        };
    }

    /** Slug para onde o EDHREC manda ({@code {"redirect":"/average-decks/…"}}), ou null se a resposta já é o deck. */
    static String edhrecRedirect(String body) {
        if (body == null || body.length() > 512 || !body.contains("\"redirect\"")) return null;
        try {
            JsonElement json = JsonParser.parseString(body);
            if (!json.isJsonObject()) return null;
            JsonObject object = json.getAsJsonObject();
            if (object.has("deck") || !object.has("redirect") || !object.get("redirect").isJsonPrimitive()) return null;
            Matcher m = EDHREC_REDIRECT.matcher(object.get("redirect").getAsString());
            if (!m.matches() || !validEdhrecSlug(m.group(1))) throw new IllegalArgumentException("O EDHREC devolveu um endereço inesperado.");
            return m.group(1);
        } catch (RuntimeException e) {
            if (e instanceof IllegalArgumentException) throw e;
            return null;
        }
    }

    /** Corpo JSON da API do site; falha com uma mensagem pronta para o jogador. */
    static CompletableFuture<String> fetch(String site, String id) {
        if ("edhrec".equals(site)) return fetchEdhrec(id, 1);
        return get(uri(site, id)).thenApply(response -> {
            int status = response.statusCode();
            if (status == 404) throw new IllegalArgumentException("Deck não encontrado. Confira o link.");
            if (status == 401 || status == 403) throw new IllegalArgumentException("O site não liberou este deck. Ele precisa ser público; se for, cole a lista em texto.");
            if (status >= 400) throw new IllegalArgumentException("O site respondeu com erro (" + status + "). Tente de novo ou cole a lista em texto.");
            return body(response, "O site devolveu um deck vazio.", "Deck grande demais para importar por link.");
        });
    }

    /** O EDHREC responde 403 (e não 404) para comandante sem deck médio; segue no máximo um redirecionamento de parceiros. */
    private static CompletableFuture<String> fetchEdhrec(String slug, int redirectsLeft) {
        return get(uri("edhrec", slug)).thenCompose(response -> {
            int status = response.statusCode();
            if (status == 403 || status == 404) throw new IllegalArgumentException("O EDHREC não tem deck médio para este comandante. Confira o nome em inglês, como aparece na carta.");
            if (status >= 400) throw new IllegalArgumentException("O EDHREC respondeu com erro (" + status + "). Tente de novo mais tarde.");
            String body = body(response, "O EDHREC devolveu um deck vazio.", "Resposta grande demais do EDHREC.");
            String next = edhrecRedirect(body);
            if (next == null) return CompletableFuture.completedFuture(body);
            if (redirectsLeft <= 0 || next.equals(slug)) throw new IllegalArgumentException("O EDHREC não tem deck médio para este comandante.");
            return fetchEdhrec(next, redirectsLeft - 1);
        });
    }

    private static CompletableFuture<HttpResponse<String>> get(URI uri) {
        HttpRequest request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(12))
                .header("Accept", "application/json")
                .header("User-Agent", "MesaDeDuelo/0.1 (+deck import)").GET().build();
        return HTTP.sendAsync(request, HttpResponse.BodyHandlers.ofString());
    }

    private static String body(HttpResponse<String> response, String empty, String tooLarge) {
        String body = response.body();
        if (body == null || body.isBlank()) throw new IllegalArgumentException(empty);
        if (body.length() > MAX_BYTES) throw new IllegalArgumentException(tooLarge);
        return body;
    }
}
