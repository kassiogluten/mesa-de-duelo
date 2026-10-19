package mesadeduelo.bridge;

import java.util.HashMap;
import java.util.Map;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.card.CardView;
import forge.game.card.CounterEnumType;
import forge.game.combat.Combat;
import forge.game.keyword.Keyword;
import forge.game.keyword.KeywordView;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.PlayerView;
import forge.game.spellability.SpellAbility;

/**
 * O que a mesa precisa para desenhar um dano sem ler o texto do Forge: se é combate e em qual etapa, as palavras-chave
 * da fonte que mudam o golpe (atropelar, golpe duplo, toque mortífero, vínculo com a vida), dano a si mesmo, de
 * comandante e se o golpe é letal. O Forge só diz se é combate no dano a jogador; nas cartas, a etapa e o combate
 * vêm do estado do jogo no momento do evento (o dano de combate nunca é causado com algo resolvendo na pilha).
 */
final class DamageDetails {
    /** Perda de vida ainda não aplicada: o Forge tira a vida de todos de uma vez, depois de todo o dano. */
    private final Map<Integer, Integer> pendingLoss = new HashMap<>();

    void reset() { pendingLoss.clear(); }
    void lifeChanged(int player) { pendingLoss.remove(player); }

    void player(JsonObject e, Game game, CardView source, PlayerView target, int amount, boolean combat, boolean infect) {
        common(e, game, source, combat);
        Player p = player(game, target);
        Card attacker = combat ? card(game, source) : null;
        Combat fight = game == null ? null : game.getCombat();
        if (attacker != null && fight != null && p != null && fight.isBlocked(attacker) && fight.isAttacking(attacker, p) && has(source, Keyword.TRAMPLE)) e.addProperty("trample", true);
        if (infect) e.addProperty("infect", true);
        if (combat && source != null && source.isCommander()) e.addProperty("commander", true);
        if (source != null && source.getController() != null && source.getController().getId() == target.getId()) e.addProperty("self", true);
        if (p != null && !infect) {
            int loss = pendingLoss.merge(p.getId(), amount, Integer::sum);
            if (p.getLife() - loss <= 0) e.addProperty("lethal", true);
        }
    }

    void card(JsonObject e, Game game, CardView source, CardView target, boolean deathtouch, boolean wither) {
        common(e, game, source, combatNow(game, source));
        if (deathtouch) e.addProperty("deathtouch", true);
        if (wither) e.addProperty("wither", true);
        var state = target.getCurrentState();
        int toughness = state == null ? 0 : state.getToughness();
        // Marcadores −1/−1 (murchar, infectar) já estão na resistência atual.
        if (deathtouch || (state != null && state.isCreature() && toughness <= target.getDamage())) e.addProperty("lethal", true);
    }

    /**
     * O Forge não manda dano a planeswalker como dano, só a lealdade caindo. A queda vira dano quando acontece no dano
     * de combate (de um atacante que ataca esse planeswalker) ou enquanto outra carta resolve; pagar o custo de uma
     * habilidade de lealdade acontece fora dos dois.
     */
    JsonObject loyalty(Game game, Card walker, int amount) {
        if (game == null || walker == null || amount <= 0 || !walker.isPlaneswalker()) return null;
        Card source = null; boolean combat = false;
        Combat fight = game.getCombat();
        if (!game.getStack().isResolving() && combatStep(game) && fight != null) {
            for (Card attacker : fight.getAttackersOf(walker)) {
                if (source == null || !fight.isBlocked(attacker)) source = attacker;
                if (!fight.isBlocked(attacker)) break;
            }
            combat = source != null;
        } else if (game.getStack().isResolving() && !game.getStack().isEmpty()) {
            SpellAbility resolving = game.getStack().peekAbility();
            source = resolving == null ? null : resolving.getHostCard();
            if (source != null && source.equals(walker)) source = null;
        }
        if (source == null) return null;
        JsonObject e = new JsonObject();
        e.addProperty("type", "damage");
        CardView view = CardView.get(source);
        e.add("card", StateJson.card(view)); e.addProperty("sourceId", source.getId());
        if (source.getController() != null) e.addProperty("actor", source.getController().getId());
        e.addProperty("delta", -amount);
        e.add("targets", StateJson.targets(java.util.List.of(CardView.get(walker))));
        common(e, game, view, combat);
        e.addProperty("loyalty", true);
        if (fight != null && combat && fight.isBlocked(source) && has(view, Keyword.TRAMPLE)) e.addProperty("trample", true);
        if (walker.getCounters(CounterEnumType.LOYALTY) <= 0) e.addProperty("lethal", true);
        return e;
    }

    private static void common(JsonObject e, Game game, CardView source, boolean combat) {
        e.addProperty("combat", combat);
        if (combat && game != null) e.addProperty("step", game.getPhaseHandler().is(PhaseType.COMBAT_FIRST_STRIKE_DAMAGE) ? "first-strike" : "regular");
        if (has(source, Keyword.DOUBLE_STRIKE)) e.addProperty("doubleStrike", true);
        if (has(source, Keyword.DEATHTOUCH)) e.addProperty("deathtouch", true);
        if (has(source, Keyword.LIFELINK)) e.addProperty("lifelink", true);
    }

    private static boolean combatStep(Game game) {
        var phase = game.getPhaseHandler();
        return phase.is(PhaseType.COMBAT_FIRST_STRIKE_DAMAGE) || phase.is(PhaseType.COMBAT_DAMAGE);
    }

    private static boolean combatNow(Game game, CardView source) {
        if (game == null || source == null || game.getStack().isResolving() || !combatStep(game)) return false;
        Combat fight = game.getCombat();
        Card c = card(game, source);
        if (fight == null || c == null) return source.isAttacking() || source.isBlocking();
        return fight.isAttacking(c) || fight.isBlocking(c);
    }

    private static boolean has(CardView card, Keyword keyword) {
        var state = card == null ? null : card.getCurrentState();
        if (state == null || state.getKeywords() == null) return false;
        for (KeywordView k : state.getKeywords()) if (k.keyword() == keyword) return true;
        return false;
    }

    private static Card card(Game game, CardView view) {
        if (game == null || view == null) return null;
        try { return game.findByView(view); } catch (RuntimeException e) { return null; }
    }

    private static Player player(Game game, PlayerView view) {
        if (game == null || view == null) return null;
        for (Player p : game.getPlayers()) if (p.getId() == view.getId()) return p;
        return null;
    }
}
