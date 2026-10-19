import type { FCard, FState, FTargets } from '../forge/client';

/** Public, immutable board view at an engine event boundary. Never contains a hand or prompt. */
export interface PresentationFrame {
  players: { id: number; life: number; battlefield: FCard[]; handCount: number; library: number }[];
  stack: FState['stack'];
  combat?: FState['combat'];
  turn: number;
  phase: string | null;
  activePlayer: number | null;
}
export interface PresentationEvent {
  seq: number;
  type: string;
  actor?: number;
  card?: FCard;
  cards?: number[];
  sourceId?: number;
  stackId?: number;
  /** Habilidade desencadeada (gatilho), e não ativada por um jogador. */
  trigger?: boolean;
  targets?: FTargets;
  text?: string;
  from?: string;
  to?: string;
  delta?: number;
  /** Dano (`damage`): o que a ponte diz sobre o golpe. */
  combat?: boolean;
  step?: 'first-strike' | 'regular';
  doubleStrike?: boolean;
  trample?: boolean;
  deathtouch?: boolean;
  lifelink?: boolean;
  infect?: boolean;
  wither?: boolean;
  loyalty?: boolean;
  commander?: boolean;
  self?: boolean;
  lethal?: boolean;
  prevented?: boolean;
  /** Só na mesa: quantos alvos o mesmo dano dividido atinge junto (vários `damage` seguidos da mesma fonte). */
  divided?: number;
  reason?: 'destroyed' | 'sacrificed';
  stateVersion?: number;
  frame?: PresentationFrame;
}
export interface PresentationEntry { event: PresentationEvent; audible: boolean; audioOnly?: boolean }
const HISTORY_LIMIT = 60;
const QUEUE_LIMIT = 12;
const CATCH_UP_LIMIT = 4;
const AUDIO_QUEUE_LIMIT = 4;
// Ordinary draws and priority changes should not turn a board game into an activity feed.
const PRESENTABLE = new Set(['land-played', 'spell-cast', 'ability-activated', 'resolved', 'countered', 'entered', 'left', 'attackers', 'blockers', 'damage', 'life-changed', 'turn']);
const AUDIO_ONLY = new Set(['draw']);

function sameLandTransition(a: PresentationEvent, b: PresentationEvent) {
  const entry = a.type === 'entered' ? a : b.type === 'entered' ? b : null;
  const played = a.type === 'land-played' ? a : b.type === 'land-played' ? b : null;
  return !!entry && !!played && entry.from === 'Hand' && entry.to === 'Battlefield' &&
    (entry.card?.id ?? entry.sourceId) !== undefined && (entry.card?.id ?? entry.sourceId) === (played.card?.id ?? played.sourceId) &&
    Math.abs(entry.seq - played.seq) <= 2;
}

/** Pure, bounded presentation queue. It never schedules engine input or changes authoritative state. */
export class PresentationTimeline {
  matchId = '';
  cursor = 0;
  history: PresentationEvent[] = [];
  current: PresentationEntry | null = null;
  private pending: PresentationEntry[] = [];
  private initialized = false;
  private lastPresentedSeq = 0;
  get queued() { return this.pending.length; }

  ingest(matchId: string, events: readonly PresentationEvent[], options: { silent?: boolean; cursor?: number } = {}) {
    const fresh = !this.initialized || matchId !== this.matchId;
    if (fresh) this.reset(matchId);
    this.initialized = true;
    const ordered = [...events].filter(e => Number.isSafeInteger(e.seq) && e.seq > this.cursor).sort((a, b) => a.seq - b.seq);
    const accepted: PresentationEvent[] = [];
    for (const event of ordered) {
      if (event.seq <= this.cursor) continue;
      this.cursor = event.seq;
      if (PRESENTABLE.has(event.type) || AUDIO_ONLY.has(event.type)) accepted.push(structuredClone(event));
    }
    this.cursor = Math.max(this.cursor, options.cursor ?? 0);
    const combined = [...this.history, ...accepted];
    this.history = combined.filter(event => PRESENTABLE.has(event.type) &&
      (event.type !== 'entered' || !combined.some(other => sameLandTransition(event, other)))).slice(-HISTORY_LIMIT);
    if (fresh || options.silent) { this.catchUp(); return accepted.length > 0; }
    for (const event of accepted) {
      const partner = combined.find(other => sameLandTransition(event, other));
      if (partner) {
        if (event.type === 'entered' || partner.seq <= this.lastPresentedSeq) continue;
        this.pending = this.pending.filter(entry => !sameLandTransition(event, entry.event));
      }
      const audioOnly = AUDIO_ONLY.has(event.type);
      const previous = this.pending.at(-1);
      // A batch of draws by one player needs one cue, without adding a visual pause.
      if (audioOnly && previous?.audioOnly && previous.event.type === event.type && previous.event.actor === event.actor) {
        this.pending[this.pending.length - 1] = { event, audible: true, audioOnly: true };
      } else {
        this.pending.push({ event, audible: true, ...(audioOnly ? { audioOnly: true } : {}) });
      }
    }
    const visual = this.pending.filter(entry => !entry.audioOnly);
    if (visual.length > QUEUE_LIMIT) {
      // History retains the actions; the table catches up silently instead of playing a sound storm.
      this.pending = visual.slice(-CATCH_UP_LIMIT).map(entry => ({ ...entry, audible: false }));
      this.current = null;
    } else {
      // Draw bursts have their own bound and cannot evict casts or resolutions.
      let audioToDiscard = this.pending.length - visual.length - AUDIO_QUEUE_LIMIT;
      this.pending = this.pending.filter(entry => {
        if (entry.audioOnly && audioToDiscard > 0) { audioToDiscard--; return false; }
        return true;
      });
    }
    return accepted.length > 0;
  }
  /** Tira da fila os próximos eventos que ainda fazem parte do atual (como dano dividido entre vários alvos). */
  takeWhile(test: (event: PresentationEvent) => boolean) {
    const taken: PresentationEntry[] = [];
    while (this.pending[0] && !this.pending[0].audioOnly && test(this.pending[0].event)) taken.push(this.pending.shift()!);
    if (taken.length) this.lastPresentedSeq = Math.max(this.lastPresentedSeq, taken.at(-1)!.event.seq);
    return taken;
  }
  advance(): PresentationEntry | null {
    this.current = this.pending.shift() ?? null;
    if (this.current) this.lastPresentedSeq = Math.max(this.lastPresentedSeq, this.current.event.seq);
    return this.current;
  }
  catchUp() { this.pending = []; this.current = null; this.lastPresentedSeq = this.cursor; }
  reset(matchId = '') {
    this.matchId = matchId; this.cursor = 0; this.history = []; this.current = null;
    this.pending = []; this.initialized = false; this.lastPresentedSeq = 0;
  }
}

/** A real decision always wins over visual playback, including targeting, mana payment and questions. */
export function hasLiveDecision(state: FState) {
  return !!(state.gameOver || state.sideboarding || state.question || state.input.ok.enabled || state.input.cancel.enabled ||
    state.input.paying || state.input.targeting || state.input.attacking || state.input.blocking || state.input.suspendCast || state.input.selection || state.input.selectable.length || state.input.selectableStacks?.length || state.input.selectablePlayers?.length || state.input.actionable?.length || state.castable?.length);
}
export function stateWithFrame(state: FState, frame: PresentationFrame | null): FState {
  if (!frame || hasLiveDecision(state)) return state;
  return { ...state, turn: frame.turn, phase: frame.phase, activePlayer: frame.activePlayer,
    players: state.players.map(player => ({ ...player, ...frame.players.find(p => p.id === player.id) })),
    stack: frame.stack, combat: frame.combat ?? [],
    input: { ...state.input, gen: -1, actionable: [], selectable: [], selectableStacks: [], selectablePlayers: [], paying: false, targeting: undefined }, castable: [],
  };
}
export function presentationDuration(event: PresentationEvent, fast: boolean) {
  // Faixa de ataque e aviso de habilidade precisam ficar na tela o bastante para serem lidos.
  const duration = event.type === 'attackers' ? 1300 : event.type === 'ability-activated' ? 1000 : event.type === 'spell-cast' ? 720
    : event.type === 'damage' ? (event.combat ? 620 : 760)
    : event.type === 'life-changed' ? ((event.delta ?? 0) > 0 ? 520 : 260)
    : ['countered', 'land-played'].includes(event.type) ? 540
      : event.type === 'turn' ? 480 : 340;
  return Math.round(duration * (fast ? .6 : 1));
}
/**
 * Quanto o aviso de habilidade fica ao lado da carta. É mais longo que o passo da apresentação (que segura o
 * próximo evento): o aviso continua legível enquanto o resto da jogada segue no ritmo de sempre.
 */
export function calloutDuration(event: PresentationEvent, fast: boolean) {
  if (event.type !== 'ability-activated') return presentationDuration(event, fast);
  return event.trigger ? (fast ? 2000 : 2600) : (fast ? 1600 : 2000);
}
