// O que mudou nos retratos desde o último desenho da mesma partida, para os medalhões em 3D: quem passou a ter a coroa do Monarca ou a Dianteira (e de quem ela veio) e os emblemas novos de cada jogador.
import type { FCard, FPlayer } from '../forge/client';

type HolderKind = 'monarch' | 'initiative';
interface HolderPass { kind: HolderKind; from: number | null; to: number }
/** Quem tinha cada coisa no último desenho, e de qual partida. */
export interface Holders { match: string; monarch: number | null; initiative: number | null; emblems: Set<number> }
/** Um emblema que acabou de chegar: de quem é e a carta dele. */
interface EmblemArrival { player: number; emblem: FCard }

const KINDS: HolderKind[] = ['monarch', 'initiative'];

/**
 * Compara quem tem a coroa e a Dianteira agora com o desenho anterior (`before`) e devolve as passagens, os emblemas
 * novos e o novo registro. Numa partida nova (ou na primeira vez), só registra: abrir uma partida em andamento não faz
 * nada voar.
 */
export function holderChanges(before: Holders | null, players: Pick<FPlayer, 'id' | 'monarch' | 'initiative' | 'emblems'>[], match: string): { passes: HolderPass[]; emblems: EmblemArrival[]; now: Holders } {
  const now: Holders = {
    match, monarch: players.find(p => p.monarch)?.id ?? null, initiative: players.find(p => p.initiative)?.id ?? null,
    emblems: new Set(players.flatMap(p => (p.emblems ?? []).map(c => c.id))),
  };
  if (!before || before.match !== match) return { passes: [], emblems: [], now };
  const passes = KINDS.flatMap(kind => now[kind] !== null && now[kind] !== before[kind] ? [{ kind, from: before[kind], to: now[kind]! }] : []);
  const emblems = players.flatMap(p => (p.emblems ?? []).filter(c => !before.emblems.has(c.id)).map(emblem => ({ player: p.id, emblem })));
  return { passes, emblems, now };
}
