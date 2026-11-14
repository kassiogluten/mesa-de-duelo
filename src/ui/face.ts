// Desenho da carta na mesa (imagem, arte e texto ou Arena) e a cor da moldura pelo custo.
import { esc, manaHTML, richText } from './cardtext';

export interface FaceInfo {
  name: string;
  manaCost: string;
  typeLine: string;
  power?: number;
  toughness?: number;
  creature: boolean;
  /** 'W' | 'U' | 'B' | 'R' | 'G' | 'M' (multicolor) | 'L' (terreno) | 'C' (incolor) */
  color: string;
  image?: string;
  /** Modos "Arte e texto" e "Arena": arte recortada do Scryfall (no Arena, só no campo), texto de regras e lealdade. */
  style?: CardStyle;
  art?: string;
  text?: string;
  loyalty?: number;
  /** Ficha: no estilo Arena, a moldura tem o topo arredondado. */
  token?: boolean;
  /** Carta de lembrete de uma permanente virada para baixo: sem a imagem (ou se ela não carregar), fica o verso. */
  back?: boolean;
  /** A imagem completa, em qualquer estilo: é ela que voa na camada GPU (`data-full`). */
  full?: string;
}

const fullAttr = (f: FaceInfo) => f.full ? ` data-full="${esc(f.full)}"` : '';

const BACK_LAYER = '<div class="back face-back" aria-hidden="true"></div>';

/**
 * Como as cartas aparecem na mesa: imagem completa do Scryfall, arte recortada com layout próprio, ou "Arena":
 * imagem completa na mão e nas escolhas e só a arte nas permanentes, com P/R e marcadores num rodapé.
 */
export type CardStyle = 'full' | 'art' | 'arena';

/** Carta desenhada: imagem do Scryfall por cima de uma moldura em CSS que aparece se a imagem faltar. */
export function faceHTML(f: FaceInfo) {
  if (f.style === 'art') return artFaceHTML(f);
  if (f.style === 'arena') return arenaFaceHTML(f);
  if (f.back) return `<div class="face col-${f.color}"${fullAttr(f)}>${BACK_LAYER}${f.image ? `<img src="${f.image}" alt="${esc(f.name)}" draggable="false" loading="lazy" onerror="this.remove()">` : ''}</div>`;
  return `<div class="face col-${f.color}"${fullAttr(f)}>
    <div class="fb">
      <div class="fb-head"><span class="fb-name">${esc(f.name)}</span><span class="fb-cost">${manaHTML(f.manaCost)}</span></div>
      <div class="fb-type">${esc(f.typeLine)}</div>
      ${f.creature ? `<div class="fb-pt">${f.power ?? 0}/${f.toughness ?? 0}</div>` : ''}
    </div>
    ${f.image ? `<img src="${f.image}" alt="${esc(f.name)}" draggable="false" loading="lazy" onerror="this.remove()">` : ''}
  </div>`;
}

/**
 * Layout próprio: nome e custo no topo, arte recortada, tipo, texto de regras e P/R ou lealdade. O tamanho do texto
 * acompanha a largura da carta; cartas pequenas (no campo) mostram só nome, custo, arte e P/R, e o texto inteiro
 * fica no inspetor. Terrenos básicos ficam só com a arte.
 */
function artFaceHTML(f: FaceInfo) {
  const basic = /\b(basic|básico)\b/i.test(f.typeLine) && /\b(land|terreno)\b/i.test(f.typeLine);
  const stat = f.loyalty !== undefined ? `<div class="af-stat af-loyalty">${f.loyalty}</div>`
    : f.creature ? `<div class="af-stat">${f.power ?? 0}/${f.toughness ?? 0}</div>` : '';
  return `<div class="face art-face col-${f.color}${basic ? ' basic' : ''}"${fullAttr(f)}>
    <div class="af-head"><span class="af-name">${esc(f.name)}</span><span class="af-cost">${manaHTML(f.manaCost)}</span></div>
    <div class="af-art">${f.back ? BACK_LAYER : ''}${f.art ? `<img src="${f.art}" alt="" draggable="false" loading="lazy" onerror="this.remove()">` : ''}</div>
    ${basic ? '' : `<div class="af-type">${esc(f.typeLine)}</div>${f.text ? `<div class="af-text">${richText(f.text).replace(/\n/g, '<br>')}</div>` : ''}`}
    ${stat}
  </div>`;
}

/** Moldura do estilo Arena pelo tipo da permanente, na ordem em que um tipo vence o outro (encantamento criatura é criatura). */
function arenaKind(f: Pick<FaceInfo, 'typeLine' | 'creature' | 'loyalty'>) {
  if (f.loyalty !== undefined || /\bplaneswalker\b/i.test(f.typeLine)) return 'planeswalker';
  if (f.creature || /\b(creature|criatura)\b/i.test(f.typeLine)) return 'creature';
  if (/\b(enchantment|encantamento)\b/i.test(f.typeLine)) return 'enchantment';
  if (/\b(artifact|artefato)\b/i.test(f.typeLine)) return 'artifact';
  if (/\b(land|terreno)\b/i.test(f.typeLine)) return 'land';
  return 'other';
}

/** Permanente no estilo Arena: a arte ocupa a carta inteira; P/R, lealdade e marcadores vêm da mesa, no rodapé. */
function arenaFaceHTML(f: FaceInfo) {
  return `<div class="face arena-face col-${f.color} ar-${arenaKind(f)}${f.token ? ' ar-token' : ''}"${fullAttr(f)}>${f.back ? BACK_LAYER : ''}
    ${f.art ? `<img src="${f.art}" alt="" draggable="false" loading="lazy" onerror="this.remove()">` : ''}
    <div class="ar-foot"></div>
  </div>`;
}

export function colorFromCost(manaCost: string, land: boolean): string {
  const cols = new Set((manaCost.match(/[WUBRG]/g) ?? []));
  if (cols.size > 1) return 'M';
  if (cols.size === 1) return [...cols][0]!;
  return land ? 'L' : 'C';
}
