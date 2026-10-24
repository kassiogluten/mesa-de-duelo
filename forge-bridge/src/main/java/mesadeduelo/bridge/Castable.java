package mesadeduelo.bridge;

import java.lang.ref.WeakReference;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.WeakHashMap;
import java.util.concurrent.ConcurrentHashMap;

import com.google.gson.JsonArray;

import forge.game.Game;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.InputPassPriority;
import forge.player.PlayerControllerHuman;

/**
 * Cartas fora da mão que o jogador pode usar agora: flashback e afins no cemitério; tramadas, foretell,
 * Aventura e "você pode conjurar" no exílio (inclusive do exílio do oponente); o comandante. O destaque do Forge
 * (setWeaklySelectable) deixa várias de fora, as tramadas sempre. Só com prioridade; não confere a mana.
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

    /** Thread do jogo, com o pedido {@code input} já aberto para {@code who}. */
    static void refresh(Player who, Object input) {
        Map<Integer, Snapshot> byPlayer = SNAPSHOTS.computeIfAbsent(who.getGame(), g -> new ConcurrentHashMap<>());
        if (!(input instanceof InputPassPriority) || !who.equals(who.getGame().getPhaseHandler().getPriorityPlayer())) {
            byPlayer.remove(who.getId());
            return;
        }
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
            if (c.isInZone(ZoneType.Graveyard) || c.isInZone(ZoneType.Exile) || c.isInZone(ZoneType.Command)) candidates.add(c);
        }
        for (Card c : me.getCardsIn(ZoneType.Command)) if (c.isCommander()) candidates.add(c);
        for (Card c : me.getCardsIn(ZoneType.Exile)) if (c.isPlotted()) candidates.add(c);
        return candidates.stream().filter(c -> castableNow(c, me)).map(Card::getId).toList();
    }

    private static boolean castableNow(Card c, Player who) {
        for (SpellAbility sa : c.getAllPossibleAbilities(who, true)) if (!sa.isManaAbility()) return true;
        return false;
    }
}
