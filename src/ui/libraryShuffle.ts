// "Quer embaralhar o grimório?" logo depois de pôr cartas no topo (Ponder): a mesa guarda a ordem que o jogador acabou de escolher para mostrar as cartas na pergunta, com botões "Embaralhar" e "Manter esta ordem".
import type { FCard, FQuestion, FState } from '../forge/client';

/** As cartas da última ordem do topo do grimório respondida, de cima para baixo, e a carta que pediu. */
let lastTop: { source?: string; cards: FCard[] } | null = null;

/** Guarda a ordem respondida numa pergunta de ordenar cartas que voltam ao topo do grimório. */
export function rememberTopOrder(q: FQuestion, indices: number[]) {
  if (q.kind !== 'order' || q.firstAt === 'bottom' || !/grimório|library/i.test(q.title)) return;
  const cards = indices.map(i => q.options?.[i]).map(o => (o && typeof o !== 'string' ? o.card : undefined)).filter((c): c is FCard => !!c);
  if (cards.length) lastTop = { source: q.card?.name, cards };
}

const SHUFFLE = /^(?:Quer embaralhar o grimório\?|Do you want to shuffle (?:your|the) library\?)$/i;

/** A pergunta de embaralhar aberta, com as cartas que o jogador acabou de ordenar; null fora dela. */
export function shuffleAfterOrder(s: FState): FCard[] | null {
  const message = s.input.message.trim();
  if (!lastTop || s.question || s.input.priority || !SHUFFLE.test(message.split('\n').pop()?.trim() ?? '')) return null;
  if (lastTop.source && s.input.card?.name && lastTop.source !== s.input.card.name) return null;
  return lastTop.cards;
}
