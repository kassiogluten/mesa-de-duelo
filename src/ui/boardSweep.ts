// Limpa campo (Wrath of God, Evacuation, Pyroclasm): quais saídas do campo e quais danos da mesma mágica ou habilidade viram uma onda só, a cor da onda e a frase dela.
import type { FCard } from '../forge/client';
import type { PresentationEvent } from './presentationTimeline';
import { removalCause } from './removalNotice';

/** A partir de quantas permanentes (ou criaturas atingidas pelo mesmo dano) a jogada vira limpa campo (decidido em 18/11/2026). */
export const SWEEP_MIN = 3;

/** O jeito da onda, pela cor da mágica: branco, azul, preto, vermelho, verde, várias cores ou incolor. */
export type SweepStyle = 'W' | 'U' | 'B' | 'R' | 'G' | 'M' | 'C';

/** A cor de cada jeito, para a reserva em CSS, o brilho de cada carta atingida e a faixa. */
export const SWEEP_COLORS: Record<SweepStyle, string> = {
  W: '#ffe9a8', U: '#6fb8ff', B: '#a46bff', R: '#ff7a3d', G: '#63d68f', M: '#f2b54c', C: '#dfe6ee',
};

/** A cor da onda pelo custo da carta: uma cor, a dela; várias, dourado; nenhuma, prata. */
export function sweepStyle(card: Pick<FCard, 'manaCost'> | undefined): SweepStyle {
  const colors = [...new Set((card?.manaCost ?? '').match(/[WUBRG]/g) ?? [])] as SweepStyle[];
  return colors.length === 1 ? colors[0]! : colors.length ? 'M' : 'C';
}
/** A onda do limpa campo de dano: fogo; o de marcadores −1/−1 (murchar), a névoa roxa. */
export const damageSweepStyle = (event: PresentationEvent): SweepStyle => event.wither ? 'B' : 'R';

const indexOf = (history: readonly PresentationEvent[], event: PresentationEvent) => history.findIndex(e => e.seq === event.seq);

/** A mágica ou habilidade que tirou a permanente do campo (a mesma da janela de remoção), ou null. */
export function sweepCause(history: readonly PresentationEvent[], event: PresentationEvent) {
  if (event.type !== 'left' || event.from !== 'Battlefield') return null;
  const index = indexOf(history, event);
  return index < 0 ? null : removalCause(history, index);
}

/** Esta saída do campo é da mesma causa (`stackId` da resolução) que a primeira do limpa campo. */
export function sameSweep(history: readonly PresentationEvent[], stackId: number) {
  return (event: PresentationEvent) => sweepCause(history, event)?.stackId === stackId;
}

/**
 * O mesmo dano atingindo `SWEEP_MIN` criaturas ou mais, sem ter mirado nelas (Pyroclasm, Blasphemous Act, Earthquake).
 * O dano dividido entre alvos escolhidos (Arc Lightning) continua com os projéteis: a mágica que mira não varre a mesa.
 */
export function damageSweep(history: readonly PresentationEvent[], events: readonly PresentationEvent[]) {
  const first = events[0];
  if (first?.type !== 'damage' || first.combat || first.fight || first.self || first.prevented) return false;
  const hit = new Set(events.flatMap(e => e.targets?.cards ?? []));
  if (hit.size < SWEEP_MIN) return false;
  const index = indexOf(history, first);
  const source = first.sourceId ?? first.card?.id;
  const cast = history.slice(0, index < 0 ? history.length : index).reverse()
    .find(e => (e.type === 'spell-cast' || e.type === 'ability-activated') && (e.card?.id ?? e.sourceId) === source);
  return !cast?.targets?.cards?.length;
}

/** Quanto o passo do limpa campo leva: a onda atravessa a mesa e cada carta ainda sai do jeito dela. `scale` é o ritmo (presentationPace). */
export function sweepDuration(sweep: NonNullable<PresentationEvent['sweep']>, scale: number) {
  return sweep.wave ? Math.round(Math.max(1300, 2000 * scale)) : Math.round(Math.max(620, 1000 * scale));
}

const PLURAL: [test: (e: PresentationEvent) => boolean, words: string][] = [
  [e => e.reason === 'destroyed', 'destruídas'], [e => e.reason === 'sacrificed', 'sacrificadas'], [e => e.to === 'Exile', 'exiladas'],
  [e => e.to === 'Hand', 'devolvidas à mão'], [e => e.to === 'Library', 'postas no grimório'],
];
/** O que aconteceu com as permanentes, quando foi o mesmo para todas ("destruídas"); senão, "saíram do campo". */
export function sweepOutcome(events: readonly PresentationEvent[]) {
  const n = events.length;
  const same = PLURAL.find(([test]) => events.every(test));
  return same ? `${n} permanentes ${same[1]}` : `${n} permanentes saíram do campo`;
}
