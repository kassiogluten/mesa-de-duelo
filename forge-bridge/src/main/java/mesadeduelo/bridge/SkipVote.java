package mesadeduelo.bridge;

import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Votação para pular o turno de um jogador que caiu numa sala. Só votam os jogadores conectados (menos o
 * próprio alvo); passa com a maioria deles e cai quando a maioria já não é mais possível.
 */
final class SkipVote {
    enum Result { OPEN, APPROVED, REJECTED }

    /** Assento do jogador desconectado. */
    final int target;
    final Set<Integer> yes = new LinkedHashSet<>(), no = new LinkedHashSet<>();

    SkipVote(int target) { this.target = target; }

    /** Mais da metade dos que podem votar. */
    static int needed(int voters) { return voters / 2 + 1; }

    /** Registra (ou troca) o voto de um assento. */
    void vote(int seat, boolean value) {
        yes.remove(seat); no.remove(seat);
        (value ? yes : no).add(seat);
    }

    /** Com quem pode votar agora: quem caiu ou saiu deixa de contar. */
    Result result(Set<Integer> voters) {
        yes.retainAll(voters); no.retainAll(voters);
        int need = needed(voters.size());
        if (voters.isEmpty()) return Result.REJECTED;
        if (yes.size() >= need) return Result.APPROVED;
        if (voters.size() - no.size() < need) return Result.REJECTED;
        return Result.OPEN;
    }
}
