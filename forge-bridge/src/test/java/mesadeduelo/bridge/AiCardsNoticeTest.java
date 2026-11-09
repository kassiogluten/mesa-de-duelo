// Confere o aviso único das cartas que o computador não joga bem.
package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.Test;

public class AiCardsNoticeTest {
    @Test public void joinsEveryOpponentInOneToast() {
        Map<String, List<String>> byPlayer = new LinkedHashMap<>();
        byPlayer.put("Bot 1", List.of("Mindslaver", "Shahrazad"));
        byPlayer.put("Bot 2", List.of("Chaos Orb"));
        JsonObject o = JsonParser.parseString(AiCardsNotice.toastByName(byPlayer)).getAsJsonObject();
        assertEquals("toast", o.get("type").getAsString());
        assertEquals("3 cartas nos decks dos oponentes podem ser mal usadas.", o.get("text").getAsString());
        assertEquals(2, o.getAsJsonArray("groups").size());
        assertEquals("Chaos Orb", o.getAsJsonArray("groups").get(1).getAsJsonObject().getAsJsonArray("cards").get(0).getAsString());
    }

    @Test public void namesTheOnlyOpponentAndSkipsEmptyOnes() {
        Map<String, List<String>> byPlayer = new LinkedHashMap<>();
        byPlayer.put("Bot 1", List.of());
        byPlayer.put("Bot 2", List.of("Mindslaver"));
        JsonObject o = JsonParser.parseString(AiCardsNotice.toastByName(byPlayer)).getAsJsonObject();
        assertEquals("1 carta do deck de Bot 2 pode ser mal usada.", o.get("text").getAsString());
        assertEquals(1, o.getAsJsonArray("groups").size());
        assertNull(AiCardsNotice.toastByName(Map.of("Bot 1", List.of())));
    }
}
