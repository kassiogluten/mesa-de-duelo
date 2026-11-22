// Confirmação do Excluir de Meus decks: nome e total de cartas do deck, com "Voltar" em foco.
import './decks.css';
import { totalDeckSize, countEntries, type DeckData } from '../decks';
import { esc } from './cardtext';

/** Pergunta se exclui o deck. "Voltar" vem em foco: na dúvida, nada é apagado. */
export function confirmDeckDelete(deck: DeckData): Promise<boolean> {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const side = countEntries(deck.sideboard ?? []);
  const dlg = document.createElement('dialog');
  dlg.className = 'deck-preview dw-preview dw-delete';
  dlg.setAttribute('aria-labelledby', 'dwDeleteTitle'); dlg.setAttribute('aria-describedby', 'dwDeleteText');
  dlg.innerHTML = `<header class="dp-head"><div><h2 id="dwDeleteTitle">Excluir este deck?</h2><p><span>${esc(deck.name || 'Deck sem nome')} · ${totalDeckSize(deck)} cartas${side ? ` · ${side} no sideboard` : ''}</span></p></div><button type="button" class="dp-close" data-dd="back" aria-label="Voltar sem excluir">×</button></header>`
    + `<div class="dp-body"><p id="dwDeleteText">Ele sai de Meus decks. Logo depois, ainda dá para desfazer.</p></div>`
    + `<footer class="dp-foot"><button type="button" class="dw-button danger" data-dd="delete">Excluir deck</button><button type="button" class="dw-button primary" data-dd="back">Voltar</button></footer>`;
  document.body.append(dlg);
  return new Promise(resolve => {
    let confirmed = false;
    dlg.addEventListener('click', e => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-dd]');
      if (btn) { confirmed = btn.dataset.dd === 'delete'; dlg.close(); }
      else if (e.target === dlg) dlg.close();
    });
    dlg.addEventListener('close', () => { dlg.remove(); if (!confirmed && opener?.isConnected) opener.focus({ preventScroll: true }); resolve(confirmed); });
    dlg.showModal();
    dlg.querySelector<HTMLElement>('.dp-foot [data-dd="back"]')?.focus();
  });
}
