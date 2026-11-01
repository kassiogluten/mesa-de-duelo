package mesadeduelo.bridge;

import java.lang.reflect.Array;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.IdentityHashMap;
import java.util.List;

import forge.game.undo.GameMemento;

/**
 * Retrato do jogo guardado só pelo que muda em relação a outro, mais novo.
 *
 * Um {@link GameMemento} é um par de listas do tamanho do jogo inteiro (num Commander, 120 a 150 mil objetos): o objeto
 * e o retrato dele. O {@code Recorder} já reaproveita o retrato de cada objeto que não mudou, mas cada memento ainda
 * tem as duas listas completas, e são elas quase toda a memória do histórico. Aqui, o retrato mais novo fica inteiro e
 * cada um dos anteriores guarda só os objetos cujo retrato é outro (ou que não existem no mais novo) e os objetos do
 * mais novo que não existiam nele. Para voltar, os retratos são remontados do mais novo para trás.
 *
 * Lê e monta o memento por reflexão (os campos {@code targets} e {@code snaps} do Forge); se eles mudarem de nome,
 * {@link #AVAILABLE} fica falso e o histórico guarda os retratos inteiros, como antes.
 */
final class MementoDelta {
    private static final Field TARGETS, SNAPS;
    private static final Constructor<GameMemento> NEW;
    private static final Class<?> SNAP;
    static final boolean AVAILABLE;

    static {
        Field t = null, s = null; Constructor<GameMemento> c = null; Class<?> snap = null;
        try {
            t = GameMemento.class.getDeclaredField("targets"); t.setAccessible(true);
            s = GameMemento.class.getDeclaredField("snaps"); s.setAccessible(true);
            c = GameMemento.class.getDeclaredConstructor(); c.setAccessible(true);
            snap = s.getType().getComponentType();
            if (t.getType() != Object[].class || snap == null) t = null;
        } catch (ReflectiveOperationException | RuntimeException e) {
            t = null;
        }
        TARGETS = t; SNAPS = s; NEW = c; SNAP = snap;
        AVAILABLE = t != null;
    }

    /** Objetos com retrato diferente do mais novo (ou ausentes nele), com o retrato deles, e os que só o mais novo tem. */
    final Object[] targets, snaps, gone;

    private MementoDelta(Object[] targets, Object[] snaps, Object[] gone) { this.targets = targets; this.snaps = snaps; this.gone = gone; }

    /** Quantos objetos esta diferença guarda (medição). */
    int size() { return targets.length + gone.length; }

    static Object[] targets(GameMemento m) { return (Object[]) get(TARGETS, m); }
    static Object[] snaps(GameMemento m) { return (Object[]) get(SNAPS, m); }

    private static Object get(Field f, GameMemento m) {
        try { return f.get(m); } catch (IllegalAccessException e) { throw new IllegalStateException(e); }
    }

    /** {@code older} descrito pelo que muda em relação a {@code newer}. */
    static MementoDelta of(GameMemento older, GameMemento newer) {
        Object[] ot = targets(older), os = snaps(older), nt = targets(newer), ns = snaps(newer);
        int o = ot.length, n = nt.length;
        // A ordem é a da busca pelo grafo do jogo: o começo e o fim costumam bater posição a posição.
        int p = 0;
        while (p < o && p < n && ot[p] == nt[p]) p++;
        int q = 0;
        while (q < o - p && q < n - p && ot[o - 1 - q] == nt[n - 1 - q]) q++;
        List<Object> t = new ArrayList<>(), s = new ArrayList<>();
        for (int i = 0; i < p; i++) if (os[i] != ns[i]) { t.add(ot[i]); s.add(os[i]); }
        for (int i = 0; i < q; i++) if (os[o - 1 - i] != ns[n - 1 - i]) { t.add(ot[o - 1 - i]); s.add(os[o - 1 - i]); }
        IdentityHashMap<Object, Object> middle = new IdentityHashMap<>(Math.max(4, (n - p - q) * 2));
        for (int i = p; i < n - q; i++) middle.put(nt[i], ns[i]);
        for (int i = p; i < o - q; i++) {
            Object theirs = middle.remove(ot[i]);   // um retrato nunca é null: null é "não existe no mais novo"
            if (theirs != os[i]) { t.add(ot[i]); s.add(os[i]); }
        }
        return new MementoDelta(t.toArray(), s.toArray(), middle.keySet().toArray());
    }

    /** Um memento sendo remontado: começa no mais novo e recebe as diferenças, do mais novo para o mais antigo. */
    static final class Builder {
        private Object[] targets, snaps;
        private int size;
        private final IdentityHashMap<Object, Integer> index;
        private boolean[] removed;

        Builder(GameMemento newest) {
            Object[] t = targets(newest), s = snaps(newest);
            size = t.length;
            targets = Arrays.copyOf(t, size + 16);
            snaps = Arrays.copyOf(s, size + 16, Object[].class);
            removed = new boolean[size + 16];
            index = new IdentityHashMap<>(size * 2);
            for (int i = 0; i < size; i++) index.put(t[i], i);
        }

        /** Passa para o retrato anterior, descrito por {@code d} em relação ao atual. */
        Builder apply(MementoDelta d) {
            for (Object g : d.gone) { Integer i = index.get(g); if (i != null) removed[i] = true; }
            for (int k = 0; k < d.targets.length; k++) {
                Integer i = index.get(d.targets[k]);
                if (i == null) {
                    if (size == targets.length) {
                        int cap = size * 2 + 16;
                        targets = Arrays.copyOf(targets, cap); snaps = Arrays.copyOf(snaps, cap); removed = Arrays.copyOf(removed, cap);
                    }
                    i = size++;
                    targets[i] = d.targets[k];
                    index.put(d.targets[k], i);
                }
                snaps[i] = d.snaps[k];
                removed[i] = false;
            }
            return this;
        }

        /** O memento do retrato atual (uma cópia: o Builder pode seguir para trás). */
        GameMemento build() {
            int n = 0;
            for (int i = 0; i < size; i++) if (!removed[i]) n++;
            Object[] t = new Object[n];
            Object s = Array.newInstance(SNAP, n);
            Object[] so = (Object[]) s;
            for (int i = 0, j = 0; i < size; i++) if (!removed[i]) { t[j] = targets[i]; so[j] = snaps[i]; j++; }
            try {
                GameMemento m = NEW.newInstance();
                TARGETS.set(m, t);
                SNAPS.set(m, s);
                return m;
            } catch (ReflectiveOperationException e) {
                throw new IllegalStateException(e);
            }
        }
    }
}
