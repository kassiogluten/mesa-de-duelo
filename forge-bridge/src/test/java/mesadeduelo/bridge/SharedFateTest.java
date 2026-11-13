package mesadeduelo.bridge;

import static org.junit.Assert.*;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import org.junit.Test;

/** Shared Fate: a carta exilada virada para baixo do grimório do oponente só mostra a face para quem a exilou. */
public class SharedFateTest {
    private static JsonObject cardIn(JsonObject state, Player owner, String zone, int id) {
        for (var row : state.getAsJsonArray("players")) {
            var p = row.getAsJsonObject();
            if (p.get("id").getAsInt() != owner.getId()) continue;
            for (var c : p.getAsJsonArray(zone)) if (c.getAsJsonObject().get("id").getAsInt() == id) return c.getAsJsonObject();
        }
        throw new AssertionError("card " + id + " not in " + zone);
    }

    @Test public void exilerSeesAndMayPlayTheCardButItsOwnerDoesNot() {
        Game game = TestGames.empty(); game.setAge(forge.game.GameStage.Play);
        Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        TestGames.add(game, "Forest", me, ZoneType.Library);
        TestGames.add(game, "Lightning Bolt", other, ZoneType.Library); // topo
        TestGames.add(game, "Mountain", other, ZoneType.Library);
        game.getAction().moveToPlay(TestGames.add(game, "Shared Fate", me, ZoneType.Hand), null, null);
        game.getAction().checkStaticAbilities();

        VisibleEvents events = new VisibleEvents(() -> {}, () -> 1); events.attach(game);
        me.drawCard();
        game.getAction().checkStaticAbilities();

        assertEquals("a compra virou exílio", 0, me.getCardsIn(ZoneType.Hand).size());
        var exiled = other.getCardsIn(ZoneType.Exile);
        assertEquals(1, exiled.size());
        Card card = exiled.get(0);
        assertEquals("Lightning Bolt", card.getState(forge.card.CardStateName.Original).getName());
        assertTrue(card.isFaceDown());

        // Quem exilou (eu) vê a face e pode jogá-la.
        var mine = cardIn(StateJson.game(game.getView(), me.getId(), game), other, "exile", card.getId());
        assertTrue(mine.get("faceDown").getAsBoolean());
        assertFalse(mine.has("name"));
        assertEquals("Lightning Bolt", mine.getAsJsonObject("hiddenFace").get("name").getAsString());
        assertEquals(1, StateJson.playableExile(game, me.getId()).size());

        // O dono da carta (o oponente) não vê nem pode jogar.
        var theirs = cardIn(StateJson.game(game.getView(), other.getId(), game), other, "exile", card.getId());
        assertTrue(theirs.get("faceDown").getAsBoolean());
        assertFalse(theirs.has("name"));
        assertFalse(theirs.has("hiddenFace"));
        assertEquals(0, StateJson.playableExile(game, other.getId()).size());

        // Em nada que o dono recebe (estado, registro da partida, eventos) aparece o nome da carta.
        String owner = StateJson.game(game.getView(), other.getId(), game).toString();
        assertFalse("estado do dono: " + owner, owner.contains("Lightning Bolt"));
        String log = StateJson.game(game.getView(), other.getId(), game).getAsJsonArray("log").toString();
        assertFalse("registro: " + log, log.contains("Lightning Bolt"));
        String seen = events.json(0).toString();
        assertFalse("eventos: " + seen, seen.contains("Lightning Bolt"));

        // Espectador também não.
        assertFalse(cardIn(StateJson.game(game.getView(), -2, game), other, "exile", card.getId()).has("hiddenFace"));
    }
}
