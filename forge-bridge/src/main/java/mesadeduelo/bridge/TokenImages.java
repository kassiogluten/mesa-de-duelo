package mesadeduelo.bridge;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import forge.ImageKeys;
import forge.StaticData;
import forge.card.CardEdition;
import forge.game.card.CardView.CardStateView;

/**
 * A imagem de cada ficha no Scryfall, a partir da chave de imagem do Forge; quando a coleção da carta não traz
 * a ficha com número, a mesma ficha impressa noutra coleção (a mais recente), para ela não ficar sem arte.
 */
final class TokenImages {
    private TokenImages() {}

    /** Imagens já resolvidas, por chave de imagem do Forge ("" = sem imagem conhecida). */
    private static final Map<String, String> CACHE = new ConcurrentHashMap<>();

    /**
     * Coleções de fichas que só o Forge tem (o Scryfall não conhece esses números): "Old Border Custom Tokens", as
     * fichas da revista Duelist e as das Astral Cards. Valem como coleção feita à mão.
     */
    private static final Set<String> ONLY_IN_FORGE = Set.of("OBC", "TDLS", "PAST");

    /** Onde a ficha de um roteiro está impressa com número: coleção de fichas no Scryfall e número. */
    record Print(String tokensCode, String number, Date date, boolean regular) {
        /** Coleção comum antes de promoção e de coleção de brincadeira (números fora do padrão); entre elas, a mais recente. */
        boolean betterThan(Print o) {
            if (o == null) return true;
            if (regular != o.regular) return regular;
            return date.after(o.date);
        }
    }

    /** A melhor impressão (com número) de cada roteiro de ficha, montada uma vez a partir das coleções. */
    private static volatile Map<String, Print> newest;

    /** A imagem da face que a ficha mostra, ou null quando nenhuma coleção a imprime com número. */
    static String of(CardStateView s) {
        String key;
        try { key = s.getImageKey(null); } catch (RuntimeException e) { return null; }
        return forKey(key);
    }

    /**
     * A chave "t:roteiro|SET|número" aponta para o número da ficha na coleção de fichas do SET (ex.: tblb/3), como o
     * ImageFetcher do Forge calcula; sem número, vale a primeira ficha com esse roteiro na coleção. Coleção que não
     * traz a ficha numerada, desconhecida ou feita à mão: a mesma ficha (o mesmo roteiro) na coleção mais recente.
     */
    static String forKey(String key) {
        if (key == null || !key.startsWith(ImageKeys.TOKEN_PREFIX)) return null;
        String cached = CACHE.get(key);
        if (cached != null) return cached.isEmpty() ? null : cached;
        String tmp = key.substring(ImageKeys.TOKEN_PREFIX.length());
        boolean back = tmp.endsWith(ImageKeys.BACKFACE_POSTFIX);
        if (back) tmp = tmp.substring(0, tmp.length() - ImageKeys.BACKFACE_POSTFIX.length());
        String[] parts = tmp.split("\\|");
        String url = null;
        CardEdition edition = parts.length > 1 ? StaticData.instance().getEditions().get(parts[1]) : null;
        if (known(edition)) {
            String number = parts.length > 2 && !parts[2].isEmpty() ? parts[2] : numbered(edition, parts[0]);
            if (number != null) url = url(edition.getTokensCode(), number, back);
        }
        if (url == null) {
            Print p = newest().get(parts[0]);
            if (p != null) url = url(p.tokensCode(), p.number(), back);
        }
        CACHE.put(key, url == null ? "" : url);
        return url;
    }

    private static boolean known(CardEdition e) {
        return e != null && e.getType() != CardEdition.Type.CUSTOM_SET && !ONLY_IN_FORGE.contains(e.getCode());
    }

    private static String url(String tokensCode, String number, boolean back) {
        if (number.endsWith("☇")) { back = true; number = number.substring(0, number.length() - 1); }
        return "https://api.scryfall.com/cards/" + tokensCode + "/" + URLEncoder.encode(number, StandardCharsets.UTF_8)
            + "?format=image&version=normal" + (back ? "&face=back" : "");
    }

    /** O primeiro número da ficha na coleção, ou null se ela não a lista com número. */
    private static String numbered(CardEdition edition, String script) {
        for (CardEdition.EditionEntry e : edition.getTokens().get(script)) {
            if (e.collectorNumber() != null && !e.collectorNumber().isEmpty()) return e.collectorNumber();
        }
        return null;
    }

    private static Map<String, Print> newest() {
        Map<String, Print> m = newest;
        if (m != null) return m;
        synchronized (TokenImages.class) {
            if (newest != null) return newest;
            Map<String, Print> built = new HashMap<>();
            for (CardEdition e : StaticData.instance().getEditions()) {
                if (!known(e) || e.getDate() == null) continue;
                boolean regular = e.getType() != CardEdition.Type.PROMO && e.getType() != CardEdition.Type.FUNNY;
                for (String script : e.getTokens().keySet()) {
                    String number = numbered(e, script);
                    if (number == null) continue;
                    Print p = new Print(e.getTokensCode(), number, e.getDate(), regular);
                    if (p.betterThan(built.get(script))) built.put(script, p);
                }
            }
            return newest = built;
        }
    }
}
