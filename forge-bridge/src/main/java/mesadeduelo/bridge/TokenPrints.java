package mesadeduelo.bridge;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import forge.card.ColorSet;
import forge.deck.Deck;
import forge.game.card.Card;
import forge.game.player.Player;

/**
 * As séries de ficha que o jogador escolheu no deck: a ficha que ele cria na partida mostra a arte escolhida.
 * A escolha viaja nas anotações do deck do Forge, que são copiadas junto com ele (sideboard, revanche).
 */
final class TokenPrints {
    private TokenPrints() {}

    private static final String NOTE = "mesa-tokens";
    static final int MAX = 200;

    /** A ficha pelo que o Scryfall e o Forge têm em comum: o nome (sem o " Token" do Forge), as cores e a força/resistência. */
    record Choice(String name, String colors, String power, String toughness, String set, String cn) {
        String image() {
            return "https://api.scryfall.com/cards/" + URLEncoder.encode(set, StandardCharsets.UTF_8) + "/"
                + URLEncoder.encode(cn, StandardCharsets.UTF_8) + "?format=image&version=normal";
        }
    }

    /** Lê as escolhas da lista enviada pela mesa ({name, colors, power, toughness, set, cn}); as malformadas ficam de fora. */
    static void read(JsonElement value, Deck deck) {
        if (value == null || !value.isJsonArray()) return;
        JsonArray kept = new JsonArray();
        for (JsonElement e : value.getAsJsonArray()) {
            if (kept.size() >= MAX) break;
            Choice c = choice(e);
            if (c == null) continue;
            JsonObject o = new JsonObject();
            o.addProperty("name", c.name()); o.addProperty("colors", c.colors());
            if (c.power() != null) o.addProperty("power", c.power());
            if (c.toughness() != null) o.addProperty("toughness", c.toughness());
            o.addProperty("set", c.set()); o.addProperty("cn", c.cn());
            kept.add(o);
        }
        if (!kept.isEmpty()) deck.getDraftNotes().put(NOTE, kept.toString());
    }

    /** As escolhas do deck como a mesa as mandou (para o deck voltar igual numa revanche ou no replay). */
    static JsonArray json(Deck deck) {
        String raw = deck == null ? null : deck.getDraftNotes().get(NOTE);
        if (raw == null) return new JsonArray();
        try { return JsonParser.parseString(raw).getAsJsonArray(); } catch (RuntimeException e) { return new JsonArray(); }
    }

    private static Choice choice(JsonElement e) {
        if (e == null || !e.isJsonObject()) return null;
        JsonObject o = e.getAsJsonObject();
        String name = text(o, "name", 100), set = text(o, "set", 10), cn = text(o, "cn", 20);
        // Ficha incolor: colors vazio (ou ausente).
        String colors = !o.has("colors") ? "" : o.get("colors").isJsonPrimitive() && o.get("colors").getAsJsonPrimitive().isString() ? o.get("colors").getAsString().strip() : null;
        if (name == null || set == null || cn == null || colors == null || !colors.matches("[WUBRG]*")) return null;
        String power = o.has("power") ? text(o, "power", 5) : null, toughness = o.has("toughness") ? text(o, "toughness", 5) : null;
        if ((o.has("power") && power == null) || (o.has("toughness") && toughness == null)) return null;
        if (!set.matches("[a-z0-9]+")) return null;
        return new Choice(name, colors, power, toughness, set, cn);
    }

    private static String text(JsonObject o, String key, int max) {
        JsonElement v = o.get(key);
        if (v == null || !v.isJsonPrimitive() || !v.getAsJsonPrimitive().isString()) return null;
        String s = v.getAsString().strip();
        return s.isEmpty() || s.length() > max ? null : s;
    }

    private static final Map<String, List<Choice>> PARSED = new java.util.concurrent.ConcurrentHashMap<>();
    private static List<Choice> choices(Deck deck) {
        String raw = deck == null ? null : deck.getDraftNotes().get(NOTE);
        if (raw == null) return List.of();
        return PARSED.computeIfAbsent(raw, r -> {
            List<Choice> out = new ArrayList<>();
            for (JsonElement e : json(deck)) { Choice c = choice(e); if (c != null) out.add(c); }
            return out;
        });
    }

    /**
     * A imagem da série escolhida pelo dono da ficha; null quando ele não escolheu (vale a da carta que a criou).
     * Primeiro a ficha igual em nome, cores e força/resistência; sem ela, a única com esse nome e essas cores
     * (fichas X/X, como a Hidra 0/0 que nasce com marcadores, entram com outra força no Forge).
     */
    static String image(Card token) {
        if (token == null || !token.isToken()) return null;
        Player owner = token.getOwner();
        if (owner == null || owner.getGame() == null) return null;
        List<Choice> list;
        try { list = choices(owner.getRegisteredPlayer().getDeck()); } catch (RuntimeException e) { return null; }
        if (list.isEmpty()) return null;
        String name = normalized(token.getName()), colors = colors(token.getColor());
        String power = token.isCreature() ? token.getBasePowerString() : null, toughness = token.isCreature() ? token.getBaseToughnessString() : null;
        Choice loose = null; int same = 0;
        for (Choice c : list) {
            if (!normalized(c.name()).equals(name) || !c.colors().equals(colors)) continue;
            if (power == null ? c.power() == null : power.equals(c.power()) && toughness.equals(c.toughness())) return c.image();
            loose = c; same++;
        }
        return same == 1 ? loose.image() : null;
    }

    static String normalized(String name) {
        String n = name == null ? "" : name.strip();
        if (n.endsWith(" Token")) n = n.substring(0, n.length() - " Token".length());
        return n.toLowerCase(Locale.ROOT);
    }

    static String colors(ColorSet c) {
        StringBuilder s = new StringBuilder();
        if (c.hasWhite()) s.append('W');
        if (c.hasBlue()) s.append('U');
        if (c.hasBlack()) s.append('B');
        if (c.hasRed()) s.append('R');
        if (c.hasGreen()) s.append('G');
        return s.toString();
    }
}
