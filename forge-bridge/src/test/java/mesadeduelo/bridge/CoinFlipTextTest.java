package mesadeduelo.bridge;

import static org.junit.Assert.*;
import com.google.gson.JsonParser;
import com.google.gson.JsonObject;
import org.junit.Test;

public class CoinFlipTextTest {
    @Test public void calledFlipResultNamesTheCardAndWhoWon() {
        assertEquals("Costurado no Tempo: você ganhou na moeda.", CoinFlipText.notice("Você vitórias o cara-coroa", "Costurado no Tempo (6)"));
        assertEquals("Costurado no Tempo: você perdeu na moeda.", CoinFlipText.notice("Você derrotas o cara-coroa", "Costurado no Tempo (6)"));
        assertEquals("Costurado no Tempo: Ana ganhou na moeda.", CoinFlipText.notice("Ana vitória o cara-coroa", "Costurado no Tempo (6)"));
        assertEquals("Você perdeu na moeda.", CoinFlipText.notice("Você derrotas o cara-coroa", ""));
    }

    @Test public void uncalledFlipSaysWhatEachCoinShowed() {
        assertEquals("Duelo de Mana: sua moeda deu cara.", CoinFlipText.notice("Você's caroa-coroa cara", "Duelo de Mana (22)"));
        assertEquals("Duelo de Mana: a moeda de Oponente deu coroa.", CoinFlipText.notice("Oponente's caroa-coroa coroa", "Duelo de Mana (22)"));
    }

    @Test public void otherNoticesPassThrough() {
        assertEquals("Ana votou em Time.", CoinFlipText.notice("Ana votou em Time.", "Expropriar (3)"));
    }

    @Test public void promptAsksHeadsOrTailsWithCapitalizedButtons() {
        assertEquals("Stitch in Time: cara ou coroa?", CoinFlipText.prompt("Stitch in Time - Lança moeda"));
        assertEquals("Stitch in Time: cara ou coroa? (2/3)", CoinFlipText.prompt("Stitch in Time - Lança moeda 2/3"));
        assertEquals("Prioridade", CoinFlipText.prompt("Prioridade"));
        assertEquals("Cara", CoinFlipText.label("cara"));
        assertEquals("Coroa", CoinFlipText.label("coroa"));
        assertEquals("OK", CoinFlipText.label("OK"));
    }

    @Test public void thumbChoiceIsRewrittenOnlyForCoinResults() {
        JsonObject q = JsonParser.parseString("{\"title\":\"Stitch in Time - Escolha um resultado\",\"options\":[{\"label\":\"cara\"},{\"label\":\"coroa\"}]}").getAsJsonObject();
        CoinFlipText.choice(q);
        assertEquals("Stitch in Time: escolha o resultado da moeda", q.get("title").getAsString());
        assertEquals("Cara", q.getAsJsonArray("options").get(0).getAsJsonObject().get("label").getAsString());
        JsonObject dice = JsonParser.parseString("{\"title\":\"Dado - Escolha um resultado\",\"options\":[{\"label\":\"3\"},{\"label\":\"5\"}]}").getAsJsonObject();
        CoinFlipText.choice(dice);
        assertEquals("Dado - Escolha um resultado", dice.get("title").getAsString());
    }

    @Test public void stackUsesTheSpellDescriptionLikeOtherSpells() {
        assertEquals("Costurado no Tempo (6) - Jogue uma moeda. Se você vencer, jogue um turno extra após este.",
            CoinFlipText.stack("Costurado no Tempo (6) - Você flips a coin. Targeting: [Costurado no Tempo (6), Jogue uma moeda. Se você vencer, jogue um turno extra após este.]."));
        assertEquals("Goblin (4) - Oponente joga uma moeda.", CoinFlipText.stack("Goblin (4) - Oponente flips a coin."));
        assertEquals("Raio (5) - Raio causa 3 pontos de dano.", CoinFlipText.stack("Raio (5) - Raio causa 3 pontos de dano."));
    }
}
