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
            {"archidekt", "12?x=1"}, {"archidekt", "abc"}, {"moxfield", null}, {null, "1"} };
        for (String[] input : bad) assertThrows(IllegalArgumentException.class, () -> DeckLinks.uri(input[0], input[1]));
    }

    @Test public void buildsTheEdhrecAverageDeckAddressFromAValidatedSlug() {
        assertEquals("https://json.edhrec.com/pages/average-decks/atraxa-praetors-voice.json", DeckLinks.uri("edhrec", "atraxa-praetors-voice").toString());
        assertEquals("https://json.edhrec.com/pages/average-decks/kraum-ludevics-opus-tymna-the-weaver.json", DeckLinks.uri("edhrec", "kraum-ludevics-opus-tymna-the-weaver").toString());
        assertEquals("https://json.edhrec.com/pages/average-decks/atraxa-praetors-voice/budget.json", DeckLinks.uri("edhrec", "atraxa-praetors-voice/budget").toString());
    }

    @Test public void refusesEdhrecSlugsThatCouldLeaveTheAverageDecks() {
        String[] bad = { "", "Atraxa", "atraxa praetors", "../commanders/x", "a/b/c", "a//b", "-atraxa", "atraxa-", "a--b", "x.json", "x?y=1", "x#y",
            "%2e%2e", "lim-dûl", "a".repeat(161), null };
        for (String slug : bad) assertThrows(slug, IllegalArgumentException.class, () -> DeckLinks.uri("edhrec", slug));
    }

    @Test public void followsOnlyEdhrecRedirectsToAnotherValidAverageDeck() {
        assertEquals("kraum-ludevics-opus-tymna-the-weaver", DeckLinks.edhrecRedirect("{\"redirect\":\"/average-decks/kraum-ludevics-opus-tymna-the-weaver\"}"));
        assertNull(DeckLinks.edhrecRedirect("{\"deck\":{\"cards\":{}},\"header\":\"Average Deck\"}"));
        assertNull(DeckLinks.edhrecRedirect("<Error>AccessDenied</Error>"));
        assertThrows(IllegalArgumentException.class, () -> DeckLinks.edhrecRedirect("{\"redirect\":\"https://evil.example/x\"}"));
        assertThrows(IllegalArgumentException.class, () -> DeckLinks.edhrecRedirect("{\"redirect\":\"/average-decks/../../x\"}"));
    }
}
