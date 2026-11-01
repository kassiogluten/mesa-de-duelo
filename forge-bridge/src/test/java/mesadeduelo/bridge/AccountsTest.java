package mesadeduelo.bridge;

import static org.junit.Assert.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicLong;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class AccountsTest {
    @Rule public TemporaryFolder tmp = new TemporaryFolder();
    private static final String CLIENT = "cliente-teste.apps.googleusercontent.com";
    private static final KeyPair GOOGLE = keys(), OTHER = keys();
    private final AtomicLong now = new AtomicLong(1_800_000_000_000L);

    private static KeyPair keys() {
        try { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(2048); return g.generateKeyPair(); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }

    private Accounts accounts() throws IOException {
        GoogleIdToken google = new GoogleIdToken(CLIENT, kid -> "k1".equals(kid) ? GOOGLE.getPublic() : null, now::get);
        return new Accounts(tmp.getRoot().toPath().resolve("contas"), google, now::get);
    }

    private static String b64(String json) { return Base64.getUrlEncoder().withoutPadding().encodeToString(json.getBytes(StandardCharsets.UTF_8)); }

    /** Um ID token como o do Google, assinado com {@code key}. */
    private String token(KeyPair key, String kid, JsonObject claims) {
        try {
            String signed = b64("{\"alg\":\"RS256\",\"kid\":\"" + kid + "\",\"typ\":\"JWT\"}") + "." + b64(claims.toString());
            Signature rsa = Signature.getInstance("SHA256withRSA");
            rsa.initSign(key.getPrivate());
            rsa.update(signed.getBytes(StandardCharsets.US_ASCII));
            return signed + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(rsa.sign());
        } catch (Exception e) { throw new IllegalStateException(e); }
    }

    private JsonObject claims(String sub) {
        JsonObject c = new JsonObject();
        c.addProperty("iss", "https://accounts.google.com"); c.addProperty("aud", CLIENT); c.addProperty("sub", sub);
        c.addProperty("iat", now.get() / 1000); c.addProperty("exp", now.get() / 1000 + 3600);
        c.addProperty("given_name", "Kassio"); c.addProperty("name", "Kassio Completo"); c.addProperty("email", "k@exemplo.com");
        c.addProperty("picture", "https://lh3.googleusercontent.com/a/foto=s96-c");
        return c;
    }

    private static byte[] login(String credential) { return ("{\"credential\":\"" + credential + "\"}").getBytes(StandardCharsets.UTF_8); }
    private static JsonObject json(Admin.Response r) { return JsonParser.parseString(new String(r.body(), StandardCharsets.UTF_8)).getAsJsonObject(); }

    private int ips;

    /** Cada login vem de um IP diferente, para o limite por IP não interferir. */
    private String enter(Accounts a, String sub) {
        Admin.Response r = a.handle("POST", "entrar", null, login(token(GOOGLE, "k1", claims(sub))), "10.0.0." + ips++);
        assertEquals(new String(r.body(), StandardCharsets.UTF_8), 200, r.status());
        return "Bearer " + json(r).get("token").getAsString();
    }

    @Test public void withoutAClientIdAccountsAreOff() throws IOException {
        Accounts a = new Accounts(tmp.getRoot().toPath().resolve("contas"), null, now::get);
        assertFalse(a.enabled());
        assertEquals(503, a.handle("POST", "entrar", null, login("x"), "ip").status());
    }

    @Test public void loginCreatesTheAccountWithOnlyTheMinimumData() throws IOException {
        Accounts a = accounts();
        Admin.Response r = a.handle("POST", "entrar", null, login(token(GOOGLE, "k1", claims("123"))), "1.2.3.4");
        assertEquals(200, r.status());
        JsonObject account = json(r).getAsJsonObject("conta");
        assertEquals("Kassio", account.get("nome").getAsString());
        assertEquals("Kassio", account.get("apelido").getAsString());
        assertEquals("https://lh3.googleusercontent.com/a/foto=s96-c", account.get("foto").getAsString());
        assertEquals(1, a.count());
        assertEquals(Accounts.accountId("123"), account.get("id").getAsString());

        String file = Files.readString(a.dir().resolve(Accounts.accountId("123") + ".json"));
        assertFalse("no e-mail on disk", file.contains("k@exemplo.com"));
        assertFalse("no full name on disk", file.contains("Completo"));
        assertFalse("no Google id on disk", file.contains("\"123\""));
        String token = json(r).get("token").getAsString();
        assertFalse("only the token hash on disk", Files.readString(a.dir().resolve("sessoes.json")).contains(token));

        assertEquals("Kassio", json(a.handle("GET", "eu", "Bearer " + token, new byte[0], "ip")).getAsJsonObject("conta").get("apelido").getAsString());
        enter(a, "123");
        assertEquals("same Google account, same file", 1, a.count());
    }

    @Test public void rejectsForgedExpiredAndForeignTokens() throws IOException {
        Accounts a = accounts();
        assertEquals("other key", 401, a.handle("POST", "entrar", null, login(token(OTHER, "k1", claims("1"))), "ip").status());
        assertEquals("unknown kid", 401, a.handle("POST", "entrar", null, login(token(GOOGLE, "k9", claims("1"))), "ip").status());
        JsonObject foreign = claims("1"); foreign.addProperty("aud", "outro-app");
        assertEquals("other app", 401, a.handle("POST", "entrar", null, login(token(GOOGLE, "k1", foreign)), "ip").status());
        JsonObject issuer = claims("1"); issuer.addProperty("iss", "https://malicioso.example");
        assertEquals("other issuer", 401, a.handle("POST", "entrar", null, login(token(GOOGLE, "k1", issuer)), "ip").status());
        JsonObject expired = claims("1"); expired.addProperty("exp", now.get() / 1000 - 120);
        assertEquals("expired", 401, a.handle("POST", "entrar", null, login(token(GOOGLE, "k1", expired)), "ip").status());
        String good = token(GOOGLE, "k1", claims("1"));
        String tampered = good.substring(0, good.indexOf('.') + 1) + b64(claims("2").toString()) + good.substring(good.lastIndexOf('.'));
        assertEquals("tampered payload", 401, a.handle("POST", "entrar", null, login(tampered), "ip").status());
        assertEquals("garbage", 401, a.handle("POST", "entrar", null, login("nada"), "ip").status());
        assertEquals("no credential", 400, a.handle("POST", "entrar", null, "{}".getBytes(StandardCharsets.UTF_8), "ip").status());
        assertEquals(0, a.count());
    }

    @Test public void picturesFromOutsideGoogleAreDropped() {
        assertNull(Accounts.picture("https://exemplo.com/foto.png"));
        assertNull(Accounts.picture("javascript:alert(1)"));
        assertNull(Accounts.picture("https://lh3.googleusercontent.com.exemplo.com/x"));
        assertNotNull(Accounts.picture("https://lh3.googleusercontent.com/a/ACg8=s96-c"));
    }

    @Test public void sessionsSurviveARestartRenewAndExpire() throws IOException {
        Accounts a = accounts();
        String auth = enter(a, "7");
        Accounts restarted = accounts();
        assertEquals(200, restarted.handle("GET", "eu", auth, new byte[0], "ip").status());
        assertEquals(1, restarted.count());

        now.addAndGet(Accounts.SESSION_MILLIS - 1000);
        assertEquals("used before the end: renewed", 200, restarted.handle("GET", "eu", auth, new byte[0], "ip").status());
        now.addAndGet(Accounts.SESSION_MILLIS - 1000);
        assertEquals(200, accounts().handle("GET", "eu", auth, new byte[0], "ip").status());
        now.addAndGet(Accounts.SESSION_MILLIS + 1);
        assertEquals(401, accounts().handle("GET", "eu", auth, new byte[0], "ip").status());
        assertEquals(401, a.handle("GET", "eu", "Bearer inventado", new byte[0], "ip").status());
    }

    @Test public void logoutEndsOnlyThatSessionAndDeleteEndsAll() throws IOException {
        Accounts a = accounts();
        String phone = enter(a, "9"), laptop = enter(a, "9"), stranger = enter(a, "10");
        assertEquals(200, a.handle("POST", "sair", phone, new byte[0], "ip").status());
        assertEquals(401, a.handle("GET", "eu", phone, new byte[0], "ip").status());
        assertEquals(200, a.handle("GET", "eu", laptop, new byte[0], "ip").status());

        String again = enter(a, "9");
        assertEquals(200, a.handle("DELETE", "conta", again, new byte[0], "ip").status());
        assertEquals(401, a.handle("GET", "eu", laptop, new byte[0], "ip").status());
        assertFalse(Files.exists(a.dir().resolve(Accounts.accountId("9") + ".json")));
        assertEquals(1, a.count());
        assertEquals("other accounts untouched", 200, a.handle("GET", "eu", stranger, new byte[0], "ip").status());
    }

    @Test public void oldestSessionsGoWhenAnAccountHasTooMany() throws IOException {
        Accounts a = accounts();
        String first = enter(a, "5");
        for (int i = 1; i < Accounts.MAX_SESSIONS_PER_ACCOUNT; i++) { now.addAndGet(1000); enter(a, "5"); }
        assertEquals(200, a.handle("GET", "eu", first, new byte[0], "ip").status());
        now.addAndGet(1000);
        enter(a, "5");
        assertEquals(401, a.handle("GET", "eu", first, new byte[0], "ip").status());
        assertEquals(Accounts.MAX_SESSIONS_PER_ACCOUNT, a.sessionCount());
    }

    @Test public void tooManyLoginsFromOneIpAreLimited() throws IOException {
        Accounts a = accounts();
        for (int i = 0; i < Accounts.MAX_LOGINS; i++) a.handle("POST", "entrar", null, login("nada"), "6.6.6.6");
        assertEquals(429, a.handle("POST", "entrar", null, login(token(GOOGLE, "k1", claims("1"))), "6.6.6.6").status());
        assertEquals(200, a.handle("POST", "entrar", null, login(token(GOOGLE, "k1", claims("1"))), "7.7.7.7").status());
        now.addAndGet(Accounts.LOGIN_WINDOW);
        assertEquals(200, a.handle("POST", "entrar", null, login(token(GOOGLE, "k1", claims("1"))), "6.6.6.6").status());
    }

    @Test public void parsesGoogleJwks() throws Exception {
        var pub = (java.security.interfaces.RSAPublicKey) GOOGLE.getPublic();
        Base64.Encoder enc = Base64.getUrlEncoder().withoutPadding();
        JsonObject jwk = new JsonObject();
        jwk.addProperty("kid", "abc"); jwk.addProperty("kty", "RSA"); jwk.addProperty("alg", "RS256");
        jwk.addProperty("n", enc.encodeToString(pub.getModulus().toByteArray())); jwk.addProperty("e", enc.encodeToString(pub.getPublicExponent().toByteArray()));
        JsonObject jwks = new JsonObject(); var list = new com.google.gson.JsonArray(); list.add(jwk); jwks.add("keys", list);
        assertEquals(pub, GoogleIdToken.GoogleKeys.parse(jwks).get("abc"));
    }

    @Test public void adminSeesOnlyTheCounts() throws IOException {
        Accounts a = accounts();
        enter(a, "1"); enter(a, "1"); enter(a, "2");
        Admin admin = new Admin(new FeedbackStore(tmp.getRoot().toPath().resolve("relatos"), 1L << 30, java.time.Duration.ofDays(90), 0), com.google.gson.JsonArray::new, null, "abre-te", now::get);
        Admin.Response login = admin.handle("POST", "login", null, "{\"password\":\"abre-te\"}".getBytes(StandardCharsets.UTF_8), "ip");
        String auth = "Bearer " + json(login).get("token").getAsString();
        assertFalse("off without accounts", json(admin.handle("GET", "partidas", auth, new byte[0], "ip")).has("contas"));
        admin.accounts(a);
        JsonObject contas = json(admin.handle("GET", "partidas", auth, new byte[0], "ip")).getAsJsonObject("contas");
        assertEquals(2, contas.get("total").getAsInt());
        assertEquals(3, contas.get("aparelhos").getAsInt());
        assertEquals(2, contas.size());
    }

    @Test public void decksSyncThroughTheRoutesAndSurviveARestart() throws IOException {
        Accounts a = accounts();
        String auth = enter(a, "42");
        byte[] change = "{\"mudancas\":[{\"id\":\"d1\",\"base\":0,\"deck\":{\"id\":\"d1\",\"name\":\"Burn\",\"cards\":[{\"name\":\"Lightning Bolt\",\"count\":4}]}}]}".getBytes(StandardCharsets.UTF_8);
        Admin.Response sent = a.handle("POST", "sincronizar", auth, change, "ip");
        assertEquals(200, sent.status());
        assertEquals(1, json(sent).get("rev").getAsLong());

        Accounts restarted = accounts();
        JsonObject state = json(restarted.handle("GET", "estado", auth, new byte[0], "ip"));
        assertEquals("Burn", state.getAsJsonArray("decks").get(0).getAsJsonObject().getAsJsonObject("deck").get("name").getAsString());
        assertEquals(0, json(restarted.handle("GET", "estado/1", auth, new byte[0], "ip")).getAsJsonArray("decks").size());
        assertEquals(400, restarted.handle("GET", "estado/x", auth, new byte[0], "ip").status());
        assertEquals(400, restarted.handle("POST", "sincronizar", auth, "nada".getBytes(StandardCharsets.UTF_8), "ip").status());

        byte[] gone = "{\"mudancas\":[{\"id\":\"d1\",\"base\":1,\"apagar\":true}]}".getBytes(StandardCharsets.UTF_8);
        assertEquals(200, restarted.handle("POST", "sincronizar", auth, gone, "ip").status());
        assertEquals(1, json(restarted.handle("GET", "lixeira", auth, new byte[0], "ip")).getAsJsonArray("decks").size());
        assertEquals(200, restarted.handle("POST", "lixeira/d1/restaurar", auth, new byte[0], "ip").status());
        assertEquals(404, restarted.handle("POST", "lixeira/d1/restaurar", auth, new byte[0], "ip").status());
        assertEquals(401, restarted.handle("GET", "estado", null, new byte[0], "ip").status());

        String other = enter(restarted, "43");
        assertEquals("accounts never see each other's decks", 0, json(restarted.handle("GET", "estado", other, new byte[0], "ip")).getAsJsonArray("decks").size());
    }

    // ---------- Quem enviou o relato (item 62) ----------

    private static String report(String name) {
        return "{\"v\":1,\"kind\":\"sugestao\",\"description\":\"Mais cores\"" + (name == null ? "" : ",\"name\":" + new com.google.gson.JsonPrimitive(name)) + ",\"recording\":null}";
    }

    private static String sent(Feedback.Response r) {
        assertEquals(r.json(), 201, r.status());
        return JsonParser.parseString(r.json()).getAsJsonObject().get("code").getAsString();
    }

    private FeedbackStore feedbackStore() throws IOException { return new FeedbackStore(tmp.getRoot().toPath().resolve("fb"), 1L << 30, java.time.Duration.ofDays(90), 0); }

    @Test public void reportTakesTheNicknameAndAccountFromTheSessionNotFromTheBody() throws IOException {
        Accounts a = accounts();
        String auth = enter(a, "200");
        FeedbackStore store = feedbackStore();
        Feedback feedback = new Feedback(store, (code, token) -> null);
        feedback.authors(a::reportAuthor);

        // O corpo diz ser outra pessoa: com a sessão válida, vale a conta.
        String code = sent(feedback.handle(FeedbackTest.gzip(report("Fulano Impostor")), null, null, auth, "10.1.0.1"));
        FeedbackStore.Author author = store.entry(code).author();
        assertEquals("Kassio", author.nickname());
        assertEquals(Accounts.accountId("200"), author.account());
        assertFalse("verified, not informed", author.informed());
        JsonObject saved = FeedbackTest.stored(store, code);
        assertEquals("Kassio", saved.getAsJsonObject("author").get("nickname").getAsString());
        assertEquals(Accounts.accountId("200"), saved.getAsJsonObject("author").get("account").getAsString());
        assertFalse("the account token is not stored", saved.toString().contains(auth.substring(7)));
        assertFalse("no e-mail", saved.toString().contains("k@exemplo.com"));

        // O nome na mesa sincronizado com a conta passa à frente do apelido do Google.
        JsonObject prefs = new JsonObject(); prefs.addProperty("mesa:name", "Ana das Fadas");
        JsonObject body = new JsonObject(); body.add("mudancas", new com.google.gson.JsonArray()); body.add("prefs", prefs);
        assertEquals(200, a.handle("POST", "sincronizar", auth, body.toString().getBytes(StandardCharsets.UTF_8), "ip").status());
        assertEquals("Ana das Fadas", store.entry(sent(feedback.handle(FeedbackTest.gzip(report(null)), null, null, auth, "10.1.0.2"))).author().nickname());

        // Index survives a restart with the author.
        assertEquals(Accounts.accountId("200"), feedbackStore().entry(code).author().account());
    }

    @Test public void withoutAValidSessionTheReportKeepsOnlyTheInformedNameOrNothing() throws IOException {
        Accounts a = accounts();
        String auth = enter(a, "201");
        FeedbackStore store = feedbackStore();
        Feedback feedback = new Feedback(store, (code, token) -> null);
        feedback.authors(a::reportAuthor);

        FeedbackStore.Author informed = store.entry(sent(feedback.handle(FeedbackTest.gzip(report("  Ana\n  Maria ")), null, null, null, "10.2.0.1"))).author();
        assertEquals("Ana Maria", informed.nickname());
        assertNull(informed.account());
        assertTrue(informed.informed());

        // Um token inventado não vira conta; o nome do corpo fica como informado.
        FeedbackStore.Author forged = store.entry(sent(feedback.handle(FeedbackTest.gzip(report("Kassio")), null, null, "Bearer inventado", "10.2.0.2"))).author();
        assertNull(forged.account());
        assertTrue(forged.informed());

        // Relato da fila do aparelho com o token já vencido: vale o nome do momento em que foi escrito, sem conta.
        now.addAndGet(Accounts.SESSION_MILLIS + 1);
        FeedbackStore.Author expired = store.entry(sent(feedback.handle(FeedbackTest.gzip(report("Kassio")), null, null, auth, "10.2.0.3"))).author();
        assertEquals("Kassio", expired.nickname());
        assertNull(expired.account());
        assertTrue(expired.informed());

        assertNull("anonymous", store.entry(sent(feedback.handle(FeedbackTest.gzip(report(null)), null, null, null, "10.2.0.4"))).author());
        assertNull("blank name is anonymous", store.entry(sent(feedback.handle(FeedbackTest.gzip(report("   ")), null, null, null, "10.2.0.5"))).author());
        assertEquals("long names are cut", Feedback.MAX_NAME, Feedback.cleanName("x".repeat(80)).length());
    }

    /** Uma partida de dois jogadores no histórico: {@code seat0} e {@code seat1} são as contas (ou null), e quem venceu. */
    private static JsonObject match(String id, String endedAt, String seat0, String seat1, int winner) {
        String p0 = "{\"name\":\"Ana\",\"ai\":false," + (seat0 == null ? "" : "\"account\":\"" + seat0 + "\",\"deckId\":\"deck-elfos\",") + "\"deck\":\"Elfos\",\"colors\":\"G\",\"wins\":" + (winner == 0 ? 1 : 0) + "}";
        String p1 = "{\"name\":\"Bia\",\"ai\":false," + (seat1 == null ? "" : "\"account\":\"" + seat1 + "\",") + "\"deck\":\"Goblins\",\"colors\":\"R\",\"wins\":" + (winner == 1 ? 1 : 0) + "}";
        return JsonParser.parseString("{\"id\":\"" + id + "\",\"endedAt\":\"" + endedAt + "\",\"ms\":600000,\"format\":\"free\",\"length\":\"bo1\",\"mode\":\"rede\",\"end\":\"concluida\",\"winner\":"
            + winner + ",\"players\":[" + p0 + "," + p1 + "],\"games\":[{\"turns\":9}]}").getAsJsonObject();
    }

    private String accountOf(Accounts a, String auth) {
        return json(a.handle("GET", "eu", auth, new byte[0], "ip")).getAsJsonObject("conta").get("id").getAsString();
    }

    @Test public void myMatchesListOnlyTheAccountsOwnMatchesAndDeletingTheAccountUnlinksThem() throws IOException {
        Accounts a = accounts();
        MatchHistory history = new MatchHistory(tmp.getRoot().toPath().resolve("partidas"));
        a.history(history);
        String ana = enter(a, "301"), bia = enter(a, "302");
        String anaId = accountOf(a, ana), biaId = accountOf(a, bia);
        assertEquals("the table sends the raw token", anaId, a.accountOfToken(ana.substring(7)));
        assertNull(a.accountOfToken("inventado"));

        now.set(java.time.Instant.parse("2026-11-01T12:00:00Z").toEpochMilli());
        history.record(match("m1", "2026-10-01T10:00:00Z", anaId, biaId, 0));
        history.record(match("m2", "2026-10-02T10:00:00Z", null, biaId, 1));
        history.record(match("m3", "2026-11-01T10:00:00Z", anaId, null, 1));

        JsonObject mine = json(a.handle("GET", "partidas", ana, new byte[0], "ip"));
        assertEquals(2, mine.get("total").getAsInt());
        JsonObject newest = mine.getAsJsonArray("partidas").get(0).getAsJsonObject();
        assertEquals("m3", newest.get("id").getAsString());
        assertEquals("derrota", newest.get("resultado").getAsString());
        assertEquals("Bia", newest.getAsJsonArray("oponentes").get(0).getAsJsonObject().get("nome").getAsString());
        assertFalse("another player's account never leaves the server", mine.toString().contains(biaId));
        assertEquals(1, mine.getAsJsonObject("numeros").get("vitorias").getAsInt());

        assertEquals("filters come in the query", 1, json(a.handle("GET", "partidas?formato=free&pagina=0&periodo=7", ana, new byte[0], "ip")).get("total").getAsInt());
        assertEquals(401, a.handle("GET", "partidas", null, new byte[0], "ip").status());

        assertEquals(200, a.handle("DELETE", "conta", ana, new byte[0], "ip").status());
        assertEquals("the matches stay, without the link", 3, history.read("2026-10").size() + history.read("2026-11").size());
        assertEquals(0, history.readFor(anaId).size());
        assertEquals(2, history.readFor(biaId).size());
        String october = Files.readString(history.dir().resolve("2026-10.jsonl"));
        assertFalse(october.contains(anaId));
        assertFalse("the deck id goes with the account", october.contains("deck-elfos"));
        assertTrue(october.contains(biaId));
    }
}
