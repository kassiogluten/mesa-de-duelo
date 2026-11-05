package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import forge.deck.Deck;
import forge.deck.DeckSection;
import forge.game.Game;
import forge.game.GameRules;
import forge.game.GameState;
import forge.game.GameType;
import forge.item.PaperCard;

/**
 * Laboratório: sala de teste com dois assentos e a mesa montada à mão ({type:"lab-host", scenario}).
 *
 * O cenário vem da tela do Laboratório: por jogador, vida, veneno e as cartas de cada zona (no campo, virada, enjoo de
 * invocação, marcadores e a qual permanente está presa), de quem é o turno e em que etapa começa. Ele vira um
 * {@link GameState} do Forge, aplicado no começo do jogo, como num quebra-cabeça: sem cara ou coroa nem mulligan.
 *
 * O cenário chega de qualquer navegador, então tudo é conferido: nomes de carta que o Forge conhece, quantidades
 * limitadas, números pequenos e referências de "presa a" que apontam para outra carta do campo.
 */
final class Lab {
    static final int MAX_PER_ZONE = 250, MAX_CARDS = 1000, MAX_COUNTERS = 999, MAX_LIFE = 999_999;
    static final List<String> ZONES = List.of("hand", "library", "graveyard", "exile", "battlefield");
    /** Marcadores que a tela oferece (o nome do Forge). */
    static final List<String> COUNTERS = List.of("P1P1", "M1M1", "LOYALTY", "DEFENSE", "CHARGE", "LORE", "STUN", "SHIELD", "OIL", "TIME", "FADE", "AGE", "QUEST");
    /**
     * Etapas em que a partida pode começar: a etapa em que o Forge põe o jogo e até onde ele avança, rodando o começo
     * de cada etapa no caminho (a compra da etapa de compra, os gatilhos de "no começo do combate"...).
     */
    private static final Map<String, String[]> PHASES = new LinkedHashMap<>();
    static {
        PHASES.put("upkeep", new String[]{"UNTAP", "UPKEEP"});
        PHASES.put("draw", new String[]{"UNTAP", "DRAW"});
        PHASES.put("main1", new String[]{"MAIN1", null});
        PHASES.put("combat", new String[]{"MAIN1", "COMBAT_BEGIN"});
        PHASES.put("main2", new String[]{"MAIN2", null});
        PHASES.put("end", new String[]{"MAIN2", "END_OF_TURN"});
    }
    /** Carta que completa o grimório do deck que o Forge exige; o retrato troca todas as zonas no começo do jogo. */
    private static final String FILLER = "Wastes";

    final String state;
    final List<Deck> decks;

    private Lab(String state, List<Deck> decks) { this.state = state; this.decks = decks; }

    /** Regras do quebra-cabeça: o primeiro jogador começa, sem cara ou coroa nem mulligan. */
    static GameRules rules() {
        GameRules r = new GameRules(GameType.Puzzle);
        r.setGamesPerMatch(1);
        r.setPlayForAnte(false);
        r.setAllowCheatShuffle(false);
        return r;
    }

    /** Na thread do jogo (gancho do começo): aplica o cenário. */
    void apply(Game game) {
        GameState gs = new GameState();
        gs.parse(Arrays.asList(state.split("\n")));
        gs.applyToGame(game);
        // O GameState muda o turno sem avisar a vista do jogo, que é o que a mesa recebe.
        game.updateTurnForView();
        game.updatePhaseForView();
    }

    static Lab parse(JsonElement value) {
        if (value == null || !value.isJsonObject()) throw new IllegalArgumentException("Monte a mesa antes de criar a sala de teste.");
        JsonObject o = value.getAsJsonObject();
        JsonArray players = o.has("players") && o.get("players").isJsonArray() ? o.getAsJsonArray("players") : null;
        if (players == null || players.size() != 2) throw new IllegalArgumentException("O laboratório monta a mesa para dois jogadores.");
        int active = o.has("active") ? integer(o.get("active"), 0, 1, "Escolha de quem é o turno.") : 0;
        String phase = o.has("phase") && o.get("phase").isJsonPrimitive() ? o.get("phase").getAsString() : "main1";
        String[] steps = PHASES.get(phase);
        if (steps == null) throw new IllegalArgumentException("Etapa inicial desconhecida.");

        StringBuilder sb = new StringBuilder();
        sb.append("turn=2\n");
        sb.append("activeplayer=p").append(active).append('\n');
        sb.append("activephase=").append(steps[0]).append('\n');
        if (steps[1] != null) sb.append("activephaseadvance=").append(steps[1]).append('\n');
        List<Deck> decks = new ArrayList<>();
        int total = 0;
        // Ids do retrato para "presa a": jogador e posição no campo de cada carta.
        Map<String, Integer> ids = new LinkedHashMap<>();
        int next = 1;
        for (int p = 0; p < 2; p++) {
            JsonArray field = zone(players.get(p), "battlefield");
            for (int i = 0; i < field.size(); i++) ids.put(p + ":" + i, next++);
        }
        for (int p = 0; p < 2; p++) {
            if (!players.get(p).isJsonObject()) throw new IllegalArgumentException("Jogador " + (p + 1) + " inválido.");
            JsonObject player = players.get(p).getAsJsonObject();
            String who = "Jogador " + (p + 1);
            sb.append('p').append(p).append("life=").append(player.has("life") ? integer(player.get("life"), -MAX_LIFE, MAX_LIFE, who + ": vida inválida.") : 20).append('\n');
            int poison = player.has("poison") ? integer(player.get("poison"), 0, MAX_COUNTERS, who + ": marcadores de veneno inválidos.") : 0;
            if (poison > 0) sb.append('p').append(p).append("counters=POISON=").append(poison).append('\n');
            Deck deck = new Deck("Laboratório " + (p + 1));
            for (String zone : ZONES) {
                JsonArray cards = zone(player, zone);
                if (cards.size() > MAX_PER_ZONE) throw new IllegalArgumentException(who + ": no máximo " + MAX_PER_ZONE + " cartas em cada zona.");
                total += cards.size();
                if (total > MAX_CARDS) throw new IllegalArgumentException("No máximo " + MAX_CARDS + " cartas na mesa toda.");
                List<String> texts = new ArrayList<>();
                for (int i = 0; i < cards.size(); i++) {
                    JsonElement entry = cards.get(i);
                    JsonObject card = entry.isJsonObject() ? entry.getAsJsonObject() : new JsonObject();
                    String name = entry.isJsonPrimitive() ? entry.getAsString() : card.has("name") && card.get("name").isJsonPrimitive() ? card.get("name").getAsString() : "";
                    PaperCard pc = name.isBlank() ? null : DeckValidation.resolve(name);
                    if (pc == null) throw new IllegalArgumentException(who + ": carta desconhecida" + (name.isBlank() ? "." : ": " + name + "."));
                    deck.getOrCreate(DeckSection.Main).add(pc);
                    StringBuilder text = new StringBuilder(pc.getName());
                    if ("battlefield".equals(zone)) text.append(battlefield(card, pc, ids, p, i, who));
                    texts.add(text.toString());
                }
                // Zona vazia também vai: sem a linha, o Forge deixa nela o que já havia (a mão inicial de 7 cartas).
                sb.append('p').append(p).append(zone).append('=').append(String.join(";", texts)).append('\n');
            }
            int size = deck.getMain().countAll();
            if (size < 60) deck.getMain().add(DeckValidation.resolve(FILLER), 60 - size);
            decks.add(deck);
        }
        return new Lab(sb.toString(), List.copyOf(decks));
    }

    private static String battlefield(JsonObject card, PaperCard pc, Map<String, Integer> ids, int player, int index, String who) {
        StringBuilder sb = new StringBuilder();
        sb.append("|Id:").append(ids.get(player + ":" + index));
        if (bool(card, "tapped")) sb.append("|Tapped");
        if (bool(card, "sick")) sb.append("|SummonSick");
        Map<String, Integer> counters = new LinkedHashMap<>();
        if (card.has("counters") && card.get("counters").isJsonObject()) {
            for (Map.Entry<String, JsonElement> e : card.getAsJsonObject("counters").entrySet()) {
                String type = e.getKey().toUpperCase(Locale.ROOT);
                if (!COUNTERS.contains(type)) throw new IllegalArgumentException(who + ": marcador desconhecido em " + pc.getName() + ".");
                int n = integer(e.getValue(), 0, MAX_COUNTERS, who + ": quantidade de marcadores inválida em " + pc.getName() + ".");
                if (n > 0) counters.put(type, n);
            }
        }
        // Sem marcadores de lealdade (ou de defesa) a permanente morreria na hora: começa com os impressos.
        if (!counters.containsKey("LOYALTY")) {
            int loyalty = printed(pc.getRules().getInitialLoyalty());
            if (loyalty > 0) counters.put("LOYALTY", loyalty);
        }
        if (!counters.containsKey("DEFENSE")) {
            int defense = printed(pc.getRules().getDefense());
            if (defense > 0) counters.put("DEFENSE", defense);
        }
        if (!counters.isEmpty()) {
            List<String> parts = new ArrayList<>();
            counters.forEach((k, v) -> parts.add(k + "=" + v));
            sb.append("|Counters:").append(String.join(",", parts));
        }
        if (card.has("attachedTo") && card.get("attachedTo").isJsonObject()) {
            JsonObject to = card.getAsJsonObject("attachedTo");
            int p = integer(to.get("player"), 0, 1, who + ": " + pc.getName() + " presa a uma carta inválida.");
            int i = integer(to.get("index"), 0, MAX_PER_ZONE, who + ": " + pc.getName() + " presa a uma carta inválida.");
            Integer id = ids.get(p + ":" + i);
            if (id == null || (p == player && i == index)) throw new IllegalArgumentException(who + ": " + pc.getName() + " presa a uma carta inválida.");
            sb.append("|AttachedTo:").append(id);
        }
        return sb.toString();
    }

    private static int printed(String value) {
        if (value == null) return 0;
        try { return Integer.parseInt(value.strip()); } catch (NumberFormatException e) { return 0; }
    }

    private static JsonArray zone(JsonElement player, String zone) {
        if (!player.isJsonObject()) return new JsonArray();
        JsonElement v = player.getAsJsonObject().get(zone);
        if (v == null || v.isJsonNull()) return new JsonArray();
        if (!v.isJsonArray()) throw new IllegalArgumentException("Zona inválida: " + zone + ".");
        return v.getAsJsonArray();
    }

    private static boolean bool(JsonObject o, String key) {
        return o.has(key) && o.get(key).isJsonPrimitive() && o.get(key).getAsJsonPrimitive().isBoolean() && o.get(key).getAsBoolean();
    }

    private static int integer(JsonElement v, int min, int max, String error) {
        if (v == null || !v.isJsonPrimitive() || !v.getAsJsonPrimitive().isNumber()) throw new IllegalArgumentException(error);
        try {
            int n = v.getAsBigDecimal().intValueExact();
            if (n < min || n > max) throw new IllegalArgumentException(error);
            return n;
        } catch (ArithmeticException e) { throw new IllegalArgumentException(error); }
    }
}
