package mesadeduelo.bridge;

import static org.junit.Assert.*;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.card.CounterEnumType;
import forge.game.combat.Combat;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

public class CombatForecastTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static Card add(Game game, String name, Player player) {
        Card card = ExilePermissionsTest.add(game, name, player, ZoneType.Battlefield); card.setSickness(false); return card;
    }

    private static Combat blocking(Game game, Player attacker) {
        game.getAction().checkStaticAbilities();
        game.getPhaseHandler().devModeSet(PhaseType.COMBAT_DECLARE_BLOCKERS, attacker);
        Combat combat = new Combat(attacker); game.getPhaseHandler().setCombat(combat); return combat;
    }

    private static JsonObject row(Game game, Player player) {
        JsonArray rows = CombatForecast.of(game);
        assertNotNull(rows);
        for (var r : rows) if (r.getAsJsonObject().get("player").getAsInt() == player.getId()) return r.getAsJsonObject();
        return null;
    }

    @Test public void unblockedTrampleAndDoubleStrikeUpdateWithEachBlock() {
        Game game = CommanderEngineTest.game(2); Player me = game.getPlayers().get(0), them = game.getPlayers().get(1);
        Card bears = add(game, "Grizzly Bears", me), dreadmaw = add(game, "Colossal Dreadmaw", me), swift = add(game, "Boros Swiftblade", me);
        Card wall = add(game, "Wall of Wood", them), blocker = add(game, "Grizzly Bears", them);
        Combat combat = blocking(game, me);
        for (Card c : new Card[]{bears, dreadmaw, swift}) combat.addAttacker(c, them);
        JsonObject row = row(game, them);
        assertEquals(40, row.get("life").getAsInt());
        assertEquals(40 - 2 - 6 - 2, row.get("lifeAfter").getAsInt());
        assertFalse(row.has("lethal")); assertFalse(row.has("poison"));

        combat.addBlocker(bears, blocker);
        assertEquals(40 - 6 - 2, row(game, them).get("lifeAfter").getAsInt());
        // Muralha de Madeira 0/3: o Dreadmaw atropela os 3 que sobram do letal.
        combat.addBlocker(dreadmaw, wall);
        assertEquals(40 - 3 - 2, row(game, them).get("lifeAfter").getAsInt());
        combat.removeFromCombat(blocker);
        assertEquals(40 - 2 - 3 - 2, row(game, them).get("lifeAfter").getAsInt());
    }

    @Test public void lethalLifePoisonAndCommanderDamage() {
        Game game = CommanderEngineTest.game(2); Player me = game.getPlayers().get(0), them = game.getPlayers().get(1);
        Card dreadmaw = add(game, "Colossal Dreadmaw", me);
        Combat combat = blocking(game, me); combat.addAttacker(dreadmaw, them);
        them.setLife(6, null);
        JsonObject row = row(game, them);
        assertEquals(0, row.get("lifeAfter").getAsInt()); assertEquals("life", row.get("lethal").getAsString());

        Game poisoned = CommanderEngineTest.game(2); Player p1 = poisoned.getPlayers().get(0), p2 = poisoned.getPlayers().get(1);
        Card elf = add(poisoned, "Glistener Elf", p1);
        p2.setPoisonCounters(9, p1);
        Combat c2 = blocking(poisoned, p1); c2.addAttacker(elf, p2);
        row = row(poisoned, p2);
        assertEquals(40, row.get("lifeAfter").getAsInt());
        assertEquals(9, row.get("poison").getAsInt()); assertEquals(10, row.get("poisonAfter").getAsInt());
        assertEquals("poison", row.get("lethal").getAsString());

        Game commanders = CommanderEngineTest.game(2); Player c1 = commanders.getPlayers().get(0), target = commanders.getPlayers().get(1);
        Card general = add(commanders, "Colossal Dreadmaw", c1); general.setCommander(true);
        target.addCommanderDamage(general, 16);
        Combat c3 = blocking(commanders, c1); c3.addAttacker(general, target);
        row = row(commanders, target);
        JsonObject cmd = row.getAsJsonArray("commander").get(0).getAsJsonObject();
        assertEquals(general.getId(), cmd.get("commanderId").getAsInt());
        assertEquals(16, cmd.get("damage").getAsInt()); assertEquals(22, cmd.get("after").getAsInt());
        assertEquals(34, row.get("lifeAfter").getAsInt()); assertEquals("commander", row.get("lethal").getAsString());
    }

    @Test public void planeswalkerLoyaltyAndOnlyDuringDeclareBlockers() {
        Game game = CommanderEngineTest.game(3); Player me = game.getPlayers().get(0), them = game.getPlayers().get(1), other = game.getPlayers().get(2);
        Card bears = add(game, "Grizzly Bears", me);
        Card jace = add(game, "Jace Beleren", them);
        jace.setCounters(CounterEnumType.LOYALTY, 3);
        Combat combat = blocking(game, me); combat.addAttacker(bears, jace);
        JsonObject row = row(game, them);
        assertEquals(40, row.get("lifeAfter").getAsInt());
        JsonObject w = row.getAsJsonArray("planeswalkers").get(0).getAsJsonObject();
        assertEquals(jace.getId(), w.get("id").getAsInt());
        assertEquals(3, w.get("loyalty").getAsInt()); assertEquals(1, w.get("after").getAsInt());
        assertNull("quem não foi atacado fica de fora", row(game, other));

        game.getPhaseHandler().devModeSet(PhaseType.COMBAT_DAMAGE, me);
        assertNull(CombatForecast.of(game));
    }
}
