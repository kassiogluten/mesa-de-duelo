package mesadeduelo.bridge;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.card.CardView;
import forge.game.cost.CostPartMana;
import forge.game.cost.CostSacrifice;
import forge.game.spellability.AlternativeCost;
import forge.game.spellability.SpellAbility;
import forge.game.spellability.SpellAbilityView;
import forge.player.PlayerControllerHuman;

/** The view's effect text omits some alternative costs; keep the actual offered ability's cost visible. */
final class AbilityOptions {
    private AbilityOptions() { }
    private static final Map<String, String> BASIC_LANDS = Map.of(
        "Mountain", "Montanha", "Island", "Ilha", "Forest", "Floresta", "Swamp", "Pântano", "Plains", "Planície");
    private static final Field CACHE;
    static {
        try { CACHE = PlayerControllerHuman.class.getDeclaredField("spellViewCache"); CACHE.setAccessible(true); }
        catch (ReflectiveOperationException e) { throw new ExceptionInInitializerError(e); }
    }

    static void addCosts(PlayerControllerHuman controller, List<Object> options, JsonArray rows) {
        try {
            @SuppressWarnings("unchecked") Map<SpellAbilityView, SpellAbility> abilities =
                (Map<SpellAbilityView, SpellAbility>) CACHE.get(controller);
            if (abilities == null) return;
            for (int i = 0; i < options.size(); i++) {
                SpellAbility ability = abilities.get(options.get(i));
                if (ability == null) continue;
                String cost = cost(ability);
                if (!cost.isBlank()) {
                    var row = rows.get(i).getAsJsonObject();
                    row.addProperty("label", row.get("label").getAsString().trim() + " — Custo: " + cost);
                }
            }
        } catch (IllegalAccessException e) { throw new IllegalStateException(e); }
    }

    /**
     * Modo de cada opção de jogar uma carta (conjurar, reciclar, tramar, flashback...), para a mesa traduzir e
     * mostrar sem interpretar o texto do Forge. Também separa o custo de mana dos custos extras e, quando a opção
     * usa outra face ou metade (aventura, carta dividida), manda nome, custo e tipo dessa face.
     */
    static void describe(PlayerControllerHuman controller, List<Object> options, JsonArray rows) {
        try {
            @SuppressWarnings("unchecked") Map<SpellAbilityView, SpellAbility> abilities =
                (Map<SpellAbilityView, SpellAbility>) CACHE.get(controller);
            if (abilities == null) return;
            for (int i = 0; i < options.size(); i++) {
                SpellAbility ability = abilities.get(options.get(i));
                if (ability == null) continue;
                var row = rows.get(i).getAsJsonObject();
                row.addProperty("kind", "ability");
                row.addProperty("description", row.get("label").getAsString().trim());
                row.addProperty("mode", mode(ability));
                if (ability.isSpell()) row.addProperty("spell", true);
                JsonArray extra = new JsonArray();
                String mana = "";
                if (ability.getPayCosts() != null) for (var part : ability.getPayCosts().getCostParts()) {
                    if (part instanceof CostPartMana m) { if (!m.getMana().isZero() || ability.getPayCosts().isOnlyManaCost()) mana = m.getMana().toString(); }
                    else extra.add(part.toString());
                }
                row.addProperty("cost", mana);
                row.add("extra", extra);
                var state = ability.getCardState();
                var host = ability.getHostCard();
                if (state != null && host != null && state != host.getCurrentState()) {
                    JsonObject face = new JsonObject();
                    face.addProperty("name", state.getName());
                    face.addProperty("manaCost", state.getManaCost() == null ? "" : state.getManaCost().toString());
                    face.addProperty("typeLine", state.getType() == null ? "" : state.getType().toString());
                    row.add("face", face);
                }
            }
        } catch (IllegalAccessException e) { throw new IllegalStateException(e); }
    }

    static String mode(SpellAbility a) {
        if (a.isLandAbility()) return "land";
        if (a.isCycling()) return "cycling";
        if (a.isPlotting()) return "plot";
        if (a.isForetelling()) return "foretell";
        if (a.isCastFaceDown()) return "facedown";
        if (a.isNinjutsu()) return "ninjutsu";
        if (a.isEquip()) return "equip";
        if (a.isCrew()) return "crew";
        AlternativeCost alt = a.getAlternativeCost();
        if (alt != null) return alt.name().toLowerCase(java.util.Locale.ROOT);
        if (a.isAdventure()) return "adventure";
        if (a.isOmen()) return "omen";
        if (a.isAftermath()) return "aftermath";
        if (a.isSpell()) return "cast";
        return "ability";
    }

    /** Gatilhos simultâneos para ordenar: carta de origem e o texto do gatilho, sem o nome da carta na frente. */
    static boolean triggers(List<Object> options, JsonArray rows) {
        if (options.isEmpty() || !options.stream().allMatch(o -> o instanceof SpellAbilityView)) return false;
        for (int i = 0; i < options.size(); i++) {
            SpellAbilityView view = (SpellAbilityView) options.get(i);
            var row = rows.get(i).getAsJsonObject();
            row.addProperty("kind", "ability");
            CardView host = view.getHostCard();
            if (host != null) row.add("card", StateJson.card(host));
            row.addProperty("ability", abilityText(view.getDescription(), host == null ? null : host.getName()));
        }
        return true;
    }

    static String abilityText(String description, String host) {
        String text = description == null ? "" : description.trim();
        int extra = text.indexOf(" [");
        if (extra > 0) text = text.substring(0, extra);
        if (host != null && !host.isEmpty() && text.startsWith(host)) {
            String rest = text.substring(host.length()).replaceFirst("^\\s*\\(\\d+\\)", "");
            var m = java.util.regex.Pattern.compile("^\\s*(-|:|—)\\s*").matcher(rest);
            if (m.find()) text = rest.substring(m.end());
        }
        return text;
    }

    static String cost(SpellAbility ability) {
        if (ability.getPayCosts() == null) return "";
        List<String> parts = new ArrayList<>();
        for (var part : ability.getPayCosts().getCostParts()) {
            if (part instanceof CostPartMana mana) {
                if (!mana.getMana().isZero() || ability.getPayCosts().isOnlyManaCost()) parts.add(mana.getMana().toString());
            } else if (part instanceof CostSacrifice sacrifice && BASIC_LANDS.containsKey(sacrifice.getType())
                && sacrifice.getAmount().matches("[0-9]+")) {
                String amount = sacrifice.getAmount(), land = BASIC_LANDS.get(sacrifice.getType());
                parts.add("sacrificar " + amount + " " + land + ("1".equals(amount) ? "" : "s"));
            } else parts.add(part.toString());
        }
        return String.join(", ", parts);
    }
}
