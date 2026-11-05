// Ícones da mesa (SVG em texto) e os nomes dos marcadores e palavras-chave que aparecem nas cartas do campo.
import type { FCard } from '../forge/client';
import { counterName } from './proliferate';

export const ICON_SWORD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 3H21v6.5L10 20.5l-2 .5-.5-2L18.5 8V5.5H16L5 16.5 3.5 15z" fill="currentColor"/></svg>';
export const ICON_CLIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 6.5 8.4 14.6a1.6 1.6 0 0 0 2.3 2.3l8.4-8.4a3.4 3.4 0 0 0-4.8-4.8L5.6 12.4a5.2 5.2 0 0 0 7.4 7.4l7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
export const ICON_CROWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z" fill="currentColor"/></svg>';
export const ICON_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
export const ICON_HOME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 4l9 7M5.5 9.5V20h5v-6h3v6h5V9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/** Ícones mínimos no canto dos montes, para o cemitério (lápide) e o exílio (portal) não se confundirem de relance. */
export const PILE_ICON_GY = '<span class="pile-icon gy-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6.5 21V10.5a5.5 5.5 0 0 1 11 0V21M4 21h16M12 9.5v6M9.5 12h5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
export const PILE_ICON_EXILE = '<span class="pile-icon exile-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5A6 6 0 1 0 14.5 18a3.6 3.6 0 1 0-3.5-4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></span>';
export const ICON_FLAG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4m0 0h11l-2 4 2 4H5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const ICON_EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>';
/** Enjoo de invocação: estrelinhas girando em volta, como personagem tonto de desenho animado. */
export const ICON_DIZZY = '<svg class="dizzy" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-opacity=".3" stroke-width="1.2" stroke-dasharray="2 2.4"/><g class="dizzy-orbit">'
  + [[12, 5, 1], [18.06, 15.5, .75], [5.94, 15.5, .6]].map(([x, y, k]) => `<path transform="translate(${x} ${y}) scale(${k})" d="M0-4.2 1.1-1.1 4.2 0 1.1 1.1 0 4.2-1.1 1.1-4.2 0-1.1-1.1z" fill="#ffd66b"/>`).join('')
  + '</g></svg>';
export const ICON_SHIELD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" fill="currentColor"/></svg>';

const svg = (...ds: string[]) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ds.map(d => `<path d="${d}" fill="currentColor"/>`).join('')}</svg>`;
/** Ícone de cada tipo de marcador; os sem ícone próprio usam um disco. */
export const COUNTER_ICON: Record<string, string> = {
  P1P1: svg('M12 3 3 13h5v8h8v-8h5z'),
  M1M1: svg('M12 21 3 11h5V3h8v8h5z'),
  SHIELD: ICON_SHIELD,
  STUN: svg('m12 2 2.6 6.6L21 9l-5 4.6L17.5 21 12 17.3 6.5 21 8 13.6 3 9l6.4-.4z'),
  CHARGE: svg('M13 2 4 14h6l-1 8 9-12h-6z'),
  LORE: svg('M4 4h7a3 3 0 0 1 1 .2V20a3 3 0 0 0-1-.2H4zm16 0h-7a3 3 0 0 0-1 .2V20a3 3 0 0 1 1-.2h7z'),
  TIME: svg('M6 2h12v5l-4 5 4 5v5H6v-5l4-5-4-5zm2 2v2.3l4 5 4-5V4z'),
  OIL: svg('M12 2c3 4.5 6 8 6 12a6 6 0 0 1-12 0c0-4 3-7.5 6-12z'),
};
export const ICON_LAYERS = svg('M12 2 2 7l10 5 10-5z', 'm2 12 2.4-1.2L12 14.6l7.6-3.8L22 12l-10 5z', 'm2 17 2.4-1.2L12 19.6l7.6-3.8L22 17l-10 5z');
export const COUNTER_DISC = svg('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10z');

/** Ícone de cada palavra-chave mostrada na carta do campo. */
export const KEYWORD_ICON: Record<string, string> = {
  FLYING: svg('M2 12c4-1 7-4 9-9 1 4 0 8-2 10 3-1 6-1 9 1-3 0-6 1-8 3 2 0 4 1 5 3-5 1-10 0-13-8z'),
  REACH: svg('M14.85 19.05Q15.5 8.5 4.95 9.15 12.7 11.3 14.85 19.05z', 'M4.95 9.15 14.85 19.05 14.28 19.62 4.38 9.72z', 'M3 20 17 6 18 7 4 21z', 'M21 3 19 9 15 5z', 'M5.5 18.5 2 17.5 3.5 16zM5.5 18.5 6.5 22 8 20.5z'),
  TRAMPLE: svg('M3 5h4l6 7-6 7H3l6-7zm8 0h4l6 7-6 7h-4l6-7z'),
  MENACE: svg('M3 3l5 6h8l5-6-1 9a8 8 0 0 1-16 0zm6 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z'),
  FIRST_STRIKE: ICON_SWORD,
  DOUBLE_STRIKE: svg('M10 3h5v5L7 16l-2 .5.5-2L13 7V5h-2zM17 8h4v4l-7 7-2 .5.5-2L19 11V10h-1z'),
  DEATHTOUCH: svg('M12 2a8 8 0 0 0-8 8c0 3 1.5 5 3 6v4h10v-4c1.5-1 3-3 3-6a8 8 0 0 0-8-8zM8.5 9a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM10 17h1v2h-1zm3 0h1v2h-1z'),
  LIFELINK: svg('M12 21 3.5 12.5A5 5 0 0 1 12 6a5 5 0 0 1 8.5 6.5z'),
  VIGILANCE: svg('M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8z'),
  HASTE: svg('M13 2 4 14h6l-1 8 9-12h-6z'),
  DEFENDER: svg('M2 5h9v4H2zm11 0h9v4h-9zM2 11h5v4H2zm7 0h6v4H9zm8 0h5v4h-5zM2 17h9v4H2zm11 0h9v4h-9z'),
  HEXPROOF: svg('M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5zm-3 6 3 3 3-3 1.4 1.4-3 3 3 3L15 16.8l-3-3-3 3-1.4-1.4 3-3-3-3z'),
  SHROUD: svg('M12 2a9 9 0 0 0-9 9v11l3-2 3 2 3-2 3 2 3-2 3 2V11a9 9 0 0 0-9-9z'),
  WARD: svg('M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5zm0 5 4 5-4 5-4-5z'),
  INDESTRUCTIBLE: svg('M6 3h12l4 6-10 12L2 9z'),
  PROTECTION: svg('M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5zm0 2.2 6 2.2V11c0 4-2.6 7.6-6 8.9-3.4-1.3-6-4.9-6-8.9V6.4z'),
};

export const COUNTER_LABEL: Record<string, string> = { P1P1: '+1/+1', M1M1: '-1/-1', LOYALTY: 'Lealdade', SHIELD: 'Escudo', STUN: 'Atordoar' };
export const counterLabel = (k: string) => COUNTER_LABEL[k] ?? KEYWORD_LABEL[k] ?? counterName(k);

/** Palavras-chave que viram marcador na carta do campo. */
export const KEYWORD_LABEL: Record<string, string> = {
  FLYING: 'Voar', REACH: 'Alcance', TRAMPLE: 'Atropelar', MENACE: 'Ameaçar', FIRST_STRIKE: 'Iniciativa',
  DOUBLE_STRIKE: 'Golpe duplo', DEATHTOUCH: 'Toque mortífero', LIFELINK: 'Vínculo com a vida', VIGILANCE: 'Vigilância',
  HASTE: 'Ímpeto', DEFENDER: 'Defensor', HEXPROOF: 'Resistência à magia', SHROUD: 'Manto', WARD: 'Proteção contra alvos',
  INDESTRUCTIBLE: 'Indestrutível', PROTECTION: 'Proteção',
};
export const keywordsOf = (c: FCard) => (c.keywords ?? []).filter(k => KEYWORD_LABEL[k]);

export const EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c7 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
export const FOCUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><circle cx="12" cy="12" r="3"/></svg>';
export const EXPAND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>';

export const inspectIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6m-3-3v6"/></svg>';

export const HIDDEN_EYE = '<span class="hidden-eye" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></span>';
