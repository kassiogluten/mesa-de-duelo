// O que cada botão com `data-ui` faz na mesa, por grupo. O tratador de cliques (tableClicks.ts) consulta cada grupo no
// ponto do clique em que esses botões eram testados: a ordem entre os grupos e os outros cliques importa.
import { VERSION } from './changelog';
import { hideCardPreview } from './cardInspector';
import type { createAttackChoice } from './attackChoice';
import type { createErrorsPanel } from './errorsPanel';
import { toggleFullscreen } from './landscape';
import type { OpponentFocus } from './opponentFocus';
import type { createPassMenu } from './passMenus';
import type { createRemovalQueue } from './removalQueue';
import { screenWake } from './screenWake';
import { MATCH_SHORTCUTS, openShortcuts } from './shortcuts';
import type { TableCtx } from './tableContext';
import type { TableHand } from './tableHand';
import type { createTableSettings } from './tableSettings';
import type { createTurnBuzz } from './turnBuzz';
import type { createTurnNotice } from './turnNotice';
import { undoButtonState } from './undo';

export type UiAction = (t: HTMLElement, e: MouseEvent, ui: string) => void;
export type UiTable = Record<string, UiAction>;

/** Faz a ação do botão `ui` se ele estiver na tabela; false quando não está (o clique segue adiante). */
export function runUi(table: UiTable, ui: string | undefined, t: HTMLElement, e: MouseEvent) {
  if (!ui || !Object.hasOwn(table, ui)) return false;
  table[ui](t, e, ui);
  return true;
}

export interface UiActionDeps extends Pick<TableCtx, '$' | 'opts' | 'client' | 'state' | 'match' | 'audio' | 'render' | 'renderTable' | 'stopPresentation' | 'showPreview' | 'cardFromElement'> {
  attack: ReturnType<typeof createAttackChoice>;
  passMenu: ReturnType<typeof createPassMenu>;
  settings: ReturnType<typeof createTableSettings>;
  errors: ReturnType<typeof createErrorsPanel>;
  removals: ReturnType<typeof createRemovalQueue>;
  turnNotice: ReturnType<typeof createTurnNotice>;
  turnBuzz: ReturnType<typeof createTurnBuzz>;
  hand: TableHand;
  focus: OpponentFocus;
  setMenu(open: boolean, restore?: boolean): void;
  setLog(open: boolean, restore?: boolean): void;
  startPassingTurn(): void;
  toggleDetails(): void;
  minimizeQuestion(ui: string): void;
  closeStackGallery(): void;
  closeZone(): void;
}

export function createUiActions(d: UiActionDeps) {
  const { $ } = d;
  /** O nível de passar e o "Passar até o fim do turno". */
  const pass: UiTable = {
    // Nível de passar automaticamente: o selo abre a troca rápida; fora do menu, ele fecha.
    'pass-level': (_t, e) => { d.passMenu.set(!d.passMenu.open, e.detail === 0); },
    'pass-turn-shortcut': () => { d.startPassingTurn(); },
    'pass-turn-stop': () => { const client = d.client(); if (client?.connected && !d.match().disconnected) client.send({ type: 'pass-turn-stop' }); d.passMenu.set(false, true); },
  };
  /** O pedido e a pergunta: "Ver detalhes", "Ver a mesa" e o foco num oponente. */
  const prompt: UiTable = {
    'prompt-more': () => { d.toggleDetails(); d.renderTable(); },
    'question-minimize': (_t, _e, ui) => { d.minimizeQuestion(ui); },
    'question-restore': (_t, _e, ui) => { d.minimizeQuestion(ui); },
    'focus-close': () => { d.focus.close(); },
  };
  /** O que só muda a vista: o modo da mão, o tamanho da pilha e as setas das fileiras. */
  const view: UiTable = {
    'hand-auto': () => { d.hand.toggleAuto(); },
    'hand-toggle': () => { d.hand.toggleShown(); },
    'stack-size': () => { const match = d.match(); match.stackMinimized = !match.stackMinimized; hideCardPreview(true); d.renderTable(); },
    'row-scroll': (t) => {
      const control = t.closest<HTMLElement>('[data-scroll-row]')!;
      const row = document.getElementById(control.dataset.scrollRow!);
      if (row) row.scrollBy({ left: Number(control.dataset.scrollDirection) * Math.max(60, row.clientWidth * .75), behavior: 'smooth' });
    },
  };
  /** Os painéis: a galeria da pilha, as Opções e a troca com o sideboard. */
  const panel: UiTable = {
    'stack-close': () => { d.closeStackGallery(); },
    'stack-replay': (t) => {
      const pile = t.closest<HTMLElement>('[data-stack-replay]');
      if (pile) d.showPreview(d.cardFromElement(pile), pile, true);
    },
    'stack-open': () => {
      const s = d.state(), match = d.match();
      if (!s?.stack.length || s.question || s.gameOver || s.sideboarding || match.disconnected) return;
      d.stopPresentation(); hideCardPreview(true); match.stackGalleryOpen = true; d.renderTable();
      $('#fStackGallery').querySelector<HTMLElement>('.stack-gallery-card.actionable, .stack-gallery-card')?.focus({ preventScroll: true });
    },
    'settings': () => { const { settings } = d; settings.syncTurnNotice(); settings.syncPlaymat(); settings.syncDevice(); settings.set(true); },
    'awake': () => { screenWake.setEnabled(!screenWake.enabled); d.settings.syncDevice(); },
    'buzz': () => { d.turnBuzz.setEnabled(!d.turnBuzz.enabled); d.settings.syncDevice(); },
    'shortcuts': () => { openShortcuts(MATCH_SHORTCUTS); },
    'settings-close': () => { d.settings.set(false); },
    'playmat': () => { d.settings.togglePlaymat(); },
    'turn-notice': () => { void d.turnNotice.setEnabled(!d.turnNotice.enabled).then(d.settings.syncTurnNotice); },
    'mute': () => { d.audio.setMuted(!d.audio.settings.muted); d.settings.sync(); },
    'sideboard-ready': (_t, _e, ui) => {
      const client = d.client(), match = d.match();
      const sb = client?.state?.sideboarding;
      if (!client || !sb || sb.ready || match.sideboardBusy || !match.sideboardDraft || sb.id !== match.sideboardDraft.id) return;
      match.sideboardBusy = true; match.sideboardError = '';
      if (ui === 'next-game') client.send({ type: 'next-game', id: sb.id });
      else client.send({ type: 'sideboard', id: sb.id, deck: { name: 'Deck da partida', cards: match.sideboardDraft.main, sideboard: match.sideboardDraft.sideboard } });
      d.render();
    },
    'next-game': (t, e, ui) => panel['sideboard-ready'](t, e, ui),
  };
  /** As ações: o menu, o histórico e os erros, desfazer, sair, o resultado e as janelas de remoção e de zona. */
  const action: UiTable = {
    'removal-ok': () => { d.removals.close(); },
    'attack-clear': () => { d.attack.clear(); d.renderTable(); },
    'attack-remove': () => { const s = d.state(); if (s) d.attack.removeSelected(s); },
    'menu': () => { d.setMenu($('#fMenu').hidden); },
    'version': (t) => {
      // A versão da mesa vem do topo das Novidades; ao tocar, alterna para as versões que a ponte informou.
      const button = t.closest<HTMLElement>('[data-ui="version"]')!;
      const bridge = button.getAttribute('aria-pressed') !== 'true';
      const s = d.state();
      button.setAttribute('aria-pressed', String(bridge));
      button.textContent = bridge ? `Regras ${s?.rulesVersion ?? '?'} · Motor ${s?.engineVersion ?? '?'}` : `Mesa de Duelo ${VERSION}`;
    },
    'log': () => { d.errors.set(false); d.setLog($('#fLogDrawer').hidden, true); },
    'errors': () => { d.errors.set($('#fErrorsDrawer').hidden, true); },
    'feedback': () => { d.setMenu(false); d.opts.onFeedback?.({ kind: 'sugestao' }); },
    'watchable': () => { d.setMenu(false); const client = d.client(); const listed = !!client?.state?.audience?.listed; client?.send({ type: 'watchable', on: !listed }); },
    'result-report': () => { d.opts.onFeedback?.({ kind: 'erro' }); },
    'errors-report': () => { d.opts.onFeedback?.({ kind: 'erro', attach: true, diagnostics: d.errors.report() }); },
    'errors-download': () => { d.errors.download(); },
    'errors-clear': () => { d.errors.clear(); },
    'errors-copy': () => { d.errors.copy(); },
    'fullscreen': () => { void toggleFullscreen(); },
    'undo': () => { const client = d.client(), state = client?.state; if (state && !undoButtonState(state).disabled) client!.send({ type: 'undo-request' }); },
    'watch-player': (t) => {
      const client = d.client();
      const player = Number(t.closest<HTMLElement>('[data-player]')?.dataset.player);
      if (client?.state?.watching && Number.isInteger(player) && player !== client.state.you) client.send({ type: 'watch-player', player });
    },
    'exit': () => {
      const client = d.client();
      if (client?.state?.watching) { d.stopPresentation(); hideCardPreview(true); d.turnNotice.reset(); d.opts.onExit(); return; }
      if (client?.state?.gameOver || d.match().disconnected || confirm(client?.state?.room ? 'Desistir e sair da sala?' : 'Desistir desta partida?')) { d.stopPresentation(); hideCardPreview(true); d.turnNotice.reset(); client?.send({ type: 'concede' }); d.opts.onExit(); }
    },
    'lab-close': () => { if (d.state()?.gameOver || d.match().disconnected || confirm('Fechar a sala de teste? A partida acaba para os dois lados.')) { d.stopPresentation(); hideCardPreview(true); d.turnNotice.reset(); d.opts.onLabClose?.(); } },
    'rematch': () => { d.setMenu(false); d.opts.onRematch(); },
    'observe': (_t, _e, ui) => { const match = d.match(); match.observing = ui === 'observe'; d.render(); if (!d.match().observing) ($('#fOverlay').querySelector('[data-ui="observe"]') as HTMLElement | null)?.focus(); },
    'result': (t, e, ui) => action['observe'](t, e, ui),
    'zone-close': () => { d.closeZone(); },
  };
  return { pass, prompt, view, panel, action };
}
