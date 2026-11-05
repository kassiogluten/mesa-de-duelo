// Os dois menus pequenos junto da trilha e dos botões: a troca rápida do nível de passar automaticamente (com o atalho
// "Passar até o fim do turno") e as paradas no turno dos oponentes (um menu por grupo de fases da trilha).
import type { FState } from '../forge/client';
import { passMenuHTML, type PassLevelPreference } from './passLevel';
import { stopMenuHTML, type OpponentStopsPreference } from './opponentStops';
import { phaseGroupLabel } from './phaseHud';

const q = (root: HTMLElement, sel: string) => root.querySelector(sel) as HTMLElement;

/** O atalho "Passar até o fim do turno" agora: ligado, disponível (prioridade no turno de outro jogador), no seu turno ou fora da prioridade. */
export function passTurnShortcut(passingTurn: boolean, s: FState): 'on' | 'available' | 'mine' | 'off' {
  if (passingTurn) return 'on';
  if (!s.input.priority || !s.input.ok.enabled || s.input.paying || s.input.targeting || s.question || s.gameOver || s.spectating) return 'off';
  return s.activePlayer === s.you ? 'mine' : 'available';
}

/** O menu de troca rápida do nível, aberto pelo selo embaixo dos botões. */
export function createPassMenu(root: HTMLElement, d: { state(): FState | null | undefined; visible(s: FState): boolean; passLevel: PassLevelPreference; setHTML(el: HTMLElement, html: string): void }) {
  let open = false;
  const shortcut = (s: FState) => passTurnShortcut(d.passLevel.passingTurn, s);
  function sync() {
    const s = d.state();
    const menu = q(root, '#fPassMenu');
    if (!open || !s || !d.visible(s)) { if (!menu.hidden) set(false); return; }
    const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('#fPassMenu [data-pass-level], #fPassMenu [data-ui]');
    const key = focused?.dataset.passLevel ?? focused?.dataset.ui;
    d.setHTML(menu, passMenuHTML(d.passLevel.value, shortcut(s)));
    if (key) menu.querySelector<HTMLElement>(`[data-pass-level="${key}"], [data-ui="${key}"]`)?.focus({ preventScroll: true });
    place();
  }
  function set(next: boolean, focus = false) {
    const menu = q(root, '#fPassMenu');
    open = next;
    menu.hidden = !next;
    if (next) { sync(); if (focus) menu.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({ preventScroll: true }); }
    root.querySelector('[data-ui="pass-level"]')?.setAttribute('aria-expanded', String(next));
    if (!next && focus) root.querySelector<HTMLElement>('[data-ui="pass-level"]')?.focus({ preventScroll: true });
  }
  /** O menu abre acima do selo, alinhado pela direita, sem sair da tela. */
  function place() {
    const menu = q(root, '#fPassMenu');
    const anchor = root.querySelector<HTMLElement>('[data-ui="pass-level"]');
    if (!anchor || menu.hidden) return;
    const a = anchor.getBoundingClientRect(), m = menu.getBoundingClientRect(), gap = 8;
    const left = Math.min(Math.max(8, a.right - m.width), window.innerWidth - m.width - 8);
    const top = a.top - m.height - gap >= 8 ? a.top - m.height - gap : Math.min(a.bottom + gap, window.innerHeight - m.height - 8);
    menu.style.left = `${left}px`;
    menu.style.top = `${Math.max(8, top)}px`;
  }
  window.addEventListener('resize', place);
  return { get open() { return open; }, sync, set, shortcut };
}

/** As paradas no turno dos oponentes: o menu de um grupo de fases da trilha, aberto pelo ícone dele. */
export function createStopMenu(root: HTMLElement, d: { editable(): boolean; stops: OpponentStopsPreference; hasState(): boolean; render(): void }) {
  /** Grupo da trilha de fases com o menu de paradas aberto. */
  let group: string | null = null;
  function sync() {
    if (group && !d.editable()) { set(null); return; }
    // Só os atributos mudam: o botão que acabou de ser tocado continua com o foco.
    for (const button of q(root, '#fStopMenu').querySelectorAll<HTMLButtonElement>('[data-stop]'))
      button.setAttribute('aria-pressed', String((d.stops.value as string[]).includes(button.dataset.stop!)));
  }
  function set(next: string | null, focus = false) {
    const menu = q(root, '#fStopMenu');
    const previous = group;
    group = next;
    menu.hidden = !next;
    if (next) { menu.innerHTML = stopMenuHTML(next, phaseGroupLabel(next), d.stops.value); }
    if (d.hasState()) d.render();
    if (next) {
      place();
      if (focus) menu.querySelector<HTMLElement>('[data-stop]')?.focus({ preventScroll: true });
    } else if (focus && previous) root.querySelector<HTMLElement>(`[data-stop-group="${previous}"]`)?.focus({ preventScroll: true });
  }
  /** O menu abre acima do ícone (abaixo, quando a trilha está no alto da tela), sem sair da tela. */
  function place() {
    const menu = q(root, '#fStopMenu');
    const anchor = group ? root.querySelector<HTMLElement>(`[data-stop-group="${group}"]`) : null;
    if (!anchor || menu.hidden) return;
    const a = anchor.getBoundingClientRect(), m = menu.getBoundingClientRect(), gap = 10;
    const left = Math.min(Math.max(8, a.left + a.width / 2 - m.width / 2), window.innerWidth - m.width - 8);
    const above = a.top - m.height - gap >= 8;
    menu.style.left = `${left}px`;
    menu.style.top = `${above ? a.top - m.height - gap : a.bottom + gap}px`;
  }
  window.addEventListener('resize', place);
  return { get group() { return group; }, editable: d.editable, sync, set, place };
}
