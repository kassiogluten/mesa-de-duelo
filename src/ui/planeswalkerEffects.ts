import type { FCard } from '../forge/client';
import type { PresentationEvent } from './presentationTimeline';

/** Cor de cada cor de mana, para o brilho do planeswalker; várias cores dão dourado, nenhuma dá prata. */
const MANA_TONE: Record<string, string> = { W: '#fff3c4', U: '#6fb8ff', B: '#b07cff', R: '#ff7a4d', G: '#63d68f' };
const GOLD = '#f2b54c';
const SILVER = '#dfe6ee';

/** A cor do planeswalker, pelo custo de mana ("{1}{U}{U}" → azul). */
export function walkerTone(card: Pick<FCard, 'manaCost'> | undefined) {
  const colors = new Set((card?.manaCost ?? '').toUpperCase().match(/[WUBRG]/g) ?? []);
  if (colors.size > 1) return GOLD;
  const [only] = colors;
  return only ? MANA_TONE[only] ?? SILVER : SILVER;
}

/** Planeswalker chegando ao campo (não a volta do blink, que já tem o anel de luz). */
export function walkerArrives(event: PresentationEvent) {
  return event.type === 'entered' && !!event.card?.planeswalker && event.from !== 'Exile' && (event.entries?.length ?? 1) <= 1;
}

export interface LoyaltyLook {
  /** O custo como aparece no número flutuante: "+2", "−3", "0". */
  cost: string;
  tone: 'up' | 'down' | 'zero';
  ultimate: boolean;
}

/** Habilidade de lealdade (o que a ponte diz no evento); null para qualquer outra habilidade. */
export function loyaltyLook(event: PresentationEvent): LoyaltyLook | null {
  if (event.type !== 'ability-activated' || !event.loyalty) return null;
  const raw = (event.cost ?? '').trim();
  const tone = raw.startsWith('-') ? 'down' : raw.startsWith('+') ? 'up' : 'zero';
  return { cost: raw ? raw.replace(/^-/, '−') : '', tone, ultimate: !!event.ultimate };
}
