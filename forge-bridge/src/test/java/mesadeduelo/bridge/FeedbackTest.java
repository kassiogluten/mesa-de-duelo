package mesadeduelo.bridge;

import static org.junit.Assert.*;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class FeedbackTest {
    @Rule public TemporaryFolder tmp = new TemporaryFolder();

    static byte[] gzip(String json) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (OutputStream gz = new GZIPOutputStream(out)) { gz.write(json.getBytes(StandardCharsets.UTF_8)); }
        return out.toByteArray();
    }

    static String report(String kind, String description, String recording) {
        JsonObject o = new JsonObject();
        o.addProperty("v", 1); o.addProperty("kind", kind); o.addProperty("description", description);
        JsonObject app = new JsonObject(); app.addProperty("version", "0.31.0"); o.add("app", app);
        JsonObject match = new JsonObject(); match.addProperty("format", "commander"); o.add("match", match);
        String json = o.toString();
        return json.substring(0, json.length() - 1) + ",\"device\":{\"touch\":true},\"recording\":" + (recording == null ? "null" : recording) + "}";
    }

    private FeedbackStore store() throws IOException { return new FeedbackStore(tmp.getRoot().toPath(), 1L << 30, Duration.ofDays(90), 0); }

    static JsonObject stored(FeedbackStore store, String code) throws IOException {
        var entry = store.entries().stream().filter(e -> e.code().equals(code)).findFirst().orElseThrow();
        try (var in = new InputStreamReader(new GZIPInputStream(Files.newInputStream(store.dir().resolve(entry.path()))), StandardCharsets.UTF_8)) {
            return JsonParser.parseReader(in).getAsJsonObject();
        }
    }

    private static String code(Feedback.Response r) {
        assertEquals(r.json(), 201, r.status());
        return JsonParser.parseString(r.json()).getAsJsonObject().get("code").getAsString();
    }

    private static void error(Feedback.Response r, int status) {
        assertEquals(r.json(), status, r.status());
        String message = JsonParser.parseString(r.json()).getAsJsonObject().get("error").getAsString();
        assertFalse(message.isBlank());
    }

    @Test public void storesTheReportVerbatimAndAttachesTheJournalOnlyWithARecordingAndAValidSeat() throws IOException {
        FeedbackStore store = store();
        JsonObject journal = new JsonObject(); journal.addProperty("matchId", "abc");
        List<String[]> asked = new java.util.ArrayList<>();
        Feedback feedback = new Feedback(store, (code, token) -> { asked.add(new String[]{code, token}); return "AB12".equals(code) && "segredo".equals(token) ? journal : null; });

        String withRecording = report("erro", "  A carta sumiu  ", "{\"states\":[1,2,3]}");
        String code = code(feedback.handle(gzip(withRecording), "ab12", "segredo", "10.0.0.1"));
        assertTrue(code, code.matches("R-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}"));
        JsonObject saved = stored(store, code);
        assertEquals(code, saved.get("code").getAsString());
        Instant.parse(saved.get("receivedAt").getAsString());
        assertEquals("abc", saved.getAsJsonObject("bridge").get("matchId").getAsString());
        assertEquals(JsonParser.parseString(withRecording), saved.get("report"));
        var entry = store.entries().get(0);
        assertEquals("erro", entry.kind()); assertEquals("0.31.0", entry.version()); assertEquals("commander", entry.format());
        assertTrue(entry.match()); assertTrue(entry.bridge());

        // Sem gravação a ponte nem é consultada; com token errado vai sem o diário.
        String plain = code(feedback.handle(gzip(report("sugestao", "Mais decks", null)), "AB12", "segredo", "10.0.0.1"));
        assertTrue(stored(store, plain).get("bridge").isJsonNull());
        assertEquals(1, asked.size());
        String wrong = code(feedback.handle(gzip(report("erro", "x", "{}")), "AB12", "outro", "10.0.0.1"));
        assertTrue(stored(store, wrong).get("bridge").isJsonNull());
        assertFalse(store.entries().get(2).bridge()); assertTrue(store.entries().get(2).match());
        String noHeaders = code(feedback.handle(gzip(report("erro", "x", "{}")), null, null, "10.0.0.1"));
        assertTrue(stored(store, noHeaders).get("bridge").isJsonNull());
        assertEquals(2, asked.size());

        // O índice tem uma linha por relato com os campos combinados; o token nunca aparece.
        List<String> lines = Files.readAllLines(store.dir().resolve("indice.jsonl"));
        assertEquals(4, lines.size());
        JsonObject line = JsonParser.parseString(lines.get(0)).getAsJsonObject();
        for (String key : List.of("code", "receivedAt", "kind", "version", "format", "bytes", "match", "bridge", "path")) assertTrue(key, line.has(key));
        assertEquals(Files.size(store.dir().resolve(line.get("path").getAsString())), line.get("bytes").getAsLong());
        assertTrue(line.get("path").getAsString().matches("\\d{4}-\\d{2}/" + code + "\\.json\\.gz"));
        for (String l : lines) assertFalse(l.contains("segredo"));
        assertEquals(4, store.files());
    }

    private static JsonObject sent(Feedback.Response r) {
        assertEquals(r.json(), 201, r.status());
        return JsonParser.parseString(r.json()).getAsJsonObject();
    }

    private static String query(String... codeAndKey) {
        JsonObject o = new JsonObject();
        var list = new com.google.gson.JsonArray();
        for (int i = 0; i < codeAndKey.length; i += 2) {
            JsonObject r = new JsonObject(); r.addProperty("code", codeAndKey[i]); r.addProperty("key", codeAndKey[i + 1]); list.add(r);
        }
        o.add("relatos", list);
        return o.toString();
    }

    private static List<JsonObject> situation(Feedback feedback, String body, String authorization) {
        Feedback.Response r = feedback.status(body.getBytes(StandardCharsets.UTF_8), authorization);
        assertEquals(r.json(), 200, r.status());
        return JsonParser.parseString(r.json()).getAsJsonObject().getAsJsonArray("relatos").asList().stream().map(e -> e.getAsJsonObject()).toList();
    }

    @Test public void theKeyGoesBackToTheDeviceAndOnlyItsHashIsKept() throws IOException {
        FeedbackStore store = store();
        Feedback feedback = new Feedback(store, (c, t) -> null);
        JsonObject first = sent(feedback.handle(gzip(report("erro", "A carta sumiu", null)), null, null, "1"));
        JsonObject second = sent(feedback.handle(gzip(report("erro", "Outra", null)), null, null, "2"));
        String code = first.get("code").getAsString(), key = first.get("key").getAsString();
        assertTrue(key, key.matches("[A-Za-z0-9_-]{32}"));
        assertNotEquals(key, second.get("key").getAsString());

        String index = Files.readString(store.dir().resolve("indice.jsonl"));
        assertFalse("a chave não fica no índice", index.contains(key));
        assertTrue("só o resumo dela", index.contains(FeedbackStore.hash(key)));
        assertFalse("nem no arquivo do relato", stored(store, code).toString().contains(key));
        assertFalse(stored(store, code).toString().contains(FeedbackStore.hash(key)));
        assertEquals(FeedbackStore.hash(key), store.entry(code).keyHash());
        assertTrue(store.entry(code).reachable());
        // Reabrindo, o resumo continua lá.
        assertEquals(FeedbackStore.hash(key), store().entry(code).keyHash());
    }

    @Test public void playerSeesOnlyTheirOwnReportsWithTheSimplifiedStatusAndTheReply() throws IOException {
        FeedbackStore store = store();
        Feedback feedback = new Feedback(store, (c, t) -> null);
        feedback.authors(auth -> "Bearer ana".equals(auth) ? new FeedbackStore.Author("Ana", "conta-ana", false)
            : "Bearer bia".equals(auth) ? new FeedbackStore.Author("Bia", "conta-bia", false) : null);
        JsonObject mine = sent(feedback.handle(gzip(report("erro", "A carta sumiu", null)), null, null, "1"));
        JsonObject other = sent(feedback.handle(gzip(report("sugestao", "Mais decks", null)), null, null, "2"));
        JsonObject account = sent(feedback.handle(gzip(report("erro", "Com a conta", null)), null, null, "Bearer ana", "3"));
        // Um relato de antes das respostas: sem chave e sem conta.
        String old = store.store(new FeedbackStore.Meta("erro", "0.1.0", null, false, "Antigo"), null, () -> FeedbackStore.class.getResourceAsStream("FeedbackStore.class")).code();
        assertFalse(store.entry(old).reachable());
        String code = mine.get("code").getAsString(), key = mine.get("key").getAsString();
        String otherCode = other.get("code").getAsString(), otherKey = other.get("key").getAsString();
        String accountCode = account.get("code").getAsString();

        // Só a chave certa do relato certo.
        var seen = situation(feedback, query(code, key), null);
        assertEquals(1, seen.size());
        assertEquals(code, seen.get(0).get("code").getAsString());
        assertEquals("recebido", seen.get(0).get("status").getAsString());
        assertEquals("erro", seen.get(0).get("kind").getAsString());
        assertEquals("A carta sumiu", seen.get(0).get("summary").getAsString());
        Instant.parse(seen.get(0).get("receivedAt").getAsString());
        assertFalse(seen.get(0).has("reply"));
        assertEquals(java.util.Set.of("code", "kind", "summary", "receivedAt", "status"), seen.get(0).keySet());
        assertTrue(situation(feedback, query(code, "chave-errada"), null).isEmpty());
        assertTrue("a chave de um relato não abre outro", situation(feedback, query(otherCode, key), null).isEmpty());
        assertTrue(situation(feedback, query(old, ""), null).isEmpty());
        assertTrue(situation(feedback, query(old, key), null).isEmpty());
        assertTrue(situation(feedback, "{}", null).isEmpty());
        assertTrue(situation(feedback, query("R-NADA", key), null).isEmpty());
        // O código aceita minúsculas, como o resto.
        assertEquals(1, situation(feedback, query(code.toLowerCase(), key), null).size());

        // Com a conta, os dela vêm sem chave, em qualquer aparelho; os de outra conta, não.
        var ana = situation(feedback, "{}", "Bearer ana");
        assertEquals(1, ana.size());
        assertEquals(accountCode, ana.get(0).get("code").getAsString());
        assertTrue(situation(feedback, "{}", "Bearer bia").isEmpty());
        assertTrue(situation(feedback, "{}", "Bearer vencido").isEmpty());
        // Conta e chaves juntas, do mais novo ao mais antigo, sem repetir.
        var both = situation(feedback, query(code, key, otherCode, otherKey), "Bearer ana");
        assertEquals(List.of(accountCode, otherCode, code), both.stream().map(o -> o.get("code").getAsString()).toList());

        // Estado simplificado e resposta; a nota e a issue ficam só no admin.
        store.setStatus(code, "issue", "nota interna secreta", "#42", "Corrigimos na próxima versão.");
        JsonObject answered = situation(feedback, query(code, key), null).get(0);
        assertEquals("analise", answered.get("status").getAsString());
        assertEquals("Corrigimos na próxima versão.", answered.get("reply").getAsString());
        String repliedAt = answered.get("repliedAt").getAsString();
        Instant.parse(repliedAt);
        assertFalse(answered.toString().contains("secreta"));
        assertFalse(answered.toString().contains("#42"));
        assertFalse(answered.has("note")); assertFalse(answered.has("issue")); assertFalse(answered.has("author"));

        // A hora da resposta só muda com o texto: trocar o estado, a nota, ou salvar o mesmo texto, não.
        store.setStatus(code, "resolvido", "outra nota", "#42", null);
        assertEquals(repliedAt, situation(feedback, query(code, key), null).get(0).get("repliedAt").getAsString());
        assertEquals("resolvido", situation(feedback, query(code, key), null).get(0).get("status").getAsString());
        store.setStatus(code, "resolvido", null, null, "Corrigimos na próxima versão.");
        assertEquals(repliedAt, store.status(code).repliedAt().toString());
        assertEquals(repliedAt, store().status(code).repliedAt().toString());
        // Vazia apaga.
        store.setStatus(code, "descartado", null, null, "");
        JsonObject closed = situation(feedback, query(code, key), null).get(0);
        assertEquals("encerrado", closed.get("status").getAsString());
        assertFalse(closed.has("reply")); assertFalse(closed.has("repliedAt"));
        store.setStatus(otherCode, "visto", null, null);
        assertEquals("analise", situation(feedback, query(otherCode, otherKey), null).get(0).get("status").getAsString());

        // Corpo com defeito ou relatos demais: 400.
        error(feedback.status("[1]".getBytes(StandardCharsets.UTF_8), null), 400);
        error(feedback.status("{\"relatos\":".getBytes(StandardCharsets.UTF_8), null), 400);
        String[] many = new String[2 * (Feedback.MAX_STATUS_ITEMS + 1)];
        for (int i = 0; i < many.length; i += 2) { many[i] = "R-" + i; many[i + 1] = "k"; }
        error(feedback.status(query(many).getBytes(StandardCharsets.UTF_8), null), 400);
    }

    @Test public void rejectsInvalidReportsWith400() throws IOException {
        Feedback feedback = new Feedback(store(), (c, t) -> null);
        error(feedback.handle(gzip("{\"kind\":"), null, null, "1"), 400);
        error(feedback.handle(gzip("[1,2]"), null, null, "1"), 400);
        error(feedback.handle(gzip(report("erro", "ok", null) + "{}"), null, null, "1"), 400);
        error(feedback.handle(new byte[]{0x1f, (byte) 0x8b, 1, 2, 3}, null, null, "1"), 400);
        error(feedback.handle(gzip(report("erro", "   ", null)), null, null, "1"), 400);
        error(feedback.handle(gzip("{\"v\":1,\"kind\":\"erro\"}"), null, null, "1"), 400);
        error(feedback.handle(gzip(report("elogio", "Gostei", null)), null, null, "1"), 400);
        error(feedback.handle(gzip(report("erro", "x".repeat(2001), null)), null, null, "1"), 400);
        error(feedback.handle(gzip(report("erro", "x", "[1]")), null, null, "1"), 400);
        error(feedback.handle(gzip(report("erro", "x", null).replace("\"v\":1", "\"v\":2")), null, null, "1"), 400);
        // 2.000 caracteres depois de tirar os espaços das pontas ainda valem.
        code(feedback.handle(gzip(report("erro", "  " + "x".repeat(2000) + "  ", null)), null, null, "1"));
        // Sem gzip também é aceito (curl de teste).
        code(feedback.handle(report("sugestao", "plain", null).getBytes(StandardCharsets.UTF_8), null, null, "1"));
    }

    @Test public void rejectsTooLargeReportsWith413() throws IOException {
        Feedback feedback = new Feedback(store(), (c, t) -> null);
        error(feedback.handle(new byte[Feedback.MAX_COMPRESSED + 1], null, null, "1"), 413);
        // Uma bomba de gzip: pouco comprimido, mais de 64 MB aberto.
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (OutputStream gz = new GZIPOutputStream(out)) {
            gz.write("{\"v\":1,\"kind\":\"erro\",\"description\":\"x\",\"recording\":{\"pad\":\"".getBytes(StandardCharsets.UTF_8));
            byte[] chunk = new byte[1 << 20]; java.util.Arrays.fill(chunk, (byte) 'a');
            for (int i = 0; i < 65; i++) gz.write(chunk);
            gz.write("\"}}".getBytes(StandardCharsets.UTF_8));
        }
        assertTrue(out.size() < Feedback.MAX_COMPRESSED);
        error(feedback.handle(out.toByteArray(), null, null, "1"), 413);
    }

    @Test public void limitsTenReportsPerHourPerAddress() throws IOException {
        Feedback feedback = new Feedback(store(), (c, t) -> null);
        byte[] body = gzip(report("sugestao", "ideia", null));
        for (int i = 0; i < Feedback.MAX_PER_HOUR; i++) code(feedback.handle(body, null, null, "200.1.1.1"));
        Feedback.Response limited = feedback.handle(body, null, null, "200.1.1.1");
        error(limited, 429);
        assertEquals(Feedback.TOO_MANY, JsonParser.parseString(limited.json()).getAsJsonObject().get("error").getAsString());
        code(feedback.handle(body, null, null, "200.1.1.2"));
    }

    @Test public void rateLimitWindowSlidesAndKeepsOnlyAHash() {
        FeedbackRateLimit limit = new FeedbackRateLimit(10, 3_600_000);
        String key = limit.key("192.168.0.9");
        assertEquals(key, limit.key("192.168.0.9"));
        assertNotEquals(key, limit.key("192.168.0.10"));
        assertFalse(key.contains("192.168"));
        assertNotEquals("Outro processo, outro sal", key, new FeedbackRateLimit(10, 3_600_000).key("192.168.0.9"));
        long t0 = 1_000_000;
        for (int i = 0; i < 10; i++) { assertFalse(limit.exceeded(key, t0 + i * 60_000)); limit.record(key, t0 + i * 60_000); }
        assertTrue(limit.exceeded(key, t0 + 10 * 60_000));
        assertTrue(limit.exceeded(key, t0 + 3_600_000 - 1));
        assertFalse("O primeiro saiu da janela de uma hora", limit.exceeded(key, t0 + 3_600_000));
    }

    @Test public void refusesWith507WhenTheVolumeIsFullOrTheStoreCannotFit() throws IOException {
        FeedbackStore full = new FeedbackStore(tmp.newFolder("cheio").toPath(), 1L << 30, Duration.ofDays(90), Long.MAX_VALUE);
        Feedback.Response r = new Feedback(full, (c, t) -> null).handle(gzip(report("erro", "x", null)), null, null, "1");
        error(r, 507);
        assertEquals(Feedback.NO_SPACE, JsonParser.parseString(r.json()).getAsJsonObject().get("error").getAsString());
        FeedbackStore tiny = new FeedbackStore(tmp.newFolder("pequeno").toPath(), 10, Duration.ofDays(90), 0);
        error(new Feedback(tiny, (c, t) -> null).handle(gzip(report("erro", "x", null)), null, null, "1"), 507);
        assertEquals(0, tiny.files());
        try (var files = Files.walk(tiny.dir())) { assertTrue(files.noneMatch(f -> f.toString().endsWith(".tmp"))); }
    }

    @Test public void retentionDropsOldReportsThenTheOldestUntilItFits() throws Exception {
        Path base = tmp.newFolder("retencao").toPath();
        FeedbackStore store = new FeedbackStore(base, 1L << 30, Duration.ofDays(90), 0);
        Feedback feedback = new Feedback(store, (c, t) -> null);
        String a = code(feedback.handle(gzip(report("erro", "a", null)), null, null, "1"));
        String b = code(feedback.handle(gzip(report("erro", "b", null)), null, null, "2"));
        String c = code(feedback.handle(gzip(report("erro", "c", null)), null, null, "3"));
        long each = store.entries().get(0).bytes();

        // Envelhece o primeiro no índice: 100 dias atrás.
        Path index = store.dir().resolve("indice.jsonl");
        List<String> lines = Files.readAllLines(index);
        JsonObject first = JsonParser.parseString(lines.get(0)).getAsJsonObject();
        first.addProperty("receivedAt", Instant.now().minus(Duration.ofDays(100)).toString());
        lines.set(0, first.toString());
        Files.write(index, lines);

        // Um arquivo fora do índice também entra (e conta para o limite).
        FeedbackStore reopened = new FeedbackStore(base, 2 * each + each / 2, Duration.ofDays(90), 0);
        assertEquals(3, reopened.files());
        assertEquals(1, reopened.cleanup(Instant.now()));
        assertFalse(Files.exists(reopened.dir().resolve(first.get("path").getAsString())));
        assertEquals(List.of(b, c), reopened.entries().stream().map(FeedbackStore.Entry::code).toList());

        // Passando do limite, um relato novo apaga o mais antigo.
        String d = code(new Feedback(reopened, (x, y) -> null).handle(gzip(report("erro", "d", null)), null, null, "4"));
        assertEquals(List.of(c, d), reopened.entries().stream().map(FeedbackStore.Entry::code).toList());
        assertTrue(reopened.totalBytes() <= 2 * each + each / 2);
        List<String> rewritten = Files.readAllLines(index);
        assertEquals(2, rewritten.size());
        assertTrue(rewritten.get(0).contains(c) && rewritten.get(1).contains(d));
        assertFalse(String.join("", rewritten).contains(a));
    }

    @Test public void httpRouteAcceptsLargeReportsWithoutRaisingTheLimitOfOtherRoutes() throws Exception {
        int port;
        try (ServerSocket s = new ServerSocket(0)) { port = s.getLocalPort(); }
        BridgeServer server = new BridgeServer("127.0.0.1", port, new BridgeServer.Listener() {
            public void onConnect(io.netty.channel.Channel ch) { }
            public void onMessage(io.netty.channel.Channel ch, String text) { }
            public void onDisconnect(io.netty.channel.Channel ch) { }
        });
        FeedbackStore store = store();
        server.feedback(new Feedback(store, (c, t) -> null));
        server.start();
        HttpClient http = HttpClient.newHttpClient();
        URI uri = URI.create("http://127.0.0.1:" + port + Feedback.PATH);

        // Uma gravação de ~200 KB comprimidos passa do limite de 64 KB das outras rotas.
        byte[] noise = new byte[150_000]; new java.util.Random(1).nextBytes(noise);
        String recording = "{\"blob\":\"" + java.util.Base64.getEncoder().encodeToString(noise) + "\"}";
        byte[] body = gzip(report("erro", "Travou no combate", recording));
        assertTrue(body.length > 1 << 16);
        HttpResponse<String> ok = http.send(HttpRequest.newBuilder(uri).POST(HttpRequest.BodyPublishers.ofByteArray(body))
            .header("Content-Type", "application/json").header("Content-Encoding", "gzip")
            .header("X-Mesa-Partida", "AB12").header("X-Mesa-Token", "t").build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(ok.body(), 201, ok.statusCode());
        assertEquals("*", ok.headers().firstValue("Access-Control-Allow-Origin").orElse(null));
        assertTrue(ok.headers().firstValue("Content-Type").orElse("").startsWith("application/json"));
        assertEquals(1, store.files());

        HttpResponse<String> preflight = http.send(HttpRequest.newBuilder(uri).method("OPTIONS", HttpRequest.BodyPublishers.noBody())
            .header("Origin", "http://localhost:5173").header("Access-Control-Request-Method", "POST").build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(204, preflight.statusCode());
        assertTrue(preflight.headers().firstValue("Access-Control-Allow-Headers").orElse("").contains("X-Mesa-Token"));

        HttpResponse<String> get = http.send(HttpRequest.newBuilder(uri).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(405, get.statusCode());

        // A situação dos relatos (Meus relatos): POST em JSON, com OPTIONS para o navegador e 405 para o resto.
        URI situation = URI.create("http://127.0.0.1:" + port + Feedback.STATUS_PATH);
        JsonObject sent = JsonParser.parseString(ok.body()).getAsJsonObject();
        HttpResponse<String> mine = http.send(HttpRequest.newBuilder(situation)
            .POST(HttpRequest.BodyPublishers.ofString(query(sent.get("code").getAsString(), sent.get("key").getAsString())))
            .header("Content-Type", "application/json").build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(mine.body(), 200, mine.statusCode());
        assertEquals("*", mine.headers().firstValue("Access-Control-Allow-Origin").orElse(null));
        var list = JsonParser.parseString(mine.body()).getAsJsonObject().getAsJsonArray("relatos");
        assertEquals(1, list.size());
        assertEquals("Travou no combate", list.get(0).getAsJsonObject().get("summary").getAsString());
        HttpResponse<String> statusPreflight = http.send(HttpRequest.newBuilder(situation).method("OPTIONS", HttpRequest.BodyPublishers.noBody())
            .header("Origin", "http://localhost:5173").header("Access-Control-Request-Method", "POST").build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(204, statusPreflight.statusCode());
        assertTrue(statusPreflight.headers().firstValue("Access-Control-Allow-Headers").orElse("").contains("Authorization"));
        assertEquals(405, http.send(HttpRequest.newBuilder(situation).GET().build(), HttpResponse.BodyHandlers.ofString()).statusCode());
        assertEquals(1, store.files());

        HttpResponse<String> huge = http.send(HttpRequest.newBuilder(uri).POST(HttpRequest.BodyPublishers.ofByteArray(new byte[Feedback.MAX_COMPRESSED + 10])).build(),
            HttpResponse.BodyHandlers.ofString());
        assertEquals(413, huge.statusCode());
        assertEquals(Feedback.TOO_LARGE, JsonParser.parseString(huge.body()).getAsJsonObject().get("error").getAsString());

        HttpResponse<String> other = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/health"))
            .POST(HttpRequest.BodyPublishers.ofByteArray(body)).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals("As outras rotas continuam com 64 KB", 413, other.statusCode());
        HttpResponse<String> health = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/health")).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, health.statusCode());
        assertTrue(Metrics.scrape().contains("mesa_feedback_received_total"));
    }
}
