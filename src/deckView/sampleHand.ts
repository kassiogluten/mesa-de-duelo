// Mão de teste: embaralhar o deck, comprar 7, mulligan de Londres (com o primeiro grátis no Commander) e comprar mais.
import type { DeckEntry } from '../decks';

/** Uma cópia de uma carta do grimório: `uid` separa as cópias da mesma linha do deck. */
export interface HandCard { uid: number; name: string; set?: string; cn?: string }
export interface SampleHand {
  library: HandCard[];
  hand: HandCard[];
  /** Postas no fundo depois do mulligan, na ordem em que foram. */
  bottom: HandCard[];
  mulligans: number;
  /** Quantas ainda falta pôr no fundo (o mulligan de Londres compra 7 e devolve uma por mulligan). */
  toBottom: number;
  /** Cartas compradas depois da mão inicial (um turno cada). */
  draws: number;
  /** No Commander o primeiro mulligan é grátis (regra 103.5c, partidas com mais de dois jogadores). */
  freeMulligan: boolean;
}

type Random = () => number;

export function expand(entries: DeckEntry[]): HandCard[] {
  let uid = 0;
  return entries.flatMap(e => Array.from({ length: e.count }, () => ({ uid: uid++, name: e.name, ...(e.set ? { set: e.set, cn: e.cn } : {}) })));
}

function shuffled<T>(list: T[], random: Random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; }
  return out;
}

/** Embaralha o deck principal (sem os comandantes, que ficam na zona de comando) e compra 7. */
export function newHand(entries: DeckEntry[], freeMulligan: boolean, random: Random = Math.random): SampleHand {
  const library = shuffled(expand(entries), random);
  return { library: library.slice(7), hand: library.slice(0, 7), bottom: [], mulligans: 0, toBottom: 0, draws: 0, freeMulligan };
}

/** Mulligan de Londres: tudo volta, embaralha, compra 7 de novo e depois põe no fundo uma por mulligan (menos o grátis). */
export function mulligan(s: SampleHand, random: Random = Math.random): SampleHand {
  const all = shuffled([...s.hand, ...s.library, ...s.bottom], random);
  const mulligans = s.mulligans + 1;
  const toBottom = Math.min(7, Math.max(0, mulligans - (s.freeMulligan ? 1 : 0)));
  return { ...s, library: all.slice(7), hand: all.slice(0, 7), bottom: [], mulligans, toBottom, draws: 0 };
}

/** Põe a carta da mão no fundo do grimório (só enquanto o mulligan pede). */
export function putOnBottom(s: SampleHand, uid: number): SampleHand {
  const card = s.hand.find(c => c.uid === uid);
  if (!card || s.toBottom <= 0) return s;
  return { ...s, hand: s.hand.filter(c => c !== card), bottom: [...s.bottom, card], toBottom: s.toBottom - 1 };
}

/** Compra a carta do topo (o turno seguinte); só depois de terminar o mulligan. */
export function drawCard(s: SampleHand): SampleHand {
  if (s.toBottom > 0 || !s.library.length) return s;
  return { ...s, hand: [...s.hand, s.library[0]!], library: s.library.slice(1), draws: s.draws + 1 };
}
