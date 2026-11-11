package mesadeduelo.bridge;

import static org.junit.Assert.*;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Predicate;
import org.junit.BeforeClass;
import org.junit.Test;

/** Apontar uma carta ({type:"point"}): só as cartas que todos veem, e o aviso chega aos dois lados da sala. */
public class CardPointerTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static JsonObject until(EmbeddedChannel ch, Predicate<JsonObject> wanted) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 15_000;
        while (System.currentTimeMillis() < deadline) {
            Object message;
            while ((message = ch.readOutbound()) != null) if (message instanceof TextWebSocketFrame frame) {
                try {
                    JsonObject json = JsonParser.parseString(frame.text()).getAsJsonObject();
                    if (wanted.test(json)) return json;
                } finally { frame.release(); }
            }
            Thread.sleep(20);
        }
        throw new AssertionError("A mensagem esperada não chegou");
    }

    private static List<JsonObject> drain(EmbeddedChannel ch) {
        List<JsonObject> out = new ArrayList<>();
        Object message;
        while ((message = ch.readOutbound()) != null) if (message instanceof TextWebSocketFrame frame) {
            try { out.add(JsonParser.parseString(frame.text()).getAsJsonObject()); } finally { frame.release(); }
        }
        return out;
    }

    private static boolean isPoint(JsonObject j) { return "point".equals(j.get("type").getAsString()); }

    @Test public void onlyPublicCardsArePointedAndBothSidesSeeIt() throws Exception {
        Rooms rooms = new Rooms();
        EmbeddedChannel host = new EmbeddedChannel(), guest = new EmbeddedChannel();
        try {
            rooms.onMessage(host, "{\"type\":\"lab-host\",\"name\":\"Jogador 1\",\"scenario\":{\"players\":[{\"hand\":[\"Lightning Bolt\"],\"battlefield\":[{\"name\":\"Grizzly Bears\"}]},{}]}}");
            String code = until(host, j -> "room".equals(j.get("type").getAsString())).getAsJsonObject("room").get("code").getAsString();
            rooms.onMessage(guest, "{\"type\":\"join\",\"code\":\"" + code + "\",\"name\":\"Jogador 2\"}");
            JsonObject state = until(host, j -> j.has("session") && j.has("players")
                && j.getAsJsonArray("players").get(0).getAsJsonObject().getAsJsonArray("battlefield").size() > 0);
            until(guest, j -> j.has("session"));
            int you = state.get("you").getAsInt(), bears = -1, bolt = -1;
            for (JsonElement p : state.getAsJsonArray("players")) {
                JsonObject player = p.getAsJsonObject();
                if (player.get("id").getAsInt() != you) continue;
                bears = player.getAsJsonArray("battlefield").get(0).getAsJsonObject().get("id").getAsInt();
                bolt = player.getAsJsonArray("hand").get(0).getAsJsonObject().get("id").getAsInt();
            }

            // A mão não é pública: apontar uma carta dela não avisa ninguém.
            rooms.onMessage(host, "{\"type\":\"point\",\"card\":" + bolt + "}");
            Thread.sleep(200);
            assertTrue(drain(guest).stream().noneMatch(CardPointerTest::isPoint));

            Thread.sleep(CardPointer.POINT_EVERY_MS);
            rooms.onMessage(host, "{\"type\":\"point\",\"card\":" + bears + "}");
            JsonObject seen = until(guest, CardPointerTest::isPoint);
            assertEquals(you, seen.get("player").getAsInt());
            assertEquals(bears, seen.get("card").getAsInt());
            // Quem apontou também recebe, como confirmação.
            assertEquals(bears, until(host, CardPointerTest::isPoint).get("card").getAsInt());

            // Em seguida, de novo: ignorado até passar o intervalo.
            rooms.onMessage(host, "{\"type\":\"point\",\"card\":" + bears + "}");
            Thread.sleep(200);
            assertTrue(drain(guest).stream().noneMatch(CardPointerTest::isPoint));
        } finally {
            rooms.onMessage(host, "{\"type\":\"leave\"}");
            rooms.onMessage(guest, "{\"type\":\"leave\"}");
            host.finishAndReleaseAll(); guest.finishAndReleaseAll();
        }
    }
}
