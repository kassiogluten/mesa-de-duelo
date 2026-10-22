package mesadeduelo.bridge;

import static org.junit.Assert.*;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import org.junit.BeforeClass;
import org.junit.Test;

/** Só as salas públicas abertas entram na lista da tela inicial; as privadas continuam só pelo código. */
public class PublicRoomsTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static final String CONFIG = "{\"format\":\"free\",\"matchLength\":\"bo1\"}";

    /** A primeira mensagem do tipo pedido, descartando as outras (hello, estados, avisos). */
    private static JsonObject next(EmbeddedChannel ch, String type) throws InterruptedException {
        long until = System.currentTimeMillis() + 15_000;
        while (System.currentTimeMillis() < until) {
            Object message;
            while ((message = ch.readOutbound()) != null) if (message instanceof TextWebSocketFrame frame) {
                try {
                    JsonObject json = JsonParser.parseString(frame.text()).getAsJsonObject();
                    if (type.equals(json.get("type").getAsString())) return json;
                } finally { frame.release(); }
            }
            Thread.sleep(20);
        }
        throw new AssertionError("A ponte não respondeu " + type);
    }

    private static JsonArray list(Rooms rooms, EmbeddedChannel ch) throws InterruptedException {
        rooms.onMessage(ch, "{\"type\":\"list-rooms\",\"requestId\":\"r1\"}");
        JsonObject response = next(ch, "room-list");
        assertEquals("r1", response.get("requestId").getAsString());
        return response.getAsJsonArray("rooms");
    }

    private static String host(Rooms rooms, EmbeddedChannel ch, String name, String visibility) throws InterruptedException {
        rooms.onMessage(ch, "{\"type\":\"host\",\"name\":\"" + name + "\",\"deck\":\"vermelho\",\"config\":" + CONFIG
            + (visibility == null ? "" : ",\"visibility\":\"" + visibility + "\"") + "}");
        JsonObject room = next(ch, "room").getAsJsonObject("room");
        assertEquals("public".equals(visibility), room.get("public").getAsBoolean());
        return room.get("code").getAsString();
    }

    @Test public void listsOnlyOpenPublicRoomsWithoutSecrets() throws Exception {
        Rooms rooms = new Rooms();
        EmbeddedChannel ana = new EmbeddedChannel(), bia = new EmbeddedChannel(), caio = new EmbeddedChannel(), visitor = new EmbeddedChannel();
        try {
            assertEquals(0, list(rooms, visitor).size());
            String open = host(rooms, ana, "Ana", "public");
            String secret = host(rooms, bia, "Bia", null);
            host(rooms, caio, "Caio", "private");

            JsonArray listed = list(rooms, visitor);
            assertEquals("Só a sala pública aparece", 1, listed.size());
            JsonObject entry = listed.get(0).getAsJsonObject();
            assertEquals(open, entry.get("code").getAsString());
            assertEquals("Ana", entry.get("host").getAsString());
            assertEquals("free", entry.getAsJsonObject("config").get("format").getAsString());
            assertEquals(2, entry.get("capacity").getAsInt());
            assertEquals(1, entry.get("players").getAsInt());
            assertFalse(entry.get("started").getAsBoolean());
            assertFalse("Nada de tokens ou decks na lista", entry.toString().contains("token") || entry.toString().contains("deck"));
            assertFalse(listed.toString().contains(secret));

            // A sala privada continua acessível pelo código, como antes.
            rooms.onMessage(visitor, "{\"type\":\"lookup-room\",\"requestId\":\"r2\",\"code\":\"" + secret + "\"}");
            assertEquals(secret, next(visitor, "room-info").getAsJsonObject("room").get("code").getAsString());

            // Cheia, a partida começa e a sala sai da lista.
            rooms.onMessage(visitor, "{\"type\":\"join\",\"code\":\"" + open + "\",\"name\":\"Dora\",\"deck\":\"verde\"}");
            next(visitor, "room");
            assertEquals(0, list(rooms, caio).size());
        } finally {
            for (EmbeddedChannel ch : new EmbeddedChannel[]{ana, bia, caio, visitor}) { rooms.onMessage(ch, "{\"type\":\"leave\"}"); ch.finishAndReleaseAll(); }
        }
    }

    @Test public void closedOrAbandonedPublicRoomsLeaveTheList() throws Exception {
        Rooms rooms = new Rooms();
        EmbeddedChannel ana = new EmbeddedChannel(), bia = new EmbeddedChannel(), visitor = new EmbeddedChannel();
        try {
            host(rooms, ana, "Ana", "public");
            host(rooms, bia, "Bia", "public");
            assertEquals(2, list(rooms, visitor).size());
            rooms.onMessage(ana, "{\"type\":\"leave\"}");
            rooms.onDisconnect(bia);
            assertEquals("Fechada ou sem ninguém conectado, a sala sai da lista", 0, list(rooms, visitor).size());
        } finally {
            for (EmbeddedChannel ch : new EmbeddedChannel[]{ana, bia, visitor}) { rooms.onMessage(ch, "{\"type\":\"leave\"}"); ch.finishAndReleaseAll(); }
        }
    }
}
