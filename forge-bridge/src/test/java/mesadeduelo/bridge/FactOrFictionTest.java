package mesadeduelo.bridge;

import static org.junit.Assert.*;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.List;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.GameStage;
import forge.game.card.Card;
import forge.game.card.CardView;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import forge.gui.interfaces.IGuiGame;
import forge.localinstance.properties.ForgePreferences.FPref;
import forge.model.FModel;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

/**
 * Dois montes (Fact or Fiction, Sphinx of Uthuun, Steam Augury, Epiphany at the Drownyard) e o oponente que escolhe
 * entre as cartas buscadas (Gifts Ungiven, Intuition): as regras no motor e o que a ponte manda à mesa em cada pergunta.
 */
public class FactOrFictionTest {
    private static String cardDisplays;

    @BeforeClass public static void engine() {
        BridgeRulesTest.engine();
        // Como na ponte (Main): escolhas fora do campo e da mão chegam como pergunta com as cartas.
        cardDisplays = FModel.getPreferences().getPref(FPref.UI_SELECT_FROM_CARD_DISPLAYS);
        FModel.getPreferences().setPref(FPref.UI_SELECT_FROM_CARD_DISPLAYS, "false");
    }
    @AfterClass public static void restore() { FModel.getPreferences().setPref(FPref.UI_SELECT_FROM_CARD_DISPLAYS, cardDisplays); }

    /** Uma pergunta à mesa: quem respondeu, as opções e o JSON que a ponte completaria. */
    private record Asked(Player who, String title, List<Object> options, JsonObject q) { }

    /** Responde: no separar, as duas primeiras formam o monte 1; no escolher, o monte 2; nas outras, as primeiras. */
    private static IGuiGame gui(Game game, Player who, List<Asked> asked) {
        return (IGuiGame) Proxy.newProxyInstance(IGuiGame.class.getClassLoader(), new Class<?>[]{IGuiGame.class}, (proxy, m, a) -> {
            String n = m.getName();
            if (m.isDefault()) return InvocationHandler.invokeDefault(proxy, m, a);
            if (n.equals("one") || n.equals("many") || n.equals("chooseSingleEntityForEffect") || n.equals("chooseEntitiesForEffect")) {
                String title = String.valueOf(a[0]);
                List<Object> options = new ArrayList<>((List<?>) (n.equals("many") ? a[4] : a[1]));
                JsonObject q = new JsonObject();
                if (n.equals("many")) Piles.split(q, title, options, game);
                else if (n.equals("one")) Piles.choose(q, options, game);
                else ChooserPrompt.describe(q, title, game);
                asked.add(new Asked(who, title, options, q));
                return switch (n) {
                    case "one" -> options.get(q.getAsJsonArray("piles").get(1).getAsJsonObject().get("option").getAsInt());
                    case "chooseSingleEntityForEffect" -> options.get(0);
                    case "chooseEntitiesForEffect" -> new ArrayList<>(options.subList(0, Math.min(options.size(), Math.max((Integer) a[2], Math.min((Integer) a[3], 2)))));
                    default -> new ArrayList<>(options.subList(0, 2));
                };
            }
            Class<?> r = m.getReturnType();
            if (r.isPrimitive() && r != void.class) return java.lang.reflect.Array.get(java.lang.reflect.Array.newInstance(r, 1), 0);
            return r == Long.class ? 0L : r == Integer.class ? 0 : r == Boolean.class ? false : null;
        });
    }

    private Game game;
    private Player me, opp;

    /** Os dois jogadores como humanos da mesa; o grimório de "me" com seis cartas conhecidas, Lightning Bolt no topo. */
    private List<Asked> table() {
        game = ExilePermissionsTest.game(); game.setAge(GameStage.Play);
        me = game.getPlayers().get(0); opp = game.getPlayers().get(1);
        for (Card c : me.getCardsIn(ZoneType.Library)) me.getZone(ZoneType.Library).remove(c);
        for (String n : List.of("Lightning Bolt", "Counterspell", "Forest", "Island", "Grizzly Bears", "Serra Angel")) ExilePermissionsTest.add(game, n, me, ZoneType.Library);
        List<Asked> asked = new ArrayList<>();
        for (Player p : List.of(me, opp)) {
            var human = new AskingController(game, p, new AskingController.Lobby(p == me ? "Eu" : "Ele"));
            human.setGui(gui(game, p, asked));
            p.dangerouslySetController(human);
        }
        return asked;
    }

    /** Põe a mágica de "me" na pilha e a resolve fora da thread do teste, como na partida. */
    private void play(String name, int x) throws Exception {
        Card card = ExilePermissionsTest.add(game, name, me, ZoneType.Hand);
        SpellAbility spell = card.getFirstSpellAbility(); spell.setActivatingPlayer(me);
        if (x > 0) spell.setXManaCostPaid(x);
        for (SpellAbility sa = spell; sa != null; sa = sa.getSubAbility()) if (sa.usesTargeting()) sa.getTargets().add(opp);
        Throwable[] failed = new Throwable[1];
        Thread t = new Thread(() -> {
            try {
                game.getStack().add(spell);
                game.getStack().resolveStack();
            } catch (Throwable e) { failed[0] = e; }
        });
        t.setDaemon(true); t.start(); t.join(15000);
        assertFalse(name + " ficou esperando", t.isAlive());
        if (failed[0] != null) throw new AssertionError(name, failed[0]);
    }

    /** As cartas do grimório de teste numa zona de "me" (a mágica que ficou na mão não conta). */
    private List<String> names(ZoneType zone) {
        List<String> known = List.of("Lightning Bolt", "Counterspell", "Forest", "Island", "Grizzly Bears", "Serra Angel");
        return me.getCardsIn(zone).stream().map(c -> c.getPaperCard().getName()).filter(known::contains).sorted().toList();
    }

    private static List<Integer> ints(JsonArray a) { return a.asList().stream().map(e -> e.getAsInt()).toList(); }

    /** Separar: quem separa, as cartas reveladas e o que a mesa precisa para explicar os montes. */
    private void assertSplit(Asked split, Player separator, int cards, boolean ownerChooses) {
        assertEquals(separator, split.who());
        assertEquals(cards, split.options().size());
        assertEquals("piles-split", split.q().get("purpose").getAsString());
        assertEquals(me.getId(), split.q().get("pileOwner").getAsInt());
        assertEquals(ownerChooses, split.q().get("ownerChooses").getAsBoolean());
        assertEquals("hand", split.q().get("chosenTo").getAsString());
        assertEquals("graveyard", split.q().get("otherTo").getAsString());
    }

    /** Escolher: cada monte é a opção do Forge para ele, o tamanho e as cartas na ordem em que vieram. */
    private void assertChoice(Asked choice, Player chooser, int first, int second) {
        assertEquals(chooser, choice.who());
        assertEquals("piles-choose", choice.q().get("purpose").getAsString());
        JsonArray piles = choice.q().getAsJsonArray("piles");
        JsonObject one = piles.get(0).getAsJsonObject(), two = piles.get(1).getAsJsonObject();
        assertEquals(0, one.get("option").getAsInt());
        assertEquals(first, one.get("size").getAsInt());
        assertEquals(first + 1, two.get("option").getAsInt());
        assertEquals(second, two.get("size").getAsInt());
        List<Integer> all = new ArrayList<>(ints(one.getAsJsonArray("cards"))); all.addAll(ints(two.getAsJsonArray("cards")));
        assertEquals(first + second, all.size());
        for (int i : all) assertTrue(((CardView) choice.options().get(i)).getId() > 0);
        assertEquals(me.getId(), choice.q().get("pileOwner").getAsInt());
        assertEquals("hand", choice.q().get("chosenTo").getAsString());
    }

    @Test public void factOrFictionOpponentSeparatesAndTheCasterTakesAPile() throws Exception {
        List<Asked> asked = table();
        play("Fact or Fiction", 0);
        assertEquals(2, asked.size());
        assertSplit(asked.get(0), opp, 5, true);
        assertChoice(asked.get(1), me, 2, 3);
        // Monte 1: Bolt e Counterspell (as duas primeiras); o escolhido foi o 2.
        assertEquals(List.of("Forest", "Grizzly Bears", "Island"), names(ZoneType.Hand));
        assertEquals(List.of("Counterspell", "Lightning Bolt"), names(ZoneType.Graveyard));
        assertEquals(List.of("Serra Angel"), names(ZoneType.Library));
    }

    /** O gatilho de entrada, posto na pilha à mão (fora de uma partida de verdade, ele não vai sozinho). */
    @Test public void sphinxOfUthuunDoesTheSameWhenItEnters() throws Exception {
        List<Asked> asked = table();
        Card sphinx = ExilePermissionsTest.add(game, "Sphinx of Uthuun", me, ZoneType.Battlefield);
        SpellAbility trigger = sphinx.getTriggers().stream().filter(t -> t.getMode() == forge.game.trigger.TriggerType.ChangesZone).findFirst().orElseThrow().ensureAbility();
        trigger.setActivatingPlayer(me);
        Thread t = new Thread(() -> { game.getStack().add(trigger); game.getStack().resolveStack(); });
        t.setDaemon(true); t.start(); t.join(15000);
        assertFalse(t.isAlive());
        assertSplit(asked.get(0), opp, 5, true);
        assertChoice(asked.get(1), me, 2, 3);
        assertEquals(List.of("Forest", "Grizzly Bears", "Island"), names(ZoneType.Hand));
        assertEquals(List.of("Counterspell", "Lightning Bolt"), names(ZoneType.Graveyard));
    }

    @Test public void steamAuguryCasterSeparatesAndTheOpponentChooses() throws Exception {
        List<Asked> asked = table();
        play("Steam Augury", 0);
        assertSplit(asked.get(0), me, 5, false);
        assertChoice(asked.get(1), opp, 2, 3);
        assertEquals(List.of("Forest", "Grizzly Bears", "Island"), names(ZoneType.Hand));
        assertEquals(List.of("Counterspell", "Lightning Bolt"), names(ZoneType.Graveyard));
    }

    @Test public void epiphanyRevealsXPlusOne() throws Exception {
        List<Asked> asked = table();
        play("Epiphany at the Drownyard", 2);
        assertSplit(asked.get(0), me, 3, false);
        assertChoice(asked.get(1), opp, 2, 1);
        assertEquals(List.of("Forest"), names(ZoneType.Hand));
        assertEquals(List.of("Counterspell", "Lightning Bolt"), names(ZoneType.Graveyard));
        assertEquals(3, me.getCardsIn(ZoneType.Library).size());
    }

    @Test public void giftsUngivenOpponentPicksTwoForTheGraveyardInPortuguese() throws Exception {
        List<Asked> asked = table();
        play("Gifts Ungiven", 0);
        // Quatro buscas de uma carta, sempre com nomes diferentes, e então a escolha do oponente.
        assertEquals(5, asked.size());
        for (int i = 0; i < 4; i++) assertEquals(me, asked.get(i).who());
        Asked pick = asked.get(4);
        assertEquals(opp, pick.who());
        assertEquals(4, pick.options().size());
        assertEquals("Escolha 2 cartas para o cemitério de " + me.getName() + ". As outras vão para a mão.", pick.q().get("title").getAsString());
        assertEquals(2, names(ZoneType.Graveyard).size());
        assertEquals(2, names(ZoneType.Hand).size());
        assertEquals(2, me.getCardsIn(ZoneType.Library).size());
    }

    @Test public void intuitionOpponentPicksOneForTheHandInPortuguese() throws Exception {
        List<Asked> asked = table();
        play("Intuition", 0);
        Asked pick = asked.get(asked.size() - 1);
        assertEquals(opp, pick.who());
        assertEquals(3, pick.options().size());
        assertEquals("Escolha 1 carta para a mão de " + me.getName() + ". As outras vão para o cemitério.", pick.q().get("title").getAsString());
        assertEquals(1, names(ZoneType.Hand).size());
        assertEquals(2, names(ZoneType.Graveyard).size());
    }

    /** Outras escolhas ficam como estão. */
    @Test public void otherQuestionsAreLeftAlone() {
        table();
        JsonObject q = new JsonObject();
        List<Object> cards = List.of(me.getCardsIn(ZoneType.Library).get(0).getView());
        Piles.split(q, "Escolha uma carta", cards, game);
        Piles.choose(q, cards, game);
        ChooserPrompt.describe(q, "Choose a card for the hand", game);
        assertEquals(0, q.size());
    }
}
