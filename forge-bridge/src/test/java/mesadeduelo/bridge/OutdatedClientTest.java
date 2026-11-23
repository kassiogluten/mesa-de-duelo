package mesadeduelo.bridge;

import static org.junit.Assert.*;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import org.junit.Test;

/** A mesa no PC abaixo do protocolo mínimo é recusada ao pedir partida ou sala; a do navegador e a atualizada, não. */
public class OutdatedClientTest {
    private static final String HOST = "{\"type\":\"host\",\"name\":\"Ana\",\"config\":{\"format\":\"free\",\"matchLength\":\"bo1\"}}";

    /** Todas as mensagens que o servidor mandou até agora. */
    private static java.util.List<JsonObject> drain(EmbeddedChannel ch) {
        java.util.List<JsonObject> out = new java.util.ArrayList<>();
        Object message;
        while ((message = ch.readOutbound()) != null) if (message instanceof TextWebSocketFrame frame) {
            try { out.add(JsonParser.parseString(frame.text()).getAsJsonObject()); } finally { frame.release(); }
        }
        return out;
    }

    private static boolean refused(java.util.List<JsonObject> sent) {
        return sent.stream().anyMatch(m -> "error".equals(m.get("type").getAsString()) && m.has("reason") && "outdated".equals(m.get("reason").getAsString()));
    }

    @Test public void onlyPcTablesBelowTheMinimumAreOutdated() {
        assertTrue(Rooms.outdatedClient("godot", JsonParser.parseString("{}").getAsJsonObject()));
        assertTrue(Rooms.outdatedClient("godot", JsonParser.parseString("{\"protocolVersion\":" + (Rooms.MIN_CLIENT_PROTOCOL - 1) + "}").getAsJsonObject()));
        assertFalse(Rooms.outdatedClient("godot", JsonParser.parseString("{\"protocolVersion\":" + Rooms.MIN_CLIENT_PROTOCOL + "}").getAsJsonObject()));
        assertFalse(Rooms.outdatedClient("web", JsonParser.parseString("{}").getAsJsonObject()));
        assertFalse(Rooms.outdatedClient(null, JsonParser.parseString("{}").getAsJsonObject()));
    }

    @Test public void theHelloTellsTheMinimumAndAnOutdatedTableCannotHost() {
        Rooms rooms = new Rooms();
        EmbeddedChannel old = new EmbeddedChannel(), current = new EmbeddedChannel();
        try {
            rooms.onMessage(old, "{\"type\":\"hello\",\"client\":\"godot\",\"clientVersion\":\"0.1.0\"}");
            java.util.List<JsonObject> hello = drain(old);
            assertEquals(Rooms.MIN_CLIENT_PROTOCOL, hello.get(0).get("minProtocolVersion").getAsInt());
            assertTrue("a mesa antiga sabe logo no hello", refused(hello));
            rooms.onMessage(old, HOST);
            java.util.List<JsonObject> afterHost = drain(old);
            assertTrue(refused(afterHost));
            assertTrue("nenhuma sala criada", afterHost.stream().noneMatch(m -> "room".equals(m.get("type").getAsString())));

            rooms.onMessage(current, "{\"type\":\"hello\",\"client\":\"godot\",\"protocolVersion\":" + Rooms.PROTOCOL_VERSION + "}");
            assertFalse(refused(drain(current)));
            rooms.onMessage(current, "{\"type\":\"list-rooms\",\"requestId\":\"r1\"}");
            assertFalse("consultas continuam valendo", refused(drain(current)));
        } finally {
            rooms.onDisconnect(old);
            rooms.onDisconnect(current);
            old.finishAndReleaseAll();
            current.finishAndReleaseAll();
        }
    }
}
