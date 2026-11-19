// Escolha de um número (o X de uma mágica, quantas vezes pagar um custo, "escolha um número"): a pergunta com a faixa, o custo e a mana disponível, e a resposta.
package mesadeduelo.bridge;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.ai.ComputerUtilMana;
import forge.card.mana.ManaCost;
import forge.game.cost.Cost;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;

/**
 * O Forge pede números de dois jeitos: {@code getInteger} (faixa, com a lista de 0 a 9 e um "outro" que abre um campo de
 * texto) e {@code one} com uma lista de inteiros. Os dois viram uma pergunta {@code kind:"number"}, que a mesa mostra
 * como um contador, e a resposta vem em {@code number}. Quando o número é o X de um custo ou quantas vezes pagar um
 * custo adicional, a pergunta leva o custo e a mana que o jogador consegue gerar, para a mesa mostrar quanto vai pagar.
 */
final class NumberChoice {
    private NumberChoice() { }

    /** Faixa pedida pelo {@code getInteger} do {@link WebGuiGame}, no lugar da lista de 0 a 9 e do "outro". */
    record Range(int min, int max) implements Serializable { }

    /**
     * O que se sabe do número que o controlador está pedindo: o que ele conta ({@code x} ou {@code times}), se dá para
     * desistir da mágica ou habilidade ({@code spell}, {@code ability} ou null), um título em português (ou null), o resto
     * do custo, o que cada unidade acrescenta e a mana que o jogador consegue gerar (-1 sem estimativa).
     */
    record Context(String unit, String cancel, String title, String base, String each, int available) { }

    /** X de um custo ou outra variável anunciada ao jogar (Announce$), ou "NumTimes" (pagar várias vezes). */
    static Context announcing(SpellAbility sa, String announce, Player player) {
        if (sa == null) return null;
        boolean x = "X".equalsIgnoreCase(announce), times = "NumTimes".equals(announce);
        String listed = sa.getParam("Announce");
        boolean playing = x || times || (listed != null && Arrays.stream(listed.split(",")).map(String::trim).anyMatch(announce::equals));
        String cancel = !playing ? null : sa.isSpell() ? "spell" : "ability";
        ManaCost total = sa.getPayCosts() == null ? null : sa.getPayCosts().getTotalMana();
        if (x && total != null && total.countX() > 0)
            return new Context("x", cancel, null, withoutX(total), "{" + total.countX() + "}", available(player));
        if (times && total != null && !total.isNoCost())
            return new Context("times", cancel, null, "", total.toString(), available(player));
        return new Context(x ? "x" : null, cancel, null, null, null, -1);
    }

    /** Pagar um custo adicional várias vezes (multikicker): o custo da mágica e o de cada vez. */
    static Context keywordCost(SpellAbility sa, Cost cost, Player player) {
        ManaCost each = cost == null ? null : cost.getTotalMana();
        ManaCost base = sa == null || sa.getPayCosts() == null ? null : sa.getPayCosts().getTotalMana();
        String title = "Quantas vezes pagar " + (cost == null ? "o custo adicional" : cost.toSimpleString()) + "?";
        if (each == null || each.isNoCost() || each.isZero()) return new Context("times", null, title, null, null, -1);
        return new Context("times", null, title, base == null || base.isNoCost() ? "" : base.toString(), each.toString(), available(player));
    }

    /** O custo sem os {X}: "{X}{R}" vira "{R}". */
    static String withoutX(ManaCost cost) { return cost.toString().replace("{X}", ""); }

    /** Mana que o jogador consegue gerar agora (fontes desviradas e a reserva), pela conta que o computador usa. */
    static int available(Player player) {
        if (player == null) return -1;
        try { return ComputerUtilMana.getAvailableManaEstimate(player, true) + player.getManaPool().totalMana(); }
        catch (RuntimeException e) { return -1; }
    }

    /**
     * Uma escolha do Forge que é de número: a faixa do {@code getInteger} ou uma lista só de inteiros. Preenche a
     * pergunta e as opções (a faixa, ou os inteiros na ordem) e devolve true; outra escolha devolve false.
     */
    static boolean describe(JsonObject q, Collection<?> choices, int minPicks, List<Object> options, Context ctx) {
        if (choices == null || choices.isEmpty()) return false;
        Integer min = null, max = null;
        List<Integer> values = new ArrayList<>();
        if (choices.size() == 1 && choices.iterator().next() instanceof Range r) {
            min = r.min(); max = r.max() == Integer.MAX_VALUE ? null : r.max();
        } else {
            if (choices.size() < 2) return false;
            for (Object o : choices) { if (!(o instanceof Integer i)) return false; values.add(i); }
            min = values.stream().min(Integer::compare).orElseThrow(); max = values.stream().max(Integer::compare).orElseThrow();
        }
        options.addAll(choices);
        q.addProperty("kind", "number");
        q.addProperty("min", min);
        if (max != null) q.addProperty("max", max);
        // Números soltos (2, 4 e 6): a mesa mostra só eles.
        if (!values.isEmpty() && values.size() != max - min + 1) {
            JsonArray list = new JsonArray();
            values.stream().sorted().distinct().forEach(list::add);
            q.add("values", list);
        }
        if (ctx != null) {
            if (ctx.title() != null) q.addProperty("title", ctx.title());
            if (ctx.unit() != null) q.addProperty("unit", ctx.unit());
            if (ctx.cancel() != null && minPicks == 0) q.addProperty("cancel", ctx.cancel());
            if (ctx.each() != null) {
                JsonObject cost = new JsonObject();
                cost.addProperty("base", ctx.base());
                cost.addProperty("each", ctx.each());
                if (ctx.available() >= 0) cost.addProperty("available", ctx.available());
                q.add("cost", cost);
            }
        }
        return true;
    }

    /** O número respondido, dentro da faixa (ou da lista); sem número, só quando dá para desistir. */
    static Integer validate(JsonObject q, JsonObject msg) {
        if (!msg.has("number") || msg.get("number").isJsonNull()) {
            if (q.has("cancel")) return null;
            throw new IllegalArgumentException("Escolha um número.");
        }
        int n;
        try { n = ClientActions.exactInt(msg.get("number")); } catch (RuntimeException e) { throw new IllegalArgumentException("Informe um número inteiro."); }
        int min = q.get("min").getAsInt();
        Integer max = q.has("max") ? q.get("max").getAsInt() : null;
        if (n < min || (max != null && n > max)) throw new IllegalArgumentException(max == null ? "Escolha um número a partir de " + min + "." : "Escolha um número de " + min + " a " + max + ".");
        if (q.has("values") && !q.getAsJsonArray("values").asList().stream().anyMatch(v -> v.getAsInt() == n))
            throw new IllegalArgumentException("Escolha um dos números da lista.");
        return n;
    }

    /** A resposta do {@code getChoices}: o inteiro escolhido (da lista, se veio uma), ou nada ao desistir. */
    static List<Object> answer(QuestionBroker.Question q, JsonObject msg) {
        Integer n = validate(q.json(), msg);
        if (n == null) return new ArrayList<>();
        for (Object o : q.options()) if (o instanceof Integer i && i.intValue() == n) return new ArrayList<>(List.of(o));
        return new ArrayList<>(List.of(n));
    }
}
