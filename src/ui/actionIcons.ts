// O ícone ao lado do texto de cada botão da caixa de ação (passar, fim de turno, resolver, atacar, bloquear, pagar, desistir).
import { COUNTER_ICON, ICON_CLOSE, ICON_CROWN, ICON_EYE, ICON_FLAG, ICON_LAYERS, ICON_REFRESH, ICON_SHIELD, ICON_SWORD, KEYWORD_ICON } from './icons';

const stroke = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
/** Seta circular em volta: a resposta fica guardada ("Sempre sim", "Sempre não"). */
const always = (inner: string) => stroke(`M20 12a8 8 0 1 1-2.3-5.6M20 3.5V7h-3.5${inner}`);

export const ACTION_ICON = {
  /** Passar e "Para o combate", "Para a principal 2"...: o jogo avança. */
  pass: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15L19 12z" fill="currentColor"/></svg>',
  /** Fim de turno: avança até o fim (como o selo do nível "até o fim do turno"). */
  endTurn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5v13l8.5-6.5zm8.5 0v13L20 12zM19 5h2.2v14H19z" fill="currentColor"/></svg>',
  resolveAll: ICON_LAYERS,
  ok: stroke('M4.5 12.5 9.5 17.5 19.5 6.5'),
  cancel: ICON_CLOSE,
  alwaysYes: always('M8.5 12l2.5 2.5 4.5-5'),
  alwaysNo: always('M9.5 9.5l5 5m0-5-5 5'),
  attack: ICON_SWORD,
  block: ICON_SHIELD,
  /** Pagar automaticamente: a gota de mana. */
  mana: COUNTER_ICON.OIL!,
  life: KEYWORD_ICON.LIFELINK!,
  commander: ICON_CROWN,
  mulligan: ICON_REFRESH,
  result: ICON_FLAG,
  waiting: COUNTER_ICON.TIME!,
  showing: ICON_EYE,
};
export type ActionIcon = keyof typeof ACTION_ICON;

/** Os rótulos genéricos que o Forge manda (OK, Sim, Cancelar, Não...); as escolhas da carta ("Cara", "Azul", um modo) ficam sem ícone. */
export function guessActionIcon(label: string): ActionIcon | undefined {
  const text = label.trim().toLowerCase();
  if (/^(ok|sim|confirmar|pronto|concluído|aceitar|yes|done|confirm)$/.test(text)) return 'ok';
  if (/^(cancelar|não|desistir|recusar|no|cancel)$/.test(text)) return 'cancel';
  if (text === 'mulligan') return 'mulligan';
  return undefined;
}

export const actionIconHTML = (icon: ActionIcon | undefined) => icon ? `<span class="act-icon">${ACTION_ICON[icon]}</span>` : '';
