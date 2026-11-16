import { KEYS, loadJSON, saveJSON } from '../storage';
import { counterHurts, type PresentationEvent } from './presentationTimeline';
import { warpCast, warpReturn } from './warpEffects';

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
  draw: '01-card-draw.mp3', play: '02-card-play.mp3', land: '03-land.mp3', cast: '04-cast.mp3',
  impact: '05-impact.mp3', 'player-hit': '08-player-hit.mp3', 'turn-self': '06-turn.mp3', wing: '07-wing.mp3',
  'turn-opponent': '09-opponent-turn.mp3', ability: '10-ability.mp3', resolved: '11-resolved.mp3',
  countered: '12-countered.mp3', attack: '13-attack.mp3', block: '14-block.mp3',
  heal: '15-heal.mp3', poison: '16-poison.mp3', shield: '17-shield.mp3', shatter: '18-shatter.mp3',
  untap: '19-untap.mp3', sneak: '20-sneak.mp3', blink: '21-blink.mp3', bounce: '22-bounce.mp3', exile: '23-exile.mp3',
  sacrifice: '24-sacrifice.mp3', 'life-loss': '25-life-loss.mp3', shuffle: '26-shuffle.mp3',
  victory: '27-victory.mp3', defeat: '28-defeat.mp3', counter: '29-counter.mp3', 'counter-bad': '30-counter-bad.mp3',
  walker: '31-walker.mp3', loyalty: '32-loyalty.mp3', reminder: '33-reminder.mp3', alarm: '34-alarm.mp3',
  graveyard: '35-graveyard.mp3', equip: '36-equip.mp3', dice: '37-dice.mp3',
} as const;
export type SoundCue = keyof typeof SOUND_FILES;
const SETTINGS_KEY = KEYS.audio;
const MAX_VOICES = 4;
const SOUND_REVISION = 'mp3-1';
// Includes the StereoPanner's correlated-channel crossfeed at the maximum pan.
export const MIX_HEADROOM = .40;

export function soundForEvent(event: PresentationEvent, you?: number): SoundCue | null {
  switch (event.type) {
    // Vidência mexe no grimório como comprar; descartar e moer levam cartas ao cemitério.
    case 'draw': case 'scry': return 'draw';
    case 'discard': case 'mill': return 'graveyard';
    case 'shuffle': return 'shuffle';
    case 'attached': return 'equip';
    case 'coin': case 'die': case 'starting-roll': return 'dice';
    // Mudar de dono é a permanente indo de fininho para o outro lado.
    case 'control-changed': return 'sneak';
    case 'land-played': return 'land';
    case 'spell-cast': return 'cast';
    case 'ability-activated': return event.loyalty ? 'loyalty' : 'ability';
    case 'resolved': return 'resolved';
    case 'countered': return 'countered';
    case 'entered':
      // Blink volta do exílio; da mão sem conjurar (ninjutsu, sneak, Sneak Attack) a criatura entra de fininho.
      if (event.from === 'Exile') return 'blink';
      if (event.card?.planeswalker) return 'walker';
      if (event.card?.land) return 'land';
      if (event.from === 'Hand' || event.reason === 'sneak') return 'sneak';
      return event.card?.keywords?.includes('FLYING') ? 'wing' : 'play';
    case 'attackers': return 'attack';
    case 'blockers': return 'block';
    case 'damage':
      if (event.prevented) return 'shield';
      if (event.wither || (event.infect && event.targets?.players?.length)) return 'poison';
      return event.targets?.players?.length ? 'player-hit' : 'impact';
    case 'life-changed': return (event.delta ?? 0) > 0 ? 'heal' : (event.delta ?? 0) < 0 ? 'life-loss' : null;
    case 'left':
      if (event.reason === 'destroyed') return 'shatter';
      if (event.reason === 'sacrificed') return 'sacrifice';
      if (event.reason === 'ninjutsu' || event.reason === 'sneak') return 'sneak';
      if (event.to === 'Exile') return 'exile';
      return event.to === 'Hand' || event.to === 'Library' ? 'bounce' : null;
    case 'counters':
      // Os de "entra com" já vêm no som da entrada.
      if (event.entering) return null;
      return counterHurts(event) ? 'counter-bad' : 'counter';
    case 'turn': {
      const actor = event.actor ?? event.frame?.activePlayer;
      return you === undefined || actor == null ? null : actor === you ? 'turn-self' : 'turn-opponent';
    }
    default: return null;
  }
}

/** Desvirar no começo do turno: quem começa o turno tinha permanentes viradas na última mesa vista. */
export class UntapWatch {
  private matchId = '';
  private tapped = new Map<number, boolean>();
  observe(event: PresentationEvent, matchId: string) {
    if (matchId !== this.matchId) { this.matchId = matchId; this.tapped.clear(); }
    const players = event.frame?.players;
    const actor = event.actor ?? event.frame?.activePlayer ?? undefined;
    const untaps = event.type === 'turn' && actor != null &&
      (!!this.tapped.get(actor) || !!players?.find(p => p.id === actor)?.battlefield.some(card => card.tapped));
    for (const player of players ?? []) this.tapped.set(player.id, player.battlefield.some(card => card.tapped));
    if (untaps) this.tapped.set(actor!, false);
    return untaps;
  }
}

/** Momentos da mesa fora da fila de eventos: embaralhar a mão inicial, vencer, perder ou ser eliminado. */
export function tableMoment(s: {
  matchId?: string; gameOver: boolean; watching?: boolean; winner?: string; you: number;
  match?: { gameNumber: number; abandoned?: boolean }; players: { id: number; name: string; eliminated?: boolean }[];
  input: { gen: number; opening?: string };
}): { key: string; cue: SoundCue } | null {
  const game = `${s.matchId ?? ''}:${s.match?.gameNumber ?? 0}`;
  const me = s.players.find(p => p.id === s.you);
  if (s.watching || !me) return null;
  if (s.gameOver) {
    if (s.match?.abandoned || !s.winner) return null;
    return { key: `${game}:result`, cue: s.winner === me.name ? 'victory' : 'defeat' };
  }
  if (me.eliminated) return { key: `${game}:result`, cue: 'defeat' };
  if (s.input.opening === 'mulligan') return { key: `${game}:hand:${s.input.gen}`, cue: 'shuffle' };
  return null;
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
  // O ultimate usa o som da lealdade mais grave e mais forte.
  const ultimate = event.type === 'ability-activated' && !!event.ultimate;
  // A dobra usa o som de conjurar bem mais grave, com um eco (veja `echo`); a volta ao exílio, o do exílio mais grave.
  const warp = warpCast(event), warpBack = warpReturn(event);
  return {
    rate: (1 + ((hash & 65535) / 65535 - .5) * .06 - (opponent ? .012 : 0)) * (ultimate ? .8 : 1) * (warp ? .72 : warpBack ? .82 : 1),
    gain: (.92 + ((hash >>> 16) & 255) / 255 * .12) * (ultimate ? 1.3 : 1) * (warp ? 1.15 : 1),
    /** Segunda voz atrasada e mais baixa, como um eco do espaço se rasgando; 0 sem eco. */
    echo: warp ? .45 : 0,
    pan: (directional ? opponent ? .09 : -.09 : 0) + ((hash >>> 24) / 255 - .5) * .04,
  };
}

export function normalizeAudioSettings(value: Partial<AudioSettings> | null | undefined): AudioSettings {
  const volume = typeof value?.volume === 'number' && Number.isFinite(value.volume) ? Math.max(0, Math.min(1, value.volume)) : .35;
  const pack = SOUND_PACKS.find(entry => entry.id === value?.pack)?.id ?? 'classico';
  // Som ligado para quem nunca escolheu: só fica mudo quem desligou (a mesa só grava depois de uma escolha).
  return { muted: value?.muted === true, volume, pack };
}

/** O pacote escolhido nas opções da mesa, para os sons tocados fora dela (o alarme do relógio do torneio). */
export function savedSoundPack() {
  return normalizeAudioSettings(loadJSON<Partial<AudioSettings> | null>(SETTINGS_KEY, null)).pack;
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
  private hits = new Map<number, number>();
  private wounds = new Map<string, number>();
  private struck = new Map<number, number>();
  private stackOutcomes = new Map<number, number>();
  level(event: PresentationEvent, matchId: string) {
    if (matchId !== this.matchId) {
      this.matchId = matchId; this.outcomes.clear(); this.draw = null; this.hits.clear(); this.wounds.clear(); this.struck.clear(); this.stackOutcomes.clear();
    }
    // Veneno do infectar e -1/-1 do murchar vêm do golpe, que já soou com o som de veneno.
    if (event.type === 'damage' && !event.prevented && (event.infect || event.wither)) {
      for (const player of event.targets?.players ?? []) this.wounds.set(`p${player}`, event.seq);
      for (const card of event.targets?.cards ?? []) this.wounds.set(`c${card}`, event.seq);
      if (this.wounds.size > 64) this.wounds.delete(this.wounds.keys().next().value!);
    }
    // Lealdade (ou defesa da batalha) perdida pelo dano é o próprio golpe, que já soou.
    if (event.type === 'damage' && !event.prevented) {
      for (const card of event.targets?.cards ?? []) this.struck.set(card, event.seq);
      if (this.struck.size > 64) this.struck.delete(this.struck.keys().next().value!);
    }
    if (event.type === 'counters' && (event.delta ?? 0) < 0 && (event.counter === 'LOYALTY' || event.counter === 'DEFENSE')) {
      const hit = event.card?.id === undefined ? undefined : this.struck.get(event.card.id);
      if (hit !== undefined && event.seq > hit && event.seq - hit <= 12) return 0;
    }
    if (event.type === 'counters') {
      const target = event.card?.id !== undefined ? `c${event.card.id}` : event.actor !== undefined ? `p${event.actor}` : '';
      const wound = this.wounds.get(target);
      if (wound !== undefined && event.seq > wound && event.seq - wound <= 12) return 0;
      // A mágica que só pôs marcadores não toca a resolução por cima.
      if (event.stackId !== undefined) {
        this.stackOutcomes.set(event.stackId, event.seq);
        if (this.stackOutcomes.size > 64) this.stackOutcomes.delete(this.stackOutcomes.keys().next().value!);
      }
    }
    // Perder vida logo depois de levar dano é o próprio dano: o golpe já soou.
    if (event.type === 'damage' && !event.prevented) for (const player of event.targets?.players ?? []) this.hits.set(player, event.seq);
    if (event.type === 'life-changed' && (event.delta ?? 0) < 0 && event.actor !== undefined) {
      const hit = this.hits.get(event.actor);
      if (hit !== undefined && event.seq > hit && event.seq - hit <= 12) return 0;
    }
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
      const counted = event.stackId === undefined ? undefined : this.stackOutcomes.get(event.stackId);
      const ownOutcome = [outcome, counted].some(seq => seq !== undefined && seq < event.seq && event.seq - seq <= 24);
      const justDrew = this.draw?.actor !== undefined && this.draw.actor === event.actor && event.seq > this.draw.seq && event.seq - this.draw.seq <= 3;
      return ownOutcome || justDrew ? 0 : .55;
    }
    return event.type === 'entered' && !event.card?.land && !event.card?.planeswalker ? .75 : 1;
  }
}

export function createGameAudio() {
  const stored = loadJSON<Partial<AudioSettings> | null>(SETTINGS_KEY, null);
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
  const untap = new UntapWatch();
  let untapTimer: ReturnType<typeof setTimeout> | undefined;

  function save() {
    saveJSON(SETTINGS_KEY, settings);
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
    silence() { clearTimeout(untapTimer); silence(); },
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
      // As permanentes desviram logo depois do aviso do turno, sem cobrir o começo dele.
      if (untap.observe(event, matchId) && allowed) { clearTimeout(untapTimer); untapTimer = setTimeout(() => this.cue('untap', .7), 420); }
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
      if (variation.echo && voices.size < MAX_VOICES) {
        const echo = context.createBufferSource(), echoGain = context.createGain();
        echo.buffer = sample;
        echo.playbackRate.value = variation.rate * .86;
        echoGain.gain.value = variation.gain * level * variation.echo;
        echo.connect(echoGain); echoGain.connect(pan);
        voices.add(echo);
        echo.onended = () => { voices.delete(echo); echo.disconnect(); echoGain.disconnect(); };
        echo.start(context.currentTime + .16);
      }
      source.start();
    },
  };
}
