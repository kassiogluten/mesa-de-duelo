// Busca que manda as cartas achadas para dois lugares (Cultivate, Kodama's Reach): os destinos vão na primeira pergunta, e a segunda ("qual vai para o campo") é respondida com a ordem que o jogador já deu.
package mesadeduelo.bridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.game.ability.ApiType;
import forge.game.spellability.SpellAbility;

/**
 * O Forge pergunta primeiro quais cartas buscar ("até duas") e só depois, numa segunda janela, qual delas vai para o
 * campo. Quando a busca guarda as cartas (RememberChanged) e as duas habilidades seguintes movem as lembradas, uma
 * para cada lugar, a primeira pergunta ganha {@code purpose:"split-destinations"} e {@code destinations} (o primeiro
 * lugar com quantas cartas cabem e se entram viradas, e o segundo, que fica com o resto). A resposta vem na ordem dos
 * lugares, e a pergunta seguinte do Forge é respondida com ela, sem ir à mesa.
 */
final class SplitDestinations {
    private SplitDestinations() { }

    /** Os dois lugares, na ordem em que o Forge os preenche; {@code null} se a busca não for desse tipo. */
    static JsonArray of(SpellAbility sa) {
        if (sa == null || sa.getApi() != ApiType.ChangeZone || !sa.hasParam("RememberChanged")) return null;
        SpellAbility first = sa.getSubAbility();
        if (!movesRemembered(first)) return null;
        SpellAbility second = first.getSubAbility();
        if (!movesRemembered(second)) return null;
        int count;
        try { count = Integer.parseInt(first.getParamOrDefault("ChangeNum", "1")); } catch (NumberFormatException e) { return null; }
        JsonArray out = new JsonArray();
        JsonObject a = new JsonObject();
        a.addProperty("zone", first.getParam("Destination"));
        a.addProperty("count", count);
        if (first.hasParam("Tapped")) a.addProperty("tapped", true);
        out.add(a);
        JsonObject b = new JsonObject();
        b.addProperty("zone", second.getParam("Destination"));
        if (second.hasParam("Tapped")) b.addProperty("tapped", true);
        out.add(b);
        return out;
    }

    private static boolean movesRemembered(SpellAbility s) {
        return s != null && s.getApi() == ApiType.ChangeZone && s.hasParam("Destination")
            && s.getParamOrDefault("ChangeType", "").contains("IsRemembered");
    }
}
