package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.game.Game;
import forge.game.card.Card;
import forge.game.card.CardView;
import forge.game.player.Player;
import forge.game.player.PlayerView;
import forge.game.spellability.SpellAbility;
import forge.game.spellability.SpellAbilityView;
import forge.game.trigger.Trigger;
import forge.game.zone.ZoneType;

/**
 * Masmorras (se aventurar, iniciativa): o mapa de salas da masmorra na zona de comando, a sala atual,
 * as masmorras completadas e quem tem a iniciativa. Também deixa legível a escolha da próxima sala.
 */
final class Dungeons {
    private Dungeons() { }

    record Room(String name, String text, List<String> next) { }

    /** Salas na ordem do card: a primeira é a entrada. Vazio quando a carta não é masmorra. */
    static List<Room> rooms(Card dungeon) {
        List<Room> rooms = new ArrayList<>();
        if (dungeon == null || !dungeon.getType().isDungeon()) return rooms;
        for (Trigger t : dungeon.getTriggers()) {
            SpellAbility sa = t.getOverridingAbility();
            if (sa == null || !sa.hasParam("RoomName")) continue;
            String next = sa.getParam("NextRoomName");
            rooms.add(new Room(sa.getParam("RoomName"), sa.hasParam("SpellDescription") ? sa.getParam("SpellDescription") : sa.getDescription(),
                    next == null || next.isEmpty() ? List.of() : List.of(next.split(","))));
        }
        return rooms;
    }

    /** Acrescenta dungeon, completedDungeons e initiative ao jogador, só quando existem. */
    static void add(JsonObject o, PlayerView p, Game game) {
        if (game == null) return;
        Player player = game.getPlayer(p);
        if (player == null) return;
        for (Card c : player.getCardsIn(ZoneType.Command)) {
            if (!c.getType().isDungeon()) continue;
            JsonObject d = new JsonObject();
            d.addProperty("id", c.getId());
            d.addProperty("name", c.getName());
            String image = StateJson.tokenImage(c.getView().getCurrentState());
            if (image != null) d.addProperty("image", image);
            String current = c.getCurrentRoom();
            if (current != null && !current.isEmpty()) d.addProperty("room", current);
            JsonArray rooms = new JsonArray();
            for (Room r : rooms(c)) {
                JsonObject row = new JsonObject();
                row.addProperty("name", r.name());
                row.addProperty("text", r.text());
                JsonArray next = new JsonArray();
                r.next().forEach(next::add);
                row.add("next", next);
                rooms.add(row);
            }
            d.add("rooms", rooms);
            o.add("dungeon", d);
            break;
        }
        if (!player.getCompletedDungeons().isEmpty()) {
            JsonArray done = new JsonArray();
            for (Card c : player.getCompletedDungeons()) done.add(c.getName());
            o.add("completedDungeons", done);
        }
        if (game.getHasInitiative() == player) o.addProperty("initiative", true);
    }

    /**
     * Escolha da próxima sala ("Qual sala você quer se aventurar?"): as opções chegam como habilidades
     * da masmorra. Cada linha passa a ter o nome da sala como rótulo e o efeito como texto.
     */
    static boolean roomChoice(Game game, List<Object> options, JsonArray rows, JsonObject q) {
        if (game == null || options.isEmpty() || !options.stream().allMatch(o -> o instanceof SpellAbilityView)) return false;
        CardView host = ((SpellAbilityView) options.get(0)).getHostCard();
        Card dungeon = host == null ? null : game.findByView(host);
        List<Room> rooms = rooms(dungeon);
        if (rooms.isEmpty()) return false;
        Map<Integer, Room> matched = new LinkedHashMap<>();
        for (int i = 0; i < options.size(); i++) {
            String description = String.valueOf(((SpellAbilityView) options.get(i)).getDescription());
            Room best = null;
            for (Room r : rooms) {
                if (!description.contains(r.text())) continue;
                if (best == null || description.contains(r.name())) best = r;
            }
            if (best == null) return false;
            matched.put(i, best);
        }
        for (var e : matched.entrySet()) {
            JsonObject row = rows.get(e.getKey()).getAsJsonObject();
            row.addProperty("label", e.getValue().name());
            row.addProperty("ability", e.getValue().text());
            row.addProperty("room", e.getValue().name());
        }
        q.addProperty("purpose", "dungeon-room");
        q.addProperty("title", "Para qual sala de " + dungeon.getName() + " você vai?");
        q.addProperty("dungeonOwner", dungeon.getOwner().getId());
        return true;
    }
}
