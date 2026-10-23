package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import forge.game.Game;
import forge.game.card.Card;
import forge.game.mana.Mana;
import forge.game.mana.ManaRefundService;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.MagicStack;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.InputPassPriority;
import forge.interfaces.IGameController;
import forge.player.PlayerControllerHuman;

/**
 * Desvirar uma permanente que foi virada para gerar mana, enquanto essa mana ainda está na reserva.
 * O Forge já guarda as ativações de mana que dá para desfazer (a pilha de "undo" da MagicStack), mas só
 * oferece desfazer a última ação inteira; aqui o jogador escolhe a carta. Gastar a mana, conjurar algo ou
 * mudar de fase limpa essa pilha, e aí a carta continua virada.
 */
final class ManaUndo {
    private ManaUndo() { }

    /** Cartas do jogador que um clique desviraria agora. Lido fora da thread do jogo: na dúvida, nenhuma. */
    static Set<Integer> untappable(IGameController controller) {
        Set<Integer> ids = new LinkedHashSet<>();
        try {
            Player me = owner(controller);
            if (me == null) return ids;
            for (Card card : new ArrayList<>(me.getCardsIn(ZoneType.Battlefield)))
                if (reversible(me, card) != null) ids.add(card.getId());
        } catch (RuntimeException e) { ids.clear(); }
        return ids;
    }

    /** Desfaz a ativação de mana mais recente da carta: desvira e tira da reserva a mana que ela gerou. */
    static boolean untap(IGameController controller, int cardId) {
        Player me = owner(controller);
        if (me == null) return false;
        Card card = me.getGame().findById(cardId);
        SpellAbility sa = card == null ? null : reversible(me, card);
        if (sa == null || !sa.undo()) return false;
        MagicStack stack = me.getGame().getStack();
        stack.clearUndoStack(sa);
        new ManaRefundService(sa).refundManaPaid();
        me.updateManaForView();
        // Um prompt novo de prioridade: o Forge recalcula as ações e grava o ponto para o "Desfazer" geral.
        if (((PlayerControllerHuman) controller).getInputQueue().getInput() instanceof InputPassPriority inp) inp.restartPrompt();
        return true;
    }

    /** Só com prioridade, no prompt comum, e com a pilha de desfazer do Forge sendo deste jogador. */
    private static Player owner(IGameController controller) {
        if (!(controller instanceof PlayerControllerHuman human)) return null;
        if (!(human.getInputQueue().getInput() instanceof InputPassPriority)) return null;
        Player me = human.getPlayer();
        Game game = me == null ? null : me.getGame();
        if (game == null || game.getPhaseHandler().getPriorityPlayer() != me || !game.getStack().canUndo(me)) return null;
        return me;
    }

    /** A última ativação de mana da carta, se ela virou a carta e toda a mana gerada ainda está na reserva. */
    private static SpellAbility reversible(Player me, Card card) {
        if (!card.isTapped() || card.getController() != me) return null;
        SpellAbility last = null;
        for (SpellAbility sa : me.getGame().getStack().filterUndoStackByHost(card)) last = sa;
        if (last == null || !last.isUndoable() || last.getManaPart() == null || last.getManaPart().getLastManaProduced().isEmpty() || last.getPayCosts() == null || !last.getPayCosts().hasTapCost()) return null;
        List<Mana> pool = new ArrayList<>();
        me.getManaPool().forEach(pool::add);
        for (Mana produced : last.getManaPart().getLastManaProduced()) if (!pool.remove(produced)) return null;
        return last;
    }
}
