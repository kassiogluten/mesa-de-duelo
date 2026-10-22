package mesadeduelo.bridge;

import static org.junit.Assert.*;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import org.junit.BeforeClass;
import org.junit.Test;

/** O diário de uma partida contra a IA chega a um relato só com o token do assento, inclusive logo depois de sair. */
public class MatchJournalRoomsTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static JsonObject session(EmbeddedChannel ch) throws InterruptedException {
        long until = System.currentTimeMillis() + 15_000;
        while (System.currentTimeMillis() < until) {
            Object message;
            while ((message = ch.readOutbound()) != null) if (message instanceof TextWebSocketFrame frame) {
                try {
                    JsonObject json = JsonParser.parseString(frame.text()).getAsJsonObject();
                    if (json.has("session")) return json.getAsJsonObject("session");
                } finally { frame.release(); }
            }
            Thread.sleep(20);
        }
        throw new AssertionError("A partida não publicou o estado");
    }

    @Test public void journalFollowsTheSeatTokenAndOutlivesTheSessionForAWhile() throws Exception {
        Rooms rooms = new Rooms();
        EmbeddedChannel ch = new EmbeddedChannel();
        try {
            rooms.onMessage(ch, "{\"type\":\"start\",\"config\":{\"format\":\"free\",\"matchLength\":\"bo1\"},\"you\":\"vermelho\",\"opponent\":\"verde\"}");
            JsonObject session = session(ch);
            String code = session.get("code").getAsString(), token = session.get("token").getAsString();
            rooms.onMessage(ch, "{\"type\":\"ok\",\"gen\":-5}");
            rooms.onMessage(ch, "{\"type\":\"preferences\",\"passResponses\":true}");

            JsonObject journal = rooms.journal(code, token);
            assertNotNull(journal);
            assertEquals(0, journal.get("reporterSeat").getAsInt());
            assertEquals(2, journal.getAsJsonArray("players").size());
            JsonObject you = journal.getAsJsonArray("players").get(0).getAsJsonObject(), ai = journal.getAsJsonArray("players").get(1).getAsJsonObject();
            assertFalse(you.get("ai").getAsBoolean()); assertEquals(0, you.get("seat").getAsInt());
            assertTrue(ai.get("ai").getAsBoolean()); assertTrue(ai.get("seat").isJsonNull());
            assertTrue(ai.getAsJsonObject("deck").getAsJsonArray("cards").size() > 0);
            var actions = journal.getAsJsonArray("actions");
            assertEquals("recusada", actions.get(0).getAsJsonObject().get("result").getAsString());
            assertEquals("ok", actions.get(0).getAsJsonObject().get("type").getAsString());
            assertEquals("recebida", actions.get(1).getAsJsonObject().get("result").getAsString());
            assertNull(rooms.journal(code, "outro"));
            assertNull(rooms.journal("ZZZZ", token));

            rooms.onMessage(ch, "{\"type\":\"leave\"}");
            JsonObject after = rooms.journal(code, token);
            assertNotNull("Fica guardado por um tempo depois que a partida fecha", after);
            assertEquals(journal.get("matchId"), after.get("matchId"));
            assertNull(rooms.journal(code, "outro"));
        } finally {
            rooms.onMessage(ch, "{\"type\":\"leave\"}");
            ch.finishAndReleaseAll();
        }
    }
}
