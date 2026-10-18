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
  /** Modo "Arte e texto": arte recortada do Scryfall, texto de regras e lealdade. */
  style?: CardStyle;
  art?: string;
  text?: string;
  loyalty?: number;
}

/** Como as cartas aparecem na mesa: imagem completa do Scryfall ou arte recortada com layout próprio. */
export type CardStyle = 'full' | 'art';

/** Carta desenhada: imagem do Scryfall por cima de uma moldura em CSS que aparece se a imagem faltar. */
export function faceHTML(f: FaceInfo) {
  if (f.style === 'art') return artFaceHTML(f);
  return `<div class="face col-${f.color}">
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
  return `<div class="face art-face col-${f.color}${basic ? ' basic' : ''}">
    <div class="af-head"><span class="af-name">${esc(f.name)}</span><span class="af-cost">${manaHTML(f.manaCost)}</span></div>
    <div class="af-art">${f.art ? `<img src="${f.art}" alt="" draggable="false" loading="lazy" onerror="this.remove()">` : ''}</div>
    ${basic ? '' : `<div class="af-type">${esc(f.typeLine)}</div>${f.text ? `<div class="af-text">${richText(f.text).replace(/\n/g, '<br>')}</div>` : ''}`}
    ${stat}
  </div>`;
}

export function colorFromCost(manaCost: string, land: boolean): string {
  const cols = new Set((manaCost.match(/[WUBRG]/g) ?? []));
  if (cols.size > 1) return 'M';
  if (cols.size === 1) return [...cols][0];
  return land ? 'L' : 'C';
}
