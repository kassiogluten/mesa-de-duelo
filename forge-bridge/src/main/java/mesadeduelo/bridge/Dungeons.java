package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.StaticData;
import forge.card.CardRules;
import forge.game.Game;
import forge.game.card.CardFaceView;
import forge.game.card.CardFactory;
import forge.item.PaperToken;
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
 * as masmorras completadas e quem tem a iniciativa. Também deixa legíveis a escolha da masmorra e a da próxima sala.
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

    /** A masmorra como a mesa a desenha: nome, imagem, sala atual (se já entrou) e as salas. */
    static JsonObject json(Card c) {
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
        return d;
    }

    /**
     * Escolha de qual masmorra entrar (se aventurar sem masmorra em andamento): o Forge manda só os nomes. Cada
     * linha ganha a carta da masmorra (com a imagem, para a mesa mostrar as cartas lado a lado e ampliar) e as
     * salas. As cartas são montadas na partida, fora de qualquer zona, só para a escolha.
     */
    static boolean dungeonChoice(Game game, Player player, List<Object> options, JsonArray rows, JsonObject q) {
        if (game == null || player == null || options.isEmpty() || !options.stream().allMatch(o -> o instanceof CardFaceView)) return false;
        Map<String, String> scripts = new LinkedHashMap<>();
        for (Map.Entry<String, CardRules> e : StaticData.instance().getAllTokens().getRules().entrySet())
            if (e.getValue().getType().isDungeon()) scripts.putIfAbsent(e.getValue().getMainPart().getName(), e.getKey());
        List<Card> found = new ArrayList<>();
        for (Object o : options) {
            String script = scripts.get(((CardFaceView) o).getName());
            PaperToken token = script == null ? null : StaticData.instance().getAllTokens().getToken(script);
            if (token == null) return false;
            found.add(CardFactory.getCard(token, player, game));
        }
        for (int i = 0; i < found.size(); i++) {
            JsonObject row = rows.get(i).getAsJsonObject();
            row.addProperty("kind", "card");
            row.add("card", StateJson.card(found.get(i).getView()));
            row.add("dungeon", json(found.get(i)));
        }
        q.addProperty("purpose", "dungeon-choice");
        q.addProperty("title", "Em qual masmorra você vai se aventurar?");
        return true;
    }

    /** Acrescenta dungeon, completedDungeons e initiative ao jogador, só quando existem. */
    static void add(JsonObject o, PlayerView p, Game game) {
        if (game == null) return;
        Player player = game.getPlayer(p);
        if (player == null) return;
        for (Card c : player.getCardsIn(ZoneType.Command)) {
            if (!c.getType().isDungeon()) continue;
            o.add("dungeon", json(c));
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
        // A carta da masmorra vai ao lado do mapa (no lugar da carta que mandou se aventurar), para ler e ampliar.
        q.add("card", StateJson.card(dungeon.getView()));
        return true;
    }
}
