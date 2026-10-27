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

    @Test public void tooManyWrongCodesBlockTheSearchForAWhile() throws Exception {
        Rooms rooms = new Rooms();
        EmbeddedChannel ana = new EmbeddedChannel(), visitor = new EmbeddedChannel();
        try {
            String code = host(rooms, ana, "Ana", null);
            for (int i = 0; i < 10; i++) {
                rooms.onMessage(visitor, "{\"type\":\"lookup-room\",\"requestId\":\"m" + i + "\",\"code\":\"ZZZ" + i + "\"}");
                assertTrue(next(visitor, "request-error").get("text").getAsString().startsWith("Não existe sala"));
            }
            // Mesmo o código certo fica recusado, senão a varredura só precisaria continuar.
            rooms.onMessage(visitor, "{\"type\":\"lookup-room\",\"requestId\":\"ok\",\"code\":\"" + code + "\"}");
            assertTrue(next(visitor, "request-error").get("text").getAsString().startsWith("Muitas tentativas"));
            rooms.onMessage(visitor, "{\"type\":\"join\",\"code\":\"" + code + "\",\"name\":\"Bia\",\"deck\":\"verde\"}");
            assertTrue(next(visitor, "error").get("text").getAsString().startsWith("Muitas tentativas"));
        } finally {
            for (EmbeddedChannel ch : new EmbeddedChannel[]{ana, visitor}) { rooms.onMessage(ch, "{\"type\":\"leave\"}"); ch.finishAndReleaseAll(); }
        }
    }

    private static String hostMessage(String name, String code) {
        return "{\"type\":\"host\",\"name\":\"" + name + "\",\"deck\":\"verde\",\"config\":" + CONFIG + ",\"code\":\"" + code + "\"}";
    }

    @Test public void hostCanChooseTheRoomCode() throws Exception {
        Rooms rooms = new Rooms();
        EmbeddedChannel ana = new EmbeddedChannel(), bia = new EmbeddedChannel(), visitor = new EmbeddedChannel();
        try {
            // O código escolhido pode usar as letras e números que o sorteio evita (O, 0, I, 1).
            rooms.onMessage(ana, hostMessage("Ana", " bo1o "));
            assertEquals("BO1O", next(ana, "room").getAsJsonObject("room").get("code").getAsString());
            rooms.onMessage(visitor, "{\"type\":\"lookup-room\",\"requestId\":\"r1\",\"code\":\"bo1o\"}");
            assertEquals("BO1O", next(visitor, "room-info").getAsJsonObject("room").get("code").getAsString());

            rooms.onMessage(bia, hostMessage("Bia", "BO1O"));
            assertTrue(next(bia, "error").get("text").getAsString().contains("já está em uso"));
            rooms.onMessage(bia, hostMessage("Bia", "AB-1"));
            assertTrue(next(bia, "error").get("text").getAsString().startsWith("O código da sala precisa"));
            // Vazio, sorteia como sempre.
            rooms.onMessage(bia, hostMessage("Bia", ""));
            assertEquals(4, next(bia, "room").getAsJsonObject("room").get("code").getAsString().length());
        } finally {
            for (EmbeddedChannel ch : new EmbeddedChannel[]{ana, bia, visitor}) { rooms.onMessage(ch, "{\"type\":\"leave\"}"); ch.finishAndReleaseAll(); }
        }
    }

    @Test public void waitingRoomShowsCoversCommandersAndQuickMessages() throws Exception {
        Rooms rooms = new Rooms();
        EmbeddedChannel ana = new EmbeddedChannel(), bia = new EmbeddedChannel(), caio = new EmbeddedChannel();
        try {
            rooms.onMessage(ana, "{\"type\":\"host\",\"name\":\"Ana\",\"deck\":\"vermelho\",\"cover\":\"Raging Goblin\",\"config\":{\"format\":\"free\",\"matchLength\":\"bo1\",\"playerCount\":2}}");
            JsonObject room = next(ana, "room").getAsJsonObject("room");
            assertEquals("Raging Goblin", room.getAsJsonArray("players").get(0).getAsJsonObject().get("cover").getAsString());

            // Uma capa que não está no deck é ignorada: a sala não mostra cartas que o jogador não tem.
            rooms.onMessage(bia, "{\"type\":\"host\",\"name\":\"Bia\",\"deck\":\"commander-dragoes\",\"cover\":\"Black Lotus\",\"config\":{\"format\":\"commander\",\"matchLength\":\"bo1\",\"playerCount\":3}}");
            room = next(bia, "room").getAsJsonObject("room");
            JsonObject host = room.getAsJsonArray("players").get(0).getAsJsonObject();
            assertEquals("Atarka, World Render", host.get("commander").getAsString());
            assertEquals("No Commander, a capa é o comandante", "Atarka, World Render", host.get("cover").getAsString());

            rooms.onMessage(caio, "{\"type\":\"join\",\"code\":\"" + room.get("code").getAsString() + "\",\"name\":\"Caio\",\"deck\":\"commander-zumbis\",\"cover\":\"Black Lotus\"}");
            next(caio, "room");
            rooms.onMessage(caio, "{\"type\":\"room-say\",\"key\":\"hello\"}");
            JsonObject said = next(bia, "room-say");
            assertEquals(1, said.get("seat").getAsInt());
            assertEquals("hello", said.get("key").getAsString());
            assertEquals("Quem mandou também vê o balão", "hello", next(caio, "room-say").get("key").getAsString());
            rooms.onMessage(caio, "{\"type\":\"room-say\",\"key\":\"qualquer coisa\"}");
            assertEquals("Mensagem desconhecida.", next(caio, "error").get("text").getAsString());
        } finally {
            for (EmbeddedChannel ch : new EmbeddedChannel[]{ana, bia, caio}) { rooms.onMessage(ch, "{\"type\":\"leave\"}"); ch.finishAndReleaseAll(); }
        }
    }

    @Test public void choosingTakenCodesCountsAsWrongGuesses() throws Exception {
        Rooms rooms = new Rooms();
        EmbeddedChannel ana = new EmbeddedChannel(), visitor = new EmbeddedChannel();
        try {
            String code = host(rooms, ana, "Ana", null);
            for (int i = 0; i < 10; i++) {
                rooms.onMessage(visitor, hostMessage("Bia", code));
                assertTrue(next(visitor, "error").get("text").getAsString().contains("já está em uso"));
            }
            // Senão daria para achar as salas alheias criando salas com cada código.
            rooms.onMessage(visitor, hostMessage("Bia", code));
            assertTrue(next(visitor, "error").get("text").getAsString().startsWith("Muitas tentativas"));
            rooms.onMessage(visitor, "{\"type\":\"lookup-room\",\"requestId\":\"ok\",\"code\":\"" + code + "\"}");
            assertTrue("A busca também fica bloqueada", next(visitor, "request-error").get("text").getAsString().startsWith("Muitas tentativas"));
        } finally {
            for (EmbeddedChannel ch : new EmbeddedChannel[]{ana, visitor}) { rooms.onMessage(ch, "{\"type\":\"leave\"}"); ch.finishAndReleaseAll(); }
        }
    }
}
