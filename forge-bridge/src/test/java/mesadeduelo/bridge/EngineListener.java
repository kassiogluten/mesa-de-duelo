package mesadeduelo.bridge;

import org.junit.runner.Description;
import org.junit.runner.notification.RunListener;

/**
 * Liga o motor do Forge uma vez antes de qualquer teste (configurado no surefire, no pom.xml).
 * Sem isso, uma classe que esquece o {@code @BeforeClass engine()} (como o AdminTest) quebra a inicialização
 * estática de classes do Forge (PhaseType, UndoHistory) e derruba as classes que rodam depois dela.
 */
public class EngineListener extends RunListener {
    @Override public void testRunStarted(Description description) {
        if (System.getProperty("forge.dir") == null) return; // a mensagem clara sai do primeiro teste que precisar do motor
        BridgeRulesTest.engine();
    }
}
