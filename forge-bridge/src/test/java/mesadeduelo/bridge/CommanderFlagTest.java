package mesadeduelo.bridge;

import static org.junit.Assert.*;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

public class CommanderFlagTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    @Test public void commanderOnTheBattlefieldIsFlagged() {
        var game = ExilePermissionsTest.game(); var me = game.getPlayers().get(0);
        var ghalta = ExilePermissionsTest.add(game, "Ghalta, Primal Hunger", me, ZoneType.Battlefield);
        var bears = ExilePermissionsTest.add(game, "Grizzly Bears", me, ZoneType.Battlefield);
        ghalta.setCommander(true);
        assertTrue(StateJson.card(ghalta.getView(), game).get("commander").getAsBoolean());
        assertFalse(StateJson.card(bears.getView(), game).has("commander"));
    }
}
