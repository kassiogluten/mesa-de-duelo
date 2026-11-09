package mesadeduelo.bridge;

import static org.junit.Assert.*;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.GameStage;
import forge.game.card.Card;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import org.junit.Test;

/** Necropotência: a carta exilada virada para baixo diz que volta para a mão na etapa final de quem ativou. */
public class DelayedReturnsTest {
    @Test public void necropotenceCardWaitsForYourEndStep() {
        Game game = TestGames.empty();
        game.setAge(GameStage.Play);
        Player a = game.getPlayers().get(0);
        Card necro = TestGames.add(game, "Necropotence", a, ZoneType.Battlefield);
        for (int i = 0; i < 3; i++) TestGames.add(game, "Island", a, ZoneType.Library);
        SpellAbility pay = necro.getSpellAbilities().stream().filter(SpellAbility::isActivatedAbility).findFirst().orElseThrow();
        pay.setActivatingPlayer(a);
        game.getStack().add(pay); game.getStack().resolveStack();

        Card exiled = a.getCardsIn(ZoneType.Exile).getFirst();
        JsonObject card = StateJson.card(exiled.getView(), game);
        assertTrue(card.get("faceDown").getAsBoolean());
        assertEquals("{\"to\":\"hand\",\"step\":\"end\",\"player\":" + a.getId() + ",\"source\":" + necro.getId() + "}", card.get("returns").toString());
        JsonObject field = new JsonObject();
        ExiledUnder.add(field, necro, game);
        assertEquals("[" + exiled.getId() + "]", String.valueOf(field.get("exiling")));

        game.getPhaseHandler().devAdvanceToPhase(PhaseType.END_OF_TURN);
        game.getTriggerHandler().runWaitingTriggers(); game.getStack().addAllTriggeredAbilitiesToStack();
        while (!game.getStack().isEmpty()) game.getStack().resolveStack();
        assertEquals(1, a.getCardsIn(ZoneType.Hand).size());
        assertTrue(DelayedReturns.of(game).isEmpty());
    }

    /** Exílio sem volta marcada (Swords to Plowshares) fica sem {@code returns}. */
    @Test public void plainExileHasNoReturn() {
        Game game = TestGames.empty();
        Player a = game.getPlayers().get(0);
        Card bear = TestGames.add(game, "Grizzly Bears", a, ZoneType.Exile);
        assertNull(StateJson.card(bear.getView(), game).get("returns"));
    }
}
