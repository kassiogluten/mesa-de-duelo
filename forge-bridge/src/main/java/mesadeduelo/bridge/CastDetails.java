// O que muda o jeito de uma mágica chegar à pilha, para a mesa desenhar: se é cópia (tempestade, Twincast), se foi reforçada e o valor do X.
package mesadeduelo.bridge;

import com.google.gson.JsonObject;
import forge.game.spellability.SpellAbility;

final class CastDetails {
    private CastDetails() { }

    /** Põe no `spell-cast` o que vale: {@code copy}, {@code kicked} e {@code x} (só quando o custo tem X). */
    static void describe(JsonObject event, SpellAbility sa) {
        if (sa == null || !sa.isSpell()) return;
        try {
            SpellAbility root = sa.getRootAbility();
            if (root.isCopied()) event.addProperty("copy", true);
            if (root.isKicked()) event.addProperty("kicked", true);
            Integer x = root.getXManaCostPaid();
            if (x != null && root.costHasManaX() && !root.isCopied()) event.addProperty("x", x);
        } catch (RuntimeException unreadable) { /* a mágica chega sem os detalhes */ }
    }
}
