package mesadeduelo.bridge;

import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import com.google.gson.JsonParser;

/**
 * Oathbreaker legality as a diff over the Commander snapshot (checked in, like it): the cards legal only in Oathbreaker
 * and the Commander cards it does not allow. Server validation never depends on a live API.
 */
final class OathbreakerLegality {
    private static final Map<String, String> ADDED = new HashMap<>();
    private static final Set<String> REMOVED = new HashSet<>();
    static {
        try (var stream = OathbreakerLegality.class.getResourceAsStream("/oathbreaker-legality.json")) {
            if (stream == null) throw new IllegalStateException("Missing Oathbreaker legality snapshot");
            var json = JsonParser.parseReader(new InputStreamReader(stream, StandardCharsets.UTF_8)).getAsJsonObject();
            for (var value : json.getAsJsonArray("added")) {
                var card = value.getAsJsonObject();
                String name = card.get("name").getAsString(), id = card.get("oracleId").getAsString();
                ADDED.put(key(name), id);
                for (String face : name.split(" // ")) if (!face.equals(name)) ADDED.putIfAbsent(key(face), id);
            }
            for (var value : json.getAsJsonArray("removed")) {
                String name = value.getAsString();
                REMOVED.add(key(name));
                for (String face : name.split(" // ")) REMOVED.add(key(face));
            }
        } catch (java.io.IOException e) { throw new IllegalStateException("Cannot load Oathbreaker legality snapshot", e); }
    }
    static String oracleId(String name) { return ADDED.get(key(name)); }
    static boolean permits(String name) { return ADDED.containsKey(key(name)) || (CommanderLegality.permits(name) && !REMOVED.contains(key(name))); }
    /** Nome em minúsculas, com as reticências do Forge ("All Good Things . . .") iguais às do Scryfall ("..."). */
    private static String key(String value) { return value.strip().toLowerCase(Locale.ROOT).replace(" . . .", "..."); }
    private OathbreakerLegality() { }
}
