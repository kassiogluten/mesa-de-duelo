// Ícones da interface (SVG em texto): mesa, tela inicial e menus. Ícone novo entra aqui; o que for igual a um que já existe, reaproveite.

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
  STUN: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 12a1.5 1.5 0 0 1 3 0 3 3 0 0 1-6 0 4.5 4.5 0 0 1 9 0 6 6 0 0 1-12 0 7.5 7.5 0 0 1 15 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  CHARGE: svg('M2 7h16v10H2zm2 2v6h12V9z', 'M19 10h2.5v4H19z', 'M5.5 10.5H8v3H5.5zm3.75 0h2.5v3h-2.5zm3.75 0h2.5v3H13z'),
  LORE: svg('M4 4h7a3 3 0 0 1 1 .2V20a3 3 0 0 0-1-.2H4zm16 0h-7a3 3 0 0 0-1 .2V20a3 3 0 0 1 1-.2h7z'),
  TIME: svg('M6 2h12v5l-4 5 4 5v5H6v-5l4-5-4-5zm2 2v2.3l4 5 4-5V4z'),
  OIL: svg('M12 2c3 4.5 6 8 6 12a6 6 0 0 1-12 0c0-4 3-7.5 6-12z'),
};
export const ICON_LAYERS = svg('M12 2 2 7l10 5 10-5z', 'm2 12 2.4-1.2L12 14.6l7.6-3.8L22 12l-10 5z', 'm2 17 2.4-1.2L12 19.6l7.6-3.8L22 17l-10 5z');
export const COUNTER_DISC = svg('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10z');

/** Com recortes (olhos da caveira, penas da asa): os furos saem pelo evenodd. */
const svgEo = (...ds: string[]) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ds.map(d => `<path d="${d}" fill="currentColor" fill-rule="evenodd"/>`).join('')}</svg>`;
/** Espada apontando para cima e à direita, e o risco do golpe ao lado: Iniciativa e Golpe duplo. */
const SWORD = 'M21 3l-.9 4.6-8.6 8.6-3.7-3.7 8.6-8.6zM5.2 12.2l1.3-1.3 6.6 6.6-1.3 1.3zM7.6 16.4l-1.3-1.3-3 3 1.3 1.3zM3.2 19a1.3 1.3 0 1 0 1.8 1.8 1.3 1.3 0 0 0-1.8-1.8z';
const SLASH = 'M21.5 9.5c.2 6.3-4 11.6-10.5 13 4.5-3 8-7.5 10.5-13z';
/** Ícone de cada palavra-chave mostrada na carta do campo. */
export const KEYWORD_ICON: Record<string, string> = {
  FLYING: svgEo('M2.5 21C3 13 8.5 5 21.5 2.5 20.5 6 17.5 8 13 9 9 10 5.5 14 2.5 21z', 'M5.6 19.4C8 14.5 11 11.3 15 10.6c2-.3 4-.8 5.6-1.8-1.4 3-4.1 4.5-7.6 4.9-2.5.3-5 2-7.4 5.7z', 'M8 20c2-2.6 4-4 6.5-4.4 1.5-.2 2.8-.4 4-.8-1.8 3-5.5 5-10.5 5.2z'),
  /** Arco armado com a flecha, inclinado como os outros ícones. */
  REACH: '<svg viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate(45 12 12) translate(.96 .96) scale(.92)">'
    + '<path d="M2.5 15Q12 2.5 21.5 15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'
    + '<path d="M2.5 15 12 19.2 21.5 15" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>'
    + '<path d="M12 20.5V6" stroke="currentColor" stroke-width="1.9"/><path d="M12 1 16 7.5H8zm0 18.8L9 23h2l1-1.4 1 1.4h2z" fill="currentColor"/></g></svg>',
  TRAMPLE: svgEo('M12 23c-3.8 0-6-2.6-5.4-6.2L3.2 9.5 3 4.2l3.6 4.4 2.6 5 1.3-.9.3-7.3L12 1l1.2 4.4.3 7.3 1.3.9 2.6-5L21 4.2l-.2 5.3-3.4 7.3c.6 3.6-1.6 6.2-5.4 6.2z'),
  MENACE: svgEo('M12 22.5 5.2 15 1.5 12.2l3.8-1.6L3 2.5l6.2 3.6L12 1.5l2.8 4.6L21 2.5l-2.3 8.1 3.8 1.6-3.7 2.8zM6.8 10.6l4.4 2.2-.9 2c-2-.2-3.2-1.9-3.5-4.2zm10.4 0-4.4 2.2.9 2c2-.2 3.2-1.9 3.5-4.2z'),
  FIRST_STRIKE: svgEo(SWORD, SLASH),
  DOUBLE_STRIKE: `<svg viewBox="0 0 24 24" aria-hidden="true">${[[-1.6, 1.4], [3.4, 2.4]].map(([x, y]) => `<path transform="translate(${x} ${y}) scale(.78)" d="${SWORD}" fill="currentColor" fill-rule="evenodd"/>`).join('')}<path d="${SLASH}" fill="currentColor"/></svg>`,
  DEATHTOUCH: svgEo('M12 1.5c-5.2 0-9 3.6-9 8.6 0 3 1.4 5.3 3.6 6.5l.4 2.9 1.9-1.2.9 3 1.6-2 1.6 2 .9-3 1.9 1.2.4-2.9c2.2-1.2 3.6-3.5 3.6-6.5 0-5-3.8-8.6-9-8.6zM5.8 9.4l5.2 2-1 3c-2.6 0-4.3-2.1-4.2-5zm12.4 0-5.2 2 1 3c2.6 0 4.3-2.1 4.2-5zM12 14.6l1.3 2.6h-2.6z'),
  LIFELINK: svg('M12 21 3.5 12.5A5 5 0 0 1 12 6a5 5 0 0 1 8.5 6.5z'),
  VIGILANCE: svg('M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8z'),
  HASTE: '<svg viewBox="0 0 24 24" aria-hidden="true"><path transform="translate(1.5 0) scale(.94)" d="M5.5 2h8.5v2.5h-.5v6.7c3.3 1 6 2.4 7.1 3.6.6.7.9 1.5.9 2.4V19H6.5V4.5h-1zM5.5 20h16.5v2H5.5z" fill="currentColor"/><path d="M1 8h5.5v2H1zm1 4h4.5v2H2zm1 4h3.5v2H3z" fill="currentColor"/></svg>',
  DEFENDER: svg('M2 5h9v4H2zm11 0h9v4h-9zM2 11h5v4H2zm7 0h6v4H9zm8 0h5v4h-5zM2 17h9v4H2zm11 0h9v4h-9z'),
  HEXPROOF: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" stroke-width="2"/><circle cx="12" cy="12" r="7" stroke-width="1.2" stroke-dasharray="9.5 1.5"/><path d="M7.3 9.2h9.4L12 17.2z" stroke-width="1.9" stroke-linejoin="round"/></svg>',
  SHROUD: svg('M12 2a9 9 0 0 0-9 9v11l3-2 3 2 3-2 3 2 3-2 3 2V11a9 9 0 0 0-9-9z'),
  WARD: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10" stroke-width="2"/><circle cx="12.0" cy="8.6" r="4.6"/><circle cx="14.9" cy="13.7" r="4.6"/><circle cx="9.1" cy="13.7" r="4.6"/></svg>',
  INDESTRUCTIBLE: svg('M6 3h12l4 6-10 12L2 9z'),
  PROTECTION: svg('M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5zm0 2.2 6 2.2V11c0 4-2.6 7.6-6 8.9-3.4-1.3-6-4.9-6-8.9V6.4z'),
};


export const EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c7 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
export const FOCUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><circle cx="12" cy="12" r="3"/></svg>';
export const EXPAND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>';

export const inspectIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6m-3-3v6"/></svg>';

export const HIDDEN_EYE = '<span class="hidden-eye" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></span>';

// Tela inicial e menus.
export const ICON_EYE_LOBBY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
export const ICON_MORE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
export const ICON_REFRESH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const ICON_PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z M13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
export const ICON_DOTS = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
export const ICON_BALLOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4V5Z"/></svg>';
/** Rever partidas (menu ⋯): o botão de tocar com a seta de voltar. */
export const ICON_REPLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 9v6l5-3z" fill="currentColor"/></svg>';
export const ICON_TABLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v10H3zM7 17v3M17 17v3M8 11h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const ICON_FLASK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
