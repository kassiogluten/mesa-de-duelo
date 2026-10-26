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
import forge.game.trigger.WrappedAbility;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

public class StackKindTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static Game game() {
        var a = new RegisteredPlayer(Decks.build("pauper-brasa")).setPlayer(new LobbyPlayerAi("A", null));
        var b = new RegisteredPlayer(Decks.build("pauper-floresta")).setPlayer(new LobbyPlayerAi("B", null));
        Game game = new Match(new MatchConfig("pauper", "bo1").rules(), List.of(a, b), "Stack kind test").createGame();
        game.setNoGUIUser(); game.getPhaseHandler().devModeSet(PhaseType.MAIN1, game.getPlayers().get(0));
        return game;
    }

    private static JsonObject top(Game game, Player viewer) {
        return StateJson.game(game.getView(), viewer.getId(), game).getAsJsonArray("stack").get(0).getAsJsonObject();
    }

    @Test public void stackItemsSaySpellAbilityOrTrigger() {
        Game game = game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);

        Card bolt = ExilePermissionsTest.add(game, "Lightning Bolt", me, ZoneType.Hand);
        var cast = bolt.getFirstSpellAbility(); cast.setActivatingPlayer(me); cast.getTargets().add(other);
        game.getStack().add(cast);
        assertEquals("spell", top(game, me).get("kind").getAsString());
        game.getStack().resolveStack();

        Card pyromancer = ExilePermissionsTest.add(game, "Prodigal Pyromancer", me, ZoneType.Battlefield);
        var ping = pyromancer.getSpellAbilities().stream().filter(sa -> sa.isActivatedAbility()).findFirst().orElseThrow();
        ping.setActivatingPlayer(me); ping.getTargets().add(other);
        game.getStack().add(ping);
        assertEquals("ability", top(game, me).get("kind").getAsString());
        game.getStack().resolveStack();

        Card visionary = ExilePermissionsTest.add(game, "Elvish Visionary", me, ZoneType.Battlefield);
        var trigger = visionary.getTriggers().iterator().next();
        var wrapped = new WrappedAbility(trigger, trigger.ensureAbility(), me); wrapped.setActivatingPlayer(me);
        game.getStack().add(wrapped);
        assertEquals("trigger", top(game, me).get("kind").getAsString());
    }
}
