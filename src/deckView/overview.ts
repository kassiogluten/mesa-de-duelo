// A aba Visão geral da tela do deck: análise com os avisos, os gráficos, as categorias das cartas, os números, o bracket e as fichas.
import { commanderRules, hasCommandZone, type DeckData } from '../decks';
import { cacheGet } from '../scryfall';
import { esc } from '../ui/cardtext';
import { deckRows, deckStats, statsHTML } from '../ui/deckStats';
import { manaBase } from '../ui/manaBase';
import { tokensPreviewHTML } from '../ui/deckTokensView';
import { BRACKET_NAME, deckBracket, estimateBracket } from '../brackets';
import type { TokenKind } from '../deckTokens';
import { deckInsights, type Insight } from './analysis';
import { countCategories, type CategoryCount } from './functions';
import { functionBarsHTML, landDropsHTML, typesHTML } from './charts';

const COLOR_NAME: Record<string, string> = { W: 'branco', U: 'azul', B: 'preto', R: 'vermelho', G: 'verde' };
const RARITY: [string, string][] = [['mythic', 'Míticas'], ['rare', 'Raras'], ['uncommon', 'Incomuns'], ['common', 'Comuns']];

/** As funções das cartas: null procurando, 'erro' se o servidor não respondeu. */
export type FunctionsState = Map<string, string[]> | null | 'erro';

/** As linhas do deck principal com o oracle_id e se são terreno, para contar as categorias. */
function categoryRows(deck: DeckData) {
  return deckRows(deck.cards).map(r => ({ name: r.name, count: r.count, oracleId: cacheGet(r.name)?.oracle_id, land: r.info?.type === 'land' }));
}

/** Os números que a análise usa, tirados do deck e das funções já recebidas. */
function analyze(deck: DeckData, functions: FunctionsState) {
  const stats = deckStats(deck);
  const categories = functions instanceof Map ? countCategories(categoryRows(deck), functions) : null;
  const helpers = categories ? new Set(categories.filter(c => c.category.id === 'ramp' || c.category.id === 'draw').flatMap(c => c.cards.map(x => x.name))) : new Set<string>();
  const cheapHelpers = deckRows(deck.cards).filter(r => helpers.has(r.name) && (r.cmc ?? 0) <= 2).reduce((n, r) => n + r.count, 0);
  const commander = hasCommandZone(deck.format) && deck.format !== 'oathbreaker';
  const insights: Insight[] = deckInsights({
    commander, library: stats.total, lands: stats.lands, average: stats.average, cheapHelpers,
    categories, shortColors: manaBase(deck).rows.filter(r => r.short).map(r => COLOR_NAME[r.color] ?? r.color), unknown: stats.unknown,
  });
  return { insights, categories, stats, commander };
}

const label = (name: string) => cacheGet(name)?.pt?.name || name;

function insightsHTML(insights: Insight[]) {
  if (!insights.length) return '';
  return `<section class="dv-panel"><h2>Análise</h2><ul class="dv-insights">${insights.map(i => `<li class="dv-insight ${i.tone}"><b>${esc(i.title)}</b><span>${esc(i.text)}</span></li>`).join('')}</ul></section>`;
}

/** No Commander as quatro categorias da análise aparecem mesmo zeradas (faltar limpa-campo é um aviso); nos outros, só as que o deck tem. */
function categoriesHTML(categories: CategoryCount[] | null, functions: FunctionsState, commander: boolean, barsCommander: boolean) {
  const body = functions === 'erro'
    ? '<p class="dv-note">Não foi possível ler as funções das cartas agora. O resto da análise continua valendo.</p>'
    : !categories ? '<p class="dv-note dv-loading">Lendo as funções das cartas…</p>'
    : `${functionBarsHTML(categories, barsCommander)}<div class="dv-categories">${categories.filter(c => c.count || (commander && ['ramp', 'draw', 'removal', 'sweeper'].includes(c.category.id))).map(c =>
      `<details class="dv-category"${c.count ? '' : ' data-empty'}><summary title="${esc(c.category.hint)}"><b>${c.count}</b><span>${esc(c.category.label)}</span></summary>${c.cards.length ? `<ul>${c.cards.map(x => `<li><button type="button" class="dv-link" data-inspect="${esc(x.name)}">${x.count > 1 ? `${x.count} ` : ''}${esc(label(x.name))}</button></li>`).join('')}</ul>` : `<p class="dv-note">${esc(c.category.hint)}</p>`}</details>`).join('')}</div>
      <p class="dv-note">Pelas etiquetas de função da comunidade do Scryfall (Tagger). Terrenos não entram. Toque numa categoria para ver as cartas.</p>`;
  return `<section class="dv-panel"><h2>Funções das cartas</h2>${body}</section>`;
}

function bracketHTML(deck: DeckData) {
  if (!commanderRules(deck.format)) return '';
  const chosen = deckBracket(deck), estimate = estimateBracket(deck);
  return `<section class="dv-panel"><h2>Bracket</h2><p class="dv-bracket">${chosen ? `<b>Bracket ${chosen}</b> · ${esc(BRACKET_NAME[chosen])}` : ''}${estimate.min > (chosen ?? 0) ? ` <span class="dv-warn-text">As cartas pedem pelo menos o Bracket ${estimate.min}.</span>` : ''}</p>${estimate.reasons.length ? `<ul class="dv-reasons">${estimate.reasons.map(r => `<li>${esc(r.text)}</li>`).join('')}</ul>` : '<p class="dv-note">Nenhuma carta que pese no bracket: sem Game Changers, combos de duas cartas ou destruição de terrenos em massa.</p>'}</section>`;
}

function rarityHTML(deck: DeckData) {
  const counts = new Map<string, number>();
  for (const e of [...(deck.commanders ?? []), ...deck.cards]) {
    const r = cacheGet(e.name)?.rarity;
    if (r) counts.set(r, (counts.get(r) ?? 0) + e.count);
  }
  const rows = RARITY.filter(([k]) => counts.get(k));
  return rows.length ? `<p class="dv-rarity">${rows.map(([k, l]) => `<span class="r-${k}"><b>${counts.get(k)}</b> ${l}</span>`).join('')}</p>` : '';
}

export function overviewHTML(deck: DeckData, functions: FunctionsState, tokens: TokenKind[]) {
  const { insights, categories, stats, commander } = analyze(deck, functions);
  // Sem os dados de boa parte das cartas, a contagem de terrenos engana: o gráfico espera, como a análise.
  const lands = stats.unknown > stats.total * 0.1 ? '' : landDropsHTML(stats.total, stats.lands);
  return `<div class="dv-overview"><div class="dv-col">${insightsHTML(insights)}${lands}${categoriesHTML(categories, functions, commanderRules(deck.format), commander)}</div><div class="dv-col">${typesHTML(deck)}<section class="dv-panel dv-numbers"><h2>Números</h2>${statsHTML(deck)}${rarityHTML(deck)}</section>${bracketHTML(deck)}${tokensPreviewHTML(deck, tokens)}</div></div>`;
}
