package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.List;
import forge.game.Game;
import forge.game.GameStage;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import forge.gui.interfaces.IGuiGame;
import org.junit.BeforeClass;
import org.junit.Test;

/** Spelunking (Semente do Mundo e Jardim Necroflor): compra, terreno da mão, Caverna dá vida e terrenos entram desvirados. */
public class SpelunkingTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static Card add(Game game, String name, Player owner, ZoneType zone) { return ExilePermissionsTest.add(game, name, owner, zone); }

    /** Esvazia o grimório e põe estas cartas, a primeira no topo. */
    private static void library(Game game, Player me, String... names) {
        for (Card c : me.getCardsIn(ZoneType.Library)) me.getZone(ZoneType.Library).remove(c);
        for (String n : names) add(game, n, me, ZoneType.Library);
    }

    /** Lança a Spelunking da mão e resolve a mágica e o gatilho de entrada. */
    private static Card cast(Game game, Player me) {
        Card spelunking = add(game, "Spelunking", me, ZoneType.Hand);
        SpellAbility spell = spelunking.getSpells().stream().filter(SpellAbility::isSpell).findFirst().orElseThrow();
        spell.setActivatingPlayer(me); game.getStack().add(spell); game.getStack().resolveStack();
        resolveAll(game);
        return game.getCardState(spelunking);
    }

    private static void resolveAll(Game game) {
        for (int i = 0; i < 10; i++) {
            game.getStack().addAllTriggeredAbilitiesToStack();
            if (game.getStack().isEmpty()) return;
            game.getStack().resolveStack();
        }
    }

    private static Card onBattlefield(Player me, String name) {
        return me.getCardsIn(ZoneType.Battlefield).stream().filter(c -> c.getPaperCard().getName().equals(name)).findFirst().orElse(null);
    }

    private static Game game() {
        Game game = ExilePermissionsTest.game();
        game.setAge(GameStage.Play); // gatilhos só rodam numa partida começada
        return game;
    }

    private static String names(Player me, ZoneType zone) {
        return me.getCardsIn(zone).stream().map(c -> c.getPaperCard().getName()).sorted().toList().toString();
    }

    @Test public void drawsThenPutsACaveUntappedAndGainsFourLife() {
        Game game = game(); Player me = game.getPlayers().get(0);
        library(game, me, "Grizzly Bears", "Swamp");
        add(game, "Hidden Nursery", me, ZoneType.Hand); // Caverna que entra virada
        cast(game, me);
        assertEquals("[Grizzly Bears]", names(me, ZoneType.Hand));
        assertFalse(onBattlefield(me, "Hidden Nursery").isTapped());
        assertEquals(24, me.getLife());
    }

    @Test public void aLandThatIsNotACaveGivesNoLife() {
        Game game = game(); Player me = game.getPlayers().get(0);
        library(game, me, "Grizzly Bears", "Swamp");
        add(game, "Bojuka Bog", me, ZoneType.Hand);
        cast(game, me);
        assertEquals("[Grizzly Bears]", names(me, ZoneType.Hand));
        assertFalse(onBattlefield(me, "Bojuka Bog").isTapped());
        assertEquals(20, me.getLife());
    }

    /** Urza's Cave (do Jardim Necroflor) tem dois subtipos, Urza's e Cave: conta como Caverna. */
    @Test public void urzasCaveIsACave() {
        Game game = game(); Player me = game.getPlayers().get(0);
        library(game, me, "Grizzly Bears", "Swamp");
        add(game, "Urza's Cave", me, ZoneType.Hand);
        cast(game, me);
        assertNotNull(onBattlefield(me, "Urza's Cave"));
        assertEquals(24, me.getLife());
    }

    /** A compra vem antes: o terreno comprado já pode ser o que entra. */
    @Test public void theDrawnLandCanBeTheOnePut() {
        Game game = game(); Player me = game.getPlayers().get(0);
        library(game, me, "Cavernous Maw", "Swamp");
        cast(game, me);
        assertNotNull(onBattlefield(me, "Cavernous Maw"));
        assertFalse(onBattlefield(me, "Cavernous Maw").isTapped());
        assertEquals("[]", names(me, ZoneType.Hand));
        assertEquals(24, me.getLife());
    }

    @Test public void withoutALandItOnlyDraws() {
        Game game = game(); Player me = game.getPlayers().get(0);
        library(game, me, "Grizzly Bears", "Swamp");
        add(game, "Lightning Bolt", me, ZoneType.Hand);
        cast(game, me);
        assertEquals("[Grizzly Bears, Lightning Bolt]", names(me, ZoneType.Hand));
        assertEquals("[Spelunking]", names(me, ZoneType.Battlefield));
        assertEquals(20, me.getLife());
    }

    /** Terrenos que "entram virados" entram desvirados, os do oponente não. */
    @Test public void landsThatEnterTappedEnterUntappedOnlyForItsController() {
        Game game = game(); Player me = game.getPlayers().get(0), other = game.getPlayers().get(1);
        library(game, me, "Grizzly Bears");
        cast(game, me);
        for (String name : List.of("Golgari Rot Farm", "Selesnya Sanctuary", "Hidden Volcano")) {
            game.getAction().moveToPlay(add(game, name, me, ZoneType.Hand), null, null);
            resolveAll(game);
            assertFalse(name, onBattlefield(me, name).isTapped());
        }
        game.getAction().moveToPlay(add(game, "Bojuka Bog", other, ZoneType.Hand), null, null);
        resolveAll(game);
        assertTrue(onBattlefield(other, "Bojuka Bog").isTapped());
    }

    /** "Ponha no campo virado" (Evolving Wilds, Urza's Cave, Cultivate) também entra desvirado. A busca do
     *  motor faz assim: marca a carta como virada e a põe no campo; o robô recusa buscar fora de uma partida de verdade. */
    @Test public void landsPutOntoTheBattlefieldTappedEnterUntapped() {
        Game game = game(); Player me = game.getPlayers().get(0);
        library(game, me, "Grizzly Bears", "Forest");
        cast(game, me);
        Card forest = me.getCardsIn(ZoneType.Library).get(0);
        forest.setTapped(true);
        game.getAction().moveToPlay(forest, null, null);
        assertFalse(onBattlefield(me, "Forest").isTapped());
    }

    /** Terreno de choque: entra desvirado mesmo sem pagar 2 de vida. */
    @Test public void shockLandEntersUntappedEvenWithoutPayingLife() {
        Game game = game(); Player me = game.getPlayers().get(0);
        library(game, me, "Grizzly Bears");
        cast(game, me);
        int life = me.getLife();
        game.getAction().moveToPlay(add(game, "Stomping Ground", me, ZoneType.Hand), null, null);
        resolveAll(game);
        assertFalse(onBattlefield(me, "Stomping Ground").isTapped());
        assertEquals(life, me.getLife());
    }

    /** Sem a Spelunking, nada muda: o mesmo terreno entra virado. */
    @Test public void afterSpelunkingLeavesLandsEnterTappedAgain() {
        Game game = game(); Player me = game.getPlayers().get(0);
        library(game, me, "Grizzly Bears");
        Card spelunking = cast(game, me);
        game.getAction().moveToGraveyard(spelunking, null, null);
        game.getAction().checkStaticAbilities();
        game.getAction().moveToPlay(add(game, "Bojuka Bog", me, ZoneType.Hand), null, null);
        resolveAll(game);
        assertTrue(onBattlefield(me, "Bojuka Bog").isTapped());
    }

    /** Na mesa, o "entra virado" vem antes da Spelunking sem perguntar a ordem: o terreno entra desvirado. */
    @Test public void tableNeverAsksTheOrderAndTheLandEntersUntapped() throws Exception {
        for (String land : List.of("Bojuka Bog", "Golgari Rot Farm", "Stomping Ground")) {
            Game game = game(); Player me = game.getPlayers().get(0);
            library(game, me, "Grizzly Bears");
            cast(game, me);
            var human = new AskingController(game, me, new AskingController.Lobby("Test"));
            List<String> asked = new ArrayList<>();
            human.setGui((IGuiGame) Proxy.newProxyInstance(IGuiGame.class.getClassLoader(), new Class<?>[]{IGuiGame.class}, (proxy, m, a) -> {
                if (m.getName().equals("order")) asked.add(String.valueOf(a[0]));
                Class<?> r = m.getReturnType();
                if (r.isPrimitive() && r != void.class) return java.lang.reflect.Array.get(java.lang.reflect.Array.newInstance(r, 1), 0);
                return r == Long.class ? 0L : r == Integer.class ? 0 : r == Boolean.class ? false : null;
            }));
            me.dangerouslySetController(human);
            Card card = add(game, land, me, ZoneType.Hand);
            // Fora da thread do teste: o terreno de choque ainda pergunta se paga 2 de vida.
            Thread play = new Thread(() -> game.getAction().moveToPlay(card, null, null));
            play.setDaemon(true); play.start(); play.join(10000);
            assertFalse(land, play.isAlive());
            assertEquals(land, List.of(), asked);
            assertFalse(land, onBattlefield(me, land).isTapped());
        }
    }

    @Test public void onlyEntersUntappedReplacementsAreDeferred() {
        Game game = game(); Player me = game.getPlayers().get(0);
        var spelunking = add(game, "Spelunking", me, ZoneType.Battlefield).getReplacementEffects().get(0);
        var bog = add(game, "Bojuka Bog", me, ZoneType.Hand).getReplacementEffects().get(0);
        assertTrue(AskingController.entersUntapped(spelunking));
        assertFalse(AskingController.entersUntapped(bog));
    }
}
