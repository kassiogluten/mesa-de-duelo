// O selo de quadros por segundo e ping no canto da mesa (Opções > Aparência), com a cor de quanto a mesa e a conexão aguentam e, no automático, o degrau dos efeitos.
import { KEYS } from '../storage';
import { listenFrames, type FrameWindow } from './frameClock';
import { effectsLevel, effectsTier } from './gpu/gpuSupport';
import './perfMeter.css';

/** De quanto em quanto tempo o selo pede um ping (os quadros chegam a cada meio segundo, do frameClock.ts). */
const PING_EVERY_MS = 3000;

type Quality = 'good' | 'fair' | 'poor';
/** FPS: 50 ou mais é bom, de 30 a 49 é razoável, abaixo de 30 é ruim. */
export const fpsQuality = (fps: number): Quality => fps >= 50 ? 'good' : fps >= 30 ? 'fair' : 'poor';
/** Ping: abaixo de 100 ms é bom, até 250 ms é razoável, acima é ruim. */
export const pingQuality = (ms: number): Quality => ms < 100 ? 'good' : ms <= 250 ? 'fair' : 'poor';

export function perfMeterEnabled(): boolean {
  try { return localStorage.getItem(KEYS.perfMeter) === 'on'; } catch { return false; }
}

/**
 * Liga e desliga o selo; mede só com a mesa à vista e a aba aberta. `ping` mede a ida e volta até o servidor
 * (null sem conexão). `fps()` é a última medida, para a mesa poder aliviar os efeitos quando os quadros caem.
 */
export function createPerfMeter(root: HTMLElement, ping: () => Promise<number> | null) {
  const badge = document.createElement('div');
  badge.className = 'perf-meter';
  badge.setAttribute('aria-hidden', 'true');
  badge.innerHTML = '<span class="perf-fps"></span><span class="perf-ping"></span><span class="perf-tier"></span>';
  badge.hidden = true;
  root.querySelector('.arena')?.append(badge);
  const fpsEl = badge.querySelector<HTMLElement>('.perf-fps')!, pingEl = badge.querySelector<HTMLElement>('.perf-ping')!, tierEl = badge.querySelector<HTMLElement>('.perf-tier')!;

  let enabled = perfMeterEnabled(), unlisten: (() => void) | null = null, timer: ReturnType<typeof setInterval> | undefined;
  let lastFps = 0, pinging = false;

  function showFrames(w: FrameWindow) {
    lastFps = w.fps;
    fpsEl.textContent = `${w.fps} FPS`;
    fpsEl.dataset.quality = fpsQuality(w.fps);
    // O degrau do regulador (E0 tudo, E3 efeitos em CSS), só no automático.
    const auto = effectsLevel() === 'auto';
    tierEl.hidden = !auto;
    if (auto) tierEl.textContent = `E${effectsTier()}`;
  }
  function measurePing() {
    if (pinging || document.hidden) return;
    let pending: Promise<number> | null;
    try { pending = ping(); } catch { pending = null; }
    if (!pending) { showPing(null); return; }
    pinging = true;
    pending.then(ms => showPing(ms), () => showPing(null)).finally(() => { pinging = false; });
  }
  function showPing(ms: number | null) {
    pingEl.textContent = ms === null ? '— ms' : `${Math.round(ms)} ms`;
    if (ms === null) delete pingEl.dataset.quality; else pingEl.dataset.quality = pingQuality(ms);
  }

  function start() {
    if (unlisten) return;
    fpsEl.textContent = '— FPS'; delete fpsEl.dataset.quality; tierEl.hidden = true;
    unlisten = listenFrames(showFrames);
    measurePing();
    timer = setInterval(measurePing, PING_EVERY_MS);
  }
  function stop() {
    unlisten?.(); unlisten = null;
    clearInterval(timer); timer = undefined;
  }
  /** Mede só quando o selo aparece: ligado e com a mesa à vista. */
  function sync() {
    const on = enabled && !root.hidden;
    badge.hidden = !on;
    if (on) start(); else stop();
  }
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['hidden'] });
  sync();

  return {
    get enabled() { return enabled; },
    setEnabled(on: boolean) {
      enabled = on;
      try { if (on) localStorage.setItem(KEYS.perfMeter, 'on'); else localStorage.removeItem(KEYS.perfMeter); } catch { /* Storage is optional. */ }
      sync();
    },
    /** Quadros por segundo da última medida (0 com o selo desligado ou antes da primeira). */
    fps: () => unlisten ? lastFps : 0,
  };
}
