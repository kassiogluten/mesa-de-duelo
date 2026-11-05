// O topo da mesa: a trilha de fases (com o retrato de quem joga o turno, as paradas no turno dos oponentes, o dia e a
// noite e os relógios), o contorno na metade da mesa de quem joga o turno e o nome dos ícones da trilha no toque.
import type { FPlayer, FState } from '../forge/client';
import type { OpponentStopsPreference } from './opponentStops';
import type { createStopMenu } from './passMenus';
import { phaseHudHTML } from './phaseHud';
import type { createTableClocks } from './tableClocks';
import type { TableCtx } from './tableContext';
import { turnHighlight } from './turnHighlight';

export interface PhasesDeps extends Pick<TableCtx, 'root' | '$' | 'setHTML' | 'portraits'> {
  opponentStops: OpponentStopsPreference;
  stops: ReturnType<typeof createStopMenu>;
  clocks: ReturnType<typeof createTableClocks>;
  /** O botão da mão automática, que mora ao lado do relógio do turno. */
  handAutoButton: HTMLElement;
}

export function createTablePhases(d: PhasesDeps) {
  const { root, $ } = d;
  /** O ícone da trilha com o nome à mostra (pela classe e pela fase, porque a trilha é redesenhada) e até quando. */
  let trailTip: { key: string; until: number } | null = null, trailTipTimer = 0;
  // Dia ou noite do último desenho da trilha: o sol ou a lua pulsa quando vira.
  let lastDayTime: FState['dayTime'];

  /** O ícone da trilha mais perto de um toque no espaço entre eles (a trilha tem 44 px de altura no toque). */
  function nearestTrailItem(x: number): HTMLElement | null {
    let best: HTMLElement | null = null, dist = Infinity;
    for (const el of root.querySelectorAll<HTMLElement>('#fPhases [data-tip]')) {
      const r = el.getBoundingClientRect(), dd = Math.abs(x - (r.left + r.width / 2));
      if (r.width && dd < dist) { best = el; dist = dd; }
    }
    return best;
  }
  const trailTipKey = (el: HTMLElement) => `${el.classList[0]}:${el.dataset.phase ?? ''}`;
  function syncTrailTip() {
    if (trailTip && trailTip.until < performance.now()) trailTip = null;
    for (const el of root.querySelectorAll<HTMLElement>('#fPhases [data-tip]')) el.classList.toggle('tip-open', trailTip?.key === trailTipKey(el));
  }
  function showTrailTip(el: HTMLElement) {
    const key = trailTipKey(el);
    trailTip = trailTip?.key === key ? null : { key, until: performance.now() + 3000 };
    clearTimeout(trailTipTimer);
    if (trailTip) trailTipTimer = window.setTimeout(syncTrailTip, 3050);
    syncTrailTip();
  }
  /**
   * Na trilha de fases, tocar num ícone sem ação (turno, relógios, dia e noite, fases) mostra o nome dele por um
   * instante: no toque não existe o passar do mouse. True quando o clique foi na trilha e já foi tratado.
   */
  function click(t: HTMLElement, e: MouseEvent) {
    let tipped = t.closest<HTMLElement>('#fPhases [data-tip]');
    if (!tipped && !t.closest('button') && t.closest('#fPhases')) tipped = nearestTrailItem(e.clientX);
    if (tipped && !t.closest('button')) {
      const button = tipped.querySelector<HTMLButtonElement>('button');
      if (button) button.click(); else showTrailTip(tipped);
      return true;
    }
    return false;
  }

  /** O contorno de quem joga o turno e a trilha de fases. */
  function render(visual: FState, me: FPlayer, opp: FPlayer, opponents: FPlayer[], multiplayer: boolean) {
    // De quem é o turno: etiqueta no trilho de fases e contorno na metade da mesa do jogador ativo (no Commander,
    // o assento do oponente da vez ganha o contorno no próprio desenho dos assentos).
    root.querySelector('.field.me')!.classList.toggle('turn', turnHighlight(visual, me.id) === 'mine');
    root.querySelector('.field.opp')!.classList.toggle('turn', !multiplayer && turnHighlight(visual, opp.id) === 'theirs');
    // Com vários jogadores, o retrato de quem joga o turno vai junto da trilha (mesmo índice dos retratos dos assentos).
    const activeSeat = !multiplayer ? -1 : visual.activePlayer === me.id ? 0 : opponents.findIndex(p => p.id === visual.activePlayer) + 1;
    const { opponentStops, stops } = d;
    d.setHTML($('#fPhases'), phaseHudHTML(visual, activeSeat >= 0 ? d.portraits()[activeSeat] : undefined, { value: opponentStops.supported ? opponentStops.value : [], editable: stops.editable(), open: stops.group }));
    // O botão da mão automática mora ao lado do relógio do turno; a trilha é redesenhada, então ele volta para lá.
    const phases = $('#fPhases'), handAuto = d.handAutoButton, timer = phases.querySelector('.phase-timer');
    if (timer && handAuto.previousElementSibling !== timer) timer.after(handAuto);
    syncTrailTip();
    if (lastDayTime && visual.dayTime && visual.dayTime !== lastDayTime) root.querySelector('.phase-daynight')?.classList.add('bump');
    lastDayTime = visual.dayTime;
    stops.place();
    d.clocks.sync(visual);
  }
  return { render, click };
}
