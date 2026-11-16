// Os passos na masmorra desde o último desenho da mesma partida: quem entrou numa sala nova e quem completou uma masmorra, para a placa ao lado do retrato.
import type { FPlayer } from '../forge/client';
import { dungeonProgress } from './dungeon';

/** A masmorra de cada jogador no último desenho (qual, em que sala e quantas já completou), e de qual partida. */
export interface DungeonMarks { match: string; seen: Map<number, { id?: number; room?: string; completed: number }> }

/**
 * Um passo na masmorra: `room` é a sala nova (com o passo e o total de passos da masmorra); `done` é a masmorra que o
 * jogador acabou de completar (`name`), sem sala.
 */
export type DungeonStep =
  | { player: number; kind: 'room'; name: string; room: string; step: number; total: number }
  | { player: number; kind: 'done'; name: string };

/**
 * Compara as masmorras de agora com as do desenho anterior (`before`) e devolve os passos e o novo registro. Numa partida
 * nova (ou na primeira vez), só registra: abrir uma partida em andamento não mostra placa nenhuma.
 */
export function dungeonSteps(before: DungeonMarks | null, players: Pick<FPlayer, 'id' | 'dungeon' | 'completedDungeons'>[], match: string): { steps: DungeonStep[]; now: DungeonMarks } {
  const now: DungeonMarks = { match, seen: new Map(players.map(p => [p.id, { id: p.dungeon?.id, room: p.dungeon?.room, completed: p.completedDungeons?.length ?? 0 }])) };
  if (!before || before.match !== match) return { steps: [], now };
  const steps = players.flatMap((p): DungeonStep[] => {
    const was = before.seen.get(p.id), out: DungeonStep[] = [];
    if (!was) return out;
    const completed = p.completedDungeons ?? [];
    // Completou: a masmorra sai do jogador e entra na lista das completadas (a última da lista é a que acabou).
    if (completed.length > was.completed) out.push({ player: p.id, kind: 'done', name: completed[completed.length - 1]! });
    const d = p.dungeon;
    if (d?.room !== undefined && (d.id !== was.id || d.room !== was.room)) {
      const { step, total } = dungeonProgress(d);
      out.push({ player: p.id, kind: 'room', name: d.name, room: d.room, step, total });
    }
    return out;
  });
  return { steps, now };
}
