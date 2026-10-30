package mesadeduelo.bridge;

import static org.junit.Assert.*;

import java.io.StringReader;
import java.util.List;
import org.junit.Test;

public class CardTagsTest {
    // Cartas de mentira com o formato do Scryfall: oracle_id em forma de UUID.
    static final String OPT = "00000000-0000-0000-0000-000000000001", SERUM = "00000000-0000-0000-0000-000000000002",
            CONSIDER = "00000000-0000-0000-0000-000000000003", SHOCK = "00000000-0000-0000-0000-000000000004",
            OAT = "00000000-0000-0000-0000-000000000005", BOLT = "00000000-0000-0000-0000-000000000006";

    static String tag(String id, String slug, String parent, String... cards) {
        StringBuilder taggings = new StringBuilder();
        for (String c : cards) taggings.append(taggings.length() > 0 ? "," : "").append("{\"oracle_id\":\"").append(c).append("\",\"weight\":\"median\"}");
        return "{\"object\":\"tag\",\"id\":\"" + id + "\",\"slug\":\"" + slug + "\",\"parent_ids\":[" + (parent == null ? "" : "\"" + parent + "\"")
                + "],\"taggings\":[" + taggings + "]}";
    }

    static CardTags.Index sample() throws Exception {
        String jsonl = String.join("\n",
            tag("lib", "library-manipulation", null),
            tag("scry", "scry", "lib", OPT, SERUM),
            tag("surveil", "surveil", "lib", CONSIDER),
            tag("draw", "draw", null),
            tag("cantrip", "cantrip", "draw", OPT, SERUM, CONSIDER),
            tag("burn", "burn", null, SHOCK, BOLT),
            tag("names", "card-names", null),
            tag("three", "three-letter-name", "names", OPT, OAT),
            tag("err", "keyword-errata-scry", null, OPT, OAT));
        return CardTags.parse(new StringReader(jsonl));
    }

    @Test public void parentsMeetAndNameTagsAreIgnored() throws Exception {
        CardTags.Index idx = sample();
        // Oat só tem tag de nome e de errata: fica sem tags e não entra no índice.
        assertFalse(idx.has(OAT));
        List<CardTags.Match> ranked = CardTags.rank(idx, OPT, List.of(OAT, CONSIDER, SHOCK, SERUM, OPT), 10);
        assertEquals(List.of(SERUM, CONSIDER), ranked.stream().map(CardTags.Match::oracleId).toList());
        assertEquals(1.0, ranked.get(0).score(), 1e-9);
        // Consider não tem scry, mas surveil e scry se encontram em library-manipulation.
        assertTrue(ranked.get(1).tags().contains("library-manipulation"));
        assertTrue(ranked.get(1).score() > 0 && ranked.get(1).score() < 1);
    }

    @Test public void rareTagsWeighMore() throws Exception {
        CardTags.Index idx = sample();
        int scry = java.util.Arrays.asList(idx.slugs()).indexOf("scry"), cantrip = java.util.Arrays.asList(idx.slugs()).indexOf("cantrip");
        assertTrue(idx.weights()[scry] > idx.weights()[cantrip]);
        // A tag mais rara em comum vem primeiro na explicação.
        assertEquals("scry", CardTags.rank(idx, OPT, List.of(SERUM), 5).get(0).tags().get(0));
    }

    @Test public void limitAndBadInput() throws Exception {
        assertEquals(1, CardTags.rank(sample(), OPT, List.of(SERUM, CONSIDER), 1).size());
        assertTrue(CardTags.ignoredSlug("type-errata"));
        assertTrue(CardTags.ignoredSlug("cycle"));
        assertFalse(CardTags.ignoredSlug("removal"));
        assertThrows(IllegalArgumentException.class, () -> CardTags.similar("../x", List.of(), 5));
    }

    @Test public void readsAJsonArrayToo() throws Exception {
        CardTags.Index idx = CardTags.parse(new StringReader("[" + tag("c", "cantrip", null, OPT, SERUM) + "]"));
        assertTrue(idx.has(OPT) && idx.has(SERUM));
    }
}
