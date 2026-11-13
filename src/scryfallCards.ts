import ownArt from './own-art.json' with { type: 'json' };
import { EVENTS, KEYS } from './storage';
import { API } from './scryfallApi';

/** Como as cartas do Scryfall ficam guardadas: só os campos que o jogo usa, com as faces e a impressão em português. */
export type Images = { small?: string; normal?: string; art_crop?: string };

/**
 * Versão do formato guardado no cache. Cartas de duas faces salvas antes da v2 ficaram sem imagem
 * (o Scryfall põe as imagens dentro de cada face) e são buscadas de novo.
 */
export const FORMAT = 3;
const LEGALITY_TTL = 24 * 60 * 60 * 1000;

/** Subconjunto dos campos do Scryfall que o jogo usa. */
export interface ScryCard {
  name: string;
  oracle_id?: string;
  cmc?: number;
  rarity?: string;
  legalities?: Record<string, 'legal' | 'not_legal' | 'restricted' | 'banned'>;
  fetchedAt?: number;
  layout: string;
  mana_cost?: string;
  type_line: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  colors?: string[];
  color_identity?: string[];
  image_uris?: { small?: string; normal?: string; art_crop?: string };
  faces?: boolean;
  /** Nome e imagem de cada face (cartas de duas faces: o Forge chama a carta pelo nome da face visível). */
  faceNames?: string[];
  faceImages?: (Images | undefined)[];
  /** Impressão em português, quando existe. */
  pt?: { name?: string; type_line?: string; text?: string; image_uris?: Images; faceNames?: string[]; faceImages?: (Images | undefined)[] };
  /** Já procuramos a impressão em português (achando ou não). */
  ptChecked?: boolean;
  v?: number;
}

export const images = (u: any): Images | undefined => u && { small: u.small, normal: u.normal, art_crop: u.art_crop };
/**
 * Arte padrão dos terrenos básicos: a série Nyx de arte cheia de Sam Burley, de Theros Beyond Death (THB 250–254).
 * Vale em todas as telas, inclusive no lugar da impressão em português.
 */
const BASIC_ART: Record<string, string> = { plains: '250', island: '251', swamp: '252', mountain: '253', forest: '254' };
const basicImages = (num: string): Images => {
  const url = (version: string) => `${API}/cards/thb/${num}?format=image&version=${version}`;
  return { small: url('small'), normal: url('normal'), art_crop: url('art_crop') };
};
/**
 * Cartas com arte própria da mesa: a carta inteira de uma série da mesa (public/cartas, gerada por npm run arte), em
 * português. Ligada por padrão; desligada nas Opções, os terrenos
 * voltam à série Nyx e as outras à imagem do Scryfall.
 */
const OWN_ART = new Set((ownArt as string[]).map(n => n.toLowerCase()));
const ownImages = (name: string): Images => {
  const url = (size: string) => `/cartas/${name.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${size}.webp`;
  return { small: url('small'), normal: url('normal'), art_crop: url('art') };
};
/** As cartas da mesa na ordem da série (a de src/own-art.json), com as imagens de cada uma, para a galeria. */
export const ownArtCards = () => (ownArt as string[]).map(name => ({ name, images: ownImages(name.toLowerCase()) }));
let ownArtOn = true;
try { ownArtOn = localStorage.getItem(KEYS.ownArt) !== 'off'; } catch { /* Storage is optional. */ }
export const ownArtEnabled = () => ownArtOn;
export function setOwnArtEnabled(on: boolean) {
  ownArtOn = on;
  try { localStorage.setItem(KEYS.ownArt, on ? 'on' : 'off'); } catch { /* Storage is optional. */ }
  if (typeof dispatchEvent === 'function') dispatchEvent(new CustomEvent(EVENTS.ownArt));
}
/** A imagem padrão da mesa: a arte própria (se ligada), senão a série Nyx nos terrenos básicos; as demais, a do Scryfall. */
export function withDefaultArt(c: ScryCard): ScryCard {
  const name = c.name.toLowerCase();
  const own = ownArtOn && OWN_ART.has(name), num = BASIC_ART[name];
  if (!own && !num) return c;
  return { ...c, image_uris: own ? ownImages(name) : basicImages(num!), pt: c.pt && { ...c.pt, image_uris: undefined } };
}

/** Cartas que o Forge escreve diferente do Scryfall: nome do Forge (minúsculas) → nome do Scryfall. */
const FORGE_NAMES: Record<string, string> = { 'all good things . . .': 'All Good Things...' };
/** O /cards/collection não acha "Frente // Verso" (nem cartas divididas como "Fire // Ice"), só o nome da frente. */
export const lookupName = (name: string) => FORGE_NAMES[name.toLowerCase()] ?? name.split(' // ')[0]!;
/** O nome como o Forge o escreve, quando é diferente do do Scryfall ("All Good Things..." → "All Good Things . . ."). */
export const forgeSpelling = (name: string) => Object.keys(FORGE_NAMES).find(k => FORGE_NAMES[k] === name) ?? null;
const noScan = (c: any) => c.image_status === 'placeholder' || c.image_status === 'missing';

/** Nome, tipo, texto e imagem de uma impressão em português (cartas de duas faces juntam as faces). */
export function slimPt(c: any): ScryCard['pt'] {
  const faces: any[] = Array.isArray(c.card_faces) ? c.card_faces : [];
  const join = (k: string, sep: string) => faces.map(f => f[k]).filter(Boolean).join(sep) || undefined;
  // Sem scan da impressão traduzida o Scryfall devolve um aviso no lugar da arte; aí vale a imagem em inglês.
  const faceImages = noScan(c) ? undefined : faces.map(f => images(f.image_uris));
  return {
    name: c.printed_name ?? join('printed_name', ' // '),
    type_line: c.printed_type_line ?? join('printed_type_line', ' // '),
    text: c.printed_text ?? join('printed_text', '\n—\n'),
    image_uris: noScan(c) ? undefined : images(c.image_uris) ?? faceImages?.[0],
    faceNames: faces.length ? faces.map(f => f.printed_name) : undefined,
    faceImages: faceImages?.length ? faceImages : undefined,
  };
}

export function slim(c: any): ScryCard {
  const pt = c.lang === 'pt';
  const faces: any[] = Array.isArray(c.card_faces) ? c.card_faces : [];
  const faceImages = noScan(c) ? [] : faces.map(f => images(f.image_uris));
  return {
    v: FORMAT,
    name: c.name,
    oracle_id: c.oracle_id,
    cmc: c.cmc,
    rarity: c.rarity,
    legalities: c.legalities,
    fetchedAt: Date.now(),
    layout: c.layout,
    mana_cost: c.mana_cost ?? faces[0]?.mana_cost,
    type_line: c.type_line,
    oracle_text: c.oracle_text ?? (faces.length ? faces.map(f => `${f.name}\n${f.oracle_text ?? ''}`).join('\n—\n') : undefined),
    power: c.power,
    toughness: c.toughness,
    colors: c.colors,
    color_identity: c.color_identity,
    image_uris: noScan(c) ? undefined : images(c.image_uris) ?? faceImages[0],
    faces: faces.length > 0 || undefined,
    faceNames: faces.length ? faces.map(f => f.name) : undefined,
    faceImages: faceImages.some(Boolean) ? faceImages : undefined,
    pt: pt ? slimPt(c) : undefined,
    ptChecked: pt || undefined,
  };
}

export function legalityFresh(card: ScryCard): boolean {
  return !!card.legalities && !!card.fetchedAt && Date.now() - card.fetchedAt < LEGALITY_TTL;
}

export const validCard = (c: any): c is ScryCard => !!c && c.v === FORMAT && typeof c.name === 'string' && typeof c.type_line === 'string' && typeof c.layout === 'string';

/** Impressão de uma carta no Scryfall: código da série (em minúsculas) e número de coleção. */
export interface Printing { set: string; cn?: string }
export type PrintImages = { image_uris?: Images; faceNames?: string[]; faceImages?: (Images | undefined)[] };
export const printKey = (name: string, p: Printing) => `${p.set}/${p.cn ?? name}`.toLowerCase();

export function withPrinting(card: ScryCard, name: string, p: PrintImages): ScryCard {
  const face = p.faceNames?.findIndex(f => f.toLowerCase() === name.toLowerCase()) ?? -1;
  return { ...card, image_uris: (face >= 0 ? p.faceImages?.[face] : undefined) ?? p.image_uris, faceImages: p.faceImages ?? card.faceImages,
    pt: card.pt && { ...card.pt, image_uris: undefined, faceImages: undefined } };
}

/** A carta vista por uma das faces: imagem e nome em português daquela face. */
export function faceView(card: ScryCard, i: number): ScryCard {
  return {
    ...card,
    image_uris: card.faceImages?.[i] ?? card.image_uris,
    pt: card.pt && { ...card.pt, name: card.pt.faceNames?.[i] ?? card.pt.name, image_uris: card.pt.faceImages?.[i] ?? card.pt.image_uris },
  };
}

/** Registro guardado pelo nome de uma face, e não pelo nome da própria carta. */
export const isFaceAlias = (key: string, c: ScryCard) => c.name.toLowerCase() !== key;
