package mesadeduelo.bridge;

import java.util.EnumSet;
import java.util.Set;
import java.util.function.Supplier;
import java.util.concurrent.CountDownLatch;
import com.google.common.eventbus.Subscribe;
import forge.ai.AvailableActions;
import forge.game.Game;

import forge.game.GameView;
import forge.game.combat.CombatView;
import forge.game.event.GameEvent;
import forge.game.event.GameEventTurnPhase;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.PlayerView;
import forge.gamemodes.match.YieldUpdate;
import forge.gamemodes.net.IRemote;
import forge.gamemodes.net.ProtocolGuiGame;
import forge.interfaces.IGameController;
import forge.localinstance.properties.ForgePreferences.FPref;
import forge.trackable.TrackableCollection;

/**
 * Tela do jogador humano no lado do Forge. Reaproveita o ProtocolGuiGame (que já converte cada chamada
 * do IGuiGame num evento) e só decide em quais fases o jogador quer parar, como no Arena.
 */
final class WebGuiGame extends ProtocolGuiGame {
    /** Fases do próprio turno em que o jogador recebe prioridade com a pilha vazia. */
    private static final Set<PhaseType> STOPS_MINE = EnumSet.of(PhaseType.MAIN1, PhaseType.MAIN2, PhaseType.COMBAT_DECLARE_BLOCKERS);
    /**
     * Fases do turno do oponente: o início do combate (virar ou remover uma criatura antes que ela ataque),
     * depois dos ataques (remover um atacante, criatura com lampejo para bloquear),
     * depois dos bloqueios e a etapa final, a janela clássica para instantâneas antes do seu turno.
     * No nível "Só com ações" (e nos mais rápidos), o Forge só para nelas quando o jogador tem algo que pode usar agora.
     */
    private static final Set<PhaseType> STOPS_THEIRS = EnumSet.of(PhaseType.COMBAT_BEGIN, PhaseType.COMBAT_DECLARE_ATTACKERS,
        PhaseType.COMBAT_DECLARE_BLOCKERS, PhaseType.END_OF_TURN);
    /** Etapas do turno de um oponente que o jogador pode marcar para segurar a prioridade (as que dão prioridade). */
    static final Set<PhaseType> HOLDABLE = EnumSet.of(PhaseType.UPKEEP, PhaseType.DRAW, PhaseType.MAIN1, PhaseType.COMBAT_BEGIN,
        PhaseType.COMBAT_DECLARE_ATTACKERS, PhaseType.COMBAT_DECLARE_BLOCKERS, PhaseType.COMBAT_DAMAGE, PhaseType.COMBAT_END,
        PhaseType.MAIN2, PhaseType.END_OF_TURN);
    /**
     * Etapas do próprio turno que só param quando uma permanente sua tem uma habilidade ativada (fora as de mana)
     * que pode ser usada agora: a janela antes da compra. Uma carta na mão sozinha não para aqui.
     */
    private static final Set<PhaseType> STOPS_MINE_WITH_ABILITY = EnumSet.of(PhaseType.UPKEEP, PhaseType.DRAW);
    private static final long ABILITY_SCAN_MS = 1000;

    private volatile PlayerView me;
    /** Nível de passar automaticamente do jogador ({@link PassLevel}). */
    private final Supplier<PassLevel> level;
    /** Etapas marcadas pelo jogador no turno dos oponentes: nelas o jogo para em qualquer nível, mesmo sem ações. */
    private final Supplier<Set<PhaseType>> held;
    /** O jogo está numa etapa marcada: a passagem automática fica desligada até a etapa acabar. */
    private volatile boolean holding;
    /** Turno em que o jogador pediu "Passar até o fim do turno"; null sem o atalho ligado. */
    private volatile PlayerView passingTurn;
    /** Etapa do próprio turno aberta porque havia uma habilidade para usar nela; null fora dela. */
    private volatile PhaseType openedForAbility;
    private volatile Game watched;

    private final MatchLifecycle lifecycle;
    private final Supplier<Game> game;

    /** Thread que está pedindo a prioridade (veja {@link #watchSkip}) e se ela pulou o prompt. */
    private volatile Thread watching;
    private volatile boolean skipped;

    /** Thread do jogo, antes de pedir a prioridade: a partir daqui {@link #skipped} diz se o Forge passou sem perguntar. */
    void watchSkip() { skipped = false; watching = Thread.currentThread(); }
    boolean skipped() { watching = null; return skipped; }

    /** O Forge chama isto, na thread do jogo, quando passa a prioridade sem abrir o prompt. */
    @Override public void awaitNextInput() {
        if (Thread.currentThread() == watching) skipped = true;
        super.awaitNextInput();
    }

    WebGuiGame(IRemote remote, Supplier<PassLevel> level, MatchLifecycle lifecycle, Supplier<Game> game) {
        this(remote, level, Set::of, lifecycle, game);
    }

    WebGuiGame(IRemote remote, Supplier<PassLevel> level, Supplier<Set<PhaseType>> held, MatchLifecycle lifecycle, Supplier<Game> game) {
        super(remote);
        this.level = level;
        this.held = held;
        this.lifecycle = lifecycle;
        this.game = game;
    }

    @Override
    public void openView(TrackableCollection<PlayerView> myPlayers) {
        me = myPlayers.iterator().next();
        super.openView(myPlayers);
        watch(game.get());
        // Com um ProtocolGuiGame o PlayerControllerHuman lê os pulos de fase do seu YieldController,
        // não deste método; por isso as paradas são enviadas a ele explicitamente.
        IGameController controller = getGameController(me);
        if (controller == null || getGameView() == null) return;
        // Per-player defaults: skip only when Forge proves there is no legal non-mana action.
        // Presentation timing must never create extra priority confirmations.
        syncAutoPass();
        controller.applyYieldUpdate(new YieldUpdate.SetYieldPref(FPref.YIELD_AUTO_PASS_RESPECTS_INTERRUPTS, "false"));
        // "Passar até o fim do turno" volta ao nível quando algo afeta o jogador: algo que mira ele ou as permanentes
        // dele, uma remoção em massa ou um ataque contra ele. Uma mágica qualquer do oponente não interrompe.
        controller.applyYieldUpdate(new YieldUpdate.SetYieldPref(FPref.YIELD_INTERRUPT_ON_TARGETING, "true"));
        controller.applyYieldUpdate(new YieldUpdate.SetYieldPref(FPref.YIELD_INTERRUPT_ON_MASS_REMOVAL, "true"));
        controller.applyYieldUpdate(new YieldUpdate.SetYieldPref(FPref.YIELD_INTERRUPT_ON_ATTACKERS, "true"));
        syncSkips();
    }

    /**
     * "Passar até o fim do turno": o Forge passa toda prioridade até o turno acabar, até algo afetar o jogador
     * (as interrupções acima) ou até uma etapa marcada. Na thread do jogo (EDT), com a prioridade aberta.
     * Uma mágica do oponente que não afeta o jogador não interrompe; o "Resolver todos" religa essa interrupção.
     */
    void passUntilEndOfTurn(IGameController controller) {
        GameView view = getGameView();
        if (controller == null || view == null || me == null) return;
        passingTurn = view.getPlayerTurn();
        controller.applyYieldUpdate(new YieldUpdate.SetYieldPref(FPref.YIELD_INTERRUPT_ON_OPPONENT_SPELL, "false"));
        controller.applyYieldUpdate(new YieldUpdate.SetAutoPassUntilEndOfTurn(me, true));
    }

    /** "Resolver todos" para quando alguém acrescenta algo à pilha, como antes. */
    void resolveAll(IGameController controller) {
        if (controller == null || me == null) return;
        controller.applyYieldUpdate(new YieldUpdate.SetYieldPref(FPref.YIELD_INTERRUPT_ON_OPPONENT_SPELL, "true"));
        controller.applyYieldUpdate(new YieldUpdate.StackYield(me, true, true));
    }

    /** Desliga o atalho e volta ao nível escolhido. */
    void stopPassingTurn() {
        passingTurn = null;
        IGameController controller = me == null ? null : getGameController(me);
        if (controller != null) controller.applyYieldUpdate(new YieldUpdate.SetAutoPassUntilEndOfTurn(me, false));
    }

    /** O atalho "Passar até o fim do turno" está ligado (o Forge ainda não o desligou por uma interrupção). */
    boolean passingTurn() {
        if (passingTurn == null) return false;
        IGameController controller = me == null ? null : getGameController(me);
        boolean active = controller instanceof forge.player.PlayerControllerHuman human && human.getYieldController().autoPassUntilEndOfTurn();
        if (!active) passingTurn = null;
        return active;
    }

    /** O jogo está parado numa etapa que o jogador marcou no turno de um oponente. */
    boolean holding() { return holding; }

    /** Reaplica as paradas depois que o jogador muda as etapas marcadas, inclusive na etapa em que o jogo está. */
    void stopsChanged() {
        GameView view = getGameView();
        holding = view != null && holds(view.getPlayerTurn(), view.getPhase());
        syncSkips();
        syncAutoPass();
    }

    /** O nível mudou: as etapas puladas e a passagem automática do Forge acompanham. */
    void levelChanged() {
        syncSkips();
        syncAutoPass();
    }

    /** Envia ao Forge a passagem sem ações do nível do jogador, desligada enquanto o jogo segura a prioridade. */
    void syncAutoPass() {
        IGameController controller = me == null ? null : getGameController(me);
        if (controller == null) return;
        boolean pass = level.get().autoPassNoActions() && !holding;
        controller.applyYieldUpdate(new YieldUpdate.SetYieldPref(FPref.YIELD_AUTO_PASS_NO_ACTIONS, Boolean.toString(pass)));
    }

    private void syncSkips() {
        IGameController controller = me == null ? null : getGameController(me);
        if (controller == null || getGameView() == null) return;
        for (PlayerView p : getGameView().getPlayers()) {
            for (PhaseType ph : PhaseType.values()) {
                controller.applyYieldUpdate(new YieldUpdate.SkipPhase(p, ph, isUiSetToSkipPhase(p, ph)));
            }
        }
    }

    /**
     * A troca de etapa chega no fio do jogo antes de alguém receber prioridade nela, então a passagem automática
     * já está desligada quando o Forge decide se para nesta etapa, e volta assim que a etapa acaba.
     */
    private void watch(Game next) {
        if (next == null || next == watched) return;
        watched = next;
        holding = false;
        openedForAbility = null;
        next.subscribeToEvents(new Object() {
            @Subscribe public void receive(GameEvent event) {
                if (watched != next || !(event instanceof GameEventTurnPhase step)) return;
                openForAbility(next, step.playerTurn(), step.phase());
                boolean hold = holds(step.playerTurn(), step.phase());
                // O atalho acaba com o turno em que foi pedido, e uma etapa marcada também o interrompe.
                PlayerView passing = passingTurn;
                if (passing != null && (hold || !passing.equals(step.playerTurn()))) stopPassingTurn();
                if (hold == holding) return;
                holding = hold;
                syncAutoPass();
            }
        });
    }

    /** Na sua manutenção e na sua compra, decide antes da prioridade se a etapa para ou é pulada. */
    private void openForAbility(Game g, PlayerView turn, PhaseType phase) {
        PlayerView mine = me;
        boolean candidate = mine != null && mine.equals(turn) && STOPS_MINE_WITH_ABILITY.contains(phase);
        PhaseType was = openedForAbility;
        if (!candidate && was == null) return;
        Player player = candidate ? g.getPlayer(mine) : null;
        PhaseType open = player != null && AvailableActions.computeOnBattlefield(player, ABILITY_SCAN_MS) ? phase : null;
        openedForAbility = open;
        IGameController controller = getGameController(mine);
        if (controller == null) return;
        for (PhaseType ph : STOPS_MINE_WITH_ABILITY) {
            if (ph == was || ph == open) controller.applyYieldUpdate(new YieldUpdate.SkipPhase(mine, ph, isUiSetToSkipPhase(mine, ph)));
        }
    }

    private boolean holds(PlayerView turn, PhaseType phase) {
        PlayerView mine = me;
        return mine != null && turn != null && phase != null && !mine.equals(turn) && held.get().contains(phase);
    }

    @Override
    public void awaitInput(CountDownLatch done) throws InterruptedException {
        lifecycle.awaitInput(game.get(), me == null ? -1 : me.getId(), done);
    }

    @Override
    public boolean isUiSetToSkipPhase(PlayerView playerTurn, PhaseType phase) {
        boolean mine = me != null && me.equals(playerTurn);
        if (mine && phase == openedForAbility) return false;
        if (!mine && held.get().contains(phase)) return false;
        // Sem atacantes não há a que responder depois dos ataques: o oponente que não atacou não gera pedido.
        if (!mine && phase == PhaseType.COMBAT_DECLARE_ATTACKERS) {
            CombatView combat = getGameView() == null ? null : getGameView().getCombat();
            if (combat == null || combat.getNumAttackers() == 0) return true;
        }
        // "Parar sempre": toda etapa que dá prioridade para, nos dois turnos.
        if (level.get() == PassLevel.SEMPRE) return false;
        return !(mine ? STOPS_MINE : STOPS_THEIRS).contains(phase);
    }
}
