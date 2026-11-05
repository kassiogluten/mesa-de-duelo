import { KEYS } from '../storage';
export const SCREEN_WAKE_KEY = KEYS.awake;

/** Sem escolha guardada, a tela fica acesa: só "off" desliga. */
export function screenWakeEnabled(saved: string | null): boolean {
  return saved !== 'off';
}

type Sentinel = { released: boolean; release(): Promise<void>; addEventListener(type: 'release', fn: () => void): void };
type WakeLockApi = { request(type: 'screen'): Promise<Sentinel> };

/**
 * Tela acesa durante a partida (S18): pede ao aparelho para não apagar a tela enquanto a mesa está aberta.
 * O navegador solta a trava quando a aba some; ela é pedida de novo quando a aba volta a aparecer.
 */
function createScreenWake() {
  const api = (globalThis.navigator as Navigator & { wakeLock?: WakeLockApi } | undefined)?.wakeLock;
  let saved: string | null = null;
  try { saved = localStorage.getItem(SCREEN_WAKE_KEY); } catch { /* Storage is optional. */ }
  let active = false;
  let sentinel: Sentinel | null = null;
  let requesting = false;

  const wanted = () => active && screenWakeEnabled(saved) && !document.hidden;
  async function sync() {
    if (!api) return;
    if (!wanted()) {
      const held = sentinel; sentinel = null;
      await held?.release().catch(() => {});
      return;
    }
    if ((sentinel && !sentinel.released) || requesting) return;
    requesting = true;
    try {
      const got = await api.request('screen');
      got.addEventListener('release', () => { if (sentinel === got) sentinel = null; });
      sentinel = got;
      // Saiu da mesa enquanto o pedido estava no caminho.
      if (!wanted()) void sync();
    } catch { /* Bateria fraca ou aba escondida: tenta de novo na próxima vez que a aba aparecer. */ }
    finally { requesting = false; }
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { void sync(); });

  return {
    supported: !!api,
    get enabled() { return screenWakeEnabled(saved); },
    /** Liga enquanto há partida (ou mesa livre) na tela; desliga ao sair. */
    setActive(on: boolean) { active = on; void sync(); },
    setEnabled(on: boolean) {
      saved = on ? 'on' : 'off';
      try { localStorage.setItem(SCREEN_WAKE_KEY, saved); } catch { /* Storage is optional. */ }
      void sync();
    },
  };
}

export const screenWake = createScreenWake();
