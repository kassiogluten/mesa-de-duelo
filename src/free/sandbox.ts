import type { DeckData, DeckFormat } from '../decks';

/**
 * Mesa livre: nenhuma regra é aplicada. O jogador move as cartas entre as zonas como numa mesa de verdade;
 * este módulo só guarda onde cada carta está e o que foi feito, para desfazer e para voltar depois de recarregar.
 */
export type Zone = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'command';
export const ZONES: Zone[] = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'command'];

export interface SCard {
  id: number;
  /** Nome Oracle em inglês (o mesmo do deck), usado para achar imagem e texto no Scryfall. */
  name: string;
  tapped: boolean;
  faceDown: boolean;
  counters: Record<string, number>;
  /** Ficha criada na mesa: deixa de existir ao sair do campo de batalha. */
  token?: boolean;
  /** Ficha sem carta correspondente: só nome e força/resistência digitados. */
  custom?: { power?: string; toughness?: string };
  commander?: boolean;
}

export interface Sandbox {
  v: 1;
  deckName: string;
  /** Lista original, para recomeçar com o mesmo deck mesmo depois de recarregar a página. */
  deck: Pick<DeckData, 'name' | 'cards' | 'commanders'>;
  format: DeckFormat;
  zones: Record<Zone, SCard[]>;
  life: number;
  oppLife: number;
  turn: number;
  nextId: number;
}

export type Rng = () => number;

export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const blank = (): Record<Zone, SCard[]> => ({ library: [], hand: [], battlefield: [], graveyard: [], exile: [], command: [] });
const card = (id: number, name: string, extra: Partial<SCard> = {}): SCard => ({ id, name, tapped: false, faceDown: false, counters: {}, ...extra });

/** Grimório embaralhado, comandantes na zona de comando e a mão inicial de 7 cartas já comprada. */
export function newSandbox(deck: DeckData, format: DeckFormat, rng: Rng = Math.random): Sandbox {
  let id = 1;
  const zones = blank();
  for (const e of deck.cards) for (let i = 0; i < e.count; i++) zones.library.push(card(id++, e.name));
  for (const e of deck.commanders ?? []) for (let i = 0; i < e.count; i++) zones.command.push(card(id++, e.name, { commander: true }));
  zones.library = shuffle(zones.library, rng);
  const life = format === 'commander' ? 40 : 20;
  const s: Sandbox = { v: 1, deckName: deck.name, deck: { name: deck.name, cards: deck.cards, commanders: deck.commanders ?? [] }, format, zones, life, oppLife: life, turn: 1, nextId: id };
  draw(s, 7);
  return s;
}

export function locate(s: Sandbox, id: number): { zone: Zone; index: number; card: SCard } | null {
  for (const zone of ZONES) {
    const index = s.zones[zone].findIndex(c => c.id === id);
    if (index >= 0) return { zone, index, card: s.zones[zone][index] };
  }
  return null;
}

/** O topo do grimório é o fim da lista. */
export function draw(s: Sandbox, n = 1) {
  for (let i = 0; i < n && s.zones.library.length; i++) s.zones.hand.push(s.zones.library.pop()!);
}

export function mill(s: Sandbox, n = 1) {
  for (let i = 0; i < n && s.zones.library.length; i++) s.zones.graveyard.push(s.zones.library.pop()!);
}

export function shuffleLibrary(s: Sandbox, rng: Rng = Math.random) {
  s.zones.library = shuffle(s.zones.library, rng);
}

/** Devolve a mão ao grimório, embaralha e compra de novo (o jogador decide o que colocar no fundo). */
export function mulligan(s: Sandbox, size = 7, rng: Rng = Math.random) {
  s.zones.library.push(...s.zones.hand.map(c => ({ ...c, tapped: false, faceDown: false })));
  s.zones.hand = [];
  shuffleLibrary(s, rng);
  draw(s, size);
}

export type Position = 'top' | 'bottom';
/**
 * Move a carta para outra zona. Ao sair do campo ela volta "limpa" (desvirada e sem marcadores).
 * Fichas que saem do campo deixam de existir.
 */
export function move(s: Sandbox, id: number, to: Zone, position: Position = 'top'): boolean {
  const found = locate(s, id);
  if (!found) return false;
  s.zones[found.zone].splice(found.index, 1);
  const c = found.card;
  if (c.token && to !== 'battlefield') return true;
  // Virada para baixo só faz sentido no campo e no exílio; nas outras zonas a carta fica normal.
  const keepsFace = to === 'battlefield' || to === 'exile';
  const moved: SCard = to === 'battlefield' && found.zone === 'battlefield' ? c
    : { ...c, tapped: false, counters: to === 'battlefield' ? c.counters : {}, faceDown: keepsFace && c.faceDown };
  // As zonas empilham pelo fim (topo do grimório é o último); "fundo" põe no começo.
  if (position === 'bottom') s.zones[to].unshift(moved);
  else s.zones[to].push(moved);
  return true;
}

export function toggleTap(s: Sandbox, id: number) {
  const c = locate(s, id)?.card;
  if (c) c.tapped = !c.tapped;
}

export function untapAll(s: Sandbox) {
  for (const c of s.zones.battlefield) c.tapped = false;
}

export function toggleFaceDown(s: Sandbox, id: number) {
  const c = locate(s, id)?.card;
  if (c) c.faceDown = !c.faceDown;
}

export function addCounter(s: Sandbox, id: number, kind: string, delta: number) {
  const c = locate(s, id)?.card;
  if (!c) return;
  const n = (c.counters[kind] ?? 0) + delta;
  if (n > 0) c.counters[kind] = n; else delete c.counters[kind];
}

/** Ficha copiando uma carta (mesma imagem) ou, sem `copyOf`, uma ficha com nome e força livres. */
export function createToken(s: Sandbox, name: string, opts: { copyOf?: number; power?: string; toughness?: string } = {}): SCard {
  const source = opts.copyOf !== undefined ? locate(s, opts.copyOf)?.card : undefined;
  const t = source
    ? card(s.nextId++, source.name, { token: true, custom: source.custom })
    : card(s.nextId++, name.trim() || 'Ficha', { token: true, custom: { power: opts.power, toughness: opts.toughness } });
  s.zones.battlefield.push(t);
  return t;
}

/** Validação do que foi salvo no navegador; qualquer coisa estranha descarta o jogo salvo. */
export function parseSandbox(raw: string | null): Sandbox | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Sandbox;
    if (s?.v !== 1 || typeof s.deckName !== 'string' || !Array.isArray(s.deck?.cards) || !s.zones || !ZONES.every(z => Array.isArray(s.zones[z]))) return null;
    if (![s.life, s.oppLife, s.turn, s.nextId].every(Number.isFinite)) return null;
    if (!ZONES.every(z => s.zones[z].every(c => Number.isInteger(c?.id) && typeof c.name === 'string' && c.counters && typeof c.counters === 'object'))) return null;
    return s;
  } catch { return null; }
}

/** Histórico para desfazer: cópias do estado antes de cada ação, até um limite. */
export class History {
  private past: string[] = [];
  private limit: number;
  constructor(limit = 100) { this.limit = limit; }
  push(s: Sandbox) {
    this.past.push(JSON.stringify(s));
    if (this.past.length > this.limit) this.past.shift();
  }
  undo(): Sandbox | null { return parseSandbox(this.past.pop() ?? null); }
  get size() { return this.past.length; }
  clear() { this.past = []; }
}
