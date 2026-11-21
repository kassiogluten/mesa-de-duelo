// Momentos da partida que contam a história do jogo: o primeiro sangue (o primeiro golpe de combate num jogador), a eliminação de dois ou mais jogadores pelo mesmo golpe, com o nome de cada um e a voz do narrador, e a mesa rangendo com o campo lotado.
import type { PresentationEvent } from './presentationTimeline';

/** Golpe de combate num jogador, que chegou nele (sem ser prevenido). */
export const combatHitOnPlayer = (event: PresentationEvent) =>
  event.type === 'damage' && !!event.combat && !event.prevented && !!event.targets?.players?.length;

/** Os jogadores que o mesmo golpe (os danos de uma etapa de combate, ou da mesma mágica) derrubou, sem repetir. */
export function knockedOut(events: readonly PresentationEvent[]) {
  const out = events.filter(e => e.type === 'damage' && e.lethal && !e.prevented).flatMap(e => e.targets?.players ?? []);
  return [...new Set(out)];
}

/** O nome da eliminação de `count` jogadores de uma vez, e a fala do narrador. */
export function multiKill(count: number): { title: string; voice: string } | null {
  if (count < 2) return null;
  if (count === 2) return { title: 'Eliminação dupla', voice: 'voz/double-kill.mp3' };
  return { title: count === 3 ? 'Eliminação tripla' : `Eliminação de ${count}`, voice: 'voz/triple-kill.mp3' };
}

export const FIRST_BLOOD = { title: 'Primeiro sangue', voice: 'voz/first-blood.mp3' } as const;
/** Quanto a eliminação de vários segura a fila a mais que o golpe letal, para os retratos se apagarem um depois do outro. */
export const MULTI_KILL_HOLD = 1000;

/** Com mais permanentes que isto no campo de um jogador, a mesa range quando chega mais uma. */
export const CROWDED = 30;
/** Ranger de novo só depois deste tempo (ms), para as fichas em sequência não virarem um rangido sem fim. */
export const CREAK_GAP = 15_000;
export const CREAK_SOUND = 'mesa/rangido.mp3';
/** O jogador cujo campo, já lotado, acabou de receber mais permanentes, pelo quadro da mesa daquele passo. */
export function crowdedSide(event: PresentationEvent): number | null {
  if (event.type !== 'entered' || event.to !== 'Battlefield') return null;
  const owner = event.card?.controller ?? event.actor;
  const count = event.frame?.players.find(p => p.id === owner)?.battlefield.length ?? 0;
  return owner !== undefined && count > CROWDED ? owner : null;
}
