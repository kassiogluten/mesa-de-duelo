// A galeria das cartas da mesa: todas as cartas com arte própria, na ordem da série, e tocar numa abre o inspetor.
import './decks.css';
import './ownArtGallery.css';
import { cacheGet, fetchByNames } from '../scryfall';
import { ownArtCards } from '../scryfallCards';
import { esc } from './cardtext';
import { inspectCard } from './cardInspector';

/** Nome na mesa: o da impressão em português, quando o Scryfall tem. */
const label = (name: string) => cacheGet(name)?.pt?.name ?? name;

export function openOwnArtGallery() {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const cards = ownArtCards();
  const dlg = document.createElement('dialog');
  dlg.className = 'deck-preview dw-preview own-art-gallery'; dlg.setAttribute('aria-labelledby', 'oagTitle');
  const render = () => {
    dlg.innerHTML = `<header class="dp-head"><div><h2 id="oagTitle">Cartas da mesa</h2><p><span>${cards.length} cartas com arte feita para a mesa</span></p></div><button type="button" class="dp-close" data-close aria-label="Fechar a galeria">×</button></header>`
      + `<div class="dp-body"><ul class="oag-grid">${cards.map(c => `<li><button type="button" class="oag-card" data-card="${esc(c.name)}" aria-label="Ver ${esc(label(c.name))}"><img src="${esc(c.images.normal!)}" alt="" loading="lazy"><span>${esc(label(c.name))}</span></button></li>`).join('')}</ul></div>`
      + `<footer class="dp-foot"><button type="button" class="dw-button" data-close>Fechar</button></footer>`;
  };
  render();
  document.body.append(dlg);
  // Os nomes em português chegam com o Scryfall; sem resposta, ficam os nomes em inglês.
  fetchByNames(cards.map(c => c.name)).then(() => { if (dlg.open) render(); }, () => {});
  dlg.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-close]') || t === dlg) { dlg.close(); return; }
    const card = t.closest<HTMLElement>('[data-card]');
    const own = card && cards.find(c => c.name === card.dataset.card);
    // A arte da série, mesmo com Cartas da mesa desligada: a galeria é para ver a série.
    if (own) inspectCard({ name: own.name, image: own.images.normal }, card!);
  });
  dlg.addEventListener('close', () => { dlg.remove(); if (opener?.isConnected) opener.focus({ preventScroll: true }); });
  dlg.showModal();
}
