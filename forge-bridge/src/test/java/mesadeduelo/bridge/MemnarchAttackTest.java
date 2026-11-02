package mesadeduelo.bridge;

import static org.junit.Assert.*;
import forge.game.Game;
import forge.game.GameEntity;
import forge.game.GameStage;
import forge.game.ability.AbilityKey;
import forge.game.card.Card;
import forge.game.combat.Combat;
import forge.game.combat.CombatUtil;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.trigger.TriggerType;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

/** Memnarch, the Warden: ao atacar, compra uma carta por artefato que você controla (ele mesmo conta). */
public class MemnarchAttackTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    private static Card add(Game game, String name, Player owner, ZoneType zone) { return ExilePermissionsTest.add(game, name, owner, zone); }

    private static Game game() {
        Game game = ExilePermissionsTest.game();
        game.setAge(GameStage.Play); // gatilhos só rodam numa partida começada
        return game;
    }

    private static void library(Game game, Player me, int size) {
        for (int i = 0; i < size; i++) add(game, "Island", me, ZoneType.Library);
    }

    private static void resolveAll(Game game) {
        for (int i = 0; i < 10; i++) {
            game.getStack().addAllTriggeredAbilitiesToStack();
            if (game.getStack().isEmpty()) return;
            game.getStack().resolveStack();
        }
    }

    /** Declara o ataque do Memnarch contra o jogador ou planeswalker e resolve o gatilho. */
    private static void attack(Game game, Card memnarch, GameEntity them) {
        memnarch.setSickness(false);
        game.getAction().checkStaticAbilities();
        game.getTriggerHandler().resetActiveTriggers(); // cartas postas direto no campo não registram os gatilhos sozinhas
        Combat combat = new Combat(memnarch.getController()); game.getPhaseHandler().setCombat(combat);
        combat.addAttacker(memnarch, them);
        assertTrue(CombatUtil.validateAttackers(combat));
        CombatUtil.checkDeclaredAttacker(game, memnarch, combat, true);
        game.getTriggerHandler().runWaitingTriggers();
        resolveAll(game);
    }

    @Test public void drawsOneCardPerArtifactIncludingItself() {
        Game game = game(); Player me = game.getPlayers().get(0), them = game.getPlayers().get(1);
        library(game, me, 10);
        Card memnarch = add(game, "Memnarch, the Warden", me, ZoneType.Battlefield);
        add(game, "Sol Ring", me, ZoneType.Battlefield);
        add(game, "Ornithopter", me, ZoneType.Battlefield);
        add(game, "Grizzly Bears", me, ZoneType.Battlefield); // não é artefato
        add(game, "Sol Ring", them, ZoneType.Battlefield);    // artefato do oponente não conta
        attack(game, memnarch, them);
        assertEquals(3, me.getCardsIn(ZoneType.Hand).size());
        assertEquals(0, them.getCardsIn(ZoneType.Hand).size());
    }

    /** Entrando de verdade, os dois Myr do gatilho de entrada também contam: 3 cartas. */
    @Test public void myrTokensFromItsEntryCount() {
        Game game = game(); Player me = game.getPlayers().get(0), them = game.getPlayers().get(1);
        library(game, me, 10);
        Card memnarch = game.getAction().moveToPlay(add(game, "Memnarch, the Warden", me, ZoneType.Hand), null, null);
        game.getTriggerHandler().runWaitingTriggers();
        resolveAll(game);
        assertEquals(2, me.getCardsIn(ZoneType.Battlefield).stream().filter(c -> c.isToken() && c.getType().hasCreatureType("Myr")).count());
        attack(game, game.getCardState(memnarch), them);
        assertEquals(3, me.getCardsIn(ZoneType.Hand).size());
    }

    /** Começo do combate no turno de quem ataca: dispara o gatilho do Jace, Multiverse Architect do oponente. */
    private static void beginCombat(Game game, Player me) {
        game.getPhaseHandler().devModeSet(PhaseType.COMBAT_BEGIN, me);
        game.getTriggerHandler().resetActiveTriggers();
        game.getTriggerHandler().runTrigger(TriggerType.Phase, AbilityKey.mapFromPlayer(me), false);
        game.getTriggerHandler().runWaitingTriggers();
        resolveAll(game);
        game.getAction().checkStaticAbilities();
    }

    /** Sem a taxa do Jace em jogo (paga, ou antes do começo do combate), Memnarch pode atacar o Jace e compra igual. */
    @Test public void attackingAnOpposingJaceStillDraws() {
        Game game = game(); Player me = game.getPlayers().get(0), them = game.getPlayers().get(1);
        library(game, me, 10);
        Card jace = add(game, "Jace, Multiverse Architect", them, ZoneType.Battlefield);
        jace.setCounters(forge.game.card.CounterEnumType.LOYALTY, 4);
        Card memnarch = add(game, "Memnarch, the Warden", me, ZoneType.Battlefield);
        add(game, "Sol Ring", me, ZoneType.Battlefield);
        memnarch.setSickness(false);
        assertTrue(CombatUtil.canAttack(memnarch, jace));
        attack(game, memnarch, jace);
        assertEquals(2, me.getCardsIn(ZoneType.Hand).size());
        assertEquals(0, them.getCardsIn(ZoneType.Hand).size());
    }

    /** Sem mana para pagar {2}, Memnarch não pode atacar o Jace, mas ainda ataca o jogador e compra. */
    @Test public void unpaidJaceTaxBlocksOnlyAttacksOnJace() {
        Game game = game(); Player me = game.getPlayers().get(0), them = game.getPlayers().get(1);
        library(game, me, 10);
        Card jace = add(game, "Jace, Multiverse Architect", them, ZoneType.Battlefield);
        jace.setCounters(forge.game.card.CounterEnumType.LOYALTY, 4);
        Card memnarch = add(game, "Memnarch, the Warden", me, ZoneType.Battlefield);
        add(game, "Ornithopter", me, ZoneType.Battlefield);
        memnarch.setSickness(false);
        beginCombat(game, me);
        assertFalse(CombatUtil.canAttack(memnarch, jace));
        assertTrue(CombatUtil.canAttack(memnarch, them));
        attack(game, memnarch, them);
        assertEquals(2, me.getCardsIn(ZoneType.Hand).size());
    }
}
