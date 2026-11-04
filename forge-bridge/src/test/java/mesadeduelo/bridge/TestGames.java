package mesadeduelo.bridge;

import java.util.List;
import com.google.gson.JsonObject;
import forge.ai.LobbyPlayerAi;
import forge.deck.Deck;
import forge.game.Game;
import forge.game.Match;
import forge.game.card.Card;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.RegisteredPlayer;
import forge.game.zone.ZoneType;

/**
 * Partidas de teste montadas sem rede: dois jogadores da IA, na primeira fase principal do jogador A.
 * O motor do Forge já vem ligado pelo {@link EngineListener} (surefire); chamar {@link #engine()} só é preciso fora dele.
 */
final class TestGames {
    private TestGames() {}

    static void engine() { BridgeRulesTest.engine(); }

    /** Formato livre, grimórios vazios: as cartas entram com {@link #add}. */
    static Game empty() {
        return game(new Deck("A"), new Deck("B"), "free", "Exile permissions");
    }

    /** Pauper com os decks iniciais Brasa (A) e Floresta (B). */
    static Game pauper(String title) {
        return game(Decks.build("pauper-brasa"), Decks.build("pauper-floresta"), "pauper", title);
    }

    static Game game(Deck deckA, Deck deckB, String format, String title) {
        engine();
        var a = new RegisteredPlayer(deckA).setPlayer(new LobbyPlayerAi("A", null));
        var b = new RegisteredPlayer(deckB).setPlayer(new LobbyPlayerAi("B", null));
        Game game = new Match(new MatchConfig(format, "bo1").rules(), List.of(a, b), title).createGame();
        game.setNoGUIUser();
        game.getPhaseHandler().devModeSet(PhaseType.MAIN1, game.getPlayers().get(0));
        return game;
    }

    /** Põe uma carta pelo nome na zona do dono. */
    static Card add(Game game, String name, Player owner, ZoneType zone) {
        Card card = Card.fromPaperCard(DeckValidation.resolve(name), owner);
        owner.getZone(zone).add(card); card.setZone(owner.getZone(zone));
        return card;
    }

    /** O topo da pilha como o jogador {@code viewer} recebe no estado. */
    static JsonObject top(Game game, Player viewer) {
        return StateJson.game(game.getView(), viewer.getId(), game).getAsJsonArray("stack").get(0).getAsJsonObject();
    }
}
