package mesadeduelo.bridge;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import forge.ai.AiCardMemory;
import forge.ai.AiCardMemory.MemorySet;
import forge.ai.AiCostDecision;
import forge.ai.AvailableActions;
import forge.ai.ComputerUtilMana;
import forge.game.Game;
import forge.game.card.Card;
import forge.game.card.CardCollection;
import forge.game.cost.CostPayment;
import forge.game.cost.CostTap;
import forge.game.mana.ManaCostBeingPaid;
import forge.game.player.Player;
import forge.game.spellability.AbilityManaPart;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import forge.gamemodes.match.input.InputBase;
import forge.gamemodes.match.input.InputPayMana;
import forge.player.PlayerControllerHuman;

/**
 * O Automático do pagamento do jogador. O Forge paga com a lógica da IA ({@code ComputerUtilMana}), que deixa por
 * último as fontes com mais de uma habilidade de mana ou com efeito colateral: um talismã (ou Mind Stone, Arcane
 * Signet) só é virado quando os terrenos não bastam. Aqui a parte genérica sai antes da mana sem custo extra das
 * pedras de mana, guardando os terrenos; o resto continua com o Automático do Forge. Uma pedra só entra se o resto
 * do custo ainda puder ser pago sem ela, então a mana colorida do talismã (com dano) continua só para quando faltar a cor.
 */
final class AutoPay {
    private AutoPay() {}

    private static final ForgeReflection.FieldRef PLAYER = field("player"), COST = field("manaCost"), PAID_FOR = field("saPaidFor"),
        EFFECT = field("effect"), LOCKED = field("locked");
    private static final ForgeReflection.MethodRef RUN_AS_AI = method("runAsAi", Runnable.class), STATE_CHANGED = method("onStateChanged"),
        SUPPORTS_AUTO = method("supportAutoPay"), FINISHED = ForgeReflection.method(InputBase.class, "isFinished");

    private static ForgeReflection.FieldRef field(String name) { return ForgeReflection.field(InputPayMana.class, name); }

    private static ForgeReflection.MethodRef method(String name, Class<?>... args) { return ForgeReflection.method(InputPayMana.class, name, args); }

    /**
     * O OK do jogador num pagamento de mana. Devolve false se o pedido atual não é um pagamento (o chamador segue
     * com o OK de sempre, que no pagamento é o Automático do Forge: também quando falta ao Forge algum campo daqui).
     * Roda na thread da interface, como o OK do Forge.
     */
    static boolean ok(PlayerControllerHuman human) {
        if (!(human.getInputQueue().getInput() instanceof InputPayMana pay)
            || !ForgeReflection.present(PLAYER, COST, PAID_FOR, EFFECT, LOCKED, RUN_AS_AI, STATE_CHANGED, SUPPORTS_AUTO, FINISHED)) return false;
        try {
            // Fora do caso comum, o OK de sempre (que também não faz nada num pedido já encerrado ou travado).
            if ((boolean) FINISHED.invoke(pay) || !(boolean) SUPPORTS_AUTO.invoke(pay) || (boolean) LOCKED.get(pay)) { human.selectButtonOk(); return true; }
            Player player = (Player) PLAYER.get(pay);
            if (!player.getManaPool().isEmpty()) { human.selectButtonOk(); return true; }
            LOCKED.set(pay, true); // como no OK do Forge: um segundo clique não paga de novo
            Game game = player.getGame();
            game.getAction().invoke(() -> {
                try {
                    RUN_AS_AI.invoke(pay, (Runnable) () -> pay(pay, player));
                    STATE_CHANGED.invoke(pay);
                } catch (ReflectiveOperationException e) { throw new IllegalStateException(e); }
            });
        } catch (ReflectiveOperationException e) { throw new IllegalStateException(e); }
        return true;
    }

    /**
     * O Automático do Forge fica desligado quando só fecha com a mana extra do Caged Sun, que o teste dele não conta
     * (AvailableActions.canAffordWithLandBonus); o pagamento de verdade usa essa mana.
     */
    static boolean payableWithLandBonus(InputPayMana pay) {
        if (!ForgeReflection.present(PLAYER, COST, PAID_FOR, EFFECT, SUPPORTS_AUTO)) return false;
        try {
            if (!(boolean) SUPPORTS_AUTO.invoke(pay)) return false;
            return AvailableActions.canAffordWithLandBonus((ManaCostBeingPaid) COST.get(pay), (SpellAbility) PAID_FOR.get(pay),
                (Player) PLAYER.get(pay), (boolean) EFFECT.get(pay));
        } catch (ReflectiveOperationException | RuntimeException e) { return false; }
    }

    /** Na thread do jogo, com a IA no controle (como o Automático do Forge): vira as pedras escolhidas e paga o resto. */
    private static void pay(InputPayMana pay, Player player) {
        ManaCostBeingPaid cost = (ManaCostBeingPaid) COST.get(pay);
        SpellAbility paidFor = (SpellAbility) PAID_FOR.get(pay);
        boolean effect = (boolean) EFFECT.get(pay);
        for (SpellAbility stone : stones(player, cost, paidFor, effect)) {
            if (cost.isPaid()) break;
            CostPayment payment = new CostPayment(stone.getPayCosts(), stone);
            if (!payment.payComputerCosts(new AiCostDecision(player, stone, effect, true))) continue;
            player.getGame().getStack().addAndUnfreeze(stone);
            player.getManaPool().payManaFromAbility(paidFor, cost, stone);
        }
        if (!cost.isPaid()) ComputerUtilMana.payManaCost(cost, paidFor, player, effect);
    }

    /**
     * As habilidades de mana das pedras que pagam a parte genérica, na ordem de uso: primeiro as que dão mana
     * incolor, depois as de uma cor qualquer (Arcane Signet). Cada pedra só entra se o Forge ainda conseguir pagar o
     * resto do custo sem ela, sem virar mais permanentes do que viraria sozinho.
     */
    static List<SpellAbility> stones(Player player, ManaCostBeingPaid cost, SpellAbility paidFor, boolean effect) {
        List<SpellAbility> colorless = new ArrayList<>(), colored = new ArrayList<>();
        for (Card card : player.getCardsIn(ZoneType.Battlefield)) {
            if (!card.isArtifact() || card.isCreature() || card.isLand()) continue;
            SpellAbility best = null;
            for (SpellAbility ma : card.getManaAbilities()) {
                ma.setActivatingPlayer(player);
                AbilityManaPart part = ma.getManaPart();
                // Só {T}: sem mana para ativar (Signets), sem sacrifício e sem efeito junto (o dano do talismã).
                if (part == null || ma.getSubAbility() != null || !ma.getPayCosts().hasTapCost()
                    || !ma.getPayCosts().hasOnlySpecificCostType(CostTap.class) || !ma.canPlay()
                    || !part.meetsManaRestrictions(paidFor)) continue;
                if (best == null || "C".equals(part.mana(ma)) && !"C".equals(best.getManaPart().mana(best))) best = ma;
            }
            if (best != null) ("C".equals(best.getManaPart().mana(best)) ? colorless : colored).add(best);
        }
        colorless.addAll(colored);

        // O que o Forge viraria sem a ajuda: a troca só vale se não virar mais permanentes do que isso
        // (um Signet, que pede {1}, pode pagar duas manas com um terreno só).
        CardCollection forgePlan = ComputerUtilMana.getManaSourcesToPayCost(new ManaCostBeingPaid(cost), paidFor, player, effect);
        if (forgePlan == null) return List.of();
        List<SpellAbility> chosen = new ArrayList<>();
        int generic = cost.getGenericManaAmount();
        for (SpellAbility stone : colorless) {
            int amount = stone.amountOfManaGenerated(true);
            if (amount <= 0 || amount > generic) continue; // mana a mais sobraria na reserva
            chosen.add(stone);
            if (payableWithout(chosen, cost, generic - amount, paidFor, player, effect, forgePlan.size())) generic -= amount;
            else chosen.remove(chosen.size() - 1);
            if (generic == 0) break;
        }
        return chosen;
    }

    /**
     * O resto do custo (com `generic` de mana genérica) dá para pagar sem nenhuma das pedras escolhidas, e sem
     * virar, ao todo, mais permanentes do que as `limit` que o Forge viraria? As pedras ficam reservadas (como a IA
     * reserva mana para a próxima mágica) enquanto o Forge planeja o resto.
     */
    private static boolean payableWithout(List<SpellAbility> chosen, ManaCostBeingPaid cost, int generic,
                                          SpellAbility paidFor, Player player, boolean effect, int limit) {
        Set<Card> tapped = new LinkedHashSet<>();
        for (SpellAbility s : chosen) tapped.add(s.getHostCard());
        ManaCostBeingPaid rest = new ManaCostBeingPaid(cost);
        rest.decreaseGenericMana(cost.getGenericManaAmount() - generic);
        if (rest.isPaid()) return tapped.size() <= limit;
        for (Card c : tapped) AiCardMemory.rememberCard(player, c, MemorySet.HELD_MANA_SOURCES_FOR_NEXT_SPELL);
        CardCollection plan;
        try { plan = ComputerUtilMana.getManaSourcesToPayCost(rest, paidFor, player, effect); }
        finally { for (Card c : tapped) AiCardMemory.forgetCard(player, c, MemorySet.HELD_MANA_SOURCES_FOR_NEXT_SPELL); }
        if (plan == null) return false;
        tapped.addAll(plan);
        return tapped.size() <= limit;
    }
}
