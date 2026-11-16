package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import com.google.gson.JsonObject;
import forge.ai.PlayerControllerAi;
import forge.game.Game;
import forge.game.GameStage;
import forge.game.card.Card;
import forge.game.card.CardCollection;
import forge.game.card.CardCollectionView;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import org.junit.Test;

/**
 * Indominus Rex, Alpha: descarta criaturas ao entrar, ganha um marcador de cada habilidade que elas tinham e compra
 * uma carta por marcador. A mesa recebe os marcadores com o nome do Forge ("Flying", "First Strike") e traduz.
 */
public class IndominusRexTest {
    @Test public void discardedKeywordsBecomeCountersAndItDrawsOnePerCounter() {
        Game game = TestGames.empty(); game.setAge(GameStage.Play);
        Player me = game.getPlayers().get(0);
        for (int i = 0; i < 20; i++) TestGames.add(game, "Island", me, ZoneType.Library);
        // Quem joga descarta todas as criaturas que puder (a IA prefere não descartar nenhuma).
        me.dangerouslySetController(new PlayerControllerAi(game, me, me.getLobbyPlayer()) {
            @Override public CardCollection chooseCardsToDiscardFrom(Player p, SpellAbility sa, CardCollection valid, int min, int max, CardCollectionView visible) {
                return new CardCollection(valid);
            }
        });
        Card rex = TestGames.add(game, "Indominus Rex, Alpha", me, ZoneType.Hand);
        // Voar, toque mortífero e vínculo; voar (repetido) e vigilância; atropelar; iniciativa, vigilância (repetida) e
        // percorrer florestas (não vira marcador); golpe duplo.
        for (String n : List.of("Vampire Nighthawk", "Serra Angel", "Colossal Dreadmaw", "Mirri, Cat Warrior", "Boros Swiftblade"))
            TestGames.add(game, n, me, ZoneType.Hand);
        SpellAbility spell = rex.getSpells().stream().filter(SpellAbility::isSpell).findFirst().orElseThrow();
        spell.setActivatingPlayer(me); spell.setHostCard(game.getAction().moveToStack(rex, spell));
        game.getStack().add(spell); game.getStack().resolveStack();
        game.getTriggerHandler().runWaitingTriggers(); game.getStack().addAllTriggeredAbilitiesToStack();
        while (!game.getStack().isEmpty()) game.getStack().resolveStack();

        Card onField = me.getCardsIn(ZoneType.Battlefield).stream().filter(c -> c.getName().startsWith("Indominus")).findFirst().orElseThrow();
        assertEquals(5, me.getCardsIn(ZoneType.Graveyard).size());
        assertEquals(7, onField.getCounters().size());
        assertEquals(7, me.getCardsIn(ZoneType.Hand).size());
        assertEquals(13, me.getCardsIn(ZoneType.Library).size());

        JsonObject state = StateJson.game(game.getView(), me.getId(), game), card = null;
        for (var row : state.getAsJsonArray("players")) {
            var p = row.getAsJsonObject();
            if (p.get("id").getAsInt() == me.getId()) card = p.getAsJsonArray("battlefield").get(0).getAsJsonObject();
        }
        assertNotNull(card);
        assertEquals(Set.of("Flying", "First Strike", "Double Strike", "Deathtouch", "Lifelink", "Trample", "Vigilance"), card.getAsJsonObject("counters").keySet());
        Set<String> keywords = card.getAsJsonArray("keywords").asList().stream().map(e -> e.getAsString()).collect(Collectors.toSet());
        assertTrue(keywords.containsAll(Set.of("FLYING", "FIRST_STRIKE", "DOUBLE_STRIKE", "DEATHTOUCH", "LIFELINK", "TRAMPLE", "VIGILANCE")));
    }
}
