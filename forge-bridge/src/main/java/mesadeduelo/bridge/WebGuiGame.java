package mesadeduelo.bridge;

import java.util.EnumSet;
import java.util.Set;
import java.util.function.BooleanSupplier;
import java.util.function.Supplier;
import java.util.concurrent.CountDownLatch;
import com.google.common.eventbus.Subscribe;
import forge.game.Game;

import forge.game.GameView;
import forge.game.combat.CombatView;
import forge.game.event.GameEvent;
import forge.game.event.GameEventTurnPhase;
import forge.game.phase.PhaseType;
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
     * Fases do turno do oponente: depois dos ataques (remover um atacante, criatura com lampejo para bloquear),
     * depois dos bloqueios e a etapa final, a janela clássica para instantâneas antes do seu turno.
     * Com "Passar automaticamente" ligado, o Forge só para nelas quando o jogador tem algo que pode usar agora.
     */
    private static final Set<PhaseType> STOPS_THEIRS = EnumSet.of(PhaseType.COMBAT_DECLARE_ATTACKERS, PhaseType.COMBAT_DECLARE_BLOCKERS, PhaseType.END_OF_TURN);
    /** Etapas do turno de um oponente que o jogador pode marcar para segurar a prioridade (as que dão prioridade). */
    static final Set<PhaseType> HOLDABLE = EnumSet.of(PhaseType.UPKEEP, PhaseType.DRAW, PhaseType.MAIN1, PhaseType.COMBAT_BEGIN,
        PhaseType.COMBAT_DECLARE_ATTACKERS, PhaseType.COMBAT_DECLARE_BLOCKERS, PhaseType.COMBAT_DAMAGE, PhaseType.COMBAT_END,
        PhaseType.MAIN2, PhaseType.END_OF_TURN);

    private volatile PlayerView me;
    private final BooleanSupplier autoPassNoActions;
    /** Etapas marcadas pelo jogador no turno dos oponentes: nelas o jogo para mesmo sem ações e com "Passar respostas". */
    private final Supplier<Set<PhaseType>> held;
    /** O jogo está numa etapa marcada: a passagem automática fica desligada até a etapa acabar. */
    private volatile boolean holding;
    private volatile Game watched;

    private final MatchLifecycle lifecycle;
    private final Supplier<Game> game;

    WebGuiGame(IRemote remote, BooleanSupplier autoPassNoActions, MatchLifecycle lifecycle, Supplier<Game> game) {
        this(remote, autoPassNoActions, Set::of, lifecycle, game);
    }

    WebGuiGame(IRemote remote, BooleanSupplier autoPassNoActions, Supplier<Set<PhaseType>> held, MatchLifecycle lifecycle, Supplier<Game> game) {
        super(remote);
        this.autoPassNoActions = autoPassNoActions;
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
        syncSkips();
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

    /** Envia ao Forge o "Passar automaticamente" do jogador, desligado enquanto o jogo segura a prioridade. */
    void syncAutoPass() {
        IGameController controller = me == null ? null : getGameController(me);
        if (controller == null) return;
        boolean pass = autoPassNoActions.getAsBoolean() && !holding;
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
        next.subscribeToEvents(new Object() {
            @Subscribe public void receive(GameEvent event) {
                if (watched != next || !(event instanceof GameEventTurnPhase step)) return;
                boolean hold = holds(step.playerTurn(), step.phase());
                if (hold == holding) return;
                holding = hold;
                syncAutoPass();
            }
        });
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
        if (!mine && held.get().contains(phase)) return false;
        // Sem atacantes não há a que responder depois dos ataques: o oponente que não atacou não gera pedido.
        if (!mine && phase == PhaseType.COMBAT_DECLARE_ATTACKERS) {
            CombatView combat = getGameView() == null ? null : getGameView().getCombat();
            if (combat == null || combat.getNumAttackers() == 0) return true;
        }
        return !(mine ? STOPS_MINE : STOPS_THEIRS).contains(phase);
    }
}
