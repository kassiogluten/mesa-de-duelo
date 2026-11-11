package mesadeduelo.bridge;

import java.util.List;

import com.google.gson.JsonObject;

import forge.game.GameView;
import forge.game.card.CardView;
import forge.game.player.PlayerView;
import forge.game.spellability.StackItemView;
import forge.gamemodes.match.HostedMatch;

/**
 * Apontar uma carta para a mesa ({type:"point", card}): quem joga destaca uma carta que todos veem (campo, pilha,
 * cemitério, exílio, zona de comando) e o aviso {type:"point", player, card} vai para todos os assentos e para quem
 * assiste. Sem texto livre, não há o que moderar; a mão e o grimório ficam de fora, para não revelar nada.
 */
final class CardPointer {
    /** Intervalo mínimo entre dois apontamentos do mesmo assento, para ninguém encher a mesa de avisos. */
    static final long POINT_EVERY_MS = 700;

    private CardPointer() {}

    static void point(Session session, Seat seat, JsonObject msg) {
        if (seat.me == null || !msg.has("card") || !msg.get("card").isJsonPrimitive() || !msg.get("card").getAsJsonPrimitive().isNumber()) return;
        int id = msg.get("card").getAsInt();
        HostedMatch m = session.match;
        GameView gv = m == null ? null : m.getGameView();
        if (gv == null || !isPublic(gv, id)) return;
        long now = System.currentTimeMillis();
        if (now - seat.pointedAt < POINT_EVERY_MS) return;
        seat.pointedAt = now;
        JsonObject o = new JsonObject();
        o.addProperty("type", "point"); o.addProperty("player", seat.me.getId()); o.addProperty("card", id);
        String json = o.toString();
        session.broadcast(json);
        for (Session.Watcher w : session.watchers) BridgeServer.send(w.channel, json);
    }

    /** A carta está numa zona que todos veem: campo, cemitério, exílio, zona de comando ou pilha. */
    static boolean isPublic(GameView gv, int id) {
        for (PlayerView p : gv.getPlayers()) {
            for (Iterable<CardView> zone : List.of(nz(p.getBattlefield()), nz(p.getGraveyard()), nz(p.getExile()), nz(p.getCommand())))
                for (CardView c : zone) if (c.getId() == id) return true;
        }
        if (gv.getStack() != null)
            for (StackItemView si : gv.getStack()) if (si.getSourceCard() != null && si.getSourceCard().getId() == id) return true;
        return false;
    }

    private static Iterable<CardView> nz(Iterable<CardView> it) { return it == null ? List.of() : it; }
}
