import { esc, pip } from './cardtext';

/*
 * Comum às listas de decks (escolha do deck na tela inicial e Meus decks): o nome do comandante no cartão,
 * o filtro de cores com várias seleções e a busca que também acha o deck pelo comandante.
 */

export type ColorFilter = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';
export const FILTER_COLORS: ColorFilter[] = ['W', 'U', 'B', 'R', 'G', 'C'];
const COLOR_NAME: Record<ColorFilter, string> = { W: 'branco', U: 'azul', B: 'preto', R: 'vermelho', G: 'verde', C: 'incolor' };

interface DeckLike { name: string; commanders?: { name: string }[] }

/** Comandantes do deck pelo nome que a mesa mostra (português quando houver), parceiros juntos com "+". */
export function commanderNames(deck: DeckLike, translate: (name: string) => string = n => n) {
  return (deck.commanders ?? []).map(c => translate(c.name)).join(' + ');
}

/**
 * O deck tem todas as cores marcadas (marcar mais cores estreita a lista). "Incolor" mostra os decks sem cor.
 * Sem nada marcado, todos passam.
 */
export function matchesColors(deckColors: string[], selected: ReadonlySet<ColorFilter>) {
  if (!selected.size) return true;
  if (selected.has('C')) return deckColors.length === 0;
  return [...selected].every(c => deckColors.includes(c));
}

/** Busca pelo nome do deck ou pelo comandante (em português ou inglês). */
export function matchesQuery(deck: DeckLike, query: string, translate: (name: string) => string = n => n) {
  const q = query.trim().toLocaleLowerCase('pt-BR');
  if (!q) return true;
  const names = [deck.name, ...(deck.commanders ?? []).flatMap(c => [c.name, translate(c.name)])];
  return names.some(n => n.toLocaleLowerCase('pt-BR').includes(q));
}

/** Marcar "Incolor" tira as cores, e marcar uma cor tira "Incolor": os dois juntos não achariam nada. */
export function toggleColor(selected: Set<ColorFilter>, color: ColorFilter) {
  const next = new Set(selected);
  if (next.has(color)) next.delete(color);
  else if (color === 'C') { next.clear(); next.add('C'); }
  else { next.delete('C'); next.add(color); }
  return next;
}

/** Botões de cor (cada um liga e desliga) e "Limpar". `attr` identifica os botões na tela que os usa. */
export function colorFilterHTML(selected: ReadonlySet<ColorFilter>, attr: string) {
  return `<div class="color-filter" role="group" aria-label="Filtrar por cor">
    ${FILTER_COLORS.map(c => `<button type="button" class="color-filter-btn" ${attr}="${c}" aria-pressed="${selected.has(c)}" aria-label="${c === 'C' ? 'Só decks incolores' : `Decks com ${COLOR_NAME[c]}`}" title="${c === 'C' ? 'Incolor' : COLOR_NAME[c][0].toUpperCase() + COLOR_NAME[c].slice(1)}">${pip(c)}</button>`).join('')}
    ${selected.size ? `<button type="button" class="color-filter-clear" ${attr}="clear">Limpar cores</button>` : ''}
  </div>`;
}

/** Linha do comandante no cartão do deck (vazia fora do Commander). */
export function commanderLineHTML(deck: DeckLike, translate?: (name: string) => string, cls = 'deck-commander') {
  const names = commanderNames(deck, translate);
  return names ? `<span class="${cls}" title="Comandante"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z" fill="currentColor"/></svg><span class="sr-only">Comandante: </span>${esc(names)}</span>` : '';
}
