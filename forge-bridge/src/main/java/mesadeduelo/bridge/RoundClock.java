package mesadeduelo.bridge;

import java.time.Instant;

import com.google.gson.JsonObject;

/**
 * Relógio da rodada atual de um {@link Tournament}: parado até o organizador iniciar, depois correndo ou pausado.
 *
 * Correndo, guarda a hora em que acaba ({@code endsAt}), e cada aparelho conta sozinho até lá; parado ou pausado,
 * guarda o que falta ({@code left}). O tempo pode passar do zero: a mesa mostra "Tempo! Mais 5 turnos" e os placares
 * continuam sendo lançados à mão. Sortear ou desfazer uma rodada volta o relógio para o tempo cheio, parado.
 */
final class RoundClock {
    static final int DEFAULT_MINUTES = 50;
    static final int MIN_MINUTES = 5;
    static final int MAX_MINUTES = 180;
    /** Quanto dá para somar ou tirar de uma vez. */
    static final int MAX_ADJUST = 60;
    private static final long MINUTE = 60_000L;

    private int minutes = DEFAULT_MINUTES;
    private long left = DEFAULT_MINUTES * MINUTE;
    /** 0: não está correndo. */
    private long endsAt;
    private boolean started;

    int minutes() { return minutes; }

    /** Muda o tempo das rodadas; o relógio que ainda não começou passa a ter o tempo novo. */
    void minutes(int n) {
        if (n < MIN_MINUTES || n > MAX_MINUTES) throw new IllegalArgumentException("Escolha de " + MIN_MINUTES + " a " + MAX_MINUTES + " minutos por rodada.");
        minutes = n;
        if (!started) left = n * MINUTE;
    }

    boolean running() { return endsAt != 0; }

    /** O que falta agora, negativo depois do tempo. */
    long remaining(long now) { return running() ? endsAt - now : left; }

    void start(long now) {
        if (running()) throw new IllegalArgumentException("O relógio já está correndo.");
        endsAt = now + left;
        started = true;
    }

    void pause(long now) {
        if (!running()) throw new IllegalArgumentException("O relógio não está correndo.");
        left = endsAt - now;
        endsAt = 0;
    }

    /** Soma (ou tira, com negativo) minutos, correndo ou não. */
    void adjust(long now, int deltaMinutes) {
        if (deltaMinutes == 0 || Math.abs(deltaMinutes) > MAX_ADJUST) throw new IllegalArgumentException("Some ou tire de 1 a " + MAX_ADJUST + " minutos.");
        long delta = deltaMinutes * MINUTE;
        if (running()) endsAt += delta; else left += delta;
    }

    /** Volta ao tempo cheio, parado: rodada nova, sorteio desfeito ou o organizador recomeçando. */
    void reset() {
        left = minutes * MINUTE;
        endsAt = 0;
        started = false;
    }

    // ---------- JSON ----------

    JsonObject toJson() {
        JsonObject o = new JsonObject();
        o.addProperty("minutos", minutes);
        o.addProperty("restante", left);
        o.addProperty("terminaEm", endsAt);
        o.addProperty("iniciado", started);
        return o;
    }

    static RoundClock fromJson(JsonObject o) {
        RoundClock c = new RoundClock();
        if (o == null) return c;
        c.minutes = o.get("minutos").getAsInt();
        c.left = o.get("restante").getAsLong();
        c.endsAt = o.get("terminaEm").getAsLong();
        c.started = o.get("iniciado").getAsBoolean();
        return c;
    }

    /**
     * O que a página mostra: o estado, o que falta agora e, correndo, a hora do fim. {@code agora} é a hora do servidor,
     * para cada aparelho acertar a diferença do próprio relógio.
     */
    JsonObject publicJson(long now) {
        JsonObject o = new JsonObject();
        o.addProperty("estado", running() ? "correndo" : started ? "pausado" : "parado");
        o.addProperty("restanteMs", remaining(now));
        if (running()) o.addProperty("terminaEm", Instant.ofEpochMilli(endsAt).toString());
        o.addProperty("agora", now);
        return o;
    }
}
