package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.card.CardType;
import forge.card.MagicColor;
import forge.game.CardTraitBase;
import forge.game.Game;
import forge.game.ability.AbilityFactory;
import forge.game.ability.AbilityUtils;
import forge.game.card.Card;
import forge.game.card.CardView;
import forge.game.keyword.Keyword;
import forge.game.spellability.SpellAbility;
import forge.game.staticability.StaticAbility;
import forge.game.trigger.Trigger;
import forge.game.zone.ZoneType;

/**
 * O valor que a carta conta (item 56 do roadmap): Combustion Technique soma as Lições do cemitério ao dano, Ghalta custa
 * menos pelo poder das suas criaturas, Accumulate Wisdom melhora com três Lições, os deuses de Theros só são criaturas
 * com devoção. Vai em {@code counts}, só nas cartas da mão, do campo, da pilha e da zona de comando, e só quando o número
 * muda o que a carta faz: uma quantidade de efeito (dano, P/T, custo, vida, cartas, fichas, marcadores, mana) ou um
 * mínimo que liga um efeito. A devoção é um caso disto (sempre vai, como antes).
 *
 * <p>Tudo vem do script do Forge: as variáveis {@code Count$...} da carta e os parâmetros das habilidades que as usam.
 * O valor é calculado pelo motor ({@link AbilityUtils#calculateAmount}), como na hora de resolver. Só entram contagens
 * que a mesa sabe descrever (cartas de um tipo no campo, no cemitério ou no exílio, o poder total, a devoção, a mão, a
 * vida, o domínio); as que só têm valor ao resolver (X pago, alvo escolhido, o que foi lembrado) ficam de fora.
 */
final class CardCounts {
    private CardCounts() {}

    static final Set<ZoneType> ZONES = EnumSet.of(ZoneType.Battlefield, ZoneType.Hand, ZoneType.Stack, ZoneType.Command);

    static void add(JsonObject o, CardView c, Game game) {
        if (game == null || c.isFaceDown() || c.getZone() == null || !ZONES.contains(c.getZone())) return;
        try {
            Card gc = game.findByView(c);
            if (gc == null) return;
            JsonArray counts = counts(gc);
            if (!counts.isEmpty()) o.add("counts", counts);
        } catch (RuntimeException concurrentRead) { /* leitura durante a jogada do motor: sem contagem desta vez */ }
    }

    /** Parâmetros de uma habilidade, com o trait que calcula o valor e se o efeito vem de um "quando esta carta entra". */
    private record Params(Map<String, String> map, CardTraitBase trait, boolean entering) {}

    /** Uma contagem que a carta usa: o que é contado (sem as contas em cima, "Plus.2"), e cada uso dela. */
    private static final class Found {
        final String base, valid; final JsonObject of; final CardTraitBase trait;
        int value; Integer entering;
        String power, toughness;
        final JsonArray uses = new JsonArray();
        Found(String base, String valid, JsonObject of, CardTraitBase trait) { this.base = base; this.valid = valid; this.of = of; this.trait = trait; }
        void use(JsonObject u) { if (!uses.contains(u)) uses.add(u); }
        JsonObject json() {
            JsonObject o = of.deepCopy();
            o.addProperty("value", value);
            if (entering != null) o.addProperty("entering", entering);
            JsonArray all = new JsonArray();
            if (power != null || toughness != null) {
                JsonObject pt = new JsonObject();
                pt.addProperty("use", "pt");
                if (power != null) pt.addProperty("power", power);
                if (toughness != null) pt.addProperty("toughness", toughness);
                all.add(pt);
            }
            all.addAll(uses);
            o.add("uses", all);
            return o;
        }
    }

    /** O que a variável é, já seguindo "SVar$X/Plus.1": a contagem de base, as contas por cima e, num "Compare", o mínimo. */
    private record Resolved(String base, List<String> ops, Integer min, String compareOp) {}

    static JsonArray counts(Card gc) {
        Map<String, Found> found = new LinkedHashMap<>();
        for (Params p : params(gc)) inspect(gc, p, found);
        devotion(gc, found);
        JsonArray out = new JsonArray();
        for (Found f : found.values()) if (!f.uses.isEmpty() || f.power != null || f.toughness != null) out.add(f.json());
        return out;
    }

    /** As habilidades da carta: mágicas e ativadas (com as sub-habilidades), gatilhos (e o que executam) e estáticas. */
    private static List<Params> params(Card gc) {
        List<Params> out = new ArrayList<>();
        for (SpellAbility sa : gc.getSpellAbilities())
            for (SpellAbility s = sa; s != null; s = s.getSubAbility()) out.add(new Params(s.getMapParams(), s, false));
        for (Trigger t : gc.getTriggers()) {
            boolean entering = "ChangesZone".equals(t.getParam("Mode")) && "Battlefield".equals(t.getParam("Destination")) && "Card.Self".equals(t.getParam("ValidCard"));
            out.add(new Params(t.getMapParams(), t, false));
            SpellAbility ex = t.getOverridingAbility();
            if (ex != null) {
                for (SpellAbility s = ex; s != null; s = s.getSubAbility()) out.add(new Params(s.getMapParams(), s, entering));
                continue;
            }
            String name = t.getParam("Execute");
            for (int guard = 0; name != null && gc.hasSVar(name) && guard < 8; guard++) {
                Map<String, String> m = AbilityFactory.getMapParams(gc.getSVar(name));
                out.add(new Params(m, t, entering));
                name = m.get("SubAbility");
            }
        }
        for (StaticAbility st : gc.getStaticAbilities()) out.add(new Params(st.getMapParams(), st, false));
        return out;
    }

    private static String api(Map<String, String> m) {
        for (String k : new String[] {"SP", "AB", "DB"}) if (m.containsKey(k)) return m.get(k);
        return "";
    }

    /** Para que serve o número neste parâmetro, ou null quando ele não muda uma quantidade do efeito. */
    static String amountUse(String key, Map<String, String> m) {
        String api = api(m);
        switch (key) {
            case "NumDmg": return "damage";
            // Com "+", o número soma ao P/T (NumAtt, AddPower); sem, é o próprio P/T (SetPower, das criaturas */*).
            case "NumAtt": case "AddPower": return "power+";
            case "NumDef": case "AddToughness": return "toughness+";
            case "SetPower": return "power";
            case "SetToughness": return "toughness";
            case "LifeAmount": return api.equals("GainLife") ? "lifeGain" : api.equals("LoseLife") ? "lifeLoss" : "life";
            case "NumCards": return api.equals("Draw") ? "draw" : api.equals("Mill") ? "mill" : api.equals("Discard") ? "discard" : null;
            case "ChangeNum": return api.equals("Dig") ? "pick" : null;
            case "TokenAmount": return "tokens";
            case "CounterNum": return "counters";
            case "Amount":
                if ("ReduceCost".equals(m.get("Mode"))) return "costLess";
                if ("RaiseCost".equals(m.get("Mode"))) return "costMore";
                return api.equals("Mana") ? "mana" : null;
            default: return null;
        }
    }

    private static void inspect(Card gc, Params p, Map<String, Found> found) {
        for (Map.Entry<String, String> e : p.map().entrySet()) {
            String use = amountUse(e.getKey(), p.map());
            if (use != null && e.getValue() != null) amount(gc, p, use, e.getValue().trim(), found);
        }
        threshold(gc, p, p.map().get("CheckSVar"), p.map().get("SVarCompare"), found);
        threshold(gc, p, p.map().get("ConditionCheckSVar"), p.map().get("ConditionSVarCompare"), found);
    }

    private static void amount(Card gc, Params p, String use, String raw, Map<String, Found> found) {
        String sign = raw.startsWith("+") || raw.startsWith("-") ? raw.substring(0, 1) : "";
        String name = raw.substring(sign.length());
        if (use.endsWith("+")) { use = use.substring(0, use.length() - 1); if (sign.isEmpty()) sign = "+"; }
        Resolved r = resolve(gc, p.trait(), name, 0);
        if (r == null) return;
        Found f = found(gc, p, r, found);
        if (f == null) return;
        JsonObject u = new JsonObject();
        if (r.min() != null) {
            u.addProperty("use", "threshold");
            u.addProperty("min", r.min());
            f.use(u);
            return;
        }
        int counted = f.value;
        Integer with = p.entering() ? withSelf(gc, f, p.trait()) : null;
        if (with != null) { f.entering = with; counted = with; }
        int result = counted;
        for (String op : r.ops()) result = AbilityUtils.doXMath(result, op, gc, p.trait());
        if (use.equals("power")) { if (f.power == null) f.power = signed(sign, result); return; }
        if (use.equals("toughness")) { if (f.toughness == null) f.toughness = signed(sign, result); return; }
        u.addProperty("use", use);
        u.addProperty("amount", sign.equals("-") ? -result : result);
        if (r.ops().size() == 1 && r.ops().get(0).matches("Plus\\.\\d+")) u.addProperty("plus", Integer.parseInt(r.ops().get(0).substring(5)));
        if (use.startsWith("cost") && !"Card.Self".equals(p.map().get("ValidCard"))) u.addProperty("others", true);
        f.use(u);
    }
    private static String signed(String sign, int v) { return sign.isEmpty() ? String.valueOf(v) : (v < 0 ? String.valueOf(v) : sign + v); }

    /**
     * O valor quando a própria carta já estiver no campo, para um efeito de "quando esta carta entra" visto da mão ou da
     * pilha: Craterhoof Behemoth conta a si mesma entre as criaturas, Gray Merchant soma os próprios {B} à devoção.
     */
    private static Integer withSelf(Card gc, Found f, CardTraitBase trait) {
        if (gc.getZone() == null || gc.getZone().is(ZoneType.Battlefield)) return null;
        String of = f.of.get("of").getAsString();
        if (of.equals("devotion")) {
            byte color = 0;
            for (var letter : f.of.getAsJsonArray("colors")) color |= forge.card.mana.ManaAtom.fromName(letter.getAsString().charAt(0));
            int own = 0;
            for (forge.card.mana.ManaCostShard shard : gc.getManaCost()) if (shard.isColor(color)) own++;
            return own > 0 ? f.value + own : null;
        }
        if (!of.equals("cards") || f.valid == null || f.of.has("measure") || !"battlefield".equals(f.of.get("zone").getAsString())) return null;
        try { return gc.isValid(f.valid.split(","), gc.getController(), gc, trait) ? f.value + 1 : null; } catch (RuntimeException e) { return null; }
    }

    private static final Pattern COMPARE = Pattern.compile("(GE|GT|LT|LE)(\\d+)");
    /**
     * Contas que a mesa mostra por cima da contagem: com um número fixo ("Plus.2", "Twice"). Uma conta com outra variável
     * ("Plus.Y", Multani) somaria uma segunda contagem que o selo não diz, e um teto ("LimitMax.1") faz da contagem um
     * "tem ou não tem": nos dois casos a carta fica sem selo.
     */
    private static final Pattern SIMPLE_OP = Pattern.compile("(Plus|Minus|Times)\\.\\d+|Twice|Thrice|HalfUp|HalfDown|Negative");

    /** "Enquanto você tiver sete ou mais cartas na mão" (CheckSVar + SVarCompare): o mínimo que liga o efeito. */
    private static void threshold(Card gc, Params p, String svar, String compare, Map<String, Found> found) {
        if (svar == null || compare == null) return;
        Matcher m = COMPARE.matcher(compare);
        if (!m.matches()) return;
        Resolved r = resolve(gc, p.trait(), svar, 0);
        if (r == null || r.min() != null || !r.ops().isEmpty()) return;
        int n = Integer.parseInt(m.group(2));
        String use;
        int min;
        switch (m.group(1)) {
            case "GE": use = "threshold"; min = n; break;
            case "GT": use = "threshold"; min = n + 1; break;
            // Deuses de Theros: "enquanto sua devoção for menor que N, não é criatura".
            case "LT": { String removes = p.map().get("RemoveType"); if (removes == null || !removes.contains("Creature")) return; use = "creature"; min = n; break; }
            default: return;
        }
        Found f = found(gc, p, r, found);
        if (f == null) return;
        JsonObject u = new JsonObject();
        u.addProperty("use", use);
        u.addProperty("min", min);
        f.use(u);
    }

    private static Found found(Card gc, Params p, Resolved r, Map<String, Found> found) {
        Found f = found.get(r.base());
        if (f != null) return f;
        String[] valid = new String[1];
        JsonObject of = describe(gc, r.base(), valid);
        if (of == null) return null;
        f = new Found(r.base(), valid[0], of, p.trait());
        f.value = AbilityUtils.calculateAmount(gc, "Count$" + r.base(), p.trait());
        found.put(r.base(), f);
        return f;
    }

    /** Segue a variável até a contagem: "X" → "Count$ValidGraveyard Lesson.YouOwn/Plus.2"; "Y" → "SVar$X/Plus.1"; "Count$Compare Y GE3.3.1". */
    private static Resolved resolve(Card gc, CardTraitBase trait, String name, int depth) {
        if (depth > 6 || name.isEmpty()) return null;
        String value = name.contains("$") ? name : trait != null && trait.hasSVar(name) ? trait.getSVar(name) : gc.getSVar(name);
        if (value == null || value.isEmpty()) return null;
        if (value.startsWith("SVar$")) {
            String[] l = value.substring(5).split("/", 2);
            Resolved inner = resolve(gc, trait, l[0], depth + 1);
            if (inner == null || inner.min() != null) return null;
            List<String> ops = new ArrayList<>(inner.ops());
            if (l.length > 1) { if (!SIMPLE_OP.matcher(l[1]).matches()) return null; ops.add(l[1]); }
            return new Resolved(inner.base(), ops, null, null);
        }
        if (!value.startsWith("Count$")) return null;
        String body = value.substring(6);
        if (body.startsWith("Compare ")) {
            // Count$Compare <var> GE3.<se sim>.<se não>: o efeito muda a partir de 3.
            String[] parts = body.split("\\.")[0].split(" ");
            if (parts.length != 3) return null;
            Matcher m = COMPARE.matcher(parts[2]);
            if (!m.matches() || !(m.group(1).equals("GE") || m.group(1).equals("GT"))) return null;
            Resolved inner = resolve(gc, trait, parts[1], depth + 1);
            if (inner == null || inner.min() != null || !inner.ops().isEmpty()) return null;
            int n = Integer.parseInt(m.group(2));
            return new Resolved(inner.base(), List.of(), m.group(1).equals("GE") ? n : n + 1, m.group(1));
        }
        String[] l = body.split("/", 2);
        List<String> ops = new ArrayList<>();
        if (l.length > 1) { if (!SIMPLE_OP.matcher(l[1]).matches()) return null; ops.add(l[1]); }
        return new Resolved(l[0], ops, null, null);
    }

    private static final Map<String, String> MEASURES = Map.of(
        "CardPower", "power", "GreatestCardPower", "greatestPower", "CardToughness", "toughness", "GreatestCardToughness", "greatestToughness",
        "CardManaCost", "manaValue", "GreatestCardManaCost", "greatestManaValue", "CardTypes", "cardTypes", "DifferentCardNames", "names", "Colors", "colors");
    private static final Map<String, String> ZONE = Map.of("", "battlefield", "Battlefield", "battlefield", "Graveyard", "graveyard", "Exile", "exile", "Hand", "hand");

    /**
     * O que é contado, em dados para a mesa traduzir: {@code of} (cards, devotion, hand, life, domain) e, nas cartas,
     * {@code zone}, {@code whose} (you, opponents, all), {@code types} (alternativas: "Lesson", "Creature"),
     * {@code qualities} (other, token, nontoken, tapped, untapped, attacking, cores, non:Land, with:Flying, powerGE4) e
     * {@code measure} (power, greatestPower...). Null quando a mesa não sabe dizer o que é: aí a carta fica sem selo.
     */
    static JsonObject describe(Card gc, String base, String[] validOut) {
        JsonObject d = new JsonObject();
        String[] sq = base.split("\\.");
        if (sq[0].equals("Devotion") || sq[0].equals("DevotionDual") && sq.length >= 3) {
            if (sq.length < 2) return null;
            JsonArray colors = new JsonArray();
            for (int i = 1; i < (sq[0].equals("DevotionDual") ? 3 : 2); i++) {
                String color = sq[i].equals("Chosen") ? gc.getChosenColor() : sq[i];
                if (color == null || color.isEmpty()) return null;
                String letter = MagicColor.toShortString(color);
                if (letter == null || letter.isEmpty() || !"WUBRG".contains(letter)) return null;
                colors.add(letter);
            }
            d.addProperty("of", "devotion");
            d.add("colors", colors);
            return d;
        }
        switch (base) {
            case "CardsInYourHand": d.addProperty("of", "hand"); d.addProperty("whose", "you"); return d;
            case "YourLifeTotal": d.addProperty("of", "life"); return d;
            case "Domain": d.addProperty("of", "domain"); return d;
            default: break;
        }
        if (!base.startsWith("Valid")) return null;
        String[] lp = base.split(" ", 2);
        if (lp.length < 2) return null;
        String zone = ZONE.get(lp[0].substring(5));
        if (zone == null) return null;
        String[] vm = lp[1].split("\\$", 2);
        String measure = vm.length > 1 ? MEASURES.get(vm[1]) : null;
        if (vm.length > 1 && measure == null) return null;
        if (!valid(vm[0], d)) return null;
        // Na mão, só a quantidade de cartas: o tipo delas é segredo de quem as tem.
        if (zone.equals("hand")) {
            if (measure != null || d.getAsJsonArray("qualities").size() > 0 || !d.getAsJsonArray("types").toString().equals("[\"Card\"]")) return null;
            JsonObject hand = new JsonObject();
            hand.addProperty("of", "hand");
            hand.add("whose", d.get("whose"));
            return hand;
        }
        d.addProperty("of", "cards");
        d.addProperty("zone", zone);
        if (measure != null) d.addProperty("measure", measure);
        validOut[0] = vm[0];
        return d;
    }

    private static final Set<String> COLORS = Set.of("White", "Blue", "Black", "Red", "Green", "Colorless", "MultiColor");
    private static final Set<String> SUPERTYPES = Set.of("Legendary", "Snow", "Basic");
    private static final Pattern NUMBER_PROP = Pattern.compile("(power|toughness|cmc)(GE|LE|GT|LT|EQ)\\d+");

    /** "Lesson.YouOwn", "Creature.YouCtrl+Other", "Land.Forest+YouCtrl,Land.Island+YouCtrl": tipos, de quem e qualidades. */
    private static boolean valid(String valid, JsonObject d) {
        String whose = null;
        List<String> quals = null;
        JsonArray types = new JsonArray();
        for (String alt : valid.split(",")) {
            String[] tp = alt.split("\\.", 2);
            String type = tp[0], altWhose = "all", specific = null;
            if (!type.equals("Card") && !type.equals("Permanent") && !isType(type)) return false;
            List<String> q = new ArrayList<>();
            if (tp.length > 1) for (String prop : tp[1].split("\\+")) {
                switch (prop) {
                    case "YouCtrl": case "YouOwn": altWhose = "you"; continue;
                    case "OppCtrl": case "OppOwn": case "YouDontCtrl": case "YouDontOwn": altWhose = "opponents"; continue;
                    case "Other": case "StrictlyOther": q.add("other"); continue;
                    case "attacking": case "untapped": case "tapped": case "token": q.add(prop); continue;
                    case "!token": case "nonToken": q.add("nontoken"); continue;
                    default: break;
                }
                if (COLORS.contains(prop) || SUPERTYPES.contains(prop)) { q.add(prop.toLowerCase()); continue; }
                if (prop.startsWith("non") && prop.length() > 3 && (isType(prop.substring(3)) || SUPERTYPES.contains(prop.substring(3)))) { q.add("non:" + prop.substring(3)); continue; }
                if (prop.startsWith("with") && prop.length() > 4 && prop.substring(4).matches("[A-Z][a-z]+") && Keyword.smartValueOf(prop.substring(4)) != Keyword.UNDEFINED) { q.add("with:" + prop.substring(4)); continue; }
                if (NUMBER_PROP.matcher(prop).matches()) { q.add(prop); continue; }
                if (isType(prop) && specific == null) { specific = prop; continue; }
                return false;
            }
            if (whose == null) { whose = altWhose; quals = q; }
            else if (!whose.equals(altWhose) || !quals.equals(q)) return false;
            types.add(specific != null ? specific : type);
        }
        d.addProperty("whose", whose);
        d.add("types", types);
        JsonArray qualities = new JsonArray();
        for (String q : quals) qualities.add(q);
        d.add("qualities", qualities);
        return true;
    }
    private static boolean isType(String word) {
        try { return CardType.isACardType(word) || CardType.isASubType(word); } catch (RuntimeException e) { return false; }
    }

    /** A devoção sempre vai, mesmo quando o número não aparece num parâmetro conhecido (como antes do item 56). */
    private static void devotion(Card gc, Map<String, Found> found) {
        CardTraitBase trait = anyTrait(gc);
        if (trait == null) return;
        for (String value : gc.getSVars().values()) {
            if (!value.startsWith("Count$Devotion")) continue;
            String base = value.substring(6).split("/", 2)[0];
            if (found.containsKey(base)) continue;
            Found f = found(gc, new Params(Map.of(), trait, false), new Resolved(base, List.of(), null, null), found);
            if (f == null) continue;
            JsonObject u = new JsonObject();
            u.addProperty("use", "other");
            f.use(u);
        }
    }
    private static CardTraitBase anyTrait(Card gc) {
        for (SpellAbility sa : gc.getSpellAbilities()) return sa;
        for (StaticAbility st : gc.getStaticAbilities()) return st;
        for (Trigger t : gc.getTriggers()) return t;
        return null;
    }
}
