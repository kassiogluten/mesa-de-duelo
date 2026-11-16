package mesadeduelo.bridge;

import static org.junit.Assert.*;

import forge.game.player.GameLossReason;
import org.junit.Test;

public class MetricsTest {
    private static boolean scraped(String series) {
        for (String line : Metrics.scrape().split("\n")) if (line.startsWith(series + " ")) return true;
        return false;
    }

    @Test
    public void rejectedRequestsKeepClosedLabels() {
        Metrics.requestRejected("join", "sala-inexistente");
        Metrics.requestRejected("qualquer-coisa-do-cliente", "recusado");
        Metrics.requestRejected(null, "falha");
        assertTrue(scraped("mesa_requests_rejected_total{application=\"mesa-de-duelo\",reason=\"sala-inexistente\",request=\"join\"}"));
        assertTrue(scraped("mesa_requests_rejected_total{application=\"mesa-de-duelo\",reason=\"recusado\",request=\"partida\"}"));
        assertTrue(scraped("mesa_requests_rejected_total{application=\"mesa-de-duelo\",reason=\"falha\",request=\"invalido\"}"));
        assertFalse(Metrics.scrape().contains("qualquer-coisa-do-cliente"));
    }

    @Test
    public void gameEndsHavePortugueseReasonsAndKnownStyles() {
        Metrics.gameLoss("commander", true, GameLossReason.CommanderDamage);
        Metrics.gameVsComputer("pauper", false, "estilo-inventado", "humano");
        Metrics.gameTurns("pauper", false, 9);
        assertTrue(scraped("mesa_games_losses_total{application=\"mesa-de-duelo\",format=\"commander\",mode=\"rede\",reason=\"comandante\"}"));
        assertTrue(scraped("mesa_games_vs_computer_total{application=\"mesa-de-duelo\",format=\"pauper\",mode=\"ia\",result=\"humano\",style=\"equilibrado\"}"));
        assertTrue(Metrics.scrape().contains("mesa_game_turns_sum{application=\"mesa-de-duelo\",format=\"pauper\",mode=\"ia\"}"));
    }
}
