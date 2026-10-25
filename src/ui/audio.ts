import type { PresentationEvent } from './presentationTimeline';

/** Same cues, same file names: each themed pack lives in its own folder under audio/. */
export const SOUND_PACKS = [
  { id: 'classico', name: 'Clássico' },
  { id: '8bits', name: '8 bits' },
  { id: 'fantasia', name: 'Fantasia' },
  { id: 'aventura', name: 'Aventura fofa' },
  { id: 'arena', name: 'Arena épica' },
  { id: 'taverna', name: 'Taverna' },
  { id: 'scifi', name: 'Ficção científica' },
  { id: 'discreto', name: 'Discreto' },
] as const;
export type SoundPack = typeof SOUND_PACKS[number]['id'];
export interface AudioSettings { muted: boolean; volume: number; pack: SoundPack }
export const SOUND_FILES = {
  draw: '01-card-draw.wav', play: '02-card-play.wav', land: '03-land.wav', cast: '04-cast.wav',
  impact: '05-impact.wav', 'player-hit': '08-player-hit.wav', 'turn-self': '06-turn.wav', wing: '07-wing.wav',
  'turn-opponent': '09-opponent-turn.wav', ability: '10-ability.wav', resolved: '11-resolved.wav',
  countered: '12-countered.wav', attack: '13-attack.wav', block: '14-block.wav',
  heal: '15-heal.wav', poison: '16-poison.wav', shield: '17-shield.wav', shatter: '18-shatter.wav',
} as const;
export type SoundCue = keyof typeof SOUND_FILES;
const SETTINGS_KEY = 'mesa:audio:v1';
const MAX_VOICES = 4;
const SOUND_REVISION = 'materials-5';
// Includes the StereoPanner's correlated-channel crossfeed at the maximum pan.
export const MIX_HEADROOM = .40;

export function soundForEvent(event: PresentationEvent, you?: number): SoundCue | null {
  switch (event.type) {
    case 'draw': case 'discard': case 'mill': return 'draw';
    case 'land-played': return 'land';
    case 'spell-cast': return 'cast';
    case 'ability-activated': return 'ability';
    case 'resolved': return 'resolved';
    case 'countered': return 'countered';
    case 'entered': return event.card?.land ? 'land' : event.card?.keywords?.includes('FLYING') ? 'wing' : 'play';
    case 'attackers': return 'attack';
    case 'blockers': return 'block';
    case 'damage':
      if (event.prevented) return 'shield';
      if (event.wither || (event.infect && event.targets?.players?.length)) return 'poison';
      return event.targets?.players?.length ? 'player-hit' : 'impact';
    case 'life-changed': return (event.delta ?? 0) > 0 ? 'heal' : null;
    case 'left': return event.reason === 'destroyed' ? 'shatter' : null;
    case 'turn': {
      const actor = event.actor ?? event.frame?.activePlayer;
      return you === undefined || actor == null ? null : actor === you ? 'turn-self' : 'turn-opponent';
    }
    default: return null;
  }
}

/** Small, repeatable variations keep a cue recognizable without sounding like a loop. */
export function soundVariation(event: PresentationEvent, matchId: string, you?: number) {
  let hash = 2166136261;
  for (const character of `${matchId}:${event.seq}:${event.type}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  const actor = event.actor ?? event.card?.controller;
  const opponent = you !== undefined && actor !== undefined && actor !== you;
  const directional = you !== undefined && actor !== undefined;
  return {
    rate: 1 + ((hash & 65535) / 65535 - .5) * .06 - (opponent ? .012 : 0),
    gain: .92 + ((hash >>> 16) & 255) / 255 * .12,
    pan: (directional ? opponent ? .09 : -.09 : 0) + ((hash >>> 24) / 255 - .5) * .04,
  };
}

export function normalizeAudioSettings(value: Partial<AudioSettings> | null | undefined): AudioSettings {
  const volume = typeof value?.volume === 'number' && Number.isFinite(value.volume) ? Math.max(0, Math.min(1, value.volume)) : .35;
  const pack = SOUND_PACKS.find(entry => entry.id === value?.pack)?.id ?? 'classico';
  return { muted: value?.muted !== false, volume, pack };
}

export function soundUrl(pack: SoundPack, cue: SoundCue) {
  return `audio/${pack === 'classico' ? '' : `${pack}/`}${SOUND_FILES[cue]}`;
}

/** Consume event IDs even when silent: enabling audio must never replay earlier events. */
export class AudioEventGate {
  private seen = new Set<string>();
  allow(id: string, options: AudioSettings & { unlocked: boolean; visible: boolean; audible: boolean }) {
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    if (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
    return !options.muted && options.volume > 0 && options.unlocked && options.visible && options.audible;
  }
}

/** Prefer an effect's own material over a generic second sound for its resolution. */
export class AudioEventMix {
  private matchId = '';
  private outcomes = new Map<number, number>();
  private draw: { seq: number; actor?: number } | null = null;
  level(event: PresentationEvent, matchId: string) {
    if (matchId !== this.matchId) { this.matchId = matchId; this.outcomes.clear(); this.draw = null; }
    const source = event.sourceId ?? event.card?.id;
    if (event.type === 'spell-cast' || event.type === 'ability-activated') this.draw = null;
    if (source !== undefined) {
      if (event.type === 'spell-cast' || event.type === 'ability-activated') this.outcomes.delete(source);
      if (['damage', 'entered', 'countered'].includes(event.type)) {
        this.outcomes.set(source, event.seq);
        if (this.outcomes.size > 64) this.outcomes.delete(this.outcomes.keys().next().value!);
      }
    }
    if (event.type === 'draw') { this.draw = { seq: event.seq, actor: event.actor }; return .85; }
    if (event.type === 'resolved') {
      const outcome = source === undefined ? undefined : this.outcomes.get(source);
      const ownOutcome = outcome !== undefined && outcome < event.seq && event.seq - outcome <= 24;
      const justDrew = this.draw?.actor !== undefined && this.draw.actor === event.actor && event.seq > this.draw.seq && event.seq - this.draw.seq <= 3;
      return ownOutcome || justDrew ? 0 : .55;
    }
    return event.type === 'entered' && !event.card?.land ? .75 : 1;
  }
}

export function createGameAudio() {
  let stored: Partial<AudioSettings> | null = null;
  try { stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null'); } catch { /* Storage is optional. */ }
  let settings = normalizeAudioSettings(stored);
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let unlocked = false;
  // Keyed by pack/cue: a pack switched mid-load never fills the new pack with the old one's sounds.
  const buffers = new Map<string, AudioBuffer>();
  const loading = new Map<string, Promise<void>>();
  const voices = new Set<AudioBufferSourceNode>();
  const gate = new AudioEventGate();
  const mix = new AudioEventMix();

  function save() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Storage is optional. */ }
  }
  function silence() {
    for (const source of voices) { try { source.stop(); } catch { /* Already ended. */ } }
    voices.clear();
  }
  async function preload() {
    const ctx = context;
    if (!ctx || settings.muted) return;
    const pack = settings.pack;
    await Promise.allSettled((Object.keys(SOUND_FILES) as SoundCue[]).map(cue => {
      const key = `${pack}/${cue}`;
      if (buffers.has(key)) return Promise.resolve();
      if (loading.has(key)) return loading.get(key)!;
      const pending = fetch(`${import.meta.env.BASE_URL}${soundUrl(pack, cue)}?v=${SOUND_REVISION}`)
        .then(r => { if (!r.ok) throw new Error('Audio unavailable'); return r.arrayBuffer(); })
        .then(data => ctx.decodeAudioData(data))
        .then(buffer => { if (settings.pack === pack) buffers.set(key, buffer); })
        .catch(() => { /* A missing asset never interrupts a match. */ })
        .finally(() => loading.delete(key));
      loading.set(key, pending);
      return pending;
    }));
  }
  const buffer = (cue: SoundCue) => buffers.get(`${settings.pack}/${cue}`);
  async function unlock() {
    try {
      if (!context) {
        context = new AudioContext();
        master = context.createGain();
        master.gain.value = settings.volume * MIX_HEADROOM;
        master.connect(context.destination);
      }
      await context.resume();
      unlocked = context.state === 'running';
      void preload();
    } catch { unlocked = false; }
  }
  // Trusted user gestures only. Merely rendering the board never unlocks or starts audio.
  const gesture = (event: Event) => { if (event.isTrusted) void unlock(); };
  document.addEventListener('pointerdown', gesture, { once: true });
  document.addEventListener('keydown', gesture, { once: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) silence(); });

  return {
    get settings() { return { ...settings }; },
    unlock,
    setMuted(muted: boolean) {
      settings = { ...settings, muted };
      if (muted) silence(); else { void unlock(); }
      save();
    },
    setVolume(volume: number) {
      settings = normalizeAudioSettings({ ...settings, volume });
      if (master && context) master.gain.setTargetAtTime(settings.volume * MIX_HEADROOM, context.currentTime, .015);
      if (settings.volume === 0) silence();
      save();
    },
    /** Troca o pacote e toca uma amostra dele (o início do seu turno), para ouvir na hora. */
    async setPack(pack: SoundPack) {
      settings = normalizeAudioSettings({ ...settings, pack });
      save();
      silence();
      buffers.clear();
      await preload();
      this.cue('turn-self', .8);
    },
    silence,
    /** Som avulso, fora da fila de eventos (lembrete de decisão parada); respeita o mudo e o volume. */
    cue(cue: SoundCue, level = 1) {
      if (settings.muted || !unlocked || document.hidden || !context || !master) return;
      const sample = buffer(cue);
      if (!sample) { void preload(); return; }
      if (voices.size >= MAX_VOICES) return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = sample;
      gain.gain.value = level;
      source.connect(gain); gain.connect(master);
      voices.add(source);
      source.onended = () => { voices.delete(source); source.disconnect(); gain.disconnect(); };
      source.start();
    },
    play(event: PresentationEvent, matchId: string, audible: boolean, you?: number) {
      const allowed = gate.allow(`${matchId}:${event.seq}`, { ...settings, unlocked, visible: !document.hidden, audible });
      const cue = soundForEvent(event, you);
      if (!allowed || !cue || !context || !master) return;
      const sample = buffer(cue);
      if (!sample) { void preload(); return; }
      const level = mix.level(event, matchId);
      if (!level) return;
      if (voices.size >= MAX_VOICES) {
        const oldest = voices.values().next().value!;
        oldest.stop(); voices.delete(oldest);
      }
      const source = context.createBufferSource();
      const gain = context.createGain();
      const pan = context.createStereoPanner();
      const variation = soundVariation(event, matchId, you);
      source.buffer = sample;
      source.playbackRate.value = variation.rate;
      gain.gain.value = variation.gain * level;
      pan.pan.value = variation.pan;
      source.connect(gain); gain.connect(pan); pan.connect(master);
      voices.add(source);
      source.onended = () => { voices.delete(source); source.disconnect(); gain.disconnect(); pan.disconnect(); };
      source.start();
    },
  };
}
