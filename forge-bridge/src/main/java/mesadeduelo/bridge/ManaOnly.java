package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.InputPassPriority;
import forge.interfaces.IGameController;
import forge.player.PlayerControllerHuman;

/**
 * Permanentes em que um clique agora só geraria mana: tudo o que dá para ativar nelas é habilidade de mana.
 * A mesa usa isso para avisar quem vira terrenos na manutenção achando que já está na fase principal.
 */
final class ManaOnly {
    private ManaOnly() { }

    /** Só no prompt comum de prioridade. Lido fora da thread do jogo: na dúvida, nenhuma. */
    static Set<Integer> ids(IGameController controller) {
        Set<Integer> ids = new LinkedHashSet<>();
        if (!(controller instanceof PlayerControllerHuman human) || !(human.getInputQueue().getInput() instanceof InputPassPriority)) return ids;
        try {
            Player me = human.getPlayer();
            if (me == null) return ids;
            for (Card card : new ArrayList<>(me.getCardsIn(ZoneType.Battlefield))) if (manaOnly(me, card)) ids.add(card.getId());
        } catch (RuntimeException e) { ids.clear(); }
        return ids;
    }

    static boolean manaOnly(Player me, Card card) {
        List<SpellAbility> abilities = card.getAllPossibleAbilities(me, true);
        return !abilities.isEmpty() && abilities.stream().allMatch(SpellAbility::isManaAbility);
    }
}
