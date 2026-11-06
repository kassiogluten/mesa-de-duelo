package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.List;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

/** Aura que encanta um jogador (maldição): o estado diz quem ela encanta, para o selo e a seta da mesa. */
public class CurseOnPlayerTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static JsonObject onField(Game game, Player viewer, Card card) {
        for (var row : StateJson.game(game.getView(), viewer.getId(), game).getAsJsonArray("players"))
            for (var c : row.getAsJsonObject().getAsJsonArray("battlefield"))
                if (c.getAsJsonObject().get("id").getAsInt() == card.getId()) return c.getAsJsonObject();
        throw new AssertionError("card " + card.getId() + " not on the battlefield");
    }

    @Test public void curseOnTheOpponentSaysWhoItEnchants() {
        Game game = TestGames.empty(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        Card curse = TestGames.add(game, "Curse of the Pierced Heart", me, ZoneType.Battlefield);
        curse.attachToEntity(other, null);
        game.getAction().checkStaticAbilities();
        // Os dois jogadores veem em quem a maldição está, e ela não está presa a nenhuma carta.
        for (Player viewer : List.of(me, other)) {
            JsonObject json = onField(game, viewer, curse);
            assertEquals(other.getId(), json.get("attachedToPlayer").getAsInt());
            assertFalse(json.has("attachedTo"));
        }
    }

    @Test public void anAuraThatEnchantsAPlayerWithoutBeingACurseToo() {
        Game game = TestGames.empty(); Player me = game.getPlayers().get(0);
        Card haze = TestGames.add(game, "Paradox Haze", me, ZoneType.Battlefield);
        haze.attachToEntity(me, null);
        game.getAction().checkStaticAbilities();
        assertEquals(me.getId(), onField(game, me, haze).get("attachedToPlayer").getAsInt());
    }

    @Test public void auraOnACreatureIsNotOnAPlayer() {
        Game game = TestGames.empty(); Player me = game.getPlayers().get(0);
        Card bears = TestGames.add(game, "Grizzly Bears", me, ZoneType.Battlefield);
        Card rancor = TestGames.add(game, "Rancor", me, ZoneType.Battlefield);
        rancor.attachToEntity(bears, null);
        JsonObject json = onField(game, me, rancor);
        assertEquals(bears.getId(), json.get("attachedTo").getAsInt());
        assertFalse(json.has("attachedToPlayer"));
    }
}
