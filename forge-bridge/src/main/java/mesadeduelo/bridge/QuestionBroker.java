package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicInteger;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import forge.deck.Deck;
import forge.game.GameEntityView;
import forge.game.card.CardView;
import forge.game.player.PlayerView;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.HostedMatch;
import forge.gamemodes.net.ProtocolMethod;
import forge.gamemodes.net.event.GuiGameEvent;
import forge.gui.FThreads;
import forge.gui.GuiBase;
import forge.gui.interfaces.IGuiGame;
import forge.player.PlayerControllerHuman;
import forge.util.FSerializableFunction;

/**
 * Perguntas que bloqueiam a thread do jogo ({@code sendAndWait} do {@code ProtocolGuiGame}): cada método do Forge
 * vira um {question:{id, method, kind, title, options...}} no estado do assento, e a thread espera a resposta do
 * navegador ({type:"answer", id, indices|value|text|amounts}) ou a resposta padrão quando a partida é abandonada.
 */
final class QuestionBroker {
    private final Session session;
    private final AtomicInteger questionSeq = new AtomicInteger();
    /** Votos já anunciados na votação do conselho em andamento. */
    final Votes.Tally voteTally = new Votes.Tally();
    /** Uma pergunta aberta: o método do Forge, os argumentos, as opções na ordem do JSON e a resposta que a thread espera. */
    record Question(int id, ProtocolMethod method, Object[] args, List<Object> options,
                            CompletableFuture<Object> answer, JsonObject json) { }

    QuestionBroker(Session session) { this.session = session; }

    /**
     * A carta que pede a decisão em curso: a que o controlador marcou ao chamar a escolha (conjurar, ativar, gatilho,
     * efeito) ou, numa escolha durante a resolução, a da mágica ou habilidade que está resolvendo.
     */
    static CardView asking(Seat seat, Object input, forge.game.Game game) {
        if (seat.controller() instanceof AskingController controller && controller.asking() != null) return controller.asking();
        return input == null ? InputContext.resolvingSource(game) : InputContext.resolvingSource(input, game);
    }

    Object ask(Seat seat, GuiGameEvent ev, HostedMatch hosted, MatchLifecycle life) {
        Object[] a = ev.getObjects();
        JsonObject q = new JsonObject();
        List<Object> options = new ArrayList<>();
        int id = questionSeq.incrementAndGet();
        q.addProperty("id", id);
        q.addProperty("method", ev.getMethod().name());

        Prompt p = new Prompt(seat, a, q, options, hosted);
        Object immediate = switch (ev.getMethod()) {
            case sideboard -> sideboard(p);
            case getChoices -> choices(p);
            case getAbilityToPlay -> abilityToPlay(p);
            case chooseSingleEntityForEffect -> singleEntity(p);
            case chooseEntitiesForEffect -> entities(p);
            case order -> order(p);
            case confirm -> confirm(p);
            case showConfirmDialog -> confirmDialog(p);
            case showOptionDialog -> optionDialog(p);
            case showInputDialog -> inputDialog(p);
            case assignGenericAmount -> genericAmount(p);
            case assignCombatDamage -> combatDamage(p);
            case manipulateCardList -> cardList(p);
            default -> unsupported(seat, ev.getMethod());
        };
        if (immediate != ASK) return immediate;

        // Toda pergunta mostra a carta que a fez, mesmo quando o Forge não a cita.
        if (!q.has("card")) {
            CardView source = asking(seat, null, hosted.getGame());
            if (source != null) q.add("card", StateJson.card(source));
        }
        Question question = new Question(id, ev.getMethod(), a, options, new CompletableFuture<>(), q);
        var game = hosted.getGame();
        int playerId = seat.me == null ? -1 : seat.me.getId();
        if (life.cancelled() || life.isConceding(game, playerId) || seat.eliminated()) return defaultAnswer(question);
        seat.question = question;
        // A close can race the precheck: publish first, then observe its cancellation flag again.
        if (life.cancelled() || life.isConceding(game, playerId) || seat.eliminated() || (game != null && game.isGameOver()))
            question.answer().complete(defaultAnswer(question));
        session.markDirty();
        try {
            if (FThreads.isGuiThread() && GuiBase.getInterface() instanceof HeadlessGui headless)
                return headless.awaitBrowserAnswer(question.answer());
            while (true) {
                life.pump(game);
                if (life.cancelled() || game.isGameOver() || life.isConceding(game, playerId))
                    question.answer().complete(defaultAnswer(question));
                try {
                    return GuiBase.getInterface() instanceof HeadlessGui headless
                        ? headless.awaitGameAnswer(question.answer(), 50)
                        : question.answer().get(50, java.util.concurrent.TimeUnit.MILLISECONDS);
                }
                catch (java.util.concurrent.TimeoutException waiting) { /* Pump this game's lifecycle only. */ }
            }
        } catch (InterruptedException | java.util.concurrent.CancellationException e) {
            return defaultAnswer(question);
        } catch (Exception e) {
            // A partida segue com a resposta padrão; o log diz que o jogador não escolheu.
            Log.of(session).warn("Sessão " + session.code + ": pergunta " + ev.getMethod() + " caiu na resposta padrão: " + e);
            return defaultAnswer(question);
        } finally {
            if (seat.question == question) { seat.question = null; seat.inputGen.incrementAndGet(); }
            session.markDirty();
        }
    }

    /** Devolvido por um tratador quando a pergunta vai para o navegador; qualquer outro valor é a resposta na hora. */
    private static final Object ASK = new Object();

    /** O que cada tratador de pergunta recebe: o assento, os argumentos do Forge, a pergunta e as opções na ordem do JSON. */
    private record Prompt(Seat seat, Object[] a, JsonObject q, List<Object> options, HostedMatch hosted) { }

    private Object sideboard(Prompt p) {
        Seat seat = p.seat();
        Deck approved = seat.approvedDeck;
        if (approved == null) throw new IllegalStateException("Confirme o sideboard antes de continuar.");
        return approved.getMain().toFlatList();
    }

    private Object choices(Prompt p) {
        Seat seat = p.seat(); Object[] a = p.a(); JsonObject q = p.q(); List<Object> options = p.options(); HostedMatch hosted = p.hosted();
        // min/max -1: é um reveal() do Forge (Explore, revelar o topo...), só para mostrar as cartas.
        q.addProperty("kind", (Integer) a[1] < 0 ? "reveal" : "choose");
        q.addProperty("title", String.valueOf(a[0]));
        q.addProperty("min", (Integer) a[1]);
        q.addProperty("max", (Integer) a[2]);
        @SuppressWarnings("unchecked") FSerializableFunction<Object, String> display = (FSerializableFunction<Object, String>) a[5];
        options.addAll((Collection<?>) a[3]);
        if (options.size() >= 30 && seat.controller() instanceof AskingController controller && controller.namingCard()) {
            // Nomear uma carta: em geral todos os nomes do jogo. Vão só os textos, e a mesa mostra uma busca em vez da lista.
            q.addProperty("purpose", "card-name");
            JsonArray names = new JsonArray();
            for (Object o : options) names.add(display != null ? display.apply(o) : String.valueOf(o));
            q.add("options", names);
            return ASK;
        }
        JsonArray rows = optionsJson(options, display);
        Dungeons.roomChoice(hosted.getGame(), options, rows, q);
        Piles.choose(q, options, hosted.getGame());
        q.add("options", rows);
        CoinFlipText.choice(q);
        voteQuestion(q, hosted.getGame());
        return ASK;
    }

    private Object abilityToPlay(Prompt p) {
        Seat seat = p.seat(); Object[] a = p.a(); JsonObject q = p.q(); List<Object> options = p.options();
        Collection<?> abilities = (Collection<?>) a[1];
        if (abilities.size() == 1) return abilities.iterator().next();
        q.addProperty("kind", "choose");
        q.addProperty("title", "Qual habilidade usar?");
        q.addProperty("min", 0);
        q.addProperty("max", 1);
        if (a[0] != null) q.add("card", StateJson.card((CardView) a[0]));
        options.addAll((Collection<?>) a[1]);
        JsonArray rows = optionsJson(options, null);
        if (seat.controller() instanceof PlayerControllerHuman human) {
            AbilityOptions.describe(human, options, rows);
            AbilityOptions.addCosts(human, options, rows);
        }
        q.addProperty("purpose", "play-mode");
        q.add("options", rows);
        return ASK;
    }

    private Object singleEntity(Prompt p) {
        Object[] a = p.a(); JsonObject q = p.q(); List<Object> options = p.options(); HostedMatch hosted = p.hosted();
        q.addProperty("kind", "choose");
        q.addProperty("title", String.valueOf(a[0]));
        q.addProperty("min", Boolean.TRUE.equals(a[3]) ? 0 : 1);
        q.addProperty("max", 1);
        options.addAll((Collection<?>) a[1]);
        q.add("options", optionsJson(options, null));
        voteQuestion(q, hosted.getGame());
        ChooserPrompt.describe(q, String.valueOf(a[0]), hosted.getGame());
        return ASK;
    }

    private Object entities(Prompt p) {
        Object[] a = p.a(); JsonObject q = p.q(); List<Object> options = p.options(); HostedMatch hosted = p.hosted();
        q.addProperty("kind", "choose");
        q.addProperty("title", String.valueOf(a[0]));
        q.addProperty("min", (Integer) a[2]);
        q.addProperty("max", (Integer) a[3]);
        options.addAll((Collection<?>) a[1]);
        q.add("options", optionsJson(options, null));
        ChooserPrompt.describe(q, String.valueOf(a[0]), hosted.getGame());
        return ASK;
    }

    private Object order(Prompt p) {
        Object[] a = p.a(); JsonObject q = p.q(); List<Object> options = p.options(); HostedMatch hosted = p.hosted();
        if (ReplacementOrder.is(a)) {
            ReplacementOrder.describe(q, options, a, InputContext.resolvingSource(hosted.getGame()) != null);
            return ASK;
        }
        q.addProperty("title", String.valueOf(a[0]));
        options.addAll((Collection<?>) a[4]);
        int remMin = (Integer) a[2], remMax = (Integer) a[3];
        if (remMin == 0 && remMax == 0) {
            // Uma ordem já escolhida antes (os mesmos gatilhos de novo) chega pronta na lista de destino.
            if (a[5] instanceof Collection<?> placed) options.addAll(placed);
            q.addProperty("kind", "order");
        } else {
            // many(): escolher um subconjunto (ex.: vidência "quais vão para o fundo"); os que sobram ficam de fora.
            q.addProperty("kind", "choose");
            q.addProperty("min", remMax < 0 ? 0 : Math.max(0, options.size() - remMax));
            q.addProperty("max", remMin < 0 ? options.size() : options.size() - remMin);
        }
        JsonArray rows = optionsJson(options, null);
        if ("order".equals(q.get("kind").getAsString()) && AbilityOptions.triggers(options, rows)) q.addProperty("purpose", "triggers");
        else LibraryChoice.describe(q, String.valueOf(a[0]), options);
        if (!q.has("purpose")) Piles.split(q, String.valueOf(a[0]), options, hosted.getGame());
        q.add("options", rows);
        return ASK;
    }

    private Object confirm(Prompt p) {
        Object[] a = p.a(); JsonObject q = p.q();
        q.addProperty("kind", "confirm");
        q.addProperty("title", String.valueOf(a[1]));
        if (a[0] != null) q.add("card", StateJson.card((CardView) a[0]));
        @SuppressWarnings("unchecked") List<String> labels = (List<String>) a[3];
        q.add("options", labelsJson(labels == null || labels.size() < 2 ? List.of("Sim", "Não") : labels));
        commanderZone(q, a[0] instanceof CardView cv ? cv : null, String.valueOf(a[1]));
        return ASK;
    }

    private Object confirmDialog(Prompt p) {
        Object[] a = p.a(); JsonObject q = p.q();
        q.addProperty("kind", "confirm");
        q.addProperty("title", String.valueOf(a[0]));
        q.add("options", labelsJson(List.of(String.valueOf(a[2]), String.valueOf(a[3]))));
        return ASK;
    }

    private Object optionDialog(Prompt p) {
        Object[] a = p.a(); JsonObject q = p.q(); List<Object> options = p.options();
        q.addProperty("kind", "choose");
        q.addProperty("title", String.valueOf(a[0]));
        q.addProperty("min", 1);
        q.addProperty("max", 1);
        @SuppressWarnings("unchecked") List<String> labels = (List<String>) a[3];
        options.addAll(labels);
        q.add("options", optionsJson(options, null));
        return ASK;
    }

    private Object inputDialog(Prompt p) {
        Object[] a = p.a(); JsonObject q = p.q(); List<Object> options = p.options();
        @SuppressWarnings("unchecked") List<String> choices = (List<String>) a[4];
        q.addProperty("title", String.valueOf(a[0]));
        if (choices != null && !choices.isEmpty()) {
            q.addProperty("kind", "choose");
            q.addProperty("min", 1);
            q.addProperty("max", 1);
            options.addAll(choices);
            q.add("options", optionsJson(options, null));
        } else {
            q.addProperty("kind", "text");
            q.addProperty("initial", a[3] == null ? "" : String.valueOf(a[3]));
            q.addProperty("numeric", Boolean.TRUE.equals(a[5]));
        }
        return ASK;
    }

    private Object genericAmount(Prompt p) {
        Object[] a = p.a(); JsonObject q = p.q(); List<Object> options = p.options();
        @SuppressWarnings("unchecked") Map<Object, Integer> limits = (Map<Object, Integer>) a[1];
        int total = (Integer) a[2], min = Boolean.TRUE.equals(a[3]) ? 1 : 0;
        if (total <= 0) return Map.of();
        options.addAll(limits.keySet());
        q.addProperty("kind", "amount"); q.addProperty("total", total);
        q.addProperty("title", "Distribua o total entre as opções");
        if (a[0] instanceof CardView card) q.add("card", StateJson.card(card));
        JsonArray rows = optionsJson(options, null);
        for (int i = 0; i < options.size(); i++) {
            JsonObject row = rows.get(i).getAsJsonObject();
            row.addProperty("min", min); row.addProperty("max", Math.min(total, limits.get(options.get(i))));
        }
        q.add("options", rows);
        return ASK;
    }

    private Object combatDamage(Prompt p) {
        Object[] a = p.a(); JsonObject q = p.q(); List<Object> options = p.options();
        // Bloqueio duplo (ou atropelar): o jogador escolhe como dividir o dano, com a divisão automática pronta.
        @SuppressWarnings("unchecked") List<CardView> blockers = (List<CardView>) a[1];
        if (blockers == null || blockers.isEmpty() || (Integer) a[2] <= 0) return autoCombatDamage(a);
        CombatDamage.describe(q, options, a);
        return ASK;
    }

    private Object cardList(Prompt p) {
        Object[] a = p.a();
        List<CardView> out = new ArrayList<>();
        ((Iterable<?>) a[1]).forEach(o -> out.add((CardView) o));
        return out;
    }

    private static Object unsupported(Seat seat, ProtocolMethod method) {
        seat.send(Session.toast("error", "Esta decisão ainda não é suportada: " + method + "."));
        if (Boolean.getBoolean("mesa.strictPrompts")) throw new IllegalStateException("Unsupported prompt: " + method);
        return null;
    }

    void answer(Seat seat, JsonObject msg) {
        Question q = seat.question;
        if (q == null || !msg.has("id") || ClientActions.exactInt(msg.get("id")) != q.id()) return;
        validateAnswer(q, msg);
        Object result;
        switch (q.method()) {
            case confirm, showConfirmDialog -> result = msg.get("value").getAsBoolean();
            case showOptionDialog -> result = firstIndex(msg);
            case showInputDialog -> result = q.options().isEmpty() ? ClientActions.str(msg, "text", "") : pick(q, msg).stream().findFirst().orElse(null);
            case getAbilityToPlay, chooseSingleEntityForEffect -> result = pick(q, msg).stream().findFirst().orElse(null);
            case order -> {
                result = new IGuiGame.OrderResult<>(pick(q, msg), false);
                if (msg.has("all") && msg.get("all").isJsonPrimitive() && msg.get("all").getAsBoolean()
                        && q.json().has("applyToAll") && q.json().get("applyToAll").getAsBoolean()
                        && seat.controller() instanceof AskingController controller) controller.applyReplacementToAll();
            }
            case assignCombatDamage -> result = CombatDamage.result(q.options(), CombatDamage.validate(q.json(), msg.get("amounts")));
            case assignGenericAmount -> {
                int[] values = AmountAllocation.validate(q.json(), msg.get("amounts"));
                Map<Object, Integer> allocation = new LinkedHashMap<>();
                for (int i = 0; i < values.length; i++) allocation.put(q.options().get(i), values[i]);
                result = allocation;
            }
            default -> result = pick(q, msg);
        }
        q.answer().complete(result);
    }

    /**
     * Regra 903.9a: o comandante foi para o cemitério ou o exílio e o dono pode mandá-lo para a zona de comando.
     * O Forge só manda o texto da regra em inglês; a pergunta ganha onde o comandante está, e a mesa nomeia os
     * botões ("Enviar à zona de comando" ou "Manter no cemitério"). "Sim" continua sendo enviar.
     */
    private static void commanderZone(JsonObject q, CardView commander, String text) {
        if (commander == null || !text.contains("its owner may put it into the command zone")) return;
        q.addProperty("purpose", "commander-zone");
        // Título curto em português para a barra da pergunta minimizada e mesas antigas.
        q.addProperty("title", "Enviar o comandante para a zona de comando?");
        ZoneType zone = commander.getZone();
        q.addProperty("zone", zone == null ? "Graveyard" : zone.name());
    }

    private static void validateAnswer(Question q, JsonObject msg) {
        if (q.method() == ProtocolMethod.confirm || q.method() == ProtocolMethod.showConfirmDialog) {
            if (!msg.has("value") || !msg.get("value").isJsonPrimitive() || !msg.get("value").getAsJsonPrimitive().isBoolean())
                throw new IllegalArgumentException("Escolha uma resposta válida.");
            return;
        }
        if (q.method() == ProtocolMethod.assignGenericAmount) { AmountAllocation.validate(q.json(), msg.get("amounts")); return; }
        if (q.method() == ProtocolMethod.assignCombatDamage) { CombatDamage.validate(q.json(), msg.get("amounts")); return; }
        if (q.method() == ProtocolMethod.showInputDialog && q.options().isEmpty()) {
            String text = MatchConfig.string(msg, "text");
            if (text.length() > 1000) throw new IllegalArgumentException("A resposta é longa demais.");
            if (Boolean.TRUE.equals(q.args()[5])) try { Integer.parseInt(text); }
                catch (NumberFormatException e) { throw new IllegalArgumentException("Informe um número inteiro."); }
            return;
        }
        JsonArray indices = msg.has("indices") && msg.get("indices").isJsonArray() ? msg.getAsJsonArray("indices") : new JsonArray();
        Set<Integer> unique = new java.util.HashSet<>();
        for (JsonElement e : indices) {
            int i;
            try { i = ClientActions.exactInt(e); } catch (RuntimeException ex) { throw new IllegalArgumentException("Seleção inválida."); }
            if (i < 0 || i >= q.options().size() || !unique.add(i)) throw new IllegalArgumentException("Seleção inválida.");
        }
        String kind = q.json().get("kind").getAsString();
        if ("order".equals(kind) && unique.size() != q.options().size()) throw new IllegalArgumentException("Ordene todas as opções.");
        if ("choose".equals(kind)) {
            int min = q.json().has("min") ? q.json().get("min").getAsInt() : 0;
            int max = q.json().has("max") ? q.json().get("max").getAsInt() : q.options().size();
            if (unique.size() < min || (max >= 0 && unique.size() > max)) throw new IllegalArgumentException("A quantidade de opções selecionadas é inválida.");
        }
    }

    private static int firstIndex(JsonObject msg) {
        JsonArray idx = msg.getAsJsonArray("indices");
        return idx == null || idx.isEmpty() ? 0 : idx.get(0).getAsInt();
    }

    private static List<Object> pick(Question q, JsonObject msg) {
        List<Object> out = new ArrayList<>();
        JsonArray idx = msg.getAsJsonArray("indices");
        if (idx != null) for (JsonElement e : idx) {
            int i = e.getAsInt();
            if (i >= 0 && i < q.options().size()) out.add(q.options().get(i));
        }
        return out;
    }

    static Object defaultAnswer(Question q) {
        return switch (q.method()) {
            case confirm -> q.args()[2];
            case showConfirmDialog -> q.args()[4];
            case showOptionDialog -> q.args()[4];
            case showInputDialog -> q.args()[3];
            case order -> new IGuiGame.OrderResult<>(isSubset(q) ? new ArrayList<>() : new ArrayList<>(q.options()), false);
            // Only used while a game is being abandoned, to release the blocked engine safely.
            case assignGenericAmount -> {
                Map<Object, Integer> allocation = new LinkedHashMap<>();
                int remaining = q.json().get("total").getAsInt();
                JsonArray bounds = q.json().getAsJsonArray("options");
                for (int i = 0; i < q.options().size(); i++) {
                    int min = bounds.get(i).getAsJsonObject().get("min").getAsInt();
                    allocation.put(q.options().get(i), min); remaining -= min;
                }
                for (int i = 0; i < q.options().size() && remaining > 0; i++) {
                    Object target = q.options().get(i);
                    int extra = Math.min(remaining, bounds.get(i).getAsJsonObject().get("max").getAsInt() - allocation.get(target));
                    allocation.merge(target, extra, Integer::sum); remaining -= extra;
                }
                yield allocation;
            }
            case assignCombatDamage -> autoCombatDamage(q.args());
            case getChoices, chooseEntitiesForEffect -> new ArrayList<>(q.options().subList(0, Math.max(0, Math.min(q.options().size(), (Integer) (q.method() == ProtocolMethod.getChoices ? q.args()[1] : q.args()[2])))));
            default -> null;
        };
    }

    private static boolean isSubset(Question q) {
        return (Integer) q.args()[2] != 0 || (Integer) q.args()[3] != 0;
    }

    /** Dano letal em cada bloqueador, na ordem; o resto vai para o defensor (atropelar) ou para o último bloqueador. */
    private static Map<CardView, Integer> autoCombatDamage(Object[] a) {
        @SuppressWarnings("unchecked") List<CardView> blockers = (List<CardView>) a[1];
        int damage = (Integer) a[2];
        GameEntityView defender = (GameEntityView) a[3];
        Map<CardView, Integer> map = new HashMap<>();
        for (int i = 0; i < blockers.size() && damage > 0; i++) {
            CardView b = blockers.get(i);
            int lethal = Math.max(1, b.getLethalDamage());
            int amt = Math.min(damage, lethal);
            map.merge(b, amt, Integer::sum);
            damage -= amt;
        }
        if (damage > 0) {
            if (defender != null) map.put(null, damage);
            else if (!blockers.isEmpty()) map.merge(blockers.get(blockers.size() - 1), damage, Integer::sum);
        }
        return map;
    }

    private static JsonArray optionsJson(List<Object> options, FSerializableFunction<Object, String> display) {
        JsonArray arr = new JsonArray();
        for (Object o : options) {
            JsonObject j = new JsonObject();
            if (o instanceof CardView cv) { j.addProperty("kind", "card"); j.add("card", StateJson.card(cv)); }
            else if (o instanceof PlayerView pv) { j.addProperty("kind", "player"); j.addProperty("id", pv.getId()); }
            j.addProperty("label", display != null ? display.apply(o) : String.valueOf(o));
            arr.add(j);
        }
        return arr;
    }

    /** Pedido de voto: a carta que vota e os votos já dados, para a mesa explicar cada opção. */
    private void voteQuestion(JsonObject q, forge.game.Game game) {
        SpellAbility vote = Votes.current(game);
        if (vote == null || vote.getHostCard() == null || !Votes.isVotePrompt(q.get("title").getAsString())) return;
        q.addProperty("purpose", "vote");
        q.addProperty("title", "Votação: " + vote.getHostCard().getName());
        q.add("card", StateJson.card(vote.getHostCard().getView()));
        q.add("votes", votesJson(game, voteTally.of(vote)));
    }

    static JsonArray votesJson(forge.game.Game game, List<String[]> votes) {
        JsonArray arr = new JsonArray();
        for (String[] v : votes) {
            for (forge.game.player.Player p : game.getRegisteredPlayers()) if (p.getName().equals(v[0])) {
                JsonObject j = new JsonObject(); j.addProperty("player", p.getId()); j.addProperty("label", v[1]); arr.add(j); break;
            }
        }
        return arr;
    }

    /** Anúncio de voto do Forge (em inglês, com a contagem crua): guarda a contagem e vira um aviso curto. */
    String voteNotice(forge.game.Game game, String text) {
        SpellAbility vote = Votes.current(game);
        if (vote == null) return text;
        List<String> names = game.getRegisteredPlayers().stream().map(forge.game.player.Player::getName).toList();
        List<String[]> votes = Votes.parse(text, names);
        if (votes == null) return text;
        voteTally.observe(vote, votes);
        String notice = Votes.notice(text, names);
        return notice != null ? notice : text;
    }

    private static JsonArray labelsJson(List<String> labels) {
        JsonArray arr = new JsonArray();
        labels.forEach(arr::add);
        return arr;
    }
}
