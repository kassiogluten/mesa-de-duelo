package mesadeduelo.bridge;

import static org.junit.Assert.*;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import forge.game.Game;
import forge.game.card.Card;
import forge.game.cost.Cost;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import forge.gamemodes.net.ProtocolMethod;
import org.junit.BeforeClass;
import org.junit.Test;

public class NumberChoiceTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static JsonObject json(String s) { return JsonParser.parseString(s).getAsJsonObject(); }

    @Test public void theRangeOfGetIntegerBecomesACounterWithoutAnUpperLimitWhenThereIsNone() {
        JsonObject q = new JsonObject();
        List<Object> options = new ArrayList<>();
        assertTrue(NumberChoice.describe(q, List.of(new NumberChoice.Range(0, Integer.MAX_VALUE)), 0, options, null));
        assertEquals("number", q.get("kind").getAsString());
        assertEquals(0, q.get("min").getAsInt());
        assertFalse("sem teto", q.has("max"));
        assertFalse("sem como desistir fora de jogar uma mágica", q.has("cancel"));

        JsonObject finite = new JsonObject();
        assertTrue(NumberChoice.describe(finite, List.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10), 1, new ArrayList<>(), null));
        assertEquals(1, finite.get("min").getAsInt());
        assertEquals(10, finite.get("max").getAsInt());
        assertFalse(finite.has("values"));

        JsonObject loose = new JsonObject();
        assertTrue(NumberChoice.describe(loose, List.of(6, 2, 4), 1, new ArrayList<>(), null));
        assertEquals("[2,4,6]", loose.get("values").toString());

        assertFalse("texto não é número", NumberChoice.describe(new JsonObject(), List.of(1, "...") , 0, new ArrayList<>(), null));
        assertFalse("um inteiro só não é escolha", NumberChoice.describe(new JsonObject(), List.of(3), 1, new ArrayList<>(), null));
    }

    @Test public void theAnswerIsTheNumberWithinTheRangeOrNothingWhenTheSpellCanBeCancelled() {
        JsonObject q = new JsonObject();
        List<Object> options = new ArrayList<>();
        NumberChoice.describe(q, List.of(new NumberChoice.Range(0, Integer.MAX_VALUE)), 0, options,
            new NumberChoice.Context("x", "spell", null, "{R}", "{1}", 8));
        var question = new QuestionBroker.Question(1, ProtocolMethod.getChoices, new Object[0], options, new CompletableFuture<>(), q);
        assertEquals(List.of(37), NumberChoice.answer(question, json("{\"number\":37}")));
        assertEquals(List.of(), NumberChoice.answer(question, json("{\"indices\":[]}")));
        assertThrows(IllegalArgumentException.class, () -> NumberChoice.answer(question, json("{\"number\":-1}")));
        assertThrows(IllegalArgumentException.class, () -> NumberChoice.answer(question, json("{\"number\":2.5}")));

        JsonObject loose = new JsonObject();
        List<Object> looseOptions = new ArrayList<>();
        NumberChoice.describe(loose, List.of(2, 4, 6), 1, looseOptions, null);
        var looseQuestion = new QuestionBroker.Question(2, ProtocolMethod.getChoices, new Object[0], looseOptions, new CompletableFuture<>(), loose);
        assertEquals(List.of(4), NumberChoice.answer(looseQuestion, json("{\"number\":4}")));
        assertThrows(IllegalArgumentException.class, () -> NumberChoice.answer(looseQuestion, json("{\"number\":3}")));
        assertThrows("sem desistir, precisa de um número", IllegalArgumentException.class, () -> NumberChoice.answer(looseQuestion, json("{\"indices\":[]}")));
    }

    @Test public void theXOfASpellCarriesTheRestOfTheCostTheCostOfEachXAndTheManaAvailable() {
        Game game = TestGames.empty(); Player me = game.getPlayers().get(0);
        for (int i = 0; i < 5; i++) TestGames.add(game, "Mountain", me, ZoneType.Battlefield);
        Card fireball = TestGames.add(game, "Fireball", me, ZoneType.Hand);
        var sa = fireball.getFirstSpellAbility(); sa.setActivatingPlayer(me);
        NumberChoice.Context ctx = NumberChoice.announcing(sa, "X", me);
        assertEquals("x", ctx.unit());
        assertEquals("spell", ctx.cancel());
        assertEquals("{R}", ctx.base());
        assertEquals("{1}", ctx.each());
        assertEquals(5, ctx.available());

        JsonObject q = new JsonObject();
        NumberChoice.describe(q, List.of(new NumberChoice.Range(0, Integer.MAX_VALUE)), 0, new ArrayList<>(), ctx);
        assertEquals("spell", q.get("cancel").getAsString());
        assertEquals("{1}", q.getAsJsonObject("cost").get("each").getAsString());
        assertEquals(5, q.getAsJsonObject("cost").get("available").getAsInt());
    }

    @Test public void multikickerAsksHowManyTimesToPayWithTheCostOfEachTime() {
        Game game = TestGames.empty(); Player me = game.getPlayers().get(0);
        for (int i = 0; i < 3; i++) TestGames.add(game, "Forest", me, ZoneType.Battlefield);
        Card pack = TestGames.add(game, "Gnarlid Pack", me, ZoneType.Hand);
        var sa = pack.getFirstSpellAbility(); sa.setActivatingPlayer(me);
        NumberChoice.Context ctx = NumberChoice.keywordCost(sa, new Cost("1 G", false), me);
        assertEquals("times", ctx.unit());
        assertEquals("{1}{G}", ctx.each());
        assertEquals("{1}{G}", ctx.base());
        assertEquals(3, ctx.available());
        assertTrue(ctx.title(), ctx.title().startsWith("Quantas vezes pagar"));
        assertNull("o multikicker não cancela a mágica", ctx.cancel());
    }
}
