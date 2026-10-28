package mesadeduelo.bridge;

import java.lang.reflect.Field;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.ability.ApiType;
import forge.game.GameEntity;
import forge.game.card.Card;
import forge.game.card.CardView;
import forge.game.card.CounterAiCategory;
import forge.game.card.CounterEnumType;
import forge.game.card.CounterType;
import forge.game.combat.Combat;
import forge.game.combat.CombatUtil;
import forge.game.keyword.Keyword;
import forge.game.mana.ManaCostBeingPaid;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.InputBlock;
import forge.gamemodes.match.input.InputAttack;
import forge.gamemodes.match.input.InputConfirm;
import forge.gamemodes.match.input.InputPayMana;
import forge.gamemodes.match.input.InputPayManaOfCostPayment;
import forge.gamemodes.match.input.InputSelectCardsForConvokeOrImprovise;
import forge.gamemodes.match.input.InputSelectEntitiesFromList;
import forge.gamemodes.match.input.InputSelectManyBase;
import forge.gamemodes.match.input.InputSelectTargets;
import forge.game.spellability.TargetRestrictions;
import forge.gamemodes.match.input.MassSelectMode;

/** Typed context for the pinned Forge inputs whose public API omits their selection state. */
final class InputContext {
    private InputContext() { }
    private static final Field ATTACK_COMBAT = field(InputAttack.class, "combat");
    private static final Field ATTACK_PLAYER = field(InputAttack.class, "playerAttacks");
    private static final java.lang.reflect.Method ATTACK_CLEAR_BAND = clearBandMethod();
    private static final forge.util.ITriggerEvent REMOVE_ATTACKER = new forge.util.ITriggerEvent() {
        public int getButton() { return 3; }
        public int getX() { return 0; }
        public int getY() { return 0; }
    };

    private static java.lang.reflect.Method clearBandMethod() {
        try {
            var method = InputAttack.class.getDeclaredMethod("activateBand", forge.game.combat.AttackingBand.class);
            method.setAccessible(true); return method;
        } catch (ReflectiveOperationException e) { throw new ExceptionInInitializerError(e); }
    }
    private static final Field ATTACKER = field(InputBlock.class, "currentAttacker");
    private static final Field COMBAT = field(InputBlock.class, "combat");
    private static final Field DEFENDER = field(InputBlock.class, "defender");
    private static final Field CONFIRM_ABILITY = field(InputConfirm.class, "sa");
    private static final Field CONFIRM_CARD = field(InputConfirm.class, "card");
    private static final Field CONFIRM_MESSAGE = field(InputConfirm.class, "message");
    private static final Field SELECT_MIN = field(InputSelectManyBase.class, "min");
    private static final Field SELECT_MAX = field(InputSelectManyBase.class, "max");
    private static final Field SELECT_ABILITY = field(InputSelectManyBase.class, "sa");
    private static final Field TAP_AVAILABLE = field(InputSelectCardsForConvokeOrImprovise.class, "availableCards");
    private static final Field TAP_REMAINING = field(InputSelectCardsForConvokeOrImprovise.class, "remainingCost");
    private static final Field TAP_ARTIFACTS = field(InputSelectCardsForConvokeOrImprovise.class, "artifacts");
    private static final Field TAP_CREATURES = field(InputSelectCardsForConvokeOrImprovise.class, "creatures");
    private static final Field MASS_SELECT = field(InputSelectEntitiesFromList.class, "massSelectMode");
    private static final Field PAY_PLAYER = field(InputPayMana.class, "player");
    private static final Field PAY_COST = field(InputPayMana.class, "manaCost");
    private static final Field PAY_ABILITY = field(InputPayMana.class, "saPaidFor");
    private static final Field PAY_EFFECT = field(InputPayMana.class, "effect");
    private static final Field PAY_LIFE = field(InputPayMana.class, "phyLifeToLose");
    private static final Field TARGETS_ABILITY = field(InputSelectTargets.class, "sa");
    private static final Field TARGETS_NUM = field(InputSelectTargets.class, "numTargets");

    private static Field field(Class<?> type, String name) {
        try { Field field = type.getDeclaredField(name); field.setAccessible(true); return field; }
        catch (ReflectiveOperationException e) { throw new ExceptionInInitializerError(e); }
    }
    private static Object value(Field field, Object input) {
        try { return field.get(input); }
        catch (IllegalAccessException e) { throw new IllegalStateException(e); }
    }

    /**
     * Mana phyrexiana: o Forge paga um símbolo com 2 de vida quando quem paga clica em si mesmo
     * ({@code InputPayManaOfCostPayment.onPlayerSelected}), mas não marca o jogador como clicável.
     * Devolve quem pode pagar mais um símbolo com vida e a vida já separada ({@code pending}), que o Forge
     * só tira no fim do pagamento; ou null.
     */
    static JsonObject phyrexianLife(Object input) {
        if (!(input instanceof InputPayManaOfCostPayment)) return null;
        Player player = (Player) value(PAY_PLAYER, input);
        ManaCostBeingPaid cost = (ManaCostBeingPaid) value(PAY_COST, input);
        int pending = (Integer) value(PAY_LIFE, input);
        if (player == null || cost == null || !cost.containsPhyrexianMana()
            || !player.canPayLife(pending + 2, (Boolean) value(PAY_EFFECT, input), (SpellAbility) value(PAY_ABILITY, input))) return null;
        JsonObject result = new JsonObject();
        result.addProperty("player", player.getId());
        result.addProperty("pending", pending);
        return result;
    }

    /**
     * Escolha de alvos antes de ir para a pilha: o que pede o alvo ({@code kind}: "spell", "ability" ou "trigger"),
     * o texto da habilidade como o Forge escreve (já no idioma da mesa, com o nome da carta), quantos alvos este
     * passo pede ({@code min}/{@code max}) e quantos já foram marcados nele ({@code count}), e o que serve como alvo
     * ({@code valid}, na sintaxe do Forge, como "Creature.OppCtrl"; {@code zones} só fora do campo de batalha).
     * Para mágicas o texto fica de fora: a carta inteira é a mágica.
     */
    static JsonObject targetDetails(Object input) {
        if (!(input instanceof InputSelectTargets)) return null;
        SpellAbility sa = (SpellAbility) value(TARGETS_ABILITY, input);
        if (sa == null) return null;
        SpellAbility root = sa.getRootAbility();
        String kind = root.isSpell() ? "spell" : root.isTrigger() ? "trigger" : "ability";
        JsonObject result = new JsonObject();
        result.addProperty("kind", kind);
        String text = kind.equals("spell") ? "" : abilityText(root);
        if (!text.isEmpty()) result.addProperty("ability", text);
        Integer fixed = (Integer) value(TARGETS_NUM, input);
        result.addProperty("min", fixed != null ? fixed : sa.getMinTargets());
        result.addProperty("max", fixed != null ? fixed : sa.getMaxTargets());
        result.addProperty("count", sa.getTargets().size());
        TargetRestrictions tgt = sa.getTargetRestrictions();
        if (tgt != null) {
            JsonArray valid = new JsonArray();
            for (String v : tgt.getValidTgts()) valid.add(v);
            if (!valid.isEmpty()) result.add("valid", valid);
            JsonArray zones = new JsonArray();
            for (ZoneType zone : tgt.getZone()) if (zone != ZoneType.Battlefield) zones.add(zone.name());
            if (!zones.isEmpty()) result.add("zones", zones);
        }
        return result;
    }

    /** Gatilho: a descrição do gatilho inteira ("Quando ... entrar, destrua ..."); ativada: custo e efeito. */
    static String abilityText(SpellAbility root) {
        String text = root.isTrigger() ? root.getTrigger().toString() : "";
        if (text.isBlank()) text = root.toString();
        return text.replace("(Targeting ERROR)", "").replaceAll("\\s+", " ").trim();
    }

    static JsonObject suspendCast(Object input) {
        if (!(input instanceof InputConfirm)) return null;
        SpellAbility ability = (SpellAbility) value(CONFIRM_ABILITY, input);
        CardView card = (CardView) value(CONFIRM_CARD, input);
        if (ability == null || card == null || ability.getApi() != ApiType.Play
            || ability.getTrigger() == null || !ability.getTrigger().isKeyword(Keyword.SUSPEND)) return null;
        JsonObject result = new JsonObject(); result.add("card", StateJson.card(card)); return result;
    }

    /**
     * Regra 903.9b: o comandante iria para a mão ou o grimório e o dono pode mandá-lo à zona de comando.
     * O Forge pergunta num "Sim/Não" com o texto da regra em inglês; o destino vem dos parâmetros do movimento
     * guardados na habilidade da substituição, para a mesa nomear os botões ("Zona de comando" ou "Mão").
     */
    static JsonObject commanderMove(Object input) {
        if (!(input instanceof InputConfirm)) return null;
        SpellAbility ability = (SpellAbility) value(CONFIRM_ABILITY, input);
        JsonObject stays = commanderStays(ability, (String) value(CONFIRM_MESSAGE, input));
        if (stays != null) return stays;
        if (ability == null || ability.getReplacementEffect() == null || !ability.getReplacementEffect().hasParam("CommanderMoveReplacement")) return null;
        if (!(ability.getReplacingObject(forge.game.ability.AbilityKey.OriginalParams) instanceof java.util.Map<?, ?> params)) return null;
        JsonObject result = new JsonObject();
        if (params.get(forge.game.ability.AbilityKey.Destination) instanceof ZoneType to) result.addProperty("to", to.name());
        if (params.get(forge.game.ability.AbilityKey.Affected) instanceof Card card) result.add("card", StateJson.card(card.getView()));
        return result.has("to") ? result : null;
    }

    /**
     * Regra 903.9a: o comandante já está no cemitério ou no exílio, e a ação baseada em estado pergunta (com a
     * primeira habilidade dele e o texto da regra em inglês) se ele vai para a zona de comando. Sai com
     * {@code stays: true}: "Não" o deixa onde está.
     */
    static JsonObject commanderStays(SpellAbility ability, String message) {
        if (ability == null || message == null || !message.contains("its owner may put it into the command zone")) return null;
        Card card = ability.getHostCard();
        if (card == null || card.getZone() == null) return null;
        ZoneType zone = card.getZone().getZoneType();
        if (zone != ZoneType.Graveyard && zone != ZoneType.Exile) return null;
        JsonObject result = new JsonObject();
        result.addProperty("to", zone.name()); result.addProperty("stays", true);
        result.add("card", StateJson.card(card.getView()));
        return result;
    }

    /**
     * Escolha feita durante a resolução (escolher uma criatura, um jogador, cartas da mão): o Forge não cita a carta
     * no pedido, então vai a da mágica ou habilidade que está resolvendo, para a mesa mostrar de onde vem o pedido.
     */
    static CardView resolvingSource(Object input, forge.game.Game game) {
        return input instanceof InputSelectEntitiesFromList<?> ? resolvingSource(game) : null;
    }

    /** A carta da mágica ou habilidade que está resolvendo agora, se houver. */
    static CardView resolvingSource(forge.game.Game game) {
        if (game == null) return null;
        var stack = game.getStack();
        if (!stack.isResolving() || stack.isEmpty()) return null;
        var top = stack.peek();
        return top == null || top.getSourceCard() == null ? null : top.getSourceCard().getView();
    }

    /**
     * Card choices, or cards and players together (proliferar): counter allocation and "choose a player"
     * have different counting semantics. Players only appear in {@code players} when they can be chosen.
     */
    static JsonObject selection(Object input) {
        if (input instanceof InputSelectCardsForConvokeOrImprovise tap) {
            JsonObject result = new JsonObject(); JsonArray cards = new JsonArray();
            for (Card card : tap.getSelected()) cards.add(card.getId());
            result.add("cards", cards);
            result.addProperty("min", 0);
            result.addProperty("max", (Integer) value(SELECT_MAX, input));
            return result;
        }
        if (!(input instanceof InputSelectEntitiesFromList<?> select)) return null;
        boolean anyCard = false, anyPlayer = false;
        for (var choice : select.getValidChoices()) {
            if (choice instanceof Card) anyCard = true;
            else if (choice instanceof Player) anyPlayer = true;
            else return null;
        }
        if (!anyCard && !proliferating(select)) return null;
        JsonObject result = new JsonObject(); JsonArray cards = new JsonArray(), players = new JsonArray();
        for (var choice : select.getSelected()) {
            if (choice instanceof Card card) cards.add(card.getId());
            else if (choice instanceof Player player) players.add(player.getId());
        }
        result.add("cards", cards);
        if (anyPlayer) result.add("players", players);
        result.addProperty("min", (Integer) value(SELECT_MIN, input));
        result.addProperty("max", (Integer) value(SELECT_MAX, input));
        return result;
    }

    /**
     * Improvisar, convocar e dobrar água: antes da mana, o Forge pede as permanentes para virar, mas não as marca
     * como selecionáveis. kind diz qual das três (improvise, convoke, waterbend) e remaining, o custo que ainda falta.
     */
    static JsonObject tapToPay(Object input) {
        if (!(input instanceof InputSelectCardsForConvokeOrImprovise tap)) return null;
        boolean artifacts = (Boolean) value(TAP_ARTIFACTS, input), creatures = (Boolean) value(TAP_CREATURES, input);
        JsonObject result = new JsonObject();
        result.addProperty("kind", artifacts && creatures ? "waterbend" : artifacts ? "improvise" : "convoke");
        result.addProperty("remaining", String.valueOf(value(TAP_REMAINING, tap)));
        return result;
    }

    /** As permanentes que ainda podem ser viradas no improvisar, convocar ou dobrar água (as já escolhidas inclusive). */
    static java.util.Set<Integer> tapToPayChoices(Object input) {
        if (!(input instanceof InputSelectCardsForConvokeOrImprovise)) return java.util.Set.of();
        java.util.Set<Integer> ids = new java.util.LinkedHashSet<>();
        for (Object card : (Iterable<?>) value(TAP_AVAILABLE, input)) ids.add(((Card) card).getId());
        return ids;
    }

    static java.util.Set<Integer> playerChoices(Object input) {
        if (!(input instanceof InputSelectEntitiesFromList<?> select)) return java.util.Set.of();
        java.util.Set<Integer> players = new java.util.LinkedHashSet<>();
        boolean mixed = proliferating(select);
        for (var choice : select.getValidChoices()) {
            if (choice instanceof Player player) players.add(player.getId());
            else if (!mixed) return java.util.Set.of();
        }
        return players;
    }

    private static boolean proliferating(InputSelectEntitiesFromList<?> select) {
        SpellAbility ability = (SpellAbility) value(SELECT_ABILITY, select);
        return ability != null && ability.getApi() == ApiType.Proliferate;
    }

    /**
     * Proliferar: cada permanente ou jogador que pode receber marcadores, com cada tipo de marcador dito
     * {@code good}, {@code bad} ou {@code neutral} para quem prolifera. A categoria vem da IA do Forge (bom
     * ou ruim para quem tem o marcador) e se inverte quando é de um oponente: -1/-1 numa criatura dele ajuda.
     * {@code suggested} marca o que só ajuda.
     */
    static JsonObject proliferate(Object input) {
        if (!(input instanceof InputSelectEntitiesFromList<?> select) || !proliferating(select)) return null;
        Player chooser = ((SpellAbility) value(SELECT_ABILITY, select)).getActivatingPlayer();
        JsonArray candidates = new JsonArray();
        for (GameEntity entity : select.getValidChoices()) {
            Player holder = holder(entity);
            JsonObject row = new JsonObject(); JsonArray counters = new JsonArray();
            row.addProperty("kind", entity instanceof Player ? "player" : "card");
            row.addProperty("id", entity.getId());
            if (holder != null) row.addProperty("holder", holder.getId());
            boolean good = false, bad = false;
            for (var entry : entity.getCounters().entrySet()) {
                if (entry.getCount() <= 0) continue;
                String effect = counterEffect(entity, entry.getElement(), holder, chooser);
                good |= effect.equals("good"); bad |= effect.equals("bad");
                JsonObject counter = new JsonObject();
                counter.addProperty("type", entry.getElement().toString());
                counter.addProperty("count", entry.getCount());
                counter.addProperty("effect", effect);
                counters.add(counter);
            }
            row.add("counters", counters);
            row.addProperty("effect", good && bad ? "mixed" : good ? "good" : bad ? "bad" : "neutral");
            row.addProperty("suggested", good && !bad);
            candidates.add(row);
        }
        JsonObject result = new JsonObject(); result.add("candidates", candidates); return result;
    }

    /** De que lado o marcador conta: o jogador, o controlador da permanente ou quem protege a batalha. */
    private static Player holder(GameEntity entity) {
        if (entity instanceof Player player) return player;
        if (!(entity instanceof Card card)) return null;
        if (card.isBattle() && card.getProtectingPlayer() != null) return card.getProtectingPlayer();
        return card.getController();
    }

    static String counterEffect(GameEntity entity, CounterType type, Player holder, Player chooser) {
        CounterAiCategory category = entity instanceof Card card ? forge.ai.ComputerUtil.getCounterCategory(type, card)
            // Radiação no jogador: o Forge a deixa neutra, mas ela tira cartas do grimório e vida de quem a tem.
            : type.is(CounterEnumType.RAD) ? CounterAiCategory.Negative : type.getAiCategory();
        if (category == CounterAiCategory.Neutral || holder == null || chooser == null) return "neutral";
        boolean ally = !holder.isOpponentOf(chooser);
        return (category == CounterAiCategory.Positive) == ally ? "good" : "bad";
    }

    /**
     * Deixa a escolha do proliferar exatamente com estas cartas e jogadores, de uma vez. Antes de cada clique o
     * modo de seleção em massa sai de NONE, senão o Forge confirma sozinho ao marcar o último: quem confirma é o jogador.
     */
    static boolean selectExactly(Object input, java.util.Collection<Integer> cardIds, java.util.Collection<Integer> playerIds) {
        if (!(input instanceof InputSelectEntitiesFromList<?> select) || !proliferating(select)) return false;
        java.util.Set<Integer> validCards = new java.util.HashSet<>(), validPlayers = new java.util.HashSet<>();
        for (GameEntity entity : select.getValidChoices()) (entity instanceof Player ? validPlayers : validCards).add(entity.getId());
        if (!validCards.containsAll(cardIds) || !validPlayers.containsAll(playerIds)) return false;
        for (GameEntity entity : java.util.List.copyOf(select.getValidChoices())) {
            boolean wanted = entity instanceof Player ? playerIds.contains(entity.getId()) : cardIds.contains(entity.getId());
            if (wanted == select.getSelected().contains(entity)) continue;
            try { MASS_SELECT.set(select, MassSelectMode.ALL); } catch (IllegalAccessException e) { throw new IllegalStateException(e); }
            if (entity instanceof Card card) select.selectCard(card, null, null);
            else select.selectPlayer((Player) entity, null);
        }
        return true;
    }

    static JsonObject attacking(Object input) {
        if (!(input instanceof InputAttack)) return null;
        Combat combat = (Combat) value(ATTACK_COMBAT, input);
        Player player = (Player) value(ATTACK_PLAYER, input);
        JsonObject result = new JsonObject();
        JsonArray attackers = new JsonArray(), defenders = new JsonArray(), assignments = new JsonArray();
        for (GameEntity defender : combat.getDefenders()) defenders.add(defenderJson(defender));
        for (Card attacker : player.getCreaturesInPlay()) {
            JsonArray legal = new JsonArray();
            for (GameEntity defender : combat.getDefenders())
                if (combat.isAttacking(attacker, defender) || CombatUtil.canAttack(attacker, defender)) legal.add(defenderJson(defender));
            if (!legal.isEmpty()) {
                attackers.add(attacker.getId()); JsonObject row = new JsonObject();
                row.addProperty("attacker", attacker.getId()); row.add("defenders", legal); assignments.add(row);
            }
        }
        result.add("attackers", attackers); result.add("defenders", defenders); result.add("legalAssignments", assignments);
        return result;
    }

    private static JsonObject defenderJson(GameEntity defender) {
        JsonObject row = new JsonObject(); row.addProperty("id", defender.getId());
        row.addProperty("kind", defender instanceof Player ? "player" : "card"); return row;
    }

    static boolean assignAttack(Object input, int attackerId, int defenderId, String kind) {
        if (!(input instanceof InputAttack attack) || !("player".equals(kind) || "card".equals(kind))) return false;
        Combat combat = (Combat) value(ATTACK_COMBAT, input);
        Player player = (Player) value(ATTACK_PLAYER, input);
        Card attacker = null; GameEntity defender = null;
        for (Card card : player.getCreaturesInPlay()) if (card.getId() == attackerId) attacker = card;
        for (GameEntity candidate : combat.getDefenders())
            if (candidate.getId() == defenderId && (candidate instanceof Player) == "player".equals(kind)) defender = candidate;
        if (attacker == null || defender == null || !(combat.isAttacking(attacker, defender) || CombatUtil.canAttack(attacker, defender))) return false;
        if (defender instanceof Player target) attack.selectPlayer(target, null);
        else if (!attack.selectCard((Card) defender, null, null)) return false;
        return attack.selectCard(attacker, null, null);
    }

    /** Bulk selection is explicit: never redirect an ineligible creature to a different defender. */
    static boolean assignAllAttackers(Object input, int defenderId, String kind) {
        if (!(input instanceof InputAttack attack) || !("player".equals(kind) || "card".equals(kind))) return false;
        Combat combat = (Combat) value(ATTACK_COMBAT, input);
        if (!combat.getAttackers().isEmpty()) return false;
        Player player = (Player) value(ATTACK_PLAYER, input);
        GameEntity defender = null;
        for (GameEntity candidate : combat.getDefenders())
            if (candidate.getId() == defenderId && (candidate instanceof Player) == "player".equals(kind)) defender = candidate;
        if (defender == null) return false;
        java.util.List<Card> legal = new java.util.ArrayList<>();
        for (Card attacker : player.getCreaturesInPlay()) if (CombatUtil.canAttack(attacker, defender)) legal.add(attacker);
        if (legal.isEmpty()) return false;
        if (defender instanceof Player target) attack.selectPlayer(target, null);
        else if (!attack.selectCard((Card) defender, null, null)) return false;
        for (Card attacker : legal) attack.selectCard(attacker, null, null);
        return !combat.getAttackers().isEmpty();
    }

    /** Validate the whole group before touching combat; assignment is idempotent, never a toggle. */
    static boolean assignAttackGroup(Object input, java.util.List<Integer> attackerIds, Integer defenderId, String kind) {
        if (!(input instanceof InputAttack attack) || attackerIds == null || attackerIds.isEmpty()
            || (defenderId != null && !("player".equals(kind) || "card".equals(kind)))) return false;
        Combat combat = (Combat) value(ATTACK_COMBAT, input);
        Player player = (Player) value(ATTACK_PLAYER, input);
        GameEntity defender = null;
        if (defenderId != null) {
            for (GameEntity candidate : combat.getDefenders())
                if (candidate.getId() == defenderId && (candidate instanceof Player) == "player".equals(kind)) defender = candidate;
            if (defender == null) return false;
        }
        java.util.Map<Integer, Card> owned = new java.util.HashMap<>();
        for (Card card : player.getCreaturesInPlay()) owned.put(card.getId(), card);
        java.util.Set<Integer> unique = new java.util.HashSet<>();
        java.util.List<Card> selected = new java.util.ArrayList<>();
        for (Integer id : attackerIds) {
            Card card = owned.get(id);
            if (!unique.add(id) || card == null || !player.equals(card.getController())
                || (defender != null && !CombatUtil.canAttack(card, defender))) return false;
            selected.add(card);
        }
        if (defender == null) {
            for (Card card : selected) if (combat.isAttacking(card)) attack.selectCard(card, null, REMOVE_ATTACKER);
            return true;
        }
        // Native band selection is UI state, not part of the explicit group being assigned.
        try { ATTACK_CLEAR_BAND.invoke(attack, new Object[]{null}); }
        catch (ReflectiveOperationException e) { throw new IllegalStateException(e); }
        if (defender instanceof Player target) attack.selectPlayer(target, null);
        else if (!attack.selectCard((Card) defender, null, null)) return false;
        for (Card card : selected) if (!combat.isAttacking(card, defender)) attack.selectCard(card, null, null);
        return true;
    }

    static JsonObject blocking(Object input) {
        if (!(input instanceof InputBlock)) return null;
        Combat combat = (Combat) value(COMBAT, input);
        Player defender = (Player) value(DEFENDER, input);
        Card selected = (Card) value(ATTACKER, input);
        JsonObject result = new JsonObject();
        result.addProperty("selectedAttacker", selected == null ? null : selected.getId());
        JsonArray attackers = new JsonArray(), blockers = new JsonArray(), assignments = new JsonArray();
        for (Card attacker : combat.getAttackers())
            if (defender.equals(combat.getDefenderPlayerByAttacker(attacker))) attackers.add(attacker.getId());
        for (Card blocker : defender.getCreaturesInPlay()) {
            JsonArray legal = new JsonArray();
            for (Card attacker : combat.getAttackers())
                if (validPair(combat, defender, attacker, blocker)) legal.add(attacker.getId());
            if (!legal.isEmpty()) {
                blockers.add(blocker.getId());
                JsonObject row = new JsonObject(); row.addProperty("blocker", blocker.getId());
                row.add("attackers", legal); assignments.add(row);
            }
        }
        result.add("attackers", attackers); result.add("blockers", blockers);
        result.add("legalAssignments", assignments); return result;
    }

    private static boolean validPair(Combat combat, Player defender, Card attacker, Card blocker) {
        return attacker != null && blocker != null && combat.isAttacking(attacker)
            && defender.equals(combat.getDefenderPlayerByAttacker(attacker))
            && defender.equals(blocker.getController()) && blocker.isCreature()
            && defender.getZone(ZoneType.Battlefield).contains(blocker)
            && (combat.isBlocking(blocker, attacker) || CombatUtil.canBlock(attacker, blocker, combat));
    }

    /** Select and toggle the exact pair together on the dispatcher, after the Session generation guard. */
    static boolean assignBlock(Object input, int attackerId, int blockerId) {
        if (!(input instanceof InputBlock block)) return false;
        Combat combat = (Combat) value(COMBAT, input); Player defender = (Player) value(DEFENDER, input);
        Card attacker = null, blocker = null;
        for (Card card : combat.getAttackers()) if (card.getId() == attackerId) attacker = card;
        for (Card card : defender.getCreaturesInPlay()) if (card.getId() == blockerId) blocker = card;
        if (!validPair(combat, defender, attacker, blocker)) return false;
        return block.selectCard(attacker, null, null) && block.selectCard(blocker, null, null);
    }
}
