// Escolher um tipo de criatura (Cavern of Souls, Kindred Discovery): uma busca em português ou em inglês, os tipos do seu deck no topo com quantas cartas têm cada um, e todos os outros em ordem alfabética; um toque responde.
import type { FQuestion } from '../forge/client';
import { esc } from './cardtext';
import { normalize } from './choiceFilters';
import { creatureTypePt } from './creatureTypes';

export const isTypeChoice = (q: FQuestion) => q.purpose === 'creature-type';

/** Quantos tipos do deck aparecem no topo. */
const MINE = 8;

interface TypeRow { i: number; en: string; pt: string; count: number }
function rows(q: FQuestion): TypeRow[] {
  return (q.options ?? []).map((o, i) => {
    const en = typeof o === 'string' ? o : o.label;
    return { i, en, pt: creatureTypePt(en), count: typeof o === 'string' ? 0 : o.count ?? 0 };
  });
}
const matches = (r: TypeRow, wanted: string) => !wanted || normalize(r.pt).includes(wanted) || normalize(r.en).includes(wanted);

/** Os tipos que batem com a busca, na ordem da tela: os do deck (mais cartas primeiro) e depois todos, pelo nome em português. */
export function typeMatches(q: FQuestion, query: string) {
  const wanted = normalize(query);
  const all = rows(q);
  const mine = all.filter(r => r.count > 0).sort((a, b) => b.count - a.count || a.pt.localeCompare(b.pt, 'pt-BR')).slice(0, MINE).filter(r => matches(r, wanted));
  const rest = all.filter(r => matches(r, wanted)).sort((a, b) => a.pt.localeCompare(b.pt, 'pt-BR'));
  return { mine, rest, total: all.length };
}

const chip = (r: TypeRow, mine: boolean) => `<button type="button" class="type-opt${mine ? ' mine' : ''}" data-q-opt="${r.i}">${esc(r.pt)}${r.pt !== r.en ? `<small>${esc(r.en)}</small>` : ''}${mine ? `<b aria-label="${r.count} ${r.count === 1 ? 'carta' : 'cartas'} no deck">${r.count}</b>` : ''}</button>`;

/** As duas listas (refeitas a cada letra digitada, sem redesenhar a busca). */
export function typeListsHTML(q: FQuestion, query: string) {
  const { mine, rest, total } = typeMatches(q, query);
  const searching = !!normalize(query);
  return `${mine.length ? `<p class="type-group">Do seu deck</p><div class="type-opts">${mine.map(r => chip(r, true)).join('')}</div>` : ''}
    <p class="type-group">${searching ? `Encontrados: ${rest.length}` : `Todos (${total})`}</p>
    <div class="type-opts all">${rest.map(r => chip(r, false)).join('') || '<span class="type-none">Nenhum tipo com esse nome.</span>'}</div>`;
}

export function typeChoiceHTML(q: FQuestion, query: string, cardName: string | undefined) {
  const title = `${cardName ? `${cardName}: ` : ''}${cardName ? 'escolha' : 'Escolha'} um tipo de criatura`;
  return `<div class="q-head"><h2>${esc(title)}</h2><button class="icon-btn q-minimize" data-ui="question-minimize" aria-label="Ver a mesa sem perder esta escolha">Ver a mesa</button></div>
    <form data-q-type><label class="q-search type-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg><input id="fQTypeSearch" type="search" value="${esc(query)}" placeholder="Buscar (Zumbi, zombie…)" aria-label="Buscar o tipo de criatura, em português ou em inglês" autocomplete="off" spellcheck="false"></label></form>
    <div id="fQTypes" aria-live="polite">${typeListsHTML(q, query)}</div>
    ${(q.min ?? 1) === 0 ? '<div class="q-actions"><button class="arena-btn secondary" data-q-none>Não escolher</button></div>' : ''}`;
}

/** Enter na busca: o primeiro tipo da tela (o do deck, se a busca bate com um). */
export function firstTypeMatch(q: FQuestion, query: string) {
  const { mine, rest } = typeMatches(q, query);
  return (mine[0] ?? rest[0])?.i;
}
