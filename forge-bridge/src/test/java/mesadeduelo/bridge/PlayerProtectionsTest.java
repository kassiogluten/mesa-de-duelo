package mesadeduelo.bridge;

import static org.junit.Assert.*;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.GameStage;
import forge.game.card.Card;
import forge.game.combat.Combat;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

/** A proteção do próprio jogador chega à mesa com o tipo, do que protege, a carta que a dá e até quando dura. */
public class PlayerProtectionsTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static Game game() { Game game = TestGames.empty(); game.setAge(GameStage.Play); return game; }
    private static JsonArray protections(Game game, Player p) {
        JsonObject o = StateJson.player(p.getView(), true, game);
        return o.has("protections") ? o.getAsJsonArray("protections") : new JsonArray();
    }
    private static VisibleEvents watch(Game game) {
        game.getAction().checkStaticAbilities();
        game.getTriggerHandler().resetActiveTriggers();
        VisibleEvents events = new VisibleEvents(() -> {}, () -> 1); events.attach(game);
        return events;
    }
    private static void resolveAll(Game game) {
        for (int i = 0; i < 12 && !game.getStack().isEmpty(); i++) {
            game.getStack().addAllTriggeredAbilitiesToStack();
            game.getStack().resolveStack();
            game.getAction().checkStateEffects(true);
        }
    }
    private static String text(JsonObject o, String key) { return o.has(key) ? o.get(key).getAsString() : null; }

    @Test public void withoutProtectionNothingIsSent() {
        Game game = game();
        assertFalse(StateJson.player(game.getPlayers().get(0).getView(), true, game).has("protections"));
    }

    @Test public void leylineGivesHexproofAndSaysWhere() {
        Game game = game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        TestGames.add(game, "Leyline of Sanctity", me, ZoneType.Battlefield);
        TestGames.add(game, "Ivory Mask", other, ZoneType.Battlefield);
        game.getAction().checkStaticAbilities();
        JsonArray mine = protections(game, me);
        assertEquals(1, mine.size());
        JsonObject hexproof = mine.get(0).getAsJsonObject();
        assertEquals("hexproof", text(hexproof, "kind"));
        assertNull(text(hexproof, "from"));
        assertEquals("Leyline of Sanctity", text(hexproof, "source"));
        assertNull(text(hexproof, "until"));
        JsonObject shroud = protections(game, other).get(0).getAsJsonObject();
        assertEquals("shroud", text(shroud, "kind"));
        assertEquals("Ivory Mask", text(shroud, "source"));
    }

    @Test public void teferisProtectionLastsUntilTheCastersNextTurn() {
        Game game = game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        watch(game);
        Card teferi = TestGames.add(game, "Teferi's Protection", me, ZoneType.Hand);
        SpellAbility sa = teferi.getFirstSpellAbility(); sa.setActivatingPlayer(me);
        game.getStack().add(sa);
        resolveAll(game);
        JsonArray mine = protections(game, me);
        assertEquals(1, mine.size());
        JsonObject all = mine.get(0).getAsJsonObject();
        assertEquals("protection", text(all, "kind"));
        assertEquals("everything", text(all, "from"));
        assertEquals("Teferi's Protection", text(all, "source"));
        assertEquals("next-turn", text(all, "until"));
        assertEquals(me.getId(), all.get("untilPlayer").getAsInt());
        assertEquals(0, protections(game, other).size());
    }

    @Test public void gildedLightLastsUntilEndOfTurn() {
        Game game = game(); Player me = game.getPlayers().get(0);
        watch(game);
        Card light = TestGames.add(game, "Gilded Light", me, ZoneType.Hand);
        SpellAbility sa = light.getFirstSpellAbility(); sa.setActivatingPlayer(me);
        game.getStack().add(sa);
        resolveAll(game);
        JsonObject shroud = protections(game, me).get(0).getAsJsonObject();
        assertEquals("shroud", text(shroud, "kind"));
        assertEquals("Gilded Light", text(shroud, "source"));
        assertEquals("turn", text(shroud, "until"));
        assertFalse(shroud.has("untilPlayer"));
    }

    @Test public void attackOnAProtectedPlayerIsHeldByTheProtection() {
        Game game = game(); Player a = game.getPlayers().get(0), b = game.getPlayers().get(1);
        Card bears = TestGames.add(game, "Grizzly Bears", a, ZoneType.Battlefield), wurm = TestGames.add(game, "Craw Wurm", a, ZoneType.Battlefield);
        Card wall = TestGames.add(game, "Wall of Omens", b, ZoneType.Battlefield);
        b.addChangedKeywords(java.util.List.of("Protection from everything"), java.util.List.of(), game.getNextTimestamp(), 0);
        VisibleEvents events = new VisibleEvents(() -> {}, () -> 1); events.attach(game);
        game.getPhaseHandler().devModeSet(PhaseType.COMBAT_DAMAGE, a);
        Combat combat = new Combat(a); game.getPhaseHandler().setCombat(combat);
        combat.addAttacker(bears, b); combat.addAttacker(wurm, b); combat.addBlocker(wurm, wall);
        for (Card attacker : combat.getAttackers()) combat.setBlocked(attacker, !combat.getBlockers(attacker).isEmpty());
        combat.orderBlockersForDamageAssignment();
        int life = b.getLife();
        combat.assignCombatDamage(false); combat.dealAssignedDamage();
        assertEquals(life, b.getLife());
        var held = events.json(0).asList().stream().map(e -> e.getAsJsonObject())
            .filter(e -> "damage".equals(e.get("type").getAsString()) && e.has("protection")).toList();
        assertEquals(1, held.size());
        JsonObject hit = held.get(0);
        assertEquals("Grizzly Bears", hit.getAsJsonObject("card").get("name").getAsString());
        assertEquals(-2, hit.get("delta").getAsInt());
        assertTrue(hit.get("prevented").getAsBoolean());
        assertTrue(hit.get("combat").getAsBoolean());
        assertEquals(b.getId(), hit.getAsJsonObject("targets").getAsJsonArray("players").get(0).getAsInt());
    }

    @Test public void hexproofDoesNotHoldAnAttack() {
        Game game = game(); Player a = game.getPlayers().get(0), b = game.getPlayers().get(1);
        Card bears = TestGames.add(game, "Grizzly Bears", a, ZoneType.Battlefield);
        TestGames.add(game, "Leyline of Sanctity", b, ZoneType.Battlefield);
        game.getAction().checkStaticAbilities();
        VisibleEvents events = new VisibleEvents(() -> {}, () -> 1); events.attach(game);
        game.getPhaseHandler().devModeSet(PhaseType.COMBAT_DAMAGE, a);
        Combat combat = new Combat(a); game.getPhaseHandler().setCombat(combat);
        combat.addAttacker(bears, b); combat.setBlocked(bears, false);
        int life = b.getLife();
        combat.assignCombatDamage(false); combat.dealAssignedDamage();
        assertEquals(life - 2, b.getLife());
        assertTrue(events.json(0).asList().stream().noneMatch(e -> e.getAsJsonObject().has("protection")));
    }
}
