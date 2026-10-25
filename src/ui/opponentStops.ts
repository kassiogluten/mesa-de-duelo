import type { FPreferences } from '../forge/client';
import { esc } from './cardtext';

export const OPPONENT_STOPS_KEY = 'mesa:opponentStops';
/** Etapas do turno de um oponente que dão prioridade, na ordem do turno, com o grupo da trilha de fases. */
export const STOP_STEPS = [
  ['UPKEEP', 'Manutenção', 'start'],
  ['DRAW', 'Compra', 'start'],
  ['MAIN1', 'Principal 1', 'main1'],
  ['COMBAT_BEGIN', 'Início do combate', 'combat'],
  ['COMBAT_DECLARE_ATTACKERS', 'Atacantes', 'combat'],
  ['COMBAT_DECLARE_BLOCKERS', 'Bloqueadores', 'combat'],
  ['COMBAT_DAMAGE', 'Dano de combate', 'combat'],
  ['COMBAT_END', 'Fim do combate', 'combat'],
  ['MAIN2', 'Principal 2', 'main2'],
  ['END_OF_TURN', 'Etapa final', 'end'],
] as const;
export type StopStep = typeof STOP_STEPS[number][0];
const ORDER: readonly string[] = STOP_STEPS.map(([step]) => step);

/** As etapas válidas, sem repetição e na ordem do turno; null se o valor não é uma lista de etapas. */
export function normalizeStops(value: unknown): StopStep[] | null {
  if (!Array.isArray(value) || value.some(step => typeof step !== 'string' || !ORDER.includes(step))) return null;
  return ORDER.filter(step => value.includes(step)) as StopStep[];
}

/** Grupos da trilha de fases com alguma etapa marcada, e os nomes delas, para o selo e a dica. */
export function stopsByGroup(stops: readonly string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const [step, label, group] of STOP_STEPS) if (stops.includes(step)) groups.set(group, [...groups.get(group) ?? [], label]);
  return groups;
}

/** O jogo está segurando a prioridade para você: turno de outro jogador, numa etapa marcada, com a pilha vazia. */
export function holdingStop(state: { activePlayer: number | null; you: number; phase: string | null; stack: unknown[] }, stops: readonly string[]) {
  return state.activePlayer !== null && state.activePlayer !== state.you && !state.stack.length && !!state.phase && stops.includes(state.phase);
}

/** Botões das etapas nas opções da partida; `aria-pressed` diz quais estão marcadas. */
export function stopsOptionsHTML(stops: readonly string[], enabled: boolean): string {
  return STOP_STEPS.map(([step, label]) =>
    `<button type="button" class="stop-step" data-stop="${step}" aria-pressed="${stops.includes(step)}"${enabled ? '' : ' disabled'}>${esc(label)}</button>`).join('');
}

interface PreferenceStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
type SendPreference = (message: { type: 'preferences' } & Partial<FPreferences>) => void;

/**
 * Sincroniza com a ponte as etapas do turno dos oponentes em que o jogo segura a prioridade, como o
 * AutoPassPreference faz com os interruptores: a escolha do navegador vale primeiro e um eco antigo não a desfaz.
 */
export class OpponentStopsPreference {
  value: StopStep[] = [];
  supported = false;
  pending: StopStep[] | null = null;
  private applied = false;
  private hasLocalChoice = false;
  private storage?: PreferenceStorage;
  private send: SendPreference;

  constructor(send: SendPreference, storage?: PreferenceStorage) {
    this.send = send;
    try {
      this.storage = storage ?? globalThis.localStorage;
      const saved = this.storage?.getItem(OPPONENT_STOPS_KEY);
      const stops = saved === null || saved === undefined ? null : normalizeStops(safeParse(saved));
      if (stops) { this.value = stops; this.hasLocalChoice = true; }
    } catch { /* Browser storage is optional; retain the choice for this mounted table. */ }
  }

  reset() { this.supported = false; this.pending = null; this.applied = false; }

  observe(preferences: FPreferences | undefined, connected: boolean) {
    if (!connected) { this.reset(); return; }
    const confirmed = normalizeStops(preferences?.opponentStops);
    if (!confirmed) { this.supported = false; return; }
    this.supported = true;
    if (!this.applied) {
      if (!this.hasLocalChoice) this.value = confirmed;
      this.applied = true;
      this.dispatch();
    } else if (this.pending !== null) {
      if (same(confirmed, this.pending)) {
        this.pending = null;
        if (!same(confirmed, this.value)) this.dispatch();
      }
    } else if (!same(confirmed, this.value)) {
      this.value = confirmed;
      this.persist();
    }
  }

  toggle(step: string) {
    if (!this.supported || !ORDER.includes(step)) return;
    const next = this.value.includes(step as StopStep) ? this.value.filter(s => s !== step) : [...this.value, step];
    this.value = normalizeStops(next)!;
    this.persist();
    if (this.pending === null) this.dispatch();
  }

  private dispatch() {
    this.pending = [...this.value];
    this.send({ type: 'preferences', opponentStops: [...this.value] });
  }

  private persist() {
    this.hasLocalChoice = true;
    try { this.storage?.setItem(OPPONENT_STOPS_KEY, JSON.stringify(this.value)); } catch { /* Keep the in-memory choice. */ }
  }
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((step, i) => step === b[i]);
function safeParse(text: string): unknown { try { return JSON.parse(text); } catch { return null; } }
