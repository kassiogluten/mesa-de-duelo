package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.ai.LobbyPlayerAi;
import forge.game.Game;
import forge.game.Match;
import forge.game.card.Card;
import forge.game.event.GameEventSpellResolved;
import forge.game.event.GameEventSpellRemovedFromStack;
import forge.game.event.GameEventTurnBegan;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.RegisteredPlayer;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

public class VisibleEventsTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }
    private static Game game() {
        var a = new RegisteredPlayer(Decks.build("pauper-brasa")).setPlayer(new LobbyPlayerAi("A", null));
        var b = new RegisteredPlayer(Decks.build("pauper-floresta")).setPlayer(new LobbyPlayerAi("B", null));
        Game game = new Match(new MatchConfig("pauper","bo1").rules(), List.of(a,b), "Events test").createGame();
        game.setNoGUIUser(); game.getPhaseHandler().devModeSet(PhaseType.MAIN1, game.getPlayers().get(0));
        return game;
    }
    private static SpellAbility spell(Game game, Player player, String name) {
        Card c=Card.fromPaperCard(DeckValidation.resolve(name),player);
        player.getZone(ZoneType.Hand).add(c); c.setZone(player.getZone(ZoneType.Hand));
        SpellAbility ability=c.getFirstSpellAbility(); ability.setActivatingPlayer(player); return ability;
    }
    @Test public void actualNestedCounterStackPreservesBothCastsAndOutcomes() {
        Game game=game(); AtomicLong version=new AtomicLong(); VisibleEvents events=new VisibleEvents(version::incrementAndGet,version::get); events.attach(game);
        Player a=game.getPlayers().get(0),b=game.getPlayers().get(1);
        SpellAbility bolt=spell(game,a,"Lightning Bolt"); bolt.getTargets().add(b); game.getStack().add(bolt);
        SpellAbility counter=spell(game,b,"Counterspell"); counter.getTargets().add(bolt); game.getStack().add(counter);
        game.getStack().resolveStack();
        var list=events.json(0).asList().stream().map(e->e.getAsJsonObject()).toList();
        assertEquals(2,list.stream().filter(e->"spell-cast".equals(e.get("type").getAsString())).count());
        JsonObject countered=list.stream().filter(e->"countered".equals(e.get("type").getAsString())).findFirst().orElseThrow();
        JsonObject resolved=list.stream().filter(e->"resolved".equals(e.get("type").getAsString())).findFirst().orElseThrow();
        assertEquals("Lightning Bolt",countered.getAsJsonObject("card").get("name").getAsString());
        assertEquals("Counterspell",resolved.getAsJsonObject("card").get("name").getAsString());
        assertTrue(countered.get("seq").getAsLong()<resolved.get("seq").getAsLong());
        assertEquals(0,resolved.getAsJsonObject("frame").getAsJsonArray("stack").size());
        assertEquals(20,b.getLife()); assertTrue(game.getStack().isEmpty());
    }
    @Test public void millReportsEachCardInOrderWithOwnerAndSource() {
        Game game=game(); VisibleEvents events=new VisibleEvents(()->{},()->1); events.attach(game);
        Player a=game.getPlayers().get(0),b=game.getPlayers().get(1);
        // Zone.add põe embaixo: o topo é a primeira carta da lista.
        for(String name:List.of("Forest","Llanowar Elves","Giant Growth")) {
            Card c=Card.fromPaperCard(DeckValidation.resolve(name),b); b.getZone(ZoneType.Library).add(c); c.setZone(b.getZone(ZoneType.Library));
        }
        SpellAbility scour=spell(game,a,"Thought Scour"); scour.getTargets().add(b); game.getStack().add(scour);
        game.getStack().resolveStack();
        var mills=events.json(0).asList().stream().map(e->e.getAsJsonObject()).filter(e->"mill".equals(e.get("type").getAsString())).toList();
        assertEquals(2,mills.size());
        assertEquals(List.of("Forest","Llanowar Elves"),mills.stream().map(e->e.getAsJsonObject("card").get("name").getAsString()).toList());
        for(JsonObject m:mills) {
            assertEquals(b.getId(),m.get("actor").getAsInt());
            assertEquals("Thought Scour",m.get("sourceName").getAsString());
            assertEquals("Library",m.get("from").getAsString()); assertEquals("Graveyard",m.get("to").getAsString());
            assertFalse(m.has("surveil")); assertTrue(m.has("frame"));
        }
    }
    @Test public void eachPlayerKeepsTheLengthOfTheirLatestFinishedTurn() throws InterruptedException {
        Game game=game(); VisibleEvents events=new VisibleEvents(()->{},()->1); events.attach(game);
        Player a=game.getPlayers().get(0),b=game.getPlayers().get(1);
        java.util.function.IntFunction<JsonObject> state=active->{
            JsonObject s=new JsonObject(); s.addProperty("activePlayer",active); s.addProperty("gameOver",false);
            JsonArray players=new JsonArray();
            for(Player p:List.of(a,b)) { JsonObject row=new JsonObject(); row.addProperty("id",p.getId()); players.add(row); }
            s.add("players",players); return s;
        };
        events.receive(new GameEventTurnBegan(a.getView(),1));
        JsonObject first=state.apply(a.getId()); events.addTurnTimes(first);
        assertTrue(first.has("turnElapsedMs"));
        for(var p:first.getAsJsonArray("players")) assertFalse(p.getAsJsonObject().has("lastTurnMs"));
        Thread.sleep(30);
        events.receive(new GameEventTurnBegan(b.getView(),2));
        JsonObject second=state.apply(b.getId()); events.addTurnTimes(second);
        JsonObject rowA=second.getAsJsonArray("players").get(0).getAsJsonObject(), rowB=second.getAsJsonArray("players").get(1).getAsJsonObject();
        assertTrue(rowA.get("lastTurnMs").getAsLong()>=30);
        assertFalse(rowB.has("lastTurnMs"));
        assertTrue(second.get("turnElapsedMs").getAsLong()<30);
        JsonObject over=state.apply(b.getId()); over.addProperty("gameOver",true); events.addTurnTimes(over);
        assertFalse(over.has("turnElapsedMs"));
        events.attach(game());
        JsonObject next=state.apply(a.getId()); events.addTurnTimes(next);
        assertFalse(next.has("turnElapsedMs")); assertFalse(next.getAsJsonArray("players").get(0).getAsJsonObject().has("lastTurnMs"));
    }
    @Test public void unknownRemovalDoesNotSwallowLaterResolution() {
        Game game=game(); VisibleEvents events=new VisibleEvents(()->{},()->1); events.attach(game);
        Player a=game.getPlayers().get(0),b=game.getPlayers().get(1);
        SpellAbility bolt=spell(game,a,"Lightning Bolt"); bolt.getTargets().add(b); game.getStack().add(bolt);
        events.receive(new GameEventSpellRemovedFromStack(bolt.getView()));
        events.receive(new GameEventSpellResolved(bolt,false));
        assertEquals(1,events.json(0).asList().stream().filter(e->"resolved".equals(e.getAsJsonObject().get("type").getAsString())).count());
    }
    @Test public void startersWorkForAiAndQuirionIsRejectedBeforeMatch() {
        for(String id:List.of("pauper-brasa","pauper-floresta")) {
            var result=DeckValidation.validateForAi(Decks.template(id),"pauper"); assertTrue(result.json().toString(),result.valid());
        }
        var template=Decks.template("pauper-floresta");
        template.getAsJsonArray("cards").get(1).getAsJsonObject().addProperty("name","Quirion Ranger");
        assertFalse(DeckValidation.validateForAi(template,"pauper").valid());
        assertTrue(DeckValidation.validate(template,"pauper").valid());
    }
}
