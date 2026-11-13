package mesadeduelo.bridge;

import java.util.Arrays;
import java.util.Collections;
import java.util.EnumSet;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import forge.deck.Deck;
import forge.game.card.CardView;
import forge.gamemodes.match.Selection;
import forge.game.phase.PhaseType;
import forge.game.player.PlayerView;
import forge.game.player.RegisteredPlayer;
import forge.game.spellability.StackItemView;
import forge.gamemodes.match.HostedMatch;
import forge.gamemodes.match.input.InputPassPriority;
import forge.gamemodes.match.input.InputPayMana;
import forge.gamemodes.net.IRemote;
import forge.gamemodes.net.event.GuiGameEvent;
import forge.gamemodes.net.event.IdentifiableNetEvent;
import forge.gamemodes.net.event.NetEvent;
import forge.gui.FThreads;
import forge.interfaces.IGameController;
import forge.player.PlayerControllerHuman;
import forge.trackable.TrackableCollection;
import io.netty.channel.Channel;

/**
 * Assento de um jogador humano numa {@link Session}: a conexão, o deck, as preferências e o prompt atual do Forge
 * (mensagem, botões e o que dá para clicar), que o {@link Remote} recebe do {@code ProtocolGuiGame} do jogador.
 */
final class Seat {
    final Session session;
    volatile int index;
    /** Segredo para voltar ao assento depois de cair a conexão ({type:"rejoin", code, token}). */
    volatile String token = UUID.randomUUID().toString();
    volatile Channel channel;
    volatile String name;
    /**
     * Contra a IA, o nome é "Você" na mesa; este é o nome que o jogador usa (o das salas ou o apelido da conta), para o
     * histórico e a lista de partidas da área de admin. Null quando ele não tem nome.
     */
    volatile String nick;
    /** Deck do assento; numa sala que ainda não começou, null enquanto o jogador escolhe (veja {@link #taken}). */
    volatile Deck deck;
    /** Alguém está sentado aqui, com ou sem deck escolhido. */
    volatile boolean taken;
    /** Conta de quem joga neste assento (só com a conta conectada) e o id do deck salvo dela, para o histórico. */
    volatile String account;
    volatile String deckId;
    volatile boolean rematch;
    /** Tocou em Pronto na sala de espera; trocar de deck desfaz. A sala só começa com todos prontos. */
    volatile boolean confirmed;
    volatile boolean departed;
    /** Carta cuja arte representa o deck no lobby (sem comandante); null sem capa. */
    volatile String cover;
    /** Bracket que o jogador deu ao deck de Commander (1 a 5); 0 sem bracket. */
    volatile int bracket;
    /** Última mensagem pronta no lobby, para ninguém encher a sala de balões. */
    volatile long saidAt;
    /** Última carta apontada para a mesa ({@link CardPointer}). */
    volatile long pointedAt;
    /** Desistiu deste jogo (no Commander com vários jogadores, a mesa tira o assento de vista). */
    volatile boolean conceded;
    volatile RegisteredPlayer registered;
    volatile Deck approvedDeck;
    volatile boolean sideboardReady;
    volatile long sentEventCursor;
    // A seat preference survives reconnects, the next game, and a rematch.
    /** Nível de passar automaticamente ({@link PassLevel}); o padrão é "Só com ações". */
    volatile PassLevel passLevel = PassLevel.ACOES;
    /** Etapas do turno dos oponentes em que o jogo segura a prioridade para este assento, mesmo sem ações. */
    volatile Set<PhaseType> opponentStops = Set.of();

    volatile WebGuiGame gui;
    volatile PlayerView me;
    volatile QuestionBroker.Question question;

    // Estado do "input" atual do Forge (prompt, botões e cartas selecionáveis).
    volatile String message = "";
    volatile int openingStartingPlayer = -1;
    /** Já manteve a mão inicial (OK no mulligan): enquanto o oponente decide a dele, a mesa diz isso. */
    volatile boolean keptHand;
    /** Carta citada pelo prompt (ex.: a do topo na vidência de 1); pode estar numa zona oculta. */
    volatile CardView promptCard;
    volatile String okLabel = "", cancelLabel = "";
    volatile boolean okEnabled, cancelEnabled;
    volatile Set<Integer> selectable = Set.of();
    volatile Set<Integer> selectableStacks = Set.of(), selectablePlayers = Set.of();
    /** Cartas que o Forge marca como utilizáveis agora: jogáveis, atacantes ou bloqueadores possíveis. */
    volatile Set<Integer> actionable = Set.of();
    /**
     * Versão do prompt atual. Um clique em OK/Cancelar só vale para a versão que o jogador estava vendo:
     * sem isso, um clique duplo (ou um clique feito enquanto a tela ainda mostrava o prompt anterior)
     * cai no prompt seguinte e passa a prioridade, pulando uma fase.
     */
    final AtomicInteger inputGen = new AtomicInteger();
    volatile int consumedGen = -1;
    /** Última ação da ponte por este assento quando o turno dele está sendo pulado (uma por versão do prompt). */
    volatile int autopilotGen = -1;
    volatile long autopilotAt;
    volatile long consumedAt;
    static final long CONSUMED_TIMEOUT_MS = 1500;
    volatile boolean lockedAtLastFlush;
    /** Pedido do Forge que a mesa espera deste assento e desde quando (alerta de espera demorada). */
    final Object waitLock = new Object();
    Object waitingOn;
    long waitingSince;

    Seat(Session session, int index) { this.session = session; this.index = index; }

    void bind(Channel ch, String name, Deck deck) {
        this.token = UUID.randomUUID().toString();
        this.departed = false;
        this.channel = ch;
        this.name = name;
        this.deck = deck;
        this.taken = true;
        this.confirmed = false;
        this.account = null;
        this.deckId = null;
    }

    /** Liga o assento à conta de quem joga; o deck só vale com a conta. */
    void owner(Rooms.Owner owner) {
        account = owner == null ? null : owner.account();
        deckId = owner == null ? null : owner.deckId();
    }

    void send(String json) { BridgeServer.send(channel, json); }

    void reset() {
        clearInput(); rematch = false; conceded = false; question = null; approvedDeck = null; sideboardReady = false; sentEventCursor = 0;
        inputGen.incrementAndGet(); consumedGen = -1;
    }

    void clearInput() {
        openingStartingPlayer = -1; keptHand = false; message = ""; promptCard = null; okLabel = cancelLabel = ""; okEnabled = cancelEnabled = false;
        selectable = Set.of(); selectableStacks = Set.of(); selectablePlayers = Set.of(); actionable = Set.of();
    }

    boolean buttonsLocked() {
        return consumedGen == inputGen.get() && System.currentTimeMillis() - consumedAt < CONSUMED_TIMEOUT_MS;
    }

    IGameController controller() {
        WebGuiGame g = gui;
        PlayerView p = me;
        return g == null || p == null ? null : g.getGameController(p);
    }

    /** Há quanto tempo a mesa espera este pedido; um pedido diferente (ou nenhum) recomeça a contagem. */
    long waited(Object pending, long now) {
        synchronized (waitLock) {
            if (pending != waitingOn) { waitingOn = pending; waitingSince = now; }
            return pending == null ? 0 : now - waitingSince;
        }
    }

    /** O pedido que a mesa espera deste assento agora (uma pergunta ou o input do Forge), ou null. */
    Object pending() {
        QuestionBroker.Question q = question;
        if (q != null) return q;
        return controller() instanceof PlayerControllerHuman human ? human.getInputQueue().getInput() : null;
    }

    /** Há quanto tempo a mesa espera este assento decidir (0 se não espera nada). */
    long waitedNow(long now) { return waited(pending(), now); }

    boolean eliminated() { return session.config.commandZone() && me != null && me.getHasLost(); }

    boolean livePriority() {
        return controller() instanceof PlayerControllerHuman human && human.getInputQueue().getInput() instanceof InputPassPriority;
    }

    void updatePreferences(Channel source, JsonObject message) {
        Boolean autoPass = optionalBoolean(message, "autoPassNoActions"), responses = optionalBoolean(message, "passResponses");
        PassLevel level = optionalLevel(message);
        Set<PhaseType> stops = optionalStops(message);
        if (autoPass == null && responses == null && level == null && stops == null)
            throw new IllegalArgumentException("Informe um valor booleano para a passagem automática de prioridade.");
        // Settings are independent of a prompt generation, but a replaced or departed socket
        // cannot change this seat. Resolve the controller at execution time across Bo3 games.
        FThreads.invokeInEdtLater(() -> {
            if (channel != source) return;
            WebGuiGame current = gui;
            // O nível vale sobre os interruptores antigos, que só chegam de clientes de versões anteriores.
            PassLevel next = level != null ? level : PassLevel.fromLegacy(passLevel, autoPass, responses);
            if (next != passLevel) {
                passLevel = next;
                if (current != null) current.levelChanged();
            }
            if (stops != null) {
                opponentStops = stops;
                if (current != null) current.stopsChanged();
            }
            passResponseIfAsked();   // trocou para um nível mais rápido com o pedido já aberto: passa este também
            session.markDirty();
        });
    }

    /** As etapas marcadas, na ordem do turno; null quando a mensagem não muda as paradas. */
    private static Set<PhaseType> optionalStops(JsonObject message) {
        JsonElement value = message.get("opponentStops");
        if (value == null) return null;
        if (!value.isJsonArray()) throw new IllegalArgumentException("Escolha as etapas do turno do oponente em que o jogo para.");
        EnumSet<PhaseType> stops = EnumSet.noneOf(PhaseType.class);
        for (JsonElement each : value.getAsJsonArray()) {
            PhaseType phase = each.isJsonPrimitive() && each.getAsJsonPrimitive().isString()
                ? Arrays.stream(PhaseType.values()).filter(p -> p.name().equals(each.getAsString())).findFirst().orElse(null) : null;
            if (phase == null || !WebGuiGame.HOLDABLE.contains(phase))
                throw new IllegalArgumentException("Essa etapa do turno do oponente não dá prioridade. Escolha outra.");
            stops.add(phase);
        }
        return Collections.unmodifiableSet(stops);
    }

    /** O nível pedido; null quando a mensagem não muda o nível. */
    private static PassLevel optionalLevel(JsonObject message) {
        JsonElement value = message.get("passLevel");
        if (value == null) return null;
        PassLevel level = value.isJsonPrimitive() && value.getAsJsonPrimitive().isString() ? PassLevel.of(value.getAsString()) : null;
        if (level == null) throw new IllegalArgumentException("Escolha um nível de passar automaticamente: sempre, acoes, respostas ou afeta.");
        return level;
    }

    private static Boolean optionalBoolean(JsonObject message, String key) {
        JsonElement value = message.get(key);
        if (value == null) return null;
        if (!value.isJsonPrimitive() || !value.getAsJsonPrimitive().isBoolean())
            throw new IllegalArgumentException("Informe um valor booleano para a passagem automática de prioridade.");
        return value.getAsBoolean();
    }

    /**
     * Nos níveis "Respostas" e "Só quando me afeta", responde OK sozinha a um pedido de prioridade quando o nível
     * manda passar ({@link PassLevel#passes}). Só vale para o pedido em que foi agendado: se o jogo pedir outra coisa
     * antes, não passa. Ataques, bloqueios e escolhas não são pedidos de prioridade e sempre esperam o jogador.
     */
    void passResponseIfAsked() {
        if (!shouldPass()) return;
        onEdt(inputGen.get(), c -> {
            if (shouldPass() && livePriority()) c.selectButtonOk();
            session.markDirty();
        });
    }

    boolean shouldPass() {
        WebGuiGame g = gui;
        if (question != null || !okEnabled || g == null) return false;
        // Numa etapa marcada para segurar a prioridade, a vez fica com o jogador em qualquer nível.
        return g.levelPasses();
    }

    void onEdt(int generation, java.util.function.Consumer<IGameController> action) {
        onEdt(generation, null, action);
    }

    void onEdt(int generation, String type, java.util.function.Consumer<IGameController> action) {
        IGameController c = controller();
        if (c == null) { session.actions.rejectStaleAction(this, type); return; }
        FThreads.invokeInEdtLater(() -> {
            if (generation == inputGen.get() && question == null && "playing".equals(session.matchPhase) && c == controller()) action.accept(c);
            else session.actions.rejectStaleAction(this, type);
        });
    }

    /** O {@link IRemote} do {@link WebGuiGame} deste assento na partida {@code hosted}. */
    IRemote remote(HostedMatch hosted, MatchLifecycle life) { return new Remote(hosted, life); }

    /** Recebe as chamadas do ProtocolGuiGame deste jogador. */
    private final class Remote implements IRemote {
        private final String belongsToMatch = session.matchId;
        private final HostedMatch hosted;
        private final MatchLifecycle life;
        Remote(HostedMatch hosted, MatchLifecycle life) { this.hosted = hosted; this.life = life; }
        @Override
        public void send(NetEvent event) {
            if (life.cancelled() || !belongsToMatch.equals(session.matchId) || !(event instanceof GuiGameEvent ev)) return;
            Object[] a = ev.getObjects();
            switch (ev.getMethod()) {
                case openView -> {
                    @SuppressWarnings("unchecked") TrackableCollection<PlayerView> mine = (TrackableCollection<PlayerView>) a[0];
                    me = mine.iterator().next();
                    if (session.match != null) session.events.attach(session.match.getGame());
                    MatchJournal j = session.journal;
                    if (session.match != null && j != null && j.matchId.equals(belongsToMatch)) j.attach(session.match.getGame(), session.gameNumber);
                }
                case showPromptMessage -> {
                    message = a[1] == null ? "" : CrewSelection.prompt(CoinFlipText.prompt(String.valueOf(a[1])));
                    promptCard = a.length > 2 && a[2] instanceof CardView cv ? cv : null;
                    inputGen.incrementAndGet();
                }
                case updateButtons -> {
                    inputGen.incrementAndGet();
                    okLabel = CoinFlipText.label(String.valueOf(a[1])); cancelLabel = CoinFlipText.label(String.valueOf(a[2]));
                    okEnabled = Boolean.TRUE.equals(a[3]); cancelEnabled = Boolean.TRUE.equals(a[4]);
                    // O Automático que só fecha com a mana extra do Caged Sun: o Forge o deixa desligado (AutoPay).
                    if (!okEnabled && controller() instanceof PlayerControllerHuman pch && pch.getInputQueue().getInput() instanceof InputPayMana pay
                        && AutoPay.payableWithLandBonus(pay)) okEnabled = true;
                    // Tripular/Selar abaixo do poder necessário: o OK do Forge só desistiria; fica o Cancelar para isso.
                    if (okEnabled && controller() instanceof PlayerControllerHuman pch && CrewSelection.shortOfPower(pch.getInputQueue().getInput())) okEnabled = false;
                    passResponseIfAsked();
                }
                // O que a escolha em andamento marca: cartas, jogadores e itens da pilha que ela aceita e as cartas que valem ação.
                case setSelection -> {
                    Selection sel = a[0] instanceof Selection x ? x : Selection.NONE;
                    Set<Integer> ids = new LinkedHashSet<>(), stackIds = new LinkedHashSet<>(), playerIds = new LinkedHashSet<>(), weak = new LinkedHashSet<>();
                    for (CardView c : sel.cards()) ids.add(c.getId());
                    for (Object target : sel.targets()) {
                        if (target instanceof StackItemView item) stackIds.add(item.getId());
                        else if (target instanceof PlayerView player) playerIds.add(player.getId());
                        else if (target instanceof CardView card) ids.add(card.getId());
                    }
                    for (CardView c : sel.actionable()) weak.add(c.getId());
                    selectable = ids; selectableStacks = stackIds; selectablePlayers = playerIds; actionable = weak;
                }
                // Chega na thread do jogo, com a declaração recusada ainda no combate.
                case message -> Seat.this.send(a.length > 1 && AiCardsNotice.TITLE.equals(a[1]) ? String.valueOf(a[0]) : AttackExplain.FORGE_MESSAGE.equals(a[0]) ? AttackExplain.toast(hosted.getGame().getCombat()) : Session.toast("toast", CoinFlipText.notice(session.questions.voteNotice(hosted.getGame(), String.valueOf(a[0])), a.length > 1 && a[1] != null ? String.valueOf(a[1]) : null)));
                case showErrorDialog -> Seat.this.send(Session.toast("toast", String.valueOf(a[0])));
                default -> { }
            }
            session.markDirty();
        }

        @Override
        public Object sendAndWait(IdentifiableNetEvent event) {
            return session.questions.ask(Seat.this, (GuiGameEvent) event, hosted, life);
        }
    }
}
