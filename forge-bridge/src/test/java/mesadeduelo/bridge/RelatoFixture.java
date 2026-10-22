package mesadeduelo.bridge;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import com.google.gson.JsonObject;

import forge.ai.LobbyPlayerAi;
import forge.deck.Deck;
import forge.game.Game;
import forge.game.GameState;
import forge.game.Match;
import forge.game.player.RegisteredPlayer;

/**
 * Do relato ao teste de regressão: monta um jogo de verdade, sem tela, com os decks do diário da ponte e o
 * retrato do Forge aplicado. Uso, no estilo dos testes com o motor real:
 *
 * <pre>
 *   Game game = RelatoFixture.load(Path.of("src/test/resources/relatos/R-7K2Q.json.gz")).game(2);
 *   // ... jogar a partir daqui (game.getAction(), CommanderEngineTest...) e verificar o erro corrigido.
 * </pre>
 *
 * Todos os jogadores são da IA e ficam na ordem original (p0, p1...), sem a rotação do modo replay.
 * Antes de usar, chame {@link BridgeRulesTest#engine()}.
 */
final class RelatoFixture {
    final JsonObject journal;

    private RelatoFixture(JsonObject journal) { this.journal = journal; }

    /** Um relato guardado pela ponte ({@code relatos/AAAA-MM/R-XXXX.json.gz}). */
    static RelatoFixture load(Path relato) throws java.io.IOException { return new RelatoFixture(Replay.journalOf(relato)); }

    /** Um diário já lido (o campo "bridge" do relato). */
    static RelatoFixture of(JsonObject journal) { return new RelatoFixture(journal); }

    MatchConfig config() {
        JsonObject c = journal.getAsJsonObject("config");
        return new MatchConfig(c.get("format").getAsString(), c.get("matchLength").getAsString(), c.get("playerCount").getAsInt());
    }

    String state(int snapshot) {
        return journal.getAsJsonArray("snapshots").get(snapshot).getAsJsonObject().get("state").getAsString();
    }

    /** Jogo novo com os decks do diário e o retrato {@code snapshot} aplicado. */
    Game game(int snapshot) {
        MatchConfig config = config();
        List<Deck> decks = new ArrayList<>();
        List<String> names = new ArrayList<>();
        for (JsonObject p : MatchJournal.players(journal)) {
            decks.add(Replay.deck(p, config.format()));
            names.add(p.get("name").getAsString());
        }
        return game(config, decks, names, state(snapshot));
    }

    /** Jogo novo com estes decks (na ordem p0, p1...) e um retrato em texto do GameState. */
    static Game game(MatchConfig config, List<Deck> decks, List<String> names, String state) {
        List<RegisteredPlayer> players = new ArrayList<>();
        for (int i = 0; i < decks.size(); i++) {
            RegisteredPlayer rp = config.commander() ? RegisteredPlayer.forCommander(decks.get(i)) : new RegisteredPlayer(decks.get(i));
            players.add(rp.setPlayer(new LobbyPlayerAi(names.get(i), null)));
        }
        Game game = new Match(config.rules(), players, "Relato").createGame();
        game.setNoGUIUser();
        apply(game, state);
        return game;
    }

    /** Aplica o retrato numa thread "Game..." (o Forge só aplica na hora se estiver na thread do jogo). */
    static void apply(Game game, String state) {
        GameState gs = new GameState();
        gs.parse(Arrays.asList(state.split("\n")));
        AtomicReference<Throwable> error = new AtomicReference<>();
        Thread t = new Thread(() -> {
            try { gs.applyToGame(game); } catch (Throwable e) { error.set(e); }
        }, "Game relato");
        t.start();
        try { t.join(30_000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        if (t.isAlive()) throw new AssertionError("O retrato não terminou de ser aplicado em 30 s.");
        if (error.get() != null) throw new AssertionError("Falha ao aplicar o retrato", error.get());
    }
}
