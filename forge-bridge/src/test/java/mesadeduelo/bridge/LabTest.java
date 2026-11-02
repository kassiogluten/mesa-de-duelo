package mesadeduelo.bridge;

import static org.junit.Assert.*;
import com.google.gson.JsonParser;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.card.CounterEnumType;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

/** Laboratório: o cenário montado na tela vira o estado do Forge, e o que não presta é recusado. */
public class LabTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static Lab lab(String json) { return Lab.parse(JsonParser.parseString(json)); }

    private static String names(Player p, ZoneType zone) {
        return p.getCardsIn(zone).stream().map(c -> c.getPaperCard().getName()).toList().toString();
    }

    private static Card on(Player p, String name) {
        return p.getCardsIn(ZoneType.Battlefield).stream().filter(c -> c.getName().equals(name)).findFirst().orElseThrow();
    }

    @Test public void scenarioBecomesTheGame() throws Exception {
        Lab lab = lab("""
            {"active": 1, "phase": "main2", "players": [
              {"life": 7, "poison": 3, "hand": ["Lightning Bolt"], "library": ["Island", "Forest"], "graveyard": ["Grizzly Bears"], "exile": ["Opt"],
               "battlefield": [{"name": "Memnarch, the Warden", "tapped": true}, {"name": "Bonesplitter", "attachedTo": {"player": 0, "index": 0}},
                               {"name": "Grizzly Bears", "sick": true, "counters": {"P1P1": 2}}]},
              {"battlefield": [{"name": "Jace, Multiverse Architect"}]}
            ]}""");
        Game game = ExilePermissionsTest.game();
        // Na partida, o gancho do começo do jogo já roda na thread do jogo.
        var done = new java.util.concurrent.CountDownLatch(1);
        forge.util.ThreadUtil.invokeInGameThread(() -> { try { lab.apply(game); } finally { done.countDown(); } });
        assertTrue(done.await(15, java.util.concurrent.TimeUnit.SECONDS));
        Player a = game.getPlayers().get(0), b = game.getPlayers().get(1);
        assertEquals(7, a.getLife()); assertEquals(20, b.getLife());
        assertEquals(3, a.getPoisonCounters());
        assertEquals("[Lightning Bolt]", names(a, ZoneType.Hand));
        assertEquals("[Island, Forest]", names(a, ZoneType.Library));
        assertEquals("[Grizzly Bears]", names(a, ZoneType.Graveyard));
        assertEquals("[Opt]", names(a, ZoneType.Exile));
        assertEquals("[]", names(b, ZoneType.Hand));
        Card memnarch = on(a, "Memnarch, the Warden");
        assertTrue(memnarch.isTapped());
        assertEquals(memnarch, on(a, "Bonesplitter").getAttachedTo());
        Card bears = on(a, "Grizzly Bears");
        assertTrue(bears.isSick());
        assertEquals(2, bears.getCounters(CounterEnumType.P1P1));
        assertFalse(memnarch.isSick());
        // Sem lealdade no cenário, o planeswalker começa com a impressa.
        assertEquals(4, on(b, "Jace, Multiverse Architect").getCounters(CounterEnumType.LOYALTY));
        assertEquals(b, game.getPhaseHandler().getPlayerTurn());
        assertEquals(PhaseType.MAIN2, game.getPhaseHandler().getPhase());
    }

    @Test public void decksCarryTheScenarioCardsAndFillUpTo60() {
        Lab lab = lab("{\"players\": [{\"hand\": [\"Lightning Bolt\"]}, {}]}");
        assertEquals(60, lab.decks.get(0).getMain().countAll());
        assertTrue(lab.decks.get(0).getMain().contains(DeckValidation.resolve("Lightning Bolt")));
        assertEquals(60, lab.decks.get(1).getMain().countAll());
    }

    @Test public void rejectsWhatTheTableCouldNotHaveBuilt() {
        assertRejected("{\"players\": [{}]}", "dois jogadores");
        assertRejected("{\"players\": [{\"hand\": [\"Carta Que Não Existe\"]}, {}]}", "carta desconhecida: Carta Que Não Existe");
        assertRejected("{\"phase\": \"cleanup\", \"players\": [{}, {}]}", "Etapa");
        assertRejected("{\"players\": [{\"battlefield\": [{\"name\": \"Bonesplitter\", \"attachedTo\": {\"player\": 1, \"index\": 0}}]}, {}]}", "presa a uma carta inválida");
        assertRejected("{\"players\": [{\"battlefield\": [{\"name\": \"Grizzly Bears\", \"counters\": {\"BOGUS\": 1}}]}, {}]}", "marcador desconhecido");
        StringBuilder many = new StringBuilder();
        for (int i = 0; i <= Lab.MAX_PER_ZONE; i++) many.append(i == 0 ? "" : ",").append("\"Island\"");
        assertRejected("{\"players\": [{\"library\": [" + many + "]}, {}]}", "no máximo");
    }

    private static void assertRejected(String json, String text) {
        try { lab(json); fail("aceitou " + json); }
        catch (IllegalArgumentException e) { assertTrue(e.getMessage(), e.getMessage().contains(text)); }
    }
}
