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

/** A mesa no PC entra pela conta do site: código, confirmação com a sessão do site e a sessão nova do PC. */
public class AccountLinksTest {
    @Rule public TemporaryFolder tmp = new TemporaryFolder();
    private static final String CLIENT = "cliente-teste.apps.googleusercontent.com";
    private static final KeyPair GOOGLE = keys();
    private final AtomicLong now = new AtomicLong(1_800_000_000_000L);
    private int ips;

    private static KeyPair keys() {
        try { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(2048); return g.generateKeyPair(); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }

    private Accounts accounts() throws IOException {
        GoogleIdToken google = new GoogleIdToken(CLIENT, kid -> "k1".equals(kid) ? GOOGLE.getPublic() : null, now::get);
        return new Accounts(tmp.getRoot().toPath().resolve("contas"), google, now::get);
    }

    private static String b64(String json) { return Base64.getUrlEncoder().withoutPadding().encodeToString(json.getBytes(StandardCharsets.UTF_8)); }

    private String idToken(String sub) {
        JsonObject c = new JsonObject();
        c.addProperty("iss", "https://accounts.google.com"); c.addProperty("aud", CLIENT); c.addProperty("sub", sub);
        c.addProperty("iat", now.get() / 1000); c.addProperty("exp", now.get() / 1000 + 3600);
        c.addProperty("given_name", "Kassio");
        try {
            String signed = b64("{\"alg\":\"RS256\",\"kid\":\"k1\",\"typ\":\"JWT\"}") + "." + b64(c.toString());
            Signature rsa = Signature.getInstance("SHA256withRSA");
            rsa.initSign(GOOGLE.getPrivate());
            rsa.update(signed.getBytes(StandardCharsets.US_ASCII));
            return signed + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(rsa.sign());
        } catch (Exception e) { throw new IllegalStateException(e); }
    }

    private static byte[] body(String key, String value) { JsonObject o = new JsonObject(); o.addProperty(key, value); return o.toString().getBytes(StandardCharsets.UTF_8); }
    private static JsonObject json(Admin.Response r) { return JsonParser.parseString(new String(r.body(), StandardCharsets.UTF_8)).getAsJsonObject(); }

    /** Entra no site (cada um de um IP, para o limite de logins não interferir); devolve o cabeçalho Authorization. */
    private String web(Accounts a, String sub) {
        Admin.Response r = a.handle("POST", "entrar", null, body("credential", idToken(sub)), "10.0.0." + ips++);
        assertEquals(200, r.status());
        return "Bearer " + json(r).get("token").getAsString();
    }

    private static JsonObject start(Accounts a, String ip) {
        Admin.Response r = a.handle("POST", "vincular/iniciar", null, new byte[0], ip);
        assertEquals(new String(r.body(), StandardCharsets.UTF_8), 200, r.status());
        return json(r);
    }

    private static Admin.Response poll(Accounts a, String poll) { return a.handle("POST", "vincular/estado", null, body("poll", poll), "pc"); }
    private static Admin.Response confirm(Accounts a, String auth, String code) { return a.handle("POST", "vincular/confirmar", auth, body("codigo", code), "site"); }

    @Test public void thePcGetsItsOwnSessionAfterTheSiteConfirms() throws IOException {
        Accounts a = accounts();
        String site = web(a, "77");
        JsonObject link = start(a, "pc");
        String code = link.get("codigo").getAsString(), secret = link.get("poll").getAsString();
        assertTrue(code, code.matches("[" + AccountLinks.ALPHABET + "]{8}"));
        assertEquals("/vincular?codigo=" + code, link.get("url").getAsString());
        assertEquals(600, link.get("expiresIn").getAsInt());

        JsonObject waiting = json(poll(a, secret));
        assertEquals("esperando", waiting.get("estado").getAsString());
        assertFalse(waiting.has("token"));

        // O jogador pode digitar com hífen e em minúsculas.
        String typed = code.substring(0, 4).toLowerCase() + "-" + code.substring(4);
        assertEquals(200, confirm(a, site, typed).status());
        Admin.Response linked = poll(a, secret);
        assertEquals(200, linked.status());
        JsonObject session = json(linked);
        assertEquals("ligado", session.get("estado").getAsString());
        assertEquals("Kassio", session.getAsJsonObject("conta").get("apelido").getAsString());
        assertEquals(Accounts.accountId("77"), session.getAsJsonObject("conta").get("id").getAsString());
        assertTrue(session.get("expiresAt").getAsString().endsWith("Z"));
        String pc = "Bearer " + session.get("token").getAsString();
        assertNotEquals("a session of its own", site, pc);
        assertEquals(200, a.handle("GET", "eu", pc, new byte[0], "ip").status());
        assertFalse("only the hash on disk", Files.readString(a.dir().resolve("sessoes.json")).contains(pc.substring(7)));

        assertEquals("single use", 410, poll(a, secret).status());
        assertEquals("single use", 404, confirm(a, site, code).status());

        // Sair da mesa no PC encerra só a sessão dela.
        assertEquals(200, a.handle("POST", "sair", pc, new byte[0], "ip").status());
        assertEquals(401, a.handle("GET", "eu", pc, new byte[0], "ip").status());
        assertEquals(200, a.handle("GET", "eu", site, new byte[0], "ip").status());
    }

    @Test public void confirmingNeedsAValidSiteSession() throws IOException {
        Accounts a = accounts();
        JsonObject link = start(a, "pc");
        String code = link.get("codigo").getAsString();
        assertEquals(401, confirm(a, null, code).status());
        assertEquals(401, confirm(a, "Bearer inventado", code).status());
        // O poll não serve como sessão.
        assertEquals(401, confirm(a, "Bearer " + link.get("poll").getAsString(), code).status());
        assertEquals("still waiting", "esperando", json(poll(a, link.get("poll").getAsString())).get("estado").getAsString());
    }

    @Test public void codesExpireAndWrongSecretsGetNothing() throws IOException {
        Accounts a = accounts();
        String site = web(a, "78");
        JsonObject link = start(a, "pc");
        String code = link.get("codigo").getAsString(), secret = link.get("poll").getAsString();
        assertEquals(410, poll(a, "0".repeat(64)).status());
        assertEquals(410, a.handle("POST", "vincular/estado", null, "{}".getBytes(StandardCharsets.UTF_8), "pc").status());
        assertEquals(404, confirm(a, site, "ZZZZZZZZ").status());
        assertEquals(404, confirm(a, site, "curto").status());
        assertEquals(405, a.handle("GET", "vincular/iniciar", null, new byte[0], "pc").status());

        now.addAndGet(AccountLinks.TTL);
        assertEquals(404, confirm(a, site, code).status());
        assertEquals(410, poll(a, secret).status());

        // Confirmado, mas a mesa só pergunta depois de vencer: não ganha a sessão.
        JsonObject late = start(a, "pc");
        assertEquals(200, confirm(a, site, late.get("codigo").getAsString()).status());
        now.addAndGet(AccountLinks.TTL + 1);
        assertEquals(410, poll(a, late.get("poll").getAsString()).status());
    }

    @Test public void anotherAccountCannotTakeAConfirmedCode() throws IOException {
        Accounts a = accounts();
        String ana = web(a, "80"), bia = web(a, "81");
        JsonObject link = start(a, "pc");
        String code = link.get("codigo").getAsString();
        assertEquals(200, confirm(a, ana, code).status());
        assertEquals("same account twice is fine", 200, confirm(a, ana, code).status());
        assertEquals(409, confirm(a, bia, code).status());
        assertEquals(Accounts.accountId("80"), json(poll(a, link.get("poll").getAsString())).getAsJsonObject("conta").get("id").getAsString());
    }

    @Test public void cancellingFromThePcEndsTheCode() throws IOException {
        Accounts a = accounts();
        String site = web(a, "82");
        JsonObject link = start(a, "pc");
        assertEquals(200, a.handle("POST", "vincular/cancelar", null, body("poll", link.get("poll").getAsString()), "pc").status());
        assertEquals(404, confirm(a, site, link.get("codigo").getAsString()).status());
        assertEquals(410, poll(a, link.get("poll").getAsString()).status());
        assertEquals("cancelling twice is harmless", 200, a.handle("POST", "vincular/cancelar", null, body("poll", "nada"), "pc").status());
    }

    @Test public void refusingOnTheSiteEndsTheCode() throws IOException {
        Accounts a = accounts();
        String site = web(a, "85"), other = web(a, "86");
        JsonObject link = start(a, "pc");
        String code = link.get("codigo").getAsString();
        assertEquals(401, a.handle("POST", "vincular/recusar", null, body("codigo", code), "site").status());
        assertEquals(200, a.handle("POST", "vincular/recusar", site, body("codigo", code), "site").status());
        assertEquals(410, poll(a, link.get("poll").getAsString()).status());
        assertEquals(404, confirm(a, site, code).status());

        // Já confirmado por outra conta: recusar não tira a sessão de quem confirmou.
        JsonObject taken = start(a, "pc");
        assertEquals(200, confirm(a, other, taken.get("codigo").getAsString()).status());
        assertEquals(409, a.handle("POST", "vincular/recusar", site, body("codigo", taken.get("codigo").getAsString()), "site").status());
        assertEquals("ligado", json(poll(a, taken.get("poll").getAsString())).get("estado").getAsString());
    }

    @Test public void deletingTheAccountBeforeThePcAsksGivesNoSession() throws IOException {
        Accounts a = accounts();
        String site = web(a, "83");
        JsonObject link = start(a, "pc");
        assertEquals(200, confirm(a, site, link.get("codigo").getAsString()).status());
        assertEquals(200, a.handle("DELETE", "conta", site, new byte[0], "ip").status());
        assertEquals(410, poll(a, link.get("poll").getAsString()).status());
    }

    @Test public void startsPollsAndConfirmsAreLimitedPerIp() throws IOException {
        Accounts a = accounts();
        for (int i = 0; i < AccountLinks.MAX_STARTS; i++) start(a, "6.6.6.6");
        assertEquals(429, a.handle("POST", "vincular/iniciar", null, new byte[0], "6.6.6.6").status());
        assertEquals(200, a.handle("POST", "vincular/iniciar", null, new byte[0], "7.7.7.7").status());
        now.addAndGet(AccountLinks.START_WINDOW);
        assertEquals(200, a.handle("POST", "vincular/iniciar", null, new byte[0], "6.6.6.6").status());

        String secret = start(a, "8.8.8.8").get("poll").getAsString();
        for (int i = 0; i < AccountLinks.MAX_POLLS; i++) assertEquals(200, a.handle("POST", "vincular/estado", null, body("poll", secret), "9.9.9.9").status());
        assertEquals(429, a.handle("POST", "vincular/estado", null, body("poll", secret), "9.9.9.9").status());

        String site = web(a, "84");
        for (int i = 0; i < AccountLinks.MAX_CONFIRMS; i++) a.handle("POST", "vincular/confirmar", site, body("codigo", "ZZZZZZZZ"), "5.5.5.5");
        assertEquals(429, a.handle("POST", "vincular/confirmar", site, body("codigo", "ZZZZZZZZ"), "5.5.5.5").status());
    }

    @Test public void codesAreReadable() {
        assertEquals("ABCDEFGH", AccountLinks.normalize("abcd-efgh"));
        assertEquals("ABCDEFGH", AccountLinks.normalize(" ABCD EFGH "));
        assertNull(AccountLinks.normalize("ABC"));
        assertNull(AccountLinks.normalize(null));
        for (char c : "IO01".toCharArray()) assertEquals(-1, AccountLinks.ALPHABET.indexOf(c));
    }

    @Test public void withoutAccountsTheRoutesAreOff() throws IOException {
        Accounts off = new Accounts(tmp.getRoot().toPath().resolve("contas"), null, now::get);
        assertEquals(503, off.handle("POST", "vincular/iniciar", null, new byte[0], "ip").status());
    }
}
