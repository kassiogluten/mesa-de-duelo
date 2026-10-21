package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.HashMap;
import java.util.Map;
import forge.game.ability.AbilityKey;
import forge.game.card.Card;
import forge.game.replacement.ReplacementEffect;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.InputConfirm;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import org.junit.BeforeClass;
import org.junit.Test;

public class CommanderMoveTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    /** Rule 903.9b: the bridge reads where the commander would go from the replacement Forge is asking about. */
    @Test public void commanderMoveNamesTheDestination() {
        var game = CommanderEngineTest.game(2); var me = game.getPlayers().get(0);
        Card commander = ExilePermissionsTest.add(game, "Isamaru, Hound of Konda", me, ZoneType.Battlefield);
        commander.setCommander(true); me.addCommander(commander);
        if (me.getCardsIn(ZoneType.Command).stream().noneMatch(c -> !c.getReplacementEffects().isEmpty())) me.createCommanderEffect();
        ReplacementEffect move = null;
        for (Card c : me.getCardsIn(ZoneType.Command)) for (ReplacementEffect re : c.getReplacementEffects())
            if (re.hasParam("CommanderMoveReplacement")) move = re;
        assertNotNull("commander effect", move);
        var sa = move.ensureAbility(); sa.setReplacementEffect(move);
        Map<AbilityKey, Object> params = new HashMap<>(AbilityKey.mapFromAffected(commander));
        params.put(AbilityKey.Destination, ZoneType.Hand);
        sa.setReplacingObject(AbilityKey.OriginalParams, params);
        var human = new PlayerControllerHuman(game, me, new LobbyPlayerHuman("Test"));
        var input = new InputConfirm(human, "Apply replacement?", "Sim", "Não", true, null, sa);
        var json = InputContext.commanderMove(input);
        assertNotNull(json);
        assertEquals("Hand", json.get("to").getAsString());
        assertEquals(commander.getId(), json.getAsJsonObject("card").get("id").getAsInt());
        // Any other yes/no prompt is left alone.
        assertNull(InputContext.commanderMove(new InputConfirm(human, "Other?", "Sim", "Não", true)));
    }

    /** Rule 903.9a: the state-based question for a commander already in the graveyard keeps it there on "no". */
    @Test public void commanderInTheGraveyardNamesWhereItStays() {
        var game = CommanderEngineTest.game(2); var me = game.getPlayers().get(0);
        Card commander = ExilePermissionsTest.add(game, "Isamaru, Hound of Konda", me, ZoneType.Graveyard);
        commander.setCommander(true); me.addCommander(commander);
        var sa = commander.getCurrentState().getFirstSpellAbilityWithFallback();
        var human = new PlayerControllerHuman(game, me, new LobbyPlayerHuman("Test"));
        String rule = commander.getDisplayName() + ": If a commander is in a graveyard or in exile and that card was put into that zone since the last time state-based actions were checked, its owner may put it into the command zone.";
        var json = InputContext.commanderMove(new InputConfirm(human, rule, "Sim", "Não", true, commander.getView(), sa));
        assertNotNull(json);
        assertEquals("Graveyard", json.get("to").getAsString());
        assertTrue(json.get("stays").getAsBoolean());
        assertEquals(commander.getId(), json.getAsJsonObject("card").get("id").getAsInt());
        // The same ability with another question is left alone.
        assertNull(InputContext.commanderMove(new InputConfirm(human, "Cast it?", "Sim", "Não", true, commander.getView(), sa)));
    }
}
