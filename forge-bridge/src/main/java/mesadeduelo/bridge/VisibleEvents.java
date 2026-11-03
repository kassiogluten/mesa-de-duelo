package mesadeduelo.bridge;

import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;
import java.util.function.LongSupplier;
import com.google.common.eventbus.Subscribe;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.ability.ApiType;
import forge.game.card.CardView;
import forge.game.card.CounterEnumType;
import forge.game.event.*;
import forge.game.spellability.SpellAbilityView;
import forge.game.zone.ZoneType;

/** Capture immutable public events on the engine thread, before any snapshot coalescing. */
final class VisibleEvents {
    private static final int HISTORY_LIMIT = 512;
    private final ArrayDeque<JsonObject> history = new ArrayDeque<>();
    private final Map<Integer, JsonObject> spells = new HashMap<>();
    private final Map<Integer, String> origins = new HashMap<>();
    private final DamageDetails damage = new DamageDetails();
    /** Escudos de prevenção conhecidos ("c12", "p0" → quantidade), para ver quando um deles é gasto. */
    private final Map<String, Integer> shields = new HashMap<>();
    private final Runnable changed;
    private final LongSupplier version;
    private long sequence;
    private Game game;
    private boolean gameStarted;
    /** Relógio dos turnos: quem joga o turno atual, desde quando, e quanto durou o último turno de cada jogador. */
    private int turnOwner = -1;
    private long turnSince;
    private final Map<Integer, Long> lastTurnMs = new HashMap<>();
    /** Quem controla cada permanente, para ver quando o controle troca (o Forge só a passa de um campo para o outro). */
    private final Map<Integer, Integer> controllers = new HashMap<>();
    /** Vida de cada jogador no fim de cada turno ({@code turn} 0 é a vida inicial), para o gráfico do fim do jogo. */
    private final java.util.List<JsonObject> lifePoints = new java.util.ArrayList<>();

    VisibleEvents(Runnable changed, LongSupplier version) { this.changed = changed; this.version = version; }

    synchronized void attach(Game next) {
        if (next == null || next == game) return;
        game = next; gameStarted = false; spells.clear(); origins.clear(); damage.reset(); shields.clear(); controllers.clear(); clearTurns();
        next.subscribeToEvents(new Object() {
            @Subscribe public void receive(GameEvent event) {
                synchronized (VisibleEvents.this) { if (game == next) VisibleEvents.this.receive(event); }
            }
        });
    }

    synchronized void reset() { history.clear(); spells.clear(); origins.clear(); damage.reset(); shields.clear(); controllers.clear(); clearTurns(); sequence = 0; game = null; gameStarted = false; }
    private void clearTurns() { turnOwner = -1; turnSince = 0; lastTurnMs.clear(); lifePoints.clear(); }

    /** Começo de turno: fecha o turno anterior na conta de quem o jogou e anota a vida de todos no fim dele. */
    private void turnBegan(int owner, int turn) {
        long now = System.currentTimeMillis();
        if (turnOwner >= 0 && turnSince > 0) lastTurnMs.put(turnOwner, now - turnSince);
        turnOwner = owner; turnSince = now;
        if (game != null) {
            JsonObject life = new JsonObject();
            for (forge.game.player.Player p : game.getRegisteredPlayers()) life.addProperty(String.valueOf(p.getId()), p.getLife());
            addLifePoint(lifePoints, turn - 1, life);
        }
    }

    /**
     * Anota a vida no fim de um turno. Desfazer pode voltar a um turno já anotado: o que veio depois dele sai, e o
     * turno é anotado de novo.
     */
    static void addLifePoint(java.util.List<JsonObject> points, int turn, JsonObject life) {
        points.removeIf(p -> p.get("turn").getAsInt() >= turn);
        JsonObject point = new JsonObject();
        point.addProperty("turn", turn);
        point.add("life", life);
        points.add(point);
    }

    /**
     * No fim do jogo (e entre os jogos de uma melhor de três), o estado leva {@code lifeHistory}: a vida de cada
     * jogador no fim de cada turno, terminando com a vida de agora no turno em que o jogo acabou. Durante o jogo não
     * vai nada, para o estado não crescer a cada turno.
     */
    synchronized void addLifeHistory(JsonObject state) {
        boolean over = state.has("gameOver") && state.get("gameOver").getAsBoolean();
        if (!over || !state.has("players") || lifePoints.isEmpty()) return;
        java.util.List<JsonObject> points = new java.util.ArrayList<>();
        for (JsonObject p : lifePoints) points.add(p.deepCopy());
        JsonObject life = new JsonObject();
        for (var e : state.getAsJsonArray("players")) {
            JsonObject p = e.getAsJsonObject();
            if (p.has("life")) life.addProperty(p.get("id").getAsString(), p.get("life").getAsInt());
        }
        int turn = state.has("turn") ? state.get("turn").getAsInt() : 0;
        if (turn > 0) addLifePoint(points, turn, life);
        JsonArray a = new JsonArray();
        points.forEach(a::add);
        state.add("lifeHistory", a);
    }

    /**
     * Tempos medidos aqui, e não no navegador, para não zerarem ao recarregar: {@code turnElapsedMs} (quanto o turno
     * atual já durou) e, em cada jogador, {@code lastTurnMs} (quanto durou o turno mais recente que ele terminou).
     */
    synchronized void addTurnTimes(JsonObject state) {
        boolean over = state.has("gameOver") && state.get("gameOver").getAsBoolean();
        var active = state.get("activePlayer");
        if (!over && turnSince > 0 && active != null && !active.isJsonNull() && active.getAsInt() == turnOwner)
            state.addProperty("turnElapsedMs", System.currentTimeMillis() - turnSince);
        if (state.has("players")) for (var e : state.getAsJsonArray("players")) {
            JsonObject p = e.getAsJsonObject();
            Long ms = lastTurnMs.get(p.get("id").getAsInt());
            if (ms != null) p.addProperty("lastTurnMs", ms);
        }
    }
    synchronized boolean gameStarted() { return gameStarted; }
    synchronized long cursor() { return sequence; }
    synchronized JsonArray json(long after) {
        JsonArray a = new JsonArray();
        history.stream().filter(e -> e.get("seq").getAsLong() > after).forEach(e -> a.add(e.deepCopy()));
        return a;
    }

    synchronized void append(JsonObject event) {
        changed.run();
        event.addProperty("seq", ++sequence);
        event.addProperty("stateVersion", version.getAsLong());
        history.addLast(event.deepCopy());
        while (history.size() > HISTORY_LIMIT) history.removeFirst();
    }

    /** Marca os marcadores de lealdade que a carta acabou de ganhar como custo pago ({@code paid}). */
    private void paidCounters(int card) {
        for (var it = history.descendingIterator(); it.hasNext();) {
            JsonObject old = it.next();
            if (old.get("seq").getAsLong() < sequence - 8) break;
            if ("counters".equals(old.get("type").getAsString()) && old.has("sourceId") && old.get("sourceId").getAsInt() == card
                && old.has("counter") && "LOYALTY".equals(old.get("counter").getAsString())) { old.addProperty("paid", true); changed.run(); }
        }
    }

    @Subscribe public synchronized void receive(GameEvent event) {
        if (event instanceof GameEventGameStarted) { gameStarted = true; changed.run(); }
        if (event instanceof GameEventGameStarted || event instanceof GameEventSnapshotRestored) seedControllers();
        if (!(event instanceof GameEventPlayerPriority)) prevented();
        JsonObject e = null;
        if (event instanceof GameEventLandPlayed x) {
            e = card("land-played", x.land()); actor(e, x.player().getId()); e.addProperty("to", "Battlefield");
        } else if (event instanceof GameEventSpellAbilityCast x) {
            e = card(x.sa().isSpell() ? "spell-cast" : "ability-activated", x.si().getSourceCard());
            e.addProperty("stackId", x.si().getId());
            if (x.si().isTrigger()) e.addProperty("trigger", true);
            e.addProperty("to", "Stack");
            if (x.si().getSourceCard() != null) e.addProperty("from", origins.get(x.si().getSourceCard().getId()));
            if (x.si().getActivatingPlayer() != null) actor(e, x.si().getActivatingPlayer().getId());
            e.addProperty("text", CoinFlipText.stack(x.si().getText()));
            e.add("targets", StateJson.stackTargets(x.si()));
            // O "+N" de lealdade é pago antes da habilidade ir para a pilha: a mesa mostra esse marcador junto com ela.
            if (Loyalty.describe(e, game, x.si().getId()) && x.si().getSourceCard() != null) paidCounters(x.si().getSourceCard().getId());
            spells.put(x.sa().getId(), e.deepCopy());
            if (spells.size() > HISTORY_LIMIT) spells.keySet().removeIf(id -> id != x.sa().getId() && spells.size() > HISTORY_LIMIT);
        } else if (event instanceof GameEventSpellResolved x) {
            e = finish(x.spell(), x.hasFizzled() ? "countered" : "resolved");
        } else if (event instanceof GameEventSpellRemovedFromStack x && x.sa() != null) {
            String type = "stack-removed";
            if (game != null && !game.getStack().isEmpty() && game.getStack().peekAbility().getApi() == ApiType.Counter) type = "countered";
            e = finish(x.sa(), type);
        } else if (event instanceof GameEventCardChangeZone x && x.card() != null) {
            ZoneType from = x.from() == null ? null : x.from().zoneType(), to = x.to() == null ? null : x.to().zoneType();
            if (to == ZoneType.Stack && from != null) origins.put(x.card().getId(), from.name());
            if (from == ZoneType.Library && to == ZoneType.Hand) {
                e = type("draw"); if (x.card().getOwner() != null) actor(e, x.card().getOwner().getId());
                // Busca no grimório (tutor): a mesa mostra a carta saindo do grimório como uma busca, sem dizer qual é.
                if (resolvingApi(ApiType.ChangeZone, ApiType.ChangeZoneAll)) e.addProperty("searched", true);
            } else if (from == ZoneType.Hand && to == ZoneType.Graveyard) {
                // Descarte (inclusive reciclar e descartar no fim do turno): a carta fica pública no cemitério.
                e = card("discard", x.card()); if (x.card().getOwner() != null) actor(e, x.card().getOwner().getId());
                e.addProperty("from", "Hand"); e.addProperty("to", "Graveyard");
            } else if (from == ZoneType.Library && to == ZoneType.Graveyard) {
                // Moer: o Forge move uma carta por vez, do topo, na ordem em que saem; a mesa junta as seguidas do mesmo jogador.
                e = card("mill", x.card()); if (x.card().getOwner() != null) actor(e, x.card().getOwner().getId());
                e.addProperty("from", "Library"); e.addProperty("to", "Graveyard");
                millSource(e);
            } else if (to == ZoneType.Battlefield || from == ZoneType.Battlefield) {
                if (to == ZoneType.Battlefield && x.card().getController() != null) controllers.put(x.card().getId(), x.card().getController().getId());
                else controllers.remove(x.card().getId());
                e = card(to == ZoneType.Battlefield ? "entered" : "left", x.card());
                e.addProperty("from", from == null ? null : from.name()); e.addProperty("to", to == null ? null : to.name());
                if (from == ZoneType.Battlefield && to != ZoneType.Battlefield && x.card().wasDestroyed()) e.addProperty("reason", "destroyed");
                if (from == ZoneType.Battlefield && to == ZoneType.Exile && warpReturn()) e.addProperty("reason", "warped");
                resolvingSource(e);
                // Os marcadores de "entra com" chegam logo antes da entrada: o som da entrada já basta para eles.
                if (to == ZoneType.Battlefield) for (var it = history.descendingIterator(); it.hasNext();) {
                    JsonObject old = it.next();
                    if (old.get("seq").getAsLong() < sequence - 8) break;
                    if ("counters".equals(old.get("type").getAsString()) && old.has("sourceId") && old.get("sourceId").getAsInt() == x.card().getId()) { old.addProperty("entering", true); changed.run(); }
                }
            }
        } else if (event instanceof GameEventAttackersDeclared x && !x.attackersMap().isEmpty()) {
            e = type("attackers"); actor(e, x.player().getId());
            JsonArray attackers = new JsonArray(); x.attackersMap().values().forEach(c -> attackers.add(c.getId()));
            e.add("cards", attackers); e.add("targets", StateJson.targets(x.attackersMap().keySet()));
        } else if (event instanceof GameEventBlockersDeclared x) {
            JsonArray blockers = new JsonArray(); x.blockers().values().forEach(m -> m.values().forEach(c -> blockers.add(c.getId())));
            if (!blockers.isEmpty()) { e = type("blockers"); actor(e, x.defendingPlayer().getId()); e.add("cards", blockers); }
        } else if (event instanceof GameEventPlayerDamaged x) {
            e = card("damage", x.source()); e.addProperty("delta", -x.amount()); e.add("targets", StateJson.targets(java.util.List.of(x.target())));
            damage.player(e, game, x.source(), x.target(), x.amount(), x.combat(), x.infect());
            fight(e);
        } else if (event instanceof GameEventCardDamaged x) {
            e = card("damage", x.source()); e.addProperty("delta", -x.amount()); e.add("targets", StateJson.targets(java.util.List.of(x.card())));
            damage.card(e, game, x.source(), x.card(), x.type() == GameEventCardDamaged.DamageType.Deathtouch, x.type() == GameEventCardDamaged.DamageType.M1M1Counters);
            fight(e);
        } else if (event instanceof GameEventCardCounters x && x.card() != null && x.type() != null && x.type().is(CounterEnumType.LOYALTY) && x.newValue() < x.oldValue()) {
            e = damage.loyalty(game, game == null ? null : game.findByView(x.card()), x.oldValue() - x.newValue());
        } else if (event instanceof GameEventCardCounters x && x.card() != null && x.type() != null && x.newValue() > x.oldValue()
                && x.card().getZone() == ZoneType.Battlefield) {
            // Marcador posto numa permanente: a mesa toca um som (tirar marcador fica em silêncio).
            e = card("counters", x.card()); e.addProperty("counter", x.type().toString()); e.addProperty("delta", x.newValue() - x.oldValue());
            resolvingSource(e);
        } else if (event instanceof GameEventPlayerCounters x && x.receiver() != null && x.type() != null && x.amount() > x.oldValue()) {
            // `amount` é o total novo, não o que entrou.
            e = type("counters"); actor(e, x.receiver().getId()); e.addProperty("counter", x.type().toString()); e.addProperty("delta", x.amount() - x.oldValue());
            e.add("targets", StateJson.targets(java.util.List.of(x.receiver())));
            resolvingSource(e);
        } else if (event instanceof GameEventCardSacrificed x && x.card() != null) {
            // O Forge avisa o sacrifício depois de tirar a carta do campo: marca a saída que acabou de acontecer.
            int id = x.card().getId();
            for (var it = history.descendingIterator(); it.hasNext();) {
                JsonObject old = it.next();
                if (old.get("seq").getAsLong() < sequence - 8) break;
                if ("left".equals(old.get("type").getAsString()) && old.has("sourceId") && old.get("sourceId").getAsInt() == id) { old.addProperty("reason", "sacrificed"); changed.run(); break; }
            }
        } else if (event instanceof GameEventPlayerLivesChanged x) {
            e = type("life-changed"); actor(e, x.player().getId()); e.addProperty("delta", x.newLives() - x.oldLives());
            damage.lifeChanged(x.player().getId());
        } else if (event instanceof GameEventTurnBegan x) {
            turnBegan(x.turnOwner().getId(), x.turnNumber());
            e = type("turn"); actor(e, x.turnOwner().getId()); e.addProperty("turn", x.turnNumber());
        } else if (event instanceof GameEventPlayerPriority x && x.priority() != null) {
            e = type("priority"); actor(e, x.priority().getId());
        } else if (event instanceof GameEventShuffle x && x.player() != null) {
            e = type("shuffle"); actor(e, x.player().getId());
        } else if (event instanceof GameEventScry x && x.player() != null && x.toTop() + x.toBottom() > 0) {
            // Vidência: quantas ficaram no topo e quantas foram para o fundo (o número é público; as cartas, não).
            e = type("scry"); actor(e, x.player().getId()); e.addProperty("top", x.toTop()); e.addProperty("bottom", x.toBottom());
        } else if (event instanceof GameEventFlipCoin x && x.flipper() != null) {
            e = type("coin"); actor(e, x.flipper().getId()); e.addProperty("heads", x.heads());
            if (x.startingToss()) e.addProperty("startingToss", true);
        } else if (event instanceof GameEventRollDie x && x.planar() == null && x.sides() > 0) {
            // O dado não diz quem rolou: é quem conjurou ou ativou o que está resolvendo.
            e = type("die"); e.addProperty("sides", x.sides()); e.addProperty("result", x.result()); resolvingActor(e);
        } else if (event instanceof GameEventCardAttachment x && x.equipment() != null && x.newTarget() != null) {
            // Equipar, encantar ou trocar de criatura: a carta presa e onde ela foi parar (`moved` quando já estava presa a outra).
            e = card("attached", x.equipment()); e.add("targets", StateJson.targets(java.util.List.of(x.newTarget())));
            if (x.oldEntity() != null) e.addProperty("moved", true);
        } else if (event instanceof GameEventZone x && x.zoneType() == ZoneType.Battlefield && x.mode() == EventValueChangeType.Added
                && x.card() != null && x.player() != null) {
            // Troca de controle: a permanente passa do campo de um jogador para o de outro sem sair do campo.
            Integer before = controllers.put(x.card().getId(), x.player().getId());
            if (before != null && before != x.player().getId()) {
                e = card("control-changed", x.card()); actor(e, x.player().getId()); e.addProperty("previous", before); resolvingSource(e);
            }
        }
        if (e != null) publish(e);
    }

    /** Põe o quadro público da mesa no evento (menos na compra, na prioridade e no embaralhar) e o guarda na lista. */
    private void publish(JsonObject e) {
        {
            if (!java.util.Set.of("draw", "priority", "shuffle").contains(e.get("type").getAsString())) {
                JsonObject frame = publicFrame();
                if (frame != null) {
                    // Forge announces the outcome before removing the resolving stack item.
                    if (java.util.Set.of("resolved", "countered", "stack-removed").contains(e.get("type").getAsString()) && e.has("stackId")) {
                        int finished = e.get("stackId").getAsInt();
                        JsonArray stack = new JsonArray();
                        for (var item : frame.getAsJsonArray("stack")) if (item.getAsJsonObject().get("id").getAsInt() != finished) stack.add(item);
                        frame.add("stack", stack);
                    }
                    e.add("frame", frame);
                }
            }
            append(e);
        }
    }

    /** Quem controla cada permanente agora (começo do jogo e depois de desfazer). */
    private void seedControllers() {
        controllers.clear();
        if (game == null) return;
        try { for (var c : game.getCardsIn(ZoneType.Battlefield)) if (c.getController() != null) controllers.put(c.getId(), c.getController().getId()); }
        catch (RuntimeException concurrentRead) { controllers.clear(); }
    }

    /** Se a mágica ou habilidade resolvendo agora tem um destes efeitos (nela ou nas sub-habilidades). */
    private boolean resolvingApi(ApiType... apis) {
        if (game == null || !game.getStack().isResolving() || game.getStack().isEmpty()) return false;
        var set = java.util.Set.of(apis);
        for (var sa = game.getStack().peekAbility(); sa != null; sa = sa.getSubAbility()) if (set.contains(sa.getApi())) return true;
        return false;
    }

    /** Lutar: o dano que as duas criaturas causam uma à outra vem marcado, para a mesa mostrar o choque. */
    private void fight(JsonObject e) { if (resolvingApi(ApiType.Fight)) e.addProperty("fight", true); }

    /** Quem conjurou ou ativou o que está resolvendo (para o dado, que não diz quem rolou). */
    private void resolvingActor(JsonObject e) {
        if (game == null || !game.getStack().isResolving() || game.getStack().isEmpty()) return;
        var sa = game.getStack().peekAbility();
        if (sa != null && sa.getActivatingPlayer() != null) actor(e, sa.getActivatingPlayer().getId());
        if (sa != null && sa.getHostCard() != null) e.addProperty("sourceName", sa.getHostCard().getName());
    }

    /**
     * Dano prevenido: o Forge não avisa, mas gasta o escudo da carta ou do jogador ("previna os próximos N"). Quando um
     * escudo diminui fora da limpeza do turno (onde eles expiram), vira um `damage` com `prevented: true`.
     */
    private void prevented() {
        if (game == null) return;
        Map<String, Integer> now = new HashMap<>();
        Map<String, Object> entities = new HashMap<>();
        try {
            for (var p : game.getPlayers()) { int n = p.getPreventNextDamageTotalShields(); if (n > 0 || shields.containsKey("p" + p.getId())) { now.put("p" + p.getId(), n); entities.put("p" + p.getId(), p.getView()); } }
            for (var c : game.getCardsIn(ZoneType.Battlefield)) { int n = c.getPreventNextDamageTotalShields(); if (n > 0 || shields.containsKey("c" + c.getId())) { now.put("c" + c.getId(), n); entities.put("c" + c.getId(), c.getView()); } }
        } catch (RuntimeException concurrentRead) { return; }
        boolean cleanup = game.getPhaseHandler().is(forge.game.phase.PhaseType.CLEANUP);
        for (var entry : now.entrySet()) {
            int before = shields.getOrDefault(entry.getKey(), 0), after = entry.getValue();
            if (after < before && !cleanup) {
                JsonObject e = type("damage");
                if (game.getStack().isResolving() && !game.getStack().isEmpty() && game.getStack().peekAbility() != null && game.getStack().peekAbility().getHostCard() != null) {
                    CardView source = game.getStack().peekAbility().getHostCard().getView();
                    e.add("card", StateJson.card(source)); e.addProperty("sourceId", source.getId());
                    if (source.getController() != null) actor(e, source.getController().getId());
                }
                e.addProperty("delta", -(before - after));
                e.add("targets", StateJson.targets(java.util.List.of(entities.get(entry.getKey()))));
                e.addProperty("prevented", true);
                e.addProperty("combat", game.getPhaseHandler().inCombat() && !game.getStack().isResolving());
                JsonObject frame = publicFrame();
                if (frame != null) e.add("frame", frame);
                append(e);
            }
        }
        shields.clear();
        now.forEach((k, v) -> { if (v > 0) shields.put(k, v); });
    }

    /** A mágica ou habilidade resolvendo que mandou moer (`sourceName`), e `surveil` quando foi vidência, não moer. */
    private void millSource(JsonObject e) {
        if (game == null || !game.getStack().isResolving() || game.getStack().isEmpty()) return;
        var root = game.getStack().peekAbility();
        if (root == null) return;
        if (root.getHostCard() != null) e.addProperty("sourceName", root.getHostCard().getName());
        boolean mill = false, surveil = false;
        for (var sa = root; sa != null; sa = sa.getSubAbility()) { mill |= sa.getApi() == ApiType.Mill; surveil |= sa.getApi() == ApiType.Surveil; }
        if (surveil && !mill) e.addProperty("surveil", true);
    }

    /**
     * A mágica ou habilidade que está resolvendo quando a permanente entra ou sai do campo. Na entrada, a mesa junta num
     * movimento só as que entram pela mesma resolução (fichas, blink em massa); na saída, mostra quem removeu. Fora de
     * uma resolução (custo, combate, ações baseadas no estado) não vai nada.
     */
    /** A permanente conjurada por dobra volta para o exílio no fim do turno: quem resolve é o gatilho da dobra. */
    private boolean warpReturn() {
        if (game == null || !game.getStack().isResolving() || game.getStack().isEmpty()) return false;
        try {
            var resolving = game.getStack().peek();
            var sa = resolving == null ? null : resolving.getSpellAbility();
            return sa != null && sa.isTrigger() && sa.getTrigger() != null && sa.getTrigger().isKeyword(forge.game.keyword.Keyword.WARP);
        } catch (RuntimeException concurrentRead) { return false; }
    }

    private void resolvingSource(JsonObject e) {
        if (game == null || !game.getStack().isResolving() || game.getStack().isEmpty()) return;
        var resolving = game.getStack().peek();
        if (resolving == null) return;
        e.addProperty("stackId", resolving.getId());
        if (resolving.getSourceCard() != null) e.addProperty("sourceName", resolving.getSourceCard().getName());
    }

    private JsonObject publicFrame() {
        if (game == null) return null;
        try {
            JsonObject state = StateJson.game(game.getView(), -2, game), frame = new JsonObject();
            for (String key : java.util.List.of("turn", "phase", "activePlayer", "stack", "combat")) frame.add(key, state.get(key));
            JsonArray players = new JsonArray();
            for (var entry : state.getAsJsonArray("players")) {
                JsonObject player = entry.getAsJsonObject(), visible = new JsonObject();
                for (String key : java.util.List.of("id", "life", "battlefield", "handCount", "library")) visible.add(key, player.get(key));
                players.add(visible);
            }
            frame.add("players", players); return frame;
        } catch (RuntimeException transientView) { return null; }
    }

    private JsonObject finish(SpellAbilityView ability, String kind) {
        if (ability == null) return null;
        // A non-counter removal can precede a later explicit resolution in some effects.
        // Retain its original metadata until the definitive outcome arrives.
        JsonObject cast = "stack-removed".equals(kind) ? spells.get(ability.getId()) : spells.remove(ability.getId());
        if (cast == null) return null;
        cast = cast.deepCopy();
        cast.addProperty("type", kind);
        cast.addProperty("from", "Stack"); cast.remove("to");
        CardView source = ability.getHostCard();
        if (source != null && source.getZone() != null && source.getZone() != ZoneType.Stack)
            cast.addProperty("to", source.getZone().name());
        return cast;
    }
    private static JsonObject type(String type) { JsonObject o = new JsonObject(); o.addProperty("type", type); return o; }
    private static void actor(JsonObject o, int id) { o.addProperty("actor", id); }
    private static JsonObject card(String type, CardView card) {
        JsonObject o = type(type);
        if (card != null) {
            o.add("card", StateJson.card(card)); o.addProperty("sourceId", card.getId());
            if (card.getController() != null) actor(o, card.getController().getId());
        }
        return o;
    }
}
