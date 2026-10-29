package mesadeduelo.bridge;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;
import java.util.function.Supplier;
import forge.card.ColorSet;
import forge.card.ICardFace;
import forge.card.mana.ManaCost;
import forge.card.mana.ManaCostShard;
import forge.game.Game;
import forge.game.GameEntity;
import forge.game.card.Card;
import forge.game.card.CardCollection;
import forge.game.card.CardCollectionView;
import forge.game.card.CardView;
import forge.game.card.CounterType;
import forge.game.player.DelayedReveal;
import forge.game.player.Player;
import forge.game.player.PlayerActionConfirmMode;
import forge.game.player.PlayerController.BinaryChoiceType;
import forge.game.replacement.ReplacementEffect;
import forge.game.spellability.AbilitySub;
import forge.game.spellability.OptionalCostValue;
import forge.game.spellability.SpellAbility;
import forge.game.trigger.WrappedAbility;
import forge.player.LobbyPlayerHuman;
import forge.player.PlayerControllerHuman;
import forge.util.GuiDisplayUtil;
import forge.util.collect.FCollectionView;

/**
 * Controlador humano que lembra qual carta está pedindo a decisão em curso (conjurar, ativar, um gatilho, uma
 * escolha do efeito), para a mesa mostrar de onde vem cada pergunta ou escolha. O Forge só cita a carta em
 * alguns pedidos; aqui ela vem de quem chamou a escolha.
 */
final class AskingController extends PlayerControllerHuman {
    private volatile CardView asking;
    /** Desfazer da sala; null quando a partida foi criada sem ele. */
    private final UndoHistory undo;

    AskingController(Game game, Player player, LobbyPlayerHuman lobby) { this(game, player, lobby, null); }
    AskingController(Game game, Player player, LobbyPlayerHuman lobby, UndoHistory undo) { super(game, player, lobby); this.undo = undo; }

    /** A carta da decisão em curso, ou {@code null} fora de uma (prioridade comum). */
    CardView asking() { return asking; }

    private <T> T asking(Card host, Supplier<T> choice) {
        CardView previous = asking;
        if (host != null) asking = host.getView();
        try { return choice.get(); } finally { asking = previous; }
    }
    private <T> T asking(SpellAbility sa, Supplier<T> choice) { return asking(sa == null ? null : sa.getHostCard(), choice); }

    /** Jogador humano da mesa: cria o {@link AskingController} no lugar do controlador padrão. */
    static final class Lobby extends LobbyPlayerHuman {
        private final UndoHistory undo;
        Lobby(String name) { this(name, null); }
        Lobby(String name, UndoHistory undo) { super(name); this.undo = undo; }
        @Override public Player createIngamePlayer(Game game, int id) {
            Player player = new Player(GuiDisplayUtil.personalizeHuman(getName()), game, id);
            player.setFirstController(new AskingController(game, player, this, undo));
            return player;
        }
    }

    /**
     * Prioridade com o desfazer ligado: guarda o jogo antes do prompt e, depois, o que o jogador decidiu. Um pedido de
     * desfazer aprovado volta o jogo aqui, na thread do jogo; a lista vazia faz o Forge abrir a prioridade de novo
     * (para quem a tinha no retrato).
     */
    @Override public List<SpellAbility> chooseSpellAbilityToPlay() {
        if (undo == null) return super.chooseSpellAbilityToPlay();
        if (undo.applyPending(getGame()) != null) return java.util.Collections.emptyList();
        UndoHistory.Step step = undo.capture(getGame(), getPlayer());
        WebGuiGame gui = getGui() instanceof WebGuiGame w ? w : null;
        if (gui != null) gui.watchSkip();
        List<SpellAbility> chosen = super.chooseSpellAbilityToPlay();
        // Sem prompt (passe automático ou fase pulada) não é uma decisão do jogador.
        boolean skipped = gui != null && gui.skipped();
        if (undo.applyPending(getGame()) != null) return java.util.Collections.emptyList();
        if (!skipped) undo.decided(step, chosen);
        return chosen;
    }

    // Conjurar, ativar e gatilhos: tudo o que se pergunta até ir para a pilha (modos, X, custos opcionais, alvos).
    @Override public boolean playChosenSpellAbility(SpellAbility sa) { return untapIfUndone(() -> asking(sa, () -> super.playChosenSpellAbility(sa))); }
    @Override public boolean playSaFromPlayEffect(SpellAbility sa) { return untapIfUndone(() -> asking(sa, () -> super.playSaFromPlayEffect(sa))); }
    @Override public boolean playTrigger(Card host, WrappedAbility wrapper, boolean isMandatory) { return asking(host, () -> super.playTrigger(host, wrapper, isMandatory)); }
    @Override public boolean confirmTrigger(WrappedAbility wrapper) { return asking(wrapper.getHostCard(), () -> super.confirmTrigger(wrapper)); }
    @Override public boolean chooseTargetsFor(SpellAbility sa) { return asking(sa, () -> super.chooseTargetsFor(sa)); }
    @Override public boolean confirmReplacementEffect(ReplacementEffect effect, SpellAbility effectSA, GameEntity affected, String question) {
        return asking(effect.getHostCard(), () -> super.confirmReplacementEffect(effect, effectSA, affected, question));
    }

    /**
     * Artefatos virados no improvisar (e no dobrar água) da conjuração em curso. Ao desfazer uma conjuração, o Forge
     * só desvira as criaturas da convocação; estes ficariam virados sem ter pagado nada.
     */
    private final List<Card> tappedToPay = new java.util.ArrayList<>();

    @Override public Map<Card, ManaCostShard> chooseCardsForConvokeOrImprovise(SpellAbility sa, ManaCost manaCost, CardCollectionView untappedCards,
                                                                             boolean artifacts, boolean creatures, Integer maxReduction) {
        // Artefatos (improvisar, dobrar água) só pagam {1}: sem custo genérico, o Forge pediria uma escolha que não serve para nada.
        if (artifacts && manaCost.getGenericCost() == 0) return new java.util.HashMap<>();
        Map<Card, ManaCostShard> chosen = asking(sa, () -> super.chooseCardsForConvokeOrImprovise(sa, manaCost, untappedCards, artifacts, creatures, maxReduction));
        if (artifacts) tappedToPay.addAll(chosen.keySet());
        return chosen;
    }

    /** Só o que foi virado nesta conjuração: outra pode começar no meio dela (uma habilidade ativada ao pagar). */
    private boolean untapIfUndone(Supplier<Boolean> play) {
        int from = tappedToPay.size();
        try {
            boolean played = play.get();
            if (!played) for (Card c : tappedToPay.subList(from, tappedToPay.size())) if (c.isTapped()) c.setTapped(false);
            return played;
        } finally {
            tappedToPay.subList(from, tappedToPay.size()).clear();
        }
    }

    // Escolhas pedidas por um efeito, com a habilidade que pede.
    @Override public Integer announceRequirements(SpellAbility sa, int min, int max, String announce) { return asking(sa, () -> super.announceRequirements(sa, min, max, announce)); }
    @Override public List<OptionalCostValue> chooseOptionalCosts(SpellAbility sa, List<OptionalCostValue> costs) { return asking(sa, () -> super.chooseOptionalCosts(sa, costs)); }
    @Override public List<AbilitySub> chooseModeForAbility(SpellAbility sa, List<AbilitySub> possible, int min, int num, boolean allowRepeat) {
        return asking(sa, () -> super.chooseModeForAbility(sa, possible, min, num, allowRepeat));
    }
    @Override public boolean confirmAction(SpellAbility sa, PlayerActionConfirmMode mode, String message, List<String> options, Card cardToShow, Map<String, Object> params) {
        return asking(sa, () -> super.confirmAction(sa, mode, message, options, cardToShow, params));
    }
    @Override public boolean chooseBinary(SpellAbility sa, String question, BinaryChoiceType kind, Boolean defaultVal) { return asking(sa, () -> super.chooseBinary(sa, question, kind, defaultVal)); }
    @Override public CardCollectionView choosePermanentsToSacrifice(SpellAbility sa, int min, int max, CardCollectionView valid, String message) {
        return asking(sa, () -> super.choosePermanentsToSacrifice(sa, min, max, valid, message));
    }
    @Override public CardCollectionView choosePermanentsToDestroy(SpellAbility sa, int min, int max, CardCollectionView valid, String message) {
        return asking(sa, () -> super.choosePermanentsToDestroy(sa, min, max, valid, message));
    }
    @Override public CardCollectionView chooseCardsForEffect(CardCollectionView list, SpellAbility sa, String title, int min, int max, boolean isOptional, Map<String, Object> params) {
        return asking(sa, () -> super.chooseCardsForEffect(list, sa, title, min, max, isOptional, params));
    }
    @Override public CardCollection chooseCardsForEffectMultiple(Map<String, CardCollection> validMap, SpellAbility sa, String title, boolean isOptional) {
        return asking(sa, () -> super.chooseCardsForEffectMultiple(validMap, sa, title, isOptional));
    }
    @Override public CardCollectionView chooseCardsToDiscardFrom(Player p, SpellAbility sa, CardCollection valid, int min, int max, CardCollectionView visible) {
        return asking(sa, () -> super.chooseCardsToDiscardFrom(p, sa, valid, min, max, visible));
    }
    @Override public <T extends GameEntity> T chooseSingleEntityForEffect(FCollectionView<T> options, DelayedReveal reveal, SpellAbility sa, String title, boolean isOptional, Player targeted, Map<String, Object> params) {
        return asking(sa, () -> super.chooseSingleEntityForEffect(options, reveal, sa, title, isOptional, targeted, params));
    }
    @Override public <T extends GameEntity> List<T> chooseEntitiesForEffect(FCollectionView<T> options, int min, int max, DelayedReveal reveal, SpellAbility sa, String title, Player targeted, Map<String, Object> params) {
        return asking(sa, () -> super.chooseEntitiesForEffect(options, min, max, reveal, sa, title, targeted, params));
    }
    @Override public SpellAbility chooseSingleSpellForEffect(List<SpellAbility> spells, SpellAbility sa, String title, Map<String, Object> params) {
        return asking(sa, () -> super.chooseSingleSpellForEffect(spells, sa, title, params));
    }
    @Override public int chooseNumber(SpellAbility sa, String title, int min, int max) { return asking(sa, () -> super.chooseNumber(sa, title, min, max)); }
    @Override public int chooseNumber(SpellAbility sa, String title, List<Integer> choices, Player related) { return asking(sa, () -> super.chooseNumber(sa, title, choices, related)); }
    @Override public String chooseSomeType(String kind, SpellAbility sa, Collection<String> valid, boolean isOptional) { return asking(sa, () -> super.chooseSomeType(kind, sa, valid, isOptional)); }
    @Override public ColorSet chooseColors(String message, SpellAbility sa, int min, int max, ColorSet options) { return asking(sa, () -> super.chooseColors(message, sa, min, max, options)); }
    @Override public byte chooseColor(String message, SpellAbility sa, ColorSet colors) { return asking(sa, () -> super.chooseColor(message, sa, colors)); }
    @Override public CounterType chooseCounterType(List<CounterType> options, SpellAbility sa, String prompt, Map<String, Object> params) {
        return asking(sa, () -> super.chooseCounterType(options, sa, prompt, params));
    }
    @Override public String chooseProtectionType(SpellAbility sa, List<String> choices) { return asking(sa, () -> super.chooseProtectionType(sa, choices)); }
    @Override public String chooseCardName(SpellAbility sa, Predicate<ICardFace> cpp, String valid, String message) { return asking(sa, () -> super.chooseCardName(sa, cpp, valid, message)); }
    @Override public String chooseCardName(SpellAbility sa, List<ICardFace> faces, String message) { return asking(sa, () -> super.chooseCardName(sa, faces, message)); }
}
