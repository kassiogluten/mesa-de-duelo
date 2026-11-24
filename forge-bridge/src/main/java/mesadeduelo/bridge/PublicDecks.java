package mesadeduelo.bridge;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Stream;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * Decks públicos: o jogador com conta publica um deck dela e ganha um código curto, que vira o link /d/CÓDIGO da mesa.
 *
 * Cada deck público é um arquivo {@code <dir>/<código>.json} com {codigo, conta, deckId, autor, deck, publicadoEm,
 * atualizadoEm}. A cópia acompanha o deck da conta: a cada sincronia que muda o deck, {@link Accounts} chama
 * {@link #refresh}; apagar o deck (ou a conta) tira do ar. Quem abre o link (GET /api/deck/publico/CÓDIGO, sem
 * login) recebe só o deck e o apelido de quem publicou, nunca a conta nem o id do deck.
 */
final class PublicDecks {
    static final int MAX_PER_ACCOUNT = 50;
    static final int CODE_LENGTH = 8;
    /** Sem 0/O, 1/l/I: o código também é lido e digitado. */
    private static final String ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
    /** Só os campos que dizem como o deck é; o resto (importação, rascunho, ids) fica na conta. */
    private static final String[] DECK_FIELDS = {"name", "format", "cards", "sideboard", "commanders", "bracket", "cover", "tokens", "updatedAt"};

    private record Key(String account, String deckId) { }

    private final Path dir;
    private final SecureRandom random = new SecureRandom();
    private final Map<Key, String> codes = new HashMap<>();

    PublicDecks(Path dir) throws IOException {
        this.dir = dir;
        Files.createDirectories(dir);
        try (Stream<Path> files = Files.list(dir)) {
            for (Path f : (Iterable<Path>) files.filter(p -> p.getFileName().toString().endsWith(".json"))::iterator) {
                try {
                    JsonObject o = JsonParser.parseString(Files.readString(f)).getAsJsonObject();
                    codes.put(new Key(o.get("conta").getAsString(), o.get("deckId").getAsString()), o.get("codigo").getAsString());
                } catch (IOException | RuntimeException e) {
                    Log.bridge().warn("Decks públicos: arquivo ilegível " + f.getFileName() + " (" + e + ")");
                }
            }
        }
    }

    Path dir() { return dir; }
    synchronized int count() { return codes.size(); }

    static boolean validCode(String code) {
        if (code == null || code.length() != CODE_LENGTH) return false;
        for (char c : code.toCharArray()) if (ALPHABET.indexOf(c) < 0) return false;
        return true;
    }

    /** Os decks públicos da conta: id do deck → código. */
    synchronized Map<String, String> codes(String account) {
        Map<String, String> out = new LinkedHashMap<>();
        codes.forEach((k, code) -> { if (k.account().equals(account)) out.put(k.deckId(), code); });
        return out;
    }

    /** Publica (ou atualiza) o deck e devolve o código, o mesmo se ele já era público. */
    synchronized String publish(String account, String deckId, JsonObject deck, String author, long now) throws IOException {
        Key key = new Key(account, deckId);
        String code = codes.get(key);
        String publishedAt = Instant.ofEpochMilli(now).toString();
        if (code == null) {
            if (codes(account).size() >= MAX_PER_ACCOUNT)
                throw new IllegalArgumentException("A conta já tem " + MAX_PER_ACCOUNT + " decks públicos. Deixe de compartilhar algum para compartilhar este.");
            do code = newCode(); while (Files.exists(file(code)));
        } else {
            JsonObject old = readFile(code);
            if (old != null && old.has("publicadoEm")) publishedAt = old.get("publicadoEm").getAsString();
        }
        JsonObject o = new JsonObject();
        o.addProperty("codigo", code);
        o.addProperty("conta", account);
        o.addProperty("deckId", deckId);
        if (author != null) o.addProperty("autor", author);
        o.add("deck", publicDeck(deck));
        o.addProperty("publicadoEm", publishedAt);
        o.addProperty("atualizadoEm", Instant.ofEpochMilli(now).toString());
        write(code, o);
        codes.put(key, code);
        return code;
    }

    /** Tira o deck do ar; devolve se ele era público. */
    synchronized boolean unpublish(String account, String deckId) throws IOException {
        String code = codes.remove(new Key(account, deckId));
        if (code == null) return false;
        Files.deleteIfExists(file(code));
        return true;
    }

    /** O deck da conta mudou: a cópia pública acompanha; {@code deck} null (apagado) tira do ar. */
    synchronized void refresh(String account, String deckId, JsonObject deck, String author, long now) throws IOException {
        if (!codes.containsKey(new Key(account, deckId))) return;
        if (deck == null) unpublish(account, deckId);
        else publish(account, deckId, deck, author, now);
    }

    /** A conta foi apagada: todos os decks dela saem do ar. */
    synchronized void forget(String account) throws IOException {
        for (String deckId : codes(account).keySet()) unpublish(account, deckId);
    }

    /** O que quem abre o link recebe: {codigo, autor, deck, publicadoEm, atualizadoEm}; null se não está no ar. */
    synchronized JsonObject read(String code) throws IOException {
        if (!validCode(code)) return null;
        JsonObject o = readFile(code);
        if (o == null) return null;
        JsonObject out = new JsonObject();
        for (String k : new String[]{"codigo", "autor", "deck", "publicadoEm", "atualizadoEm"}) if (o.has(k)) out.add(k, o.get(k));
        return out;
    }

    static JsonObject publicDeck(JsonObject deck) {
        JsonObject out = new JsonObject();
        for (String k : DECK_FIELDS) if (deck.has(k)) out.add(k, deck.get(k).deepCopy());
        return out;
    }

    private String newCode() {
        StringBuilder b = new StringBuilder(CODE_LENGTH);
        for (int i = 0; i < CODE_LENGTH; i++) b.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        return b.toString();
    }

    private Path file(String code) { return dir.resolve(code + ".json"); }

    private JsonObject readFile(String code) throws IOException {
        Path f = file(code);
        if (!Files.isRegularFile(f)) return null;
        JsonElement e = JsonParser.parseString(Files.readString(f));
        return e.isJsonObject() ? e.getAsJsonObject() : null;
    }

    private void write(String code, JsonObject o) throws IOException {
        Path tmp = Files.createTempFile(dir, ".gravando-", ".tmp");
        try {
            Files.writeString(tmp, o.toString());
            Files.move(tmp, file(code), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } finally {
            Files.deleteIfExists(tmp);
        }
    }
}
