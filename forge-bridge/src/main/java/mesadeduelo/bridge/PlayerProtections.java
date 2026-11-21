// As proteções do jogador (proteção contra tudo ou contra algo, resistência à magia, manto), com a carta que as dá e até quando duram.
package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.WeakHashMap;
import java.util.concurrent.ConcurrentHashMap;
import com.google.common.collect.Table;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.ability.ApiType;
import forge.game.card.Card;
import forge.game.keyword.IKeywordsChange;
import forge.game.keyword.Keyword;
import forge.game.keyword.KeywordInterface;
import forge.game.keyword.KeywordsChange;
import forge.game.phase.PhaseHandler;
import forge.game.phase.PhaseType;
import forge.game.player.Player;
import forge.game.player.PlayerView;
import forge.game.combat.Combat;
import forge.game.spellability.SpellAbility;
import forge.game.staticability.StaticAbility;
import forge.game.zone.ZoneType;

/**
 * O Forge guarda o que o jogador ganhou em {@code Player.changedKeywords}, por (timestamp, id da habilidade estática).
 * Com id de estática (Leyline of Sanctity, Ivory Mask), a carta é a dona da estática. Sem id (The One Ring,
 * Teferi's Protection: um Pump que resolveu), o Forge não guarda a origem: {@link #remember} anota a carta e a duração
 * no momento em que a proteção aparece, enquanto a mágica ou habilidade ainda resolve.
 */
final class PlayerProtections {
    private PlayerProtections() { }

    private static final ForgeReflection.FieldRef CHANGES = ForgeReflection.field(Player.class, "changedKeywords");
    private static final Set<ApiType> GRANTS = Set.of(ApiType.Pump, ApiType.PumpAll, ApiType.Protection, ApiType.ProtectionAll);

    /** De onde veio uma proteção dada por mágica ou habilidade: a carta, até quando dura ("turn", "next-turn") e de quem é o turno. */
    record Origin(String source, String until, int untilPlayer) { }
    private static final Map<Game, Map<Long, Origin>> ORIGINS = Collections.synchronizedMap(new WeakHashMap<>());

    static boolean protective(Keyword k) { return k == Keyword.PROTECTION || k == Keyword.HEXPROOF || k == Keyword.SHROUD; }

    @SuppressWarnings("unchecked")
    private static Table<Long, Long, IKeywordsChange> changes(Player p) {
        if (!CHANGES.present()) return null;
        Object table = CHANGES.get(p);
        return table instanceof Table<?, ?, ?> t ? (Table<Long, Long, IKeywordsChange>) t : null;
    }

    private static boolean grantsProtection(IKeywordsChange change) {
        if (!(change instanceof KeywordsChange kc) || kc.getKeywords() == null) return false;
        for (KeywordInterface k : kc.getKeywords()) if (protective(k.getKeyword())) return true;
        return false;
    }

    /** A cada mudança de estado de um jogador: anota a origem das proteções novas dadas pela mágica ou habilidade que está resolvendo. */
    static void remember(Game game) {
        if (game == null) return;
        try {
            SpellAbility resolving = game.getStack().getResolvingAbility();
            if (resolving == null || resolving.getHostCard() == null) return;
            Map<Long, Origin> known = ORIGINS.computeIfAbsent(game, g -> new ConcurrentHashMap<>());
            for (Player p : game.getPlayers()) {
                Table<Long, Long, IKeywordsChange> table = changes(p);
                if (table == null) return;
                for (Table.Cell<Long, Long, IKeywordsChange> cell : table.cellSet())
                    if (cell.getColumnKey() == 0 && !known.containsKey(cell.getRowKey()) && grantsProtection(cell.getValue())) known.put(cell.getRowKey(), origin(resolving));
            }
        } catch (RuntimeException concurrentRead) { /* leitura durante a jogada do motor: fica sem a origem */ }
    }

    /** A carta da mágica ou habilidade e a duração do Pump (ou Protection) que dá a proteção. */
    static Origin origin(SpellAbility resolving) {
        String duration = null; int player = -1;
        for (SpellAbility sa = resolving.getRootAbility(); sa != null; sa = sa.getSubAbility()) {
            if (!GRANTS.contains(sa.getApi())) continue;
            duration = sa.getParamOrDefault("Duration", "");
            if (sa.getActivatingPlayer() != null) player = sa.getActivatingPlayer().getId();
            break;
        }
        String until = duration == null ? null : switch (duration) {
            case "" -> "turn";
            case "UntilYourNextTurn" -> "next-turn";
            default -> null;
        };
        return new Origin(resolving.getHostCard().getName(), until, "next-turn".equals(until) ? player : -1);
    }

    /** A carta dona da habilidade estática que dá a proteção (a de origem, quando a dona é um efeito). */
    private static String staticSource(Game game, long staticId) {
        for (Card c : game.getCardsIn(ZoneType.STATIC_ABILITIES_SOURCE_ZONES))
            for (StaticAbility st : c.getStaticAbilities()) if (st.getId() == staticId) {
                Card from = c.getEffectSource();
                return from != null ? from.getName() : c.getName();
            }
        return null;
    }

    /**
     * As proteções do jogador, uma por palavra-chave: {@code kind} (protection, hexproof, shroud), {@code from} (do que
     * protege: "everything", "red"...; na resistência à magia, só quando é contra algo), e {@code source}, {@code until}
     * e {@code untilPlayer} quando se sabe. Vazio quando não tem nenhuma.
     */
    static JsonArray of(Player p, Game game) {
        JsonArray out = new JsonArray();
        Table<Long, Long, IKeywordsChange> table;
        try { table = changes(p); } catch (RuntimeException e) { table = null; }
        if (table == null) return out;
        Map<Long, Origin> known = ORIGINS.getOrDefault(game, Map.of());
        try {
            for (Table.Cell<Long, Long, IKeywordsChange> cell : List.copyOf(table.cellSet())) {
                if (!(cell.getValue() instanceof KeywordsChange kc) || kc.getKeywords() == null) continue;
                for (KeywordInterface k : kc.getKeywords()) {
                    if (!protective(k.getKeyword()) || !p.hasKeyword(k.getKeyword())) continue;
                    JsonObject o = new JsonObject();
                    o.addProperty("kind", k.getKeyword() == Keyword.PROTECTION ? "protection" : k.getKeyword() == Keyword.HEXPROOF ? "hexproof" : "shroud");
                    String from = k.getKeyword() == Keyword.SHROUD ? null : PermanentDetails.protectionFrom(k.getOriginal());
                    if (from != null) o.addProperty("from", from);
                    if (cell.getColumnKey() != 0) {
                        String source = staticSource(game, cell.getColumnKey());
                        if (source != null) o.addProperty("source", source);
                    } else {
                        Origin origin = known.get(cell.getRowKey());
                        if (origin != null) {
                            o.addProperty("source", origin.source());
                            if (origin.until() != null) o.addProperty("until", origin.until());
                            if (origin.untilPlayer() >= 0) o.addProperty("untilPlayer", origin.untilPlayer());
                        }
                    }
                    if (!out.contains(o)) out.add(o);
                }
            }
        } catch (RuntimeException concurrentRead) { /* leitura durante a jogada do motor: fica para o próximo estado */ }
        return out;
    }

    /** Um golpe de combate que a proteção do jogador segurou: a criatura, o jogador e quanto foi prevenido. */
    record Hit(Card attacker, Player defender, int prevented) { }

    /**
     * Na etapa de dano de combate, os golpes que a proteção dos jogadores de {@code players} segurou. O Forge não diz o
     * que preveniu, só avisa que o jogador mudou (logo depois de prevenir): aqui se refaz a conta de cada criatura sem
     * bloqueio que ataca o jogador e dá dano nesta etapa, pela prevenção estática dele (a proteção entra nela).
     * Criatura bloqueada com atropelar fica de fora: o que passaria para o jogador depende da divisão do dano.
     */
    static List<Hit> combatHits(Game game, Collection<PlayerView> players) {
        List<Hit> out = new ArrayList<>();
        if (game == null || players == null) return out;
        try {
            PhaseHandler phase = game.getPhaseHandler();
            boolean first = phase.is(PhaseType.COMBAT_FIRST_STRIKE_DAMAGE);
            if (!first && !phase.is(PhaseType.COMBAT_DAMAGE)) return out;
            Combat combat = game.getCombat();
            if (combat == null || game.getStack().isResolving()) return out;
            for (PlayerView view : players) {
                Player p = view == null ? null : game.getPlayer(view.getId());
                if (p == null || !p.hasKeyword(Keyword.PROTECTION)) continue;
                for (Card attacker : combat.getAttackersOf(p)) {
                    if (combat.isBlocked(attacker)) continue;
                    boolean strikesNow = first ? attacker.hasFirstStrike() || attacker.hasDoubleStrike() : !attacker.hasFirstStrike() || attacker.hasDoubleStrike();
                    int damage = attacker.getNetCombatDamage();
                    if (!strikesNow || damage <= 0) continue;
                    int prevented = damage - p.staticDamagePrevention(damage, 0, attacker, true);
                    if (prevented > 0) out.add(new Hit(attacker, p, prevented));
                }
            }
        } catch (RuntimeException concurrentRead) { /* leitura durante a jogada do motor: sem o aviso desta vez */ }
        return out;
    }
}
