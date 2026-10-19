package mesadeduelo.bridge;

import static org.junit.Assert.*;
import forge.game.card.CounterEnumType;
import org.junit.BeforeClass;
import org.junit.Test;

public class PlayerCountersTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    @Test public void poisonAndEnergyReachThePlayerJsonOnlyWhenPresent() {
        var game = ExilePermissionsTest.game(); var me = game.getPlayers().get(0);
        assertFalse(StateJson.player(me.getView(), true, game).has("counters"));
        me.setCounters(CounterEnumType.POISON, 3, me, false);
        me.setCounters(CounterEnumType.ENERGY, 2, me, false);
        var counters = StateJson.player(me.getView(), true, game).getAsJsonObject("counters");
        assertEquals(3, counters.get("POISON").getAsInt());
        assertEquals(2, counters.get("ENERGY").getAsInt());
    }

    @Test public void radiationAndContractUseTheNamesTheTableTranslates() {
        var game = ExilePermissionsTest.game(); var me = game.getPlayers().get(0);
        me.setCounters(CounterEnumType.RAD, 3, me, false);
        me.setCounters(CounterEnumType.CONTRACT, 1, me, false);
        var counters = StateJson.player(me.getView(), true, game).getAsJsonObject("counters");
        assertEquals(3, counters.get("RAD").getAsInt());
        assertEquals(1, counters.get("CONTRACT").getAsInt());
    }
}
