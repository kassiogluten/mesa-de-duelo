import type { DeckFormat } from '../decks';
import { esc } from './cardtext';
import './contaMenu.css';

/** A ordem dos botões da tela inicial (Commander, depois Outros, com o Commander Precon junto do Oathbreaker), com o Livre, onde vale quase tudo, no fim. */
export const FIT_ORDER: readonly DeckFormat[] = ['commander', 'standard', 'pauper', 'sacola50', 'oathbreaker', 'precon', 'free'];
export type FormatLabel = (format: DeckFormat) => string;

/** Os formatos em que o deck serve, na ordem da tela, sem o formato `except` (o que ele não serve). */
export const fitFormats = (fits: (format: DeckFormat) => boolean, except?: DeckFormat) => FIT_ORDER.filter(f => f !== except && fits(f));

/** "Standard", "Standard e Livre", "Standard, Pauper e Livre". */
export function listJoin(names: string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

/**
 * A linha que fica junto do deck escolhido quando ele não serve no formato: em que formatos ele serve.
 * `room`: o formato veio da sala e não pode ser trocado.
 */
export function deckFitText(format: DeckFormat, fitting: readonly DeckFormat[], label: FormatLabel, room = false): string {
  const where = room ? `${label(format)}, o formato da sala` : label(format);
  if (!fitting.length) return `Este deck não serve para ${where} nem para outro formato. Confira as cartas.`;
  if (fitting.length === 1 && fitting[0] === 'free') return `Este deck não serve para ${where}, só para o Livre.`;
  return `Este deck não serve para ${where}. Serve para ${listJoin(fitting.map(label))}.`;
}

export interface FormatPickerOptions {
  deckName: string;
  /** O formato escolhido, em que o deck não serve. */
  missing: DeckFormat;
  /** O formato que está valendo agora. */
  current: DeckFormat;
  fitting: readonly DeckFormat[];
  label: FormatLabel;
  /** Deck do jogador: oferece Editar quando ele só serve no Livre. */
  editable: boolean;
}
export type FormatPickerAnswer = { format: DeckFormat } | { action: 'edit' | 'peek' } | null;

/** O texto do seletor, separado para os testes. */
export function formatPickerHTML(o: FormatPickerOptions): string {
  const onlyFree = o.fitting.length === 1 && o.fitting[0] === 'free', none = !o.fitting.length;
  const text = none ? `Ele não serve em nenhum formato da mesa. Veja as cartas para achar o que precisa mudar.`
    : onlyFree ? `Ele só serve para o Livre, onde vale qualquer deck. Para jogar em ${esc(o.label(o.missing))}, ajuste o deck.`
    : `${o.fitting.length === 1 ? 'Ele serve para este formato.' : 'Ele serve para estes formatos.'} Para usar esse deck, clique abaixo no formato desejado.`;
  const formats = o.fitting.map(f => `<button type="button" data-fit-format="${f}">${esc(o.label(f))}${f === o.current ? '<small>atual</small>' : ''}</button>`).join('');
  const fix = onlyFree || none ? `<div class="fit-fix">${o.editable ? '<button type="button" class="ghost-btn" data-fit-action="edit">Editar</button>' : ''}<button type="button" class="ghost-btn" data-fit-action="peek">Ver as cartas</button></div>` : '';
  return `<h2 id="fitTitle">${esc(o.deckName)} não serve para ${esc(o.label(o.missing))}</h2>`
    + `<p id="fitText">${text}</p>${formats ? `<div class="fit-formats" role="group" aria-label="Formatos em que o deck serve">${formats}</div>` : ''}${fix}`
    + `<footer><button type="button" class="arena-btn primary" data-fit-close>Fechar</button></footer>`;
}

/** Seletor de formato com só os formatos em que o deck serve. Fechar sem escolher devolve `null`. */
export function openFormatPicker(o: FormatPickerOptions): Promise<FormatPickerAnswer> {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dlg = document.createElement('dialog');
  dlg.className = 'conta-dialogo format-picker';
  dlg.setAttribute('aria-labelledby', 'fitTitle'); dlg.setAttribute('aria-describedby', 'fitText');
  dlg.innerHTML = formatPickerHTML(o);
  document.body.append(dlg);
  return new Promise(resolve => {
    let answer: FormatPickerAnswer = null;
    dlg.addEventListener('click', e => {
      const target = e.target as HTMLElement;
      const format = target.closest<HTMLElement>('[data-fit-format]')?.dataset.fitFormat as DeckFormat | undefined;
      const action = target.closest<HTMLElement>('[data-fit-action]')?.dataset.fitAction as 'edit' | 'peek' | undefined;
      if (format) { answer = { format }; dlg.close(); }
      else if (action) { answer = { action }; dlg.close(); }
      else if (target.closest('[data-fit-close]') || target === dlg) dlg.close();
    });
    dlg.addEventListener('close', () => { dlg.remove(); if (!answer && opener?.isConnected) opener.focus({ preventScroll: true }); resolve(answer); });
    dlg.showModal();
    // O foco vai para o primeiro formato novo (o atual só fecharia o seletor).
    const first = [...dlg.querySelectorAll<HTMLElement>('[data-fit-format]')].find(b => b.dataset.fitFormat !== o.current) ?? dlg.querySelector<HTMLElement>('[data-fit-action], [data-fit-close]');
    first?.focus();
  });
}
