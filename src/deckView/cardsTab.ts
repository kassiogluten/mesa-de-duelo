// A aba Cartas da tela do deck: as cartas agrupadas por tipo, em imagens ou em lista, com o botão de trocar a arte.
import { countEntries, entryKey, printLabel, type DeckData, type DeckEntry } from '../decks';
import { esc, manaHTML } from '../ui/cardtext';
import { groupedRows, type DeckRow } from '../ui/deckStats';
import type { DeckSection } from './artChoice';

export type CardsMode = 'images' | 'list';

function cardHTML(row: DeckRow, section: DeckSection, mode: CardsMode) {
  const name = row.info?.label ?? row.name, key = entryKey(row);
  const print = row.set ? ` data-set="${esc(row.set)}"${row.cn ? ` data-cn="${esc(row.cn)}"` : ''}` : '';
  const art = row.info ? `<button type="button" class="dv-art-btn" data-art="${esc(key)}" data-section="${section}" aria-label="Trocar a arte de ${esc(name)}">Arte</button>` : '';
  const printed = row.set ? `<small class="dv-print-label" title="Impressão escolhida">${esc(printLabel(row))}</small>` : '';
  if (mode === 'list') {
    return `<li class="dv-row"><button type="button" class="dv-row-main" data-inspect="${esc(row.name)}"${print}><span class="dv-n">${row.count}</span><span class="dv-row-name">${esc(name)}${printed}</span><span class="dv-cost">${row.info ? manaHTML(row.info.manaCost) : ''}</span></button>${art}</li>`;
  }
  const img = row.info?.image;
  return `<li class="dv-card"><button type="button" class="dv-card-img" data-inspect="${esc(row.name)}"${print} aria-label="Ler ${esc(name)}, ${row.count} ${row.count === 1 ? 'cópia' : 'cópias'}">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<span class="dv-card-blank">${esc(name)}</span>`}${row.count > 1 ? `<span class="dv-count">${row.count}×</span>` : ''}</button><p>${printed || '<small class="dv-print-label auto">Arte padrão</small>'}${art}</p></li>`;
}

function groupsHTML(entries: DeckEntry[], section: DeckSection, mode: CardsMode) {
  return groupedRows(entries).map(g => `<section class="dv-group"><h3>${g.label} <small>${countEntries(g.rows)}</small></h3><ul class="${mode === 'list' ? 'dv-rows' : 'dv-cards'}">${g.rows.map(r => cardHTML(r, section, mode)).join('')}</ul></section>`).join('');
}

/** As cartas em imagens ou em lista; `own` diz se o deck é do jogador (num deck pronto ou de outra pessoa, trocar a arte pede uma cópia). */
export function cardsHTML(deck: DeckData, mode: CardsMode, own: boolean) {
  const commanders = deck.commanders?.length
    ? `<section class="dv-group"><h3>${deck.format === 'oathbreaker' ? 'Zona de comando' : deck.commanders.length > 1 ? 'Comandantes' : 'Comandante'}</h3><ul class="${mode === 'list' ? 'dv-rows' : 'dv-cards'}">${groupedRows(deck.commanders).flatMap(g => g.rows).map(r => cardHTML(r, 'commanders', mode)).join('')}</ul></section>` : '';
  const toggle = `<div class="dv-cards-bar"><div class="dv-seg" role="group" aria-label="Mostrar as cartas"><button type="button" data-cards-mode="images" aria-pressed="${mode === 'images'}">Imagens</button><button type="button" data-cards-mode="list" aria-pressed="${mode === 'list'}">Lista</button></div><p class="dv-note">${own ? 'Toque em <b>Arte</b> para escolher a coleção de uma carta: na partida, todos veem a arte escolhida.' : 'Para trocar a arte de uma carta, faça uma cópia sua do deck (o botão <b>Arte</b> já oferece).'}</p></div>`;
  return `${toggle}${commanders}${groupsHTML(deck.cards, 'cards', mode)}${deck.sideboard?.length ? `<h2 class="dv-side-title">Sideboard <small>${countEntries(deck.sideboard)}</small></h2>${groupsHTML(deck.sideboard, 'sideboard', mode)}` : ''}`;
}
