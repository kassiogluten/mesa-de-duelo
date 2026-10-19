package mesadeduelo.bridge;

import java.lang.reflect.Field;
import java.util.Map;
import java.util.Stack;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.game.Game;
import forge.game.phase.ExtraPhase;
import forge.game.phase.ExtraTurn;
import forge.game.phase.PhaseHandler;
import forge.game.phase.PhaseType;
import forge.game.player.Player;

/**
 * Turnos e combates extras, que o Forge guarda só dentro do PhaseHandler. A mesa usa isso para avisar
 * "Turno extra", mostrar os turnos que vêm por aí e não oferecer "Fim de turno" com um combate extra pendente.
 */
final class TurnExtras {
    private TurnExtras() { }
    private static final Field TURNS, PHASES;
    static {
        try {
            TURNS = PhaseHandler.class.getDeclaredField("extraTurns"); TURNS.setAccessible(true);
            PHASES = PhaseHandler.class.getDeclaredField("extraPhases"); PHASES.setAccessible(true);
        } catch (ReflectiveOperationException e) { throw new ExceptionInInitializerError(e); }
    }

    static void add(JsonObject o, Game game) {
        if (game == null) return;
        PhaseHandler ph = game.getPhaseHandler();
        if (ph == null || ph.getPlayerTurn() == null) return;
        try {
            if (ph.getPlayerTurn().isExtraTurn()) o.addProperty("extraTurn", true);
            JsonArray upcoming = upcomingExtraTurns(ph);
            if (!upcoming.isEmpty()) o.add("extraTurns", upcoming);
            if (ph.getPhase() != null && ph.getPhase().name().startsWith("COMBAT_") && ph.getNumCombat() > 0) o.addProperty("combatNumber", ph.getNumCombat());
            int combats = pendingCombats(ph);
            if (combats > 0) {
                o.addProperty("extraCombats", combats);
                // Fases depois das quais o combate extra começa: o botão de passar diz "Para o combate extra" nelas.
                JsonArray after = new JsonArray();
                for (PhaseType p : PhaseType.values()) if (ph.hasExtraPhaseAfter(p, PhaseType.COMBAT_BEGIN)) after.add(p.name());
                o.add("extraCombatAfter", after);
            }
        } catch (IllegalAccessException | RuntimeException e) {
            // Lido fora da thread do jogo: se a pilha mudar no meio, o próximo estado traz o valor certo.
        }
    }

    /** Jogadores dos turnos extras na ordem em que vão acontecer. O fundo da pilha é o turno normal seguinte. */
    static JsonArray upcomingExtraTurns(PhaseHandler ph) throws IllegalAccessException {
        @SuppressWarnings("unchecked") Stack<ExtraTurn> turns = (Stack<ExtraTurn>) TURNS.get(ph);
        Object[] items = turns.toArray();
        JsonArray out = new JsonArray();
        for (int i = items.length - 1; i >= 1; i--) {
            Player p = ((ExtraTurn) items[i]).getPlayer();
            if (p != null) out.add(p.getId());
        }
        return out;
    }

    static int pendingCombats(PhaseHandler ph) throws IllegalAccessException {
        @SuppressWarnings("unchecked") Map<PhaseType, Stack<ExtraPhase>> phases = (Map<PhaseType, Stack<ExtraPhase>>) PHASES.get(ph);
        int count = 0;
        for (Object stack : phases.values().toArray()) {
            for (Object extra : ((Stack<?>) stack).toArray()) if (((ExtraPhase) extra).getPhase() == PhaseType.COMBAT_BEGIN) count++;
        }
        return count;
    }
}
