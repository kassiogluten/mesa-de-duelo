package mesadeduelo.bridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.card.MagicColor;
import forge.card.mana.ManaAtom;
import forge.card.mana.ManaCostShard;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.card.CardView.CardStateView;
import forge.game.card.CardView;
import forge.game.combat.CombatUtil;
import forge.game.cost.Cost;
import forge.game.keyword.Keyword;
import forge.game.keyword.KeywordView;
import forge.game.player.Player;
import forge.game.staticability.StaticAbility;
import forge.game.trigger.Trigger;
import forge.game.zone.ZoneType;

/**
 * Estados de uma permanente que a mesa desenha como efeito contínuo e que as palavras-chave sozinhas não dizem: o custo
 * da proteção contra alvos (ward), de que a proteção protege, fases fora, "não pode atacar/bloquear" e os escudos de
 * prevenção, além de dono, atiçamento, regeneração, escolhas e devoção (em {@link #status}). Tudo vem do Forge (parâmetro da palavra-chave, regras de combate, escudos), nunca do texto da carta.
 */
final class PermanentDetails {
    private PermanentDetails() {}

    /** Vale para qualquer carta, inclusive virada para baixo (o resto dela fica escondido). */
    static void visible(JsonObject o, CardView c) {
        if (c.isPhasedOut()) o.addProperty("phasedOut", true);
        if (c.getZone() == ZoneType.Battlefield && c.getPreventNextDamage() > 0) o.addProperty("preventDamage", c.getPreventNextDamage());
    }

    /**
     * Estados públicos de uma permanente no campo, inclusive virada para baixo: o dono quando outro jogador a controla,
     * os escudos de regeneração e quem a atiçou. As escolhas feitas pela carta só vão com ela à mostra.
     */
    static void status(JsonObject o, CardView c, Game game) {
        if (c.getZone() != ZoneType.Battlefield) return;
        if (c.getOwner() != null && c.getController() != null && c.getOwner().getId() != c.getController().getId()) o.addProperty("owner", c.getOwner().getId());
        if (c.getShieldCount() > 0) o.addProperty("shields", c.getShieldCount());
        // Batalhas: quem as defende (é quem bloqueia os atacantes dela e a quem o dano a ela é causado).
        if (c.getProtectingPlayer() != null) o.addProperty("protector", c.getProtectingPlayer().getId());
        if (!c.isFaceDown()) chosen(o, c);
        if (game == null) return;
        try {
            Card gc = game.findByView(c);
            if (gc != null && !c.isFaceDown()) devotion(o, gc);
            if (gc != null) states(o, gc);
            if (gc == null || !gc.isGoaded()) return;
            JsonArray by = new JsonArray();
            for (Player p : gc.getGoaded()) by.add(p.getId());
            o.add("goadedBy", by);
        } catch (RuntimeException concurrentRead) { /* leitura durante a jogada do motor: sem marca desta vez */ }
    }

    /**
     * Devoção das cartas que contam com ela (Count$Devotion e Count$DevotionDual nas variáveis da carta): as cores, o valor
     * para o controlador, somado como o Forge soma, e, nos deuses de Theros, a devoção que falta para virar criatura.
     */
    static void devotion(JsonObject o, Card gc) {
        Player controller = gc.getController();
        if (controller == null) return;
        for (String value : gc.getSVars().values()) {
            String[] sq = value.startsWith("Count$") ? value.substring(6).split("[.$/]") : new String[0];
            if (sq.length < 2 || !(sq[0].equals("Devotion") || sq[0].equals("DevotionDual") && sq.length >= 3)) continue;
            String first = sq[1].equals("Chosen") ? gc.getChosenColor() : sq[1];
            if (first == null || first.isEmpty()) continue;
            byte color = ManaAtom.fromName(MagicColor.toShortString(first));
            if (sq[0].equals("DevotionDual")) color |= ManaAtom.fromName(MagicColor.toShortString(sq[2]));
            if (color == 0) continue;
            int count = controller.getDevotionMod();
            for (Card permanent : controller.getCardsIn(ZoneType.Battlefield))
                for (ManaCostShard shard : permanent.getManaCost()) if (shard.isColor(color)) count++;
            JsonObject d = new JsonObject();
            JsonArray colors = new JsonArray();
            for (char letter : "WUBRG".toCharArray()) if ((color & ManaAtom.fromName(letter)) != 0) colors.add(String.valueOf(letter));
            d.add("colors", colors);
            d.addProperty("value", count);
            Integer need = creatureThreshold(gc, value);
            if (need != null) d.addProperty("need", need);
            o.add("devotion", d);
            return;
        }
    }

    /** "Enquanto sua devoção for menor que N, não é criatura": o N, lido da habilidade estática que tira o tipo. */
    private static Integer creatureThreshold(Card gc, String count) {
        for (StaticAbility st : gc.getStaticAbilities()) {
            String compare = st.getParam("SVarCompare"), removes = st.getParam("RemoveType"), svar = st.getParam("CheckSVar");
            if (compare == null || removes == null || svar == null || !removes.contains("Creature") || !count.equals(gc.getSVar(svar))) continue;
            if (compare.matches("LT\\d+")) return Integer.parseInt(compare.substring(2));
        }
        return null;
    }

    /**
     * Estados que uma mecânica liga uma vez e o Forge guarda na carta: monstruosa, renomada, suspeita, selada e
     * tripulada no turno (com quem selou ou tripulou), exaurida (não desvira na próxima etapa de desvirar de quem a
     * controla), detida, atrelada e caso solucionado. Vão em {@code states}, só os que valem.
     */
    static void states(JsonObject o, Card gc) {
        JsonArray states = new JsonArray();
        if (gc.isMonstrous()) states.add("monstrous");
        if (gc.isRenowned()) states.add("renowned");
        if (gc.isSuspected()) states.add("suspected");
        if (gc.isSaddled()) { states.add("saddled"); names(o, "saddledBy", gc.getSaddledByThisTurn()); }
        if (!gc.getCrewedByThisTurn().isEmpty()) { states.add("crewed"); names(o, "crewedBy", gc.getCrewedByThisTurn()); }
        if (gc.getController() != null && gc.isExertedBy(gc.getController())) states.add("exerted");
        if (gc.isDetained()) states.add("detained");
        if (gc.isHarnessed()) states.add("harnessed");
        if (gc.isSolved()) states.add("solved");
        if (!states.isEmpty()) o.add("states", states);
    }
    private static void names(JsonObject o, String key, Iterable<Card> cards) {
        if (cards == null) return;
        JsonArray names = new JsonArray();
        for (Card c : cards) if (!c.isFaceDown()) names.add(c.getName());
        if (!names.isEmpty()) o.add(key, names);
    }

    /**
     * Cartas que contam as mágicas conjuradas no turno: Tempestade ou, no script do Forge, uma contagem ou condição de
     * mágicas do turno (Count$ThisTurnCast, ActivatorThisTurnCast, as mágicas antes desta). Só no campo, na mão,
     * na pilha e na zona de comando, onde a contagem pode mudar uma decisão.
     */
    static void countsSpells(JsonObject o, CardView c, Game game) {
        if (game == null || c.getZone() == null || !SPELL_COUNT_ZONES.contains(c.getZone())) return;
        try {
            Card gc = game.findByView(c);
            if (gc != null && countsSpells(gc)) o.addProperty("countsSpells", true);
        } catch (RuntimeException concurrentRead) { /* leitura durante a jogada do motor: sem marca desta vez */ }
    }
    private static final java.util.Set<ZoneType> SPELL_COUNT_ZONES = java.util.EnumSet.of(ZoneType.Battlefield, ZoneType.Hand, ZoneType.Stack, ZoneType.Command);

    static boolean countsSpells(Card gc) {
        if (gc.hasKeyword(Keyword.STORM)) return true;
        for (String value : gc.getSVars().values()) if (mentionsSpellCount(value)) return true;
        for (Trigger t : gc.getTriggers()) for (String value : t.getMapParams().values()) if (mentionsSpellCount(value)) return true;
        for (StaticAbility st : gc.getStaticAbilities()) for (String value : st.getMapParams().values()) if (mentionsSpellCount(value)) return true;
        return false;
    }
    private static boolean mentionsSpellCount(String value) {
        return value != null && (value.contains("ThisTurnCast_") || value.contains("ActivatorThisTurnCast") || value.contains("SpellsCastThisTurn") || value.contains("CurrentCastSpells"));
    }

    /** O que a carta escolheu ao entrar ou resolver (tipo, cores, carta nomeada, jogador, número, modo); só vai quando há algo. */
    static void chosen(JsonObject o, CardView c) {
        JsonObject ch = new JsonObject();
        JsonArray types = new JsonArray();
        for (String t : new String[] {c.getChosenType(), c.getChosenType2()}) if (t != null && !t.isEmpty()) types.add(t);
        if (!types.isEmpty()) ch.add("types", types);
        if (c.getChosenColors() != null && !c.getChosenColors().isEmpty()) {
            JsonArray colors = new JsonArray();
            for (String color : c.getChosenColors()) colors.add(color.toLowerCase());
            ch.add("colors", colors);
        }
        if (c.getNamedCard() != null && !c.getNamedCard().isEmpty()) {
            JsonArray names = new JsonArray();
            for (String name : c.getNamedCard()) if (name != null && !name.isEmpty()) names.add(name);
            if (!names.isEmpty()) ch.add("names", names);
        }
        if (c.getChosenPlayer() != null) ch.addProperty("player", c.getChosenPlayer().getId());
        if (c.getChosenNumber() != null && !c.getChosenNumber().isEmpty()) ch.addProperty("number", c.getChosenNumber());
        if (c.getChosenMode() != null && !c.getChosenMode().isEmpty()) ch.addProperty("mode", c.getChosenMode());
        if (ch.size() > 0) o.add("chosen", ch);
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
