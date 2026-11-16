// Carregando nas imagens das cartas (ROADMAP item 133): primeiro o esboço da carta, depois a small se a imagem demora e por fim a imagem, em toda a página.
import '../scryfallMirror';
import './imageLoading.css';

/** Imagem de carta: do Scryfall ou do nosso cache dele (/scryfall/…, no site ou no host das imagens). */
export function isCardImage(url: string | null | undefined): url is string {
  return !!url && (url.startsWith('https://cards.scryfall.io/') || /^(https?:\/\/[^/]+)?\/scryfall\//.test(url));
}

/** A versão small (146×204, uns 12 KB) de uma imagem normal ou large; a arte recortada não tem. */
export function smallOf(url: string): string | undefined {
  return isCardImage(url) && /\/(normal|large)\//.test(url) ? url.replace(/\/(normal|large)\//, '/small/') : undefined;
}

/**
 * Endereços que já chegaram nesta página: não mostram carregando de novo. A mesa redesenha as cartas a cada jogada, e
 * a imagem recriada às vezes não fica pronta na hora, mesmo vinda da memória.
 */
const ready = new Set<string>();

/** Os primeiros 140 ms não contam: a imagem do aparelho chega nesse tempo e aparece direto, sem a small antes. */
const SLOW_MS = 140;

/** Carrega e decodifica o endereço (a troca nunca sai no meio); avisa só se chegou. */
function probe(url: string, done: () => void) {
  const img = new Image();
  img.onload = () => img.decode().catch(() => {}).then(() => { ready.add(url); done(); });
  img.src = url;
}

/**
 * Uma <img> de carta que ainda não chegou deixa à vista o esboço da carta por baixo dela (nome, custo, tipo, texto).
 * Passados 140 ms sem ela, está demorando: pede a small e, quando chega, a mostra no lugar (a própria <img>, ainda sem
 * imagem, pinta o fundo; imageLoading.css). Já pronta, não ganha nada, como antes.
 */
function watchImage(img: HTMLImageElement) {
  const src = img.getAttribute('src');
  if (!isCardImage(src) || ready.has(src) || img.hasAttribute('data-no-wait') || img.classList.contains('img-wait') || (img.complete && img.naturalWidth > 0)) return;
  img.classList.add('img-wait');
  const waiting = () => img.classList.contains('img-wait') && img.getAttribute('src') === src;
  setTimeout(() => {
    if (!waiting()) return;
    img.classList.add('img-slow');
    const small = smallOf(src);
    const show = () => { if (waiting()) { img.style.setProperty('--img-small', `url("${small}")`); img.classList.add('img-small'); } };
    if (small) { if (ready.has(small)) show(); else probe(small, show); }
  }, SLOW_MS);
}

/** A <img> chegou: espera decodificar e entra; se demorou e a small não estava no lugar, com um esmaecer curto. */
function imageLoaded(img: HTMLImageElement) {
  if (!img.classList.contains('img-wait')) return;
  const src = img.getAttribute('src');
  img.decode().catch(() => {}).then(() => {
    if (src) ready.add(src);
    if (img.classList.contains('img-slow') && !img.classList.contains('img-small')) img.classList.add('img-in');
    clearWaiting(img);
  });
}

/** Sai o carregando: a imagem chegou, ou falhou de vez (o cache e o Scryfall) e fica o que já havia (o esboço, o verso). */
function clearWaiting(img: HTMLImageElement) {
  img.classList.remove('img-wait', 'img-slow', 'img-small');
  img.style.removeProperty('--img-small');
}

function scan(node: Node) {
  if (!(node instanceof Element)) return;
  if (node instanceof HTMLImageElement) watchImage(node);
  for (const img of node.getElementsByTagName('img')) watchImage(img);
}

/**
 * Um só observador para a página toda: cada <img> de carta que entra (ou troca de endereço) passa por aqui.
 * O ouvinte de erro na captura da janela vem depois da reserva do Scryfall (scryfallMirror.ts, importado antes): a
 * imagem que vai tentar o Scryfall continua carregando.
 */
function install(doc: Document) {
  new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'attributes') {
        const t = r.target;
        // Endereço novo (a reserva do Scryfall, por exemplo): espera de novo do começo.
        if (t instanceof HTMLImageElement) { clearWaiting(t); t.classList.remove('img-in'); watchImage(t); }
      } else r.addedNodes.forEach(scan);
    }
  }).observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  scan(doc.documentElement);
  // O load de um elemento não sobe até a janela, só até o documento.
  doc.addEventListener('load', e => { if (e.target instanceof HTMLImageElement) imageLoaded(e.target); }, true);
  window.addEventListener('error', e => { if (e.target instanceof HTMLImageElement) clearWaiting(e.target); }, true);
}

if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') install(document);
