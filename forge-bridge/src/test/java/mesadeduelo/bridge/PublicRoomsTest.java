package mesadeduelo.bridge;

import static org.junit.Assert.*;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import org.junit.BeforeClass;
import org.junit.Test;

/** Só as salas públicas entram na lista da tela inicial, abertas ou em andamento; as privadas continuam só pelo código. */
public class PublicRoomsTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static final String CONFIG = "{\"format\":\"free\",\"matchLength\":\"bo1\"}";
    /** Decks pequenos de terrenos básicos: a lista que importa aqui é a de salas, não o jogo. */
    private static final String RED = "{\"name\":\"Vermelho\",\"cards\":[{\"name\":\"Mountain\",\"count\":60}]}";
    private static final String GREEN = "{\"name\":\"Verde\",\"cards\":[{\"name\":\"Forest\",\"count\":60}]}";

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
        rooms.onMessage(ch, "{\"type\":\"host\",\"name\":\"" + name + "\",\"deck\":" + RED + ",\"config\":" + CONFIG
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

            // Sala que não existe: o motivo vem à parte, para o link de convite oferecer criá-la.
            rooms.onMessage(visitor, "{\"type\":\"lookup-room\",\"requestId\":\"r3\",\"code\":\"1O1O\"}");
            JsonObject missing = next(visitor, "request-error");
            assertEquals("r3", missing.get("requestId").getAsString());
            assertEquals("room-not-found", missing.get("reason").getAsString());

            // Cheia, a partida começa e a sala continua na lista, agora para assistir.
            rooms.onMessage(visitor, "{\"type\":\"join\",\"code\":\"" + open + "\",\"name\":\"Dora\",\"deck\":" + GREEN + "}");
            next(visitor, "room");
            JsonArray playing = list(rooms, caio);
            assertEquals(1, playing.size());
            assertTrue(playing.get(0).getAsJsonObject().get("started").getAsBoolean());
            assertEquals(2, playing.get(0).getAsJsonObject().get("players").getAsInt());
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

    /** O primeiro estado de partida que chegar, descartando os outros. */
    private static JsonObject state(EmbeddedChannel ch) throws InterruptedException {
        long until = System.currentTimeMillis() + 30_000;
        while (System.currentTimeMillis() < until) {
            JsonObject s = next(ch, "state");
            if (s.has("players")) return s;
        }
        throw new AssertionError("Sem estado de partida");
    }

    @Test public void spectatorsWatchStartedRoomsWithoutHandsOrControls() throws Exception {
        Rooms rooms = new Rooms();
        EmbeddedChannel ana = new EmbeddedChannel(), bia = new EmbeddedChannel(), eva = new EmbeddedChannel();
        try {
            String code = host(rooms, ana, "Ana", null);
            // Antes de começar não há o que assistir: quem chega entra para jogar.
            rooms.onMessage(eva, "{\"type\":\"watch\",\"code\":\"" + code + "\",\"name\":\"Eva\"}");
            assertTrue(next(eva, "error").get("text").getAsString().contains("ainda não começou"));

            rooms.onMessage(bia, "{\"type\":\"join\",\"code\":\"" + code + "\",\"name\":\"Bia\",\"deck\":" + GREEN + "}");
            JsonObject first = state(ana);
            // Sala privada: quem tem o código pode assistir.
            rooms.onMessage(eva, "{\"type\":\"watch\",\"code\":\"" + code.toLowerCase() + "\",\"name\":\"Eva\"}");
            JsonObject seen = state(eva);
            assertTrue(seen.get("watching").getAsBoolean());
            assertTrue(seen.get("spectating").getAsBoolean());
            assertFalse("Sem token para tomar um assento", seen.toString().contains("token"));
            assertFalse(seen.has("session"));
            assertFalse(seen.has("question"));
            assertFalse(seen.getAsJsonObject("input").getAsJsonObject("ok").get("enabled").getAsBoolean());
            assertEquals(-1, seen.getAsJsonObject("room").get("seat").getAsInt());
            int anaId = first.get("you").getAsInt(), biaId = -1;
            assertEquals("Começa pela mesa do anfitrião", anaId, seen.get("you").getAsInt());
            for (var p : seen.getAsJsonArray("players")) {
                JsonObject player = p.getAsJsonObject();
                assertEquals("Nenhuma mão à vista", 0, player.getAsJsonArray("hand").size());
                assertTrue("Quantas cartas cada um tem continua à vista", player.has("handCount"));
                if (player.get("id").getAsInt() != anaId) biaId = player.get("id").getAsInt();
            }

            // Os jogadores veem quem assiste.
            JsonObject withEva;
            do withEva = state(ana); while (withEva.getAsJsonObject("room").getAsJsonArray("spectators").isEmpty());
            assertEquals("Eva", withEva.getAsJsonObject("room").getAsJsonArray("spectators").get(0).getAsString());

            rooms.onMessage(eva, "{\"type\":\"watch-player\",\"player\":" + biaId + "}");
            JsonObject other;
            do other = state(eva); while (other.get("you").getAsInt() != biaId);
            for (var p : other.getAsJsonArray("players")) assertEquals(0, p.getAsJsonObject().getAsJsonArray("hand").size());

            // Comandos de jogo do espectador são ignorados, e sair não derruba a partida.
            rooms.onMessage(eva, "{\"type\":\"concede\"}");
            rooms.onMessage(eva, "{\"type\":\"leave\"}");
            JsonObject after;
            do after = state(ana); while (!after.getAsJsonObject("room").getAsJsonArray("spectators").isEmpty());
            assertFalse(after.get("gameOver").getAsBoolean());
        } finally {
            for (EmbeddedChannel ch : new EmbeddedChannel[]{ana, bia, eva}) { rooms.onMessage(ch, "{\"type\":\"leave\"}"); ch.finishAndReleaseAll(); }
        }
    }

    @Test public void spectatorsAreSentHomeWhenTheRoomCloses() throws Exception {
        Rooms rooms = new Rooms();
        EmbeddedChannel ana = new EmbeddedChannel(), bia = new EmbeddedChannel(), eva = new EmbeddedChannel();
        try {
            String code = host(rooms, ana, "Ana", "public");
            rooms.onMessage(bia, "{\"type\":\"join\",\"code\":\"" + code + "\",\"name\":\"Bia\",\"deck\":" + GREEN + "}");
            state(ana);
            rooms.onMessage(eva, "{\"type\":\"watch\",\"code\":\"" + code + "\",\"name\":\"Eva\"}");
            state(eva);
            assertEquals(1, list(rooms, eva).get(0).getAsJsonObject().get("spectators").getAsInt());
            rooms.onMessage(ana, "{\"type\":\"leave\"}");
            rooms.onMessage(bia, "{\"type\":\"leave\"}");
            assertTrue(next(eva, "gone").get("text").getAsString().contains("terminou"));
        } finally {
            for (EmbeddedChannel ch : new EmbeddedChannel[]{ana, bia, eva}) { rooms.onMessage(ch, "{\"type\":\"leave\"}"); ch.finishAndReleaseAll(); }
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
            rooms.onMessage(visitor, "{\"type\":\"join\",\"code\":\"" + code + "\",\"name\":\"Bia\",\"deck\":" + GREEN + "}");
            assertTrue(next(visitor, "error").get("text").getAsString().startsWith("Muitas tentativas"));
        } finally {
            for (EmbeddedChannel ch : new EmbeddedChannel[]{ana, visitor}) { rooms.onMessage(ch, "{\"type\":\"leave\"}"); ch.finishAndReleaseAll(); }
        }
    }

    private static String hostMessage(String name, String code) {
        return "{\"type\":\"host\",\"name\":\"" + name + "\",\"deck\":" + GREEN + ",\"config\":" + CONFIG + ",\"code\":\"" + code + "\"}";
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
            rooms.onMessage(ana, "{\"type\":\"host\",\"name\":\"Ana\",\"deck\":{\"name\":\"Goblins\",\"cards\":[{\"name\":\"Mountain\",\"count\":56},{\"name\":\"Raging Goblin\",\"count\":4}]},\"cover\":\"Raging Goblin\",\"config\":{\"format\":\"free\",\"matchLength\":\"bo1\",\"playerCount\":2}}");
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

    @Test public void commanderSeatsShowTheirBracketInTheRoomAndTheList() throws Exception {
        Rooms rooms = new Rooms();
        EmbeddedChannel ana = new EmbeddedChannel(), bia = new EmbeddedChannel(), caio = new EmbeddedChannel(), visitor = new EmbeddedChannel();
        try {
            rooms.onMessage(ana, "{\"type\":\"host\",\"name\":\"Ana\",\"deck\":\"commander-dragoes\",\"bracket\":3,\"visibility\":\"public\",\"config\":{\"format\":\"commander\",\"matchLength\":\"bo1\",\"playerCount\":4}}");
            JsonObject room = next(ana, "room").getAsJsonObject("room");
            assertEquals(3, room.getAsJsonArray("players").get(0).getAsJsonObject().get("bracket").getAsInt());
            // Um valor fora de 1 a 5 vale como sem bracket.
            rooms.onMessage(bia, "{\"type\":\"join\",\"code\":\"" + room.get("code").getAsString() + "\",\"name\":\"Bia\",\"deck\":\"commander-zumbis\",\"bracket\":9}");
            room = next(bia, "room").getAsJsonObject("room");
            assertFalse(room.getAsJsonArray("players").get(1).getAsJsonObject().has("bracket"));
            rooms.onMessage(caio, "{\"type\":\"join\",\"code\":\"" + room.get("code").getAsString() + "\",\"name\":\"Caio\",\"deck\":\"commander-voadores\",\"bracket\":4}");
            next(caio, "room");
            assertEquals("[3,4]", list(rooms, visitor).get(0).getAsJsonObject().getAsJsonArray("brackets").toString());

            // Fora do Commander, não há bracket nem na sala nem na lista.
            EmbeddedChannel dani = new EmbeddedChannel();
            try {
                rooms.onMessage(dani, "{\"type\":\"host\",\"name\":\"Dani\",\"deck\":" + RED + ",\"bracket\":2,\"config\":" + CONFIG + "}");
                assertFalse(next(dani, "room").getAsJsonObject("room").getAsJsonArray("players").get(0).getAsJsonObject().has("bracket"));
            } finally { rooms.onMessage(dani, "{\"type\":\"leave\"}"); dani.finishAndReleaseAll(); }
        } finally {
            for (EmbeddedChannel ch : new EmbeddedChannel[]{ana, bia, caio, visitor}) { rooms.onMessage(ch, "{\"type\":\"leave\"}"); ch.finishAndReleaseAll(); }
        }
    }

    @Test public void matchStateCarriesEachPlayersBracketAgainstTheComputer() throws Exception {
        Rooms rooms = new Rooms();
        EmbeddedChannel ana = new EmbeddedChannel();
        try {
            // Um oponente escolhido pela mesa (com o bracket junto) e um deck pronto pelo id (o bracket conferido dele).
            String chosen = "{\"name\":\"Voadores\",\"bracket\":4,\"cards\":" + Decks.template("commander-voadores").get("cards") + ",\"commanders\":" + Decks.template("commander-voadores").get("commanders") + "}";
            rooms.onMessage(ana, "{\"type\":\"start\",\"you\":\"commander-dragoes\",\"bracket\":3,\"opponents\":[" + chosen + ",\"commander-goblins\"],\"config\":{\"format\":\"commander\",\"matchLength\":\"bo1\",\"playerCount\":3}}");
            JsonObject state = next(ana, "state");
            while (!state.has("players") || state.getAsJsonArray("players").isEmpty()) state = next(ana, "state");
            JsonArray players = state.getAsJsonArray("players");
            assertEquals(3, players.get(0).getAsJsonObject().get("bracket").getAsInt());
            assertEquals(4, players.get(1).getAsJsonObject().get("bracket").getAsInt());
            assertEquals(Decks.template("commander-goblins").get("bracket").getAsInt(), players.get(2).getAsJsonObject().get("bracket").getAsInt());
        } finally { rooms.onMessage(ana, "{\"type\":\"leave\"}"); ana.finishAndReleaseAll(); }
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
