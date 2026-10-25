package mesadeduelo.bridge;

import static org.junit.Assert.*;

import java.util.ArrayList;
import java.util.List;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.StaticData;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.card.CardFactory;
import forge.game.player.Player;
import forge.game.trigger.Trigger;
import forge.game.trigger.WrappedAbility;
import org.junit.BeforeClass;
import org.junit.Test;

public class DungeonsTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    static Card dungeon(Game game, Player owner, String script) {
        Card d = CardFactory.getCard(StaticData.instance().getAllTokens().getToken(script), owner, game);
        game.getAction().moveToCommand(d, null);
        return d;
    }

    /** Undercity: o mapa vai com as salas na ordem do card, a sala atual e a iniciativa; não vira emblema nem comandante. */
    @Test public void dungeonMapCurrentRoomAndInitiativeReachTheJson() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0);
        JsonObject before = StateJson.player(me.getView(), true, game);
        assertFalse(before.has("dungeon")); assertFalse(before.has("initiative"));

        Card d = dungeon(game, me, "undercity");
        d.setCurrentRoom("Forge");
        game.setHasInitiative(me);
        JsonObject o = StateJson.player(me.getView(), true, game);
        JsonObject json = o.getAsJsonObject("dungeon");
        assertEquals("Undercity", json.get("name").getAsString());
        assertEquals("Forge", json.get("room").getAsString());
        JsonArray rooms = json.getAsJsonArray("rooms");
        assertEquals(9, rooms.size());
        assertEquals("Secret Entrance", rooms.get(0).getAsJsonObject().get("name").getAsString());
        assertEquals("[\"Forge\",\"Lost Well\"]", rooms.get(0).getAsJsonObject().get("next").toString());
        assertEquals("Put two +1/+1 counters on target creature.", rooms.get(1).getAsJsonObject().get("text").getAsString());
        assertEquals(0, rooms.get(8).getAsJsonObject().getAsJsonArray("next").size());
        assertTrue(o.get("initiative").getAsBoolean());
        assertEquals(0, o.getAsJsonArray("emblems").size());
        assertEquals(0, o.getAsJsonArray("commandZone").size());
        assertFalse(StateJson.player(game.getPlayers().get(1).getView(), true, game).has("initiative"));
    }

    /** A escolha da próxima sala vira "dungeon-room", com o nome da sala no rótulo e o efeito à parte. */
    @Test public void nextRoomChoiceIsLabelledByRoom() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0);
        Card d = dungeon(game, me, "lost_mine_of_phandelver");
        List<Object> options = new ArrayList<>();
        for (Trigger t : d.getTriggers()) {
            String room = t.getOverridingAbility().getParam("RoomName");
            if (room.equals("Goblin Lair") || room.equals("Mine Tunnels")) options.add(new WrappedAbility(t, t.getOverridingAbility(), me).getView());
        }
        assertEquals(2, options.size());
        JsonArray rows = new JsonArray();
        for (Object ignored : options) { JsonObject row = new JsonObject(); row.addProperty("label", "?"); rows.add(row); }
        JsonObject q = new JsonObject();
        assertTrue(Dungeons.roomChoice(game, options, rows, q));
        assertEquals("dungeon-room", q.get("purpose").getAsString());
        assertEquals(me.getId(), q.get("dungeonOwner").getAsInt());
        assertEquals("Goblin Lair", rows.get(0).getAsJsonObject().get("room").getAsString());
        assertEquals("Create a Treasure token.", rows.get(1).getAsJsonObject().get("ability").getAsString());

        // Habilidades que não são de masmorra continuam como estavam.
        assertFalse(Dungeons.roomChoice(game, List.of("Sim"), new JsonArray(), new JsonObject()));
    }
}
