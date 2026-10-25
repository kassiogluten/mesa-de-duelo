package mesadeduelo.bridge;

import static org.junit.Assert.*;
import forge.ai.ComputerUtil;
import forge.game.Game;
import forge.game.GameStage;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

public class PreparedTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    /** Adventurous Eater enters prepared: the creature shows it, the exiled copy is its spell (not a token), casting it unprepares. */
    @Test public void preparedCreatureAndItsSpellInExile() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0);
        game.setAge(GameStage.Play); // triggers (the unprepare one included) only run in a started game
        for (int i = 0; i < 4; i++) ExilePermissionsTest.add(game, "Swamp", me, ZoneType.Battlefield);
        Card bears = ExilePermissionsTest.add(game, "Grizzly Bears", me, ZoneType.Battlefield);
        Card eater = ExilePermissionsTest.add(game, "Adventurous Eater", me, ZoneType.Hand);
        var creature = eater.getFirstSpellAbility(); creature.setActivatingPlayer(me);
        game.getStack().add(creature); game.getStack().resolveStack();
        eater = game.getCardState(eater);
        assertTrue(eater.isPrepared());

        var field = StateJson.card(eater.getView(), game);
        assertTrue(field.get("prepared").getAsBoolean());
        assertEquals("Have a Bite", field.get("preparedSpell").getAsString());
        assertFalse("no UNDEFINED keyword for the enters-prepared ability", field.has("keywords"));

        Card copy = eater.getPreparedSpell();
        var exiled = StateJson.card(copy.getView(), game);
        assertEquals("Have a Bite", exiled.get("name").getAsString());
        assertEquals("Adventurous Eater", exiled.get("preparedFrom").getAsString());
        assertFalse(exiled.get("token").getAsBoolean());
        assertFalse(exiled.has("prepared"));
        assertTrue(StateJson.playableExile(game, me.getId()).contains(new com.google.gson.JsonPrimitive(copy.getId())));
        assertTrue(Castable.compute(me).contains(copy.getId()));

        var spell = copy.getAllPossibleAbilities(me, true).get(0); spell.setActivatingPlayer(me);
        spell.getTargets().add(bears);
        assertTrue(ComputerUtil.handlePlayingSpellAbility(me, spell, null));
        game.getStack().resolveStack();
        eater = game.getCardState(eater);
        assertFalse(eater.isPrepared());
        assertFalse(StateJson.card(eater.getView(), game).has("prepared"));
        assertEquals(1, game.getCardState(bears).getCounters().size());
        assertTrue(me.getCardsIn(ZoneType.Exile).isEmpty());
    }
}
