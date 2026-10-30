package mesadeduelo.bridge;

import forge.game.GameEntityView;
import forge.game.GameView;
import forge.game.card.CardView;
import forge.game.combat.CombatView;
import forge.game.phase.PhaseType;
import forge.game.player.PlayerView;
import forge.game.spellability.StackItemView;

/**
 * Nível de passar a prioridade sozinho, do mais cuidadoso ao mais rápido. Só decide pedidos de prioridade:
 * ataques, bloqueios e escolhas são outros pedidos e sempre esperam o jogador. As etapas marcadas na trilha de
 * fases ("holding") param em qualquer nível.
 */
enum PassLevel {
    /** Recebe a prioridade em toda etapa que dá prioridade, mesmo sem ações. */
    SEMPRE("sempre"),
    /** O Forge passa quando não há nada que dê para usar agora (o padrão). */
    ACOES("acoes"),
    /** Também passa no turno dos outros e com algo na pilha; no seu turno com a pilha vazia, para. */
    RESPOSTAS("respostas"),
    /** Passa tudo, menos as fases principais do seu turno, até algo mirar você ou suas permanentes, ou você ser atacado. */
    AFETA("afeta");

    final String id;

    PassLevel(String id) { this.id = id; }

    /** O "Passar automaticamente" do Forge (passa quando não há ações). */
    boolean autoPassNoActions() { return this != SEMPRE; }

    /** O antigo "Passar respostas" ligado. */
    boolean passesResponses() { return this == RESPOSTAS || this == AFETA; }

    /** O nível pelo nome do protocolo; null se não existe. */
    static PassLevel of(String id) {
        for (PassLevel level : values()) if (level.id.equals(id)) return level;
        return null;
    }

    /**
     * Mensagens de clientes antigos ainda mandam os dois interruptores: cada um muda só a parte dele do nível.
     * Passar automaticamente desligado é "Parar sempre"; Passar respostas ligado é "Respostas".
     */
    static PassLevel fromLegacy(PassLevel current, Boolean autoPass, Boolean responses) {
        PassLevel level = current;
        if (autoPass != null) level = !autoPass ? SEMPRE : level == SEMPRE ? ACOES : level;
        if (responses != null) level = responses ? (level.passesResponses() ? level : RESPOSTAS) : (level.passesResponses() ? ACOES : level);
        return level;
    }

    /**
     * A ponte responde OK sozinha a este pedido de prioridade? Os níveis "Parar sempre" e "Só com ações" nunca:
     * neles quem passa é o próprio Forge, pela regra de ações disponíveis.
     */
    boolean passes(boolean holding, boolean myTurn, boolean stackEmpty, PhaseType phase, boolean affected) {
        if (holding) return false;
        return switch (this) {
            case SEMPRE, ACOES -> false;
            case RESPOSTAS -> !myTurn || !stackEmpty;
            case AFETA -> !affected && (!myTurn || !stackEmpty || (phase != PhaseType.MAIN1 && phase != PhaseType.MAIN2));
        };
    }

    /** Algo mira você ou suas permanentes na pilha, ou você está sendo atacado no combate de outro jogador. */
    static boolean affects(GameView view, PlayerView me) {
        if (view == null || me == null) return false;
        if (view.getStack() != null) for (StackItemView item : view.getStack()) {
            if (!me.equals(item.getActivatingPlayer()) && targets(item, me)) return true;
        }
        PhaseType phase = view.getPhase();
        boolean combat = phase == PhaseType.COMBAT_DECLARE_ATTACKERS || phase == PhaseType.COMBAT_DECLARE_BLOCKERS;
        return combat && !me.equals(view.getPlayerTurn()) && attacked(view.getCombat(), me);
    }

    private static boolean targets(StackItemView item, PlayerView me) {
        for (StackItemView each = item; each != null; each = each.getSubInstance()) {
            if (each.getTargetPlayers() != null) for (PlayerView p : each.getTargetPlayers()) if (me.equals(p)) return true;
            if (each.getTargetCards() != null) for (CardView c : each.getTargetCards()) if (me.equals(c.getController())) return true;
        }
        return false;
    }

    private static boolean attacked(CombatView combat, PlayerView me) {
        if (combat == null) return false;
        if (!combat.getAttackersOf(me).isEmpty()) return true;
        for (GameEntityView defender : combat.getDefenders()) {
            if (defender instanceof CardView card && me.equals(card.getController()) && !combat.getAttackersOf(card).isEmpty()) return true;
        }
        return false;
    }
}
