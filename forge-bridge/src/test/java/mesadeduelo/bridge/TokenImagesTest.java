package mesadeduelo.bridge;

import static org.junit.Assert.*;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import forge.StaticData;
import forge.game.Game;
import forge.game.GameStage;
import forge.game.ability.AbilityFactory;
import forge.game.ability.AbilityUtils;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import org.junit.BeforeClass;
import org.junit.Test;

/** A arte das fichas: a da coleção da carta que as cria e, quando ela não serve, a mesma ficha noutra coleção. */
public class TokenImagesTest {
    @BeforeClass public static void engine() { TestGames.engine(); }

    /** A ficha que a carta {@code name}, impressa em {@code set}, cria com o roteiro {@code script}, como na partida. */
    private static Card create(Game game, Player me, String name, String set, String script) {
        Card host = Card.fromPaperCard(StaticData.instance().getCommonCards().getCard(name, set), me);
        me.getZone(ZoneType.Battlefield).add(host); host.setZone(me.getZone(ZoneType.Battlefield));
        SpellAbility sa = AbilityFactory.getAbility("DB$ Token | TokenAmount$ 1 | TokenScript$ " + script, host);
        sa.setActivatingPlayer(me);
        AbilityUtils.resolve(sa);
        return me.getTokensInPlay().stream().filter(t -> !t.hasMergedCard()).reduce((a, b) -> b).orElseThrow();
    }

    private static String image(JsonObject o) { JsonElement img = o.get("image"); return img == null ? null : img.getAsString(); }

    /** Hangarback Walker das Kaladesh Inventions: a coleção lista o Thopter sem número, e ele ficava sem arte. */
    @Test public void tokenListedWithoutNumberTakesTheNewestPrint() {
        Game game = TestGames.empty(); Player me = game.getPlayers().get(0);
        Card thopter = create(game, me, "Hangarback Walker", "MPS_KLD", "c_1_1_a_thopter_flying");
        String img = image(StateJson.card(thopter.getView(), game));
        assertNotNull("o Thopter vai com a arte de outra coleção", img);
        assertTrue(img, img.startsWith("https://api.scryfall.com/cards/t") && !img.contains("/tmps/"));
    }

    /**
     * Icatian Town (a do Laboratório): o Forge pegava o Citizen da revista Duelist (tdls/3), que o Scryfall não tem, e
     * as quatro fichas ficavam sem arte; agora vão com o da coleção que o Scryfall tem.
     */
    @Test public void tokenOnlyInForgeCollectionsTakesOneTheScryfallHas() {
        Game game = TestGames.empty(); Player me = game.getPlayers().get(0);
        game.setAge(GameStage.Play);
        Card town = TestGames.add(game, "Icatian Town", me, ZoneType.Hand);
        SpellAbility spell = town.getSpells().get(0);
        spell.setActivatingPlayer(me);
        game.getStack().add(spell); game.getStack().resolveStack();
        assertEquals(4, me.getTokensInPlay().size());
        for (Card citizen : me.getTokensInPlay())
            assertEquals("https://api.scryfall.com/cards/tuma/1?format=image&version=normal", image(StateJson.card(citizen.getView(), game)));
    }

    /** A ficha que o Forge achou numerada numa coleção que o Scryfall tem continua a mesma. */
    @Test public void numberedTokenStays() {
        Game game = TestGames.empty(); Player me = game.getPlayers().get(0);
        Card goblin = create(game, me, "Goblin Instigator", "GRN", "r_1_1_goblin");
        String[] key = goblin.getView().getCurrentState().getImageKey(null).substring(2).split("\\|");
        assertTrue(String.join("|", key), key.length > 2);
        assertEquals("https://api.scryfall.com/cards/" + StaticData.instance().getEditions().get(key[1]).getTokensCode() + "/" + key[2] + "?format=image&version=normal",
            image(StateJson.card(goblin.getView(), game)));
    }

    /** A ficha por baixo de uma mutação também vai como ficha e com a arte. */
    @Test public void mergedTokenGoesWithItsArt() {
        Game game = TestGames.empty(); Player me = game.getPlayers().get(0);
        game.setAge(GameStage.Play);
        Card thopter = create(game, me, "Hangarback Walker", "MPS_KLD", "c_1_1_a_thopter_flying");
        Card gemrazer = TestGames.add(game, "Gemrazer", me, ZoneType.Hand);
        var mutate = gemrazer.getSpells().stream().filter(SpellAbility::isMutate).findFirst().orElseThrow();
        mutate.setActivatingPlayer(me);
        mutate.getTargets().add(thopter);
        game.getStack().add(mutate); game.getStack().resolveStack();

        Card permanent = game.getCardState(thopter);
        assertTrue(permanent.hasMergedCard());
        JsonObject part = null;
        for (JsonElement m : StateJson.card(permanent.getView(), game).getAsJsonArray("merged"))
            if (m.getAsJsonObject().get("id").getAsInt() == thopter.getId()) part = m.getAsJsonObject();
        assertNotNull(part);
        assertTrue("a parte de baixo é ficha", part.has("token") && part.get("token").getAsBoolean());
        assertNotNull("e mostra a arte", image(part));
    }
}
