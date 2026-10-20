package mesadeduelo.bridge;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import forge.game.GameEntityView;
import forge.game.card.CardView;
import forge.game.player.PlayerView;

/**
 * Divisão do dano de combate quando um atacante é bloqueado por duas ou mais criaturas (ou tem atropelar).
 * Segue as regras do diálogo do próprio Forge: todo o dano precisa ser distribuído; sem a ordem liberada,
 * um bloqueador só recebe dano depois que os anteriores receberam dano letal; o jogador ou planeswalker
 * defensor só recebe dano quando todos os bloqueadores já têm letal (a não ser com "divida como quiser").
 */
final class CombatDamage {
    private CombatDamage() { }

    /** Preenche a pergunta: opções (bloqueadores e, se couber, o defensor), letal de cada uma e a divisão automática. */
    static void describe(JsonObject q, List<Object> options, Object[] a) {
        CardView attacker = (CardView) a[0];
        @SuppressWarnings("unchecked") List<CardView> blockers = (List<CardView>) a[1];
        int damage = (Integer) a[2];
        GameEntityView defender = (GameEntityView) a[3];
        boolean overrideOrder = Boolean.TRUE.equals(a[4]);
        var state = attacker.getCurrentState();
        boolean deathtouch = state.hasDeathtouch(), trample = defender != null && state.hasTrample();
        boolean divide = state.hasDivideDamage();
        boolean toDefender = defender != null && (trample || (divide && overrideOrder));

        q.addProperty("kind", "amount");
        q.addProperty("purpose", "combat-damage");
        q.addProperty("title", "Distribua o dano de combate");
        q.addProperty("total", damage);
        q.add("card", StateJson.card(attacker));
        // ordered: um bloqueador só recebe dano depois que os anteriores têm letal. free: qualquer divisão vale.
        q.addProperty("ordered", !overrideOrder && !divide);
        q.addProperty("free", divide && overrideOrder);
        if (deathtouch) q.addProperty("deathtouch", true);
        if (trample) q.addProperty("trample", true);

        JsonArray rows = new JsonArray();
        for (CardView b : blockers) {
            options.add(b);
            JsonObject row = new JsonObject();
            row.addProperty("kind", "card");
            row.add("card", StateJson.card(b));
            row.addProperty("label", b.getName());
            row.addProperty("min", 0); row.addProperty("max", damage);
            row.addProperty("lethal", lethal(b, deathtouch));
            rows.add(row);
        }
        if (toDefender) {
            options.add(null);
            JsonObject row = new JsonObject();
            row.addProperty("defender", true);
            if (defender instanceof PlayerView p) { row.addProperty("kind", "player"); row.addProperty("id", p.getId()); row.addProperty("label", p.getName()); }
            else if (defender instanceof CardView c) { row.addProperty("kind", "card"); row.add("card", StateJson.card(c)); row.addProperty("label", c.getName()); }
            row.addProperty("min", 0); row.addProperty("max", damage);
            rows.add(row);
        }
        q.add("options", rows);
        JsonArray initial = new JsonArray();
        for (int n : auto(q)) initial.add(n);
        q.add("suggested", initial);
    }

    static int lethal(CardView blocker, boolean deathtouch) {
        var s = blocker.getCurrentState();
        if (s.isPlaneswalker()) {
            try { return Math.max(0, Integer.parseInt(s.getLoyalty())); } catch (NumberFormatException e) { return 0; }
        }
        int lethal = Math.max(0, blocker.getLethalDamage());
        return deathtouch ? Math.min(lethal, 1) : lethal;
    }

    /** Divisão automática do Forge: letal em cada bloqueador na ordem; o que sobra vai para o defensor ou para o último. */
    static int[] auto(JsonObject q) {
        JsonArray options = q.getAsJsonArray("options");
        int left = q.get("total").getAsInt();
        int[] out = new int[options.size()];
        int lastBlocker = -1;
        for (int i = 0; i < options.size(); i++) {
            JsonObject o = options.get(i).getAsJsonObject();
            if (o.has("defender")) continue;
            lastBlocker = i;
            int give = Math.min(left, o.get("lethal").getAsInt());
            out[i] = give; left -= give;
        }
        if (left > 0) {
            int target = options.size() - 1;
            if (!options.get(target).getAsJsonObject().has("defender")) target = Math.max(0, lastBlocker);
            out[target] += left;
        }
        return out;
    }

    /** Valida a divisão escolhida (total, limites e as regras de letal) e devolve as quantidades. */
    static int[] validate(JsonObject q, JsonElement answer) {
        int[] amounts = AmountAllocation.validate(q, answer);
        if (q.has("free") && q.get("free").getAsBoolean()) return amounts;
        JsonArray options = q.getAsJsonArray("options");
        boolean ordered = q.get("ordered").getAsBoolean();
        boolean allLethal = true;
        for (int i = 0; i < options.size(); i++) {
            JsonObject o = options.get(i).getAsJsonObject();
            if (o.has("defender")) {
                if (amounts[i] > 0 && !allLethal) throw new IllegalArgumentException("Para passar dano ao defensor, dê dano letal a todos os bloqueadores.");
                continue;
            }
            if (ordered && amounts[i] > 0 && !allLethal) throw new IllegalArgumentException("Dê dano letal a cada bloqueador antes de passar ao próximo.");
            allLethal &= amounts[i] >= o.get("lethal").getAsInt();
        }
        return amounts;
    }

    /** Resposta para o Forge: cada bloqueador com o seu dano; o defensor vai com a chave nula. */
    static Map<CardView, Integer> result(List<Object> options, int[] amounts) {
        Map<CardView, Integer> map = new HashMap<>();
        for (int i = 0; i < amounts.length; i++) {
            if (amounts[i] <= 0) continue;
            map.merge((CardView) options.get(i), amounts[i], Integer::sum);
        }
        return map;
    }
}
