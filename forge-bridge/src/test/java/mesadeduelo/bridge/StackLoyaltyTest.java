package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.List;
import com.google.gson.JsonObject;
import forge.ai.LobbyPlayerAi;
import forge.game.Game;
import forge.game.Match;
import forge.game.card.Card;
import forge.game.card.CounterEnumType;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.RegisteredPlayer;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

public class StackLoyaltyTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static Game game() {
        var a = new RegisteredPlayer(Decks.build("pauper-brasa")).setPlayer(new LobbyPlayerAi("A", null));
        var b = new RegisteredPlayer(Decks.build("pauper-floresta")).setPlayer(new LobbyPlayerAi("B", null));
        Game game = new Match(new MatchConfig("pauper", "bo1").rules(), List.of(a, b), "Stack loyalty test").createGame();
        game.setNoGUIUser(); game.getPhaseHandler().devModeSet(PhaseType.MAIN1, game.getPlayers().get(0));
        return game;
    }

    private static JsonObject top(Game game, Player viewer) {
        return StateJson.game(game.getView(), viewer.getId(), game).getAsJsonArray("stack").get(0).getAsJsonObject();
    }

    private static SpellAbility walkerAbility(Card walker, String cost) {
        return walker.getSpellAbilities().stream().filter(sa -> sa.isPwAbility() && cost.equals(Loyalty.cost(sa))).findFirst().orElseThrow();
    }

    @Test public void loyaltyAbilityOnTheStackSaysItsCostAndText() {
        Game game = game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        Card jace = ExilePermissionsTest.add(game, "Jace Beleren", me, ZoneType.Battlefield);
        jace.setCounters(CounterEnumType.LOYALTY, 3);

        SpellAbility draw = walkerAbility(jace, "+2"); draw.setActivatingPlayer(me);
        game.getStack().add(draw);
        JsonObject loyalty = top(game, other).getAsJsonObject("loyalty");
        assertEquals("+2", loyalty.get("cost").getAsString());
        assertEquals("Each player draws a card.", loyalty.get("text").getAsString());
        assertFalse(loyalty.has("ultimate"));
        game.getStack().resolveStack();

        SpellAbility mill = walkerAbility(jace, "-10"); mill.setActivatingPlayer(me); mill.getTargets().add(other);
        game.getStack().add(mill);
        loyalty = top(game, other).getAsJsonObject("loyalty");
        assertEquals("-10", loyalty.get("cost").getAsString());
        assertTrue(loyalty.get("ultimate").getAsBoolean());
        assertTrue(loyalty.get("text").getAsString(), loyalty.get("text").getAsString().startsWith("Target player mills"));
    }

    @Test public void otherAbilitiesSendNoLoyalty() {
        Game game = game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        Card pyromancer = ExilePermissionsTest.add(game, "Prodigal Pyromancer", me, ZoneType.Battlefield);
        var ping = pyromancer.getSpellAbilities().stream().filter(sa -> sa.isActivatedAbility()).findFirst().orElseThrow();
        ping.setActivatingPlayer(me); ping.getTargets().add(other);
        game.getStack().add(ping);
        assertFalse(top(game, other).has("loyalty"));
    }
}
