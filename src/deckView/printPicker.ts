// A janela de trocar a arte de uma carta: as impressões que a partida mostra, da mais nova para a mais antiga, com filtro por coleção.
import { esc } from '../ui/cardtext';
import { images } from '../scryfallCards';
import { cardPrints, type CardPrint } from './api';
import { printPrice, printTraits } from './artChoice';

export interface PrintPickerOptions {
  /** Nome que o jogador vê (em português, quando há). */
  label: string;
  /** Nome Oracle e oracle_id da carta. */
  name: string;
  oracleId: string;
  /** A imagem que a carta mostra sem escolha (a arte padrão da mesa). */
  defaultImage?: string;
  current?: { set: string; cn?: string };
  onPick(print: CardPrint | null): void;
}

const year = (p: CardPrint) => p.released?.slice(0, 4) ?? '';

export function openPrintPicker(opts: PrintPickerOptions) {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dlg = document.createElement('dialog');
  dlg.className = 'dw-preview dv-prints';
  dlg.setAttribute('aria-label', `Arte de ${opts.label}`);
  dlg.innerHTML = `<header><div><p class="dw-eyebrow">Trocar arte</p><h2>${esc(opts.label)}</h2><p class="dv-note">A arte escolhida fica no deck: na partida, todos veem a mesma. Aparecem só as impressões que a partida conhece.</p></div><button type="button" class="dp-close" data-close aria-label="Fechar">×</button></header><label class="dv-prints-filter" hidden>Coleção<input type="search" placeholder="Nome ou código da coleção" data-filter></label><div class="dv-prints-grid" role="listbox" aria-label="Impressões"><p class="dv-loading">Buscando as artes…</p></div>`;
  document.body.append(dlg);
  let prints: CardPrint[] = [];
  let query = '';
  const grid = dlg.querySelector<HTMLElement>('.dv-prints-grid')!;
  const isCurrent = (p: CardPrint | null) => p ? opts.current?.set === p.set && (opts.current.cn ?? '') === p.cn : !opts.current;

  function option(p: CardPrint | null) {
    const img = p ? images(p.image)?.small : opts.defaultImage;
    const title = p ? `${p.setName ?? p.set.toUpperCase()}` : 'Arte padrão da mesa';
    const meta = p ? [`${p.set.toUpperCase()} ${p.cn}`, year(p), ...printTraits(p), printPrice(p)].filter(Boolean).join(' · ') : 'A que a mesa mostra sem escolha';
    const current = isCurrent(p);
    return `<button type="button" class="dv-print${current ? ' current' : ''}" role="option" aria-selected="${current}" ${p ? `data-set="${esc(p.set)}" data-cn="${esc(p.cn)}"` : 'data-default'} title="${esc(p?.artist ? `Arte de ${p.artist}` : title)}">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : '<span class="dv-print-blank"></span>'}<b>${esc(title)}</b><small>${esc(meta)}</small>${current ? '<i class="dv-print-tag">Escolhida</i>' : ''}</button>`;
  }
  function render() {
    const q = query.trim().toLowerCase();
    const shown = q ? prints.filter(p => p.set.includes(q) || (p.setName ?? '').toLowerCase().includes(q)) : prints;
    grid.innerHTML = `${q ? '' : option(null)}${shown.map(option).join('')}${!shown.length ? `<p class="dv-note">${q ? 'Nenhuma coleção com esse nome.' : 'A partida só conhece a arte padrão desta carta.'}</p>` : ''}`;
  }
  cardPrints(opts.oracleId, opts.name).then(list => {
    prints = list;
    dlg.querySelector<HTMLElement>('.dv-prints-filter')!.hidden = list.length < 12;
    if (dlg.open) render();
  }, (e: Error) => { grid.innerHTML = `<p class="dw-error" role="alert">${esc(e.message)}</p>`; });

  dlg.addEventListener('input', e => { const t = e.target as HTMLInputElement; if (t.matches('[data-filter]')) { query = t.value; render(); } });
  dlg.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    if (target === dlg || target.closest('[data-close]')) { dlg.close(); return; }
    const pick = target.closest<HTMLElement>('.dv-print');
    if (!pick) return;
    const print = pick.dataset.default !== undefined ? null : prints.find(p => p.set === pick.dataset.set && p.cn === pick.dataset.cn) ?? null;
    dlg.close();
    if (!isCurrent(print)) opts.onPick(print);
  });
  dlg.addEventListener('close', () => { dlg.remove(); if (opener?.isConnected) opener.focus({ preventScroll: true }); });
  dlg.showModal();
}
