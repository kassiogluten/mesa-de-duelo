// Por que um jogador perdeu, em português: vida a 0, dano de comandante, veneno, grimório vazio, efeito de carta, desistência.
import type { FPlayer, FState } from '../forge/client';

type Players = Pick<FState, 'players'>;
/** Nome de uma carta da mesa pelo id (o comandante que causou o dano), já traduzido quando há tradução. */
type CardName = (id: number) => string;

/** O comandante que deu 21 ou mais de dano ao jogador, com o dano; null se nenhum chegou lá. */
function lethalCommander(s: Players, p: FPlayer, cardName?: CardName) {
  const hit = (p.commanderDamage ?? []).filter(d => d.damage >= 21).sort((a, b) => b.damage - a.damage)[0];
  if (!hit) return null;
  const commander = s.players.flatMap(o => o.commanders ?? []).find(c => c.id === hit.commanderId);
  return { damage: hit.damage, name: cardName?.(hit.commanderId) || commander?.name || 'um comandante' };
}

/**
 * O motivo, para vir depois de "eliminado:" ou "Derrota:". `mine` muda a pessoa ("sua vida chegou a 0" e
 * "você desistiu" para quem perdeu; "a vida chegou a 0" e "desistiu" para os outros). Null sem motivo conhecido.
 */
export function lossReasonText(s: Players, p: FPlayer, mine: boolean, cardName?: CardName): string | null {
  switch (p.lossReason) {
    case 'LifeReachedZero': return mine ? 'sua vida chegou a 0' : 'a vida chegou a 0';
    case 'CommanderDamage': {
      const hit = lethalCommander(s, p, cardName);
      return hit ? `${hit.damage} de dano de comandante de ${hit.name}` : '21 de dano de comandante';
    }
    case 'Poisoned': return `${Math.max(10, p.counters?.POISON ?? 0)} marcadores de veneno`;
    case 'Milled': return mine ? 'você tentou comprar uma carta sem cartas no grimório' : 'tentou comprar uma carta sem cartas no grimório';
    case 'SpellEffect': return p.lossCard ? `efeito de ${p.lossCard}` : 'efeito de uma carta';
    case 'OpponentWon': {
      const who = p.lossWinner ?? 'outro jogador';
      return p.lossCard ? `${who} venceu com ${p.lossCard}` : `${who} venceu a partida`;
    }
    case 'Conceded': return mine ? 'você desistiu' : 'desistiu';
    case 'IntentionalDraw': return 'empate combinado';
    default: return null;
  }
}

/**
 * Avisos de quem acabou de ser eliminado, comparando com os eliminados já conhecidos neste jogo (`known`, que esta
 * função atualiza). O primeiro estado de um jogo só anota quem já estava fora: ao reconectar, não repete o aviso.
 * Com o jogo encerrado, a janela de resultado já diz o motivo.
 */
export function eliminationNotices(s: Pick<FState, 'players' | 'you' | 'gameOver' | 'watching'>, gameKey: string, known: Map<string, Set<number>>, cardName?: CardName): string[] {
  const out = s.players.filter(p => p.eliminated).map(p => p.id);
  const seen = known.get(gameKey);
  known.set(gameKey, new Set([...(seen ?? []), ...out]));
  if (!seen || s.gameOver) return [];
  return s.players.filter(p => p.eliminated && !seen.has(p.id)).map(p => {
    const mine = p.id === s.you && !s.watching;
    const reason = lossReasonText(s, p, mine, cardName);
    const who = mine ? 'Você foi eliminado' : `${p.name} foi eliminado`;
    return reason ? `${who}: ${reason}.` : `${who}.`;
  });
}
