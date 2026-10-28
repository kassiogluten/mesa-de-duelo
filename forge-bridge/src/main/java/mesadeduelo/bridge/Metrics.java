package mesadeduelo.bridge;

import java.util.function.Supplier;
import java.util.function.ToDoubleFunction;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.binder.jvm.ClassLoaderMetrics;
import io.micrometer.core.instrument.binder.jvm.JvmGcMetrics;
import io.micrometer.core.instrument.binder.jvm.JvmMemoryMetrics;
import io.micrometer.core.instrument.binder.jvm.JvmThreadMetrics;
import io.micrometer.core.instrument.binder.system.FileDescriptorMetrics;
import io.micrometer.core.instrument.binder.system.ProcessorMetrics;
import io.micrometer.core.instrument.binder.system.UptimeMetrics;
import io.micrometer.prometheusmetrics.PrometheusConfig;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;

/**
 * Métricas da ponte no formato do Prometheus, servidas em /metrics na mesma porta do WebSocket.
 * O nginx só repassa /ws, então este endereço fica visível apenas na rede interna dos containers.
 *
 * Etiquetas têm valores fechados (formato, modo, desfecho) para não multiplicar séries com dados do cliente.
 */
final class Metrics {
    static final PrometheusMeterRegistry REGISTRY = new PrometheusMeterRegistry(PrometheusConfig.DEFAULT);
    static final String[] FORMATS = {"free", "pauper", "sacola50", "commander"};
    static final String[] MODES = {"ia", "rede"};

    static {
        REGISTRY.config().commonTags("application", "mesa-de-duelo");
        new ClassLoaderMetrics().bindTo(REGISTRY);
        new JvmMemoryMetrics().bindTo(REGISTRY);
        new JvmGcMetrics().bindTo(REGISTRY);
        new JvmThreadMetrics().bindTo(REGISTRY);
        new ProcessorMetrics().bindTo(REGISTRY);
        new UptimeMetrics().bindTo(REGISTRY);
        new FileDescriptorMetrics().bindTo(REGISTRY);
    }

    static final Counter MESSAGES = Counter.builder("mesa.ws.messages.received").description("Mensagens recebidas dos navegadores").register(REGISTRY);
    static final Counter INVALID_MESSAGES = Counter.builder("mesa.ws.messages.invalid").description("Mensagens que não eram JSON válido").register(REGISTRY);
    static final Counter REQUEST_ERRORS = Counter.builder("mesa.requests.rejected").description("Pedidos recusados (deck inválido, sala cheia, código errado...)").register(REGISTRY);
    static final Counter CODE_MISSES_BLOCKED = Counter.builder("mesa.rooms.code.blocked").description("Buscas de sala recusadas por excesso de códigos errados do mesmo IP").register(REGISTRY);
    static final Counter TICK_ERRORS = Counter.builder("mesa.tick.errors").description("Exceções ao publicar o estado das partidas").register(REGISTRY);
    static final Timer TICK = Timer.builder("mesa.tick").description("Tempo para publicar o estado de todas as partidas (a cada 50 ms)").register(REGISTRY);

    private Metrics() { }

    static String mode(boolean room) { return room ? "rede" : "ia"; }
    static String format(String format) {
        for (String f : FORMATS) if (f.equals(format)) return f;
        return "outro";
    }

    static void matchStarted(String format, boolean room, int players) {
        Counter.builder("mesa.matches.started").description("Partidas iniciadas (inclui revanches)")
            .tags("format", format(format), "mode", mode(room), "players", String.valueOf(players)).register(REGISTRY).increment();
    }

    static void gameFinished(String format, boolean room) {
        Counter.builder("mesa.games.finished").description("Jogos terminados (uma melhor de três tem até três)")
            .tags("format", format(format), "mode", mode(room)).register(REGISTRY).increment();
    }

    static void matchEnded(String format, boolean room, String outcome, long startedAtMillis) {
        Counter.builder("mesa.matches.ended").description("Partidas encerradas: concluída ou abandonada")
            .tags("format", format(format), "mode", mode(room), "outcome", outcome).register(REGISTRY).increment();
        if (startedAtMillis > 0)
            Timer.builder("mesa.match.duration").description("Duração das partidas, do início ao fim")
                .tags("format", format(format), "mode", mode(room), "outcome", outcome).register(REGISTRY)
                .record(java.time.Duration.ofMillis(System.currentTimeMillis() - startedAtMillis));
    }

    static final String[] FEEDBACK_KINDS = {"sugestao", "erro"};
    static final String[] FEEDBACK_REJECTIONS = {"invalido", "grande", "limite", "disco", "erro"};

    static {
        // Séries com zero desde o início, para o painel não ficar vazio antes do primeiro relato.
        for (String kind : FEEDBACK_KINDS) for (boolean attached : new boolean[]{false, true}) feedbackCounter(kind, attached);
        for (String reason : FEEDBACK_REJECTIONS) rejectedCounter(reason);
    }

    private static Counter feedbackCounter(String kind, boolean attached) {
        return Counter.builder("mesa.feedback.received").description("Relatos guardados, por tipo e se vieram com a partida")
            .tags("kind", kind, "attached", String.valueOf(attached)).register(REGISTRY);
    }

    private static Counter rejectedCounter(String reason) {
        return Counter.builder("mesa.feedback.rejected").description("Relatos recusados: inválido, grande demais, limite por IP, disco ou erro")
            .tags("reason", reason).register(REGISTRY);
    }

    static void feedbackReceived(String kind, boolean attached) {
        feedbackCounter("erro".equals(kind) ? "erro" : "sugestao", attached).increment();
    }

    static void feedbackRejected(String reason) {
        for (String r : FEEDBACK_REJECTIONS) if (r.equals(reason)) { rejectedCounter(r).increment(); return; }
        rejectedCounter("erro").increment();
    }

    static <T> void gauge(String name, String description, T source, ToDoubleFunction<T> value, String... tags) {
        Gauge.builder(name, source, value).description(description).tags(tags).register(REGISTRY);
    }

    static void gauge(String name, String description, Supplier<Number> value, String... tags) {
        Gauge.builder(name, value).description(description).tags(tags).register(REGISTRY);
    }

    static String scrape() { return REGISTRY.scrape(); }
}
