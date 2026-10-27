package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.List;
import com.google.gson.JsonObject;
import forge.game.phase.PhaseType;
import org.junit.BeforeClass;
import org.junit.Test;

public class TurnExtrasTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    @Test public void noExtrasMeansNoFields() {
        var game = ExilePermissionsTest.game();
        JsonObject o = new JsonObject(); TurnExtras.add(o, game);
        assertFalse(o.toString(), o.has("extraTurn") || o.has("extraTurns") || o.has("extraCombats"));
    }

    @Test public void queuedExtraTurnsComeInPlayOrder() {
        var game = ExilePermissionsTest.game();
        var me = game.getPlayers().get(0); var them = game.getPlayers().get(1);
        game.getPhaseHandler().addExtraTurn(them);
        game.getPhaseHandler().addExtraTurn(me);
        JsonObject o = new JsonObject(); TurnExtras.add(o, game);
        // The last one added plays first (Time Walk on top of the stack).
        assertEquals("[" + me.getId() + "," + them.getId() + "]", o.get("extraTurns").toString());
    }

    @Test public void pendingExtraCombatIsCounted() {
        var game = ExilePermissionsTest.game();
        var combat = List.of(PhaseType.COMBAT_BEGIN, PhaseType.COMBAT_DECLARE_ATTACKERS, PhaseType.COMBAT_DECLARE_BLOCKERS,
            PhaseType.COMBAT_FIRST_STRIKE_DAMAGE, PhaseType.COMBAT_DAMAGE, PhaseType.COMBAT_END, PhaseType.MAIN2);
        game.getPhaseHandler().addExtraPhase(PhaseType.MAIN2, combat, PhaseType.END_OF_TURN);
        JsonObject o = new JsonObject(); TurnExtras.add(o, game);
        assertEquals(1, o.get("extraCombats").getAsInt());
        assertEquals("[\"MAIN2\"]", o.get("extraCombatAfter").toString());
    }

    @Test public void extraUpkeepsAfterCombatPointBackToTheSecondMain() {
        var game = ExilePermissionsTest.game();
        game.getPhaseHandler().addExtraPhase(PhaseType.COMBAT_END, List.of(PhaseType.UPKEEP), PhaseType.MAIN2);
        JsonObject o = new JsonObject(); TurnExtras.add(o, game);
        assertEquals("{\"UPKEEP\":\"MAIN2\",\"COMBAT_END\":\"UPKEEP\"}", o.get("extraPhaseAfter").toString());
    }

    @Test public void extraUpkeepBeforeTheDrawOnlyNamesTheRepeat() {
        var game = ExilePermissionsTest.game();
        game.getPhaseHandler().addExtraPhase(PhaseType.UPKEEP, List.of(PhaseType.UPKEEP), PhaseType.DRAW);
        JsonObject o = new JsonObject(); TurnExtras.add(o, game);
        assertEquals("{\"UPKEEP\":\"UPKEEP\"}", o.get("extraPhaseAfter").toString());
    }

    @Test public void dayAndNightOnlyGoOnceTheGameHasOne() {
        var game = ExilePermissionsTest.game();
        JsonObject none = new JsonObject(); StateJson.dayNight(none, game);
        assertFalse(none.toString(), none.has("dayTime") || none.has("activeSpells"));

        game.setDayTime(false);
        JsonObject day = new JsonObject(); StateJson.dayNight(day, game);
        assertEquals("day", day.get("dayTime").getAsString());
        assertEquals(0, day.get("activeSpells").getAsInt());

        game.setDayTime(true);
        JsonObject night = new JsonObject(); StateJson.dayNight(night, game);
        assertEquals("night", night.get("dayTime").getAsString());
    }
}
