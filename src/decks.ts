import starterDecks from '../shared/starter-decks.json' with { type: 'json' };
import { isBracket, type Bracket } from './brackets';

export type DeckFormat = 'free' | 'standard' | 'pauper' | 'sacola50' | 'commander';
export const DECK_FORMATS: readonly DeckFormat[] = ['standard', 'pauper', 'sacola50', 'free', 'commander'];
export const FORMAT_LABEL: Record<DeckFormat, string> = { free: 'Livre', standard: 'Standard', pauper: 'Pauper', sacola50: 'Sacola 50', commander: 'Commander' };
/** Formatos de 60 cartas com sideboard de 15 e legalidade conferida. */
export const isConstructed = (format: DeckFormat | undefined): format is 'standard' | 'pauper' | 'sacola50' => format === 'standard' || format === 'pauper' || format === 'sacola50';
/** Formato do Scryfall que dá a legalidade das cartas: o Sacola 50 usa as do Legacy. */
export const scryfallFormat = (format: DeckFormat | undefined) => format === 'sacola50' ? 'legacy' : format === 'standard' || format === 'pauper' || format === 'commander' ? format : undefined;
/**
 * Decks prontos listados num formato: só os montados para ele, mesmo que outros também sejam legais (os de Standard e
 * de Pauper valem no Sacola 50, que usa o Legacy). No Livre entram todos os de 60 cartas.
 */
export const readyDeckFits = (d: DeckData, format: DeckFormat) => format === 'free' ? d.format !== 'commander' : (d.format ?? 'free') === format;
/** O Sacola 50 não confere preço: o aviso lembra o limite combinado. */
export const SACOLA_HINT = 'Sacola 50: cartas do Legacy, com o deck inteiro custando até R$ 50. A mesa não confere o preço: combine com o oponente.';
/** `set` e `cn`: a impressão escolhida (série do Scryfall, em minúsculas, e número de coleção), vinda da lista importada. */
export interface DeckEntry { name: string; count: number; oracleId?: string; set?: string; cn?: string }
/** A mesma carta na mesma impressão: cada série da mesma carta fica numa linha própria do deck. */
export const entryKey = (e: Pick<DeckEntry, 'name' | 'set' | 'cn'>) => e.set ? `${e.name}|${e.set}|${e.cn ?? ''}` : e.name;
/** "(DMU) 277": a impressão como as listas do Moxfield e do Arena escrevem. */
export const printLabel = (e: Pick<DeckEntry, 'set' | 'cn'>) => e.set ? `(${e.set.toUpperCase()})${e.cn ? ` ${e.cn}` : ''}` : '';
export interface DeckData {
  id: string;
  name: string;
  cards: DeckEntry[];
  sideboard?: DeckEntry[];
  commanders?: DeckEntry[];
  builtin?: boolean;
  format?: DeckFormat;
  updatedAt?: string;
  sourceTemplateId?: string;
  importSource?: string;
  importHistory?: string[];
  unresolved?: string[];
  /** Soma do preço das cartas em dólar na data registrada (só nos decks prontos). */
  price?: { usd: number; date: string };
  /** Bracket escolhido para o deck de Commander (nos prontos, conferido à mão); deckBracket o mantém acima do mínimo. */
  bracket?: Bracket;
  /** Carta do deck principal escolhida como capa; sem ela, ou fora do deck, a capa é automática. Não vale em Commander. */
  cover?: string;
}
export const DEFAULT_DECKS = starterDecks as DeckData[];
const BASICS = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes', 'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp', 'Snow-Covered Mountain', 'Snow-Covered Forest'].map(n => n.toLowerCase()));
export const isBasic = (name: string) => BASICS.has(name.toLowerCase());
export const countEntries = (entries: DeckEntry[]) => entries.reduce((s, e) => s + e.count, 0);
export const deckSize = (d: DeckData) => countEntries(d.cards);
export const totalDeckSize = (d: DeckData) => deckSize(d) + countEntries(d.commanders ?? []);
export const deckEntries = (d: DeckData) => [...d.cards, ...(d.sideboard ?? []), ...(d.commanders ?? [])];
/** "US$ 1.605,93" para decks prontos com preço registrado; vazio nos outros. */
export const deckPriceText = (d: DeckData) => d.builtin && d.price ? `US$ ${d.price.usd.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
/** O que o preço significa, para a dica sobre o valor. */
export const deckPriceDescription = (d: DeckData) => d.price ? `Quanto custam as ${totalDeckSize(d)} cartas em dólar, pela edição mais barata de cada uma, no Scryfall em ${d.price.date.split('-').reverse().join('/')}. É uma referência: o preço muda com o tempo.` : '';
export const allDecks = (): DeckData[] => [...loadUserDecks(), ...DEFAULT_DECKS];

export const DECK_STORAGE_KEY = 'mesa:decks:v2';
export const LEGACY_DECK_KEY = 'mesa:decks:v1';
export interface DeckStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface LibraryState { decks: DeckData[]; recovery: unknown[]; error?: string; backup?: string }
export type SaveResult = { ok: true } | { ok: false; error: string };
let state: LibraryState = { decks: [], recovery: [] };
let volatileDecks: DeckData[] | null = null;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function validEntries(v: unknown): v is DeckEntry[] {
  return Array.isArray(v) && v.every(e => object(e) && typeof e.name === 'string' && !!e.name.trim()
    && Number.isSafeInteger(e.count) && Number(e.count) > 0 && (e.oracleId === undefined || typeof e.oracleId === 'string')
    && (e.set === undefined || typeof e.set === 'string') && (e.cn === undefined || typeof e.cn === 'string'));
}
function validDeck(v: unknown): v is DeckData {
  return object(v) && typeof v.id === 'string' && !!v.id && typeof v.name === 'string' && validEntries(v.cards)
    && (v.sideboard === undefined || validEntries(v.sideboard)) && (v.format === undefined || DECK_FORMATS.includes(v.format as DeckFormat))
    && (v.commanders === undefined || validEntries(v.commanders)) && (v.bracket === undefined || isBracket(v.bracket))
    && (v.cover === undefined || typeof v.cover === 'string')
    && (v.unresolved === undefined || (Array.isArray(v.unresolved) && v.unresolved.every(n => typeof n === 'string')));
}

/** Como o deck fica ao ser lido do armazenamento: sem formato vira Livre, e todo deck do jogador tem sideboard. */
export const normalizeDeck = (record: DeckData): DeckData => ({ ...record, builtin: false, format: record.format ?? 'free', sideboard: record.sideboard ?? [] });

/** Invalid records are retained verbatim for export; migration never rewrites v1. */
export function readDeckLibrary(storage: DeckStorage): LibraryState {
  let raw: string | null = null;
  let legacy = false;
  try {
    raw = storage.getItem(DECK_STORAGE_KEY);
    if (raw === null) { raw = storage.getItem(LEGACY_DECK_KEY); legacy = raw !== null; }
    if (raw === null) return { decks: [], recovery: [] };
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch {
      return { decks: [], recovery: [raw], error: 'Não foi possível ler seus decks. Exporte a recuperação antes de continuar.' };
    }
    const records = legacy && Array.isArray(parsed) ? parsed : object(parsed) && parsed.version === 2 && Array.isArray(parsed.decks) ? parsed.decks : null;
    if (!records) return { decks: [], recovery: [raw], error: 'O arquivo de decks tem um formato desconhecido. Os dados originais foram preservados.' };
    const recovery: unknown[] = object(parsed) && Array.isArray(parsed.recovery) ? [...parsed.recovery] : [];
    const seen = new Set<string>();
    const decks: DeckData[] = [];
    for (const record of records) {
      if (!validDeck(record) || seen.has(record.id)) { recovery.push(record); continue; }
      seen.add(record.id);
      decks.push(normalizeDeck(record));
    }
    const result: LibraryState = { decks, recovery };
    if (recovery.length) result.error = 'Alguns registros precisam de recuperação. Exporte os dados originais; seus decks reconhecidos continuam disponíveis.';
    if (legacy) {
      const backup = 'mesa:decks:v1:backup';
      try {
        if (storage.getItem(backup) === null) storage.setItem(backup, raw);
        storage.setItem(DECK_STORAGE_KEY, JSON.stringify({ version: 2, decks, recovery }));
        result.backup = backup;
      } catch { result.error = 'Não foi possível concluir a migração. Seus decks antigos continuam preservados.'; }
    }
    return result;
  } catch { return { decks: [], recovery: raw ? [raw] : [], error: 'O armazenamento deste navegador não está disponível.' }; }
}

export function loadUserDecks(): DeckData[] {
  if (volatileDecks) return volatileDecks;
  try { state = readDeckLibrary(localStorage); }
  catch { state = { decks: [], recovery: [], error: 'O armazenamento deste navegador não está disponível.' }; }
  return state.decks;
}
export function getDeckStorageState(): LibraryState { return state; }
/** Os decks deste navegador guardados quando o jogador escolheu "Usar só os da conta" (um por troca). */
export const ACCOUNT_BACKUP_PREFIX = 'mesa:decks:antes-da-conta:';
export function exportDeckRecovery(): string {
  const original: Record<string, string | null> = {};
  try {
    const backups = Object.keys(localStorage).filter(key => key.startsWith(ACCOUNT_BACKUP_PREFIX));
    for (const key of [LEGACY_DECK_KEY, DECK_STORAGE_KEY, 'mesa:decks:v1:backup', ...backups]) original[key] = localStorage.getItem(key);
  } catch { /* Include in-memory drafts even without storage. */ }
  return JSON.stringify({ exportedAt: new Date().toISOString(), decks: volatileDecks ?? state.decks, recovery: state.recovery, original }, null, 2);
}
export function writeDeckLibrary(storage: DeckStorage, decks: DeckData[], recovery: unknown[] = []): SaveResult {
  if (!decks.every(validDeck)) return { ok: false, error: 'Há dados inválidos no deck. Exporte uma cópia para preservar suas alterações.' };
  try {
    const raw = storage.getItem(DECK_STORAGE_KEY);
    if (raw !== null) {
      // Keep an exact recovery copy before replacing malformed/partially recoverable data.
      let needsBackup = false;
      try {
        const parsed: unknown = JSON.parse(raw);
        needsBackup = !object(parsed) || parsed.version !== 2 || !Array.isArray(parsed.decks) || parsed.decks.some(d => !validDeck(d));
      } catch { needsBackup = true; }
      if (needsBackup) storage.setItem(`mesa:decks:recovery:${Date.now()}`, raw);
    }
    storage.setItem(DECK_STORAGE_KEY, JSON.stringify({ version: 2, decks, recovery }));
    return { ok: true };
  } catch { return { ok: false, error: 'Não foi possível salvar neste navegador. Suas alterações estão nesta aba; exporte uma cópia ou tente novamente.' }; }
}
/** Quem acompanha cada gravação dos decks do jogador (a sincronia da conta); só as que deram certo. */
let savedListener: ((decks: DeckData[]) => void) | null = null;
export function onUserDecksSaved(listener: ((decks: DeckData[]) => void) | null) { savedListener = listener; }

export function saveUserDecks(decks: DeckData[]): SaveResult {
  let result: SaveResult;
  try { result = writeDeckLibrary(localStorage, decks, state.recovery); }
  catch { result = { ok: false, error: 'O armazenamento não está disponível. Exporte uma cópia para guardar suas alterações.' }; }
  state = { ...state, decks, error: result.ok ? undefined : result.error };
  volatileDecks = result.ok ? null : decks;
  if (result.ok) savedListener?.(decks);
  return result;
}

export interface ParsedList { main: DeckEntry[]; sideboard: DeckEntry[]; commanders: DeckEntry[]; skipped: string[]; ignored: string[] }
const SECTION = /^(deck|main ?deck|mainboard|commanders?|companions?|sideboard|maybeboard|considering|tokens?)$/i;

/** Preserve sideboards and reject malformed quantities instead of quietly shortening a deck. */
export function parseDeckList(text: string): ParsedList {
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim());
  const sectionOf = (line: string) => {
    const h = line.replace(/^\/\/\s*/, '').replace(/\s*\(\d+\)\s*$/, '').replace(/:\s*$/, '').trim();
    return SECTION.test(h) ? h.toLowerCase() : null;
  };
  const commanderMarker = /\[[^\]]*\bcommander\b[^\]]*\]|\*CMDR\*/i;
  const hasHeaders = lines.some(l => sectionOf(l));
  const hasCommanderTags = lines.some(l => commanderMarker.test(l));
  const main = new Map<string, DeckEntry>(), sideboard = new Map<string, DeckEntry>(), commanders = new Map<string, DeckEntry>();
  const skipped: string[] = [], ignored: string[] = [];
  let section: 'main' | 'sideboard' | 'commanders' | 'ignored' = 'main';
  let seenCard = false;
  for (const raw of lines) {
    if (!raw) { if (!hasHeaders && !hasCommanderTags && seenCard) section = 'sideboard'; continue; }
    const header = sectionOf(raw);
    if (header) { section = /^(deck|main)/.test(header) ? 'main' : header === 'sideboard' ? 'sideboard' : /^commander/.test(header) ? 'commanders' : 'ignored'; continue; }
    if (/^(\/\/|#)/.test(raw) || /^(about|name)\s/i.test(raw)) continue;
    const sb = /^SB:\s*/i.test(raw);
    const line = raw.replace(/^SB:\s*/i, '');
    const m = line.match(/^(?:(\d+)\s*x?\s+)?(.+)$/i);
    if (!m || (!m[1] && /^[+\-\d]/.test(line) && /^[+\-]?\d*(?:[.,]\d+|\s*x?\s)/i.test(line))) { skipped.push(raw); continue; }
    const count = m[1] ? Number(m[1]) : 1;
    const tag = /\[[^\]]*\b(sideboard|commander|maybeboard|considering|tokens?)\b[^\]]*\]/i.exec(m[2]);
    const isCommander = commanderMarker.test(m[2]);
    const bare = m[2].replace(/\s*\^[^^]*\^/g, '').replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\*[A-Z]+\*/g, '');
    const printing = bare.match(/\s+\(([A-Za-z0-9]{2,6})\)(?:\s+([\w★-]+))?\s*$/);
    const name = bare.slice(0, printing?.index ?? bare.length).replace(/\s*\/\/\s*/g, ' // ').trim();
    const print = printing ? { set: printing[1].toLowerCase(), ...(printing[2] ? { cn: printing[2] } : {}) } : {};
    if (!name || !Number.isSafeInteger(count) || count <= 0) { skipped.push(raw); continue; }
    seenCard = true;
    if ((!sb && section === 'ignored') || (tag && !['sideboard', 'commander'].includes(tag[1].toLowerCase()))) { ignored.push(raw); continue; }
    const pool = sb || section === 'sideboard' || tag?.[1].toLowerCase() === 'sideboard' ? sideboard : section === 'commanders' || isCommander ? commanders : main;
    const key = entryKey({ name, ...print }).toLowerCase(), previous = pool.get(key);
    if (previous && !Number.isSafeInteger(previous.count + count)) { skipped.push(raw); continue; }
    if (previous) previous.count += count; else pool.set(key, { name, count, ...print });
  }
  return { main: [...main.values()], sideboard: [...sideboard.values()], commanders: [...commanders.values()], skipped, ignored };
}
export function exportDeckList(deck: DeckData): string {
  const lines = (entries: DeckEntry[]) => entries.map(e => `${e.count} ${e.name}${e.set ? ` ${printLabel(e)}` : ''}`).join('\n');
  return `${deck.commanders?.length ? `Commander\n${lines(deck.commanders)}\n\n` : ''}Deck\n${lines(deck.cards)}${deck.sideboard?.length ? `\n\nSideboard\n${lines(deck.sideboard)}` : ''}\n`;
}
