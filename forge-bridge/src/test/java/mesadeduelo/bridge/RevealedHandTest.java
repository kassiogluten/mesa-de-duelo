package mesadeduelo.bridge;

import static org.junit.Assert.*;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

/** Mão revelada (Telepathy, Revelation, Seer's Vision): a ponte manda as cartas da mão para quem o Forge deixa ver. */
public class RevealedHandTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static JsonObject seat(Game game, int viewer, Player seat) {
        for (var row : StateJson.game(game.getView(), viewer, game).getAsJsonArray("players"))
            if (row.getAsJsonObject().get("id").getAsInt() == seat.getId()) return row.getAsJsonObject();
        throw new AssertionError("seat");
    }

    private static void hand(Game game, Player p, String... names) {
        for (Card c : p.getCardsIn(ZoneType.Hand)) p.getZone(ZoneType.Hand).remove(c);
        for (String name : names) ExilePermissionsTest.add(game, name, p, ZoneType.Hand);
    }

    private static int revealed(JsonObject row) { return row.has("revealedHand") ? row.getAsJsonArray("revealedHand").size() : 0; }

    @Test public void hiddenWithoutEffect() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0), opp = game.getPlayers().get(1);
        hand(game, opp, "Lightning Bolt", "Mountain");
        game.getAction().checkStaticAbilities(false);
        JsonObject row = seat(game, me.getId(), opp);
        assertEquals(2, row.get("handCount").getAsInt());
        assertEquals(0, row.getAsJsonArray("hand").size());
        assertFalse(row.has("revealedHand"));
    }

    @Test public void telepathyRevealsOpponentsHandToEveryone() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0), opp = game.getPlayers().get(1);
        hand(game, opp, "Lightning Bolt", "Mountain");
        hand(game, me, "Savannah Lions");
        Card telepathy = ExilePermissionsTest.add(game, "Telepathy", me, ZoneType.Battlefield);
        game.getAction().checkStaticAbilities(false);

        JsonObject seen = seat(game, me.getId(), opp);
        assertEquals(2, revealed(seen));
        assertEquals("Lightning Bolt", seen.getAsJsonArray("revealedHand").get(0).getAsJsonObject().get("name").getAsString());
        assertEquals("playable hand stays the owner's", 0, seen.getAsJsonArray("hand").size());
        for (Card c : opp.getCardsIn(ZoneType.Hand))
            assertFalse("cannot cast the opponent's card", Castable.compute(me).contains(c.getId()));
        assertEquals("spectator sees what every player sees", 2, revealed(seat(game, -1, opp)));
        assertFalse("owner already has the hand", seat(game, opp.getId(), opp).has("revealedHand"));
        assertFalse("Telepathy only reveals opponents", seat(game, opp.getId(), me).has("revealedHand"));

        // O efeito saiu do campo: a mão volta a ficar escondida.
        game.getAction().moveToGraveyard(telepathy, null);
        game.getAction().checkStaticAbilities(false);
        assertFalse(seat(game, me.getId(), opp).has("revealedHand"));
        assertFalse(seat(game, -1, opp).has("revealedHand"));
    }

    @Test public void revelationRevealsEveryHand() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0), opp = game.getPlayers().get(1);
        hand(game, opp, "Lightning Bolt");
        hand(game, me, "Savannah Lions");
        ExilePermissionsTest.add(game, "Revelation", me, ZoneType.Battlefield);
        game.getAction().checkStaticAbilities(false);
        assertEquals(1, revealed(seat(game, me.getId(), opp)));
        assertEquals(1, revealed(seat(game, opp.getId(), me)));
    }

    @Test public void commanderTelepathyRevealsEveryOpponentButNotTheController() {
        Game game = CommanderEngineTest.game(4);
        Player me = game.getPlayers().get(0);
        for (Player p : game.getPlayers()) hand(game, p, "Plains", "Lightning Bolt");
        ExilePermissionsTest.add(game, "Telepathy", me, ZoneType.Battlefield);
        game.getAction().checkStaticAbilities(false);
        for (Player p : game.getPlayers()) {
            if (p == me) continue;
            assertEquals(2, revealed(seat(game, me.getId(), p)));
            for (Player other : game.getPlayers()) if (other != p) assertEquals("revealed is public", 2, revealed(seat(game, other.getId(), p)));
            assertFalse(seat(game, p.getId(), me).has("revealedHand"));
        }
        assertFalse(seat(game, -1, me).has("revealedHand"));
    }
}
