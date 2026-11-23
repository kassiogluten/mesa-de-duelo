package mesadeduelo.bridge;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;
import java.util.function.LongSupplier;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import io.micrometer.core.instrument.Counter;

import mesadeduelo.bridge.Admin.Response;

/**
 * Vincular a mesa no PC à conta pelo site, como se entra num app de TV, em /api/conta/vincular/.
 *
 * A mesa no PC não consegue um ID token do Google para o client ID do site, então pega emprestado o login do site:
 *
 *   POST iniciar                 (mesa no PC)  → {codigo, poll, url, expiresIn}
 *   POST confirmar {codigo}      (site, com a sessão da conta) → {}
 *   POST estado {poll}           (mesa no PC, a cada ~2 s) → {estado: "esperando", expiresIn}
 *                                              ou {estado: "ligado", token, expiresAt, conta} (uma vez só)
 *   POST cancelar {poll}         (mesa no PC)  → {}
 *   POST recusar {codigo}        (site, com a sessão: "Não fui eu") → {}; a mesa que pediu vê o código vencido
 *
 * O código é curto e legível (aparece nas duas telas para o jogador comparar), vence em 10 minutos e serve uma vez.
 * O {@code poll} é o segredo que só a mesa no PC conhece: vai no corpo (nunca no endereço, que cai em logs) e aqui
 * fica só o hash dele. A sessão nova nasce na primeira consulta depois da confirmação, como as outras de
 * {@link Accounts}: só o hash do token em disco, e "sair" a invalida. Tudo isso fica só na memória: um reinício da
 * ponte perde os vínculos em andamento, e a mesa pede outro código.
 */
final class AccountLinks {
    static final long TTL = 10 * 60_000L;
    /** Sem I, O, 0 e 1, que se confundem na tela. */
    static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    static final int CODE_LENGTH = 8;
    static final int MAX_PENDING = 2000;
    static final int MAX_STARTS = 10;
    static final long START_WINDOW = 10 * 60_000L;
    /** A mesa pergunta a cada 2 s (30 por minuto): sobra para duas mesas atrás do mesmo IP. */
    static final int MAX_POLLS = 75;
    static final long POLL_WINDOW = 60_000L;
    static final int MAX_CONFIRMS = 20;
    static final long CONFIRM_WINDOW = 15 * 60_000L;

    /** O que a conta precisa oferecer: quem é o dono de um token e uma sessão nova para uma conta. */
    interface Sessions {
        /** A conta do cabeçalho Authorization ("Bearer …"); null sem sessão válida. */
        String account(String authorization) throws IOException;
        /** Uma sessão nova da conta ({token, expiresAt, conta}); null se a conta não existe mais. */
        JsonObject open(String account) throws IOException;
    }

    private static final class Link {
        final String code, pollHash;
        final long expires;
        String account;
        Link(String code, String pollHash, long expires) { this.code = code; this.pollHash = pollHash; this.expires = expires; }
    }

    private final Sessions sessions;
    private final LongSupplier clock;
    private final SecureRandom random = new SecureRandom();
    private final FeedbackRateLimit starts = new FeedbackRateLimit(MAX_STARTS, START_WINDOW);
    private final FeedbackRateLimit polls = new FeedbackRateLimit(MAX_POLLS, POLL_WINDOW);
    private final FeedbackRateLimit confirms = new FeedbackRateLimit(MAX_CONFIRMS, CONFIRM_WINDOW);
    /** código → vínculo; e hash do poll → código. */
    private final Map<String, Link> byCode = new HashMap<>();
    private final Map<String, String> byPoll = new HashMap<>();

    AccountLinks(Sessions sessions, LongSupplier clock) { this.sessions = sessions; this.clock = clock; }

    synchronized int pending() { prune(clock.getAsLong()); return byCode.size(); }

    /** {@code path} é o que vem depois de /api/conta/vincular/. */
    Response handle(String method, String path, String authorization, byte[] body, String ip) throws IOException {
        if (!"POST".equals(method)) return Response.error(405, "Use POST.");
        return switch (path) {
            case "iniciar" -> start(ip);
            case "estado" -> poll(field(body, "poll"), ip);
            case "cancelar" -> cancel(field(body, "poll"));
            case "confirmar" -> confirm(authorization, field(body, "codigo"), ip, true);
            case "recusar" -> confirm(authorization, field(body, "codigo"), ip, false);
            default -> Response.error(404, "Rota desconhecida das contas.");
        };
    }

    private Response start(String ip) {
        long now = clock.getAsLong();
        String key = starts.key(ip);
        if (starts.exceeded(key, now)) { counter("limite").increment(); return Response.error(429, "Muitos pedidos de código. Espere alguns minutos e tente de novo."); }
        starts.record(key, now);
        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String poll = HexFormat.of().formatHex(raw);
        String code;
        synchronized (this) {
            prune(now);
            if (byCode.size() >= MAX_PENDING) return Response.error(503, "O servidor está ocupado. Tente de novo em instantes.");
            do code = newCode(); while (byCode.containsKey(code));
            Link link = new Link(code, hash(poll), now + TTL);
            byCode.put(code, link);
            byPoll.put(link.pollHash, code);
        }
        counter("iniciado").increment();
        JsonObject o = new JsonObject();
        o.addProperty("codigo", code);
        o.addProperty("poll", poll);
        o.addProperty("url", "/vincular?codigo=" + code);
        o.addProperty("expiresIn", TTL / 1000);
        return Response.json(200, o);
    }

    private Response poll(String poll, String ip) throws IOException {
        long now = clock.getAsLong();
        String key = polls.key(ip);
        if (polls.exceeded(key, now)) return Response.error(429, "Calma: a mesa perguntou rápido demais. Tente de novo em instantes.");
        polls.record(key, now);
        String account;
        synchronized (this) {
            prune(now);
            Link link = poll == null ? null : linkOfPoll(poll);
            if (link == null) return gone();
            if (link.account == null) {
                JsonObject o = new JsonObject();
                o.addProperty("estado", "esperando");
                o.addProperty("expiresIn", Math.max(0, (link.expires - now) / 1000));
                return Response.json(200, o);
            }
            // Uma vez só: a sessão sai nesta resposta e o vínculo some.
            remove(link);
            account = link.account;
        }
        JsonObject session = sessions.open(account);
        if (session == null) return Response.error(410, "A conta não existe mais. Entre de novo.");
        counter("ligado").increment();
        session.addProperty("estado", "ligado");
        return Response.json(200, session);
    }

    private synchronized Response cancel(String poll) {
        Link link = poll == null ? null : linkOfPoll(poll);
        if (link != null) remove(link);
        return Response.json(200, new JsonObject());
    }

    /** Confirma ({@code accept}) ou recusa o código; recusar não mexe num código que outra conta já confirmou. */
    private Response confirm(String authorization, String rawCode, String ip, boolean accept) throws IOException {
        long now = clock.getAsLong();
        String key = confirms.key(ip);
        if (confirms.exceeded(key, now)) { counter("limite").increment(); return Response.error(429, "Muitas tentativas. Espere 15 minutos e tente de novo."); }
        confirms.record(key, now);
        String account = sessions.account(authorization);
        if (account == null) return Response.error(401, "Entre de novo: a sessão acabou.");
        String code = normalize(rawCode);
        synchronized (this) {
            prune(now);
            Link link = code == null ? null : byCode.get(code);
            if (link == null) return Response.error(404, "Esse código não vale mais. Confira o código na mesa do PC ou peça outro por lá.");
            if (link.account != null && !link.account.equals(account)) return Response.error(409, "Esse código já foi usado. Peça outro na mesa do PC.");
            if (accept) link.account = account; else remove(link);
        }
        counter(accept ? "confirmado" : "recusado").increment();
        return Response.json(200, new JsonObject());
    }

    /** O código como o jogador pode ter digitado: maiúsculas, sem hífen nem espaços. */
    static String normalize(String code) {
        if (code == null) return null;
        String c = code.toUpperCase(java.util.Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        return c.length() == CODE_LENGTH ? c : null;
    }

    private Link linkOfPoll(String poll) {
        String code = byPoll.get(hash(poll));
        return code == null ? null : byCode.get(code);
    }

    private void remove(Link link) {
        byCode.remove(link.code);
        byPoll.remove(link.pollHash);
    }

    private void prune(long now) {
        byCode.values().removeIf(l -> {
            if (l.expires > now) return false;
            byPoll.remove(l.pollHash);
            return true;
        });
    }

    private String newCode() {
        StringBuilder b = new StringBuilder(CODE_LENGTH);
        for (int i = 0; i < CODE_LENGTH; i++) b.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        return b.toString();
    }

    private static Response gone() { return Response.error(410, "O código venceu. Peça outro na mesa."); }

    private static String field(byte[] body, String name) {
        try { return JsonParser.parseString(new String(body, StandardCharsets.UTF_8)).getAsJsonObject().get(name).getAsString(); }
        catch (RuntimeException e) { return null; }
    }

    private static String hash(String text) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    static Counter counter(String result) {
        return Counter.builder("mesa.accounts.links").description("Mesas no PC vinculadas pelo site: iniciado, confirmado, recusado, ligado ou limite")
            .tags("result", result).register(Metrics.REGISTRY);
    }
}
