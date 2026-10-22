import type { ClientMessage, FState } from './client';

/**
 * Gravação da partida no aparelho (item 28): cada estado recebido da ponte, cada mensagem enviada e os avisos e erros,
 * com horário. Basta para repetir a partida na mesa sem a ponte (tests/fixtures/replay.html).
 *
 * Um estado tem dezenas de KB e quase tudo se repete de um para o outro; o gzip só enxerga 32 KB para trás, então
 * os quadros são guardados como diferenças do anterior, com um quadro inteiro a cada KEY_EVERY. Passando do limite
 * de memória, saem os quadros mais antigos (fica sempre o primeiro); no envio, o mesmo corte garante o limite comprimido.
 */
export const RECORDING_FORMAT = 'mesa-gravacao';
export const RECORDING_LIMIT = 2 * 1024 * 1024;
const KEY_EVERY = 40;
const MEMORY_LIMIT = 12_000_000;
const NOTES_LIMIT = 400;
const SENT_LIMIT = 4000;

export interface RecordingMeta {
  app: string;
  matchId?: string;
  format?: string;
  matchLength?: string;
  playerCount?: number;
  net?: boolean;
  rulesVersion?: string;
  engineVersion?: string;
  you?: number;
  players?: { id: number; name: string; ai: boolean }[];
  deck?: unknown;
  device?: DeviceInfo;
  preferences?: Record<string, unknown>;
}
export interface DeviceInfo { userAgent: string; viewport: string; screen: string; pixelRatio: number; touch: boolean; installed: boolean; language: string }

/** Quadro: k é o estado inteiro (JSON), d a diferença do quadro anterior (JSON de um Patch). */
export interface RecordedFrame { at: number; v: number | null; k?: string; d?: string }
export interface RecordedMessage { at: number; v: number | null; gen?: number; msg: Record<string, unknown> }
export interface RecordedNote { at: number; v: number | null; kind: string; text: string; detail?: string }
export interface Recording {
  format: typeof RECORDING_FORMAT;
  version: 1;
  startedAt: number;
  endedAt: number;
  meta: RecordingMeta;
  frames: RecordedFrame[];
  sent: RecordedMessage[];
  notes: RecordedNote[];
  /** Quadros que saíram para caber no limite. */
  droppedFrames: number;
}

// ---------------------------------------------------------------- diferenças

/** $v troca o valor; $p muda chaves de um objeto ($d lista as que saíram); $a refaz uma lista (m: de onde veio cada item, pelo id). */
export type Patch =
  | { $v: unknown }
  | { $p: { [key: string]: Patch | string[] | undefined; $d?: string[] } }
  | { $a: number; i: Record<number, Patch>; m?: Record<number, number> };

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const idOf = (x: unknown) => isRecord(x) && typeof x.id === 'number' ? x.id : undefined;

/** undefined quando os dois valores são iguais. */
export function diff(a: unknown, b: unknown): Patch | undefined {
  if (a === b) return undefined;
  if (isRecord(a) && isRecord(b)) {
    const p: Record<string, Patch | string[]> = {};
    let changed = false;
    for (const key of Object.keys(b)) {
      const d = key in a ? diff(a[key], b[key]) : { $v: b[key] };
      if (d) { p[key] = d; changed = true; }
    }
    const removed = Object.keys(a).filter(key => !(key in b));
    if (removed.length) { p.$d = removed; changed = true; }
    return changed ? { $p: p } : undefined;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    // Cartas e jogadores andam de posição (uma carta sai do campo e as outras sobem): casa os itens pelo id.
    const byId = new Map<number, number>();
    a.forEach((item, index) => { const id = idOf(item); if (id !== undefined && !byId.has(id)) byId.set(id, index); });
    const i: Record<number, Patch> = {}, m: Record<number, number> = {};
    let changed = a.length !== b.length, moved = false;
    b.forEach((item, index) => {
      const id = idOf(item), from = id !== undefined && byId.has(id) ? byId.get(id)! : index;
      if (from !== index) { m[index] = from; moved = changed = true; }
      const d = from < a.length ? diff(a[from], item) : { $v: item };
      if (d) { i[index] = d; changed = true; }
    });
    return changed ? { $a: b.length, i, ...(moved ? { m } : {}) } : undefined;
  }
  return { $v: b };
}

/** Aplica sem mexer em `a`: só os caminhos que mudaram viram objetos novos. */
export function applyPatch(a: unknown, patch: Patch): unknown {
  if ('$v' in patch) return patch.$v;
  if ('$p' in patch) {
    const out: Record<string, unknown> = { ...(isRecord(a) ? a : {}) };
    for (const [key, sub] of Object.entries(patch.$p)) if (key !== '$d' && sub) out[key] = applyPatch(out[key], sub as Patch);
    for (const key of patch.$p.$d ?? []) delete out[key];
    return out;
  }
  const source = Array.isArray(a) ? a : [];
  return Array.from({ length: patch.$a }, (_, index) => {
    const base = source[patch.m?.[index] ?? index], sub = patch.i[index];
    return sub ? applyPatch(base, sub) : base;
  });
}

// ---------------------------------------------------------------- gravador

/** Tira do estado o segredo de volta ao assento (token): ele não vai para a gravação nem para o relato. */
function withoutSecrets(s: FState): FState {
  return {
    ...s,
    ...(s.session ? { session: { ...s.session, token: '' } } : {}),
    ...(s.room ? { room: { ...s.room, token: '' } } : {}),
  };
}

/** Mensagem enviada, sem decks (já estão em meta.deck) e sem o token do "rejoin". */
function summarize(msg: ClientMessage): Record<string, unknown> {
  switch (msg.type) {
    case 'rejoin': return { type: msg.type, code: msg.code };
    case 'start': return { type: msg.type, config: msg.config };
    case 'host': return { type: msg.type, name: msg.name, config: msg.config };
    case 'join': return { type: msg.type, code: msg.code, name: msg.name };
    case 'sideboard': return { type: msg.type, id: msg.id };
    default: return { ...msg };
  }
}

export class MatchRecorder {
  private frames: RecordedFrame[] = [];
  private sentMessages: RecordedMessage[] = [];
  private notesList: RecordedNote[] = [];
  private last: FState | null = null;
  private lastVersion: number | null = null;
  private sinceKey = 0;
  private size = 0;
  private dropped = 0;
  private startedAt = 0;
  private endedAt = 0;
  /** Muda a cada novidade: quem guarda no IndexedDB só grava de novo quando mudou. */
  revision = 0;
  meta: RecordingMeta;
  private now: () => number;
  private memoryLimit: number;

  constructor(meta: RecordingMeta, options: { now?: () => number; memoryLimit?: number } = {}) {
    this.meta = meta;
    this.now = options.now ?? Date.now;
    this.memoryLimit = options.memoryLimit ?? MEMORY_LIMIT;
  }

  get empty() { return !this.frames.length; }

  /** Continua uma gravação guardada (a página foi recarregada no meio da partida). */
  resume(recording: Recording) {
    this.reset(recording.meta);
    this.frames = recording.frames.slice(); this.sentMessages = recording.sent.slice(); this.notesList = recording.notes.slice();
    this.dropped = recording.droppedFrames; this.startedAt = recording.startedAt; this.endedAt = recording.endedAt;
    if (!this.frames.length) return;
    this.size = this.frames.reduce((n, f) => n + (f.k ?? f.d)!.length, 0);
    this.last = frameAt(recording, this.frames.length - 1);
    this.lastVersion = this.frames.at(-1)!.v;
    let key = this.frames.length - 1;
    while (key > 0 && this.frames[key].k === undefined) key--;
    this.sinceKey = this.frames.length - 1 - key;
  }
  get matchId() { return this.meta.matchId; }

  /** Começa outra gravação (nova partida ou revanche): o que havia antes sai. */
  reset(meta: RecordingMeta) {
    this.meta = meta;
    this.frames = []; this.sentMessages = []; this.notesList = [];
    this.last = null; this.lastVersion = null; this.sinceKey = 0; this.size = 0; this.dropped = 0;
    this.startedAt = this.endedAt = 0; this.revision++;
  }

  received(state: FState) {
    if (state.stateVersion !== undefined && state.stateVersion === this.lastVersion && state.matchId === this.last?.matchId) return;
    const at = this.now(), s = withoutSecrets(state);
    if (!this.frames.length) this.startedAt = at;
    this.endedAt = at;
    const key = !this.last || this.sinceKey >= KEY_EVERY || s.matchId !== this.last.matchId;
    let frame: RecordedFrame;
    if (key) { frame = { at, v: s.stateVersion ?? null, k: JSON.stringify(s) }; this.sinceKey = 0; }
    else {
      const patch = diff(this.last, s);
      frame = { at, v: s.stateVersion ?? null, d: JSON.stringify(patch ?? { $p: {} }) };
      this.sinceKey++;
    }
    this.frames.push(frame);
    this.size += (frame.k ?? frame.d)!.length;
    this.last = s; this.lastVersion = s.stateVersion ?? null;
    this.meta.matchId ??= s.matchId;
    this.meta.rulesVersion = s.rulesVersion ?? this.meta.rulesVersion;
    this.meta.engineVersion = s.engineVersion ?? this.meta.engineVersion;
    this.meta.format = s.config?.format ?? this.meta.format;
    this.meta.matchLength = s.config?.matchLength ?? this.meta.matchLength;
    this.meta.playerCount = s.players.length;
    this.meta.you = s.you;
    this.meta.players = s.players.map(p => ({ id: p.id, name: p.name, ai: p.ai }));
    if (s.preferences) this.meta.preferences = { ...this.meta.preferences, ...s.preferences };
    while (this.size > this.memoryLimit && this.dropOldest()) { /* corta até caber */ }
    this.revision++;
  }

  sent(msg: ClientMessage) {
    // Pedidos fora da partida (validar deck, procurar ou listar salas, buscar deck por link) não entram.
    if (msg.type === 'validate-deck' || msg.type === 'lookup-room' || msg.type === 'list-rooms' || msg.type === 'fetch-deck') return;
    if (!this.frames.length && !['start', 'host', 'join', 'rejoin'].includes(msg.type)) return;
    const gen = 'gen' in msg && typeof msg.gen === 'number' ? msg.gen : undefined;
    this.sentMessages.push({ at: this.now(), v: this.lastVersion, ...(gen !== undefined ? { gen } : {}), msg: summarize(msg) });
    if (this.sentMessages.length > SENT_LIMIT) this.sentMessages.shift();
    this.revision++;
  }

  note(kind: string, text: string, detail?: string) {
    this.notesList.push({ at: this.now(), v: this.lastVersion, kind, text, ...(detail ? { detail } : {}) });
    if (this.notesList.length > NOTES_LIMIT) this.notesList.shift();
    this.revision++;
  }

  /** Tira do começo um trecho entre quadros inteiros, mantendo o primeiro quadro. false se não sobra o que tirar. */
  private dropOldest() {
    const next = this.frames.findIndex((f, i) => i > 1 && f.k !== undefined);
    if (next < 0) return false;
    for (const f of this.frames.splice(1, next - 1)) { this.size -= (f.k ?? f.d)!.length; this.dropped++; }
    return true;
  }

  snapshot(): Recording {
    return {
      format: RECORDING_FORMAT, version: 1, startedAt: this.startedAt, endedAt: this.endedAt,
      meta: structuredClone(this.meta), frames: this.frames.slice(), sent: this.sentMessages.slice(), notes: this.notesList.slice(),
      droppedFrames: this.dropped,
    };
  }
}

// ---------------------------------------------------------------- leitura

/** Os estados da gravação, já remontados, na ordem em que chegaram. */
export function* decodeFrames(recording: Pick<Recording, 'frames'>): Generator<{ at: number; v: number | null; state: FState }> {
  let state: unknown = null;
  for (const frame of recording.frames) {
    state = frame.k !== undefined ? JSON.parse(frame.k) : applyPatch(state, JSON.parse(frame.d!));
    yield { at: frame.at, v: frame.v, state: state as FState };
  }
}

/** Índices dos quadros inteiros: para pular direto a um ponto sem remontar desde o começo. */
export function keyFrames(recording: Pick<Recording, 'frames'>) {
  return recording.frames.flatMap((f, i) => f.k !== undefined ? [i] : []);
}

/** Remonta o quadro `index` a partir do quadro inteiro anterior mais próximo. */
export function frameAt(recording: Pick<Recording, 'frames'>, index: number): FState {
  let start = index;
  while (start > 0 && recording.frames[start].k === undefined) start--;
  let state: unknown = JSON.parse(recording.frames[start].k!);
  for (let i = start + 1; i <= index; i++) state = applyPatch(state, JSON.parse(recording.frames[i].d!));
  return state as FState;
}

// ---------------------------------------------------------------- gzip

export async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gunzip(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** Lê .json ou .json.gz (pelos bytes 1f 8b do gzip, não pelo nome). */
export async function readJson(bytes: Uint8Array): Promise<unknown> {
  return JSON.parse(bytes[0] === 0x1f && bytes[1] === 0x8b ? await gunzip(bytes) : new TextDecoder().decode(bytes));
}

/**
 * Corta os quadros mais antigos (fica o primeiro) até a gravação comprimida caber em `limit`.
 * Devolve a gravação que cabe e o tamanho dela comprimida.
 */
export async function fitRecording(recording: Recording, limit = RECORDING_LIMIT): Promise<{ recording: Recording; bytes: number }> {
  let current = recording;
  for (let attempt = 0; attempt < 8; attempt++) {
    const bytes = (await gzip(JSON.stringify(current))).length;
    if (bytes <= limit || current.frames.length <= 2) return { recording: current, bytes };
    // Quanto do fim manter, pela proporção que passou do limite, com folga.
    const keep = Math.max(1, Math.floor((current.frames.length - 1) * (limit / bytes) * .9));
    let cut = current.frames.length - keep;
    while (cut < current.frames.length && current.frames[cut].k === undefined) cut++;
    if (cut >= current.frames.length) cut = current.frames.length - 1;
    // O quadro onde o corte cai precisa ser inteiro; se não houver, remonta-o.
    const frames = current.frames.slice(cut);
    if (frames[0].k === undefined) frames[0] = { at: frames[0].at, v: frames[0].v, k: JSON.stringify(frameAt(current, cut)) };
    current = { ...current, frames: [current.frames[0], ...frames], droppedFrames: current.droppedFrames + cut - 1 };
  }
  return { recording: current, bytes: (await gzip(JSON.stringify(current))).length };
}
