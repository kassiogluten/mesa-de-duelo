package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.ArrayList;
import java.util.List;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.ai.LobbyPlayerAi;
import forge.game.Game;
import forge.game.Match;
import forge.game.ability.effects.CharmEffect;
import forge.game.card.Card;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.RegisteredPlayer;
import forge.game.spellability.AbilitySub;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

public class StackModesTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static Game game() {
        var a = new RegisteredPlayer(Decks.build("pauper-brasa")).setPlayer(new LobbyPlayerAi("A", null));
        var b = new RegisteredPlayer(Decks.build("pauper-floresta")).setPlayer(new LobbyPlayerAi("B", null));
        Game game = new Match(new MatchConfig("pauper", "bo1").rules(), List.of(a, b), "Stack modes test").createGame();
        game.setNoGUIUser(); game.getPhaseHandler().devModeSet(PhaseType.MAIN1, game.getPlayers().get(0));
        return game;
    }

    private static JsonObject top(Game game, Player viewer) {
        return StateJson.game(game.getView(), viewer.getId(), game).getAsJsonArray("stack").get(0).getAsJsonObject();
    }

    @Test public void theChosenModeOfACharmGoesWithItsNumberAndText() {
        Game game = game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        Card charm = ExilePermissionsTest.add(game, "Prismari Charm", me, ZoneType.Hand);
        SpellAbility sa = charm.getFirstSpellAbility(); sa.setActivatingPlayer(me);
        List<AbilitySub> choices = sa.getAdditionalAbilityList("Choices");
        CharmEffect.chainAbilities(sa, new ArrayList<>(List.of(choices.get(0))));
        game.getStack().add(sa);
        JsonArray modes = top(game, other).getAsJsonArray("modes");
        assertEquals(1, modes.size());
        assertEquals(1, modes.get(0).getAsJsonObject().get("index").getAsInt());
        assertEquals("Surveil 2, then draw a card.", modes.get(0).getAsJsonObject().get("text").getAsString());
    }

    @Test public void theCardNameIsFilledAndTheModeKeepsItsPlaceOnTheCard() {
        Game game = game(); Player me = game.getPlayers().get(0);
        Card charm = ExilePermissionsTest.add(game, "Prismari Charm", me, ZoneType.Hand);
        SpellAbility sa = charm.getFirstSpellAbility(); sa.setActivatingPlayer(me);
        CharmEffect.chainAbilities(sa, new ArrayList<>(List.of(sa.getAdditionalAbilityList("Choices").get(1))));
        JsonArray modes = StackModes.describe(sa);
        assertEquals(2, modes.get(0).getAsJsonObject().get("index").getAsInt());
        assertEquals("Prismari Charm deals 1 damage to each of one or two targets.", modes.get(0).getAsJsonObject().get("text").getAsString());
    }

    @Test public void spellsWithoutModesSendNothing() {
        Game game = game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        Card bolt = ExilePermissionsTest.add(game, "Lightning Bolt", me, ZoneType.Hand);
        SpellAbility cast = bolt.getFirstSpellAbility(); cast.setActivatingPlayer(me); cast.getTargets().add(other);
        game.getStack().add(cast);
        assertFalse(top(game, other).has("modes"));
    }
}
