// Os relógios da trilha de fases (quanto dura o turno e a partida) e o alerta de espera demorada: o relógio de quem a mesa
// espera, o aviso em cima do próprio retrato e o selo "Demorando…" no retrato e no campo de quem passou de 5 minutos.
import type { FState } from '../forge/client';
import { turnTimeText } from './phaseHud';
import { WaitAnnouncer, WaitClock, waitClockTip, waitNudgeText, type SlowWait } from './waitAlert';

/** O que os relógios precisam da mesa: o estado ao vivo, se uma jogada está sendo mostrada, a conexão e o aviso falado. */
export interface ClockDeps {
  state(): FState | null | undefined;
  presenting(): boolean;
  disconnected(): boolean;
  announce(text: string): void;
  /** O toque curto de "sua vez", no volume dado. */
  cue(volume: number): void;
}

/** `sync` a cada desenho; depois disso o relógio anda sozinho a cada segundo até o jogo acabar ou a mesa sair da tela. */
export function createTableClocks(root: HTMLElement, d: ClockDeps) {
  // Relógio do turno: o servidor diz quanto o turno já durou (como no relógio da partida); numa ponte antiga, começa
  // quando a mesa vê o turno mudar (ou ao abrir a partida). Anda a cada segundo.
  let clockTurn = '', clockSince = 0, clockTimer: ReturnType<typeof setInterval> | undefined;
  // Relógio da partida: o servidor diz quanto o jogo já durou; só se reajusta se o atraso da rede passar de 2 s.
  let gameSince = 0, gameNumber = 0;
  // Alerta de espera demorada: o relógio de cada espera vem da ponte e só se ressincroniza quando chega um estado novo.
  const waitClock = new WaitClock(), waitAnnouncer = new WaitAnnouncer();
  let waitSynced: FState | null = null;
  /** Retrato e campo de quem está demorando (5 min ou mais) ganham o selo "Demorando…", para todos. */
  const markSlow = (w: SlowWait | null) => {
    const targets = new Set<HTMLElement>();
    if (w && w.stage >= 3) {
      root.querySelectorAll<HTMLElement>(`.avatar[data-pid="${w.player}"]`).forEach(el => targets.add(el));
      const field = root.querySelector<HTMLElement>(`#fField-${w.player}`)
        ?? (w.player === d.state()?.you ? root.querySelector<HTMLElement>('.field.me') : root.querySelector<HTMLElement>('.arena:not(.multiplayer) .field.opp'));
      if (field) targets.add(field);
    }
    root.querySelectorAll<HTMLElement>('.slow-wait').forEach(el => {
      if (targets.has(el)) return;
      el.classList.remove('slow-wait'); el.querySelector(':scope > [data-slow-badge]')?.remove();
    });
    for (const el of targets) {
      if (el.classList.contains('slow-wait') && el.querySelector(':scope > [data-slow-badge]')) continue;
      el.classList.add('slow-wait');
      el.insertAdjacentHTML('beforeend', `<span class="slow-badge${el.classList.contains('field') ? ' field-slow-badge' : ''}" data-slow-badge aria-hidden="true">Demorando…</span>`);
    }
  };
  const tickWait = () => {
    const s = d.state();
    // Durante a animação de uma jogada o alerta espera: a mesa ainda está mostrando o que aconteceu.
    const presenting = d.presenting();
    const w = s?.type === 'state' && !presenting && !d.disconnected() ? waitClock.current(s) : null;
    const shown = w && w.stage >= 1 ? w : null;
    const clock = root.querySelector<HTMLElement>('[data-wait-clock]');
    if (clock) {
      clock.hidden = !shown;
      if (shown) {
        clock.className = `phase-wait-clock stage-${shown.stage}${shown.mine ? ' mine' : ''}`;
        clock.dataset.tip = waitClockTip(shown);
        clock.querySelector('[data-wait-name]')!.textContent = shown.mine ? 'Você' : shown.name;
        clock.querySelector('[data-wait-time]')!.textContent = turnTimeText(shown.ms);
      }
    }
    // Aviso só para quem demora, em cima do próprio retrato: longe dos botões e das cartas.
    const text = waitNudgeText(w), own = root.querySelector<HTMLElement>('#fMeAvatar .avatar');
    root.querySelectorAll<HTMLElement>('[data-wait-nudge]').forEach(el => { if (!text || el.parentElement !== own) el.remove(); });
    if (text && own) {
      const nudge = own.querySelector<HTMLElement>(':scope > [data-wait-nudge]')
        ?? own.appendChild(Object.assign(document.createElement('span'), { className: 'wait-nudge' }));
      nudge.dataset.waitNudge = ''; nudge.setAttribute('aria-hidden', 'true');
      if (nudge.textContent !== text) nudge.textContent = text;
      nudge.classList.toggle('late', w!.stage >= 3);
    }
    markSlow(w);
    if (presenting) return;
    const step = waitAnnouncer.next(w);
    if (step?.text) d.announce(step.text);
    if (step?.sound) d.cue(.4);
  };
  const tickTurnClock = () => {
    const el = root.querySelector<HTMLElement>('[data-turn-timer]');
    if (root.isConnected) tickWait();
    if (!root.isConnected || !el) { clearInterval(clockTimer); clockTimer = undefined; return; }
    el.textContent = turnTimeText(Date.now() - clockSince);
    const game = root.querySelector<HTMLElement>('[data-match-timer]');
    if (game && gameSince) game.textContent = turnTimeText(Date.now() - gameSince);
  };
  const syncTurnClock = (s: Pick<FState, 'turn' | 'activePlayer' | 'gameOver' | 'match' | 'turnElapsedMs'>) => {
    const key = `${s.turn}:${s.activePlayer}`;
    if (key !== clockTurn) { clockTurn = key; clockSince = Date.now(); }
    // Durante a animação de um evento antigo a mesa mostra outro turno; o tempo do servidor é o do turno de agora.
    const live = d.state();
    if (s.turnElapsedMs != null && live?.turn === s.turn && live.activePlayer === s.activePlayer) {
      const since = Date.now() - s.turnElapsedMs;
      if (Math.abs(since - clockSince) > 2000) clockSince = since;
    }
    if (live && live !== waitSynced) { waitSynced = live; waitClock.sync(live); }
    const elapsed = s.match?.elapsedMs;
    if (elapsed == null) gameSince = 0;
    else {
      const since = Date.now() - elapsed;
      if (s.match!.gameNumber !== gameNumber || Math.abs(since - gameSince) > 2000) { gameNumber = s.match!.gameNumber; gameSince = since; }
    }
    tickTurnClock();
    if (!s.gameOver && !clockTimer) clockTimer = setInterval(tickTurnClock, 1000);
  };
  return { sync: syncTurnClock };
}


