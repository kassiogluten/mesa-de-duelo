package mesadeduelo.bridge;

import static org.junit.Assert.*;
import org.junit.Test;

/** O texto do pedido de Tripular: a contagem em português e na primeira linha. */
public class CrewSelectionTest {
    @Test public void crewCountComesFirstInPortuguese() {
        String forge = "Shorikai (127)\n - Tripular 8 (lembrete)\nEscolha as criaturas para virar.\nCrewing: 5 / 8";
        assertEquals("Tripulando: 5 / 8\nShorikai (127)\n - Tripular 8 (lembrete)\nEscolha as criaturas para virar.", CrewSelection.prompt(forge));
        assertEquals("Selando: 0 / 4\nCavalo", CrewSelection.prompt("Cavalo\nSaddling: 0 / 4"));
    }

    @Test public void otherPromptsStayAsTheyCame() {
        assertEquals("Descartar 1 carta(s)", CrewSelection.prompt("Descartar 1 carta(s)"));
        assertNull(CrewSelection.prompt(null));
    }
}
