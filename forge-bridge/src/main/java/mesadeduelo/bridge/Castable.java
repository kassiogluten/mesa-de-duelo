package mesadeduelo.bridge;

import java.lang.ref.WeakReference;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.WeakHashMap;
import java.util.concurrent.ConcurrentHashMap;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import forge.ai.ComputerUtilMana;
import forge.game.mana.ManaCostBeingPaid;
import forge.game.zone.Zone;

import forge.game.Game;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.InputPassPriority;
import forge.player.PlayerControllerHuman;

/**
 * Cartas fora da mão que o jogador pode usar agora: flashback e afins no cemitério; tramadas, foretell,
 * Aventura e "você pode conjurar" no exílio (inclusive do exílio do oponente); o comandante; o topo do grimório
 * (Future Sight, Bolas's Citadel). O destaque do Forge (setWeaklySelectable) deixa várias de fora, as tramadas
 * sempre. Só com prioridade; não confere a mana.
 *
 * <p>Conferir se uma carta pode ser conjurada mexe no motor: para a face de trás, a Aventura ou a mágica com
 * outra forma, o Forge refaz os efeitos estáticos (CR 601.3e). Por isso a conta roda só na thread do jogo,
 * quando ela para à espera do jogador, e o publicador do estado lê o resultado guardado para aquele pedido.
 */
final class Castable {
    private Castable() { }

    /** O pedido fica numa referência fraca: ele leva ao jogador e ao jogo, e prenderia a chave do WeakHashMap. */
    private record Snapshot(WeakReference<Object> input, List<Integer> ids) { }

    private static final Map<Game, Map<Integer, Snapshot>> SNAPSHOTS = Collections.synchronizedMap(new WeakHashMap<>());

    /** Custo atual de conjurar cada carta da mão, só das que mudaram do impresso; o último calculado vale até o próximo. */
    record HandCost(String cost, int delta) { }

    private static final Map<Game, Map<Integer, Map<Integer, HandCost>>> HAND_COSTS = Collections.synchronizedMap(new WeakHashMap<>());

    /** Thread do jogo, com o pedido {@code input} já aberto para {@code who}. */
    static void refresh(Player who, Object input) {
        Map<Integer, Snapshot> byPlayer = SNAPSHOTS.computeIfAbsent(who.getGame(), g -> new ConcurrentHashMap<>());
        if (!(input instanceof InputPassPriority) || !who.equals(who.getGame().getPhaseHandler().getPriorityPlayer())) {
            byPlayer.remove(who.getId());
            return;
        }
        try { HAND_COSTS.computeIfAbsent(who.getGame(), g -> new ConcurrentHashMap<>()).put(who.getId(), handCosts(who)); }
        catch (RuntimeException e) { /* sem custo atual desta vez: a mão mostra o impresso */ }
        List<Integer> ids;
        try { ids = compute(who); }
        catch (RuntimeException e) { ids = List.of(); }
        byPlayer.put(who.getId(), new Snapshot(new WeakReference<>(input), ids));
    }

    /** Qualquer thread: o resultado só vale enquanto o mesmo pedido de prioridade estiver aberto. */
    static JsonArray read(Player who) {
        JsonArray out = new JsonArray();
        Map<Integer, Snapshot> byPlayer = SNAPSHOTS.get(who.getGame());
        Snapshot snapshot = byPlayer == null ? null : byPlayer.get(who.getId());
        Object input = snapshot == null ? null : snapshot.input().get();
        if (input == null || input != currentInput(who)) return out;
        for (int id : snapshot.ids()) out.add(id);
        return out;
    }

    static Object currentInput(Player who) {
        return who.getController() instanceof PlayerControllerHuman human ? human.getInputQueue().getInput() : null;
    }

    static List<Integer> compute(Player me) {
        Set<Card> candidates = new LinkedHashSet<>();
        for (Card c : me.getCardsActivatableInExternalZones(false)) {
            if (c.isInZone(ZoneType.Graveyard) || c.isInZone(ZoneType.Exile) || c.isInZone(ZoneType.Command) || c.isInZone(ZoneType.Library)) candidates.add(c);
        }
        for (Card c : me.getCardsIn(ZoneType.Command)) if (c.isCommander()) candidates.add(c);
        for (Card c : me.getCardsIn(ZoneType.Exile)) if (c.isPlotted()) candidates.add(c);
        return candidates.stream().filter(c -> castableNow(c, me)).map(Card::getId).toList();
    }

    private static boolean castableNow(Card c, Player who) {
        for (SpellAbility sa : c.getAllPossibleAbilities(who, true)) if (!sa.isManaAbility()) return true;
        return false;
    }

    /**
     * Reduções e aumentos de custo (Goblin Electromancer, Thalia, afinidade, Sphere of Resistance): o custo de mana
     * de conjurar cada carta da mão agora, como o motor conta antes de pagar, quando ele não é o impresso. Fica de
     * fora quem tem X no custo, que só se sabe ao conjurar.
     */
    static Map<Integer, HandCost> handCosts(Player me) {
        Map<Integer, HandCost> out = new HashMap<>();
        for (Card c : me.getCardsIn(ZoneType.Hand)) {
            if (c.isLand() || c.getManaCost() == null || c.getManaCost().isNoCost() || c.getManaCost().countX() > 0) continue;
            SpellAbility sa = c.getFirstSpellAbility();
            if (sa == null || !sa.isSpell() || sa.getPayCosts() == null) continue;
            Player before = sa.getActivatingPlayer();
            Zone castFrom = c.getCastFrom();
            sa.setActivatingPlayer(me);
            try {
                ManaCostBeingPaid now = ComputerUtilMana.calculateManaCost(sa.getPayCosts(), sa, me, true, 0, false);
                if (now == null) continue;
                String printed = new ManaCostBeingPaid(c.getManaCost()).toString(), current = now.toString();
                if (!printed.equals(current)) out.put(c.getId(), new HandCost(current, now.toManaCost().getCMC() - c.getManaCost().getCMC()));
            } finally {
                sa.setActivatingPlayer(before);
                c.setCastFrom(castFrom);
            }
        }
        return out;
    }

    /** Põe {@code castCost} nas cartas da mão de {@code playerId} (só a mão do dono chega com as cartas). */
    static void addHandCosts(JsonArray hand, Game game, int playerId) {
        Map<Integer, Map<Integer, HandCost>> byPlayer = HAND_COSTS.get(game);
        Map<Integer, HandCost> costs = byPlayer == null ? null : byPlayer.get(playerId);
        if (costs == null || costs.isEmpty()) return;
        for (JsonElement e : hand) {
            JsonObject card = e.getAsJsonObject();
            HandCost cost = card.has("id") ? costs.get(card.get("id").getAsInt()) : null;
            if (cost == null) continue;
            JsonObject o = new JsonObject();
            o.addProperty("cost", cost.cost());
            o.addProperty("delta", cost.delta());
            card.add("castCost", o);
        }
    }
}
