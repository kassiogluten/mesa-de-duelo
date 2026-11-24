package mesadeduelo.bridge;

import static org.junit.Assert.*;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class CardPrintsTest {
    @Rule public TemporaryFolder tmp = new TemporaryFolder();
    static final String BOLT = "4457ed35-7c10-48c8-9776-456485fdf070";
    private final AtomicLong now = new AtomicLong(1_800_000_000_000L);

    private static JsonObject print(String set, String cn, boolean digital) {
        return JsonParser.parseString("{\"set\":\"" + set.toUpperCase() + "\",\"collector_number\":\"" + cn + "\",\"set_name\":\"Série " + set + "\",\"released_at\":\"2020-01-01\","
            + "\"digital\":" + digital + ",\"rarity\":\"common\",\"artist\":\"Alguém\",\"border_color\":\"borderless\",\"frame_effects\":[\"showcase\"],"
            + "\"prices\":{\"usd\":null,\"usd_foil\":\"2.50\"},\"image_uris\":{\"small\":\"https://cards.scryfall.io/small/a.jpg\",\"normal\":\"https://cards.scryfall.io/normal/a.jpg\",\"art_crop\":\"https://cards.scryfall.io/art_crop/a.jpg\",\"png\":\"x\"}}").getAsJsonObject();
    }

    /** Scryfall falso: conta os pedidos e responde em duas páginas. */
    private static final class Fake implements CardDataCache.Scryfall {
        final List<String> asked = new ArrayList<>();
        boolean down;
        @Override public JsonObject get(String path) throws IOException {
            asked.add(path);
            if (down) throw new IOException("fora do ar");
            JsonObject page = new JsonObject();
            JsonArray data = new JsonArray();
            boolean first = path.endsWith("page=1");
            if (first) { data.add(print("m10", "146", false)); data.add(print("prm", "1", true)); }
            else data.add(print("lea", "161", false));
            page.add("data", data);
            page.addProperty("has_more", first);
            return page;
        }
        @Override public JsonObject post(String path, JsonObject body) { throw new UnsupportedOperationException(); }
    }

    private CardPrints prints(Fake fake) {
        return new CardPrints(tmp.getRoot().toPath(), fake, (name, set, cn) -> !set.equals("lea"), now::get, Executors.newSingleThreadExecutor());
    }

    @Test public void slimPrintKeepsWhatTheArtPickerShows() {
        JsonObject p = CardPrints.slimPrint(print("m10", "146", false));
        assertEquals("m10", p.get("set").getAsString());
        assertEquals("146", p.get("cn").getAsString());
        assertEquals("Série m10", p.get("setName").getAsString());
        assertEquals("2.50", p.get("usd").getAsString());
        assertFalse(p.getAsJsonObject("image").has("png"));
        assertNull("impressões só digitais ficam de fora", CardPrints.slimPrint(print("prm", "1", true)));
    }

    @Test public void onlyPrintsTheMatchKnowsAndOneScryfallSearchPerWeek() throws Exception {
        Fake fake = new Fake();
        CardPrints a = prints(fake);
        JsonArray first = a.list(BOLT, "Lightning Bolt").get().getAsJsonArray("impressoes");
        assertEquals(1, first.size());
        assertEquals("m10", first.get(0).getAsJsonObject().get("set").getAsString());
        assertEquals("duas páginas", 2, fake.asked.size());

        a.list(BOLT, "Lightning Bolt").get();
        prints(fake).list(BOLT, "Lightning Bolt").get();
        assertEquals("da memória e do disco, sem pedir de novo", 2, fake.asked.size());

        now.addAndGet(CardPrints.TTL + 1);
        fake.down = true;
        assertEquals("vencida e com o Scryfall fora, vale a guardada", 1, prints(fake).list(BOLT, "Lightning Bolt").get().getAsJsonArray("impressoes").size());
        assertEquals(3, fake.asked.size());
    }

    @Test public void badInputIsRefused() {
        CardPrints a = prints(new Fake());
        assertThrows(IllegalArgumentException.class, () -> a.list("não é id", "Lightning Bolt"));
        assertThrows(IllegalArgumentException.class, () -> a.list(BOLT, ""));
    }
}
