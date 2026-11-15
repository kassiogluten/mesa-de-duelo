// Ícones e ilustrações da página Torneios, em SVG no traço dourado da mesa (só esta página os usa).
export { ICON_TROPHY, ICON_PENCIL, ICON_FLAG, ICON_CROWN } from '../ui/icons';

const icon = (paths: string) => `<svg class="tn-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

/** Copiar link: dois elos. */
export const ICON_LINK = icon('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>');
/** Sortear: setas que se cruzam. */
export const ICON_SHUFFLE = icon('<path d="M3 7h3.5c2.5 0 4 1.3 5.5 5s3 5 5.5 5H21M3 17h3.5c1.4 0 2.5-.4 3.4-1.3M14.1 8.3C15 7.4 16.1 7 17.5 7H21"/><path d="m18 4 3 3-3 3M18 14l3 3-3 3"/>');
/** Rodada extra: mais. */
export const ICON_PLUS = icon('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>');
/** Relógio: iniciar, pausar, recomeçar e tela cheia. */
export const ICON_PLAY = icon('<path d="M8 5v14l11-7z"/>');
export const ICON_PAUSE = icon('<path d="M8 5v14M16 5v14"/>');
export const ICON_RESET = icon('<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6"/>');
export const ICON_SCREEN = icon('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>');
/** Desfazer o sorteio. */
export const ICON_UNDO = icon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>');
/** Reabrir: cadeado aberto. */
export const ICON_UNLOCK = icon('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>');
/** Inscrever: pessoa com +. */
export const ICON_USER_PLUS = icon('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"/>');
/** Sair do torneio: porta com seta. */
export const ICON_EXIT = icon('<path d="M14 4H6v16h8M10 12h11M18 9l3 3-3 3"/>');
/** Voltar ao torneio. */
export const ICON_ENTER = icon('<path d="M10 4h8v16h-8M3 12h11M11 9l3 3-3 3"/>');
/** Tirar da lista. */
export const ICON_X = icon('<path d="M6 6l12 12M18 6 6 18"/>');
/** Rodada: duas espadas cruzadas. */
export const ICON_SWORDS = icon('<path d="M4 4l9.5 9.5M4 4h3.5L17 13.5M4 4v3.5L13.5 17M20 4l-6 6M20 4h-3.5l-3 3M20 4v3.5l-3 3M14.5 16.5 17 19l2-2-2.5-2.5M9.5 16.5 7 19l-2-2 2.5-2.5"/>');
/** Classificação: pódio. */
export const ICON_PODIUM = icon('<path d="M9 21V9h6v12M3 21v-7h6M15 21v-5h6v5M2 21h20M12 3l.9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3z"/>');
/** Jogadores. */
export const ICON_USERS = icon('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>');
/** Rodadas anteriores: relógio. */
export const ICON_HISTORY = icon('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>');
/** Apagar torneio. */
export const ICON_TRASH = icon('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>');
/** Salvar. */
export const ICON_CHECK = icon('<path d="m5 12 5 5 9-10"/>');

// ---------- Ilustrações dos estados vazios ----------

/** Moldura comum: 160×110, traço dourado com preenchimento azul translúcido, decorativa. */
const ill = (body: string) => `<svg class="tn-ilustra" viewBox="0 0 160 110" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const estrela = (x: number, y: number, r = 3) => `<path class="tn-il-brilho" d="M${x} ${y - r}v${2 * r}M${x - r} ${y}h${2 * r}"/>`;

/** Nenhum torneio ainda: troféu entre duas cartas. */
export const ILL_TROFEU = ill(`
  <rect class="tn-il-carta" x="18" y="34" width="34" height="48" rx="4" transform="rotate(-12 35 58)"/>
  <rect class="tn-il-carta" x="108" y="34" width="34" height="48" rx="4" transform="rotate(12 125 58)"/>
  <path class="tn-il-ouro" d="M62 22h36v18a18 18 0 0 1-36 0V22Z"/>
  <path class="tn-il-traco" d="M62 28H52a10 10 0 0 0 12 13M98 28h10a10 10 0 0 1-12 13M80 58v12M68 86h24M72 78h16v8H72z"/>
  ${estrela(48, 18)}${estrela(116, 14, 4)}${estrela(132, 90, 2.5)}${estrela(28, 94, 2.5)}`);

/** Nenhum jogador: mesa com duas cadeiras vazias. */
export const ILL_MESA = ill(`
  <ellipse class="tn-il-carta" cx="80" cy="64" rx="46" ry="18"/>
  <path class="tn-il-traco" d="M48 74v18M112 74v18"/>
  <rect class="tn-il-ouro" x="70" y="52" width="20" height="14" rx="2"/>
  <path class="tn-il-traco tn-il-vazio" d="M18 50a8 8 0 1 1 16 0M14 74c0-9 6-14 12-14s12 5 12 14M126 50a8 8 0 1 1 16 0M122 74c0-9 6-14 12-14s12 5 12 14"/>
  ${estrela(80, 26, 4)}${estrela(60, 34, 2.5)}${estrela(102, 32, 2.5)}`);

/** Classificação ainda vazia: pódio em contorno. */
export const ILL_PODIO = ill(`
  <path class="tn-il-carta" d="M58 50h44v44H58zM22 66h36v28H22zM102 74h36v20h-36z"/>
  <path class="tn-il-traco" d="M14 94h132"/>
  <path class="tn-il-ouro" d="m80 18 4.4 9 9.9 1.4-7.2 7 1.7 9.8L80 40.6l-8.8 4.6 1.7-9.8-7.2-7 9.9-1.4z"/>
  <path class="tn-il-traco tn-il-vazio" d="M80 66v12M40 76v8M120 82v4"/>
  ${estrela(46, 30)}${estrela(116, 34, 2.5)}`);
