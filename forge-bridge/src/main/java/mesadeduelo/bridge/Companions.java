package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import forge.card.CardStateName;
import forge.card.CardType;
import forge.card.mana.ManaCost;
import forge.card.mana.ManaCostShard;
import forge.deck.Deck;
import forge.deck.DeckSection;
import forge.ai.LobbyPlayerAi;
import forge.game.Game;
import forge.game.Match;
import forge.game.card.Card;
import forge.game.player.RegisteredPlayer;
import forge.game.keyword.Companion;
import forge.game.keyword.Keyword;
import forge.game.keyword.KeywordInterface;
import forge.game.zone.ZoneType;
import forge.item.PaperCard;

/**
 * Companheiro no Commander: confere a condição de construção contando o comandante (o "deck inicial" da regra; o Forge
 * só olha o grimório) e reconhece, na partida, a carta que o Forge pôs na zona de comando como companheiro.
 */
final class Companions {
    private Companions() { }

    /** Proibidos só como companheiro no Commander (continuam valendo no deck e como comandante). */
    static final Set<String> BANNED_AS_COMPANION = Set.of("Lutri, the Spellchaser");

    /** A condição de cada companheiro, como o jogador lê; o Forge só tem o texto em inglês. */
    private static final Map<String, String> CONDITIONS = Map.of(
        "Gyruda, Doom of Depths", "só cartas com valor de mana par",
        "Jegantha, the Wellspring", "nenhuma carta com o mesmo símbolo de mana mais de uma vez no custo",
        "Kaheera, the Orphanguard", "toda criatura do deck é Gato, Elemental, Pesadelo, Dinossauro ou Fera",
        "Keruga, the Macrosage", "só terrenos e cartas com valor de mana 3 ou mais",
        "Lurrus of the Dream-Den", "toda permanente do deck com valor de mana 2 ou menos",
        "Lutri, the Spellchaser", "cada carta que não é terreno com um nome diferente",
        "Obosh, the Preypiercer", "só terrenos e cartas com valor de mana ímpar",
        "Umori, the Collector", "todas as cartas que não são terreno com um tipo de carta em comum",
        "Yorion, Sky Nomad", "pelo menos 20 cartas a mais que o mínimo do formato",
        "Zirda, the Dawnwaker", "toda permanente do deck com uma habilidade ativada");

    /**
     * As condições do Forge (Card.isValid) só funcionam com uma partida: as cartas do deck são lidas numa partida
     * auxiliar, montada uma vez e nunca jogada. O acesso é sincronizado (meets), porque o Forge não monta cartas em
     * paralelo na mesma partida.
     */
    private static Game scratch;
    private static final Map<PaperCard, Card> CARDS = new java.util.HashMap<>();
    private static Card card(PaperCard paper) {
        // Recomeça de tempos em tempos, para a partida auxiliar não acumular cartas para sempre.
        if (CARDS.size() > 4000) { CARDS.clear(); scratch = null; }
        if (scratch == null) {
            var players = List.of(new RegisteredPlayer(new Deck("A")).setPlayer(new LobbyPlayerAi("A", null)),
                new RegisteredPlayer(new Deck("B")).setPlayer(new LobbyPlayerAi("B", null)));
            scratch = new Match(new MatchConfig("free", "bo1").rules(), players, "Companheiro").createGame();
            scratch.setNoGUIUser();
        }
        return CARDS.computeIfAbsent(paper, p -> Card.fromPaperCard(p, scratch.getPlayers().get(0)));
    }

    static boolean isCompanion(PaperCard card) { return keyword(card) != null; }

    /** Fora da partida o Forge não monta as palavras-chave da carta: a do companheiro sai do texto de regras. */
    private static Companion keyword(PaperCard card) {
        for (String k : card.getRules().getMainPart().getKeywords())
            if (k.startsWith("Companion:") && Keyword.getInstance(k) instanceof Companion c) return c;
        return null;
    }

    private static Companion keyword(Card card) {
        for (KeywordInterface inst : card.getKeywords(Keyword.COMPANION)) if (inst instanceof Companion c) return c;
        return null;
    }

    /** Condição do companheiro em português (ou a do Forge, para um companheiro novo que ainda não está na lista). */
    static String condition(PaperCard companion) {
        String text = CONDITIONS.get(companion.getName());
        if (text != null) return text;
        Companion kw = keyword(companion);
        return kw == null ? "" : kw.getDescription();
    }

    /**
     * Se o deck inicial (deck principal e comandantes) cumpre a condição do companheiro. O mínimo do Commander é de
     * 99 cartas no grimório, como o Forge conta ao revelar o companheiro (Yorion).
     */
    static synchronized boolean meets(PaperCard companion, Deck deck) {
        Card source = card(companion);
        Companion kw = keyword(companion);
        if (kw == null) return false;
        List<Card> cards = new ArrayList<>();
        for (DeckSection section : new DeckSection[]{DeckSection.Main, DeckSection.Commander})
            for (var e : deck.getOrCreate(section)) for (int i = 0; i < e.getValue(); i++) cards.add(card(e.getKey()));
        if (!kw.hasSpecialRestriction()) {
            String[] restriction = kw.getDeckRestriction().split(",");
            for (Card c : cards) if (!c.isValid(restriction, null, source, null)) return false;
            return true;
        }
        List<Card> nonLand = cards.stream().filter(c -> !c.isLand()).toList();
        return switch (kw.getSpecialRules()) {
            case "UniqueNames" -> nonLand.stream().map(Card::getName).distinct().count() == nonLand.size();
            case "UniqueManaSymbols" -> cards.stream().allMatch(Companions::uniqueManaSymbols);
            case "DeckSizePlus20" -> deck.getMain().countAll() >= 99 + 20;
            case "SharesCardType" -> {
                Set<CardType.CoreType> shared = EnumSet.allOf(CardType.CoreType.class);
                for (Card c : nonLand) shared.retainAll(c.getPaperCard().getRules().getType().getCoreTypes());
                yield !shared.isEmpty();
            }
            default -> false;
        };
    }

    /** Jegantha: como o Forge confere (Player.allCardsUniqueManaSymbols), carta a carta. */
    private static boolean uniqueManaSymbols(Card c) {
        Set<CardStateName> states = c.isSplitCard() ? EnumSet.of(CardStateName.LeftSplit, CardStateName.RightSplit) : EnumSet.of(CardStateName.Original);
        Set<ManaCostShard> colored = new HashSet<>();
        Set<Integer> generic = new HashSet<>();
        for (CardStateName state : states) {
            ManaCost cost = c.getState(state).getManaCost();
            for (ManaCostShard shard : cost) if (!colored.add(shard)) return false;
            int g = cost.getGenericCost();
            if ((g > 0 || cost.getCMC() == 0) && !generic.add(g)) return false;
        }
        return true;
    }

    /** O companheiro revelado: a carta com Companheiro na zona de comando que não é comandante. */
    static boolean inCommandZone(Card card) {
        return card.isInZone(ZoneType.Command) && !card.isCommander() && !card.isImmutable() && keyword(card) != null;
    }
}
