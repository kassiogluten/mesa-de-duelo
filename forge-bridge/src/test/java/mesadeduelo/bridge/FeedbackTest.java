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
