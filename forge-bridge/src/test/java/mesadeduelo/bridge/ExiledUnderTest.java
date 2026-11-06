package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.List;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.ability.AbilityUtils;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.trigger.TriggerType;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

public class ExiledUnderTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static JsonObject onField(Game game, Player viewer, Card card) {
        for (var row : StateJson.game(game.getView(), viewer.getId(), game).getAsJsonArray("players"))
            for (var c : row.getAsJsonObject().getAsJsonArray("battlefield"))
                if (c.getAsJsonObject().get("id").getAsInt() == card.getId()) return c.getAsJsonObject();
        throw new AssertionError("card " + card.getId() + " not on the battlefield");
    }

    /** Resolve o gatilho de entrar no campo direto, com o alvo dado (ou nenhum). */
    private static void enter(Game game, Card card, Player me, Card target) {
        game.getAction().moveToPlay(card, null, null);
        var trigger = card.getTriggers().stream().filter(t -> t.getMode() == TriggerType.ChangesZone).findFirst().orElseThrow();
        var ability = trigger.ensureAbility(); ability.setActivatingPlayer(me);
        if (target != null) ability.getTargets().add(target);
        AbilityUtils.resolve(ability);
        game.getAction().checkStaticAbilities();
    }

    @Test public void journeyToNowhereListsTheOpponentsCreatureItExiled() {
        Game game = TestGames.empty(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        TestGames.add(game, "Grizzly Bears", other, ZoneType.Battlefield);
        Card bear = other.getCardsIn(ZoneType.Battlefield).get(0);
        Card journey = TestGames.add(game, "Journey to Nowhere", me, ZoneType.Hand);
        enter(game, journey, me, bear);
        Card exiled = other.getCardsIn(ZoneType.Exile).get(0);
        assertEquals("Grizzly Bears", exiled.getName());
        // Os dois jogadores veem a ligação: a carta exilada é pública.
        for (Player viewer : List.of(me, other)) {
            var list = onField(game, viewer, journey).getAsJsonArray("exiling");
            assertNotNull(list); assertEquals(1, list.size()); assertEquals(exiled.getId(), list.get(0).getAsInt());
        }
        // A carta saiu do exílio (voltou, foi conjurada...): a ligação some.
        game.getAction().moveToHand(exiled, null, null);
        assertFalse(onField(game, me, journey).has("exiling"));
    }

    /** Ativa a habilidade de lealdade cuja descrição tem {@code text}, com o alvo dado, e a resolve direto. */
    private static void loyalty(Game game, Card walker, Player me, String text, Player target) {
        var ability = walker.getSpellAbilities().stream().filter(sa -> sa.getDescription().contains(text)).findFirst().orElseThrow();
        ability.setActivatingPlayer(me);
        if (target != null) ability.getTargets().add(target);
        AbilityUtils.resolve(ability);
        game.getAction().checkStaticAbilities();
    }

    @Test public void graveyardsExiledByAshiokDreamRenderAreNotUnderIt() {
        Game game = TestGames.empty(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        for (String name : List.of("Grizzly Bears", "Lightning Bolt", "Mountain")) TestGames.add(game, name, other, ZoneType.Graveyard);
        for (String name : List.of("Forest", "Forest", "Forest", "Forest", "Forest")) TestGames.add(game, name, other, ZoneType.Library);
        Card ashiok = TestGames.add(game, "Ashiok, Dream Render", me, ZoneType.Battlefield);
        loyalty(game, ashiok, me, "mills four", other);
        assertTrue("o cemitério do oponente foi exilado", other.getCardsIn(ZoneType.Exile).size() >= 3);
        // Exilar cemitérios não liga as cartas ao Ashiok: o texto dele não volta a falar delas.
        assertFalse(onField(game, me, ashiok).has("exiling"));
    }

    @Test public void cardsExiledFromTheLibraryStayUnderAshiokNightmareWeaver() {
        Game game = TestGames.empty(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        for (String name : List.of("Grizzly Bears", "Hill Giant", "Mountain")) TestGames.add(game, name, other, ZoneType.Library);
        Card ashiok = TestGames.add(game, "Ashiok, Nightmare Weaver", me, ZoneType.Battlefield);
        loyalty(game, ashiok, me, "Exile the top three", other);
        // Ele põe no campo as criaturas "exiled with Ashiok": as cartas exiladas continuam embaixo dele.
        var list = onField(game, me, ashiok).getAsJsonArray("exiling");
        assertNotNull(list); assertEquals(3, list.size());
    }

    @Test public void hideawayCardIsListedFaceDown() {
        Game game = TestGames.empty(); Player me = game.getPlayers().get(0);
        for (String name : List.of("Forest", "Llanowar Elves", "Giant Growth", "Lightning Bolt", "Mountain")) TestGames.add(game, name, me, ZoneType.Library);
        Card bridge = TestGames.add(game, "Mosswort Bridge", me, ZoneType.Hand);
        enter(game, bridge, me, null);
        Card hidden = me.getCardsIn(ZoneType.Exile).get(0);
        assertEquals(hidden.getId(), onField(game, me, bridge).getAsJsonArray("exiling").get(0).getAsInt());
    }

    @Test public void delvedCardsAreNotUnderTheCreature() {
        Game game = TestGames.empty(); Player me = game.getPlayers().get(0);
        Card angler = TestGames.add(game, "Gurmag Angler", me, ZoneType.Battlefield);
        Card food = TestGames.add(game, "Forest", me, ZoneType.Graveyard);
        Card delved = game.getAction().exile(food, null, null);
        angler.addDelved(delved); angler.addExiledCard(delved); delved.setExiledWith(angler);
        assertFalse(onField(game, me, angler).has("exiling"));
    }
}
