package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.List;
import com.google.gson.JsonObject;
import forge.ai.LobbyPlayerAi;
import forge.game.Game;
import forge.game.Match;
import forge.game.card.Card;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.RegisteredPlayer;
import forge.game.spellability.AlternativeCost;
import forge.game.spellability.OptionalCost;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

public class StackCastTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static Game game() {
        var a = new RegisteredPlayer(Decks.build("pauper-brasa")).setPlayer(new LobbyPlayerAi("A", null));
        var b = new RegisteredPlayer(Decks.build("pauper-floresta")).setPlayer(new LobbyPlayerAi("B", null));
        Game game = new Match(new MatchConfig("pauper", "bo1").rules(), List.of(a, b), "Stack cast test").createGame();
        game.setNoGUIUser(); game.getPhaseHandler().devModeSet(PhaseType.MAIN1, game.getPlayers().get(0));
        return game;
    }

    private static JsonObject top(Game game, Player viewer) {
        return StateJson.game(game.getView(), viewer.getId(), game).getAsJsonArray("stack").get(0).getAsJsonObject();
    }

    private static SpellAbility spell(Game game, String name, Player me, Player target) {
        Card card = ExilePermissionsTest.add(game, name, me, ZoneType.Hand);
        SpellAbility sa = card.getFirstSpellAbility(); sa.setActivatingPlayer(me);
        if (target != null) sa.getTargets().add(target);
        return sa;
    }

    @Test public void normalCastSendsNothing() {
        Game game = game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        game.getStack().add(spell(game, "Lightning Bolt", me, other));
        assertFalse(top(game, me).has("cast"));
    }

    @Test public void kickedSpellSaysHowManyTimes() {
        Game game = game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        SpellAbility burst = spell(game, "Burst Lightning", me, other);
        burst.addOptionalCost(OptionalCost.Kicker1);
        game.getStack().add(burst);
        assertEquals(1, top(game, me).getAsJsonObject("cast").get("kicker").getAsInt());
    }

    @Test public void alternativeCostAndBuybackAreNamed() {
        Game game = game(); Player me = game.getPlayers().get(0);
        SpellAbility think = spell(game, "Think Twice", me, null).copy(); think.setActivatingPlayer(me);
        think.setAlternativeCost(AlternativeCost.Flashback);
        game.getStack().add(think);
        assertEquals("flashback", top(game, me).getAsJsonObject("cast").get("mode").getAsString());
        game.getStack().resolveStack();

        SpellAbility capsize = spell(game, "Capsize", me, null);
        capsize.addOptionalCost(OptionalCost.Buyback);
        JsonObject cast = StackCast.describe(capsize);
        assertEquals("buyback", cast.getAsJsonArray("extras").get(0).getAsString());
        assertFalse(cast.has("mode"));
    }

    @Test public void xSpellsSayTheValuePaid() {
        Game game = game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        SpellAbility blaze = spell(game, "Blaze", me, other);
        blaze.setXManaCostPaid(3);
        game.getStack().add(blaze);
        assertEquals(3, top(game, me).getAsJsonObject("cast").get("x").getAsInt());
    }
}
