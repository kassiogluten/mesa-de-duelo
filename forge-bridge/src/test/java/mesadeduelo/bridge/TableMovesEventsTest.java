package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.List;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.event.GameEventFlipCoin;
import forge.game.event.GameEventRollDie;
import forge.game.event.GameEventScry;
import forge.game.player.Player;
import forge.game.player.PlayerView;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

/** Os eventos que a mesa anima além de jogar, resolver e sair do campo: embaralhar, vidência, moeda, dado, anexar, controle, luta e busca. */
public class TableMovesEventsTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static List<JsonObject> events(VisibleEvents events) {
        return events.json(0).asList().stream().map(e -> e.getAsJsonObject()).toList();
    }
    private static List<JsonObject> of(VisibleEvents events, String type) {
        return events(events).stream().filter(e -> type.equals(e.get("type").getAsString())).toList();
    }
    private static VisibleEvents watch(Game game) { VisibleEvents events = new VisibleEvents(() -> {}, () -> 1); events.attach(game); return events; }

    @Test public void shuffleSaysWhoseLibraryWithoutAFrame() {
        Game game = ExilePermissionsTest.game(); Player a = game.getPlayers().get(0);
        ExilePermissionsTest.add(game, "Forest", a, ZoneType.Library);
        VisibleEvents events = watch(game);
        a.shuffle(null);
        JsonObject e = of(events, "shuffle").get(0);
        assertEquals(a.getId(), e.get("actor").getAsInt());
        assertFalse(e.has("frame"));
    }

    @Test public void scryCoinAndDieCarryTheirResults() {
        Game game = ExilePermissionsTest.game(); Player a = game.getPlayers().get(0);
        VisibleEvents events = watch(game);
        game.fireEvent(new GameEventScry(PlayerView.get(a), 1, 2));
        game.fireEvent(new GameEventScry(PlayerView.get(a), 0, 0));
        game.fireEvent(new GameEventFlipCoin(a.getView(), false, false));
        game.fireEvent(new GameEventRollDie(20, 14));
        List<JsonObject> scry = of(events, "scry");
        assertEquals(1, scry.size());
        assertEquals(1, scry.get(0).get("top").getAsInt());
        assertEquals(2, scry.get(0).get("bottom").getAsInt());
        JsonObject coin = of(events, "coin").get(0);
        assertEquals(a.getId(), coin.get("actor").getAsInt());
        assertFalse(coin.get("heads").getAsBoolean());
        assertFalse(coin.has("startingToss"));
        JsonObject die = of(events, "die").get(0);
        assertEquals(20, die.get("sides").getAsInt());
        assertEquals(14, die.get("result").getAsInt());
    }

    @Test public void equipmentMovingToAnotherCreatureIsAttachedAndMoved() {
        Game game = ExilePermissionsTest.game(); Player a = game.getPlayers().get(0);
        Card bears = ExilePermissionsTest.add(game, "Grizzly Bears", a, ZoneType.Battlefield);
        Card giant = ExilePermissionsTest.add(game, "Hill Giant", a, ZoneType.Battlefield);
        Card blade = ExilePermissionsTest.add(game, "Bonesplitter", a, ZoneType.Battlefield);
        VisibleEvents events = watch(game);
        blade.attachToEntity(bears, null);
        blade.attachToEntity(giant, null);
        List<JsonObject> attached = of(events, "attached");
        assertEquals(2, attached.size());
        assertEquals(blade.getId(), attached.get(0).get("sourceId").getAsInt());
        assertEquals(bears.getId(), attached.get(0).getAsJsonObject("targets").getAsJsonArray("cards").get(0).getAsInt());
        assertFalse(attached.get(0).has("moved"));
        assertEquals(giant.getId(), attached.get(1).getAsJsonObject("targets").getAsJsonArray("cards").get(0).getAsInt());
        assertTrue(attached.get(1).get("moved").getAsBoolean());
    }

    @Test public void controlChangeSaysTheNewAndThePreviousController() {
        Game game = ExilePermissionsTest.game(); Player a = game.getPlayers().get(0), b = game.getPlayers().get(1);
        Card angel = ExilePermissionsTest.add(game, "Serra Angel", a, ZoneType.Battlefield);
        VisibleEvents events = watch(game);
        game.fireEvent(new forge.game.event.GameEventGameStarted(game.getRules().getGameType(), a, game.getPlayers()));
        angel.addTempController(b, game.getNextTimestamp());
        game.getAction().controllerChangeZoneCorrection(angel);
        JsonObject e = of(events, "control-changed").get(0);
        assertEquals(angel.getId(), e.get("sourceId").getAsInt());
        assertEquals(b.getId(), e.get("actor").getAsInt());
        assertEquals(a.getId(), e.get("previous").getAsInt());
        assertTrue(e.has("frame"));
        // Uma permanente que só entra no campo não troca de controle.
        ExilePermissionsTest.add(game, "Grizzly Bears", b, ZoneType.Battlefield);
        assertEquals(1, of(events, "control-changed").size());
    }

    @Test public void fightDamageIsMarked() {
        Game game = ExilePermissionsTest.game(); Player a = game.getPlayers().get(0), b = game.getPlayers().get(1);
        Card bears = ExilePermissionsTest.add(game, "Grizzly Bears", a, ZoneType.Battlefield);
        Card giant = ExilePermissionsTest.add(game, "Hill Giant", b, ZoneType.Battlefield);
        SpellAbility prey = VisibleEventsTest.spell(game, a, "Prey Upon");
        prey.getTargets().add(bears);
        prey.getSubAbility().getTargets().add(giant);
        VisibleEvents events = watch(game);
        game.getStack().add(prey);
        game.getStack().resolveStack();
        List<JsonObject> damage = of(events, "damage");
        assertEquals(2, damage.size());
        for (JsonObject e : damage) assertTrue(e.get("fight").getAsBoolean());
    }

    @Test public void tutorToHandIsASearchedDraw() {
        Game game = ExilePermissionsTest.game(); Player a = game.getPlayers().get(0);
        for (String name : List.of("Forest", "Grizzly Bears")) ExilePermissionsTest.add(game, name, a, ZoneType.Library);
        SpellAbility tutor = VisibleEventsTest.spell(game, a, "Diabolic Tutor");
        VisibleEvents events = watch(game);
        game.getStack().add(tutor);
        game.getStack().resolveStack();
        JsonObject draw = of(events, "draw").get(0);
        assertTrue(draw.get("searched").getAsBoolean());
        assertFalse(draw.has("card"));
    }
}
