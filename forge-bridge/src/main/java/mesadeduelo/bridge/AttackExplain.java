package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.google.common.collect.Multimap;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.game.Game;
import forge.game.GameEntity;
import forge.game.ability.AbilityUtils;
import forge.game.card.Card;
import forge.game.combat.AttackConstraints;
import forge.game.combat.AttackRequirement;
import forge.game.combat.AttackRestriction;
import forge.game.combat.AttackRestrictionType;
import forge.game.combat.Combat;
import forge.game.player.Player;
import forge.game.staticability.StaticAbility;
import forge.game.staticability.StaticAbilityAttackRestrict;
import forge.game.staticability.StaticAbilityMode;
import forge.game.staticability.StaticAbilityMustAttack;
import forge.game.zone.ZoneType;
import forge.util.CardTranslation;

/**
 * O Forge recusa a declaração de ataque só com "Attack declaration invalid". Aqui a declaração é comparada com
 * as regras do combate (limite de atacantes, "só ataca sozinha", atiçar, "ataca se puder") para dizer o motivo
 * e qual carta o causou.
 */
final class AttackExplain {
    private AttackExplain() { }

    /** A mensagem que o Forge manda (por {@code notifyOfValue}) quando a declaração não passa na validação. */
    static final String FORGE_MESSAGE = "Attack declaration invalid";

    record Reason(String text, List<Card> cards) { }

    /** O aviso para a mesa: o motivo e as cartas envolvidas (id e nome em inglês, que a mesa traduz e mostra). */
    static String toast(Combat combat) {
        Reason reason = explain(combat);
        JsonObject o = new JsonObject();
        o.addProperty("type", "toast");
        o.addProperty("title", "Ataque não permitido");
        o.addProperty("text", reason.text());
        JsonArray cards = new JsonArray();
        for (Card card : reason.cards()) {
            JsonObject c = new JsonObject();
            c.addProperty("id", card.getId()); c.addProperty("name", card.getName());
            cards.add(c);
        }
        if (!cards.isEmpty()) o.add("cards", cards);
        return o.toString();
    }

    static Reason explain(Combat combat) {
        if (combat == null) return generic();
        Map<Card, GameEntity> declared = combat.getAttackersAndDefenders();
        Reason r = limit(combat, declared);
        if (r == null) r = restriction(combat, declared);
        if (r == null) r = requirement(combat, declared);
        return r == null ? generic() : r;
    }

    private static Reason generic() {
        return new Reason("Essa combinação de atacantes não segue as regras do combate. Revise quem ataca e quem é atacado.", List.of());
    }

    /** Árbitro Silencioso e afins: no máximo N atacantes no combate, ou contra um defensor. */
    private static Reason limit(Combat combat, Map<Card, GameEntity> declared) {
        Game game = combat.getAttackingPlayer().getGame();
        int total = declared.size();
        for (StaticAbility st : restricts(game)) {
            if (st.hasParam("ValidDefender")) continue;
            int max = max(st);
            if (total > max) return new Reason(max == 0
                ? "Nenhuma criatura pode atacar neste combate, por causa de " + name(st.getHostCard()) + "."
                : "No máximo " + creatures(max) + " pode" + (max == 1 ? "" : "m") + " atacar em cada combate, por causa de "
                    + name(st.getHostCard()) + ". Você declarou " + total + ": deixe só " + count(max) + " atacando.",
                List.of(st.getHostCard()));
        }
        for (GameEntity defender : new java.util.LinkedHashSet<>(declared.values())) {
            long against = declared.values().stream().filter(defender::equals).count();
            for (StaticAbility st : restricts(game)) {
                if (!st.hasParam("ValidDefender") || !StaticAbilityAttackRestrict.attackRestrict(st, defender)) continue;
                int max = max(st);
                if (against <= max) continue;
                String who = name(defender);
                return new Reason(max == 0
                    ? who + " não pode ser atacado neste combate, por causa de " + name(st.getHostCard()) + "."
                    : "No máximo " + creatures(max) + " pode" + (max == 1 ? "" : "m") + " atacar " + who + " em cada combate, por causa de "
                        + name(st.getHostCard()) + ". Você mandou " + against + ".",
                    List.of(st.getHostCard()));
            }
        }
        return null;
    }

    /** Restrições da própria atacante: só ataca sozinha, não ataca sozinha, precisa de companhia. */
    private static Reason restriction(Combat combat, Map<Card, GameEntity> declared) {
        Map<Card, AttackRestriction> restrictions = combat.getAttackConstraints().getRestrictions();
        for (Map.Entry<Card, GameEntity> e : declared.entrySet()) {
            AttackRestriction r = restrictions.get(e.getKey());
            if (r == null) continue;
            Card card = e.getKey();
            if (!r.canAttack(e.getValue())) return new Reason(name(card) + " não pode atacar " + name(e.getValue()) + " neste combate.", List.of(card));
            Set<AttackRestrictionType> broken = r.getViolation(declared);
            if (broken.isEmpty()) continue;
            String why = switch (broken.iterator().next()) {
                case ONLY_ALONE -> " só pode atacar sozinha.";
                case NOT_ALONE -> " não pode atacar sozinha.";
                case NEED_TWO_OTHERS -> " só pode atacar se pelo menos outras duas criaturas também atacarem.";
                case NEED_GREATER_POWER -> " só pode atacar se uma criatura com poder maior também atacar.";
                case NEED_BLACK_OR_GREEN -> " só pode atacar se uma criatura preta ou verde também atacar.";
                case NEVER -> " não pode atacar.";
            };
            return new Reason(name(card) + why, List.of(card));
        }
        return null;
    }

    /**
     * Obrigações: a criatura atiçada ou que "ataca se puder" ficou de fora, ou foi para o alvo errado.
     * O Forge aceita a declaração que cumpre tantas obrigações quanto a melhor possível; a culpada é a criatura
     * que cumpre menos aqui do que na melhor declaração.
     */
    private static Reason requirement(Combat combat, Map<Card, GameEntity> declared) {
        AttackConstraints constraints = combat.getAttackConstraints();
        Map<Card, GameEntity> best = constraints.getLegalAttackers().getLeft();
        for (Map.Entry<Card, AttackRequirement> e : constraints.getRequirements().entrySet()) {
            Card card = e.getKey(); AttackRequirement req = e.getValue();
            if (!req.hasRequirement()) continue;
            if (req.countViolations(declared.get(card), declared) <= req.countViolations(best.get(card), best)) continue;
            Reason r = obligation(card, declared.get(card), req);
            if (r != null) return r;
        }
        Player attacker = combat.getAttackingPlayer();
        Multimap<GameEntity, StaticAbility> mustAttack = StaticAbilityMustAttack.mustAttackSpecific(attacker, combat.getDefenders());
        for (Map.Entry<GameEntity, Collection<StaticAbility>> e : mustAttack.asMap().entrySet()) {
            if (declared.containsValue(e.getKey()) || !best.containsValue(e.getKey())) continue;
            Card host = e.getValue().iterator().next().getHostCard();
            return new Reason("Você precisa atacar " + name(e.getKey()) + " com pelo menos uma criatura, por causa de " + name(host) + ".", List.of(host));
        }
        return null;
    }

    private static Reason obligation(Card card, GameEntity target, AttackRequirement req) {
        if (card.isGoaded()) {
            String by = joinNames(card.getGoaded().stream().map(AttackExplain::name).toList());
            return new Reason(target == null
                ? name(card) + " foi atiçada por " + by + " e precisa atacar neste combate, se puder."
                : name(card) + " foi atiçada por " + by + " e precisa atacar outro jogador, se puder.", List.of(card));
        }
        for (Card other : req.getCausesToAttack().keySet()) {
            Card host = req.getCausesToAttack().get(other).iterator().next().getHostCard();
            return new Reason(name(other) + " precisa atacar junto com " + name(card) + ", por causa de " + name(host) + ".",
                host.equals(other) ? List.of(other) : List.of(other, host));
        }
        Game game = card.getGame();
        for (Card host : game.getCardsIn(ZoneType.STATIC_ABILITIES_SOURCE_ZONES)) {
            for (StaticAbility st : host.getStaticAbilities()) {
                if (!st.checkConditions(StaticAbilityMode.MustAttack) || !st.matchesValidParam("ValidCreature", card)) continue;
                String cause = host.equals(card) ? "" : ", por causa de " + name(host);
                List<Card> cards = host.equals(card) ? List.of(card) : List.of(card, host);
                if (st.hasParam("MustAttack")) {
                    List<GameEntity> must = AbilityUtils.getDefinedEntities(host, st.getParam("MustAttack"), st);
                    if (!must.isEmpty() && !must.contains(target))
                        return new Reason(name(card) + " precisa atacar " + joinNames(must.stream().map(AttackExplain::name).toList()) + " se puder" + cause + ".", cards);
                } else if (target == null) {
                    return new Reason(name(card) + " precisa atacar em cada combate, se puder" + cause + ".", cards);
                }
            }
        }
        return target == null ? new Reason(name(card) + " precisa atacar neste combate, se puder.", List.of(card)) : null;
    }

    private static List<StaticAbility> restricts(Game game) {
        List<StaticAbility> list = new ArrayList<>();
        for (Card host : game.getCardsIn(ZoneType.STATIC_ABILITIES_SOURCE_ZONES))
            for (StaticAbility st : host.getStaticAbilities()) if (st.checkConditions(StaticAbilityMode.AttackRestrict)) list.add(st);
        // O limite mais apertado explica primeiro.
        list.sort(java.util.Comparator.comparingInt(AttackExplain::max));
        return list;
    }

    private static int max(StaticAbility st) {
        return AbilityUtils.calculateAmount(st.getHostCard(), st.getParamOrDefault("MaxAttackers", "1"), st);
    }

    private static String creatures(int n) { return n == 1 ? "uma criatura" : n + " criaturas"; }
    private static String count(int n) { return n == 1 ? "uma" : n == 2 ? "duas" : String.valueOf(n); }

    static String name(GameEntity entity) {
        if (entity instanceof Card card) return CardTranslation.getTranslatedName(card.getName());
        return entity == null ? "" : entity.getName();
    }

    private static String joinNames(List<String> names) {
        if (names.size() <= 1) return names.isEmpty() ? "" : names.get(0);
        return String.join(", ", names.subList(0, names.size() - 1)) + " e " + names.get(names.size() - 1);
    }
}
