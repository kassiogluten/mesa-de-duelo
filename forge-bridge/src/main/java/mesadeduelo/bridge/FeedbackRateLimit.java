package mesadeduelo.bridge;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;

/**
 * Limite de relatos por IP numa janela deslizante, só em memória. O IP nunca é guardado: a chave é um
 * SHA-256 com um sal sorteado a cada execução da ponte, então nem a memória permite voltar ao endereço.
 */
final class FeedbackRateLimit {
    private final int max;
    private final long windowMillis;
    private final byte[] salt = new byte[16];
    private final Map<String, ArrayDeque<Long>> recent = new HashMap<>();

    FeedbackRateLimit(int max, long windowMillis) {
        this.max = max; this.windowMillis = windowMillis;
        new SecureRandom().nextBytes(salt);
    }

    String key(String ip) {
        try {
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            sha.update(salt);
            return HexFormat.of().formatHex(sha.digest(String.valueOf(ip).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Já chegou ao limite na janela que termina agora? */
    synchronized boolean exceeded(String key, long now) {
        ArrayDeque<Long> times = recent.get(key);
        if (times == null) return false;
        prune(times, now);
        return times.size() >= max;
    }

    /** Conta um relato aceito. */
    synchronized void record(String key, long now) {
        recent.computeIfAbsent(key, k -> new ArrayDeque<>()).addLast(now);
        if (recent.size() > 1000) recent.values().removeIf(times -> { prune(times, now); return times.isEmpty(); });
    }

    synchronized int keys() { return recent.size(); }

    private void prune(ArrayDeque<Long> times, long now) {
        while (!times.isEmpty() && times.peekFirst() <= now - windowMillis) times.removeFirst();
    }
}
