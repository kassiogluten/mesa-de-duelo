package mesadeduelo.bridge;

import static org.junit.Assert.*;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

public class LibraryTopTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    /** Grimório só com {@code top} em cima de uma Planície, o habilitador no campo e mana para conjurar. */
    private static Card setup(Game game, Player me, String enabler, String top) {
        for (Card c : me.getCardsIn(ZoneType.Library)) me.getZone(ZoneType.Library).remove(c);
        Card card = ExilePermissionsTest.add(game, top, me, ZoneType.Library);
        ExilePermissionsTest.add(game, "Plains", me, ZoneType.Library);
        if (enabler != null) ExilePermissionsTest.add(game, enabler, me, ZoneType.Battlefield);
        for (int i = 0; i < 6; i++) ExilePermissionsTest.add(game, "Plains", me, ZoneType.Battlefield);
        game.getAction().checkStaticAbilities(false);
        assertEquals("top of library", card, me.getCardsIn(ZoneType.Library).getFirst());
        return card;
    }

    private static JsonObject seat(Game game, int viewer, Player seat) {
        for (var row : StateJson.game(game.getView(), viewer, game).getAsJsonArray("players"))
            if (row.getAsJsonObject().get("id").getAsInt() == seat.getId()) return row.getAsJsonObject();
        throw new AssertionError("seat");
    }

    @Test public void hiddenWithoutPermission() {
        Game game = CommanderEngineTest.game(2); Player me = game.getPlayers().get(0);
        setup(game, me, null, "Savannah Lions");
        assertFalse(seat(game, me.getId(), me).has("libraryTop"));
        assertFalse(Castable.compute(me).contains(me.getCardsIn(ZoneType.Library).getFirst().getId()));
    }

    @Test public void lookAnyTimeShowsOnlyToTheOwnerAndCastsFromTop() {
        Game game = CommanderEngineTest.game(2); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        Card lions = setup(game, me, "Vizier of the Menagerie", "Savannah Lions");
        assertEquals(lions.getId(), seat(game, me.getId(), me).getAsJsonObject("libraryTop").get("id").getAsInt());
        assertEquals("Savannah Lions", seat(game, me.getId(), me).getAsJsonObject("libraryTop").get("name").getAsString());
        assertFalse("opponent", seat(game, other.getId(), me).has("libraryTop"));
        assertFalse("spectator", seat(game, -1, me).has("libraryTop"));
        assertTrue(Castable.compute(me).contains(lions.getId()));
    }

    @Test public void vizierDoesNotCastNonCreatures() {
        Game game = CommanderEngineTest.game(2); Player me = game.getPlayers().get(0);
        Card anthem = setup(game, me, "Vizier of the Menagerie", "Glorious Anthem");
        assertTrue(seat(game, me.getId(), me).has("libraryTop"));
        assertFalse(Castable.compute(me).contains(anthem.getId()));
    }

    @Test public void revealedTopIsPublicAndPlayable() {
        Game game = CommanderEngineTest.game(2); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        Card anthem = setup(game, me, "Future Sight", "Glorious Anthem");
        assertTrue(seat(game, other.getId(), me).has("libraryTop"));
        assertTrue("spectator", seat(game, -1, me).has("libraryTop"));
        assertTrue(Castable.compute(me).contains(anthem.getId()));
    }

    @Test public void courserPlaysTheTopLand() {
        Game game = CommanderEngineTest.game(2); Player me = game.getPlayers().get(0);
        Card forest = setup(game, me, "Courser of Kruphix", "Forest");
        assertTrue(seat(game, game.getPlayers().get(1).getId(), me).has("libraryTop"));
        assertTrue(Castable.compute(me).contains(forest.getId()));
    }
}
