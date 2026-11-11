package mesadeduelo.bridge;

import static org.junit.Assert.*;
import forge.game.Game;
import forge.game.GameStage;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import org.junit.Test;

/** Correções de roteiro aplicadas na memória: Fossil Find só devolve carta do cemitério de quem conjurou. */
public class CardScriptFixesTest {
    @Test public void fossilFindOnlyReturnsFromYourGraveyard() {
        TestGames.engine();
        for (int round = 0; round < 10; round++) {
            Game game = TestGames.empty();
            game.setAge(GameStage.Play);
            Player a = game.getPlayers().get(0), b = game.getPlayers().get(1);
            Card fossil = TestGames.add(game, "Fossil Find", a, ZoneType.Hand);
            TestGames.add(game, "Grizzly Bears", a, ZoneType.Graveyard);
            for (int i = 0; i < 6; i++) TestGames.add(game, "Island", b, ZoneType.Graveyard);
            SpellAbility sa = fossil.getFirstSpellAbility();
            sa.setActivatingPlayer(a);
            sa.getSubAbility().setActivatingPlayer(a);
            game.getStack().add(sa); game.getStack().resolveStack();
            assertEquals("o oponente não recebe carta", 0, b.getCardsIn(ZoneType.Hand).size());
            assertEquals(6, b.getCardsIn(ZoneType.Graveyard).size());
            assertTrue("a carta volta do seu cemitério", a.getCardsIn(ZoneType.Hand).anyMatch(c -> c.getName().equals("Grizzly Bears")));
        }
    }

    /** Uma correção que não acha o trecho (o Forge já corrigido) não muda nada: rodar de novo não troca outra vez. */
    @Test public void applyingAgainChangesNothing() {
        TestGames.engine();
        assertEquals(0, CardScriptFixes.apply());
    }
}
