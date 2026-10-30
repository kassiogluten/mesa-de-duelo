import type { FPreferences } from '../forge/client';
import { esc } from './cardtext';

/**
 * Níveis de passar a prioridade sozinho, do mais cuidadoso ao mais rápido. Quem passa é a ponte (veja
 * forge-bridge PassLevel.java); aqui ficam os nomes, os textos, a preferência guardada e a migração dos dois
 * interruptores antigos ("Passar automaticamente" nas Opções e "Passar respostas" junto dos botões).
 */
export type PassLevel = 'sempre' | 'acoes' | 'respostas' | 'afeta';
export const PASS_LEVEL_KEY = 'mesa:passLevel';
export const LEGACY_AUTO_PASS_KEY = 'mesa:autoPassNoActions';
export const LEGACY_PASS_RESPONSES_KEY = 'mesa:passResponses';
export const DEFAULT_PASS_LEVEL: PassLevel = 'acoes';

export interface PassLevelInfo { id: PassLevel; name: string; hint: string }
export const PASS_LEVELS: readonly PassLevelInfo[] = [
  { id: 'sempre', name: 'Parar sempre', hint: 'Para em toda etapa que dá prioridade, nos dois turnos, mesmo sem nada para usar.' },
  { id: 'acoes', name: 'Só com ações', hint: 'Passa quando você não tem nada que possa usar agora.' },
  { id: 'respostas', name: 'Respostas', hint: 'Passa também no turno dos oponentes e com algo na pilha. No seu turno, com a pilha vazia, para.' },
  { id: 'afeta', name: 'Só quando me afeta', hint: 'Passa tudo, menos as suas fases principais, até algo mirar você ou suas permanentes, ou até você ser atacado.' },
];
/** O que vale em qualquer nível, para as dicas. */
export const PASS_LEVEL_ALWAYS = 'Nas etapas marcadas na trilha de fases o jogo sempre para. Ataques, bloqueios e escolhas sempre esperam você.';

export const isPassLevel = (value: unknown): value is PassLevel => PASS_LEVELS.some(level => level.id === value);
export const passLevelInfo = (level: PassLevel) => PASS_LEVELS.find(info => info.id === level)!;

interface PreferenceStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

/**
 * O nível guardado neste navegador; null quando não há escolha nenhuma (vale a do assento). Sem o nível, os
 * interruptores antigos viram o nível equivalente: Passar respostas ligado é "Respostas" (mesmo com Passar
 * automaticamente desligado, a escolha que o jogador fazia partida a partida) e Passar automaticamente desligado
 * é "Parar sempre".
 */
export function savedPassLevel(storage: Pick<PreferenceStorage, 'getItem'>): PassLevel | null {
  const saved = storage.getItem(PASS_LEVEL_KEY);
  if (isPassLevel(saved)) return saved;
  const autoPass = storage.getItem(LEGACY_AUTO_PASS_KEY), responses = storage.getItem(LEGACY_PASS_RESPONSES_KEY);
  if (responses === 'true') return 'respostas';
  if (autoPass === 'false') return 'sempre';
  if (autoPass === 'true' || responses === 'false') return 'acoes';
  return null;
}

type SendPreference = (message: { type: 'preferences' } & Partial<FPreferences>) => void;

/**
 * Sincroniza o nível com a ponte, como as outras preferências do assento: a escolha do navegador vale primeiro
 * (inclusive a migrada dos interruptores antigos), um navegador novo adota a do assento, e um eco antigo não
 * desfaz a escolha mais nova.
 */
export class PassLevelPreference {
  value: PassLevel = DEFAULT_PASS_LEVEL;
  supported = false;
  pending: PassLevel | null = null;
  /** O atalho "Passar até o fim do turno" está ligado na ponte. */
  passingTurn = false;
  private applied = false;
  private hasLocalChoice = false;
  private storage?: PreferenceStorage;
  private send: SendPreference;

  constructor(send: SendPreference, storage?: PreferenceStorage) {
    this.send = send;
    try {
      this.storage = storage ?? globalThis.localStorage;
      const saved = this.storage ? savedPassLevel(this.storage) : null;
      if (saved) {
        this.value = saved; this.hasLocalChoice = true;
        // Migração: o nível passa a ficar guardado (e a acompanhar a conta) com o valor que veio dos interruptores.
        if (this.storage!.getItem(PASS_LEVEL_KEY) !== saved) this.persist();
      }
    } catch { /* Browser storage is optional; retain the choice for this mounted table. */ }
  }

  reset() { this.supported = false; this.pending = null; this.applied = false; this.passingTurn = false; }

  observe(preferences: FPreferences | undefined, connected: boolean) {
    if (!connected) { this.reset(); return; }
    const confirmed = preferences?.passLevel;
    this.passingTurn = preferences?.passingTurn === true;
    if (!isPassLevel(confirmed)) { this.supported = false; return; }
    this.supported = true;
    if (!this.applied) {
      if (!this.hasLocalChoice) this.value = confirmed;
      this.applied = true;
      this.dispatch();
    } else if (this.pending !== null) {
      if (confirmed === this.pending) {
        this.pending = null;
        if (confirmed !== this.value) this.dispatch();
      }
    } else if (confirmed !== this.value) {
      this.value = confirmed;
      this.persist();
    }
  }

  change(level: PassLevel) {
    if (!this.supported || !isPassLevel(level) || level === this.value) return;
    this.value = level;
    this.persist();
    if (this.pending === null) this.dispatch();
  }

  private dispatch() {
    this.pending = this.value;
    this.send({ type: 'preferences', passLevel: this.value });
  }

  private persist() {
    this.hasLocalChoice = true;
    try {
      this.storage?.setItem(PASS_LEVEL_KEY, this.value);
      // Os interruptores antigos acompanham o nível, para uma aba ou um aparelho com a versão anterior.
      this.storage?.setItem(LEGACY_AUTO_PASS_KEY, String(this.value !== 'sempre'));
      this.storage?.setItem(LEGACY_PASS_RESPONSES_KEY, String(this.value === 'respostas' || this.value === 'afeta'));
    } catch { /* Keep the in-memory choice. */ }
  }
}

const svg = (body: string) => `<svg class="pass-level-icon" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
/** Um ícone por nível: pausa, um avanço, dois avanços, dois avanços com escudo; o atalho é o "pular para o fim". */
const ICONS: Record<PassLevel | 'turno', string> = {
  sempre: svg('<path d="M7 5h3.5v14H7zm6.5 0H17v14h-3.5z" fill="currentColor"/>'),
  acoes: svg('<path d="M7 5v14l11-7z" fill="currentColor"/>'),
  respostas: svg('<path d="M3 5.5v13l8.5-6.5zm9 0v13l8.5-6.5z" fill="currentColor"/>'),
  afeta: svg('<path d="M2 6v12l7.5-6zm7.5 0v12L17 12z" fill="currentColor"/><path d="M19.5 9.5 22 10.6v2.2c0 1.6-1.1 3-2.5 3.5-1.4-.5-2.5-1.9-2.5-3.5v-2.2z" fill="currentColor"/>'),
  turno: svg('<path d="M4 5.5v13l8.5-6.5zm8.5 0v13L21 12zM20 5h2v14h-2z" fill="currentColor"/>'),
};

/** O selo junto dos botões: mostra o nível (ou o atalho ligado) e abre a troca rápida. */
export function passLevelBadgeHTML(level: PassLevel, opts: { passingTurn: boolean; open: boolean; busy: boolean }): string {
  const name = passLevelInfo(level).name;
  const label = opts.passingTurn ? `Passando até o fim do turno. Nível: ${name}. Trocar ou parar` : `Passar automaticamente: ${name}. Trocar nível`;
  return `<button type="button" class="pass-level${opts.passingTurn ? ' passing' : ''}" data-ui="pass-level" data-level="${level}" aria-haspopup="dialog" aria-expanded="${opts.open}" aria-controls="fPassMenu" aria-label="${esc(label)}" title="${esc(opts.passingTurn ? 'Passando até o fim do turno' : `Passar automaticamente: ${name}`)}"${opts.busy ? ' aria-busy="true"' : ''}>${ICONS[opts.passingTurn ? 'turno' : level]}</button>`;
}

/**
 * Menu da troca rápida: os quatro níveis e o atalho de uma vez só. `shortcut`: 'on' quando o atalho está ligado,
 * 'available' quando dá para ligar agora (prioridade no turno de outro jogador), 'mine' no seu turno e 'off' fora da prioridade.
 */
export function passMenuHTML(level: PassLevel, shortcut: 'on' | 'available' | 'mine' | 'off'): string {
  const levels = PASS_LEVELS.map(info => `<button type="button" class="pass-level-option" role="radio" data-pass-level="${info.id}" aria-checked="${info.id === level}">${ICONS[info.id]}<span><strong>${esc(info.name)}</strong><small>${esc(info.hint)}</small></span></button>`).join('');
  const turn = shortcut === 'on'
    ? `<button type="button" class="pass-turn-shortcut on" data-ui="pass-turn-stop">${ICONS.turno}<span><strong>Parar de passar</strong><small>Desliga o Passar até o fim do turno e volta ao nível escolhido.</small></span></button>`
    : `<button type="button" class="pass-turn-shortcut" data-ui="pass-turn-shortcut"${shortcut === 'available' ? '' : ' disabled'}>${ICONS.turno}<span><strong>Passar até o fim do turno</strong><small>${shortcut === 'mine' ? 'No seu turno, use Fim de turno.' : 'Uma vez só: volta ao nível escolhido quando o turno acaba ou quando algo afeta você.'}</small></span></button>`;
  return `<p class="stop-menu-title" id="fPassMenuTitle">Passar automaticamente</p>
    <div class="pass-level-options" role="radiogroup" aria-labelledby="fPassMenuTitle">${levels}</div>
    <div class="pass-menu-divider" aria-hidden="true"></div>${turn}
    <p class="stop-menu-hint">${esc(PASS_LEVEL_ALWAYS)}</p>`;
}
