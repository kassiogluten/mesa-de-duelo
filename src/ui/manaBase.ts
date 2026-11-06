// Cores de mana do deck (S5): os símbolos de cada cor nos custos contra as fontes de cada cor (terrenos e permanentes baratas que geram mana).
import type { Color } from '../cards';
import { cacheGet, type ScryCard } from '../scryfall';
import type { DeckData, DeckEntry } from '../decks';
import { esc, pip } from './cardtext';

const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G'];
const COLOR_NAME: Record<Color, string> = { W: 'branco', U: 'azul', B: 'preto', R: 'vermelho', G: 'verde' };
const BASIC_TYPE: Record<string, Color> = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' };
/** Permanente que gera mana e custa até isto conta como fonte (Sol Ring, Llanowar Elves, Arcane Signet); mais cara, não. */
const CHEAP_SOURCE = 3;
/** Avisa quando a parte das fontes de uma cor fica abaixo desta fração da parte dos símbolos dela. */
const SHORT_RATIO = 0.7;

/** Símbolos coloridos de um custo: híbrido conta para as duas cores; fyrexiano, para a cor dele. */
export function costSymbols(cost: string): Record<Color, number> {
  const out = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const raw of cost.match(/\{[^}]+\}/g) ?? []) for (const c of COLORS) if (raw.slice(1, -1).split('/').includes(c)) out[c]++;
  return out;
}

const ANY = 'any' as const;
/** As cores que a carta dá como fonte; ANY quando é qualquer cor (vira as cores do deck). Vazio: não é fonte. */
export function sourceColors(sc: Pick<ScryCard, 'type_line' | 'oracle_text' | 'layout' | 'cmc'>): Set<Color | typeof ANY> {
  const out = new Set<Color | typeof ANY>();
  const land = /\bLand\b/.test(sc.type_line.split(' // ')[0]!) || (sc.layout === 'modal_dfc' && /\bLand\b/.test(sc.type_line));
  const permanent = /\b(Artifact|Creature|Enchantment|Planeswalker)\b/.test(sc.type_line);
  if (!land && !(permanent && (sc.cmc ?? 0) <= CHEAP_SOURCE)) return out;
  const text = sc.oracle_text ?? '';
  for (const [type, c] of Object.entries(BASIC_TYPE)) if (land && new RegExp(`\\b${type}\\b`).test(sc.type_line)) out.add(c);
  for (const clause of text.match(/\badd\b[^.]*/gi) ?? []) {
    if (/any (one )?(color|type)|of that color|chosen color/i.test(clause)) out.add(ANY);
    for (const c of COLORS) if (clause.includes(`{${c}}`)) out.add(c);
  }
  // Terrenos de busca (Evolving Wilds, Wooded Foothills): valem pelas cores que podem buscar.
  if (land) for (const clause of text.match(/search your library for [^.]*/gi) ?? []) {
    if (/basic land card/i.test(clause)) out.add(ANY);
    for (const [type, c] of Object.entries(BASIC_TYPE)) if (new RegExp(`\\b${type}\\b`).test(clause)) out.add(c);
  }
  return out;
}

interface ColorRow { color: Color; symbols: number; sources: number; symbolShare: number; sourceShare: number; short: boolean }
interface ManaBase { rows: ColorRow[]; symbols: number; sources: number; lands: number; others: number; partial: boolean }

/** Símbolos e fontes de cada cor do deck (principal e comandantes); só as cores que aparecem nos custos. */
export function manaBase(deck: Pick<DeckData, 'cards' | 'commanders'>, lookup: (e: DeckEntry) => ScryCard | null = e => cacheGet(e.name, e)): ManaBase {
  const symbols = { W: 0, U: 0, B: 0, R: 0, G: 0 }, sources = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  let partial = false, sourceCards = 0, lands = 0, others = 0;
  const entries = [...(deck.commanders ?? []), ...deck.cards];
  const known = entries.map(e => ({ e, sc: lookup(e) }));
  for (const { e, sc } of known) {
    if (!sc) { partial = true; continue; }
    if (/\bLand\b/.test(sc.type_line.split(' // ')[0]!)) continue;
    const s = costSymbols(sc.mana_cost ?? '');
    for (const c of COLORS) symbols[c] += s[c] * e.count;
  }
  const deckColors = COLORS.filter(c => symbols[c] > 0);
  for (const { e, sc } of known) {
    if (!sc || deck.commanders?.includes(e)) continue;
    const colors = sourceColors(sc);
    const given = new Set<Color>(colors.has(ANY) ? deckColors : []);
    for (const c of colors) if (c !== ANY) given.add(c);
    if (!given.size) continue;
    sourceCards += e.count;
    if (/\bLand\b/.test(sc.type_line)) lands += e.count; else others += e.count;
    for (const c of given) sources[c] += e.count;
  }
  const totalSymbols = deckColors.reduce((n, c) => n + symbols[c], 0);
  const rows = deckColors.map(color => {
    const symbolShare = symbols[color] / totalSymbols, sourceShare = sourceCards ? sources[color] / sourceCards : 0;
    return { color, symbols: symbols[color], sources: sources[color], symbolShare, sourceShare, short: sourceShare < symbolShare * SHORT_RATIO };
  });
  return { rows, symbols: totalSymbols, sources: sourceCards, lands, others, partial };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Bloco "Cores de mana" das estatísticas: uma linha por cor e o aviso das cores com poucas fontes. */
export function manaBaseHTML(deck: Pick<DeckData, 'cards' | 'commanders'>): string {
  const base = manaBase(deck);
  if (!base.rows.length) return '';
  const short = base.rows.filter(r => r.short);
  const sourcesTip = base.others ? `${base.lands} ${base.lands === 1 ? 'terreno' : 'terrenos'} e ${base.others} ${base.others === 1 ? 'outra carta que gera' : 'outras cartas que geram'} mana` : `${base.lands} ${base.lands === 1 ? 'terreno' : 'terrenos'}`;
  return `<div class="ds-mana" role="group" aria-label="Cores de mana: símbolos nos custos contra fontes de mana">
    <p class="ds-mana-head"><span>Cores</span><span><i class="ds-key sym" aria-hidden="true"></i>Símbolos</span><span title="${esc(sourcesTip)}"><i class="ds-key src" aria-hidden="true"></i>Fontes <small>(${base.sources} no deck)</small></span></p>
    ${base.rows.map(r => `<p class="ds-mana-row${r.short ? ' short' : ''}" aria-label="${esc(`${COLOR_NAME[r.color]}: ${r.symbols} símbolos, ${pct(r.symbolShare)} do total; ${r.sources} fontes, ${pct(r.sourceShare)} das fontes`)}">${pip(r.color)}<span class="ds-mana-num"><b>${r.symbols}</b><small>${pct(r.symbolShare)}</small></span><span class="ds-mana-num"><b>${r.sources}</b><small>${pct(r.sourceShare)}</small></span><span class="ds-mana-bars" aria-hidden="true"><i style="width:${r.symbolShare * 100}%"></i><i style="width:${r.sourceShare * 100}%"></i></span></p>`).join('')}
    ${short.length ? `<p class="ds-mana-warn" role="status">Poucas fontes de ${short.map(r => COLOR_NAME[r.color]).join(' e ')}: ${short.map(r => `${pct(r.symbolShare)} dos símbolos e ${r.sources} de ${base.sources} fontes`).join('; ')}.</p>` : ''}
    ${base.partial ? '<p class="ds-mana-note">Conta parcial: faltam dados de algumas cartas.</p>' : ''}
  </div>`;
}
