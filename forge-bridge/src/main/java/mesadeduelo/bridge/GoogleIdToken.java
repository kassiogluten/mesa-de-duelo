package mesadeduelo.bridge;

import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.RSAPublicKeySpec;
import java.time.Duration;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.function.LongSupplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * Confere o ID token (JWT) que o Google Identity Services entrega ao navegador, sem biblioteca do Google:
 * assinatura RS256 com as chaves públicas do Google, emissor, público (o client ID do jogo) e validade.
 */
final class GoogleIdToken {
    /** Quem é o jogador para o Google: {@code sub} é o id fixo da conta; o resto pode mudar a cada login. */
    record Claims(String sub, String givenName, String picture) { }

    /** Chave pública pelo {@code kid} do cabeçalho; null se não existir. */
    interface Keys { PublicKey key(String kid) throws Exception; }

    static final long SKEW_MILLIS = 60_000;

    private final String clientId;
    private final Keys keys;
    private final LongSupplier clock;

    GoogleIdToken(String clientId, Keys keys, LongSupplier clock) {
        this.clientId = clientId; this.keys = keys; this.clock = clock;
    }

    /** As claims do token, ou IllegalArgumentException com o motivo (que vai para o log, não para o jogador). */
    Claims verify(String token) {
        String[] parts = token == null ? new String[0] : token.split("\\.");
        if (parts.length != 3) throw new IllegalArgumentException("token malformado");
        JsonObject header = part(parts[0]), payload = part(parts[1]);
        if (!"RS256".equals(text(header, "alg"))) throw new IllegalArgumentException("algoritmo inesperado");
        PublicKey key;
        try { key = keys.key(text(header, "kid")); }
        catch (Exception e) { throw new IllegalStateException("Não foi possível buscar as chaves do Google: " + e.getMessage(), e); }
        if (key == null) throw new IllegalArgumentException("chave desconhecida");
        try {
            Signature rsa = Signature.getInstance("SHA256withRSA");
            rsa.initVerify(key);
            rsa.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
            if (!rsa.verify(Base64.getUrlDecoder().decode(parts[2]))) throw new IllegalArgumentException("assinatura inválida");
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new IllegalArgumentException("assinatura inválida");
        }
        String iss = text(payload, "iss");
        if (!"accounts.google.com".equals(iss) && !"https://accounts.google.com".equals(iss)) throw new IllegalArgumentException("emissor inesperado");
        if (!clientId.equals(text(payload, "aud"))) throw new IllegalArgumentException("token de outro aplicativo");
        long now = clock.getAsLong();
        if (!payload.has("exp") || payload.get("exp").getAsLong() * 1000 < now - SKEW_MILLIS) throw new IllegalArgumentException("token vencido");
        if (payload.has("iat") && payload.get("iat").getAsLong() * 1000 > now + SKEW_MILLIS) throw new IllegalArgumentException("token do futuro");
        String sub = text(payload, "sub");
        if (sub == null || sub.isBlank()) throw new IllegalArgumentException("token sem conta");
        return new Claims(sub, text(payload, "given_name"), text(payload, "picture"));
    }

    private static JsonObject part(String base64) {
        try { return JsonParser.parseString(new String(Base64.getUrlDecoder().decode(base64), StandardCharsets.UTF_8)).getAsJsonObject(); }
        catch (RuntimeException e) { throw new IllegalArgumentException("token malformado"); }
    }

    private static String text(JsonObject o, String key) {
        JsonElement e = o.get(key);
        return e != null && e.isJsonPrimitive() ? e.getAsString() : null;
    }

    /**
     * Chaves de https://www.googleapis.com/oauth2/v3/certs, guardadas pelo tempo do Cache-Control. Um kid
     * desconhecido busca de novo (o Google troca as chaves de tempos em tempos), no máximo uma vez por minuto.
     */
    static final class GoogleKeys implements Keys {
        static final URI CERTS = URI.create("https://www.googleapis.com/oauth2/v3/certs");
        private static final Pattern MAX_AGE = Pattern.compile("max-age=(\\d+)");
        private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
        private final LongSupplier clock;
        private Map<String, PublicKey> cached = Map.of();
        private long expires, lastFetch = Long.MIN_VALUE / 2;

        GoogleKeys(LongSupplier clock) { this.clock = clock; }

        @Override public synchronized PublicKey key(String kid) throws Exception {
            long now = clock.getAsLong();
            if (now >= expires || (!cached.containsKey(kid) && now - lastFetch > 60_000)) fetch(now);
            return cached.get(kid);
        }

        private void fetch(long now) throws Exception {
            lastFetch = now;
            HttpResponse<String> res = HTTP.send(HttpRequest.newBuilder(CERTS).timeout(Duration.ofSeconds(10)).GET().build(), HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 200) throw new IllegalStateException("o Google respondeu " + res.statusCode());
            cached = parse(JsonParser.parseString(res.body()).getAsJsonObject());
            Matcher m = MAX_AGE.matcher(res.headers().firstValue("Cache-Control").orElse(""));
            expires = now + (m.find() ? Long.parseLong(m.group(1)) * 1000 : 3_600_000L);
        }

        /** {"keys":[{kid, kty:"RSA", n, e}, ...]} → kid → chave. */
        static Map<String, PublicKey> parse(JsonObject jwks) throws GeneralSecurityException {
            Map<String, PublicKey> keys = new HashMap<>();
            KeyFactory rsa = KeyFactory.getInstance("RSA");
            for (JsonElement e : jwks.getAsJsonArray("keys")) {
                JsonObject k = e.getAsJsonObject();
                if (!"RSA".equals(text(k, "kty")) || text(k, "kid") == null) continue;
                BigInteger n = new BigInteger(1, Base64.getUrlDecoder().decode(text(k, "n")));
                BigInteger exp = new BigInteger(1, Base64.getUrlDecoder().decode(text(k, "e")));
                keys.put(text(k, "kid"), rsa.generatePublic(new RSAPublicKeySpec(n, exp)));
            }
            return Map.copyOf(keys);
        }
    }
}
