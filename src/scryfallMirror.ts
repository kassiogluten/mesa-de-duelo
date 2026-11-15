/**
 * Imagens das cartas pelo nosso cache (ROADMAP item 10): o endereço de cards.scryfall.io vira /scryfall/… no host das
 * imagens (VITE_IMAGENS_URL, a CDN na frente do nosso nginx) ou, sem ele, no próprio site; o nginx guarda em disco
 * (deploy/nginx.conf). O Scryfall fica de reserva: uma imagem que não carrega pelo cache é pedida direto a ele.
 */

const ORIGIN = 'https://cards.scryfall.io/';
const HOST: string = (import.meta.env?.VITE_IMAGENS_URL ?? '').replace(/\/+$/, '');
const MIRROR = `${HOST}/scryfall/`;
/** Só os tamanhos que a mesa usa e o caminho no formato do Scryfall; o mesmo filtro está no nginx. */
const PATH = /^(small|normal|art_crop)\/(front|back)\/[0-9a-f]\/[0-9a-f]\/[0-9a-f-]{36}\.jpg(\?\d+)?$/;

/** O endereço da imagem pelo nosso cache; qualquer outro endereço volta como veio. */
export function viaMirror<T extends string | undefined>(url: T): T {
  if (!url?.startsWith(ORIGIN)) return url;
  const path = url.slice(ORIGIN.length);
  return (PATH.test(path) ? MIRROR + path : url) as T;
}

/**
 * O endereço original no Scryfall de uma imagem do nosso cache (absoluto ou relativo), ou undefined. Vale no próprio
 * site e no host das imagens, para a reserva funcionar com ou sem ele.
 */
export function fromMirror(url: string, base = globalThis.location?.href ?? 'http://localhost/', host = HOST): string | undefined {
  try {
    const u = new URL(url, base);
    const ours = [new URL(base).origin, ...host ? [new URL(host).origin] : []];
    if (!ours.includes(u.origin) || !u.pathname.startsWith('/scryfall/')) return undefined;
    return ORIGIN + u.pathname.slice('/scryfall/'.length) + u.search;
  } catch { return undefined; }
}

/** Troca, em qualquer objeto guardado (cartas e impressões no IndexedDB), os endereços do Scryfall pelos do cache. */
export function mirrorUrls<T>(value: T): T {
  if (typeof value === 'string') return viaMirror(value) as T;
  if (Array.isArray(value)) return value.map(mirrorUrls) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mirrorUrls(v)])) as T;
  return value;
}

/**
 * Uma imagem do cache que não carrega é pedida ao Scryfall antes que a tela trate o erro (o verso como reserva, por
 * exemplo): o ouvinte na captura da janela vem antes do da própria imagem. Se o Scryfall também falhar, o erro segue.
 */
function installMirrorFallback(target: Pick<Window, 'addEventListener'> = window) {
  target.addEventListener('error', event => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    const original = fromMirror(img.currentSrc || img.src);
    if (!original) return;
    event.stopImmediatePropagation();
    img.src = original;
  }, true);
}

if (typeof window !== 'undefined' && typeof HTMLImageElement !== 'undefined') installMirrorFallback();
