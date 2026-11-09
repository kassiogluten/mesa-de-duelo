package mesadeduelo.bridge;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.ability.ApiType;
import forge.game.card.Card;
import forge.game.spellability.SpellAbility;
import forge.game.trigger.Trigger;
import forge.game.trigger.TriggerHandler;
import forge.game.trigger.TriggerType;
import forge.game.zone.ZoneType;

/**
 * Cartas no exílio que um gatilho atrasado ainda vai tirar de lá numa etapa (Necropotência: "Put that card into your
 * hand at the beginning of your next end step"): vão em {@code returns} na carta, com o destino ({@code to}), a etapa
 * ({@code step}: "end" ou "upkeep"), de quem é o turno ({@code player}, quando o gatilho diz) e quem criou o gatilho
 * ({@code source}). O Forge guarda esses gatilhos só dentro do TriggerHandler.
 */
final class DelayedReturns {
    private DelayedReturns() { }

    private static final ForgeReflection.FieldRef DELAYED = ForgeReflection.field(TriggerHandler.class, "delayedTriggers");

    /** O que espera cada carta exilada, pelo id dela. */
    static Map<Integer, JsonObject> of(Game game) {
        Map<Integer, JsonObject> found = new LinkedHashMap<>();
        if (game == null || !ForgeReflection.present(DELAYED)) return found;
        try {
            @SuppressWarnings("unchecked")
            List<Trigger> delayed = List.copyOf((List<Trigger>) DELAYED.get(game.getTriggerHandler()));
            for (Trigger t : delayed) {
                JsonObject info = describe(t);
                if (info == null) continue;
                for (Object o : t.getTriggerRemembered()) {
                    if (!(o instanceof Card c)) continue;
                    Card now = game.getCardState(c, null);
                    if (now != null && now.isInZone(ZoneType.Exile)) found.putIfAbsent(now.getId(), info);
                }
            }
        } catch (RuntimeException concurrentRead) {
            return Map.of(); // leitura durante a jogada do motor: fica para o próximo estado
        }
        return found;
    }

    static void add(JsonObject o, int cardId, Game game) {
        JsonObject info = of(game).get(cardId);
        if (info != null) o.add("returns", info);
    }

    /** Uma permanente criou o gatilho que vai tirar esta carta do exílio. */
    static boolean pendingFrom(Card exiled, Card host, Game game) {
        JsonObject info = of(game).get(exiled.getId());
        return info != null && info.get("source").getAsInt() == host.getId();
    }

    /** Gatilho de etapa que leva cartas do exílio para outra zona; null se não for um. */
    private static JsonObject describe(Trigger t) {
        if (t.getMode() != TriggerType.Phase || t.getHostCard() == null) return null;
        SpellAbility execute = t.getOverridingAbility();
        if (execute == null || execute.getApi() != ApiType.ChangeZone) return null;
        String origin = execute.getParamOrDefault("Origin", ""), to = execute.getParamOrDefault("Destination", "");
        if (!origin.contains("Exile") || to.isBlank() || to.contains(",")) return null;
        JsonObject info = new JsonObject();
        info.addProperty("to", to.toLowerCase(Locale.ROOT));
        String phase = t.getParamOrDefault("Phase", "");
        if (phase.equals("End of Turn")) info.addProperty("step", "end");
        else if (phase.equals("Upkeep")) info.addProperty("step", "upkeep");
        if ("You".equals(t.getParam("ValidPlayer")) && t.getHostCard().getController() != null)
            info.addProperty("player", t.getHostCard().getController().getId());
        info.addProperty("source", t.getHostCard().getId());
        return info;
    }
}
