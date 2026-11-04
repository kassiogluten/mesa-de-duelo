package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.List;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.game.Game;
import forge.game.card.Card;
import forge.game.card.CardCollection;
import forge.card.CardStateName;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.staticability.StaticAbility;
import forge.game.staticability.StaticAbilityCantBeCast;
import forge.game.staticability.StaticAbilityMode;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.InputPassPriority;
import forge.interfaces.IGameController;
import forge.player.PlayerControllerHuman;

/**
 * O clique numa carta que o Forge não deixa jogar agora não faz nada: o Forge só descarta o clique. Aqui, com a
 * prioridade aberta, a jogada recusada vira um aviso com o motivo e a carta que o causou, como o
 * {@link AttackExplain} faz com o ataque: uma carta que proíbe conjurar ou ativar (Myrel, Escudo de Argivo), o
 * terreno do turno já jogado, ou um feitiço fora da sua fase principal.
 *
 * <p>Só fala quando o Forge recusaria o clique (nenhuma jogada possível com a carta). No campo, só para cartas com
 * habilidades ativadas: clicar numa criatura sem habilidade continua sem aviso.
 */
final class PlayRefusal {
    private PlayRefusal() { }

    record Reason(String title, String text, List<Card> cards) { }

    /** Thread da interface do Forge, como o clique: o aviso para a mesa, ou null se o clique deve seguir para o Forge. */
    static String toast(IGameController controller, int cardId) {
        if (!(controller instanceof PlayerControllerHuman human) || !(human.getInputQueue().getInput() instanceof InputPassPriority)) return null;
        Player me = human.getPlayer();
        Card card = me.getGame().findById(cardId);
        Reason reason;
        try { reason = card == null ? null : explain(me, card); }
        catch (RuntimeException e) { return null; }
        return reason == null ? null : json(reason);
    }

    static String json(Reason reason) {
        JsonObject o = new JsonObject();
        o.addProperty("type", "toast");
        o.addProperty("title", reason.title());
        o.addProperty("text", reason.text());
        JsonArray cards = new JsonArray();
        for (Card c : reason.cards()) {
            JsonObject j = new JsonObject();
            j.addProperty("id", c.getId()); j.addProperty("name", c.getName());
            cards.add(j);
        }
        if (!cards.isEmpty()) o.add("cards", cards);
        return o.toString();
    }

    static Reason explain(Player me, Card card) {
        boolean inHand = card.isInZone(ZoneType.Hand) && me.equals(card.getOwner());
        boolean onField = card.isInZone(ZoneType.Battlefield) && me.equals(card.getController());
        if (!inHand && !onField) return null;
        // O mesmo teste do Forge ao receber o clique. Havendo o que jogar, o clique segue, a não ser que toda jogada
        // esteja proibida por um efeito estático: o Forge oferece a mágica e só a recusa depois, sem dizer nada.
        List<SpellAbility> playable = card.getAllPossibleAbilities(me, true);
        if (!playable.isEmpty()) return forbidden(me, card, playable);
        return inHand ? fromHand(me, card) : fromField(me, card);
    }

    /** O motivo, se cada jogada oferecida esbarra numa carta que a proíbe (Myrel e afins); senão null. */
    private static Reason forbidden(Player me, Card card, List<SpellAbility> playable) {
        Reason first = null;
        for (SpellAbility sa : playable) {
            if (sa.isManaAbility()) return null;
            Reason r = blocked(me, card, sa);
            if (r == null) return null;
            if (first == null) first = r;
        }
        return first;
    }

    private static Reason blocked(Player me, Card card, SpellAbility sa) {
        String name = AttackExplain.name(card);
        if (sa.isLandAbility()) {
            Card host = landBlocker(me, card);
            return host == null ? null : new Reason("Não dá para jogar o terreno", "Você não pode jogar terrenos agora, por causa de " + AttackExplain.name(host) + ".", List.of(host));
        }
        if (sa.isSpell()) {
            Card host = castBlocker(me, card, sa);
            return host == null ? null : new Reason("Não dá para conjurar", "Você não pode conjurar " + name + " agora, por causa de " + AttackExplain.name(host) + ".", List.of(host));
        }
        Card host = activateBlocker(me, card, sa);
        return host == null ? null : new Reason("Não dá para ativar", "Você não pode ativar habilidades de " + name + " agora, por causa de " + AttackExplain.name(host) + ".", List.of(host));
    }

    private static Reason fromHand(Player me, Card card) {
        String name = AttackExplain.name(card);
        List<SpellAbility> spells = new ArrayList<>(), activated = new ArrayList<>();
        for (SpellAbility sa : candidates(card, me)) {
            if (sa.isManaAbility() || sa.isLandAbility()) continue;
            (sa.isSpell() ? spells : activated).add(sa);
        }
        for (SpellAbility sa : spells) {
            Card host = castBlocker(me, card, sa);
            if (host != null) return new Reason("Não dá para conjurar", "Você não pode conjurar " + name + " agora, por causa de " + AttackExplain.name(host) + ".", List.of(host));
        }
        for (SpellAbility sa : activated) {
            Card host = activateBlocker(me, card, sa);
            if (host != null) return new Reason("Não dá para ativar", "Você não pode ativar habilidades de " + name + " agora, por causa de " + AttackExplain.name(host) + ".", List.of(host));
        }
        boolean landOnly = card.isLand() && spells.isEmpty();
        if (landOnly) return land(me, card, name);
        Game game = me.getGame();
        if (!spells.isEmpty() && spells.stream().noneMatch(sa -> sa.withFlash(card, me) || instant(sa, card)) && !me.canCastSorcery()) {
            if (!game.getPhaseHandler().isPlayerTurn(me)) return new Reason("Não dá para conjurar", "Você só pode conjurar " + name + " no seu turno, na fase principal, com a pilha vazia.", List.of());
            if (!game.getStack().isEmpty()) return new Reason("Não dá para conjurar", "Você só pode conjurar " + name + " com a pilha vazia: espere as mágicas e habilidades da pilha resolverem.", List.of());
            return new Reason("Não dá para conjurar", "Você só pode conjurar " + name + " na sua fase principal, com a pilha vazia.", List.of());
        }
        return new Reason("Não dá para jogar", "Você não pode jogar " + name + " agora.", List.of());
    }

    /**
     * As jogadas da carta na mão, sem o filtro de "pode jogar agora" do Forge (que tira justamente as proibidas):
     * a face atual, a face de trás da dupla face modal e a outra metade (Aventura e afins).
     */
    private static List<SpellAbility> candidates(Card card, Player me) {
        List<SpellAbility> out = new ArrayList<>(card.getSpellAbilities());
        if (card.isModal() && card.hasState(CardStateName.Backside))
            for (SpellAbility sa : card.getState(CardStateName.Backside).getSpellAbilities()) if (sa.isSpell() || sa.isLandAbility()) out.add(sa);
        if (card.hasState(CardStateName.Secondary) && card.getCurrentStateName() == CardStateName.Original)
            for (SpellAbility sa : card.getState(CardStateName.Secondary).getSpellAbilities()) if (sa.isSpell()) out.add(sa);
        for (SpellAbility sa : out) sa.setActivatingPlayer(me);
        return out;
    }

    private static boolean instant(SpellAbility sa, Card card) {
        return sa.getCardState() != null ? sa.getCardState().getType().isInstant() : card.isInstant();
    }

    private static Reason land(Player me, Card card, String name) {
        Game game = me.getGame();
        Card host = landBlocker(me, card);
        if (host != null) return new Reason("Não dá para jogar o terreno", "Você não pode jogar terrenos agora, por causa de " + AttackExplain.name(host) + ".", List.of(host));
        if (!game.getPhaseHandler().isPlayerTurn(me)) return new Reason("Não dá para jogar o terreno", "Terrenos só podem ser jogados no seu turno, na fase principal, com a pilha vazia.", List.of());
        if (!me.canCastSorcery()) return new Reason("Não dá para jogar o terreno", game.getStack().isEmpty()
            ? "Terrenos só podem ser jogados na sua fase principal."
            : "Terrenos só podem ser jogados com a pilha vazia: espere as mágicas e habilidades da pilha resolverem.", List.of());
        if (!me.getMaxLandPlaysInfinite() && me.getLandsPlayedThisTurn() >= me.getMaxLandPlays())
            return new Reason("Não dá para jogar o terreno", me.getMaxLandPlays() == 1
                ? "Você já jogou um terreno neste turno."
                : "Você já jogou os " + me.getMaxLandPlays() + " terrenos que pode jogar neste turno.", List.of());
        return new Reason("Não dá para jogar o terreno", "Você não pode jogar " + name + " agora.", List.of());
    }

    private static Reason fromField(Player me, Card card) {
        List<SpellAbility> activated = new ArrayList<>();
        for (SpellAbility sa : card.getSpellAbilities()) if (sa.isActivatedAbility() && !sa.isManaAbility()) activated.add(sa);
        if (activated.isEmpty()) return null;
        String name = AttackExplain.name(card);
        for (SpellAbility sa : activated) {
            Card host = activateBlocker(me, card, sa);
            if (host != null) return new Reason("Não dá para ativar", "Você não pode ativar habilidades de " + name + " agora, por causa de " + AttackExplain.name(host) + ".", List.of(host));
        }
        if (activated.stream().allMatch(sa -> sa.getRestrictions().isSorcerySpeed()) && !me.canCastSorcery())
            return new Reason("Não dá para ativar", "As habilidades de " + name + " só podem ser ativadas na sua fase principal, com a pilha vazia.", List.of());
        return null;
    }

    /** A carta cujo efeito estático proíbe conjurar esta mágica (o mesmo laço de {@link StaticAbilityCantBeCast}). */
    private static Card castBlocker(Player me, Card card, SpellAbility spell) {
        CardCollection hosts = new CardCollection(me.getGame().getCardsIn(ZoneType.STATIC_ABILITIES_SOURCE_ZONES));
        hosts.add(card);
        for (Card host : hosts) for (StaticAbility st : host.getStaticAbilities())
            if (st.checkConditions(StaticAbilityMode.CantBeCast) && StaticAbilityCantBeCast.applyCantBeCastAbility(st, spell, card, me)) return host;
        return null;
    }

    private static Card activateBlocker(Player me, Card card, SpellAbility ability) {
        if (ability.isTrigger()) return null;
        for (Card host : me.getGame().getCardsIn(ZoneType.STATIC_ABILITIES_SOURCE_ZONES)) for (StaticAbility st : host.getStaticAbilities())
            if (st.checkConditions(StaticAbilityMode.CantBeActivated) && StaticAbilityCantBeCast.applyCantBeActivatedAbility(st, ability, card, me)) return host;
        return null;
    }

    private static Card landBlocker(Player me, Card card) {
        for (Card host : me.getGame().getCardsIn(ZoneType.STATIC_ABILITIES_SOURCE_ZONES)) for (StaticAbility st : host.getStaticAbilities())
            if (st.checkConditions(StaticAbilityMode.CantPlayLand) && StaticAbilityCantBeCast.applyCantPlayLandAbility(st, card, me)) return host;
        return null;
    }
}
