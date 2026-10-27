package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.List;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

/** Estados que o motor já aplica e a mesa desenha: monarca, terrenos do turno, controle trocado, atiçada, regeneração e escolhas. */
public class TableStatusTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    @Test public void monarchAndLandPlaysReachThePlayer() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        JsonObject before = StateJson.player(me.getView(), true, game);
        assertFalse(before.has("monarch"));
        assertEquals(0, before.get("landsPlayed").getAsInt());
        assertEquals(1, before.get("maxLands").getAsInt());

        game.setMonarch(other); me.addLandPlayedThisTurn();
        assertFalse(StateJson.player(me.getView(), true, game).has("monarch"));
        assertTrue(StateJson.player(other.getView(), true, game).get("monarch").getAsBoolean());
        assertEquals(1, StateJson.player(me.getView(), true, game).get("landsPlayed").getAsInt());
    }

    @Test public void stolenGoadedShieldedPermanentCarriesItsStatus() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        Card bears = ExilePermissionsTest.add(game, "Grizzly Bears", me, ZoneType.Battlefield);
        JsonObject plain = StateJson.card(bears.getView(), game);
        for (String key : List.of("owner", "goadedBy", "shields", "chosen")) assertFalse(key, plain.has(key));

        bears.addTempController(other, game.getNextTimestamp());
        bears.addGoad(game.getNextTimestamp(), other);
        bears.incShieldCount(); bears.incShieldCount();
        JsonObject o = StateJson.card(bears.getView(), game);
        assertEquals(other.getId(), o.get("controller").getAsInt());
        assertEquals(me.getId(), o.get("owner").getAsInt());
        assertEquals(other.getId(), o.getAsJsonArray("goadedBy").get(0).getAsInt());
        assertEquals(2, o.get("shields").getAsInt());
    }

    @Test public void choicesMadeByTheCardAreListed() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        Card cavern = ExilePermissionsTest.add(game, "Cavern of Souls", me, ZoneType.Battlefield);
        cavern.setChosenType("Elf");
        cavern.setChosenColors(List.of("green"));
        cavern.addNamedCard("Lightning Bolt");
        cavern.setChosenPlayer(other);
        JsonObject ch = StateJson.card(cavern.getView(), game).getAsJsonObject("chosen");
        assertEquals("Elf", ch.getAsJsonArray("types").get(0).getAsString());
        assertEquals("green", ch.getAsJsonArray("colors").get(0).getAsString());
        assertEquals("Lightning Bolt", ch.getAsJsonArray("names").get(0).getAsString());
        assertEquals(other.getId(), ch.get("player").getAsInt());
    }

    @Test public void devotionCardsCarryTheCountAndTheGodThreshold() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0);
        Card bears = ExilePermissionsTest.add(game, "Grizzly Bears", me, ZoneType.Battlefield);
        assertFalse(StateJson.card(bears.getView(), game).has("devotion"));

        Card thassa = ExilePermissionsTest.add(game, "Thassa, God of the Sea", me, ZoneType.Battlefield);
        ExilePermissionsTest.add(game, "Merfolk of the Pearl Trident", me, ZoneType.Battlefield);
        JsonObject d = StateJson.card(thassa.getView(), game).getAsJsonObject("devotion");
        assertEquals("[\"U\"]", d.get("colors").toString());
        assertEquals(2, d.get("value").getAsInt());
        assertEquals(5, d.get("need").getAsInt());

        Card mogis = ExilePermissionsTest.add(game, "Mogis, God of Slaughter", me, ZoneType.Battlefield);
        JsonObject dual = StateJson.card(mogis.getView(), game).getAsJsonObject("devotion");
        assertEquals("[\"B\",\"R\"]", dual.get("colors").toString());
        assertEquals(2, dual.get("value").getAsInt());
        assertEquals(7, dual.get("need").getAsInt());

        Card merchant = ExilePermissionsTest.add(game, "Gray Merchant of Asphodel", me, ZoneType.Battlefield);
        JsonObject black = StateJson.card(merchant.getView(), game).getAsJsonObject("devotion");
        assertEquals(3, black.get("value").getAsInt());
        assertFalse(black.has("need"));
    }

    @Test public void spellsCastThisTurnAndCardsThatCountThem() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        assertFalse(StateJson.player(me.getView(), true, game).has("spellsCast"));
        for (Player caster : List.of(me, me, other)) {
            SpellAbility cast = ExilePermissionsTest.add(game, "Lightning Bolt", caster, ZoneType.Graveyard).getFirstSpellAbility();
            cast.setActivatingPlayer(caster);
            game.getStack().getSpellsCastThisTurn().add(cast);
        }
        assertEquals(2, StateJson.player(me.getView(), true, game).get("spellsCast").getAsInt());
        assertEquals(1, StateJson.player(other.getView(), true, game).get("spellsCast").getAsInt());

        Card grapeshot = ExilePermissionsTest.add(game, "Grapeshot", me, ZoneType.Hand);
        Card storm = ExilePermissionsTest.add(game, "Thousand-Year Storm", me, ZoneType.Battlefield);
        Card bears = ExilePermissionsTest.add(game, "Grizzly Bears", me, ZoneType.Battlefield);
        Card grapeshotInYard = ExilePermissionsTest.add(game, "Grapeshot", me, ZoneType.Graveyard);
        assertTrue(StateJson.card(grapeshot.getView(), game).get("countsSpells").getAsBoolean());
        assertTrue(StateJson.card(storm.getView(), game).get("countsSpells").getAsBoolean());
        assertFalse(StateJson.card(bears.getView(), game).has("countsSpells"));
        assertFalse("only where the count can matter", StateJson.card(grapeshotInYard.getView(), game).has("countsSpells"));
    }

    @Test public void blessingAndSpeedReachThePlayer() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0);
        JsonObject before = StateJson.player(me.getView(), true, game);
        assertFalse(before.has("blessing"));
        assertFalse(before.has("speed"));
        me.setBlessing(true, null);
        me.increaseSpeed(); me.increaseSpeed();
        JsonObject after = StateJson.player(me.getView(), true, game);
        assertTrue(after.get("blessing").getAsBoolean());
        assertEquals(2, after.get("speed").getAsInt());
    }

    @Test public void oneTimeStatesAreListed() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        Card bears = ExilePermissionsTest.add(game, "Grizzly Bears", me, ZoneType.Battlefield);
        Card elves = ExilePermissionsTest.add(game, "Llanowar Elves", me, ZoneType.Battlefield);
        assertFalse(StateJson.card(bears.getView(), game).has("states"));
        bears.setMonstrous(true); bears.setRenowned(true); bears.setSuspected(true);
        bears.setSaddled(true); bears.setSaddledByThisTurn(new forge.game.card.CardCollection(elves));
        bears.exert(); bears.detain(other); bears.setHarnessed(true); bears.setSolved(true);
        bears.setCrewedByThisTurn(new forge.game.card.CardCollection(elves));
        JsonObject o = StateJson.card(bears.getView(), game);
        List<String> states = new java.util.ArrayList<>();
        o.getAsJsonArray("states").forEach(e -> states.add(e.getAsString()));
        assertEquals(List.of("monstrous", "renowned", "suspected", "saddled", "crewed", "exerted", "detained", "harnessed", "solved"), states);
        assertEquals("Llanowar Elves", o.getAsJsonArray("saddledBy").get(0).getAsString());
        assertEquals("Llanowar Elves", o.getAsJsonArray("crewedBy").get(0).getAsString());
    }

    @Test public void battleCarriesWhoProtectsIt() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        Card battle = ExilePermissionsTest.add(game, "Invasion of Zendikar", me, ZoneType.Battlefield);
        battle.setProtectingPlayer(other);
        assertEquals(other.getId(), StateJson.card(battle.getView(), game).get("protector").getAsInt());
        Card bears = ExilePermissionsTest.add(game, "Grizzly Bears", me, ZoneType.Battlefield);
        assertFalse(StateJson.card(bears.getView(), game).has("protector"));
    }

    @Test public void foretoldCardShowsItsFaceOnlyToTheOwner() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        Card saw = ExilePermissionsTest.add(game, "Saw It Coming", me, ZoneType.Exile);
        saw.setForetold(true); saw.turnFaceDown(true);
        JsonObject theirs = StateJson.player(me.getView(), false, game).getAsJsonArray("exile").get(0).getAsJsonObject();
        assertTrue(theirs.get("faceDown").getAsBoolean());
        assertTrue(theirs.get("foretold").getAsBoolean());
        assertFalse(theirs.has("name"));
        JsonObject mine = StateJson.player(me.getView(), true, game).getAsJsonArray("exile").get(0).getAsJsonObject();
        assertFalse(mine.has("faceDown"));
        assertTrue(mine.get("foretold").getAsBoolean());
        assertEquals("Saw It Coming", mine.get("name").getAsString());
        assertEquals("{1}{U}{U}", mine.get("manaCost").getAsString());
        assertEquals("{1}{U}", mine.get("foretellCost").getAsString());
        assertTrue(StateJson.playableExile(game, me.getId()).contains(new com.google.gson.JsonPrimitive(saw.getId())));
        assertFalse(StateJson.playableExile(game, other.getId()).contains(new com.google.gson.JsonPrimitive(saw.getId())));
    }
}
