package mesadeduelo.bridge;

import static org.junit.Assert.*;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import org.junit.Test;

public class AccountDecksTest {
    private static final long NOW = 1_800_000_000_000L;

    private static JsonObject deck(String id, String name, int bolts) {
        return JsonParser.parseString("{\"id\":\"" + id + "\",\"name\":\"" + name + "\",\"format\":\"pauper\",\"cards\":[{\"name\":\"Lightning Bolt\",\"count\":" + bolts + "}]}").getAsJsonObject();
    }

    private static JsonObject save(String id, long base, JsonObject deck) {
        JsonObject c = new JsonObject(); c.addProperty("id", id); c.addProperty("base", base); c.add("deck", deck); return c;
    }

    private static JsonObject remove(String id, long base) {
        JsonObject c = new JsonObject(); c.addProperty("id", id); c.addProperty("base", base); c.addProperty("apagar", true); return c;
    }

    private static JsonObject sync(JsonObject account, long now, JsonObject... changes) {
        JsonArray list = new JsonArray(); for (JsonObject c : changes) list.add(c);
        JsonObject body = new JsonObject(); body.add("mudancas", list);
        return AccountDecks.sync(account, body, now);
    }

    private static long revOf(JsonObject result, String key, int i) { return result.getAsJsonArray(key).get(i).getAsJsonObject().get("rev").getAsLong(); }

    @Test public void twoDevicesSeeEachOthersChangesAndConflictsComeBackWithTheAccountVersion() {
        JsonObject account = new JsonObject();
        JsonObject first = sync(account, NOW, save("a", 0, deck("a", "Burn", 4)), save("b", 0, deck("b", "Elfos", 4)));
        assertEquals(2, first.getAsJsonArray("aplicadas").size());
        assertEquals(2, first.get("rev").getAsLong());

        // Phone pulls everything, then edits "a" based on rev 1.
        JsonObject phone = AccountDecks.state(account, 0);
        assertEquals(2, phone.getAsJsonArray("decks").size());
        JsonObject edit = sync(account, NOW, save("a", 1, deck("a", "Burn", 3)));
        assertEquals(3, revOf(edit, "aplicadas", 0));

        // Laptop still thinks "a" is at rev 1: conflict, with the phone's version.
        JsonObject stale = sync(account, NOW, save("a", 1, deck("a", "Burn", 2)));
        assertEquals(0, stale.getAsJsonArray("aplicadas").size());
        JsonObject conflict = stale.getAsJsonArray("conflitos").get(0).getAsJsonObject();
        assertEquals(3, conflict.get("rev").getAsLong());
        assertEquals(3, conflict.getAsJsonObject("deck").getAsJsonArray("cards").get(0).getAsJsonObject().get("count").getAsInt());

        // Laptop pulls only what changed since rev 2.
        JsonArray changed = AccountDecks.state(account, 2).getAsJsonArray("decks");
        assertEquals(1, changed.size());
        assertEquals("a", changed.get(0).getAsJsonObject().get("id").getAsString());
        assertEquals(0, AccountDecks.state(account, 3).getAsJsonArray("decks").size());
    }

    @Test public void deletedDecksGoToTheTrashSyncAsDeletionsAndCanBeRestoredOrRecreated() {
        JsonObject account = new JsonObject();
        sync(account, NOW, save("a", 0, deck("a", "Burn", 4)));
        JsonObject gone = sync(account, NOW, remove("a", 1));
        assertEquals(2, revOf(gone, "aplicadas", 0));
        assertEquals("a fresh device does not get deletions", 0, AccountDecks.state(account, 0).getAsJsonArray("decks").size());
        JsonObject deletion = AccountDecks.state(account, 1).getAsJsonArray("decks").get(0).getAsJsonObject();
        assertTrue(deletion.get("apagado").getAsBoolean());
        assertFalse("no content in a deletion", deletion.has("deck"));

        JsonArray trash = AccountDecks.trash(account).getAsJsonArray("decks");
        assertEquals("Burn", trash.get(0).getAsJsonObject().getAsJsonObject("deck").get("name").getAsString());
        JsonObject back = AccountDecks.restore(account, "a");
        assertEquals(3, back.get("rev").getAsLong());
        assertEquals("Burn", back.getAsJsonObject("deck").get("name").getAsString());
        assertNull("not in the trash anymore", AccountDecks.restore(account, "a"));

        // Edit beats delete: an edit based on the deletion's rev brings the deck back.
        sync(account, NOW, remove("a", 3));
        JsonObject again = sync(account, NOW, save("a", 4, deck("a", "Burn", 1)));
        assertEquals(1, again.getAsJsonArray("aplicadas").size());
        assertEquals(0, AccountDecks.trash(account).getAsJsonArray("decks").size());
    }

    @Test public void theTrashEmptiesAfterThirtyDays() {
        JsonObject account = new JsonObject();
        sync(account, NOW, save("a", 0, deck("a", "Burn", 4)), save("b", 0, deck("b", "Elfos", 4)));
        sync(account, NOW, remove("a", 1));
        assertFalse(AccountDecks.purge(account, NOW + AccountDecks.TRASH_MILLIS));
        assertTrue(AccountDecks.purge(account, NOW + AccountDecks.TRASH_MILLIS + 1));
        assertEquals(1, account.getAsJsonArray("decks").size());
        assertEquals(0, AccountDecks.trash(account).getAsJsonArray("decks").size());
    }

    @Test public void aDeckTheAccountNeverHadComesBackAsDeleted() {
        JsonObject account = new JsonObject();
        JsonObject r = sync(account, NOW, save("x", 7, deck("x", "Burn", 4)));
        JsonObject conflict = r.getAsJsonArray("conflitos").get(0).getAsJsonObject();
        assertTrue(conflict.get("apagado").getAsBoolean());
        assertEquals(0, conflict.get("rev").getAsLong());
        assertEquals("resent from zero, it goes in", 1, sync(account, NOW, save("x", 0, deck("x", "Burn", 4))).getAsJsonArray("aplicadas").size());
    }

    @Test public void invalidDecksAndTheLimitAreRefusedWithAReasonWithoutStoppingTheRest() {
        JsonObject account = new JsonObject();
        JsonObject builtin = deck("p", "Pronto", 4); builtin.addProperty("builtin", true);
        JsonObject broken = deck("q", "Quebrado", 4); broken.getAsJsonArray("cards").get(0).getAsJsonObject().addProperty("count", 0);
        JsonObject r = sync(account, NOW, save("p", 0, builtin), save("q", 0, broken), save("r", 0, deck("outro", "Id trocado", 4)),
            save("s", 0, deck("s", "  ", 4)), save("ok", 0, deck("ok", "Burn", 4)));
        assertEquals(1, r.getAsJsonArray("aplicadas").size());
        assertEquals(4, r.getAsJsonArray("recusadas").size());
        assertEquals("Decks prontos não vão para a conta.", r.getAsJsonArray("recusadas").get(0).getAsJsonObject().get("motivo").getAsString());

        JsonObject full = new JsonObject();
        JsonObject[] many = new JsonObject[AccountDecks.MAX_DECKS];
        for (int i = 0; i < many.length; i++) many[i] = save("d" + i, 0, deck("d" + i, "Deck " + i, 4));
        assertEquals(AccountDecks.MAX_DECKS, sync(full, NOW, many).getAsJsonArray("aplicadas").size());
        JsonObject over = sync(full, NOW, save("mais", 0, deck("mais", "Mais um", 4)), save("d0", 1, deck("d0", "Deck 0 editado", 3)));
        assertEquals("editing still works at the limit", 1, over.getAsJsonArray("aplicadas").size());
        assertTrue(over.getAsJsonArray("recusadas").get(0).getAsJsonObject().get("motivo").getAsString().contains("300"));
    }
}
