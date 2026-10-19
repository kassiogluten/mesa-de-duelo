package mesadeduelo.bridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.card.CardView.CardStateView;
import forge.game.card.CardView;
import forge.game.combat.CombatUtil;
import forge.game.cost.Cost;
import forge.game.keyword.Keyword;
import forge.game.keyword.KeywordView;
import forge.game.player.Player;
import forge.game.zone.ZoneType;

/**
 * Estados de uma permanente que a mesa desenha como efeito contínuo e que as palavras-chave sozinhas não dizem: o custo
 * da proteção contra alvos (ward), de que a proteção protege, fases fora, "não pode atacar/bloquear" e os escudos de
 * prevenção. Tudo vem do Forge (parâmetro da palavra-chave, regras de combate, escudos), nunca do texto da carta.
 */
final class PermanentDetails {
    private PermanentDetails() {}

    /** Vale para qualquer carta, inclusive virada para baixo (o resto dela fica escondido). */
    static void visible(JsonObject o, CardView c) {
        if (c.isPhasedOut()) o.addProperty("phasedOut", true);
        if (c.getZone() == ZoneType.Battlefield && c.getPreventNextDamage() > 0) o.addProperty("preventDamage", c.getPreventNextDamage());
    }

    static void add(JsonObject o, CardView c, CardStateView s, Game game) {
        if (s.getKeywords() != null) {
            JsonArray protection = new JsonArray();
            for (KeywordView k : s.getKeywords()) {
                if (k.keyword() == Keyword.WARD && !o.has("ward")) o.addProperty("ward", wardCost(k.original()));
                if (k.keyword() == Keyword.PROTECTION) { String from = protectionFrom(k.original()); if (from != null) protection.add(from); }
            }
            if (!protection.isEmpty()) o.add("protection", protection);
        }
        if (game == null || !s.isCreature() || c.getZone() != ZoneType.Battlefield) return;
        Card gc;
        try { gc = game.findByView(c); } catch (RuntimeException e) { return; }
        if (gc == null || gc.getController() == null) return;
        try {
            // "Próximo turno" ignora estar virada, com enjoo ou fora de fase: sobra só o que proíbe de verdade.
            boolean attack = false;
            for (Player opponent : gc.getController().getOpponents()) if (CombatUtil.canAttackNextTurn(gc, opponent)) { attack = true; break; }
            if (!attack && !gc.hasKeyword(Keyword.DEFENDER)) o.addProperty("cantAttack", true);
            if (!CombatUtil.canBlock(gc, true)) o.addProperty("cantBlock", true);
        } catch (RuntimeException concurrentRead) { /* leitura durante a jogada do motor: sem marca desta vez */ }
    }

    /** "Ward:2" → "{2}"; outros custos ("Ward:PayLife<3>") como o Forge os descreve. */
    static String wardCost(String original) {
        String param = original == null ? "" : original.replaceFirst("(?i)^Ward:?", "").trim();
        if (param.isEmpty()) return "";
        if (param.matches("\\d+")) return "{" + param + "}";
        try { return new Cost(param, true).toSimpleString(); } catch (RuntimeException e) { return param; }
    }

    /** "Protection from red" → "red"; "Protection:Card.MultiColor:multicolored" → "multicolored"; "Protection:Artifact" → "artifact". */
    static String protectionFrom(String original) {
        if (original == null) return null;
        if (original.toLowerCase().startsWith("protection from ")) return original.substring(16).trim().toLowerCase();
        String[] parts = original.split(":");
        if (parts.length >= 3) return parts[parts.length - 1].trim().toLowerCase();
        if (parts.length == 2) return parts[1].trim().toLowerCase();
        return null;
    }
}
