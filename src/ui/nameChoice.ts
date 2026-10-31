import type { FQuestion } from '../forge/client';
import { esc } from './cardtext';
import { normalize } from './choiceFilters';

/*
 * Nomear uma carta (Pithing Needle, Meddling Mage, Cabal Therapy...): o Forge manda todos os nomes do jogo, dezenas de
 * milhares. A mesa não desenha a lista: mostra uma busca e só os primeiros nomes que batem com o que foi digitado.
 */

/** Sem o aviso da ponte, uma lista de uma escolha só, sem cartas e com tantas opções assim, também vira busca. */
export const NAME_CHOICE_FROM = 100;
/** Quantos nomes aparecem de cada vez; o resto pede para continuar digitando. */
export const NAME_RESULTS = 40;

const optionText = (o: NonNullable<FQuestion['options']>[number]) => (typeof o === 'string' ? o : o.label);

export function isNameChoice(q: FQuestion) {
  if (q.kind !== 'choose' || (q.max ?? 1) !== 1) return false;
  if (q.purpose === 'card-name') return true;
  const opts = q.options ?? [];
  return !q.purpose && opts.length >= NAME_CHOICE_FROM && opts.every(o => typeof o === 'string' || !o.card);
}

/** Texto de busca de cada opção (nome e, quando já conhecida, a tradução), montado uma vez por pergunta. */
let searchIndex: { id: number; size: number; keys: string[] } | null = null;
function keysFor(q: FQuestion, translated: (name: string) => string | undefined) {
  const opts = q.options ?? [];
  if (searchIndex?.id !== q.id || searchIndex.size !== opts.length) {
    searchIndex = { id: q.id, size: opts.length, keys: opts.map(o => { const name = optionText(o); return normalize(`${name}\u0000${translated(name) ?? ''}`); }) };
  }
  return searchIndex.keys;
}

export interface NameMatches { indices: number[]; total: number; all: number }

/** Nomes que contêm o texto: primeiro os que começam com ele, depois os que têm uma palavra começando com ele, depois o resto. */
export function nameMatches(q: FQuestion, query: string, translated: (name: string) => string | undefined = () => undefined, limit = NAME_RESULTS): NameMatches {
  const opts = q.options ?? [];
  const wanted = normalize(query);
  if (!wanted) return { indices: [], total: 0, all: opts.length };
  const keys = keysFor(q, translated);
  const found: { i: number; rank: number }[] = [];
  keys.forEach((key, i) => {
    const at = key.indexOf(wanted);
    if (at < 0) return;
    const rank = at === 0 || key.includes(`\u0000${wanted}`) ? 0 : key.includes(` ${wanted}`) ? 1 : 2;
    found.push({ i, rank });
  });
  found.sort((a, b) => a.rank - b.rank || optionText(opts[a.i]).localeCompare(optionText(opts[b.i]), 'pt-BR'));
  return { indices: found.slice(0, limit).map(f => f.i), total: found.length, all: opts.length };
}

export function nameStatus(m: NameMatches, query: string) {
  if (!normalize(query)) return `Digite parte do nome para buscar entre ${m.all.toLocaleString('pt-BR')} cartas.`;
  if (!m.total) return 'Nenhuma carta com esse nome.';
  if (m.total > m.indices.length) return `Mostrando ${m.indices.length} de ${m.total.toLocaleString('pt-BR')}. Continue digitando para achar a carta.`;
  return m.total === 1 ? '1 carta.' : `${m.total} cartas.`;
}

/** Botões dos nomes achados, com a tradução embaixo quando a mesa já a conhece. */
export function nameListHTML(q: FQuestion, m: NameMatches, translated: (name: string) => string | undefined = () => undefined) {
  const opts = q.options ?? [];
  return m.indices.map(i => {
    const name = optionText(opts[i]);
    const pt = translated(name);
    return `<li><button type="button" class="q-name" data-q-opt="${i}"><strong>${esc(name)}</strong>${pt && pt !== name ? `<small>${esc(pt)}</small>` : ''}</button></li>`;
  }).join('');
}

export function nameChoiceHTML(q: FQuestion, head: string, query: string, translated: (name: string) => string | undefined = () => undefined) {
  const m = nameMatches(q, query, translated);
  return `${head}
    <label class="q-search q-name-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg><input id="fQNameSearch" type="search" value="${esc(query)}" placeholder="Nome da carta" aria-label="Buscar o nome da carta, em inglês" aria-describedby="fQNameStatus" autocomplete="off" spellcheck="false"></label>
    <p class="q-tools-status" id="fQNameStatus" aria-live="polite">${esc(nameStatus(m, query))}</p>
    <ul class="q-names" id="fQNames" aria-label="Cartas encontradas">${nameListHTML(q, m, translated)}</ul>
    ${(q.min ?? 1) === 0 ? '<div class="q-actions"><button class="arena-btn secondary" data-q-none>Nenhum</button></div>' : ''}`;
}
