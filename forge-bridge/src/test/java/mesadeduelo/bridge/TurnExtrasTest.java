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
}
