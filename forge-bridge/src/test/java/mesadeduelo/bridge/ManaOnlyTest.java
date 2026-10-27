package mesadeduelo.bridge;

import static org.junit.Assert.*;
import forge.game.Game;
import forge.game.GameStage;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

/** Toque que só gera mana: terrenos básicos e pedras de mana sim; terrenos com outras habilidades, não. */
public class ManaOnlyTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }

    @Test public void onlyPermanentsWhoseTapJustMakesMana() {
        Game game = CommanderEngineTest.game(2);
        game.setAge(GameStage.Play);
        Player me = game.getPlayers().get(0);
        Card forest = ExilePermissionsTest.add(game, "Forest", me, ZoneType.Battlefield);
        Card ring = ExilePermissionsTest.add(game, "Sol Ring", me, ZoneType.Battlefield);
        Card wilds = ExilePermissionsTest.add(game, "Evolving Wilds", me, ZoneType.Battlefield);
        Card tapped = ExilePermissionsTest.add(game, "Forest", me, ZoneType.Battlefield);
        tapped.setTapped(true);
        assertTrue(ManaOnly.manaOnly(me, forest));
        assertTrue(ManaOnly.manaOnly(me, ring));
        assertFalse("buscar terreno não é mana", ManaOnly.manaOnly(me, wilds));
        assertFalse("virada não gera mais nada", ManaOnly.manaOnly(me, tapped));
    }
}
