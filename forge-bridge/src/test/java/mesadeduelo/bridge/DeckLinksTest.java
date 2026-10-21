package mesadeduelo.bridge;

import static org.junit.Assert.*;
import org.junit.Test;

public class DeckLinksTest {
    @Test public void buildsOnlyTheTwoPublicApiAddresses() {
        assertEquals("https://api2.moxfield.com/v3/decks/all/AbC_12-x9", DeckLinks.uri("moxfield", "AbC_12-x9").toString());
        assertEquals("https://archidekt.com/api/decks/123456/", DeckLinks.uri("archidekt", "123456").toString());
    }

    @Test public void refusesOtherSitesAndIdsThatCouldChangeTheAddress() {
        String[][] bad = { {"example", "1"}, {"moxfield", "../../users"}, {"moxfield", "a/b"}, {"moxfield", "x@evil.com"},
            {"archidekt", "12?x=1"}, {"archidekt", "abc"}, {"edhrec", "atraxa-praetors-voice"}, {"moxfield", null}, {null, "1"} };
        for (String[] input : bad) assertThrows(IllegalArgumentException.class, () -> DeckLinks.uri(input[0], input[1]));
    }
}
