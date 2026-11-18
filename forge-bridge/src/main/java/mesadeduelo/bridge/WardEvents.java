// O gatilho da proteção contra alvos (ward) nos eventos da mesa: contra qual item da pilha ele disparou e, ao resolver, se segurou (anulou) ou se pagaram o custo.
package mesadeduelo.bridge;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.ability.AbilityKey;
import forge.game.keyword.Keyword;
import forge.game.spellability.SpellAbility;
import forge.game.spellability.SpellAbilityStackInstance;

final class WardEvents {
    /** Ward na pilha (id da habilidade) → id da mágica ou habilidade que mirou a permanente. */
    private final Map<Integer, Integer> pending = new HashMap<>();
    /** Wards que já anularam quem mirou, esperando a própria resolução para dizer que seguraram. */
    private final Set<Integer> held = new HashSet<>();

    void reset() { pending.clear(); held.clear(); }

    static boolean isWard(SpellAbility sa) {
        return sa != null && sa.isTrigger() && sa.getTrigger() != null && sa.getTrigger().isKeyword(Keyword.WARD);
    }

    /**
     * Ward indo para a pilha: {@code ward} no evento e, em {@code wardAgainst}, o item da pilha que mirou a permanente
     * (para a mesa saber de que lado veio o golpe).
     */
    void cast(JsonObject event, Game game, SpellAbility sa) {
        if (!isWard(sa)) return;
        event.addProperty("ward", true);
        if (!(sa.getTriggeringObject(AbilityKey.SourceSA) instanceof SpellAbility aimed)) return;
        pending.put(sa.getId(), aimed.getId());
        SpellAbilityStackInstance si = game == null ? null : game.getStack().getInstanceMatchingSpellAbilityID(aimed);
        if (si != null) event.addProperty("wardAgainst", si.getId());
    }

    /**
     * Um item saiu da pilha sem resolver: se foi o ward resolvendo que o anulou, conta como anulado (mesmo no ward de
     * vários custos, cuja habilidade é uma escolha, e não "anular") e o ward segurou.
     */
    boolean countered(int removed, Game game) {
        SpellAbility resolving = game == null ? null : game.getStack().getResolvingAbility();
        SpellAbility top = resolving == null ? null : resolving.getRootAbility();
        if (top == null || !isWard(top)) return false;
        Integer aimed = pending.get(top.getId());
        if (aimed == null || aimed != removed) return false;
        held.add(top.getId());
        return true;
    }

    /** O ward resolveu: {@code held} diz se ele anulou quem mirou (senão, pagaram o custo ou o alvo já tinha saído). */
    void resolved(JsonObject event, int ability) {
        if (pending.remove(ability) == null) return;
        event.addProperty("held", held.remove(ability));
    }
}
