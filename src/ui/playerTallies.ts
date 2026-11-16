// Quais marcadores de jogador ganham um objeto em 3D ao subir (veneno, energia, experiência e radiação), o que subiu desde o último desenho da mesma partida e quando o veneno já está perto de matar.
import type { FPlayer } from '../forge/client';

export type Tally = 'poison' | 'energy' | 'experience' | 'rad';
const BY_COUNTER: Record<string, Tally> = { POISON: 'poison', ENERGY: 'energy', EXPERIENCE: 'experience', RAD: 'rad' };

/** Com 10 de veneno o jogador perde; de 7 em diante, o selo já fica em alerta (playerCounters.ts) e o frasco cai maior. */
const POISON_LIMIT = 10, POISON_NEAR = 7;

/** Quanto cada jogador tinha de cada marcador no último desenho, e de qual partida. */
export interface Tallies { match: string; counts: Map<number, Record<string, number>> }
/**
 * Um marcador que subiu: de quem, qual objeto, o nome dele no estado, quanto subiu e quanto ficou. `level` é 0, 1 com o
 * veneno perto do limite e 2 com o veneno que mata.
 */
interface TallyGain { player: number; kind: Tally; counter: string; gained: number; total: number; level: 0 | 1 | 2 }

/**
 * Compara os marcadores de agora com os do desenho anterior (`before`) e devolve os que subiram e o novo registro. Numa
 * partida nova (ou na primeira vez), só registra: abrir uma partida em andamento não faz nada cair.
 */
export function tallyGains(before: Tallies | null, players: Pick<FPlayer, 'id' | 'counters'>[], match: string): { gains: TallyGain[]; now: Tallies } {
  const now: Tallies = { match, counts: new Map(players.map(p => [p.id, { ...p.counters }])) };
  if (!before || before.match !== match) return { gains: [], now };
  const gains = players.flatMap(p => Object.entries(BY_COUNTER).flatMap(([counter, kind]): TallyGain[] => {
    const total = p.counters?.[counter] ?? 0, gained = total - (before.counts.get(p.id)?.[counter] ?? 0);
    if (gained <= 0) return [];
    const level = kind !== 'poison' ? 0 : total >= POISON_LIMIT ? 2 : total >= POISON_NEAR ? 1 : 0;
    return [{ player: p.id, kind, counter, gained, total, level }];
  }));
  return { gains, now };
}
