package mesadeduelo.bridge;

import static org.junit.Assert.*;
import forge.game.Game;
import forge.game.GameStage;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

public class MutateTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    /** Gemrazer mutating onto Grizzly Bears: one permanent that lists both printed cards, top first. */
    @Test public void mutatedPermanentListsItsCards() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0);
        game.setAge(GameStage.Play);
        Card bears = ExilePermissionsTest.add(game, "Grizzly Bears", me, ZoneType.Battlefield);
        assertFalse(StateJson.card(bears.getView(), game).has("merged"));
        Card gemrazer = ExilePermissionsTest.add(game, "Gemrazer", me, ZoneType.Hand);
        var mutate = gemrazer.getSpells().stream().filter(sa -> sa.isMutate()).findFirst().orElseThrow();
        mutate.setActivatingPlayer(me);
        mutate.getTargets().add(bears);
        game.getStack().add(mutate); game.getStack().resolveStack();

        bears = game.getCardState(bears);
        assertTrue(bears.hasMergedCard());
        assertEquals(1, me.getCreaturesInPlay().size());
        var field = StateJson.card(bears.getView(), game);
        var merged = field.getAsJsonArray("merged");
        assertEquals(2, merged.size());
        String top = merged.get(0).getAsJsonObject().get("name").getAsString();
        String bottom = merged.get(1).getAsJsonObject().get("name").getAsString();
        assertEquals(java.util.Set.of("Gemrazer", "Grizzly Bears"), java.util.Set.of(top, bottom));
        assertEquals("the permanent takes the top card's name", top, field.get("name").getAsString());
        assertNotNull(merged.get(1).getAsJsonObject().get("set"));
    }
}
