package mesadeduelo.bridge;

import static org.junit.Assert.*;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

public class ClassLevelTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    @Test public void classCardsCarryCurrentAndHighestLevel() {
        var game = ExilePermissionsTest.game(); var me = game.getPlayers().get(0);
        var card = ExilePermissionsTest.add(game, "Druid Class", me, ZoneType.Battlefield);
        var json = StateJson.card(card.getView(), game);
        assertEquals(1, json.get("classLevel").getAsInt());
        assertEquals(3, json.get("classMaxLevel").getAsInt());
        card.setClassLevel(2);
        assertEquals(2, StateJson.card(card.getView(), game).get("classLevel").getAsInt());
        assertFalse(StateJson.card(ExilePermissionsTest.add(game, "Llanowar Elves", me, ZoneType.Battlefield).getView(), game).has("classLevel"));
    }

    @Test public void levelUpIsItsOwnPlayMode() {
        var game = ExilePermissionsTest.game(); var me = game.getPlayers().get(0);
        var card = ExilePermissionsTest.add(game, "Druid Class", me, ZoneType.Battlefield);
        var modes = card.getSpellAbilities().stream().map(AbilityOptions::mode).toList();
        assertEquals(modes.toString(), 2, modes.stream().filter("class-level"::equals).count());
    }
}
