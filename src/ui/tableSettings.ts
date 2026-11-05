// A janela Opções da partida (som, jogo, aparência) e as preferências que ela guarda neste aparelho: o ritmo das jogadas,
// o estilo das cartas e o tapete com a arte do deck. As seções abertas ficam como o jogador deixou.
import { KEYS } from '../storage';
import type { CardStyle } from './face';
import type { createGameAudio, SoundPack } from './audio';
import { hideCardPreview } from './cardInspector';
import { isPassLevel, passLevelInfo, type PassLevelPreference } from './passLevel';
import { screenWake } from './screenWake';
import { escolherTema, lerTema, parseTema, temasDisponiveis } from './temas';
import type { createTurnBuzz } from './turnBuzz';
import type { createTurnNotice } from './turnNotice';

const parseCardStyle = (v: string | null): CardStyle => (v === 'art' || v === 'arena' ? v : 'full');

export interface SettingsDeps {
  audio: ReturnType<typeof createGameAudio>;
  passLevel: PassLevelPreference;
  turnNotice: ReturnType<typeof createTurnNotice>;
  turnBuzz: ReturnType<typeof createTurnBuzz>;
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
}

export function createTableSettings(root: HTMLElement, d: SettingsDeps) {
  const $ = (sel: string) => root.querySelector(sel) as HTMLElement;
  /** O que o jogador escolheu nas Opções; a mesa lê daqui a cada desenho. */
  const prefs = { fast: false, cardStyle: 'full' as CardStyle, playmat: true };
  try { prefs.fast = localStorage.getItem(KEYS.pace) === 'fast'; } catch { /* Storage is optional. */ }
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
    $('#fPlaySummary').textContent = [chosen('#fPassLevel'), d.turnNotice.enabled && 'Aviso de turno', screenWake.supported && screenWake.enabled && 'Tela acesa', turnBuzz.supported && turnBuzz.enabled && 'Vibrar', prefs.fast ? 'Rápido' : 'Ritmo normal'].filter(Boolean).join(' · ');
    $('#fLookSummary').textContent = [chosen('#fCardStyle'), prefs.playmat && 'Tapete', temasDisponiveis() && chosen('#fTema')].filter(Boolean).join(' · ');
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
    $('#fPlaymat').setAttribute('aria-checked', String(prefs.playmat));
    $('#fPlaymatState').textContent = prefs.playmat ? 'Ligado' : 'Desligado';
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
    ($('#fCardStyle') as HTMLSelectElement).value = prefs.cardStyle;
    ($('#fTema') as HTMLSelectElement).value = lerTema();
    syncPassLevel();
  }
  function setSettings(open: boolean) {
    if (open) {
      d.closeMenus(); hideCardPreview(true); syncSettings();
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
  root.addEventListener('change', e => {
    const t = e.target as HTMLSelectElement;
    if (t.id === 'fCardStyle') {
      prefs.cardStyle = parseCardStyle(t.value);
      try { localStorage.setItem(KEYS.cards, prefs.cardStyle); } catch { /* Storage is optional. */ }
      d.rerender();
    }
    if (t.id === 'fSoundPack') { void d.audio.setPack(t.value as SoundPack); }
    if (t.id === 'fTema') escolherTema(parseTema(t.value));
    if (t.id === 'fPassLevel') { if (d.connected() && isPassLevel(t.value)) d.passLevel.change(t.value); syncPassLevel(); if (d.hasState()) d.render(); }
    if (t.id === 'fPace') { prefs.fast = t.value === 'fast'; try { localStorage.setItem(KEYS.pace, prefs.fast ? 'fast' : 'normal'); } catch { /* Storage is optional. */ } }
    if (t.closest('[data-options-group]')) syncOptionSummaries();
  });
  return { prefs, syncPassLevel, syncDevice, syncPlaymat, syncTurnNotice, sync: syncSettings, set: setSettings, togglePlaymat };
}
