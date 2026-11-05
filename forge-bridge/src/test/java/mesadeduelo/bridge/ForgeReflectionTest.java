package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.BeforeClass;
import org.junit.Test;

/**
 * Todo campo ou método privado do Forge que o servidor lê por reflexão existe no Forge fixado. Depois de atualizar o
 * Forge, a falha diz exatamente quais sumiram (cada um só desliga o detalhe que o usa, com um aviso no log).
 */
public class ForgeReflectionTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    /** As classes do servidor que pedem membros ao {@link ForgeReflection}, achadas no código-fonte. */
    private static List<String> users() throws Exception {
        Path root = Path.of("src/main/java");
        List<String> classes = new ArrayList<>();
        try (Stream<Path> files = Files.walk(root)) {
            for (Path file : files.filter(f -> f.toString().endsWith(".java")).toList()) {
                if (file.getFileName().toString().equals("ForgeReflection.java")) continue;
                String text = Files.readString(file);
                if (text.contains("ForgeReflection.field(") || text.contains("ForgeReflection.method("))
                    classes.add(root.relativize(file).toString().replace('\\', '/').replace('/', '.').replaceAll("\\.java$", ""));
            }
        }
        return classes;
    }

    @Test public void everyReflectiveMemberExistsInThePinnedForge() throws Exception {
        List<String> users = users();
        assertTrue("achou as classes que usam reflexão: " + users, users.size() >= 4);
        for (String name : users) Class.forName(name, true, getClass().getClassLoader());
        var members = ForgeReflection.members();
        List<String> missing = new ArrayList<>();
        members.forEach((member, found) -> { if (!found) missing.add(member); });
        assertTrue("membros do Forge que faltam: " + missing, missing.isEmpty());
        assertTrue("lista de membros: " + members.keySet(), members.size() >= 30);
        assertTrue("o Forge ainda tem os campos que o desfazer usa", MementoDelta.AVAILABLE);
    }

    @Test public void aMissingMemberOnlyTurnsItsUserOff() {
        var field = ForgeReflection.field(String.class, "campoQueNaoExiste");
        var method = ForgeReflection.method(String.class, "metodoQueNaoExiste");
        assertFalse(field.present());
        assertFalse(ForgeReflection.present(field, method));
        assertThrows(ForgeReflection.Missing.class, () -> field.get("x"));
        assertThrows(ForgeReflection.Missing.class, () -> method.invoke("x"));
        assertEquals(Boolean.FALSE, ForgeReflection.members().get("String.campoQueNaoExiste"));
    }
}
