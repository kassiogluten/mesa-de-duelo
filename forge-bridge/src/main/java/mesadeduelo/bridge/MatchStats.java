package mesadeduelo.bridge;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import com.google.common.eventbus.Subscribe;
import com.google.gson.JsonObject;

import forge.game.Game;
import forge.game.ability.ApiType;
import forge.game.card.CardView;
import forge.game.event.*;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.PlayerView;
import forge.game.player.RegisteredPlayer;
import forge.game.zone.ZoneType;

/**
 * Os números de cada jogador numa partida (dano, remoções, anulações, combate e ritmo), contados dos eventos do Forge
 * na thread do jogo. Os do jogo atual vão para o estado no fim do jogo ({@code stats}, pelo id do jogador); somados nos
 * jogos da série, vão para a linha do histórico ({@link MatchRecorder}). O Desfazer volta os números junto com o jogo
 * ({@link #copy}/{@link #restore}).
 *
 * Remoção: permanente de outro jogador que saiu do campo por mágica ou habilidade de quem a removeu (destruída, exilada,
 * devolvida, sacrificada por efeito dele), inclusive a que morre logo depois de a mágica resolver (dano, -X/-X).
 * Morte em combate conta à parte ({@code kills}), para quem causou o último dano de combate na criatura.
 */
final class MatchStats {
    /** Os números de um jogador; os nomes são os campos do JSON (zeros ficam de fora). */
    static final List<String> KEYS = List.of("damage", "combatDamage", "damageTaken", "biggestTurn", "removals", "counters",
        "countered", "kills", "creaturesLost", "attackers", "spells", "abilities", "lands", "draws", "lifeGained");
    private static final int DAMAGE = 0, COMBAT_DAMAGE = 1, TAKEN = 2, BIGGEST_TURN = 3, REMOVALS = 4, COUNTERS = 5,
        COUNTERED = 6, KILLS = 7, LOST = 8, ATTACKERS = 9, SPELLS = 10, ABILITIES = 11, LANDS = 12, DRAWS = 13, LIFE = 14;
    /** Efeitos que tiram do grimório sem ser compra (buscar, cavar): a carta na mão não conta como comprada. */
    private static final java.util.Set<ApiType> SEARCH = java.util.Set.of(ApiType.ChangeZone, ApiType.ChangeZoneAll, ApiType.Dig, ApiType.DigUntil);

    /** Os números de um jogador num jogo: os totais, o dano causado a cada jogador (pelo id) e o dano no turno atual. */
    static final class Line {
        final int[] v = new int[KEYS.size()];
        final Map<Integer, Integer> damageTo = new TreeMap<>();
        int turnDamage;

        Line copy() { Line c = new Line(); System.arraycopy(v, 0, c.v, 0, v.length); c.damageTo.putAll(damageTo); c.turnDamage = turnDamage; return c; }

        /** Soma os números de outro jogo; o maior dano num turno fica com o maior dos dois. */
        void add(Line o) {
            for (int i = 0; i < v.length; i++) v[i] = i == BIGGEST_TURN ? Math.max(v[i], o.v[i]) : v[i] + o.v[i];
        }

        /** Só os números que passaram de zero; {@code damageTo} vai à parte, porque cada lugar o escreve de um jeito. */
        JsonObject json() {
            JsonObject o = new JsonObject();
            for (int i = 0; i < v.length; i++) if (v[i] != 0) o.addProperty(KEYS.get(i), v[i]);
            return o;
        }
    }

    /** Uma criatura que levou dano neste turno: de quem (o controlador da fonte) e se foi dano de combate. */
    private record Hit(int player, boolean combat) { }

    private Game game;
    /** Os números do jogo atual, pelo id do jogador. */
    private Map<Integer, Line> lines = new HashMap<>();
    /** Os números dos jogos já terminados da série, por jogador inscrito (os ids mudam de um jogo para outro). */
    private final Map<RegisteredPlayer, Line> finished = new LinkedHashMap<>();
    /** O dano causado nos jogos já terminados da série: quem causou → a quem → quanto. */
    private final Map<RegisteredPlayer, Map<RegisteredPlayer, Integer>> damageBy = new LinkedHashMap<>();
    /** Quem pôs cada item na pilha (o id da mágica ou habilidade → o id do jogador), para saber quem foi anulado. */
    private final Map<Integer, Integer> owners = new HashMap<>();
    /** Quem controla cada permanente, para saber de quem era a que saiu do campo. */
    private final Map<Integer, Integer> controllers = new HashMap<>();
    private final Map<Integer, Hit> hits = new HashMap<>();
    /** Quem pôs na pilha o item que acabou de resolver: as mortes de logo depois (ação de estado) contam para ele. */
    private Integer lastResolver;
    /**
     * O jogo que já terminou e entrou na conta da série: os números dele ficam em {@link #lines} para o resultado (e a
     * troca com o sideboard) até o próximo jogo começar, mas não contam de novo nem mudam mais.
     */
    private Game counted;

    synchronized void attach(Game next) {
        if (next == null || next == game) return;
        game = next; counted = null; lines = new HashMap<>(); owners.clear(); controllers.clear(); hits.clear(); lastResolver = null;
        next.subscribeToEvents(new Object() {
            @Subscribe public void receive(GameEvent event) {
                synchronized (MatchStats.this) { if (game == next && counted != next) MatchStats.this.receive(event); }
            }
        });
    }

    /** Partida nova: nenhum jogo contado. */
    synchronized void reset() { game = null; counted = null; lines = new HashMap<>(); finished.clear(); damageBy.clear(); owners.clear(); controllers.clear(); hits.clear(); lastResolver = null; }

    /** Retrato dos números do jogo atual, para o Desfazer. */
    synchronized Map<Integer, Line> copy() {
        Map<Integer, Line> c = new HashMap<>();
        lines.forEach((id, line) -> c.put(id, line.copy()));
        return c;
    }

    /** O Desfazer voltou o jogo: os números voltam ao retrato tirado junto. */
    @SuppressWarnings("unchecked")
    synchronized void restore(Object kept) {
        if (!(kept instanceof Map<?, ?> m)) return;
        lines = new HashMap<>();
        ((Map<Integer, Line>) m).forEach((id, line) -> lines.put(id, line.copy()));
        hits.clear(); lastResolver = null;
    }

    private Line line(int player) { return lines.computeIfAbsent(player, id -> new Line()); }
    private void add(int player, int key, int amount) { line(player).v[key] += amount; }

    synchronized void receive(GameEvent event) {
        if (event instanceof GameEventGameStarted || event instanceof GameEventSnapshotRestored) seedControllers();
        if (event instanceof GameEventTurnBegan) { hits.clear(); for (Line l : lines.values()) l.turnDamage = 0; }
        else if (event instanceof GameEventPlayerPriority) lastResolver = null;
        else if (event instanceof GameEventSpellAbilityCast x) {
            PlayerView who = x.si().getActivatingPlayer();
            if (who == null) return;
            owners.put(x.sa().getId(), who.getId());
            if (x.sa().isSpell()) add(who.getId(), SPELLS, 1);
            else if (!x.si().isTrigger()) add(who.getId(), ABILITIES, 1);
        } else if (event instanceof GameEventSpellResolved x) {
            lastResolver = owners.get(x.spell().getId());
        } else if (event instanceof GameEventSpellRemovedFromStack x && x.sa() != null) {
            Integer victim = owners.get(x.sa().getId()), by = resolver();
            if (victim != null && by != null && !victim.equals(by) && resolvingApi(ApiType.Counter)) { add(by, COUNTERS, 1); add(victim, COUNTERED, 1); }
        } else if (event instanceof GameEventLandPlayed x && x.player() != null) {
            add(x.player().getId(), LANDS, 1);
        } else if (event instanceof GameEventPlayerDamaged x && x.target() != null && x.amount() > 0) {
            int target = x.target().getId();
            add(target, TAKEN, x.amount());
            PlayerView from = x.source() == null ? null : x.source().getController();
            if (from == null || from.getId() == target) return;
            Line l = line(from.getId());
            l.v[DAMAGE] += x.amount();
            if (x.combat()) l.v[COMBAT_DAMAGE] += x.amount();
            l.damageTo.merge(target, x.amount(), Integer::sum);
            l.turnDamage += x.amount();
            l.v[BIGGEST_TURN] = Math.max(l.v[BIGGEST_TURN], l.turnDamage);
        } else if (event instanceof GameEventCardDamaged x && x.card() != null && x.amount() > 0) {
            PlayerView from = x.source() == null ? null : x.source().getController();
            if (from != null) hits.put(x.card().getId(), new Hit(from.getId(), combatDamage()));
        } else if (event instanceof GameEventAttackersDeclared x && x.player() != null && !x.attackersMap().isEmpty()) {
            add(x.player().getId(), ATTACKERS, x.attackersMap().size());
        } else if (event instanceof GameEventPlayerLivesChanged x && x.player() != null && x.newLives() > x.oldLives()) {
            add(x.player().getId(), LIFE, x.newLives() - x.oldLives());
        } else if (event instanceof GameEventZone x && x.zoneType() == ZoneType.Battlefield && x.mode() == EventValueChangeType.Added
                && x.card() != null && x.player() != null) {
            controllers.put(x.card().getId(), x.player().getId());
        } else if (event instanceof GameEventCardChangeZone x && x.card() != null) {
            changedZone(x.card(), x.from() == null ? null : x.from().zoneType(), x.to() == null ? null : x.to().zoneType());
        }
    }

    private void changedZone(CardView card, ZoneType from, ZoneType to) {
        int id = card.getId();
        if (to == ZoneType.Battlefield) {
            if (card.getController() != null) controllers.put(id, card.getController().getId());
            return;
        }
        if (from == ZoneType.Library && to == ZoneType.Hand) {
            if (card.getOwner() != null && game != null && game.getPhaseHandler().getTurn() > 0 && !resolvingApi(SEARCH.toArray(ApiType[]::new)))
                add(card.getOwner().getId(), DRAWS, 1);
            return;
        }
        if (from != ZoneType.Battlefield || to == null) return;
        Integer controller = controllers.remove(id);
        if (controller == null && card.getController() != null) controller = card.getController().getId();
        Hit hit = hits.remove(id);
        if (controller == null) return;
        boolean died = to == ZoneType.Graveyard && card.getCurrentState() != null && card.getCurrentState().isCreature();
        if (died) add(controller, LOST, 1);
        Integer by = resolver();
        // Logo depois de resolver (ação de estado), só conta a criatura ou o planeswalker que morreu por causa dela.
        boolean diesAfter = to == ZoneType.Graveyard && card.getCurrentState() != null && (card.getCurrentState().isCreature() || card.getCurrentState().isPlaneswalker());
        if (by == null && diesAfter) by = lastResolver;
        if (by != null) { if (!by.equals(controller)) add(by, REMOVALS, 1); }
        else if (died && hit != null && hit.combat() && hit.player() != controller) add(hit.player(), KILLS, 1);
    }

    /** Quem pôs na pilha o que está resolvendo agora, ou null. */
    private Integer resolver() {
        if (game == null || !game.getStack().isResolving() || game.getStack().isEmpty()) return null;
        var sa = game.getStack().peekAbility();
        return sa == null || sa.getActivatingPlayer() == null ? null : sa.getActivatingPlayer().getId();
    }

    /** O que está resolvendo (ou acabou de anular algo) tem um destes efeitos, nele ou nas sub-habilidades. */
    private boolean resolvingApi(ApiType... apis) {
        if (game == null || game.getStack().isEmpty()) return false;
        var set = java.util.Set.of(apis);
        for (var sa = game.getStack().peekAbility(); sa != null; sa = sa.getSubAbility()) if (set.contains(sa.getApi())) return true;
        return false;
    }

    /** Dano causado na etapa de dano de combate, fora de uma mágica ou habilidade resolvendo. */
    private boolean combatDamage() {
        if (game == null || game.getStack().isResolving()) return false;
        PhaseType phase = game.getPhaseHandler().getPhase();
        return phase == PhaseType.COMBAT_DAMAGE || phase == PhaseType.COMBAT_FIRST_STRIKE_DAMAGE;
    }

    private void seedControllers() {
        controllers.clear(); hits.clear(); lastResolver = null;
        if (game == null) return;
        try { for (var c : game.getCardsIn(ZoneType.Battlefield)) if (c.getController() != null) controllers.put(c.getId(), c.getController().getId()); }
        catch (RuntimeException concurrentRead) { controllers.clear(); }
    }

    /**
     * No fim do jogo (e entre os jogos de uma melhor de três), o estado leva {@code stats}: os números de cada jogador
     * no jogo que acabou, pelo id, com {@code damageTo} (o dano causado a cada jogador, pelo id). Durante o jogo não vai.
     */
    synchronized void addStats(JsonObject state) {
        boolean over = state.has("gameOver") && state.get("gameOver").getAsBoolean();
        if (!over || !state.has("players")) return;
        JsonObject all = new JsonObject();
        for (var e : state.getAsJsonArray("players")) {
            int id = e.getAsJsonObject().get("id").getAsInt();
            Line l = lines.getOrDefault(id, new Line());
            JsonObject o = l.json();
            if (!l.damageTo.isEmpty()) {
                JsonObject to = new JsonObject();
                l.damageTo.forEach((target, n) -> to.addProperty(String.valueOf(target), n));
                o.add("damageTo", to);
            }
            all.add(String.valueOf(id), o);
        }
        state.add("stats", all);
    }

    /**
     * Fim de um jogo: os números dele entram na conta da série, por jogador inscrito (uma vez só). Eles continuam no
     * estado ({@link #addStats}) até o próximo jogo: o resultado é montado depois desta chamada.
     */
    synchronized void gameEnded(Game ended) {
        if (ended == null || ended == counted) return;
        for (Player p : ended.getRegisteredPlayers()) {
            Line l = lines.get(p.getId());
            if (l == null) continue;
            finished.computeIfAbsent(p.getRegisteredPlayer(), k -> new Line()).add(l);
            // O dano a cada jogador fica pelo jogador inscrito, porque os ids mudam a cada jogo.
            for (var t : l.damageTo.entrySet()) {
                Player target = playerById(ended, t.getKey());
                if (target != null) damageBy.computeIfAbsent(p.getRegisteredPlayer(), k -> new LinkedHashMap<>()).merge(target.getRegisteredPlayer(), t.getValue(), Integer::sum);
            }
        }
        if (ended == game) counted = ended;
        else lines = new HashMap<>();
    }

    private static Player playerById(Game g, int id) {
        for (Player p : g.getRegisteredPlayers()) if (p.getId() == id) return p;
        return null;
    }

    /**
     * Os números da série de {@code rp} para o histórico, com {@code damageTo} na ordem de {@code order} (os índices
     * dos jogadores da linha). {@code unfinished}: o jogo em andamento de uma série que acabou antes da hora, que
     * entra na conta. Null quando o jogador não tem nenhum número.
     */
    synchronized JsonObject seriesJson(RegisteredPlayer rp, List<RegisteredPlayer> order, Game unfinished) {
        Line total = new Line();
        Line done = finished.get(rp);
        if (done != null) total.add(done);
        Map<RegisteredPlayer, Integer> to = new LinkedHashMap<>(damageBy.getOrDefault(rp, Map.of()));
        if (unfinished != null && unfinished == game && counted != game) {
            Player me = null;
            for (Player p : unfinished.getRegisteredPlayers()) if (p.getRegisteredPlayer() == rp) me = p;
            Line now = me == null ? null : lines.get(me.getId());
            if (now != null) {
                total.add(now);
                for (var t : now.damageTo.entrySet()) {
                    Player target = playerById(unfinished, t.getKey());
                    if (target != null) to.merge(target.getRegisteredPlayer(), t.getValue(), Integer::sum);
                }
            }
        }
        JsonObject o = total.json();
        if (!to.isEmpty()) {
            com.google.gson.JsonArray a = new com.google.gson.JsonArray();
            for (RegisteredPlayer each : order) a.add(to.getOrDefault(each, 0));
            o.add("damageTo", a);
        }
        return o.size() == 0 ? null : o;
    }
}
