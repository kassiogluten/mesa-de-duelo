// A cena da mesa viva tirada da mesa desenhada: o campo de quem joga o turno, a cor do deck dele (da arte do tapete, ou da capa), a sua vida baixa e o combate.
import type { FState } from '../forge/client';
import type { AmbienceScene } from './gpu/tableAmbience';

/**
 * Quanto a sua vida pesa na vinheta: nada acima de um quarto da vida inicial (5 de 20, 10 de 40), subindo até 1 com
 * 1 de vida ou menos.
 */
export function lowLifeDanger(life: number, starting: number) {
  const threshold = Math.max(5, Math.round(starting / 4));
  if (life > threshold) return 0;
  return Math.min(1, (threshold - life + 1) / threshold);
}

/** "#e3b363" ou "rgb(227, 179, 99)" em [r, g, b] de 0 a 1; null se não der para ler. */
export function parseColor(value: string): [number, number, number] | null {
  const v = value.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) { const n = parseInt(hex[1]!, 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(v);
  return rgb ? [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255] : null;
}

const sleeveTones = new Map<string, [number, number, number] | null>();
/** A cor clara da capa de um jogador (as variáveis --sleeve-* de `sleeve-N`, no style.css), lida uma vez por tema. */
function sleeveTone(root: HTMLElement, sleeve: number | undefined) {
  if (!Number.isInteger(sleeve)) return null;
  const key = `${sleeve}:${document.documentElement.dataset.tema ?? ''}`;
  if (!sleeveTones.has(key)) {
    const probe = document.createElement('i');
    probe.className = `sleeve-${sleeve}`; probe.hidden = true;
    root.append(probe);
    sleeveTones.set(key, parseColor(getComputedStyle(probe).getPropertyValue('--sleeve-light')));
    probe.remove();
  }
  return sleeveTones.get(key)!;
}

/**
 * A cor de uma arte, para a luz: a média dos pixels pesada pela saturação (o céu cinza e a sombra pesam pouco), clareada
 * até o canal mais forte chegar a 0,95. Null se a arte é quase sem cor.
 */
export function vividAverage(pixels: ArrayLike<number>): [number, number, number] | null {
  let r = 0, g = 0, b = 0, total = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const pr = pixels[i]! / 255, pg = pixels[i + 1]! / 255, pb = pixels[i + 2]! / 255;
    const max = Math.max(pr, pg, pb), min = Math.min(pr, pg, pb);
    const weight = (max ? (max - min) / max : 0) ** 2 * max;
    r += pr * weight; g += pg * weight; b += pb * weight; total += weight;
  }
  // Quase sem cor (peso médio por pixel muito baixo): fica a cor da capa.
  if (total < .02 * (pixels.length / 4)) return null;
  const top = Math.max(r, g, b) / total || 1;
  return [r / total / top * .95, g / total / top * .95, b / total / top * .95];
}

const artTones = new Map<string, [number, number, number] | null | 'loading'>();
/** A cor da arte do tapete, calculada uma vez por arte; enquanto a imagem carrega (ou sem CORS), null. */
function artTone(url: string | undefined) {
  if (!url) return null;
  const known = artTones.get(url);
  if (known !== undefined) return known === 'loading' ? null : known;
  artTones.set(url, 'loading');
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 24;
      const g = canvas.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, 0, 0, 24, 24);
      artTones.set(url, vividAverage(g.getImageData(0, 0, 24, 24).data));
    } catch { artTones.set(url, null); }
  };
  img.onerror = () => artTones.set(url, null);
  img.src = url;
  return null;
}
/** A arte do tapete de um campo (`--mat: url(...)`, de seatView.ts), se o tapete está ligado. */
function matArt(seat: Element | null | undefined) {
  const mat = seat?.querySelector<HTMLElement>('.playmat');
  return /url\((["']?)(.*?)\1\)/.exec(mat?.style.getPropertyValue('--mat') ?? '')?.[2];
}

/** A cena para `visual` (o estado que a mesa desenhou, já no quadro da jogada que está sendo mostrada). */
export function ambienceScene(root: HTMLElement, visual: FState, commander: boolean): AmbienceScene {
  const active = visual.players.find(p => p.id === visual.activePlayer);
  const seat = active && (active.id === visual.you ? root.querySelector<HTMLElement>('.field.me')
    : root.querySelector<HTMLElement>(`[data-seat-player="${active.id}"]`) ?? root.querySelector<HTMLElement>('.field.opp'));
  const r = seat?.getBoundingClientRect();
  const focus = r && r.width ? { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight } : { x: .5, y: .5 };
  const gold = parseColor(getComputedStyle(root).getPropertyValue('--gold')) ?? [.85, .72, .45];
  const me = visual.players.find(p => p.id === visual.you);
  return {
    focus,
    tone: artTone(matArt(seat)) ?? sleeveTone(root, active?.sleeve) ?? gold,
    danger: me && !visual.spectating && !me.eliminated ? lowLifeDanger(me.life, commander ? 40 : 20) : 0,
    combat: !!visual.combat?.length,
  };
}
