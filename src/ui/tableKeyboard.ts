// O teclado na mesa: Esc fecha o que estiver na frente (na ordem: menus, janelas, seleções, a pergunta, o foco num
// oponente), Espaço aperta o botão de passar, "?" abre os atalhos, as setas andam nas abas do cemitério, no foco e na
// galeria da pilha, "i" inspeciona, Tab fica preso na janela aberta e Enter usa a carta com o foco.
import { hideCardPreview } from './cardInspector';
import type { createAttackChoice } from './attackChoice';
import type { createErrorsPanel } from './errorsPanel';
import type { OpponentFocus } from './opponentFocus';
import type { createPassMenu, createStopMenu } from './passMenus';
import type { createRemovalQueue } from './removalQueue';
import { isShortcutsKey, MATCH_SHORTCUTS, openShortcuts } from './shortcuts';
import type { TableCtx } from './tableContext';
import type { ModalFocus } from './tableModal';
import { INSPECTABLE } from './tablePreview';
import type { createTableSettings } from './tableSettings';

export interface KeyboardDeps extends Pick<TableCtx, 'root' | '$' | 'state' | 'match' | 'renderTable' | 'showPreview' | 'cardFromElement'> {
  modal: ModalFocus;
  focus: OpponentFocus;
  stops: ReturnType<typeof createStopMenu>;
  passMenu: ReturnType<typeof createPassMenu>;
  removals: ReturnType<typeof createRemovalQueue>;
  settings: ReturnType<typeof createTableSettings>;
  errors: ReturnType<typeof createErrorsPanel>;
  attack: ReturnType<typeof createAttackChoice>;
  setMenu(open: boolean, restore?: boolean): void;
  setLog(open: boolean, restore?: boolean): void;
  closeStackGallery(): void;
  closeZone(): void;
  /** Seta nas abas do cemitério: o cemitério do jogador `player`. */
  switchZonePlayer(player: number): void;
  questionMinimized(): boolean;
}

export function attachTableKeyboard(d: KeyboardDeps) {
  const { root, $ } = d;
  const inspectable = INSPECTABLE;
  root.addEventListener('keydown', e => {
    // Enter na busca de nomes escolhe o primeiro achado; a seta para baixo desce para a lista.
    if ((e.target as HTMLElement).id === 'fQNameSearch' && (e.key === 'Enter' || e.key === 'ArrowDown')) {
      const first = root.querySelector<HTMLElement>('#fQNames [data-q-opt]');
      if (!first) return;
      e.preventDefault();
      if (e.key === 'Enter') first.click(); else first.focus();
    }
  });
  // "?" abre a lista de atalhos, como no Gmail e no GitHub.
  document.addEventListener('keydown', e => {
    if (!isShortcutsKey(e) || !root.isConnected || root.closest('[hidden]')) return;
    e.preventDefault();
    openShortcuts(MATCH_SHORTCUTS);
  });
  // Foco que ficou num elemento por um clique (ou pela mesa redesenhada depois dele), não por Tab. O :focus-visible
  // não serve: o navegador o liga assim que se aperta uma tecla, inclusive o próprio Espaço.
  let pointing = false, pointerFocus: EventTarget | null = null;
  document.addEventListener('pointerdown', () => { pointing = true; }, true);
  document.addEventListener('keydown', () => { pointing = false; }, true);
  document.addEventListener('focusin', e => { pointerFocus = pointing ? e.target : null; });
  const mouseFocused = (el: HTMLElement) => el === pointerFocus;
  // Espaço aperta o botão de passar da caixa de ação (passar, resolver, confirmar), como no Arena.
  // Fica de fora quando o foco está num campo de texto, num controle que o teclado alcançou (o Espaço já é dele) ou
  // quando uma janela está aberta. O foco que sobra de um clique (o terreno virado para pagar) não conta.
  document.addEventListener('keydown', e => {
    if (e.key !== ' ' || e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    if (!root.isConnected || root.closest('[hidden]') || !d.state() || d.match().disconnected) return;
    const target = e.target as HTMLElement;
    if (target !== document.body && target.closest('input, textarea, select, [contenteditable]')) return;
    if (target !== document.body && target.closest('button, a, [role="button"], [tabindex]') && !mouseFocused(target)) return;
    if (d.modal.current() || document.querySelector('dialog[open], .feedback-overlay') || !$('#fMenu').hidden || !$('#fLogDrawer').hidden || !$('#fErrorsDrawer').hidden) return;
    // O botão de passar (OK, Resolver, "Para o combate"...): avança um passo. "Fim de turno" fica só no clique.
    const primary = root.querySelector<HTMLButtonElement>('#fAction .btns [data-act="ok"]:not(:disabled)');
    if (!primary) return;
    e.preventDefault();
    primary.click();
  });
  function escape(e: KeyboardEvent) {
    const { stops, passMenu, attack } = d, match = d.match();
    if (stops.group) { e.preventDefault(); stops.set(null, true); return; }
    if (passMenu.open) { e.preventDefault(); passMenu.set(false, true); return; }
    if (!$('#fRemoval').hidden) { e.preventDefault(); d.removals.close(); return; }
    if (!$('#fSettings').hidden) { e.preventDefault(); d.settings.set(false); return; }
    if (!$('#fMenu').hidden) { e.preventDefault(); d.setMenu(false, true); return; }
    if (!$('#fLogDrawer').hidden) { e.preventDefault(); d.setLog(false, true); return; }
    if (!$('#fErrorsDrawer').hidden) { e.preventDefault(); d.errors.set(false, true); return; }
    if (attack.selected.size || attack.pinned || attack.allGen !== null || attack.queue.queuedAttackers.length) { attack.clear(); e.preventDefault(); d.renderTable(); return; }
    if (match.selectedBlocker) { match.selectedBlocker = null; e.preventDefault(); d.renderTable(); return; }
    if (match.stackGalleryOpen) { e.preventDefault(); d.closeStackGallery(); return; }
    if (match.zoneOf !== null || match.groupIds) { d.closeZone(); return; }
    // Esc recolhe a escolha para ver a mesa, e o Esc seguinte a traz de volta.
    if (d.questionMinimized()) { e.preventDefault(); root.querySelector<HTMLElement>('[data-ui="question-restore"]')?.click(); return; }
    const currentModal = d.modal.current();
    const minimize = currentModal === $('#fQuestion') ? currentModal.querySelector<HTMLElement>('[data-ui="question-minimize"]') : null;
    if (minimize) { e.preventDefault(); minimize.click(); return; }
    if (d.focus.seat() !== null && !document.querySelector('dialog[open]')) { e.preventDefault(); d.focus.close(); return; }
    hideCardPreview(true);
  }
  // Sem foco em lugar nenhum (o botão que abriu a janela foi redesenhado, ou o clique foi num canto vazio), a tecla
  // vai para a página e não passaria pela mesa: o Esc ainda fecha o que estiver aberto.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.target !== document.body || !root.isConnected || root.closest('[hidden]') || document.querySelector('dialog[open], .feedback-overlay')) return;
    escape(e);
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') escape(e);
    const state = d.state(), match = d.match();
    // Abas do cemitério: as setas passam ao cemitério do jogador ao lado, e o foco vai junto.
    const zoneTab = (e.target as HTMLElement).closest<HTMLElement>('.zone-tab');
    if (zoneTab && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && state) {
      const tabs = [...root.querySelectorAll<HTMLElement>('#fZone .zone-tab')];
      const next = tabs[(tabs.indexOf(zoneTab) + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      e.preventDefault(); d.switchZonePlayer(+next.dataset.gy!);
      root.querySelector<HTMLElement>(`#fZone .zone-tab[data-gy="${d.match().zoneOf}"]`)?.focus();
      return;
    }
    const focusSeat = d.focus.seat();
    if (focusSeat !== null && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (e.target as HTMLElement).closest('.focus-head')) {
      const ids = (state?.players ?? []).filter(p => p.id !== state!.you && !p.eliminated).map(p => p.id);
      const next = ids[(ids.indexOf(focusSeat) + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length];
      if (next !== undefined && next !== focusSeat) { e.preventDefault(); d.focus.open(next); }
      return;
    }
    const target = e.target as HTMLElement;
    if (match.stackGalleryOpen && target.matches('.stack-gallery-card') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      const cards = [...$('#fStackGallery').querySelectorAll<HTMLElement>('.stack-gallery-card')];
      const index = cards.indexOf(target);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? cards.length - 1 : Math.max(0, Math.min(cards.length - 1, index + (e.key === 'ArrowRight' ? 1 : -1)));
      e.preventDefault(); cards[next]?.focus({ preventScroll: true }); cards[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); return;
    }
    if (e.key.toLowerCase() === 'i' && !target.matches('input,textarea,select')) {
      const el = target.closest<HTMLElement>(inspectable);
      if (el) { e.preventDefault(); d.showPreview(d.cardFromElement(el), el, true); return; }
    }
    const currentModal = d.modal.current();
    if (e.key === 'Tab' && currentModal) {
      const focusable = [...currentModal.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select,[tabindex="0"]')].filter(el => !el.closest('[hidden]'));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (first && e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (last && !e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    if (e.repeat) return;
    const el = target.closest<HTMLElement>('[data-mana],[data-ctr],[data-fid],[data-pid],[data-gy],[data-peek]');
    if (el && !el.matches('button') && (e.key === 'Enter' || (e.key === ' ' && !mouseFocused(target)))) { e.preventDefault(); el.click(); }
  });
}
