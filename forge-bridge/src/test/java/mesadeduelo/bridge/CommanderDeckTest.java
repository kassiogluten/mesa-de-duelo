package mesadeduelo.bridge;

import static org.junit.Assert.*;
import com.google.gson.*;
import forge.item.PaperCard;
import org.junit.BeforeClass;
import org.junit.Test;

public class CommanderDeckTest {
    @BeforeClass public static void engine() { BridgeRulesTest.engine(); }
    private JsonObject deck(String commander, String card, int count) {
        JsonObject d = new JsonObject(); d.addProperty("name", "Commander test");
        d.add("commanders", rows(commander, 1)); d.add("cards", rows(card, count)); return d;
    }
    private JsonArray rows(String name, int count) {
        JsonArray rows = new JsonArray(); JsonObject e = new JsonObject(); e.addProperty("name", name); e.addProperty("count", count); rows.add(e); return rows;
    }
    private DeckValidation.Result check(JsonObject d) { return DeckValidation.validate(d, "commander"); }
    private void rejects(JsonObject d, String code) {
        var r = check(d); assertTrue(r.json().toString(), r.issues().asList().stream().anyMatch(i -> code.equals(i.getAsJsonObject().get("code").getAsString())));
    }
    @Test public void allStartersArePlayableByHumansAndAi() {
        StringBuilder errors = new StringBuilder();
        long count = Decks.LISTS.values().stream().filter(d -> "commander".equals(d.get("format").getAsString())).peek(d -> {
            var r = DeckValidation.validateForAi(d, "commander");
            if (!r.valid()) { errors.append(d.get("name")).append(": ").append(r.json()).append("\n"); return; }
            int commanders = d.getAsJsonArray("commanders").size();
            // O Whtz (Rulebreaker) não tem tamanho máximo: o deck médio dele tem mais de 100 cartas.
            if (d.getAsJsonArray("commanders").get(0).getAsJsonObject().get("name").getAsString().equals("Whtz, the Bibliophile")) assertTrue(r.deck().getMain().countAll() >= 100 - commanders);
            else assertEquals(100 - commanders, r.deck().getMain().countAll());
            assertEquals(commanders, r.deck().getCommanders().size());
            assertEquals(commanders, r.json().getAsJsonObject("deck").getAsJsonArray("commanders").size());
        }).count();
        assertEquals(errors.toString(), 0, errors.length());
        assertEquals(131, count); assertNotNull(Decks.random("commander"));
    }
    @Test public void preconsGoOnlyAsTheyCameInTheBox() {
        var precons = Decks.LISTS.values().stream().filter(d -> d.has("precon")).toList();
        assertEquals(47, precons.size());
        for (JsonObject p : precons) assertTrue(p.get("name") + ": " + DeckValidation.validate(p, "precon").json(), DeckValidation.validate(p, "precon").valid());
        // A cópia do jogador, com as mesmas cartas, ainda é o precon; trocar uma carta já não é.
        JsonObject copy = precons.get(0).deepCopy(); copy.remove("precon"); copy.remove("builtin"); copy.addProperty("name", "Minha versão");
        assertTrue(DeckValidation.validate(copy, "precon").valid());
        JsonArray cards = copy.getAsJsonArray("cards"); JsonObject last = cards.get(cards.size() - 1).getAsJsonObject();
        String basic = java.util.List.of("Plains", "Island", "Swamp", "Mountain", "Forest").stream().filter(b -> !b.equals(last.get("name").getAsString())).findFirst().orElseThrow();
        cards.remove(cards.size() - 1); cards.add(rows(basic, last.get("count").getAsInt()).get(0));
        assertFalse(DeckValidation.validate(copy, "precon").valid());
        assertFalse(DeckValidation.validate(Decks.LISTS.get("commander-urza"), "precon").valid());
        var names = precons.stream().map(o -> o.get("name").getAsString()).toList();
        for (int i = 0; i < 10; i++) { String drawn = Decks.random("precon").getName(); assertTrue(drawn, names.contains(drawn)); }
        assertTrue(new MatchConfig("precon", "bo1", 4).commander());
    }
    @Test public void computersAvoidCommandersAlreadyAtTheTable() {
        var taken = new java.util.HashSet<String>();
        for (int i = 0; i < 4; i++) {
            var keys = Decks.tableKeys(Decks.random("precon", 3, taken));
            assertTrue(keys + " já estava em " + taken, java.util.Collections.disjoint(keys, taken));
            taken.addAll(keys);
        }
        // Com todos os comandantes já na mesa, ainda sorteia: repete só quando não sobra outro.
        var all = new java.util.HashSet<String>();
        for (JsonObject p : Decks.LISTS.values()) if (p.has("precon")) all.addAll(Decks.tableKeys(DeckValidation.validate(p, "precon").deck()));
        assertNotNull(Decks.random("precon", 3, all));
    }
    @Test public void countsSingletonAndOracleExceptions() {
        assertTrue(check(deck("Marwyn, the Nurturer", "Forest", 99)).valid());
        rejects(deck("Marwyn, the Nurturer", "Forest", 98), "total-count");
        rejects(deck("Marwyn, the Nurturer", "Llanowar Elves", 99), "too-many-copies");
        assertTrue(check(deck("Ashcoat of the Shadow Swarm", "Rat Colony", 99)).json().toString(), check(deck("Ashcoat of the Shadow Swarm", "Rat Colony", 99)).valid());
    }
    @Test public void bansIdentityLandsAndUnsupportedChoices() {
        rejects(deck("Marwyn, the Nurturer", "Island", 99), "color-identity");
        rejects(deck("Kozilek, the Great Distortion", "Forest", 99), "color-identity");
        rejects(deck("Marwyn, the Nurturer", "Mana Crypt", 99), "banned-card");
        rejects(deck("Marwyn, the Nurturer", "Ashnod's Coupon", 99), "unknown-card");
        rejects(deck("The Prismatic Piper", "Wastes", 99), "unsupported-commander-choice");
        rejects(deck("Llanowar Elves", "Forest", 99), "invalid-commander");
        rejects(deck("Raised by Giants", "Forest", 99), "invalid-commander");
    }
    @Test public void partnershipsAndBackgroundsUseForgeRules() {
        JsonObject d = deck("Thrasios, Triton Hero", "Forest", 98);
        d.getAsJsonArray("commanders").add(rows("Tymna the Weaver", 1).get(0)); assertTrue(check(d).json().toString(), check(d).valid());
        d = deck("Wilson, Refined Grizzly", "Forest", 98);
        d.getAsJsonArray("commanders").add(rows("Raised by Giants", 1).get(0)); assertTrue(check(d).json().toString(), check(d).valid());
        d = deck("Marwyn, the Nurturer", "Forest", 98);
        d.getAsJsonArray("commanders").add(rows("Lathril, Blade of the Elves", 1).get(0)); rejects(d, "commander-construction");
        d = deck("Marwyn, the Nurturer", "Forest", 99); d.add("sideboard", rows("Forest", 1)); rejects(d, "sideboard-not-supported");
    }
    @Test public void universesWithinCommandersKeepTheirOracleName() throws Exception {
        // Secret Lair cards reprinted in Universes Within: Forge files them under the Secret Lair name.
        for (String line : java.nio.file.Files.readAllLines(java.nio.file.Path.of(System.getProperty("forge.dir"), "forge-gui/res/editions/Universes Within.txt"))) {
            var m = java.util.regex.Pattern.compile("^[0-9]+ [A-Z] (.+?) @.*$").matcher(line);
            if (!m.matches()) continue;
            var card = DeckValidation.resolve(m.group(1));
            assertEquals(m.group(1), card.getDisplayName()); assertNotNull(m.group(1), CommanderLegality.oracleId(card.getDisplayName()));
        }
        var r = check(deck("Wernog, Rider's Chaplain", "Plains", 99)); assertTrue(r.json().toString(), r.valid());
        assertEquals("Wernog, Rider's Chaplain", r.json().getAsJsonObject("deck").getAsJsonArray("commanders").get(0).getAsJsonObject().get("name").getAsString());
        assertEquals("Wernog, Rider's Chaplain", Session.commanderNames(r.deck()).get(0));
    }
    private JsonObject deck(String commander, Object... cards) {
        JsonObject d = deck(commander, (String) cards[0], (Integer) cards[1]);
        for (int i = 2; i < cards.length; i += 2) d.getAsJsonArray("cards").add(rows((String) cards[i], (Integer) cards[i + 1]).get(0));
        return d;
    }
    private boolean has(DeckValidation.Result r, String code) {
        return r.issues().asList().stream().anyMatch(i -> code.equals(i.getAsJsonObject().get("code").getAsString()));
    }
    @Test public void rulebreakerCommandersFollowTheirOwnConstruction() {
        // Mystery Booster Commander Edition (2026-10-19): passou a valer no Commander depois do retrato de outubro.
        // Valko: cartas Phyrexian e terrenos básicos de qualquer identidade.
        var valko = check(deck("Valko Indorian", "Swamp", 90, "Plains", 8, "Elesh Norn, Mother of Machines", 1));
        assertTrue(valko.json().toString(), valko.valid());
        var offColor = check(deck("Valko Indorian", "Swamp", 98, "Swords to Plowshares", 1));
        assertTrue(offColor.json().toString(), has(offColor, "color-identity") && !has(offColor, "unsupported-commander-choice"));
        // Grizzlegom: qualquer terreno.
        assertTrue(check(deck("Grizzlegom, Hurloon Hero", "Forest", 98, "Watery Grave", 1)).valid());
        // Whtz: sem tamanho máximo, mas ainda com pelo menos 100 cartas.
        var whtz = check(deck("Whtz, the Bibliophile", "Plains", 100, "Island", 99));
        assertTrue(whtz.json().toString(), whtz.valid());
        assertTrue(has(check(deck("Whtz, the Bibliophile", "Plains", 98)), "total-count"));
        assertTrue(has(check(deck("Valko Indorian", "Swamp", 120)), "total-count"));
        // Comandante comum da coleção, sem Rulebreaker.
        var uramon = check(deck("Boss Uramon, Shadow's Reach", "Swamp", 99));
        assertTrue(uramon.json().toString(), uramon.valid());
        // Tolabow: instantâneas e feitiços podem ter uma cor a mais, escolhida pelo jogador no editor.
        assertTrue(has(check(deck("Tolabow, Loch Rascal", "Island", 99)), "commander-color-choice"));
        JsonObject tolabow = deck("Tolabow, Loch Rascal", "Island", 97, "Lightning Bolt", 1, "Mountain", 1);
        tolabow.getAsJsonArray("commanders").get(0).getAsJsonObject().addProperty("chosenColors", "R");
        var red = check(tolabow);
        assertTrue(red.json().toString(), red.valid());
        tolabow.getAsJsonArray("cards").add(rows("Goblin Guide", 1).get(0)); tolabow.getAsJsonArray("cards").get(0).getAsJsonObject().addProperty("count", 96);
        var creature = check(tolabow);
        assertTrue(creature.json().toString(), has(creature, "color-identity"));
        tolabow.getAsJsonArray("commanders").get(0).getAsJsonObject().addProperty("chosenColors", "U");
        assertTrue(has(check(tolabow), "commander-color-choice"));
        tolabow.getAsJsonArray("commanders").get(0).getAsJsonObject().addProperty("chosenColors", "RG");
        assertTrue(has(check(tolabow), "commander-color-choice"));
    }
    @Test public void starTrekCardsAreKnownAndLegal() {
        // Star Trek (TRK e TRC, 13/11/2026), com o Forge 2.0.17; o Scryfall escreve "All Good Things..." e o Forge "All Good Things . . .".
        var r = check(deck("Commander Spock", "Island", 96, "All Good Things...", 1, "Captain Jean-Luc Picard", 1, "U.S.S. Enterprise-D, Galaxy-Class", 1));
        assertTrue(r.json().toString(), r.valid());
    }
    @Test public void flavorNamesUseTheOracleCardLegality() {
        // Marvel Super Heroes Commander: Vibranium Dynamo é uma Thran Dynamo e Panther Idol um Mind's Eye, com outro nome impresso.
        JsonObject d = deck("Marwyn, the Nurturer", "Forest", 97);
        JsonArray cards = d.getAsJsonArray("cards");
        for (String[] c : new String[][]{{"Thran Dynamo", "290"}, {"Mind's Eye", "288"}}) {
            JsonObject row = rows(c[0], 1).get(0).getAsJsonObject(); row.addProperty("set", "msc"); row.addProperty("cn", c[1]); cards.add(row);
        }
        var r = check(d); assertTrue(r.json().toString(), r.valid());
        // Na partida a carta usa o nome Oracle (a mesa acha a carta no Scryfall por ele) e manda a impressão Marvel para a imagem.
        PaperCard dynamo = r.deck().getMain().toFlatList().stream().filter(c -> c.getName().equals("Thran Dynamo")).findFirst().orElseThrow();
        var game = CommanderEngineTest.game(2); var owner = game.getPlayers().get(0);
        var card = forge.game.card.CardFactory.getCard(dynamo, owner, owner.getId(), game);
        assertEquals("Thran Dynamo", card.getView().getCurrentState().getName());
        assertEquals("{\"set\":\"msc\",\"cn\":\"290\"}", String.valueOf(StateJson.printing(card, "Thran Dynamo")));
        assertEquals("Thran Dynamo", DeckValidation.resolve("Thran Dynamo").getDisplayName());
        var o = DeckValidation.validate(d, "oathbreaker");
        assertFalse(o.json().toString(), o.issues().asList().stream().anyMatch(i -> "wrong-format".equals(i.getAsJsonObject().get("code").getAsString())));
    }
}
