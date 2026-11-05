package mesadeduelo.bridge;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Campos e métodos privados do Forge lidos por reflexão. Se uma versão nova do Forge tirar ou renomear um deles, a
 * classe que o usa continua carregando: o membro fica ausente, sai um aviso no log (uma vez, com classe e nome) e só
 * o detalhe que dependia dele se desliga. Quem usa confere {@link #present} antes, ou recebe {@link Missing} (um
 * IllegalStateException, como as outras falhas de leitura) e cai no seu "não se aplica".
 * {@code ForgeReflectionTest} confere que todos existem no Forge fixado.
 */
final class ForgeReflection {
    private ForgeReflection() { }

    /** Um membro que esta versão do Forge não tem. */
    static final class Missing extends IllegalStateException {
        Missing(String member) { super("O Forge desta versão não tem " + member + "."); }
    }

    /** Todo membro pedido até agora (Classe.nome → existe), na ordem em que foi pedido. */
    private static final Map<String, Boolean> MEMBERS = Collections.synchronizedMap(new LinkedHashMap<>());

    static Map<String, Boolean> members() {
        synchronized (MEMBERS) { return new LinkedHashMap<>(MEMBERS); }
    }

    private static void register(String name, boolean found, Throwable cause) {
        MEMBERS.put(name, found);
        if (!found) Log.bridge().warn("Forge sem " + name + " (" + cause + "); o detalhe que usa esse campo fica desligado.");
    }

    static FieldRef field(Class<?> type, String name) {
        String label = type.getSimpleName() + "." + name;
        Field field = null; Throwable cause = null;
        try { field = type.getDeclaredField(name); field.setAccessible(true); }
        catch (ReflectiveOperationException | RuntimeException e) { field = null; cause = e; }
        register(label, field != null, cause);
        return new FieldRef(label, field);
    }

    static MethodRef method(Class<?> type, String name, Class<?>... args) {
        String label = type.getSimpleName() + "." + name + "()";
        Method method = null; Throwable cause = null;
        try { method = type.getDeclaredMethod(name, args); method.setAccessible(true); }
        catch (ReflectiveOperationException | RuntimeException e) { method = null; cause = e; }
        register(label, method != null, cause);
        return new MethodRef(label, method);
    }

    /** Todos presentes? Para o chamador desligar o detalhe antes de começar a ler. */
    static boolean present(Ref... refs) {
        for (Ref ref : refs) if (!ref.present()) return false;
        return true;
    }

    interface Ref { boolean present(); }

    static final class FieldRef implements Ref {
        final String name;
        private final Field field;
        private FieldRef(String name, Field field) { this.name = name; this.field = field; }
        public boolean present() { return field != null; }

        Object get(Object target) {
            if (field == null) throw new Missing(name);
            try { return field.get(target); }
            catch (IllegalAccessException e) { throw new IllegalStateException(e); }
        }

        void set(Object target, Object value) {
            if (field == null) throw new Missing(name);
            try { field.set(target, value); }
            catch (IllegalAccessException e) { throw new IllegalStateException(e); }
        }
    }

    static final class MethodRef implements Ref {
        final String name;
        private final Method method;
        private MethodRef(String name, Method method) { this.name = name; this.method = method; }
        public boolean present() { return method != null; }

        Object invoke(Object target, Object... args) throws ReflectiveOperationException {
            if (method == null) throw new Missing(name);
            return method.invoke(target, args);
        }
    }
}
