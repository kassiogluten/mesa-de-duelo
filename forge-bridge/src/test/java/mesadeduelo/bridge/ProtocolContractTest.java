package mesadeduelo.bridge;

import static org.junit.Assert.*;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Predicate;
import org.junit.Test;

/**
 * Contrato do estado com a mesa: todo campo que o servidor manda no estado de uma partida precisa estar em
 * {@code tests/protocol/state-keys.txt}, e o {@code tests/protocol.test.mjs} confere que cada campo dessa lista
 * existe nos tipos de {@code src/forge/client.ts} (FState). Assim, renomear um campo de um lado só quebra um teste
 * em vez de a mesa ler {@code undefined} calada.
 *
 * Campo novo de propósito: rode este teste com {@code -Dprotocol.update=true} (acrescenta os campos à lista),
 * declare o campo no client.ts e rode {@code npm test}.
 */
public class ProtocolContractTest {
    private static final Path KEYS = Path.of("..", "tests", "protocol", "state-keys.txt");

    /** Mesa de teste com um pouco de tudo: criaturas com marcadores, aura, cartas em todas as zonas. */
    private static final String SCENARIO = """
        {"active":0,"phase":"main1","players":[
          {"life":17,"poison":1,"hand":["Lightning Bolt","Grizzly Bears","Forest"],"library":["Mountain","Mountain","Mountain"],
           "graveyard":["Shock"],"exile":["Llanowar Elves"],
           "battlefield":[{"name":"Mountain"},{"name":"Mountain","tapped":true},{"name":"Forest"},
             {"name":"Grizzly Bears","counters":{"P1P1":1}},{"name":"Rancor","attachedTo":{"player":0,"index":3}},
             {"name":"Chandra, Torch of Defiance"}]},
          {"life":20,"poison":0,"hand":["Island"],"library":["Island","Island","Island"],"graveyard":[],"exile":[],
           "battlefield":[{"name":"Island"},{"name":"Wall of Omens","sick":true}]}]}""";

    private static List<JsonObject> drain(EmbeddedChannel ch) {
        List<JsonObject> out = new ArrayList<>();
        Object message;
        while ((message = ch.readOutbound()) != null) if (message instanceof TextWebSocketFrame frame) {
            try { out.add(JsonParser.parseString(frame.text()).getAsJsonObject()); } finally { frame.release(); }
        }
        return out;
    }

    private static JsonObject until(EmbeddedChannel ch, List<JsonObject> seen, Predicate<JsonObject> wanted) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 20_000;
        while (System.currentTimeMillis() < deadline) {
            for (JsonObject json : drain(ch)) { seen.add(json); if (wanted.test(json)) return json; }
            Thread.sleep(20);
        }
        throw new AssertionError("A mensagem esperada não chegou");
    }

    private static boolean gameState(JsonObject j) {
        return j.has("type") && "state".equals(j.get("type").getAsString()) && j.has("players") && j.getAsJsonArray("players").size() == 2;
    }

    /** O cenário já está na mesa: as duas fileiras do campo com cartas. */
    private static boolean scenarioOnTable(JsonObject j) {
        if (!gameState(j)) return false;
        for (JsonElement p : j.getAsJsonArray("players")) {
            JsonElement bf = p.getAsJsonObject().get("battlefield");
            if (bf == null || !bf.isJsonArray() || bf.getAsJsonArray().isEmpty()) return false;
        }
        return true;
    }

    /** Caminhos dos campos: {@code players[].battlefield[].name}. Chaves numéricas (mapas por id) viram {@code *}. */
    static void paths(String prefix, JsonElement e, Set<String> out) {
        if (e.isJsonObject()) {
            for (var entry : e.getAsJsonObject().entrySet()) {
                String key = entry.getKey().matches("-?\\d+") ? "*" : entry.getKey();
                String path = prefix.isEmpty() ? key : prefix + "." + key;
                out.add(path);
                paths(path, entry.getValue(), out);
            }
        } else if (e.isJsonArray()) {
            for (JsonElement item : (JsonArray) e) paths(prefix + "[]", item, out);
        }
    }

    @Test public void everyStateFieldIsInTheContractList() throws Exception {
        Rooms rooms = new Rooms();
        EmbeddedChannel host = new EmbeddedChannel(), guest = new EmbeddedChannel();
        List<JsonObject> seen = new ArrayList<>();
        try {
            rooms.onMessage(host, "{\"type\":\"lab-host\",\"name\":\"Jogador 1\",\"scenario\":" + SCENARIO + "}");
            String code = until(host, seen, j -> "room".equals(j.get("type").getAsString())).getAsJsonObject("room").get("code").getAsString();
            rooms.onMessage(guest, "{\"type\":\"join\",\"code\":\"" + code + "\",\"name\":\"Jogador 2\"}");
            until(host, seen, ProtocolContractTest::scenarioOnTable);
            until(guest, seen, ProtocolContractTest::scenarioOnTable);
            Thread.sleep(300); // mais um ciclo de publicação, com os eventos da montagem
            seen.addAll(drain(host)); seen.addAll(drain(guest));
        } finally {
            rooms.onMessage(host, "{\"type\":\"leave\"}");
            rooms.onMessage(guest, "{\"type\":\"leave\"}");
            host.finishAndReleaseAll(); guest.finishAndReleaseAll();
        }

        Set<String> sent = new TreeSet<>();
        for (JsonObject j : seen) if (gameState(j)) paths("", j, sent);
        assertTrue("o estado chegou sem campos: " + sent, sent.contains("players[].battlefield[].name"));

        Set<String> listed = new TreeSet<>();
        if (Files.exists(KEYS)) for (String line : Files.readAllLines(KEYS, StandardCharsets.UTF_8)) {
            line = line.strip();
            if (!line.isEmpty() && !line.startsWith("#")) listed.add(line);
        }
        Set<String> missing = new TreeSet<>(sent);
        missing.removeAll(listed);
        if (!missing.isEmpty() && Boolean.getBoolean("protocol.update")) {
            listed.addAll(missing);
            List<String> lines = new ArrayList<>();
            lines.add("# Campos do estado (mensagem \"state\") que o servidor manda à mesa. Gerado e conferido pelo");
            lines.add("# ProtocolContractTest (servidor) e conferido contra src/forge/client.ts pelo tests/protocol.test.mjs.");
            lines.add("# Acrescentar: rode o ProtocolContractTest com -Dprotocol.update=true. Tirar um campo: apague a linha.");
            lines.addAll(listed);
            Files.createDirectories(KEYS.getParent());
            Files.write(KEYS, lines, StandardCharsets.UTF_8);
            return;
        }
        assertTrue("Campos novos no estado, fora de tests/protocol/state-keys.txt (declare no client.ts e rode com"
            + " -Dprotocol.update=true): " + missing, missing.isEmpty());
    }
}
