// O contador "Dano X/21" do dano de comandante: o limite que elimina, o alerta perto dele (pulsando a partir de 15, tremendo a partir de 18) e as contas de quanto ele mostrava antes e depois de um golpe de comandante.
import type { PresentationEvent } from './presentationTimeline';

/** O dano de um mesmo comandante que elimina, de quanto em diante o contador pulsa vermelho e de quanto em diante ele treme. */
export const COMMANDER_LIMIT = 21, COMMANDER_NEAR = 15, COMMANDER_CRITICAL = 18;
/** A classe do contador pelo maior dano de comandante recebido: em alerta (pulsa) ou por um golpe (treme). */
export const commanderThreat = (highest: number) => highest >= COMMANDER_CRITICAL ? ' danger critical' : highest >= COMMANDER_NEAR ? ' danger' : '';
/** O dano de comandante que o jogador recebeu, como o contador guarda (`data-commander-damage="12:5,40:13"`). */
export function countsOf(el: HTMLElement | null): Map<number, number> {
  const out = new Map<number, number>();
  for (const pair of (el?.dataset.commanderDamage ?? '').split(',')) {
    const [id, value] = pair.split(':').map(Number);
    if (Number.isFinite(id) && Number.isFinite(value)) out.set(id!, value!);
  }
  return out;
}
/** O contrário de `countsOf`, para o contador gravar. */
export const countsAttr = (list: { commanderId: number; damage: number }[]) => list.map(d => `${d.commanderId}:${d.damage}`).join(',');

/**
 * O que o contador (que mostra o maior dano de comandante recebido) mostrava antes deste golpe e o que mostra depois,
 * e se este comandante acabou de chegar a 21. `counts` é o dano de cada comandante como a mesa desenhou; o deste
 * golpe vem do evento (`commanderTotal`). Sem o total no evento, null.
 */
export function commanderCounterChange(counts: ReadonlyMap<number, number>, event: Pick<PresentationEvent, 'commanderId' | 'commanderTotal' | 'sourceId' | 'delta'>) {
  const id = event.commanderId ?? event.sourceId, total = event.commanderTotal;
  if (id === undefined || total === undefined) return null;
  const hit = Math.abs(event.delta ?? 0), previous = Math.max(0, total - hit);
  const others = [...counts].filter(([other]) => other !== id).map(([, value]) => value);
  return { before: Math.max(0, previous, ...others), after: Math.max(0, total, ...others), total, previous, hit, lethal: total >= COMMANDER_LIMIT && previous < COMMANDER_LIMIT };
}
