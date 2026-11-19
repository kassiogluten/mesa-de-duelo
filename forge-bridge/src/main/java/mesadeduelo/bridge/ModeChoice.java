// Os modos de uma mágica ou habilidade modal ("Escolha um —", "Escolha dois —") numa pergunta só, com o número de cada modo na carta, o alvo que ele pede e os que não dá para escolher agora.
package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.game.spellability.AbilitySub;
import forge.game.spellability.SpellAbility;
import forge.game.spellability.SpellAbilityView;
import forge.game.spellability.TargetRestrictions;
import forge.game.zone.ZoneType;

/**
 * O Forge pergunta os modos um de cada vez ({@code one} repetido, cada janela com um modo a menos e sem dizer qual já foi).
 * Aqui eles vão juntos num {@code getChoices} com o mínimo e o máximo, e a pergunta ganha {@code purpose:"modes"}: em cada
 * opção, o número do modo na carta ({@code modeIndex}, 1 é o primeiro) e o que serve de alvo; e, em {@code unavailableModes},
 * os modos que a regra 603.3c tirou (sem alvo possível) ou que a carta não deixa repetir.
 */
final class ModeChoice {
    private ModeChoice() { }

    /** A pergunta em andamento: as opções (na ordem da pergunta), o que vai em cada uma e os modos de fora. */
    record Context(List<SpellAbilityView> options, Map<SpellAbilityView, JsonObject> details, JsonArray unavailable, int total) { }

    /** Modos que dá para juntar numa pergunta: sem repetir modo e sem o limite de "patas" (Bloomburrow), que muda a cada escolha. */
    static boolean supported(SpellAbility sa, List<AbilitySub> possible, boolean allowRepeat) {
        return sa != null && !allowRepeat && !sa.hasParam("Pawprint") && possible.stream().noneMatch(s -> s.hasParam("Pawprint"));
    }

    static Context of(SpellAbility sa, List<AbilitySub> possible, Map<SpellAbilityView, AbilitySub> views) {
        List<AbilitySub> all = sa.getAdditionalAbilityList("Choices");
        Map<AbilitySub, SpellAbilityView> viewOf = new IdentityHashMap<>();
        views.forEach((view, sub) -> viewOf.put(sub, view));
        List<SpellAbilityView> options = new ArrayList<>();
        Map<SpellAbilityView, JsonObject> details = new IdentityHashMap<>();
        for (AbilitySub sub : possible) {
            SpellAbilityView view = viewOf.get(sub);
            if (view == null) continue;
            options.add(view);
            JsonObject d = new JsonObject();
            int index = indexOf(all, sub);
            if (index > 0) d.addProperty("modeIndex", index);
            target(sub, d);
            details.put(view, d);
        }
        JsonArray unavailable = new JsonArray();
        for (int i = 0; i < all.size(); i++) {
            AbilitySub sub = all.get(i);
            if (possible.stream().anyMatch(p -> p == sub || p.getDescription().equals(sub.getDescription()))) continue;
            JsonObject u = new JsonObject();
            u.addProperty("modeIndex", i + 1);
            u.addProperty("label", sub.toUnsuppressedString());
            boolean noTarget = sub.usesTargeting() && sub.getMinTargets() > 0 && sub.getTargetRestrictions().getNumCandidates(sub) == 0;
            u.addProperty("reason", noTarget ? "target" : "chosen");
            unavailable.add(u);
        }
        return new Context(options, details, unavailable, all.size());
    }

    /** O mesmo objeto ou, numa cópia da habilidade, o modo de mesma descrição. */
    private static int indexOf(List<AbilitySub> all, AbilitySub sub) {
        for (int i = 0; i < all.size(); i++) if (all.get(i) == sub) return i + 1;
        for (int i = 0; i < all.size(); i++) if (all.get(i).getDescription().equals(sub.getDescription())) return i + 1;
        return 0;
    }

    private static void target(AbilitySub sub, JsonObject d) {
        if (!sub.usesTargeting()) return;
        TargetRestrictions tgt = sub.getTargetRestrictions();
        if (tgt == null) return;
        JsonArray valid = new JsonArray();
        for (String v : tgt.getValidTgts()) valid.add(v);
        if (!valid.isEmpty()) d.add("valid", valid);
        JsonArray zones = new JsonArray();
        for (ZoneType zone : tgt.getZone()) if (zone != ZoneType.Battlefield) zones.add(zone.name());
        if (!zones.isEmpty()) d.add("zones", zones);
    }

    /** Marca a pergunta de modos: o propósito, quantos modos a carta tem, o de cada opção e os de fora. */
    static void describe(JsonObject q, Context c, List<Object> options, JsonArray rows) {
        q.addProperty("purpose", "modes");
        q.addProperty("modeCount", c.total());
        for (int i = 0; i < options.size() && i < rows.size(); i++) {
            JsonObject d = options.get(i) instanceof SpellAbilityView view ? c.details().get(view) : null;
            if (d != null) for (var e : d.entrySet()) rows.get(i).getAsJsonObject().add(e.getKey(), e.getValue());
        }
        if (!c.unavailable().isEmpty()) q.add("unavailableModes", c.unavailable());
    }
}
