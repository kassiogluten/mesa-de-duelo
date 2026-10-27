package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;

import forge.game.Game;
import forge.game.ability.ApiType;
import forge.game.spellability.SpellAbility;
import forge.game.trigger.WrappedAbility;
import forge.util.Localizer;
import org.apache.commons.lang3.StringUtils;

/**
 * Votações (Vontade do conselho, Dilema do conselho...): qual carta está votando, a pergunta do voto e os votos já
 * dados. O Forge só pergunta "<carta> Vote:" e anuncia cada voto em texto ("Ana votou Time\r\nVotos Atuais:{Time=[Ana]}");
 * a contagem fica numa variável local do efeito, então a mesa a lê desses anúncios.
 */
final class Votes {
    private Votes() { }

    /** A votação resolvendo agora: a habilidade de votar da mágica ou do gatilho no topo da pilha. Na dúvida, null. */
    static SpellAbility current(Game game) {
        try {
            if (game == null || !game.getStack().isResolving()) return null;
            SpellAbility sa = game.getStack().peekAbility();
            if (sa instanceof WrappedAbility wrapped) sa = wrapped.getWrappedAbility();
            for (; sa != null; sa = sa.getSubAbility()) if (sa.getApi() == ApiType.Vote) return sa;
        } catch (RuntimeException e) { /* Pilha mudando em outra thread: sem votação. */ }
        return null;
    }

    /** O título com que o Forge pede cada voto: "<carta> Vote:". */
    static boolean isVotePrompt(String title) {
        return title != null && title.endsWith(" " + Localizer.getInstance().getMessage("lblVote") + ":");
    }

    /** "Council's Judgment (12)" → "Council's Judgment": cartas votadas aparecem com o id. */
    static String clean(String label) {
        return label.replaceFirst("\\s*\\(\\d+\\)$", "").trim();
    }

    /** Quem votou em quê ({jogador, opção}), na ordem do anúncio; null se o texto não é um anúncio de voto. */
    static List<String[]> parse(String message, Collection<String> playerNames) {
        if (message == null) return null;
        String marker = Localizer.getInstance().getMessage("lblCurrentVote") + ":";
        int at = message.lastIndexOf(marker);
        if (at < 0) return null;
        String map = message.substring(at + marker.length()).trim();
        if (!map.startsWith("{") || !map.endsWith("}")) return null;
        List<String> names = new ArrayList<>(playerNames);
        names.sort(Comparator.comparingInt(String::length).reversed());
        List<String[]> votes = new ArrayList<>();
        String inner = map.substring(1, map.length() - 1);
        int pos = 0;
        while (pos < inner.length()) {
            int open = inner.indexOf("=[", pos), close = open < 0 ? -1 : inner.indexOf(']', open);
            if (open < 0 || close < 0) return null;
            String option = clean(inner.substring(pos, open));
            String voters = inner.substring(open + 2, close);
            int v = 0;
            while (v < voters.length()) {
                String who = null;
                for (String name : names) if (voters.startsWith(name, v) && (v + name.length() == voters.length() || voters.startsWith(", ", v + name.length()))) { who = name; break; }
                if (who == null) { int comma = voters.indexOf(", ", v); who = voters.substring(v, comma < 0 ? voters.length() : comma); }
                votes.add(new String[] { who, option });
                v += who.length() + 2;
            }
            pos = close + 1;
            if (inner.startsWith(", ", pos)) pos += 2;
        }
        return votes;
    }

    /** "Ana votou Time…" → "Ana votou em Time."; null se a primeira linha não segue o anúncio do Forge. */
    static String notice(String message, Collection<String> playerNames) {
        String first = message.split("\\r?\\n", 2)[0];
        for (String name : playerNames) {
            String prefix = Localizer.getInstance().getMessage("lblPlayerVoteValue", StringUtils.capitalize(name), "");
            if (!prefix.isEmpty() && first.startsWith(prefix) && first.length() > prefix.length())
                return name + " votou em " + clean(first.substring(prefix.length())) + ".";
        }
        return null;
    }

    /** Os votos anunciados da votação aberta; outra votação começa do zero. */
    static final class Tally {
        private SpellAbility vote;
        private List<String[]> votes = List.of();

        synchronized void observe(SpellAbility vote, List<String[]> votes) { this.vote = vote; this.votes = List.copyOf(votes); }
        synchronized List<String[]> of(SpellAbility vote) { return vote != null && vote == this.vote ? votes : List.of(); }
    }
}
