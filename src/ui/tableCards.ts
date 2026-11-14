// Leituras do estado que a mesa inteira usa: achar uma carta pelo id, a cor da mana que um terreno dá, os textos do
// Forge em português e os marcadores de jogador que mudaram. Sem DOM: só o estado que chega da partida.
import type { FCard, FPlayer, FState } from '../forge/client';
import { fixPossessives } from './forgeText';
import { stateWithFrame, type PresentationFrame } from './presentationTimeline';
import { revealedCards } from './revealedHand';

/**
 * A carta com esse id no estado que a mesa mostra agora (o quadro da apresentação por cima do estado): zonas dos
 * jogadores, a pilha e, com `withPrompt`, as cartas que o pedido ou a pergunta citam.
 */
export function findCard(s: FState | null | undefined, frame: PresentationFrame | null, id: number, withPrompt = true): FCard | undefined {
  if (!s) return undefined;
  for (const p of stateWithFrame(s, frame).players) {
    for (const c of [...p.hand, ...p.battlefield, ...p.graveyard, ...p.exile, ...(p.commandZone ?? []), ...(p.emblems ?? []), ...(p.libraryTop ? [p.libraryTop] : []), ...revealedCards(p)]) if (c.id === id) return c;
  }
  const onStack = s.stack.find(si => si.source?.id === id)?.source;
  if (onStack) return onStack;
  if (!withPrompt) return undefined;
  if (s.input.card?.id === id) return s.input.card;
  if (s.input.vote?.card.id === id) return s.input.vote.card;
  if (s.question?.card?.id === id) return s.question.card;
  if (s.input.suspendCast?.card.id === id) return s.input.suspendCast.card;
  if (s.input.targeting?.card?.id === id) return s.input.targeting.card;
  for (const o of s.question?.options ?? []) if (typeof o !== 'string' && o.card?.id === id) return o.card;
  for (const c of s.question?.revealed ?? []) if (c.id === id) return c;
  for (const c of s.revealView?.cards ?? []) if (c.id === id) return c;
  return undefined;
}

/** Quanto há na reserva de mana de cada jogador (para ver, entre um desenho e outro, quem gerou mana). */
export function poolTotals(players: readonly { id: number; pool?: Record<string, number> }[]) {
  return new Map(players.map(p => [p.id, Object.values(p.pool ?? {}).reduce((sum, n) => sum + n, 0)] as [number, number]));
}

/** Quem tem mais mana na reserva agora do que no desenho anterior. */
export function poolsThatGrew(before: ReadonlyMap<number, number>, now: ReadonlyMap<number, number>) {
  return new Set([...now].filter(([id, n]) => n > (before.get(id) ?? 0)).map(([id]) => id));
}

/** A cor da mana de um terreno (ou da carta que dá mana), para a mana que voa dele até o custo ou até a reserva. */
export function manaTone(c: FCard | undefined) {
  if (!c) return undefined;
  const text = `${c.typeLine ?? ''} ${c.name ?? ''}`;
  const tones = ([['Plains', '#f4ecc2'], ['Island', '#5cb3ff'], ['Swamp', '#b48ad1'], ['Mountain', '#ff7150'], ['Forest', '#58c878']] as const)
    .filter(([type]) => text.includes(type)).map(([, tone]): string => tone);
  if (!tones.length && !c.land) {
    const pips = new Set((c.manaCost ?? '').match(/[WUBRG]/g) ?? []);
    const byPip: Record<string, string> = { W: '#f4ecc2', U: '#5cb3ff', B: '#b48ad1', R: '#ff7150', G: '#58c878' };
    tones.push(...[...pips].flatMap(p => { const tone = byPip[p]; return tone ? [tone] : []; }));
  }
  return tones.length === 1 ? tones[0] : tones.length > 1 ? '#f2b54c' : '#dadada';
}

/** Textos do Forge (pedido, pergunta, opções): o possessivo em inglês ("você's grimório") vira português. Repetir não muda nada. */
export function fixForgeText(s: FState) {
  const names = s.players.map(p => p.name);
  if (s.input?.message) s.input.message = fixPossessives(s.input.message, names);
  if (s.question) {
    s.question.title = fixPossessives(s.question.title, names);
    s.question.options = s.question.options?.map(o => typeof o === 'string' ? fixPossessives(o, names) : o);
  }
}

/**
 * Tipos de marcador de jogador que mudaram desde o último desenho (para o selo pulsar uma vez). `last` guarda o que
 * cada jogador tinha e é atualizado aqui. Só conta o que subiu ou mudou e continua acima de zero.
 */
export function trackCounterBumps(last: Map<number, Record<string, number>>, players: FPlayer[]) {
  const bumps = new Map<number, Set<string>>();
  for (const p of players) {
    const before = last.get(p.id), now: Record<string, number> = { ...p.counters, ...(p.ringTempted ? { RING: p.ringTempted } : {}), ...(p.monarch ? { MONARCH: 1 } : {}), ...(p.spellsCast ? { SPELLS: p.spellsCast } : {}),
      ...(p.blessing ? { BLESSING: 1 } : {}), ...(p.speed ? { SPEED: p.speed } : {}) };
    if (before) {
      const changed = new Set([...Object.keys(before), ...Object.keys(now)].filter(k => (before[k] ?? 0) !== (now[k] ?? 0) && (now[k] ?? 0) > 0));
      if (changed.size) bumps.set(p.id, changed);
    }
    last.set(p.id, { ...now });
  }
  return bumps;
}
