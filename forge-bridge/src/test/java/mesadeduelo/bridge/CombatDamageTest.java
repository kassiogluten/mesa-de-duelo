package mesadeduelo.bridge;

import static org.junit.Assert.*;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.Test;

public class CombatDamageTest {
    /** Two blockers with lethal 2 and 3, optionally a trampled defender. */
    private static JsonObject question(int total, boolean ordered, boolean defender) {
        JsonObject q = new JsonObject();
        q.addProperty("total", total); q.addProperty("ordered", ordered); q.addProperty("free", false);
        JsonArray rows = new JsonArray();
        for (int lethal : new int[] {2, 3}) {
            JsonObject r = new JsonObject(); r.addProperty("min", 0); r.addProperty("max", total); r.addProperty("lethal", lethal); rows.add(r);
        }
        if (defender) { JsonObject r = new JsonObject(); r.addProperty("min", 0); r.addProperty("max", total); r.addProperty("defender", true); rows.add(r); }
        q.add("options", rows);
        return q;
    }
    private static JsonArray amounts(String json) { return JsonParser.parseString(json).getAsJsonArray(); }

    @Test public void autoGivesLethalInOrderAndTheRestToTheDefender() {
        assertArrayEquals(new int[] {2, 3, 2}, CombatDamage.auto(question(7, true, true)));
        assertArrayEquals(new int[] {2, 5}, CombatDamage.auto(question(7, true, false)));
        assertArrayEquals(new int[] {2, 1}, CombatDamage.auto(question(3, true, false)));
    }

    @Test public void orderedBlockersNeedLethalBeforeTheNext() {
        CombatDamage.validate(question(4, true, false), amounts("[2,2]"));
        CombatDamage.validate(question(4, true, false), amounts("[4,0]"));
        try { CombatDamage.validate(question(4, true, false), amounts("[1,3]")); fail(); }
        catch (IllegalArgumentException expected) { assertTrue(expected.getMessage().contains("letal")); }
        // Without ordering, any split among blockers is fine.
        CombatDamage.validate(question(4, false, false), amounts("[1,3]"));
    }

    @Test public void trampleOnlyAfterEveryBlockerHasLethal() {
        CombatDamage.validate(question(7, false, true), amounts("[2,3,2]"));
        try { CombatDamage.validate(question(7, false, true), amounts("[1,3,3]")); fail(); }
        catch (IllegalArgumentException expected) { assertTrue(expected.getMessage().contains("defensor")); }
        try { CombatDamage.validate(question(7, false, true), amounts("[2,3,1]")); fail(); }
        catch (IllegalArgumentException expected) { assertTrue(expected.getMessage().contains("quantidade")); }
    }
}
