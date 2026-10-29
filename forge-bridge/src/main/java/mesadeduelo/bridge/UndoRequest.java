package mesadeduelo.bridge;

import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Pedido de desfazer numa partida com a opção ligada: quem pediu volta para a sua última decisão se todos os outros
 * jogadores conectados aceitarem. Uma recusa derruba o pedido; quem caiu ou saiu deixa de contar.
 */
final class UndoRequest {
    enum Result { OPEN, APPROVED, REJECTED }

    /** Assento de quem pediu. */
    final int requester;
    /** A decisão que será desfeita (o jogo volta para logo antes dela). */
    final UndoHistory.Step step;
    final Set<Integer> yes = new LinkedHashSet<>(), no = new LinkedHashSet<>();

    UndoRequest(int requester, UndoHistory.Step step) { this.requester = requester; this.step = step; }

    /** Registra (ou troca) o voto de um assento. */
    void vote(int seat, boolean value) {
        yes.remove(seat); no.remove(seat);
        (value ? yes : no).add(seat);
    }

    /** Com quem pode votar agora; sem ninguém para votar (contra a IA), passa na hora. */
    Result result(Set<Integer> voters) {
        yes.retainAll(voters); no.retainAll(voters);
        if (!no.isEmpty()) return Result.REJECTED;
        if (yes.containsAll(voters)) return Result.APPROVED;
        return Result.OPEN;
    }
}
