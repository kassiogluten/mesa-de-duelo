package mesadeduelo.bridge;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class TournamentTest {
    @Rule public TemporaryFolder tmp = new TemporaryFolder();

    private static Tournament with(int players) {
        Tournament t = new Tournament("ABCDEFGH", "Sexta do Commander", "Pauper", "conta-1", "Kassio", 0);
        for (int i = 1; i <= players; i++) t.addPlayer("Jogador " + i);
        return t;
    }

    /** O primeiro de cada mesa vence por 2-0 (ou 2-1 nas mesas pares). */
    private static void playAll(Tournament t) {
        Tournament.Round r = t.current();
        for (Tournament.Table m : r.tables()) if (!m.bye()) t.result(r.number(), m.number, new Tournament.Score(2, m.number % 2 == 0 ? 1 : 0, 0));
    }

    @Test public void roundsFollowTheWizardsTable() {
        assertEquals(1, Tournament.suggestedRounds(2));
        assertEquals(2, Tournament.suggestedRounds(4));
        assertEquals(3, Tournament.suggestedRounds(5));
        assertEquals(3, Tournament.suggestedRounds(8));
        assertEquals(4, Tournament.suggestedRounds(9));
        assertEquals(5, Tournament.suggestedRounds(32));
    }

    @Test public void swissRoundsAvoidRematchesAndGiveOneByePerPlayer() {
        for (int seed = 0; seed < 30; seed++) {
            Tournament t = with(9);
            Random random = new Random(seed);
            Set<String> pairs = new HashSet<>();
            Set<Integer> byes = new HashSet<>();
            for (int r = 0; r < t.rounds(); r++) {
                Tournament.Round round = t.pairNext(random);
                Set<Integer> seen = new HashSet<>();
                for (Tournament.Table m : round.tables()) {
                    assertTrue("cada jogador numa mesa só", seen.add(m.a));
                    if (m.bye()) { assertTrue("um bye por jogador", byes.add(m.a)); assertEquals(Tournament.Score.BYE, m.result); continue; }
                    assertTrue(seen.add(m.b));
                    assertTrue("sem revanche (semente " + seed + ")", pairs.add(Math.min(m.a, m.b) + "-" + Math.max(m.a, m.b)));
                }
                assertEquals(9, seen.size());
                playAll(t);
            }
            assertEquals(4, t.rounds.size());
            assertThrows(IllegalArgumentException.class, () -> t.pairNext(random));
        }
    }

    @Test public void laterRoundsPairPlayersWithTheSamePoints() {
        Tournament t = with(8);
        Random random = new Random(1);
        t.pairNext(random);
        playAll(t);
        Tournament.Round second = t.pairNext(random);
        List<Tournament.Standing> s = t.standings();
        for (Tournament.Table m : second.tables()) {
            int a = s.stream().filter(x -> x.player().id == m.a).findFirst().get().points();
            int b = s.stream().filter(x -> x.player().id == m.b).findFirst().get().points();
            assertEquals("vencedores contra vencedores", a, b);
        }
    }

    @Test public void theNextRoundWaitsForEveryResult() {
        Tournament t = with(4);
        t.pairNext(new Random(2));
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> t.pairNext(new Random(2)));
        assertEquals("Falta lançar resultados da rodada 1.", e.getMessage());
        assertThrows(IllegalArgumentException.class, t::finish);
    }

    @Test public void lateEntrantsStartWithALossUntilTheSecondRoundIsPaired() {
        Tournament t = with(4);
        Random random = new Random(3);
        t.pairNext(random);
        Tournament.Player late = t.addPlayer("Atrasada");
        assertEquals(2, late.joined);
        playAll(t);
        Tournament.Standing s = t.standings().stream().filter(x -> x.player() == late).findFirst().get();
        assertEquals(0, s.points());
        assertEquals(1, s.losses());
        assertFalse("a derrota não tem oponente", s.hasOpponents());
        // Ninguém tem a atrasada entre os oponentes: o desempate dos outros não muda.
        for (Tournament.Standing x : t.standings()) if (x.player() != late) assertEquals(1, x.wins() + x.losses());
        Tournament.Round second = t.pairNext(random);
        assertTrue("a atrasada é sorteada na 2ª", second.tables().stream().anyMatch(m -> m.a == late.id || m.b == late.id));
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> t.addPlayer("Muito atrasado"));
        assertEquals("As inscrições fecharam: a 2ª rodada já foi sorteada.", e.getMessage());
    }

    @Test public void undoingTheFirstPairingTurnsLateEntrantsIntoRegularOnes() {
        Tournament t = with(4);
        t.pairNext(new Random(4));
        Tournament.Player late = t.addPlayer("Atrasado");
        t.undoPairing();
        assertEquals(1, late.joined);
        assertEquals("inscricoes", t.status());
        t.pairNext(new Random(4));
        playAll(t);
        assertThrows(IllegalArgumentException.class, t::undoPairing);
    }

    @Test public void tiebreakersFollowTheMagicRules() {
        // A vence B e C; B vence C e D; C vence D; D perde tudo. Três rodadas com 4 jogadores, montadas à mão.
        Tournament t = with(4);
        t.rounds.add(new Tournament.Round(1, List.of(new Tournament.Table(1, 1, 2, new Tournament.Score(2, 1, 0)), new Tournament.Table(2, 3, 4, new Tournament.Score(2, 0, 0)))));
        t.rounds.add(new Tournament.Round(2, List.of(new Tournament.Table(1, 1, 3, new Tournament.Score(2, 0, 0)), new Tournament.Table(2, 2, 4, new Tournament.Score(2, 0, 0)))));
        t.rounds.add(new Tournament.Round(3, List.of(new Tournament.Table(1, 1, 4, new Tournament.Score(1, 1, 1)), new Tournament.Table(2, 2, 3, new Tournament.Score(2, 1, 0)))));
        List<Tournament.Standing> s = t.standings();
        assertEquals(List.of(1, 2, 3, 4), s.stream().map(x -> x.player().id).toList());
        Tournament.Standing a = s.get(0);
        assertEquals(7, a.points());
        assertEquals(1, a.draws());
        // Oponentes de A: B (6/9), C (3/9) e D (1/9 → piso 1/3).
        assertEquals((6 / 9.0 + 1 / 3.0 + 1 / 3.0) / 3, a.omw(), 1e-9);
        // Jogos de A: 2-1, 2-0, 1-1-1 → 5 vitórias e 1 empate em 8 jogos.
        assertEquals((5 * 3 + 1) / 24.0, a.gw(), 1e-9);
        Tournament.Standing d = s.get(3);
        assertEquals("o piso de 1/3 vale também para o próprio jogador", 1 / 3.0, d.gw(), 1e-9);
    }

    @Test public void droppedPlayersStayInTheStandingsButAreNotPaired() {
        Tournament t = with(5);
        Random random = new Random(5);
        t.pairNext(random);
        playAll(t);
        Tournament.Player gone = t.players.get(0);
        t.drop(gone.id, true);
        Tournament.Round second = t.pairNext(random);
        assertTrue(second.tables().stream().noneMatch(m -> m.a == gone.id || m.b == gone.id));
        assertEquals("4 jogadores, sem bye", 2, second.tables().size());
        assertEquals(5, t.standings().size());
        assertThrows(IllegalArgumentException.class, () -> t.removePlayer(gone.id));
    }

    @Test public void resultsAreValidatedAndOnlyTheCurrentRoundCanBeCleared() {
        Tournament t = with(4);
        Random random = new Random(6);
        t.pairNext(random);
        assertThrows(IllegalArgumentException.class, () -> t.result(1, 1, new Tournament.Score(4, 3, 0)));
        assertThrows(IllegalArgumentException.class, () -> t.result(1, 9, new Tournament.Score(2, 0, 0)));
        playAll(t);
        t.pairNext(random);
        t.result(1, 1, new Tournament.Score(0, 2, 0));
        assertThrows(IllegalArgumentException.class, () -> t.result(1, 1, null));
        assertThrows(IllegalArgumentException.class, () -> t.addPlayer("jogador 1"));
    }

    @Test public void jsonRoundTripKeepsEverything() {
        Tournament t = with(5);
        Random random = new Random(7);
        t.pairNext(random);
        t.addPlayer("Atrasado");
        playAll(t);
        t.drop(t.players.get(1).id, true);
        Tournament back = Tournament.fromJson(JsonParser.parseString(t.toJson().toString()).getAsJsonObject());
        assertEquals(t.toJson(), back.toJson());
        assertEquals(t.publicJson(true), back.publicJson(true));
        assertEquals("Jogador 6", back.addPlayer("Jogador 6").name);
    }

    // ---------- Rotas ----------

    private static final String TOKEN_A = "Bearer a", TOKEN_B = "Bearer b";

    private Tournaments routes() throws Exception {
        Tournaments.Auth auth = h -> switch (h) {
            case TOKEN_A -> new FeedbackStore.Author("Kassio", "conta-a", false);
            case TOKEN_B -> new FeedbackStore.Author("Bia", "conta-b", false);
            default -> null;
        };
        return new Tournaments(tmp.getRoot().toPath().resolve("torneios"), auth, () -> 1_800_000_000_000L, new Random(8));
    }

    private static JsonObject json(Admin.Response r) { return JsonParser.parseString(new String(r.body(), StandardCharsets.UTF_8)).getAsJsonObject(); }
    private static byte[] body(String json) { return json.getBytes(StandardCharsets.UTF_8); }

    @Test public void onlyTheOrganizerChangesAndAnyoneWithTheLinkSees() throws Exception {
        Tournaments routes = routes();
        assertEquals(401, routes.handle("POST", "", null, body("{\"nome\":\"Liga\"}")).status());
        Admin.Response created = routes.handle("POST", "", TOKEN_A, body("{\"nome\":\"  Liga   de sexta \",\"formato\":\"Pauper\"}"));
        assertEquals(200, created.status());
        JsonObject t = json(created).getAsJsonObject("torneio");
        String code = t.get("id").getAsString();
        assertEquals("Liga de sexta", t.get("nome").getAsString());
        assertEquals("Kassio", t.get("organizador").getAsString());
        assertFalse("a conta do organizador não sai no público", t.toString().contains("conta-a"));
        assertTrue(t.get("organizadorSouEu").getAsBoolean());

        for (String name : new String[]{"Ana", "Bruno", "Caio"}) assertEquals(200, routes.handle("POST", code + "/jogadores", TOKEN_A, body("{\"nome\":\"" + name + "\"}")).status());
        assertEquals(403, routes.handle("POST", code + "/jogadores", TOKEN_B, body("{\"nome\":\"Intruso\"}")).status());
        assertEquals(401, routes.handle("POST", code + "/rodadas", null, new byte[0]).status());

        JsonObject seen = json(routes.handle("GET", code.toLowerCase(), null, new byte[0])).getAsJsonObject("torneio");
        assertFalse(seen.get("organizadorSouEu").getAsBoolean());
        assertEquals(3, seen.getAsJsonArray("jogadores").size());

        JsonObject paired = json(routes.handle("POST", code + "/rodadas", TOKEN_A, new byte[0])).getAsJsonObject("torneio");
        assertEquals("andamento", paired.get("estado").getAsString());
        JsonArray tables = paired.getAsJsonArray("rodadasJogadas").get(0).getAsJsonObject().getAsJsonArray("mesas");
        assertEquals(2, tables.size());
        Admin.Response bad = routes.handle("PUT", code + "/rodadas/1/mesas/1", TOKEN_A, body("{\"a\":9,\"b\":0}"));
        assertEquals(400, bad.status());
        assertEquals("Placar inválido.", json(bad).get("error").getAsString());
        assertEquals(200, routes.handle("PUT", code + "/rodadas/1/mesas/1", TOKEN_A, body("{\"a\":2,\"b\":1,\"empates\":0}")).status());

        Admin.Response late = routes.handle("POST", code + "/jogadores", TOKEN_A, body("{\"nome\":\"Duda\"}"));
        assertEquals(2, json(late).getAsJsonObject("torneio").getAsJsonArray("jogadores").get(3).getAsJsonObject().get("entrou").getAsInt());

        assertEquals(1, json(routes.handle("GET", "", TOKEN_A, new byte[0])).getAsJsonArray("torneios").size());
        assertEquals(0, json(routes.handle("GET", "", TOKEN_B, new byte[0])).getAsJsonArray("torneios").size());

        // Outro servidor no mesmo diretório acha o torneio e o dono.
        Tournaments again = routes();
        assertEquals(1, again.count());
        assertEquals(403, again.handle("DELETE", code, TOKEN_B, new byte[0]).status());
        assertEquals(200, again.handle("DELETE", code, TOKEN_A, new byte[0]).status());
        assertEquals(404, again.handle("GET", code, null, new byte[0]).status());
        assertEquals(404, again.handle("GET", "../contas", null, new byte[0]).status());
    }
}
