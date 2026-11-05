// O rosto de cada carta na mesa (imagem completa, arte e texto ou Arena; virada para baixo; o verso), as imagens que vêm do
// Scryfall por nome (pedidas aos poucos e redesenhadas quando chegam) e os nomes em português.
import type { FCard, FPlayer } from '../forge/client';
import { cacheGet, fetchByNames, fetchPrintings } from '../scryfall';
import { colorFromCost, faceHTML, type CardStyle } from './face';
import { faceDownReminder } from './faceDownReminder';
import { sleeveClass } from './sleeves';
import { HIDDEN_EYE } from './tableIcons';

/** Nome, tipo e texto impressos em português, quando o Scryfall tem a tradução. */
export const ptOf = (name: string | undefined) => (name ? cacheGet(name)?.pt : undefined);
export const label = (c: FCard) => ptOf(c.name)?.name || c.name || (c.hiddenFace?.name ? `${ptOf(c.hiddenFace.name)?.name || c.hiddenFace.name} (virada para baixo)` : 'Carta');
/** A carta virada para baixo como você a vê: com a frente, quando pode olhá-la. */
export const seenFace = (c: FCard): FCard => c.faceDown && c.hiddenFace?.name ? { ...c, ...c.hiddenFace, faceDown: false } : c;
/** "Emblem — Kaito, Bane of Nightmares" → "Kaito, Bane of Nightmares" (o planeswalker que gerou o emblema). */
export const emblemSource = (c: FCard) => (c.name ?? '').replace(/^Emblem\s*[—–-]\s*/i, '');
export const emblemLabel = (c: FCard) => `Emblema de ${ptOf(emblemSource(c))?.name || emblemSource(c)}`;

/**
 * cardStyle: o estilo escolhido nas Opções; sleeve: a cor do verso de cada jogador; rerender: a mesa de novo, quando chega
 * uma imagem (só depois de soltar o dedo ou o mouse, para não trocar a carta no meio do clique).
 */
export function createCardFaces(root: HTMLElement, o: { cardStyle(): CardStyle; sleeve(playerId: number | undefined): FPlayer['sleeve']; rerender(): void }) {
  const wanted = new Set<string>();
  /** Nomes já pedidos ao Scryfall: o que ele não conhece (fichas, nomes do Forge) não é pedido de novo a cada desenho. */
  const asked = new Set<string>();
  let fetchTimer = 0;
  const artworkPointers = new Set<number>();
  let artworkPending = false;
  let artworkTimer = 0;
  function renderArtwork() {
    if (artworkPointers.size) { artworkPending = true; return; }
    artworkPending = false;
    o.rerender();
  }
  function releaseArtworkPointer(event?: PointerEvent) {
    if (event) artworkPointers.delete(event.pointerId); else artworkPointers.clear();
    if (!artworkPointers.size && artworkPending) {
      clearTimeout(artworkTimer);
      // Let the native click finish before a cosmetic update replaces its pressed card.
      artworkTimer = window.setTimeout(renderArtwork, 0);
    }
  }
  root.addEventListener('pointerdown', event => artworkPointers.add(event.pointerId), true);
  window.addEventListener('pointerup', releaseArtworkPointer, true);
  window.addEventListener('pointercancel', releaseArtworkPointer, true);
  window.addEventListener('blur', () => releaseArtworkPointer());
  function image(name: string | undefined, size: 'small' | 'normal', print?: FCard['print']) {
    if (!name) return undefined;
    if (print) askPrinting(name, print);
    const sc = cacheGet(name, print);
    if (!sc) {
      if (asked.has(name)) return undefined;
      asked.add(name);
      wanted.add(name);
      clearTimeout(fetchTimer);
      fetchTimer = window.setTimeout(() => {
        const names = [...wanted];
        wanted.clear();
        // Falha (sem rede, limite do Scryfall): libera os nomes para tentar de novo daqui a 30 s.
        fetchByNames(names).then(renderArtwork).catch(() => setTimeout(() => names.forEach(n => asked.delete(n)), 30_000));
      }, 150);
      return undefined;
    }
    const u = sc.pt?.image_uris ?? sc.image_uris;
    return size === 'small' ? u?.small ?? u?.normal : u?.normal ?? u?.small;
  }

  /** A imagem da impressão escolhida chega depois; até lá a carta aparece na impressão padrão. */
  const askedPrints = new Set<string>(), wantedPrints: { name: string; set: string; cn: string }[] = [];
  let printTimer: number | undefined;
  function askPrinting(name: string, print: NonNullable<FCard['print']>) {
    const key = `${name}|${print.set}|${print.cn}`;
    if (askedPrints.has(key)) return;
    askedPrints.add(key); wantedPrints.push({ name, ...print });
    clearTimeout(printTimer);
    printTimer = window.setTimeout(() => {
      const list = wantedPrints.splice(0);
      fetchPrintings(list).then(renderArtwork).catch(() => setTimeout(() => list.forEach(p => askedPrints.delete(`${p.name}|${p.set}|${p.cn}`)), 30_000));
    }, 150);
  }

  /** O verso de uma carta, na cor do jogador que a controla. */
  const backFace = (c?: FCard) => `<div class="face"><div class="back${sleeveClass(o.sleeve(c?.controller))}" style="width:100%;height:100%"></div></div>`;
  /** Estilo da carta neste lugar: o Arena só troca a imagem pela arte nas permanentes do campo (`field`). */
  function faceStyle(c: FCard, field: boolean): CardStyle {
    const cardStyle = o.cardStyle();
    if (c.faceDown && field && faceDownReminder(c)) return cardStyle === 'art' ? 'art' : cardStyle === 'arena' ? 'arena' : 'full';
    if (c.faceDown || !c.name) return 'full';
    // Os dois precisam da arte recortada; carta sem ela (ficha com imagem própria da ponte) fica com a imagem completa.
    const sc = cacheGet(c.name, c.print);
    const art = (sc?.pt?.image_uris ?? sc?.image_uris)?.art_crop;
    return cardStyle === 'art' && (art || !c.image) ? 'art' : cardStyle === 'arena' && field && art ? 'arena' : 'full';
  }

  /**
   * Permanente virada para baixo no campo: a carta de lembrete do jeito como ela foi virada (metamorfose, manifestada,
   * disfarce, encoberta), no estilo de carta escolhido; sem o tipo, ou se a imagem não carregar, o verso.
   */
  function faceDownField(c: FCard, size: 'small' | 'normal'): string {
    const r = faceDownReminder(c);
    if (!r) return backFace(c);
    const style = faceStyle(c, true);
    return faceHTML({ name: r.label, manaCost: '', typeLine: 'Criatura', power: c.power ?? 2, toughness: c.toughness ?? 2, creature: true, color: 'C',
      image: style === 'full' ? size === 'small' ? r.small : r.normal : undefined, style, art: r.art, text: r.text, back: true });
  }

  function face(c: FCard, size: 'small' | 'normal', field = false): string {
    // Virada para baixo e você pode olhar: no campo segue a carta de lembrete (ela é uma 2/2 sem nome); fora dele, a
    // frente apagada. Nos dois, um olho no canto; qual carta é e por que só você vê ficam na prévia e no inspetor.
    if (c.faceDown && c.hiddenFace?.name) {
      const html = field ? faceDownField(c, size) : face(seenFace(c), size);
      return html.replace(/^\s*<div class="face/, `<div class="face hidden-known${field ? ' on-field' : ''}`).replace(/<\/div>\s*$/, `${HIDDEN_EYE}</div>`);
    }
    if (c.faceDown && field) return faceDownField(c, size);
    if (c.faceDown || !c.name) return backFace(c);
    const sc = cacheGet(c.name, c.print);
    const art = (sc?.pt?.image_uris ?? sc?.image_uris)?.art_crop;
    const style = faceStyle(c, field);
    if (style === 'art' && (!sc || c.print)) image(c.name, size, c.print); // pede a carta ao Scryfall, como no modo de imagem completa
    return faceHTML({
      name: label(c), manaCost: c.manaCost ?? '', typeLine: ptOf(c.name)?.type_line || c.typeLine || '', power: c.power, toughness: c.toughness,
      creature: !!c.creature, color: colorFromCost(c.manaCost ?? '', !!c.land), image: style === 'full' ? c.image ?? image(c.name, size, c.print) : undefined,
      style, art, text: ptOf(c.name)?.text || sc?.oracle_text, loyalty: c.planeswalker ? c.counters?.LOYALTY ?? 0 : undefined, token: !!c.token,
    });
  }

  return {
    image, face, faceStyle,
    /** Partida nova: esquece os toques em andamento (o redesenho pendente fica para o próximo). */
    reset() { artworkPointers.clear(); artworkPending = false; clearTimeout(artworkTimer); },
  };
}


