package mesadeduelo.bridge;

import java.util.List;
import java.util.Map;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.ImageKeys;
import forge.StaticData;
import forge.card.CardEdition;
import forge.card.CardStateName;
import forge.card.MagicColor;
import forge.card.mana.ManaAtom;
import forge.game.Game;
import forge.game.GameEntityView;
import forge.game.GameLogEntry;
import forge.game.GameView;
import forge.game.card.Card;
import forge.game.card.CardView;
import forge.game.card.CardView.CardStateView;
import forge.game.card.CounterType;
import forge.game.combat.CombatView;
import forge.game.keyword.Keyword;
import forge.game.keyword.KeywordView;
import forge.game.player.Player;
import forge.game.player.PlayerView;
import forge.game.spellability.SpellAbility;
import forge.game.spellability.StackItemView;
import forge.game.zone.ZoneType;

/** Converte as views do Forge no JSON que o frontend consome. */
final class StateJson {
    private StateJson() { }

    private static final String[] COLOR_KEYS = {"W", "U", "B", "R", "G"};

    /**
     * @param viewer id do jogador que está vendo; a mão dos outros vai só como contagem. Valores negativos ocultam todas as mãos.
     * @param game a partida por trás das views, para ler o poder/resistência base; pode ser null.
     */
    static JsonObject game(GameView gv, int viewer, Game game) {
        JsonObject o = new JsonObject();
        o.addProperty("type", "state");
        o.addProperty("turn", gv.getTurn());
        o.addProperty("phase", gv.getPhase() == null ? null : gv.getPhase().name());
        PlayerView active = gv.getPlayerTurn();
        o.addProperty("activePlayer", active == null ? null : active.getId());
        TurnExtras.add(o, game);
        o.addProperty("gameOver", gv.isGameOver());
        if (gv.isGameOver()) o.addProperty("winner", gv.getWinningPlayerName());

        JsonArray players = new JsonArray();
        if (game != null) {
            int seat = 0;
            for (Player registered : game.getRegisteredPlayers()) {
                PlayerView p = registered.getView();
                JsonObject row = player(p, viewer == p.getId() && !(game.getRules().hasAppliedVariant(forge.game.GameType.Commander) && p.getHasLost()), game);
                JsonObject top = libraryTop(p, gv, viewer, game);
                if (top != null) row.add("libraryTop", top);
                row.addProperty("seat", seat++); players.add(row);
            }
        } else for (PlayerView p : gv.getPlayers()) players.add(player(p, viewer == p.getId(), null));
        o.add("players", players);
        o.add("castable", castable(game, viewer));
        o.add("playableExile", playableExile(game, viewer));
        o.add("suspendedExile", suspendedExile(game, viewer));

        JsonArray stack = new JsonArray();
        if (gv.getStack() != null) {
            for (StackItemView si : gv.getStack()) {
                JsonObject s = new JsonObject();
                s.addProperty("id", si.getId());
                s.addProperty("text", CoinFlipText.stack(si.getText()));
                s.addProperty("kind", stackKind(si));
                if (si.getSourceCard() != null) s.add("source", card(si.getSourceCard()));
                if (si.getActivatingPlayer() != null) s.addProperty("controller", si.getActivatingPlayer().getId());
                JsonObject t = stackTargets(si);
                if (t != null) s.add("targets", t);
                JsonObject cast = StackCast.of(game, si.getId());
                if (cast != null) s.add("cast", cast);
                stack.add(s);
            }
        }
        o.add("stack", stack);

        JsonArray combat = new JsonArray();
        CombatView cv = gv.getCombat();
        if (game != null && game.getCombat() != null) {
            // CombatView commits blockers later; declarations must show the actual current pairs.
            var live = game.getCombat();
            for (Card attacker : live.getAttackers()) {
                JsonObject c = new JsonObject(); c.addProperty("attacker", attacker.getId());
                var defender = live.getDefenderByAttacker(attacker);
                if (defender != null) { c.addProperty("defender", defender.getId()); c.addProperty("defenderKind", defender instanceof Player ? "player" : "card"); }
                JsonArray blockers = new JsonArray();
                for (Card blocker : live.getBlockers(attacker)) blockers.add(blocker.getId());
                c.add("blockers", blockers); combat.add(c);
            }
        } else if (cv != null) {
            for (CardView att : cv.getAttackers()) {
                JsonObject c = new JsonObject();
                c.addProperty("attacker", att.getId());
                GameEntityView def = cv.getDefender(att);
                if (def != null) { c.addProperty("defender", def.getId()); c.addProperty("defenderKind", def instanceof PlayerView ? "player" : "card"); }
                JsonArray blockers = new JsonArray();
                if (cv.getBlockers(att) != null) for (CardView b : cv.getBlockers(att)) blockers.add(b.getId());
                c.add("blockers", blockers);
                combat.add(c);
            }
        }
        o.add("combat", combat);

        JsonArray log = new JsonArray();
        if (gv.getGameLog() != null) {
            List<GameLogEntry> entries = gv.getGameLog().getLogEntries(null);
            for (int i = 0; i < Math.min(40, entries.size()); i++) log.add(CoinFlipText.stack(entries.get(i).message()));
        }
        o.add("log", log);
        return o;
    }

    static JsonObject player(PlayerView p, boolean showHand, Game game) {
        JsonObject o = new JsonObject();
        o.addProperty("id", p.getId());
        o.addProperty("name", p.getLobbyPlayerName());
        o.addProperty("ai", p.isAI());
        o.addProperty("life", p.getLife());
        if (p.getPreventNextDamage() > 0) o.addProperty("preventDamage", p.getPreventNextDamage());
        // Marcadores do jogador (veneno, energia, experiência...): só vai quando há algum.
        if (p.getCounters() != null) {
            JsonObject counters = new JsonObject();
            for (var entry : p.getCounters().entrySet()) if (entry.getCount() > 0) counters.addProperty(entry.getElement().toString(), entry.getCount());
            if (counters.size() > 0) o.add("counters", counters);
        }
        Player engine = game == null ? null : game.getPlayer(p.getId());
        if (engine != null) {
            // O Anel te tenta: quantas vezes já tentou o jogador (o Anel ganha uma habilidade a cada vez, até a quarta).
            if (engine.getNumRingTemptedYou() > 0) o.addProperty("ringTempted", engine.getNumRingTemptedYou());
            if (engine.isMonarch()) o.addProperty("monarch", true);
            // Terrenos jogados neste turno e quantos pode jogar (-1 = sem limite).
            o.addProperty("landsPlayed", engine.getLandsPlayedThisTurn());
            o.addProperty("maxLands", engine.getMaxLandPlaysInfinite() ? -1 : engine.getMaxLandPlays());
            // Bênção da cidade (Ascend) é para sempre; a velocidade (Start your engines!) vai de 1 a 4 e nunca cai a 0.
            if (engine.hasBlessing()) o.addProperty("blessing", true);
            if (engine.getSpeed() > 0) o.addProperty("speed", engine.getSpeed());
            // Mágicas que o jogador conjurou neste turno (Tempestade soma as de todos).
            try { if (engine.getSpellsCastThisTurn() > 0) o.addProperty("spellsCast", engine.getSpellsCastThisTurn()); }
            catch (RuntimeException concurrentRead) { /* leitura durante a jogada do motor: sem contagem desta vez */ }
        }
        o.addProperty("eliminated", p.getHasLost());
        o.addProperty("library", p.getZoneSize(ZoneType.Library));
        o.addProperty("handCount", p.getZoneSize(ZoneType.Hand));
        o.add("hand", showHand ? cards(p.getHand(), game) : new JsonArray());
        o.add("battlefield", cards(p.getBattlefield(), game));
        o.add("graveyard", cards(p.getGraveyard(), game));
        o.add("exile", showHand ? Foretold.forOwner(p.getExile(), game) : cards(p.getExile(), game));
        JsonArray commandZone = new JsonArray(), commanders = new JsonArray(), commanderDamage = new JsonArray();
        for (CardView c : nzv(p.getCommand())) if (c.isCommander()) commandZone.add(card(c, game));
        for (CardView c : nzv(p.getCommanders())) {
            JsonObject commander = new JsonObject(); commander.addProperty("id", c.getId());
            commander.addProperty("name", c.getName()); commander.addProperty("casts", p.getCommanderCast(c));
            commander.addProperty("tax", p.getCommanderCast(c) * 2); commanders.add(commander);
        }
        if (game != null) for (Player owner : game.getRegisteredPlayers()) for (Card commander : owner.getCommanders()) {
            JsonObject damage = new JsonObject(); damage.addProperty("commanderId", commander.getId());
            damage.addProperty("damage", p.getCommanderDamage(commander.getView())); commanderDamage.add(damage);
        }
        o.add("commandZone", commandZone); o.add("commanders", commanders); o.add("commanderDamage", commanderDamage);
        // Os efeitos temporários do Forge também moram na zona de comando; não são cartas jogáveis.
        JsonArray emblems = new JsonArray();
        for (CardView c : nzv(p.getCommand())) if (c.isEmblem()) emblems.add(card(c, game));
        o.add("emblems", emblems);
        Dungeons.add(o, p, game);
        JsonObject pool = new JsonObject();
        for (int i = 0; i < 5; i++) pool.addProperty(COLOR_KEYS[i], p.getMana(MagicColor.WUBRG[i]));
        // A reserva guarda o incolor como ManaAtom.COLORLESS (32); MagicColor.COLORLESS é 0 e nunca tem mana.
        pool.addProperty("C", p.getMana((byte) ManaAtom.COLORLESS));
        o.add("pool", pool);
        return o;
    }

    /**
     * Topo do grimório, só para quem pode vê-lo: "olhe o topo a qualquer momento" (Vizier of the Menagerie, Bolas's
     * Citadel) mostra ao dono; "jogue com o topo revelado" (Courser of Kruphix, Future Sight) mostra a todos.
     * Espectador vê só o que todos os jogadores veem.
     */
    static JsonObject libraryTop(PlayerView p, GameView gv, int viewer, Game game) {
        CardView top = null;
        for (CardView c : nzv(p.getLibrary())) { top = c; break; }
        if (top == null) return null;
        PlayerView seen = null;
        for (PlayerView pv : gv.getPlayers()) if (pv.getId() == viewer) seen = pv;
        boolean visible = seen != null ? top.canBeShownTo(seen) : !gv.getPlayers().isEmpty();
        if (seen == null) for (PlayerView pv : gv.getPlayers()) visible &= top.canBeShownTo(pv);
        return visible ? card(top, game) : null;
    }

    private static Iterable<CardView> nzv(Iterable<CardView> it) { return it == null ? java.util.List.of() : it; }

    static JsonArray cards(Iterable<CardView> cs, Game game) {
        JsonArray a = new JsonArray();
        if (cs != null) for (CardView c : cs) a.add(card(c, game));
        return a;
    }

    static JsonObject card(CardView c) {
        return card(c, null);
    }

    /** Imagens de ficha já resolvidas, por chave de imagem do Forge (null = sem imagem conhecida). */
    private static final Map<String, String> TOKEN_IMAGES = new java.util.concurrent.ConcurrentHashMap<>();

    /**
     * Endereço da imagem de uma ficha no Scryfall, como o ImageFetcher do Forge calcula: a chave
     * "t:nome|SET|número" aponta para o número da ficha na coleção de fichas do SET (ex.: tblb/3).
     * Sem número, vale a primeira ficha com esse nome na coleção.
     */
    static String tokenImage(CardStateView s) {
        String key;
        try { key = s.getImageKey(null); } catch (RuntimeException e) { return null; }
        if (key == null || !key.startsWith(ImageKeys.TOKEN_PREFIX)) return null;
        String cached = TOKEN_IMAGES.get(key);
        if (cached != null) return cached.isEmpty() ? null : cached;
        String url = null;
        String tmp = key.substring(ImageKeys.TOKEN_PREFIX.length());
        boolean back = tmp.endsWith(ImageKeys.BACKFACE_POSTFIX);
        if (back) tmp = tmp.substring(0, tmp.length() - ImageKeys.BACKFACE_POSTFIX.length());
        String[] parts = tmp.split("\\|");
        CardEdition edition = parts.length > 1 ? StaticData.instance().getEditions().get(parts[1]) : null;
        if (edition != null && edition.getType() != CardEdition.Type.CUSTOM_SET) {
            String number = parts.length > 2 ? parts[2] : null;
            if (number == null) {
                for (CardEdition.EditionEntry e : edition.getTokens().get(parts[0])) {
                    if (e.collectorNumber() != null && !e.collectorNumber().isEmpty()) { number = e.collectorNumber(); break; }
                }
            }
            if (number != null) {
                if (number.endsWith("☇")) { back = true; number = number.substring(0, number.length() - 1); }
                url = "https://api.scryfall.com/cards/" + edition.getTokensCode() + "/"
                        + java.net.URLEncoder.encode(number, java.nio.charset.StandardCharsets.UTF_8)
                        + "?format=image&version=normal" + (back ? "&face=back" : "");
            }
        }
        TOKEN_IMAGES.put(key, url == null ? "" : url);
        return url;
    }

    /** Como a permanente ficou virada para baixo (informação pública): metamorfose, disfarce, manifestada ou encoberta. */
    static String faceDownKind(Card gc) {
        if (gc == null) return null;
        if (gc.isManifested()) return "manifest";
        if (gc.isCloaked()) return "cloak";
        SpellAbility cast = gc.getCastSA();
        if (cast == null) return null;
        if (cast.isKeyword(Keyword.DISGUISE)) return "disguise";
        if (cast.isKeyword(Keyword.MORPH) || cast.isKeyword(Keyword.MEGAMORPH)) return "morph";
        return null;
    }

    static JsonObject card(CardView c, Game game) {
        JsonObject o = new JsonObject();
        o.addProperty("id", c.getId());
        if (c.getController() != null) o.addProperty("controller", c.getController().getId());
        o.addProperty("tapped", c.isTapped());
        o.addProperty("token", c.isToken());
        PermanentDetails.visible(o, c);
        PermanentDetails.status(o, c, game);
        if (c.getZone() == ZoneType.Exile && c.isForeTold()) o.addProperty("foretold", true);
        if (c.isFaceDown()) {
            o.addProperty("faceDown", true);
            if (c.getZone() == ZoneType.Battlefield) {
                String kind = faceDownKind(game == null ? null : game.findByView(c));
                if (kind != null) o.addProperty("faceDownKind", kind);
            }
            return o;
        }
        CardStateView s = c.getCurrentState();
        o.addProperty("name", s.getName());
        if (c.isToken()) {
            String img = tokenImage(s);
            if (img != null) o.addProperty("image", img);
        }
        o.addProperty("set", s.getSetCode());
        String cost = s.getManaCost() == null ? "" : s.getManaCost().toString();
        o.addProperty("manaCost", "no cost".equals(cost) ? "" : cost);
        o.addProperty("typeLine", s.getType() == null ? "" : s.getType().toString());
        // Emblemas não têm texto Oracle: o texto vem das habilidades que o efeito carrega.
        o.addProperty("text", c.isEmblem() ? c.getText().replace("\r", "").trim() : s.getOracleText());
        if (c.isEmblem()) o.addProperty("emblem", true);
        PermanentDetails.countsSpells(o, c, game);
        if (c.getZone() == ZoneType.Exile) {
            Card gc = game == null ? null : game.findByView(c);
            if (gc != null && gc.isPlotted()) o.addProperty("plotted", true);
        }
        // Preparar (Strixhaven): a criatura marca o feitiço que pode copiar; a cópia espera no exílio do dono.
        // O Forge cria a cópia como ficha, mas para o jogador ela é o feitiço preparado daquela criatura.
        if (s.getState() == CardStateName.PreparedSpell) {
            o.addProperty("token", false);
            if (c.getAlternateState() != null) o.addProperty("preparedFrom", c.getAlternateState().getName());
        } else if (c.getPreparedSpell() != null) {
            o.addProperty("prepared", true);
            o.addProperty("preparedSpell", c.getPreparedSpell().getCurrentState().getName());
        }
        o.addProperty("creature", s.isCreature());
        o.addProperty("land", s.isLand());
        if (s.isPlaneswalker()) o.addProperty("planeswalker", true);
        // Comandante em qualquer zona (no campo, a mesa marca a permanente com a coroa).
        if (c.isCommander()) o.addProperty("commander", true);
        if (c.getZone() == ZoneType.Battlefield && c.isRingBearer()) o.addProperty("ringBearer", true);
        // Encantamentos de Classe: nível atual e o mais alto que a carta tem (uma habilidade de subir por nível).
        if (s.getType() != null && s.getType().hasSubtype("Class")) {
            Card gc = game == null ? null : game.findByView(c);
            o.addProperty("classLevel", Math.max(1, c.getClassLevel()));
            if (gc != null) o.addProperty("classMaxLevel", 1 + (int) gc.getSpellAbilities().stream().filter(sa -> sa.getApi() == forge.game.ability.ApiType.ClassLevelUp).count());
        }
        // Auras e equipamentos: a carta a que estão presos (ou o jogador, no caso de auras como Curse).
        if (c.getAttachedTo() != null) o.addProperty("attachedTo", c.getAttachedTo().getId());
        else if (c.getEnchantedPlayer() != null) o.addProperty("attachedToPlayer", c.getEnchantedPlayer().getId());
        // Cópias (Clone etc.): o nome impresso da carta que está copiando outra.
        if (c.isCloned() && c.getBackup() != null && !s.getName().equals(c.getBackup().getName())) {
            o.addProperty("copyOf", c.getBackup().getName());
        }
        if (c.getZone() == ZoneType.Battlefield) addMerged(o, game == null ? null : game.findByView(c));
        if (s.isCreature()) {
            o.addProperty("power", s.getPower());
            o.addProperty("toughness", s.getToughness());
            // Base sem bônus, marcadores nem efeitos: o frontend pinta o P/T de verde ou vermelho quando difere.
            Card gc = game == null ? null : game.findByView(c);
            if (gc != null) {
                o.addProperty("basePower", gc.getBasePower());
                o.addProperty("baseToughness", gc.getBaseToughness());
            }
            o.addProperty("damage", c.getDamage());
            o.addProperty("sick", c.isSick());
            o.addProperty("attacking", c.isAttacking());
            o.addProperty("blocking", c.isBlocking());
        }
        // Palavras-chave atuais, inclusive as ganhas por efeitos (Voar da Elspeth, por exemplo).
        if (s.getKeywords() != null && !s.getKeywords().isEmpty()) {
            JsonArray kws = new JsonArray();
            java.util.Set<String> seen = new java.util.LinkedHashSet<>();
            for (KeywordView k : s.getKeywords()) {
                // UNDEFINED: habilidades sem palavra-chave própria (como "esta criatura entra preparada").
                if (k.keyword() != null && k.keyword() != Keyword.UNDEFINED && seen.add(k.keyword().name())) kws.add(k.keyword().name());
            }
            if (!kws.isEmpty()) o.add("keywords", kws);
        }
        PermanentDetails.add(o, c, s, game);
        Map<CounterType, Integer> counters = c.getCounters() == null ? null : toMap(c);
        if (counters != null && !counters.isEmpty()) {
            JsonObject co = new JsonObject();
            counters.forEach((k, v) -> co.addProperty(k.toString(), v));
            o.add("counters", co);
        }
        return o;
    }

    /**
     * Mutação: as cartas que formam a permanente, de cima para baixo, com o nome impresso de cada uma
     * (a de cima dá nome e força; as de baixo, só habilidades). Cartas viradas para baixo vão sem nome.
     */
    static void addMerged(JsonObject o, Card gc) {
        if (gc == null || !gc.hasMergedCard()) return;
        JsonArray merged = new JsonArray();
        for (Card part : gc.getMergedCards()) {
            JsonObject m = new JsonObject();
            m.addProperty("id", part.getId());
            if (part.isFaceDown()) m.addProperty("faceDown", true);
            else {
                forge.game.card.CardState printed = part.getOriginalState(part.getCurrentStateName());
                m.addProperty("name", printed.getName());
                m.addProperty("set", printed.getSetCode());
                String img = tokenImage(printed.getView());
                if (img != null) { m.addProperty("token", true); m.addProperty("image", img); }
            }
            merged.add(m);
        }
        o.add("merged", merged);
    }

    /** {@link Castable}: lê o que a thread do jogo calculou; conferir aqui refaria os efeitos estáticos ao lado dela. */
    static JsonArray castable(Game game, int viewer) {
        if (game == null || viewer < 0) return new JsonArray();
        for (Player pl : game.getPlayers()) if (pl.getId() == viewer) return Castable.read(pl);
        return new JsonArray();
    }

    /** Zone permission outlives priority, timing and available mana; it never grants an extra action. */
    static JsonArray playableExile(Game game, int viewer) {
        JsonArray ids = new JsonArray();
        Player player = game == null || viewer < 0 ? null : game.getPlayer(viewer);
        if (player == null) return ids;
        for (Card card : game.getCardsIn(ZoneType.Exile)) {
            if (card.mayPlay(player).stream().anyMatch(option -> option.grantsZonePermissions())
                || (card.getOwner().equals(player) && (card.isPlotted() || card.isForetold()))) ids.add(card.getId());
        }
        return ids;
    }

    /** A zero-counter suspended card stays visible only while its real Suspend trigger is pending. */
    static JsonArray suspendedExile(Game game, int viewer) {
        JsonArray ids = new JsonArray();
        Player player = game == null || viewer < 0 ? null : game.getPlayer(viewer);
        if (player == null) return ids;
        java.util.Set<Integer> pending = new java.util.HashSet<>();
        for (var item : game.getStack()) {
            SpellAbility ability = item.getSpellAbility();
            if (ability.getTrigger() != null && ability.getTrigger().isKeyword(Keyword.SUSPEND))
                pending.add(ability.getHostCard().getId());
        }
        for (Card card : game.getCardsIn(ZoneType.Exile)) {
            if (card.getOwner().equals(player) && !card.isFaceDown()
                && (card.hasSuspend() || pending.contains(card.getId()))) ids.add(card.getId());
        }
        return ids;
    }

    private static Map<CounterType, Integer> toMap(CardView c) {
        Map<CounterType, Integer> m = new java.util.LinkedHashMap<>();
        for (CounterType t : c.getCounters().elementSet()) m.put(t, c.getCounters().count(t));
        return m;
    }

    /** Alvos de um item da pilha, somando as sub-habilidades (ex.: "destrua X e compre um card" com dois alvos). */
    /** Spell, activated ability or trigger: the table labels each stack item so players know why a card is there. */
    static String stackKind(StackItemView si) {
        return si.isTrigger() ? "trigger" : si.isAbility() ? "ability" : "spell";
    }

    static JsonObject stackTargets(StackItemView si) {
        List<Object> all = new java.util.ArrayList<>();
        for (StackItemView step = si; step != null; step = step.getSubInstance()) {
            if (step.getTargetCards() != null) all.addAll(step.getTargetCards());
            if (step.getTargetPlayers() != null) all.addAll(step.getTargetPlayers());
        }
        return targets(all);
    }

    /** {cards:[ids], players:[ids]} a partir de CardView/PlayerView; null se não houver alvo. */
    static JsonObject targets(Iterable<?> views) {
        JsonArray cards = new JsonArray(), players = new JsonArray();
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (Object v : views) {
            if (v instanceof CardView c && seen.add("c" + c.getId())) cards.add(c.getId());
            else if (v instanceof PlayerView p && seen.add("p" + p.getId())) players.add(p.getId());
        }
        if (cards.isEmpty() && players.isEmpty()) return null;
        JsonObject o = new JsonObject();
        o.add("cards", cards);
        o.add("players", players);
        return o;
    }
}
