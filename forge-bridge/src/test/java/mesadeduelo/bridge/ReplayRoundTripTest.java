package mesadeduelo.bridge;

import static org.junit.Assert.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.atomic.AtomicReference;

import com.google.common.eventbus.Subscribe;
import com.google.gson.JsonObject;

import forge.ai.LobbyPlayerAi;
import forge.deck.Deck;
import forge.game.Game;
import forge.game.GameEndReason;
import forge.game.Match;
import forge.game.event.GameEventTurnBegan;
import forge.game.player.Player;
import forge.game.player.RegisteredPlayer;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

/** Do diário de uma partida de verdade (IA x IA) de volta ao Forge com o {@link RelatoFixture}. */
public class ReplayRoundTripTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    /** Joga até o começo do turno {@code turns} e devolve o diário (com até 3 retratos). */
    static JsonObject playedJournal(int turns) throws Exception {
        MatchConfig config = new MatchConfig("free", "bo1");
        List<Deck> decks = List.of(Decks.build("pauper-brasa"), Decks.build("pauper-floresta"));
        List<RegisteredPlayer> players = new ArrayList<>();
        MatchJournal journal = new MatchJournal("teste", "CODIGO", false, config);
        for (int i = 0; i < decks.size(); i++) {
            players.add(new RegisteredPlayer(decks.get(i)).setPlayer(new LobbyPlayerAi("IA " + i, null)));
            journal.player(i, "IA " + i, true, null, decks.get(i));
        }
        Match match = new Match(config.rules(), players, "Relato");
        Game game = match.createGame();
        game.setNoGUIUser();
        journal.attach(game, 1);
        game.subscribeToEvents(new Object() {
            @Subscribe public void turn(GameEventTurnBegan e) { if (e.turnNumber() > turns) game.setGameOver(GameEndReason.Draw); }
        });
        AtomicReference<Throwable> error = new AtomicReference<>();
        Thread t = new Thread(() -> { try { match.startGame(game); } catch (Throwable e) { error.set(e); } }, "Game partida");
        t.start();
        t.join(120_000);
        assertFalse("A partida de teste não terminou", t.isAlive());
        if (error.get() != null) throw new AssertionError(error.get());
        return journal.json(null, false);
    }

    private static Map<String, List<String>> zones(Game game) {
        Map<String, List<String>> out = new TreeMap<>();
        for (Player p : game.getPlayers()) for (ZoneType z : List.of(ZoneType.Hand, ZoneType.Library, ZoneType.Graveyard, ZoneType.Battlefield, ZoneType.Exile)) {
            List<String> names = new ArrayList<>();
            p.getCardsIn(z).forEach(c -> names.add(c.getName()));
            names.sort(null);
            out.put(game.getPlayers().indexOf(p) + " " + z, names);
        }
        return out;
    }

    @Test public void snapshotFromTheJournalComesBackWithTheSameLifeAndZones() throws Exception {
        JsonObject journal = playedJournal(5);
        assertEquals(MatchJournal.MAX_SNAPSHOTS, journal.getAsJsonArray("snapshots").size());
        JsonObject first = journal.getAsJsonArray("games").get(0).getAsJsonObject();
        assertEquals(1, first.get("gameNumber").getAsInt());
        assertEquals(2, first.getAsJsonArray("mulligans").size());
        JsonObject last = journal.getAsJsonArray("snapshots").get(2).getAsJsonObject();
        assertEquals("turno", last.get("reason").getAsString());
        assertEquals(5, last.get("turn").getAsInt());
        assertEquals("UNTAP", last.get("phase").getAsString());

        RelatoFixture fixture = RelatoFixture.of(journal);
        Game restored = fixture.game(2);
        String expected = fixture.state(2), actual = Replay.snapshotOf(restored);
        assertTrue(expected, expected.contains("p0battlefield=") && expected.contains("p1library=") && expected.contains("activephase=UNTAP"));
        List<String> diff = Replay.diff(expected, actual);
        diff.forEach(line -> System.out.println("Retrato (limite conhecido): " + line));

        // Vida, vez e zonas voltam iguais; o retrato de volta tem as mesmas cartas em cada zona.
        assertEquals(5, restored.getPhaseHandler().getTurn());
        assertEquals(last.get("activePlayer").getAsInt(), restored.getPlayers().indexOf(restored.getPhaseHandler().getPlayerTurn()));
        for (String line : expected.split("\n")) if (line.matches("p\\dlife=.*")) {
            int index = line.charAt(1) - '0';
            assertEquals(line, Integer.parseInt(line.substring(line.indexOf('=') + 1)), restored.getPlayers().get(index).getLife());
        }
        Game again = RelatoFixture.game(fixture.config(), List.of(Decks.build("pauper-brasa"), Decks.build("pauper-floresta")), List.of("a", "b"), actual);
        assertEquals(zones(restored), zones(again));
        assertTrue(String.join("\n", diff), diff.stream().noneMatch(line -> line.contains("faltando") || line.contains("a mais") || line.contains("life")));
    }

    @Test public void renumberMovesEveryPlayerReference() {
        String state = "turn=3\nactiveplayer=p1\nactivephase=UNTAP\np0life=20\np1life=7\np0battlefield=Aura|Set:M10|EnchantingPlayer:P1;Bear|Owner:P1\np1hand=Shock\n";
        String swapped = Replay.renumber(state, Map.of(0, 1, 1, 0));
        assertTrue(swapped, swapped.contains("activeplayer=p0\n"));
        assertTrue(swapped.contains("p1life=20\n") && swapped.contains("p0life=7\n"));
        assertTrue(swapped.contains("p1battlefield=Aura|Set:M10|EnchantingPlayer:P0;Bear|Owner:P0\n"));
        assertTrue(swapped.contains("p0hand=Shock\n"));
    }

    @Test public void journalKeepsTheLatestActionsAndCountsTheDropped() {
        MatchJournal journal = new MatchJournal("m", "C", true, new MatchConfig("free", "bo1"));
        for (int i = 0; i < MatchJournal.MAX_ACTIONS + 25; i++) journal.action(0, "ok", i, i, "recebida", null);
        journal.action(1, "card", 3, 99, "recusada", "x".repeat(500));
        JsonObject json = journal.json(1, true);
        assertEquals(MatchJournal.MAX_ACTIONS, json.getAsJsonArray("actions").size());
        assertEquals(26, json.get("droppedActions").getAsLong());
        JsonObject latest = json.getAsJsonArray("actions").get(MatchJournal.MAX_ACTIONS - 1).getAsJsonObject();
        assertEquals("recusada", latest.get("result").getAsString());
        assertTrue(latest.get("detail").getAsString().length() <= MatchJournal.MAX_DETAIL + 1);
        assertEquals(26, json.getAsJsonArray("actions").get(0).getAsJsonObject().get("gen").getAsInt());
        assertEquals(1, json.get("reporterSeat").getAsInt());
        assertTrue(json.get("room").getAsBoolean());
        for (String key : List.of("matchId", "code", "startedAt", "config", "players", "games", "snapshots")) assertTrue(key, json.has(key));
    }
}
