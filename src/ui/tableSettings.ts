// A janela Opções da partida (som, jogo, aparência) e as preferências que ela guarda neste aparelho: o ritmo das jogadas,
// a janela de remoção, o estilo das cartas, o tapete com a arte do deck, a arte própria da mesa, os efeitos (automático, completos ou leves) e o selo de FPS e ping. As seções abertas ficam como o jogador deixou.
import { EVENTS, KEYS } from '../storage';
import type { CardStyle } from './face';
import type { createGameAudio, SoundPack } from './audio';
import { hideCardPreview } from './cardInspector';
import { isPassLevel, passLevelInfo, type PassLevelPreference } from './passLevel';
import { screenWake } from './screenWake';
import { escolherTema, lerTema, parseTema, temasDisponiveis } from './temas';
import type { createTurnBuzz } from './turnBuzz';
import type { createTurnNotice } from './turnNotice';
import { finder } from './dom';
import { ownArtEnabled, setOwnArtEnabled } from '../scryfallCards';
import { effectsLevel, setEffectsLevel } from './gpu/gpuSupport';
import type { createPerfMeter } from './perfMeter';
import { esc } from './cardtext';
import type { FState } from '../forge/client';
import { parseRemovalWindowMode } from './removalNotice';

const parseCardStyle = (v: string | null): CardStyle => (v === 'art' || v === 'arena' ? v : 'full');

export interface SettingsDeps {
  audio: ReturnType<typeof createGameAudio>;
  passLevel: PassLevelPreference;
  turnNotice: ReturnType<typeof createTurnNotice>;
  turnBuzz: ReturnType<typeof createTurnBuzz>;
  perfMeter: ReturnType<typeof createPerfMeter>;
  /** Conectado e com a conexão de pé: dá para trocar o nível de passar. */
  connected(): boolean;
  /** O nível mudou: o menu rápido dele, se aberto, acompanha. */
  passLevelChanged(): void;
  /** Ao abrir as Opções: fecha o menu (devolvendo o foco) e a gaveta do histórico. */
  closeMenus(): void;
  syncModal(): void;
  hasState(): boolean;
  render(): void;
  /** Redesenho só da mesa, sem ler eventos novos (o estilo das cartas mudou). */
  rerender(): void;
  /** "Efeitos" mudou entre completos e leves. */
  effectsChanged(): void;
  /** Gatilhos opcionais respondidos com "Sempre sim" ou "Sempre não" nesta partida. */
  autoTriggers(): NonNullable<FState['autoTriggers']>;
  /** Volta a perguntar um deles. */
  forgetTrigger(key: string): void;
  /** O nome da carta como a mesa mostra. */
  cardName(name: string): string;
}

export function createTableSettings(root: HTMLElement, d: SettingsDeps) {
  const $ = finder(root);
  /** O que o jogador escolheu nas Opções; a mesa lê daqui a cada desenho. */
  const prefs = { fast: false, cardStyle: 'full' as CardStyle, playmat: true, removalWindow: parseRemovalWindowMode(null) };
  try { prefs.fast = localStorage.getItem(KEYS.pace) === 'fast'; } catch { /* Storage is optional. */ }
  try { prefs.removalWindow = parseRemovalWindowMode(localStorage.getItem(KEYS.removalWindow)); } catch { /* Storage is optional. */ }
  try { prefs.cardStyle = parseCardStyle(localStorage.getItem(KEYS.cards)); } catch { /* Storage is optional. */ }
  try { prefs.playmat = localStorage.getItem(KEYS.playmat) !== 'off'; } catch { /* Storage is optional. */ }

  function syncPassLevel() {
    const connected = d.connected(), passLevel = d.passLevel;
    const control = $('#fPassLevel') as HTMLSelectElement;
    control.disabled = !connected || !passLevel.supported;
    control.value = passLevel.value;
    $('#fPassLevelHint').textContent = passLevelInfo(passLevel.value).hint;
    const status = $('#fPassLevelStatus');
    status.textContent = !connected ? 'Aguardando conexão com o servidor.' : !passLevel.supported ? 'Este servidor não oferece esta opção.' : passLevel.pending !== null ? 'Aplicando…' : '';
    status.hidden = !status.textContent;
    d.passLevelChanged();
    syncOptionSummaries();
  }
  /** Cada seção recolhida das Opções mostra, ao lado do título, como ela está agora. */
  function syncOptionSummaries() {
    const chosen = (id: string) => ($(id) as HTMLSelectElement).selectedOptions[0]?.textContent ?? '';
    const settings = d.audio.settings, turnBuzz = d.turnBuzz;
    $('#fSoundSummary').textContent = settings.muted ? 'Desligado' : `${chosen('#fSoundPack')} · ${Math.round(settings.volume * 100)}%`;
    $('#fPlaySummary').textContent = [chosen('#fPassLevel'), d.turnNotice.enabled && 'Aviso de turno', screenWake.supported && screenWake.enabled && 'Tela acesa', turnBuzz.supported && turnBuzz.enabled && 'Vibrar', prefs.fast ? 'Rápido' : 'Ritmo normal', prefs.removalWindow !== 'mixed' && `Remoção ${chosen('#fRemovalWindow').toLowerCase()}`].filter(Boolean).join(' · ');
    $('#fLookSummary').textContent = [chosen('#fCardStyle'), `Efeitos ${chosen('#fEffects').toLowerCase()}`, prefs.playmat && 'Tapete', d.perfMeter.enabled && 'FPS e ping', ownArtEnabled() && 'Cartas da mesa', temasDisponiveis() && chosen('#fTema')].filter(Boolean).join(' · ');
  }
  /** Seções abertas das Opções: ficam como o jogador deixou (no começo, só Som). */
  let openOptionGroups = ['sound'];
  try { const saved = JSON.parse(localStorage.getItem(KEYS.optionsOpen) ?? 'null'); if (Array.isArray(saved)) openOptionGroups = saved; } catch { /* Storage is optional. */ }
  root.querySelectorAll<HTMLDetailsElement>('[data-options-group]').forEach(group => { group.open = openOptionGroups.includes(group.dataset.optionsGroup!); });
  // "toggle" não sobe pela árvore: a escuta é na captura.
  root.addEventListener('toggle', e => {
    if (!(e.target as HTMLElement).matches?.('[data-options-group]')) return;
    const open = [...root.querySelectorAll<HTMLDetailsElement>('[data-options-group]')].filter(group => group.open).map(group => group.dataset.optionsGroup!);
    try { localStorage.setItem(KEYS.optionsOpen, JSON.stringify(open)); } catch { /* Storage is optional. */ }
  }, true);
  /** Interruptores de liga e desliga das Opções: o estado no botão e no texto ao lado. */
  function syncSwitch(id: string, on: boolean) {
    const control = root.querySelector<HTMLElement>(`#${id}`);
    if (!control) return;
    control.setAttribute('aria-checked', String(on));
    $(`#${id}State`).textContent = on ? 'Ligado' : 'Desligado';
  }
  function syncDevice() {
    syncSwitch('fAwake', screenWake.enabled); syncSwitch('fBuzz', d.turnBuzz.enabled);
    syncOptionSummaries();
  }
  function syncPlaymat() {
    syncSwitch('fPlaymat', prefs.playmat); syncSwitch('fOwnArt', ownArtEnabled()); syncSwitch('fPerfMeter', d.perfMeter.enabled);
    syncOptionSummaries();
  }
  function syncTurnNotice() {
    const turnNotice = d.turnNotice, permission = turnNotice.permission;
    const control = $('#fTurnNotice') as HTMLButtonElement;
    control.disabled = permission === 'unsupported' || permission === 'denied';
    control.setAttribute('aria-checked', String(turnNotice.enabled));
    $('#fTurnNoticeState').textContent = turnNotice.enabled ? 'Ligado' : 'Desligado';
    const status = $('#fTurnNoticeStatus');
    status.textContent = permission === 'unsupported' ? 'Este navegador não mostra avisos do sistema. A aba continua piscando.'
      : permission === 'denied' ? 'O navegador bloqueou os avisos desta página. Libere nas permissões do site para ligar. A aba continua piscando.' : '';
    status.hidden = !status.textContent;
    syncOptionSummaries();
  }
  function syncSettings() {
    const settings = d.audio.settings;
    const mute = $('#fMute');
    $('#fSoundState').textContent = settings.muted ? 'Desligados' : 'Ligados';
    mute.setAttribute('aria-checked', String(!settings.muted));
    const volume = Math.round(settings.volume * 100);
    ($('#fVolume') as HTMLInputElement).value = String(volume);
    $('#fVolume').setAttribute('aria-valuetext', `${volume}%`);
    $('#fVolumeValue').textContent = `${volume}%`;
    ($('#fSoundPack') as HTMLSelectElement).value = settings.pack;
    ($('#fPace') as HTMLSelectElement).value = prefs.fast ? 'fast' : 'normal';
    ($('#fRemovalWindow') as HTMLSelectElement).value = prefs.removalWindow;
    ($('#fCardStyle') as HTMLSelectElement).value = prefs.cardStyle;
    ($('#fEffects') as HTMLSelectElement).value = effectsLevel();
    ($('#fTema') as HTMLSelectElement).value = lerTema();
    syncPassLevel();
  }
  /** A lista de gatilhos com resposta guardada, com o "Perguntar de novo" de cada um; some sem nenhum. */
  let autoTriggersHTML = '';
  function syncAutoTriggers() {
    const list = d.autoTriggers();
    const html = list.map(t => `<li><span><strong>${t.card ? esc(d.cardName(t.card)) : ''}<em>${t.accept ? 'Sempre sim' : 'Sempre não'}</em></strong><small>${esc(t.key)}</small></span><button type="button" class="arena-btn secondary" data-forget-trigger="${esc(t.key)}">Perguntar de novo</button></li>`).join('');
    if (html === autoTriggersHTML) return;
    autoTriggersHTML = html;
    $('#fAutoTriggerList').innerHTML = html;
    $('#fAutoTriggers').hidden = !list.length;
  }
  $('#fAutoTriggers').addEventListener('click', e => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-forget-trigger]');
    if (!button || !d.connected()) return;
    d.forgetTrigger(button.dataset.forgetTrigger!);
    button.disabled = true;
  });
  function setSettings(open: boolean) {
    if (open) {
      d.closeMenus(); hideCardPreview(true); syncSettings(); syncAutoTriggers();
    }
    $('#fSettings').hidden = !open;
    root.querySelector('[aria-controls="fSettings"]')?.setAttribute('aria-expanded', String(open));
    d.syncModal();
  }
  /** O interruptor do tapete. */
  function togglePlaymat() {
    prefs.playmat = !prefs.playmat;
    try { localStorage.setItem(KEYS.playmat, prefs.playmat ? 'on' : 'off'); } catch { /* Storage is optional. */ }
    syncPlaymat(); d.rerender();
  }
  /** O interruptor do selo de FPS e ping. */
  function togglePerfMeter() { d.perfMeter.setEnabled(!d.perfMeter.enabled); syncPlaymat(); }
  /** O interruptor da arte própria da mesa: vale em todas as telas, e a mesa redesenha com a outra imagem. */
  function toggleOwnArt() { setOwnArtEnabled(!ownArtEnabled()); }
  addEventListener(EVENTS.ownArt, () => { syncPlaymat(); d.rerender(); });
  root.addEventListener('change', e => {
    const t = e.target as HTMLSelectElement;
    if (t.id === 'fCardStyle') {
      prefs.cardStyle = parseCardStyle(t.value);
      try { localStorage.setItem(KEYS.cards, prefs.cardStyle); } catch { /* Storage is optional. */ }
      d.rerender();
    }
    if (t.id === 'fEffects') { setEffectsLevel(t.value === 'light' || t.value === 'full' ? t.value : 'auto'); d.effectsChanged(); }
    if (t.id === 'fSoundPack') { void d.audio.setPack(t.value as SoundPack); }
    if (t.id === 'fTema') escolherTema(parseTema(t.value));
    if (t.id === 'fPassLevel') { if (d.connected() && isPassLevel(t.value)) d.passLevel.change(t.value); syncPassLevel(); if (d.hasState()) d.render(); }
    if (t.id === 'fPace') { prefs.fast = t.value === 'fast'; try { localStorage.setItem(KEYS.pace, prefs.fast ? 'fast' : 'normal'); } catch { /* Storage is optional. */ } }
    if (t.id === 'fRemovalWindow') {
      prefs.removalWindow = parseRemovalWindowMode(t.value);
      try { if (prefs.removalWindow === 'mixed') localStorage.removeItem(KEYS.removalWindow); else localStorage.setItem(KEYS.removalWindow, prefs.removalWindow); } catch { /* Storage is optional. */ }
      if (d.hasState()) d.rerender();
    }
    if (t.closest('[data-options-group]')) syncOptionSummaries();
  });
  return { prefs, syncAutoTriggers, syncPassLevel, syncDevice, syncPlaymat, syncTurnNotice, sync: syncSettings, set: setSettings, togglePlaymat, toggleOwnArt, togglePerfMeter };
}
