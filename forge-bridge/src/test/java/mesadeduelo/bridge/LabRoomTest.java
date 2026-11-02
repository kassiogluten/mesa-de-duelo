package mesadeduelo.bridge;

import static org.junit.Assert.*;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import java.util.function.Predicate;
import org.junit.BeforeClass;
import org.junit.Test;

/** Sala de teste do Laboratório: qualquer um dos lados a fecha para os dois. */
public class LabRoomTest {
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

    @Test public void closingTheTestRoomSendsTheOtherSideBackAndEndsTheRoom() throws Exception {
        Rooms rooms = new Rooms();
        EmbeddedChannel host = new EmbeddedChannel(), guest = new EmbeddedChannel();
        try {
            rooms.onMessage(host, "{\"type\":\"lab-host\",\"name\":\"Jogador 1\",\"scenario\":{\"players\":[{\"hand\":[\"Lightning Bolt\"]},{}]}}");
            String code = until(host, j -> "room".equals(j.get("type").getAsString())).getAsJsonObject("room").get("code").getAsString();
            rooms.onMessage(guest, "{\"type\":\"join\",\"code\":\"" + code + "\",\"name\":\"Jogador 2\"}");
            until(host, j -> j.has("session"));
            until(guest, j -> j.has("session"));

            rooms.onMessage(host, "{\"type\":\"lab-close\"}");
            JsonObject gone = until(guest, j -> "gone".equals(j.get("type").getAsString()));
            assertEquals("Jogador 1 fechou a sala de teste " + code + ".", gone.get("text").getAsString());
            // A sala não existe mais: voltar a ela pelo código não dá.
            rooms.onMessage(guest, "{\"type\":\"join\",\"code\":\"" + code + "\",\"name\":\"Jogador 2\",\"deck\":{\"cards\":[]}}");
            assertTrue(until(guest, j -> "error".equals(j.get("type").getAsString())).get("text").getAsString().contains(code));
        } finally {
            rooms.onMessage(host, "{\"type\":\"leave\"}");
            rooms.onMessage(guest, "{\"type\":\"leave\"}");
            host.finishAndReleaseAll(); guest.finishAndReleaseAll();
        }
    }
}
