package mesadeduelo.bridge;

import static org.junit.Assert.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import org.junit.Test;

public class AccountMatchesTest {
    private static final long NOW = Instant.parse("2026-11-01T12:00:00Z").toEpochMilli();

    /** Uma partida da conta "eu" no assento 0, contra o computador ou contra pessoas. */
    private static JsonObject match(String id, String endedAt, String format, String deckId, String deck, String result, boolean ai) {
        Integer winner = switch (result) { case "vitoria" -> 0; case "derrota" -> 1; default -> null; };
        String end = "queda".equals(result) ? "queda" : "concluida";
        return JsonParser.parseString("{\"id\":\"" + id + "\",\"endedAt\":\"" + endedAt + "\",\"ms\":" + (ai ? 600000 : 1200000) + ",\"format\":\"" + format
            + "\",\"length\":\"bo1\",\"mode\":\"" + (ai ? "ia" : "rede") + "\",\"end\":\"" + end + "\",\"winner\":" + winner + ",\"players\":["
            + "{\"ai\":false,\"account\":\"eu\"," + (deckId == null ? "" : "\"deckId\":\"" + deckId + "\",") + "\"deck\":\"" + deck + "\",\"colors\":\"G\",\"wins\":" + (winner != null && winner == 0 ? 1 : 0) + "},"
            + "{" + (ai ? "" : "\"name\":\"Bia\",") + "\"ai\":" + ai + ",\"deck\":\"Goblins\",\"colors\":\"R\",\"commander\":\"Krenko, Mob Boss\",\"wins\":" + (winner != null && winner == 1 ? 1 : 0) + "}],"
            + "\"games\":[{\"turns\":7},{\"turns\":5}]}").getAsJsonObject();
    }

    /** Mais recentes primeiro, como {@link MatchHistory#readFor} devolve. */
    private static final List<JsonObject> MINE = List.of(
        match("a", "2026-10-31T10:00:00Z", "commander", "d1", "Elfos", "vitoria", true),
        match("b", "2026-10-30T10:00:00Z", "commander", "d1", "Elfos v2", "queda", false),
        match("c", "2026-10-29T10:00:00Z", "standard", "d2", "Mono Vermelho", "vitoria", false),
        match("d", "2026-10-20T10:00:00Z", "commander", "d1", "Elfos", "derrota", true),
        match("e", "2026-07-01T10:00:00Z", "free", null, "Antigo", "empate", true));

    private static JsonObject page(Map<String, String> query) {
        return AccountMatches.page(MINE, "eu", AccountMatches.Filter.of(query), NOW);
    }

    @Test public void eachMatchIsSeenFromTheAccountsSeat() {
        JsonObject row = page(Map.of()).getAsJsonArray("partidas").get(0).getAsJsonObject();
        assertEquals("vitoria", row.get("resultado").getAsString());
        assertEquals(12, row.get("turnos").getAsInt());
        assertEquals(2, row.get("jogos").getAsInt());
        assertEquals("[1,0]", row.getAsJsonArray("placar").toString());
        assertEquals("d1", row.getAsJsonObject("deck").get("id").getAsString());
        JsonObject opponent = row.getAsJsonArray("oponentes").get(0).getAsJsonObject();
        assertTrue(opponent.get("ia").getAsBoolean());
        assertFalse("the computer has no typed name", opponent.has("nome"));
        assertEquals("Krenko, Mob Boss", opponent.get("comandante").getAsString());
        assertNull("not this account's seat", AccountMatches.row(MINE.get(0), 5));
    }

    @Test public void numbersLeaveDropsOutAndGroupByDeckFormatAndOpponent() {
        JsonObject all = page(Map.of());
        assertEquals("the drop is listed", 5, all.get("total").getAsInt());
        JsonObject n = all.getAsJsonObject("numeros");
        assertEquals(4, n.get("partidas").getAsInt());
        assertEquals(2, n.get("vitorias").getAsInt());
        assertEquals(1, n.get("derrotas").getAsInt());
        assertEquals(1, n.get("empates").getAsInt());
        assertEquals((600000 * 3 + 1200000) / 4, n.get("duracaoMedia").getAsLong());
        assertEquals("vitoria", n.getAsJsonObject("sequencia").get("resultado").getAsString());
        assertEquals("the drop does not break the streak", 2, n.getAsJsonObject("sequencia").get("n").getAsInt());

        JsonObject deck = n.getAsJsonArray("porDeck").get(0).getAsJsonObject();
        assertEquals("same saved deck, even renamed", "d1", deck.get("id").getAsString());
        assertEquals("the latest name", "Elfos", deck.get("nome").getAsString());
        assertEquals(2, deck.get("partidas").getAsInt());
        assertEquals(1, deck.get("vitorias").getAsInt());
        JsonArray byOpponent = n.getAsJsonArray("porOponente");
        assertEquals("ia", byOpponent.get(0).getAsJsonObject().get("tipo").getAsString());
        assertEquals(3, byOpponent.get(0).getAsJsonObject().get("partidas").getAsInt());
        assertEquals("pessoas", byOpponent.get(1).getAsJsonObject().get("tipo").getAsString());

        JsonArray decks = all.getAsJsonObject("filtros").getAsJsonArray("decks");
        assertEquals(3, decks.size());
        assertEquals("nome:Antigo", decks.get(2).getAsJsonObject().get("id").getAsString());
        assertEquals("[\"commander\",\"standard\",\"free\"]", all.getAsJsonObject("filtros").getAsJsonArray("formatos").toString());
    }

    @Test public void filtersApplyToTheListAndTheNumbersButNotToTheOptions() {
        JsonObject week = page(Map.of("periodo", "7"));
        assertEquals(3, week.get("total").getAsInt());
        assertEquals(2, week.getAsJsonObject("numeros").get("partidas").getAsInt());
        assertEquals(3, week.getAsJsonObject("filtros").getAsJsonArray("decks").size());

        JsonObject elfos = page(Map.of("deck", "d1", "formato", "commander"));
        assertEquals(3, elfos.get("total").getAsInt());
        assertEquals(1, elfos.getAsJsonObject("numeros").getAsJsonArray("porDeck").size());

        assertEquals(0, page(Map.of("formato", "pauper")).getAsJsonObject("numeros").get("partidas").getAsInt());
        assertFalse(page(Map.of("formato", "pauper")).getAsJsonObject("numeros").has("sequencia"));
        assertEquals("an unknown period is everything", 5, page(Map.of("periodo", "999")).get("total").getAsInt());
    }

    @Test public void pagesHoldTwentyMatches() {
        List<JsonObject> many = new java.util.ArrayList<>();
        for (int i = 0; i < 45; i++) many.add(match("m" + i, "2026-10-01T10:00:00Z", "free", "d1", "Elfos", "vitoria", true));
        JsonObject third = AccountMatches.page(many, "eu", AccountMatches.Filter.of(Map.of("pagina", "2")), NOW);
        assertEquals(45, third.get("total").getAsInt());
        assertEquals(5, third.getAsJsonArray("partidas").size());
        assertEquals("m40", third.getAsJsonArray("partidas").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals(45, third.getAsJsonObject("numeros").getAsJsonObject("sequencia").get("n").getAsInt());
        assertEquals(0, AccountMatches.page(many, "eu", AccountMatches.Filter.of(Map.of("pagina", "x")), NOW).get("pagina").getAsInt());
    }
}
