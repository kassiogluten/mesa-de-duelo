package mesadeduelo.bridge;

import static org.junit.Assert.*;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

public class RingTemptsTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    /** The Ring tempts you twice: the player carries the count and the chosen creature is marked as the Ring-bearer. */
    @Test public void temptCountAndRingBearerReachTheJson() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0);
        Card bears = ExilePermissionsTest.add(game, "Grizzly Bears", me, ZoneType.Battlefield);
        assertFalse(StateJson.player(me.getView(), true, game).has("ringTempted"));
        assertFalse(StateJson.card(bears.getView(), game).has("ringBearer"));

        for (int i = 1; i <= 2; i++) { me.incrementRingTemptedYou(); me.setRingLevel(i); }
        me.setRingBearer(bears);
        assertEquals(2, StateJson.player(me.getView(), true, game).get("ringTempted").getAsInt());
        assertTrue(StateJson.card(bears.getView(), game).get("ringBearer").getAsBoolean());
        // O Anel é um efeito na zona de comando, não um emblema: não aparece entre os emblemas.
        assertEquals(0, StateJson.player(me.getView(), true, game).getAsJsonArray("emblems").size());

        me.clearRingBearer();
        assertFalse(StateJson.card(bears.getView(), game).has("ringBearer"));
    }
}
