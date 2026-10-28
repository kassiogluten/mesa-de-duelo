package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.lang.reflect.Proxy;
import forge.game.Game;
import forge.game.ability.ApiType;
import forge.game.card.Card;
import forge.game.card.CardCollection;
import forge.game.card.CounterEnumType;
import forge.game.GameEntity;
import forge.util.collect.FCollection;
import forge.game.combat.Combat;
import forge.game.keyword.Keyword;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.InputBlock;
import forge.gamemodes.match.input.InputConfirm;
import forge.gamemodes.match.input.InputSelectCardsFromList;
import forge.gamemodes.match.input.InputSelectEntitiesFromList;
import forge.gui.FThreads;
import forge.gui.interfaces.IGuiGame;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import org.junit.BeforeClass;
import org.junit.Test;

public class InputContextTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }
    private static PlayerControllerHuman human(Game game, Player player) {
        PlayerControllerHuman human = new PlayerControllerHuman(game, player, new LobbyPlayerHuman("Test"));
        human.setGui((IGuiGame) Proxy.newProxyInstance(IGuiGame.class.getClassLoader(), new Class<?>[]{IGuiGame.class},
            (proxy, method, args) -> method.getReturnType() == boolean.class ? false : null));
        return human;
    }
    @Test public void exactPairOverridesSilentDefaultAndPublishesPendingAssignments() {
        Game game = ExilePermissionsTest.game(); Player attacking = game.getPlayers().get(0), defending = game.getPlayers().get(1);
        Card first = ExilePermissionsTest.add(game, "Raging Goblin", attacking, ZoneType.Battlefield);
        Card second = ExilePermissionsTest.add(game, "Raging Goblin", attacking, ZoneType.Battlefield);
        Card blocker = ExilePermissionsTest.add(game, "Grizzly Bears", defending, ZoneType.Battlefield);
        Combat combat = new Combat(attacking); game.getPhaseHandler().setCombat(combat);
        combat.addAttacker(first, defending); combat.addAttacker(second, defending);
        FThreads.invokeInEdtAndWait(() -> {
            InputBlock input = new InputBlock(human(game, defending), defending, combat);
            assertEquals(first.getId(), InputContext.blocking(input).get("selectedAttacker").getAsInt());
            assertTrue(InputContext.assignBlock(input, second.getId(), blocker.getId()));
            assertTrue(combat.isBlocking(blocker, second)); assertFalse(combat.isBlocking(blocker, first));
            var snapshot = StateJson.game(game.getView(), defending.getId(), game);
            var pair = snapshot.getAsJsonArray("combat").asList().stream().map(e -> e.getAsJsonObject())
                .filter(e -> e.get("attacker").getAsInt() == second.getId()).findFirst().orElseThrow();
            assertEquals(blocker.getId(), pair.getAsJsonArray("blockers").get(0).getAsInt());
            assertFalse("full-capacity blocker cannot silently switch targets", InputContext.assignBlock(input, first.getId(), blocker.getId()));
            assertTrue(InputContext.assignBlock(input, second.getId(), blocker.getId()));
            assertFalse(combat.isBlocking(blocker));
            assertTrue(InputContext.assignBlock(input, first.getId(), blocker.getId()));
        });
    }
    @Test public void illegalPairAndForeignCreatureDoNotSelectOrMutateCombat() {
        Game game = ExilePermissionsTest.game(); Player attacking = game.getPlayers().get(0), defending = game.getPlayers().get(1);
        Card flyer = ExilePermissionsTest.add(game, "Wind Drake", attacking, ZoneType.Battlefield);
        Card ground = ExilePermissionsTest.add(game, "Raging Goblin", attacking, ZoneType.Battlefield);
        Card blocker = ExilePermissionsTest.add(game, "Grizzly Bears", defending, ZoneType.Battlefield);
        Combat combat = new Combat(attacking); game.getPhaseHandler().setCombat(combat);
        combat.addAttacker(flyer, defending); combat.addAttacker(ground, defending);
        FThreads.invokeInEdtAndWait(() -> {
            InputBlock input = new InputBlock(human(game, defending), defending, combat);
            assertFalse(InputContext.assignBlock(input, flyer.getId(), blocker.getId()));
            assertFalse(InputContext.assignBlock(input, ground.getId(), flyer.getId()));
            assertFalse(InputContext.assignBlock(input, -1, blocker.getId()));
            assertTrue(combat.getAllBlockers().isEmpty());
            var row = InputContext.blocking(input).getAsJsonArray("legalAssignments").get(0).getAsJsonObject();
            assertEquals(1, row.getAsJsonArray("attackers").size());
            assertEquals(ground.getId(), row.getAsJsonArray("attackers").get(0).getAsInt());
        });
    }
    @Test public void onlyActualSuspendPlayConfirmationReceivesTypedContext() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0);
        Card rift = ExilePermissionsTest.add(game, "Rift Bolt", me, ZoneType.Exile);
        var ability = rift.getTriggers().stream().filter(t -> t.isKeyword(Keyword.SUSPEND)
            && t.getOverridingAbility().getApi() == ApiType.Play).findFirst().orElseThrow().getOverridingAbility();
        var human = human(game, me);
        var input = new InputConfirm(human, "Any localized message", "Yes", "No", true, rift.getView(), ability);
        assertEquals(rift.getId(), InputContext.suspendCast(input).getAsJsonObject("card").get("id").getAsInt());
        assertNull(InputContext.suspendCast(new InputConfirm(human, "Same message", "Yes", "No", true, rift.getView(), rift.getFirstSpellAbility())));
    }
    @Test public void selectedCardsTrackExactCopiesDeselectAndCancelWithoutAssumingSacrifice() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0);
        Card first = ExilePermissionsTest.add(game, "Mountain", me, ZoneType.Hand);
        Card second = ExilePermissionsTest.add(game, "Mountain", me, ZoneType.Hand);
        Card third = ExilePermissionsTest.add(game, "Mountain", me, ZoneType.Hand);
        FThreads.invokeInEdtAndWait(() -> {
            var human = human(game, me);
            var input = new InputSelectCardsFromList(human, 2, 3, new CardCollection(java.util.List.of(first, second, third)));
            assertEquals(2, InputContext.selection(input).get("min").getAsInt());
            assertEquals(3, InputContext.selection(input).get("max").getAsInt());
            assertTrue(input.selectCard(first, null, null)); assertTrue(input.selectCard(second, null, null));
            assertEquals(2, InputContext.selection(input).getAsJsonArray("cards").size());
            assertTrue(input.selectCard(first, null, null));
            assertEquals(second.getId(), InputContext.selection(input).getAsJsonArray("cards").get(0).getAsInt());
            input.setCancelAllowed(true); input.selectButtonCancel();
            assertEquals(0, InputContext.selection(input).getAsJsonArray("cards").size());
            assertNull(InputContext.selection(new InputSelectEntitiesFromList<>(human, 1, 1, game.getPlayers())));
        });
    }
    @Test public void choicesDuringResolutionCarryTheCardThatIsResolving() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0);
        Card bears = ExilePermissionsTest.add(game, "Grizzly Bears", me, ZoneType.Battlefield);
        var alarm = VisibleEventsTest.spell(game, me, "Raise the Alarm"); game.getStack().add(alarm);
        FThreads.invokeInEdtAndWait(() -> {
            var human = human(game, me);
            var choose = new InputSelectCardsFromList(human, 1, 1, new CardCollection(java.util.List.of(bears)));
            assertNull("fora da resolução não há de onde vir o pedido", InputContext.resolvingSource(choose, game));
            game.getStack().setResolving(true);
            try {
                assertEquals("Raise the Alarm", InputContext.resolvingSource(choose, game).getName());
                assertEquals("Raise the Alarm", InputContext.resolvingSource(new InputSelectEntitiesFromList<>(human, 1, 1, game.getPlayers()), game).getName());
                assertNull(InputContext.resolvingSource(null, game));
            } finally { game.getStack().setResolving(false); }
        });
    }
    @Test public void everyQuestionKnowsWhichCardIsAskingAndForgetsItAfterwards() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0);
        Card bears = ExilePermissionsTest.add(game, "Grizzly Bears", me, ZoneType.Battlefield);
        var asked = new java.util.ArrayList<String>();
        var controller = new AskingController(game, me, new AskingController.Lobby("Test"));
        controller.setGui((IGuiGame) Proxy.newProxyInstance(IGuiGame.class.getClassLoader(), new Class<?>[]{IGuiGame.class}, (proxy, method, args) -> {
            if (controller.asking() != null) asked.add(controller.asking().getName());
            return method.getReturnType() == boolean.class ? false : method.getReturnType() == int.class ? 0 : null;
        }));
        FThreads.invokeInEdtAndWait(() -> {
            try { controller.chooseNumber(bears.getFirstSpellAbility(), "Escolha um número", 0, 3); } catch (RuntimeException ignored) { }
        });
        assertTrue(asked.contains("Grizzly Bears"));
        assertNull(controller.asking());
    }
    @Test public void proliferateRatesEachCounterForTheChooserAndSelectsWithoutAutoConfirming() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        Card mine = ExilePermissionsTest.add(game, "Grizzly Bears", me, ZoneType.Battlefield);
        Card theirs = ExilePermissionsTest.add(game, "Grizzly Bears", other, ZoneType.Battlefield);
        Card shrunk = ExilePermissionsTest.add(game, "Grizzly Bears", me, ZoneType.Battlefield);
        mine.setCounters(CounterEnumType.P1P1, 2); theirs.setCounters(CounterEnumType.M1M1, 1); shrunk.setCounters(CounterEnumType.M1M1, 1);
        other.setCounters(CounterEnumType.POISON, 3, other, false); me.setCounters(CounterEnumType.POISON, 1, me, false);
        var ability = ExilePermissionsTest.add(game, "Steady Progress", me, ZoneType.Hand).getFirstSpellAbility();
        ability.setActivatingPlayer(me);
        FCollection<GameEntity> choices = new FCollection<>(java.util.List.of(me, other, mine, theirs, shrunk));
        FThreads.invokeInEdtAndWait(() -> {
            var input = new InputSelectEntitiesFromList<>(human(game, me), 0, choices.size(), choices, ability);
            input.showMessage();
            var rows = InputContext.proliferate(input).getAsJsonArray("candidates").asList().stream().map(e -> e.getAsJsonObject())
                .collect(java.util.stream.Collectors.toMap(e -> e.get("kind").getAsString() + e.get("id").getAsInt(), e -> e));
            assertEquals("bad", rows.get("player" + me.getId()).get("effect").getAsString());
            assertEquals("good", rows.get("player" + other.getId()).get("effect").getAsString());
            assertEquals("good", rows.get("card" + mine.getId()).get("effect").getAsString());
            assertEquals("good", rows.get("card" + theirs.getId()).get("effect").getAsString());
            assertEquals("bad", rows.get("card" + shrunk.getId()).get("effect").getAsString());
            assertTrue(rows.get("card" + theirs.getId()).get("suggested").getAsBoolean());
            assertEquals(2, rows.get("card" + mine.getId()).getAsJsonArray("counters").get(0).getAsJsonObject().get("count").getAsInt());
            assertNull(InputContext.proliferate(new InputSelectCardsFromList(human(game, me), 0, 1, new CardCollection(mine))));

            assertTrue(InputContext.playerChoices(input).containsAll(java.util.List.of(me.getId(), other.getId())));
            assertTrue(InputContext.selectExactly(input, java.util.List.of(mine.getId(), theirs.getId(), shrunk.getId()), java.util.List.of(me.getId(), other.getId())));
            var selection = InputContext.selection(input);
            assertEquals(3, selection.getAsJsonArray("cards").size()); assertEquals(2, selection.getAsJsonArray("players").size());
            // Se o Forge tivesse confirmado sozinho ao marcar todos, esta troca não mudaria nada.
            assertTrue(InputContext.selectExactly(input, java.util.List.of(theirs.getId()), java.util.List.of(other.getId())));
            assertEquals(java.util.Set.of(theirs, other), java.util.Set.copyOf(input.getSelected()));
            assertFalse(InputContext.selectExactly(input, java.util.List.of(-5), java.util.List.of()));
        });
    }
    @Test public void targetSelectionCarriesTheTriggerTextWhatItTargetsAndHowManyAreLeft() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0), opponent = game.getPlayers().get(1);
        Card chupacabra = ExilePermissionsTest.add(game, "Ravenous Chupacabra", me, ZoneType.Battlefield);
        Card bears = ExilePermissionsTest.add(game, "Grizzly Bears", opponent, ZoneType.Battlefield);
        var trigger = chupacabra.getTriggers().get(0);
        var ability = trigger.ensureAbility(); ability.setTrigger(trigger); ability.setActivatingPlayer(me);
        FThreads.invokeInEdtAndWait(() -> {
            var input = new forge.gamemodes.match.input.InputSelectTargets(human(game, me), java.util.List.of(bears), ability, true, null, null, null, false);
            var details = InputContext.targetDetails(input);
            assertEquals("trigger", details.get("kind").getAsString());
            String text = details.get("ability").getAsString();
            assertTrue(text, text.contains("Ravenous Chupacabra") && text.toLowerCase().contains("destroy target creature"));
            assertFalse(text, text.contains("CARDNAME"));
            assertEquals(1, details.get("min").getAsInt()); assertEquals(1, details.get("max").getAsInt());
            assertEquals(0, details.get("count").getAsInt());
            assertTrue(details.getAsJsonArray("valid").get(0).getAsString().startsWith("Creature"));
            assertFalse(details.has("zones"));
            ability.getTargets().add(bears);
            assertEquals(1, InputContext.targetDetails(input).get("count").getAsInt());
        });
    }
    @Test public void activatedAbilityTextKeepsTheCostAndSpellsLeaveTheTextOut() {
        Game game = ExilePermissionsTest.game(); Player me = game.getPlayers().get(0), opponent = game.getPlayers().get(1);
        Card sorcerer = ExilePermissionsTest.add(game, "Prodigal Sorcerer", me, ZoneType.Battlefield);
        Card bolt = ExilePermissionsTest.add(game, "Lightning Bolt", me, ZoneType.Hand);
        var ping = sorcerer.getSpellAbilities().stream().filter(sa -> sa.usesTargeting()).findFirst().orElseThrow();
        ping.setActivatingPlayer(me);
        var cast = bolt.getFirstSpellAbility(); cast.setActivatingPlayer(me);
        FThreads.invokeInEdtAndWait(() -> {
            var details = InputContext.targetDetails(new forge.gamemodes.match.input.InputSelectTargets(human(game, me), java.util.List.of(), ping, true, null, null, null, false));
            assertEquals("ability", details.get("kind").getAsString());
            assertTrue(details.get("ability").getAsString(), details.get("ability").getAsString().startsWith("{T}:"));
            var spell = InputContext.targetDetails(new forge.gamemodes.match.input.InputSelectTargets(human(game, me), java.util.List.of(), cast, true, null, null, null, false));
            assertEquals("spell", spell.get("kind").getAsString());
            assertFalse(spell.has("ability"));
            assertEquals("Any", spell.getAsJsonArray("valid").get(0).getAsString());
            assertNull(InputContext.targetDetails(new Object()));
            assertNotNull(opponent);
        });
    }
}
