package mesadeduelo.bridge;

import static org.junit.Assert.*;

import com.google.gson.JsonParser;
import forge.ai.AiProfileUtil;
import forge.ai.LobbyPlayerAi;
import forge.player.GamePlayerUtil;
import org.junit.Test;

/** Estilo do computador (S12): os nomes da mesa ligados aos perfis de IA que o Forge carrega. */
public class AiStyleTest {
    @Test public void parsesTheStyleOfTheStartMessage() {
        assertEquals("equilibrado", AiStyle.parse(null));
        assertEquals("agressivo", AiStyle.parse(JsonParser.parseString("\"agressivo\"")));
        assertThrows(IllegalArgumentException.class, () -> AiStyle.parse(JsonParser.parseString("\"dificil\"")));
        assertThrows(IllegalArgumentException.class, () -> AiStyle.parse(JsonParser.parseString("3")));
    }

    @Test public void everyStyleIsAProfileTheEngineLoaded() {
        TestGames.engine();
        for (String style : new String[] {"equilibrado", "cauteloso", "agressivo", "experimental"}) {
            String profile = AiStyle.profile(style);
            assertTrue(profile, AiProfileUtil.getProfilesDisplayList().contains(profile));
            assertEquals(style, AiStyle.of(profile));
            var player = (LobbyPlayerAi) GamePlayerUtil.createAiPlayer("Oponente", profile);
            assertEquals(profile, player.getAiProfile());
        }
        assertEquals("equilibrado", AiStyle.of(""));
    }

    @Test public void theHistoryRowCarriesTheStyle() {
        var match = JsonParser.parseString("{\"id\":\"m\",\"endedAt\":\"2026-11-01T10:00:00Z\",\"ms\":1,\"format\":\"pauper\",\"length\":\"bo1\",\"mode\":\"ia\",\"end\":\"concluida\",\"winner\":0,"
            + "\"players\":[{\"ai\":false,\"account\":\"eu\",\"deck\":\"A\",\"colors\":\"G\",\"wins\":1},{\"ai\":true,\"aiStyle\":\"cauteloso\",\"deck\":\"B\",\"colors\":\"R\",\"wins\":0}],\"games\":[]}").getAsJsonObject();
        var row = AccountMatches.row(match, 0);
        assertEquals("cauteloso", row.getAsJsonArray("oponentes").get(0).getAsJsonObject().get("estilo").getAsString());
    }
}
