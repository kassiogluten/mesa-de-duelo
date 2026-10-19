package mesadeduelo.bridge;

import static org.junit.Assert.*;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

public class AbilityOptionsTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }
    @Test public void realFireblastAlternativeShowsSacrificeInsteadOfIdenticalEffectText() {
        var game = ExilePermissionsTest.game(); var me = game.getPlayers().get(0);
        var card = ExilePermissionsTest.add(game, "Fireblast", me, ZoneType.Hand);
        ExilePermissionsTest.add(game, "Mountain", me, ZoneType.Battlefield);
        ExilePermissionsTest.add(game, "Mountain", me, ZoneType.Battlefield);
        game.getAction().checkStaticAbilities();
        var costs = card.getAllPossibleAbilities(me, false).stream().map(AbilityOptions::cost).toList();
        assertTrue(costs.toString(), costs.contains("{4}{R}{R}"));
        assertTrue(costs.toString(), costs.contains("sacrificar 2 Montanhas"));
        assertEquals(2, costs.stream().distinct().count());
    }

    @Test public void playOptionsNameTheirModeForTheTable() {
        var game = ExilePermissionsTest.game(); var me = game.getPlayers().get(0);
        var modes = new java.util.TreeMap<String, java.util.List<String>>();
        for (String name : new String[] {"Fireblast", "Slickshot Show-Off", "Bonecrusher Giant", "Desert Cerodon", "Faithless Looting"}) {
            var card = ExilePermissionsTest.add(game, name, me, ZoneType.Hand);
            modes.put(name, card.getAllPossibleAbilities(me, false).stream().map(AbilityOptions::mode).sorted().toList());
        }
        assertTrue(modes.toString(), modes.get("Slickshot Show-Off").containsAll(java.util.List.of("cast", "plot")));
        assertTrue(modes.toString(), modes.get("Bonecrusher Giant").containsAll(java.util.List.of("cast", "adventure")));
        assertTrue(modes.toString(), modes.get("Desert Cerodon").contains("cycling"));
    }
    @Test public void triggerTextDropsTheSourceName() {
        assertEquals("Whenever another creature enters, you gain 1 life.", AbilityOptions.abilityText("Soul Warden (12) - Whenever another creature enters, you gain 1 life.", "Soul Warden"));
        assertEquals("When this enters, draw a card.", AbilityOptions.abilityText("Elvish Visionary: When this enters, draw a card. [Targeting: you]", "Elvish Visionary"));
        assertEquals("Soul Warden's ability", AbilityOptions.abilityText("Soul Warden's ability", "Soul Warden"));
    }
}
