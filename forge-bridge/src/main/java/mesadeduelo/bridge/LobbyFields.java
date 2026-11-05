package mesadeduelo.bridge;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import forge.deck.Deck;

/** Os campos das mensagens do lobby (nome, código, capa, bracket, visibilidade) e os decks que vêm nelas, já validados. */
final class LobbyFields {
    private LobbyFields() { }
    private static final int MAX_NAME = 24;

    static final class InvalidDeck extends IllegalArgumentException {
        final DeckValidation.Result result;
        final String target;
        InvalidDeck(DeckValidation.Result result, String target) { this.result = result; this.target = target; }
    }

    static Deck validated(JsonElement payload, String format, String target) {
        var result = "opponent".equals(target) ? DeckValidation.validateForAi(payload, format) : DeckValidation.validate(payload, format);
        if (!result.valid()) throw new InvalidDeck(result, target);
        return result.deck();
    }

    /** O deck de quem cria ou entra numa sala: sem deck, o jogador escolhe lá dentro. */
    static Deck optionalDeck(JsonElement payload, String format) {
        return payload == null || payload.isJsonNull() ? null : validated(payload, format, "deck");
    }

    static String deckName(Deck deck) { return deck == null ? "sem deck" : deck.getName(); }

    static Deck aiDeck(JsonElement opponent, MatchConfig config) {
        return opponent == null || opponent.isJsonNull()
            || (opponent.isJsonPrimitive() && "random".equals(opponent.getAsString()))
            ? Decks.random(config.format()) : validated(opponent, config.format(), "opponent");
    }

    /** Bracket do deck do computador: o que a mesa mandou junto do deck escolhido, ou o do deck pronto sorteado aqui. */
    static int aiBracket(JsonElement opponent, Deck deck) {
        return opponent != null && opponent.isJsonObject() ? bracket(opponent.getAsJsonObject()) : Decks.bracket(deck);
    }

    /** Sem o campo, ou com qualquer outro valor, a sala é privada, como sempre foi. */
    static boolean publicRoom(JsonObject msg) {
        JsonElement e = msg.get("visibility");
        return e != null && e.isJsonPrimitive() && "public".equals(e.getAsString());
    }

    static String name(JsonObject msg) {
        JsonElement e = msg.get("name");
        String n = e == null || e.isJsonNull() ? "" : e.getAsString().strip();
        if (n.isEmpty()) n = "Jogador";
        return n.length() > MAX_NAME ? n.substring(0, MAX_NAME) : n;
    }

    /** O nome que o jogador usa, mandado ao começar contra a IA (só para o histórico); null sem nome. */
    static String nick(JsonObject msg) {
        JsonElement e = msg.get("name");
        String n = e == null || !e.isJsonPrimitive() ? "" : e.getAsString().strip();
        if (n.isEmpty()) return null;
        return n.length() > MAX_NAME ? n.substring(0, MAX_NAME) : n;
    }

    static String cover(JsonObject msg) {
        JsonElement e = msg.get("cover");
        return e == null || !e.isJsonPrimitive() ? null : e.getAsString();
    }

    /** Bracket declarado pelo jogador (1 a 5); 0 sem bracket ou com qualquer outro valor. */
    static int bracket(JsonObject msg) {
        JsonElement e = msg.get("bracket");
        if (e == null || !e.isJsonPrimitive() || !e.getAsJsonPrimitive().isNumber()) return 0;
        double b = e.getAsDouble();
        return b >= 1 && b <= 5 && b == Math.floor(b) ? (int) b : 0;
    }

    static String code(JsonObject msg) {
        JsonElement e = msg.get("code");
        return e == null || e.isJsonNull() ? "" : e.getAsString().strip().toUpperCase();
    }

    /** Código escolhido por quem cria a sala: 4 letras ou números, ou null para a ponte sortear. */
    static String chosenCode(JsonObject msg) {
        String c = code(msg);
        if (c.isEmpty()) return null;
        if (!c.matches("[A-Z0-9]{4}")) throw new IllegalArgumentException("O código da sala precisa ter 4 letras ou números.");
        return c;
    }
}
