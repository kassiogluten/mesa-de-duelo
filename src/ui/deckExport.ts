import './decks.css';
import { exportDeckList, totalDeckSize, countEntries, type DeckData } from '../decks';
import { esc } from './cardtext';

export function download(text: string, name: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const deckFileName = (deck: DeckData) => `${deck.name.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 70) || 'deck'}.txt`;

/** A lista em texto, pronta para copiar ou baixar; abre por cima de quem chamou (inclusive da visualização do deck). */
export function openDeckExport(deck: DeckData) {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const text = exportDeckList(deck), side = countEntries(deck.sideboard ?? []);
  const dlg = document.createElement('dialog');
  dlg.className = 'deck-preview dw-preview dw-export'; dlg.setAttribute('aria-labelledby', 'dwExportTitle');
  dlg.innerHTML = `<header class="dp-head"><div><h2 id="dwExportTitle">Exportar lista</h2><p><span>${esc(deck.name)} · ${totalDeckSize(deck)} cartas${side ? ` · ${side} no sideboard` : ''}</span></p></div><button type="button" class="dp-close" data-close aria-label="Fechar exportação">×</button></header><div class="dp-body"><label class="dw-field">Lista em texto<textarea id="dwExportText" readonly rows="16" spellcheck="false">${esc(text)}</textarea></label><p class="dw-note">Nomes em inglês, no formato que o Moxfield, o Archidekt, o Arena e o MTGO importam, e também a importação daqui.</p><p class="dw-export-status" role="status"></p></div><footer class="dp-foot"><button type="button" class="dw-button" data-close>Fechar</button><button type="button" class="dw-button" data-download>Baixar .txt</button><button type="button" class="dw-button primary" data-copy>Copiar lista</button></footer>`;
  document.body.append(dlg);
  const area = dlg.querySelector<HTMLTextAreaElement>('#dwExportText')!, status = dlg.querySelector<HTMLElement>('.dw-export-status')!;
  const selectAll = () => { area.focus(); area.select(); };
  dlg.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    if (target === dlg || target.closest('[data-close]')) { dlg.close(); return; }
    if (target.closest('[data-download]')) { download(text, deckFileName(deck)); status.textContent = 'Arquivo baixado.'; return; }
    if (target.closest('[data-copy]')) {
      const fail = () => { selectAll(); status.textContent = 'Este navegador não deixou copiar. A lista está selecionada: copie com Ctrl+C (ou segure e escolha Copiar).'; };
      if (!navigator.clipboard) { fail(); return; }
      navigator.clipboard.writeText(text).then(() => { status.textContent = 'Lista copiada. É só colar onde quiser.'; }, fail);
    }
  });
  area.addEventListener('focus', () => area.select());
  dlg.addEventListener('close', () => { dlg.remove(); if (opener?.isConnected) opener.focus({ preventScroll: true }); });
  dlg.showModal();
  dlg.querySelector<HTMLElement>('[data-copy]')?.focus();
}
