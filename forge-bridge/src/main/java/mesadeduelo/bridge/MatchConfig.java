package mesadeduelo.bridge;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import forge.game.GameRules;
import forge.game.GameType;

/** Immutable, room-owned rules. Never mutate global Forge preferences per match. */
record MatchConfig(String format, String matchLength, int playerCount) {
    static final String ENGINE_VERSION = "2.0.16-SNAPSHOT+0b0f7ecc5111.mesa1";
    static final String RULES_VERSION = "standard-pauper-sacola50-commander-oathbreaker-precon-2026-11-04";

    static final java.util.List<String> FORMATS = java.util.List.of("free", "standard", "pauper", "sacola50", "commander", "oathbreaker", "precon");

    MatchConfig(String format, String matchLength) { this(format, matchLength, 2); }

    /** Commander e Precon: as regras do Commander (o Precon só restringe os decks aos pré-construídos oficiais). */
    boolean commander() { return "commander".equals(format) || precon(); }
    boolean precon() { return "precon".equals(format); }
    boolean oathbreaker() { return "oathbreaker".equals(format); }
    /** Commander, Precon e Oathbreaker: zona de comando, de dois a quatro jogadores e uma partida só. */
    boolean commandZone() { return commander() || oathbreaker(); }

    MatchConfig {
        if (!FORMATS.contains(format))
            throw new IllegalArgumentException("Formato não suportado.");
        if (!"bo1".equals(matchLength) && !"bo3".equals(matchLength))
            throw new IllegalArgumentException("Duração da partida não suportada.");
        boolean commandZone = "commander".equals(format) || "oathbreaker".equals(format) || "precon".equals(format);
        if (playerCount < 2 || playerCount > 4 || (!commandZone && playerCount != 2))
            throw new IllegalArgumentException("Escolha de dois a quatro jogadores para Commander, Precon e Oathbreaker; os demais formatos exigem dois.");
        if (commandZone && !"bo1".equals(matchLength))
            throw new IllegalArgumentException(("commander".equals(format) ? "Commander" : "precon".equals(format) ? "Precon" : "Oathbreaker") + " permite apenas uma partida, sem sideboard.");
    }

    static MatchConfig parse(JsonElement value) {
        if (value == null || !value.isJsonObject())
            throw new IllegalArgumentException("Escolha o formato e a duração da partida.");
        JsonObject o = value.getAsJsonObject();
        int count = 2;
        if (o.has("playerCount")) {
            JsonElement v = o.get("playerCount");
            if (!v.isJsonPrimitive() || !v.getAsJsonPrimitive().isNumber()) throw new IllegalArgumentException("Número de jogadores inválido.");
            try { count = v.getAsBigDecimal().intValueExact(); }
            catch (ArithmeticException e) { throw new IllegalArgumentException("Número de jogadores inválido."); }
        }
        // "undo" (a antiga escolha do Desfazer) ainda vem de versões anteriores e de diários antigos: é ignorado,
        // porque o Desfazer agora vale em toda partida.
        return new MatchConfig(string(o, "format"), string(o, "matchLength"), count);
    }

    static String string(JsonObject o, String key) {
        JsonElement v = o.get(key);
        if (v == null || !v.isJsonPrimitive() || !v.getAsJsonPrimitive().isString())
            throw new IllegalArgumentException("Campo inválido: " + key + ".");
        return v.getAsString();
    }

    GameRules rules() {
        GameRules r = new GameRules(GameType.Constructed);
        if (commander()) r.setAppliedVariants(java.util.Set.of(GameType.Commander));
        if (oathbreaker()) r.setAppliedVariants(java.util.Set.of(GameType.Oathbreaker));
        r.setGamesPerMatch("bo3".equals(matchLength) ? 3 : 1);
        r.setAISideboardingEnabled(true);
        r.setSideboardForAI(false);
        r.setPlayForAnte(false);
        r.setAllowCheatShuffle(false);
        return r;
    }

    JsonObject json() {
        JsonObject o = new JsonObject();
        o.addProperty("format", format);
        o.addProperty("matchLength", matchLength);
        if (commandZone()) o.addProperty("playerCount", playerCount);
        // Desfazer sempre ligado; o campo continua indo para as versões anteriores da mesa mostrarem o botão.
        o.addProperty("undo", true);
        return o;
    }

    static void versions(JsonObject o) {
        o.addProperty("rulesVersion", RULES_VERSION);
        o.addProperty("engineVersion", ENGINE_VERSION);
    }
}
