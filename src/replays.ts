// Partidas guardadas neste aparelho para rever (S21): as últimas gravações, comprimidas no IndexedDB, com um resumo para a lista.
import { STORES, withStore } from './idb';
import { frameAt, gunzip, gzip, type Recording } from './forge/recording';
import type { FState } from './forge/client';

/** Quantas partidas ficam guardadas; a mais antiga sai quando entra outra. */
export const REPLAY_LIMIT = 10;

export interface ReplaySummary {
  /** O id da partida no servidor (o mesmo de Minhas partidas) ou, sem ele, o começo da gravação. */
  id: string;
  startedAt: number;
  endedAt: number;
  format?: string;
  you?: number;
  players: { id: number; name: string; ai: boolean }[];
  /** Turno do último quadro guardado. */
  turns: number;
  /** Nome de quem venceu o último jogo, quando acabou. */
  winner?: string;
  finished: boolean;
  frames: number;
  bytes: number;
}

export const replayId = (r: Pick<Recording, 'meta' | 'startedAt'>) => r.meta.matchId ?? `gravacao-${r.startedAt}`;

/** O resumo da lista, tirado do último quadro (só o que o jogador viu na hora). */
export function summarize(recording: Recording, bytes: number): ReplaySummary {
  const last: FState | null = recording.frames.length ? frameAt(recording, recording.frames.length - 1) : null;
  return {
    id: replayId(recording), startedAt: recording.startedAt, endedAt: recording.endedAt,
    format: recording.meta.format, you: recording.meta.you, players: recording.meta.players ?? [],
    turns: last?.turn ?? 0, winner: last?.gameOver ? last.winner : undefined, finished: !!last?.gameOver,
    frames: recording.frames.length, bytes,
  };
}

/** A gravação vale ser guardada: é uma partida jogada (não assistida) e chegou a ter estados. */
export function worthKeeping(recording: Recording) {
  if (recording.frames.length < 2) return false;
  const first = frameAt(recording, 0);
  return !first.spectating && !first.watching && !first.room?.lab;
}

/** Guarda (ou atualiza) a partida e tira as mais antigas além do limite. */
export async function saveReplay(recording: Recording): Promise<void> {
  if (!worthKeeping(recording)) return;
  const bytes = await gzip(JSON.stringify(recording));
  const summary = summarize(recording, bytes.byteLength);
  await withStore(STORES.replayData, 'readwrite', store => store.put(bytes, summary.id), undefined);
  await withStore(STORES.replays, 'readwrite', store => store.put(summary, summary.id), undefined);
  const all = await listReplays();
  for (const old of all.slice(REPLAY_LIMIT)) await deleteReplay(old.id);
}

/** As partidas guardadas, da mais nova para a mais antiga. */
export async function listReplays(): Promise<ReplaySummary[]> {
  const all = await withStore<ReplaySummary[]>(STORES.replays, 'readonly', store => store.getAll(), []);
  return all.sort((a, b) => b.startedAt - a.startedAt);
}

export async function loadReplay(id: string): Promise<Recording | null> {
  const bytes = await withStore<Uint8Array | ArrayBuffer | undefined>(STORES.replayData, 'readonly', store => store.get(id), undefined);
  if (!bytes) return null;
  try { return JSON.parse(await gunzip(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))) as Recording; }
  catch { return null; }
}

export async function deleteReplay(id: string): Promise<void> {
  await withStore(STORES.replayData, 'readwrite', store => store.delete(id), undefined);
  await withStore(STORES.replays, 'readwrite', store => store.delete(id), undefined);
}
