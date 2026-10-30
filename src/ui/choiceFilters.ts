import type { FCard, FQuestion } from '../forge/client';
import { esc } from './cardtext';
import { manaValue } from './choiceScreens';

/*
 * Filtros e ordem nas escolhas grandes de cartas (buscar no grimório, escolher do cemitério ou do exílio, uma carta
 * entre as reveladas). Tudo aqui só muda o que aparece na tela: cada carta continua com o índice original da opção,
 * que é o que vai na resposta, e as marcadas continuam marcadas com qualquer filtro.
 */

export type ChoiceSort = 'type' | 'cost' | 'name';
export const CHOICE_SORT_KEY = 'mesa:choiceSort';
export const CHOICE_SORTS: [ChoiceSort, string][] = [['type', 'Tipo'], ['cost', 'Custo'], ['name', 'Nome']];
/** A partir de quantas cartas a escolha ganha os filtros e a ordem por tipo. */
export const LARGE_CHOICE = 8;
/** A partir de quantas cartas aparece a busca pelo nome. */
export const SEARCH_FROM = 16;

/** Tipos na ordem dos filtros; uma carta de dois tipos fica no grupo do primeiro desta lista (Criatura Artefato é Criatura). */
export const CARD_TYPES = [
  { key: 'creature', re: /\b(Creature|Criatura)\b/i, label: 'Criaturas' },
  { key: 'land', re: /\b(Land|Terreno)\b/i, label: 'Terrenos' },
  { key: 'artifact', re: /\b(Artifact|Artefato)\b/i, label: 'Artefatos' },
  { key: 'enchantment', re: /\b(Enchantment|Encantamento)\b/i, label: 'Encantamentos' },
  { key: 'planeswalker', re: /\bPlaneswalker\b/i, label: 'Planeswalkers' },
  { key: 'instant', re: /\b(Instant|Instantâne[ao])/i, label: 'Instantâneas' },
  { key: 'sorcery', re: /\b(Sorcery|Feitiço)/i, label: 'Feitiços' },
  { key: 'battle', re: /\b(Battle|Batalha)\b/i, label: 'Batalhas' },
] as const;
export const OTHER_TYPE = { key: 'other', label: 'Outras' } as const;

export const parseChoiceSort = (value: string | null | undefined): ChoiceSort => value === 'cost' || value === 'name' ? value : 'type';

/** Tipos da carta pela linha de tipo (só a parte antes do travessão, e só a face da frente). */
export function cardTypes(typeLine = ''): string[] {
  const main = typeLine.split(' // ')[0].split(/\s[—-]\s/)[0];
  const keys = CARD_TYPES.filter(t => t.re.test(main)).map(t => t.key as string);
  return keys.length ? keys : [OTHER_TYPE.key];
}

const typeLabel = (key: string) => CARD_TYPES.find(t => t.key === key)?.label ?? OTHER_TYPE.label;
const typeRank = (key: string) => { const i = CARD_TYPES.findIndex(t => t.key === key); return i < 0 ? CARD_TYPES.length : i; };

/** Para a busca: sem acento, sem maiúscula. */
export const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const cardsOf = (q: FQuestion) => (q.options ?? []).map(o => typeof o === 'string' ? undefined : o.card);

/**
 * Escolhas que ganham filtros: escolher cartas (não ordenar), com todas as opções sendo cartas à vista, e muitas.
 * Telas próprias (gatilhos, vidência, jeito de jogar, votação) nunca chegam aqui com kind "choose" de cartas soltas,
 * mas ficam de fora pelo purpose também, porque nelas a ordem tem significado.
 */
export function isFilterableChoice(q: FQuestion) {
  if (q.kind !== 'choose' || q.purpose) return false;
  const cards = cardsOf(q);
  return cards.length >= LARGE_CHOICE && cards.every(c => !!c && !c.faceDown);
}

/** O que o jogador escolheu ver: um tipo (ou todos) e o texto da busca. Vale para uma pergunta só. */
export interface ChoiceView { id: number; type: string | null; query: string }
export const newChoiceView = (id: number): ChoiceView => ({ id, type: null, query: '' });

export interface ChoiceLayoutOptions {
  sort: ChoiceSort;
  view: ChoiceView;
  /** Nome que aparece na carta (em português quando há tradução). */
  name: (c: FCard) => string;
  typeLine: (c: FCard) => string;
}

export interface ChoiceGroup { key: string; label: string; indices: number[] }
export interface ChoiceChip { key: string | null; label: string; count: number }
export interface ChoiceLayout {
  /** Todas as opções, na ordem da tela; com a ordem por tipo, uma por grupo, senão um grupo só, sem título. */
  groups: ChoiceGroup[];
  /** Todas, depois um filtro por tipo presente, na ordem de CARD_TYPES. */
  chips: ChoiceChip[];
  /** Opções que passam pelo filtro e pela busca. */
  visible: Set<number>;
  search: boolean;
  total: number;
}

/** Monta a tela: grupos e ordem, filtros com a contagem e o que fica à vista. Devolve sempre os índices originais. */
export function choiceLayout(q: FQuestion, { sort, view, name, typeLine }: ChoiceLayoutOptions): ChoiceLayout {
  const cards = cardsOf(q) as FCard[];
  const info = cards.map(c => {
    const types = cardTypes(typeLine(c));
    const shown = name(c);
    return { types, group: types[0], mv: manaValue(c.manaCost), name: shown, search: normalize(`${shown}\u0000${c.name ?? ''}`) };
  });
  const indices = cards.map((_, i) => i);
  const byName = (a: number, b: number) => info[a].name.localeCompare(info[b].name, 'pt-BR');
  const byCost = (a: number, b: number) => info[a].mv - info[b].mv || byName(a, b);
  indices.sort(sort === 'name' ? (a, b) => byName(a, b) || a - b : (a, b) => byCost(a, b) || a - b);
  let groups: ChoiceGroup[];
  if (sort === 'type') {
    const keys = [...new Set(info.map(i => i.group))].sort((a, b) => typeRank(a) - typeRank(b));
    groups = keys.map(key => ({ key, label: typeLabel(key), indices: indices.filter(i => info[i].group === key) }));
  } else groups = [{ key: 'all', label: '', indices }];

  const present = [...new Set(info.flatMap(i => i.types))].sort((a, b) => typeRank(a) - typeRank(b));
  const chips: ChoiceChip[] = [{ key: null, label: 'Todas', count: cards.length },
    ...present.map(key => ({ key, label: typeLabel(key), count: info.filter(i => i.types.includes(key)).length }))];
  const type = view.type && present.includes(view.type) ? view.type : null;
  const search = cards.length >= SEARCH_FROM;
  const query = search ? normalize(view.query) : '';
  const visible = new Set(indices.filter(i => (!type || info[i].types.includes(type)) && (!query || info[i].search.includes(query))));
  return { groups, chips, visible, search, total: cards.length };
}

/** Frase para o leitor de tela e para quando nada aparece. */
export function choiceStatus(layout: ChoiceLayout, picked: number[]) {
  const shown = layout.visible.size;
  const hiddenPicked = picked.filter(i => !layout.visible.has(i)).length;
  const base = shown === layout.total ? `${shown} cartas.` : shown ? `Mostrando ${shown} de ${layout.total} cartas.` : 'Nenhuma carta com esse filtro.';
  return hiddenPicked ? `${base} ${hiddenPicked === 1 ? '1 escolhida fica' : `${hiddenPicked} escolhidas ficam`} fora do filtro.` : base;
}

/** Barra de cima: filtros por tipo (só os presentes, quando há mais de um), a ordem e, com muitas cartas, a busca. */
export function choiceToolsHTML(layout: ChoiceLayout, sort: ChoiceSort, view: ChoiceView, picked: number[]) {
  const type = layout.chips.some(c => c.key === view.type) ? view.type : null;
  const chips = layout.chips.length > 2 ? `<div class="q-filters" role="group" aria-label="Filtrar por tipo">${layout.chips.map(c =>
    `<button type="button" class="q-filter" data-q-filter="${c.key ?? ''}" aria-pressed="${c.key === type}">${esc(c.label)}<span class="q-filter-count">${c.count}</span></button>`).join('')}</div>` : '';
  const sorts = `<div class="q-sort" role="group" aria-label="Ordenar por"><span class="q-sort-label" aria-hidden="true">Ordenar</span>${CHOICE_SORTS.map(([key, text]) =>
    `<button type="button" class="q-sort-btn" data-q-sort="${key}" aria-pressed="${key === sort}">${text}</button>`).join('')}</div>`;
  const search = layout.search ? `<label class="q-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg><input id="fQSearch" type="search" value="${esc(view.query)}" placeholder="Buscar carta" aria-label="Buscar carta pelo nome, em português ou inglês" autocomplete="off" spellcheck="false"></label>` : '';
  return `<div class="q-tools">${chips}<div class="q-tools-row">${search}${sorts}</div><p class="q-tools-status" id="fQStatus" aria-live="polite">${esc(choiceStatus(layout, picked))}</p></div>`;
}

/** Título de cada grupo (ordem por tipo), dentro da fileira de cartas; some quando o filtro esconde o grupo inteiro. */
export function choiceGroupHTML(group: ChoiceGroup, layout: ChoiceLayout) {
  if (!group.label) return '';
  const shown = group.indices.filter(i => layout.visible.has(i)).length;
  return `<h3 class="q-group" data-q-group="${group.key}"${shown ? '' : ' hidden'}>${esc(group.label)}<span>${shown}</span></h3>`;
}
