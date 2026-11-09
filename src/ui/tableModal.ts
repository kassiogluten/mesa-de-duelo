// A janela da frente na mesa (pergunta, voto, resultado, zona, galeria da pilha, foco num oponente, Opções): o resto
// da mesa fica inerte, o foco vai para dentro e volta para onde estava quando ela fecha. E o foco que sobrevive a um
// redesenho: o controle com foco antes do desenho recebe o foco de novo no elemento novo igual a ele.
import type { TableCtx } from './tableContext';

export interface ModalDeps extends Pick<TableCtx, 'root' | '$'> {
  /** A pergunta está recolhida ("Ver a mesa"): não conta como janela. */
  questionMinimized(): boolean;
}

/** Atributos que identificam um controle da mesa entre um desenho e outro. */
const FOCUS_KEYS = ['data-ui', 'data-act', 'data-inspect', 'data-fid', 'data-pid', 'data-mana', 'data-ctr', 'data-event', 'data-log-toggle', 'data-stack', 'data-stack-inspect', 'data-peek', 'data-q-opt', 'data-q-filter', 'data-q-sort', 'data-lib-place', 'data-lib-move', 'data-pile-move', 'data-pile-pick', 'data-q-confirm', 'data-q-submit', 'data-q-none', 'data-q-keep', 'data-q-amount', 'data-trigger', 'data-trigger-undo', 'data-trigger-confirm', 'data-cd-add', 'data-cd-sub', 'data-cd-lethal', 'data-cd-auto', 'data-cd-confirm', 'data-group', 'data-stop-group', 'data-sb-main', 'data-sb-side'];

export type FocusSnapshot = { selector: string; start: number | null; end: number | null } | null;

export function createModalFocus(d: ModalDeps) {
  const { root, $ } = d;
  let returnFocus: HTMLElement | null = null;
  let currentModal: HTMLElement | null = null;

  function snapshot(): FocusSnapshot {
    const el = document.activeElement as HTMLElement | null;
    if (!el || !root.contains(el)) return null;
    const attr = FOCUS_KEYS.find(key => el.hasAttribute(key));
    const scope = el.parentElement?.closest('[id]')?.id;
    const selector = el.id ? `#${CSS.escape(el.id)}` : attr ? `${scope ? `#${CSS.escape(scope)} ` : ''}[${attr}="${CSS.escape(el.getAttribute(attr)!)}"]` : null;
    return selector ? { selector, start: el instanceof HTMLInputElement ? el.selectionStart : null, end: el instanceof HTMLInputElement ? el.selectionEnd : null } : null;
  }
  function restore(saved: FocusSnapshot) {
    if (!saved || (document.activeElement !== document.body && document.activeElement?.isConnected)) return;
    const next = root.querySelector<HTMLElement>(saved.selector);
    if (!next || next.closest('[hidden]') || (next as HTMLButtonElement).disabled) return;
    next.focus({ preventScroll: true });
    if (next instanceof HTMLInputElement && saved.start !== null && saved.end !== null && next.type !== 'number') next.setSelectionRange(saved.start, saved.end);
  }
  function sync() {
    // Com o foco num oponente, a decisão que chegar espera atrás dele (a tela avisa); só o que se abre dali (cemitério, exílio) vem na frente.
    const focusOpen = !$('#fFocus').hidden;
    const required = (focusOpen ? ['#fZone'] : ['#fVote', '#fOverlay', '#fQuestion', '#fZone', '#fStackGallery', '#fRemoval', '#fReveal']).map(id => $(id)).find(el => !el.hidden && !(el.id === 'fQuestion' && d.questionMinimized())) ?? (focusOpen ? $('#fFocus') : null);
    if (required && !$('#fSettings').hidden) {
      $('#fSettings').hidden = true;
      root.querySelector('[aria-controls="fSettings"]')?.setAttribute('aria-expanded', 'false');
    }
    const active = required ?? (!$('#fSettings').hidden ? $('#fSettings') : null);
    const previousModal = currentModal;
    if (active !== currentModal) {
      if (!currentModal && active) returnFocus = document.activeElement as HTMLElement | null;
      currentModal = active;
    }
    root.querySelectorAll<HTMLElement>('.arena > *').forEach(el => { el.inert = !!active && el !== active; });
    if (!active && previousModal && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    if (active && !active.contains(document.activeElement) && !document.querySelector('dialog[open]')) {
      start(active)?.focus({ preventScroll: true });
    }
  }
  /** Onde o foco começa numa janela: a escolha principal (o modo recomendado, o primeiro gatilho, o botão de confirmar
   *  quando não há opções a marcar), para o Espaço apertá-la; senão, o primeiro controle. Nunca o "Ver a mesa", que fica no Esc. */
  function start(active: HTMLElement) {
    return active.querySelector<HTMLElement>('[data-vote-start], .play-mode-option.recommended, [data-trigger], [data-cd-confirm]:not(:disabled), [data-ui="removal-ok"], [data-ui="reveal-ok"]')
      ?? (active.querySelector('[data-q-opt]') ? null : active.querySelector<HTMLElement>('.q-actions .arena-btn.primary:not(:disabled)'))
      ?? [...active.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), input, [tabindex="0"]')].find(el => !el.matches('[data-ui="question-minimize"]'));
  }
  return { snapshot, restore, sync, start, current: () => currentModal };
}
export type ModalFocus = ReturnType<typeof createModalFocus>;
