package mesadeduelo.bridge;

import java.util.LinkedHashSet;
import java.util.Set;
import java.util.regex.Pattern;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.zone.ZoneType;

/**
 * Cartas que uma permanente exilou "com ela" ou "sob ela" (Journey to Nowhere, Oblivion Ring, Banisher Priest, Hostage
 * Taker, imprint, Hideaway) e que continuam no exílio: vão em {@code exiling} na permanente, para a mesa desenhá-las
 * saindo por baixo dela. Ficam de fora as que ela tirou só do cemitério ou do grimório sem voltar a falar delas
 * (Ashiok, Dream Render exila cemitérios inteiros, que não têm mais nada a ver com ele), a não ser que um gatilho atrasado
 * dela ainda vá devolvê-las (Necropotência).
 */
final class ExiledUnder {
    private ExiledUnder() {}

    static void add(JsonObject o, Card permanent, Game game) {
        if (permanent == null || game == null || !permanent.isInPlay()) return;
        Set<Integer> ids = new LinkedHashSet<>();
        try {
            for (Card x : permanent.getExiledCards()) if (stillExiled(x, permanent, game) && (related(x, permanent) || DelayedReturns.pendingFrom(x, permanent, game))) ids.add(x.getId());
            for (Card x : permanent.getImprintedCards()) if (stillExiled(x, null, game)) ids.add(x.getId());
        } catch (RuntimeException concurrentRead) {
            return; // leitura durante a jogada do motor: fica para o próximo estado
        }
        if (ids.isEmpty()) return;
        JsonArray list = new JsonArray();
        ids.forEach(list::add);
        o.add("exiling", list);
    }

    /** O texto da permanente fala das cartas que ela exilou: "exiled with", "the exiled card", "until … leaves the battlefield". */
    private static final Pattern MENTIONS_EXILED = Pattern.compile(
        "exiled with|cards? exiled|exiled cards?|the exiled|until [^.]{0,60}leaves the battlefield", Pattern.CASE_INSENSITIVE);
    /** Zonas de onde a carta sai sem ligação com quem a exilou, a não ser que o texto dele volte a falar dela. */
    private static final Set<String> LOOSE_ORIGINS = Set.of("graveyard", "library");

    /**
     * A carta exilada tem a ver com a permanente: veio do campo, da mão ou da pilha (Journey to Nowhere, Oblivion Ring,
     * Kitesail Freebooter), ou a permanente fala das cartas que exilou (Bomat Courier, Ashiok, Nightmare Weaver). Quando
     * o Forge não diz de onde ela veio, continua valendo.
     */
    static boolean related(Card x, Card host) {
        var sa = x.getExiledSA();
        String origin = sa == null ? null : sa.getParam("Origin");
        if (origin == null || origin.isBlank()) return true;
        for (String zone : origin.split(",")) if (!LOOSE_ORIGINS.contains(zone.strip().toLowerCase())) return true;
        String text = host.getOracleText();
        return text != null && MENTIONS_EXILED.matcher(text).find();
    }

    /**
     * Ainda no exílio, como o mesmo objeto (uma carta que sai do exílio vira outro objeto no Forge). Ficam de fora as
     * exiladas para pagar a própria mágica (Delve): o Forge as liga à criatura, mas elas não estão "sob" ela.
     */
    private static boolean stillExiled(Card x, Card host, Game game) {
        if (x == null || x.isToken()) return false;
        if (host != null && (host.getDelved().contains(x) || (x.getExiledSA() != null && x.getExiledSA().isSpell()))) return false;
        Card now = game.getCardState(x, null);
        return now != null && now.isInZone(ZoneType.Exile);
    }
}
