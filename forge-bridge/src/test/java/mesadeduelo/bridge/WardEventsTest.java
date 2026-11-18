package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.List;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.GameStage;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

public class WardEventsTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static Card add(Game game, String name, Player owner, ZoneType zone) { return ExilePermissionsTest.add(game, name, owner, zone); }
    private static List<JsonObject> events(VisibleEvents events) {
        return events.json(0).asList().stream().map(e -> e.getAsJsonObject()).toList();
    }
    private static JsonObject first(List<JsonObject> all, String type, java.util.function.Predicate<JsonObject> also) {
        return all.stream().filter(e -> type.equals(e.get("type").getAsString()) && also.test(e)).findFirst().orElseThrow(() -> new AssertionError(type + " em " + all));
    }
    private static boolean flag(JsonObject e, String key) { return e.has(key) && e.get(key).getAsBoolean(); }

    /** O oponente mira a Aboleth Spawn (ward {2}) com um Lightning Bolt e resolve tudo. */
    private static List<JsonObject> boltTheSpawn(boolean boltLeavesFirst) {
        Game game = ExilePermissionsTest.game(); game.setAge(GameStage.Play);
        Player a = game.getPlayers().get(0), b = game.getPlayers().get(1);
        Card spawn = add(game, "Aboleth Spawn", a, ZoneType.Battlefield);
        game.getAction().checkStaticAbilities();
        game.getTriggerHandler().resetActiveTriggers();
        VisibleEvents events = new VisibleEvents(() -> {}, () -> 1); events.attach(game);
        var bolt = add(game, "Lightning Bolt", b, ZoneType.Hand).getFirstSpellAbility();
        bolt.setActivatingPlayer(b); bolt.getTargets().add(spawn); game.getStack().add(bolt);
        game.getStack().addAllTriggeredAbilitiesToStack();
        // Fora do ward (o controlador dos testes nunca paga): o Bolt sai da pilha antes de o ward resolver.
        if (boltLeavesFirst) game.getStack().remove(game.getStack().getInstanceMatchingSpellAbilityID(bolt));
        for (int i = 0; i < 10 && !game.getStack().isEmpty(); i++) {
            game.getStack().addAllTriggeredAbilitiesToStack();
            game.getStack().resolveStack();
        }
        return events(events);
    }

    @Test public void wardSaysWhatItAnsweredAndThatItHeld() {
        List<JsonObject> all = boltTheSpawn(false);
        JsonObject cast = first(all, "spell-cast", e -> true);
        JsonObject ward = first(all, "ability-activated", e -> flag(e, "ward"));
        assertTrue(flag(ward, "trigger"));
        assertEquals("Aboleth Spawn", ward.getAsJsonObject("card").get("name").getAsString());
        assertEquals(cast.get("stackId").getAsInt(), ward.get("wardAgainst").getAsInt());
        JsonObject countered = first(all, "countered", e -> e.get("stackId").getAsInt() == cast.get("stackId").getAsInt());
        JsonObject resolved = first(all, "resolved", e -> flag(e, "ward"));
        assertTrue("sem mana para pagar, o ward anula o Bolt", flag(resolved, "held"));
        assertTrue(countered.get("seq").getAsLong() < resolved.get("seq").getAsLong());
    }

    /** Pagar o custo e o alvo sair antes chegam iguais à mesa: o ward resolve sem anular nada. */
    @Test public void wardThatCounteredNothingDidNotHold() {
        List<JsonObject> all = boltTheSpawn(true);
        JsonObject resolved = first(all, "resolved", e -> flag(e, "ward"));
        assertFalse("o Bolt já tinha saído: o ward não anulou nada", flag(resolved, "held"));
        assertTrue(resolved.has("held"));
        assertTrue(first(all, "ability-activated", e -> flag(e, "ward")).has("wardAgainst"));
    }

    @Test public void otherTriggersAreNotWard() {
        List<JsonObject> all = boltTheSpawn(false);
        assertTrue(all.stream().filter(e -> "spell-cast".equals(e.get("type").getAsString())).noneMatch(e -> e.has("ward")));
    }
}
