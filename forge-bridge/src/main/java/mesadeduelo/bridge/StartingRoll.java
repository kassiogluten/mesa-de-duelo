package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/**
 * O d6 de quem começa (item 112): cada jogador rola um d6, e os empatados no maior número rolam de novo, só eles, até
 * sobrar um, que escolhe quem joga o primeiro turno. Vale no primeiro jogo; na melhor de três, do segundo em diante
 * quem perdeu escolhe, sem dado.
 *
 * <p>O Forge sorteia quem escolhe (um jogador ao acaso, cada um com a mesma chance) antes de qualquer coisa que a
 * ponte possa trocar. Os dados são rolados depois, condicionados a esse vencedor: rola-se a disputa inteira e, se ela
 * der outro vencedor, rola-se de novo. Como numa disputa de dados honesta cada jogador também ganha com a mesma
 * chance, os números que saem têm exatamente a distribuição de uma rolagem de verdade.
 */
final class StartingRoll {
    private StartingRoll() { }

    static final int SIDES = 6;

    /** As rodadas: na primeira, todos os {@code players}; nas seguintes, só os empatados no maior número. */
    static List<List<int[]>> roll(List<Integer> players, int winner, Random random) {
        if (!players.contains(winner)) throw new IllegalArgumentException("vencedor fora da mesa: " + winner);
        while (true) {
            List<List<int[]>> rounds = contest(players, random);
            List<int[]> last = rounds.get(rounds.size() - 1);
            if (best(last).get(0) == winner) return rounds;
        }
    }

    /** Uma disputa inteira, até um só ter o maior número. */
    static List<List<int[]>> contest(List<Integer> players, Random random) {
        List<List<int[]>> rounds = new ArrayList<>();
        List<Integer> rolling = players;
        while (true) {
            List<int[]> round = new ArrayList<>();
            for (int p : rolling) round.add(new int[]{p, 1 + random.nextInt(SIDES)});
            rounds.add(round);
            List<Integer> top = best(round);
            if (top.size() == 1 || players.size() < 2) return rounds;
            rolling = top;
        }
    }

    /** Quem tirou o maior número na rodada. */
    static List<Integer> best(List<int[]> round) {
        int max = round.stream().mapToInt(r -> r[1]).max().orElse(0);
        return round.stream().filter(r -> r[1] == max).map(r -> r[0]).toList();
    }

    /** O evento {@code starting-roll}: {@code actor} é quem ganhou e escolhe; {@code rolls}, as rodadas. */
    static JsonObject event(List<Integer> players, int winner, Random random) {
        JsonObject e = new JsonObject();
        e.addProperty("type", "starting-roll");
        e.addProperty("actor", winner);
        JsonArray rounds = new JsonArray();
        for (List<int[]> round : roll(players, winner, random)) {
            JsonArray list = new JsonArray();
            for (int[] r : round) {
                JsonObject o = new JsonObject();
                o.addProperty("player", r[0]); o.addProperty("roll", r[1]);
                list.add(o);
            }
            rounds.add(list);
        }
        e.add("rolls", rounds);
        return e;
    }
}
