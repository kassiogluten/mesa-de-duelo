package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.List;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.combat.Combat;
import forge.game.combat.CombatUtil;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

public class AttackExplainTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static Card add(Game game, String name, Player player) {
        Card card = ExilePermissionsTest.add(game, name, player, ZoneType.Battlefield); card.setSickness(false); return card;
    }

    private static Combat combat(Game game, Player me) {
        game.getAction().checkStaticAbilities();
        Combat combat = new Combat(me); game.getPhaseHandler().setCombat(combat); return combat;
    }

    @Test public void attackLimitNamesTheCardThatSetsIt() {
        Game game = CommanderEngineTest.game(4); Player me = game.getPlayers().get(0), right = game.getPlayers().get(3);
        Card arbiter = add(game, "Silent Arbiter", right);
        Card a = add(game, "Raging Goblin", me), b = add(game, "Raging Goblin", me);
        a.addGoad(game.getNextTimestamp(), right); b.addGoad(game.getNextTimestamp(), right);
        Combat combat = combat(game, me);
        Player left = game.getPlayers().get(1);
        combat.addAttacker(a, left); combat.addAttacker(b, left);
        assertFalse(CombatUtil.validateAttackers(combat));
        AttackExplain.Reason reason = AttackExplain.explain(combat);
        assertTrue(reason.text(), reason.text().startsWith("No máximo uma criatura pode atacar em cada combate, por causa de "));
        assertTrue(reason.text(), reason.text().endsWith("Você declarou 2: deixe só uma atacando."));
        assertEquals(List.of(arbiter), reason.cards());
        JsonObject toast = JsonParser.parseString(AttackExplain.toast(combat)).getAsJsonObject();
        assertEquals("toast", toast.get("type").getAsString());
        assertEquals("Ataque não permitido", toast.get("title").getAsString());
        assertEquals(arbiter.getId(), toast.getAsJsonArray("cards").get(0).getAsJsonObject().get("id").getAsInt());
        assertEquals("Silent Arbiter", toast.getAsJsonArray("cards").get(0).getAsJsonObject().get("name").getAsString());
    }

    @Test public void goadedCreatureLeftOutIsTheCulprit() {
        Game game = CommanderEngineTest.game(4); Player me = game.getPlayers().get(0);
        Player left = game.getPlayers().get(1), right = game.getPlayers().get(3);
        Card free = add(game, "Raging Goblin", me), goaded = add(game, "Grizzly Bears", me);
        goaded.addGoad(game.getNextTimestamp(), right);
        Combat combat = combat(game, me);
        combat.addAttacker(free, left);
        assertFalse(CombatUtil.validateAttackers(combat));
        AttackExplain.Reason reason = AttackExplain.explain(combat);
        assertTrue(reason.text(), reason.text().endsWith(" foi atiçada por " + right.getName() + " e precisa atacar neste combate, se puder."));
        assertEquals(List.of(goaded), reason.cards());
    }

    @Test public void creatureThatCannotAttackAloneIsNamed() {
        Game game = CommanderEngineTest.game(2); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        Card flunkies = add(game, "Mogg Flunkies", me);
        Combat combat = combat(game, me);
        combat.addAttacker(flunkies, other);
        assertFalse(CombatUtil.validateAttackers(combat));
        AttackExplain.Reason reason = AttackExplain.explain(combat);
        assertTrue(reason.text(), reason.text().endsWith(" não pode atacar sozinha."));
        assertEquals(List.of(flunkies), reason.cards());
    }
}
