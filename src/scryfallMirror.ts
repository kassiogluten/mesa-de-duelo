/**
 * Imagens das cartas pelo nosso cache (ROADMAP item 10): o endereço de cards.scryfall.io vira /scryfall/… no host das
 * imagens (VITE_IMAGENS_URL, a CDN na frente do nosso nginx) ou, sem ele, no próprio site; o nginx guarda em disco
 * (deploy/nginx.conf). As fichas e os terrenos da série Nyx, pedidos pela série e número
 * (api.scryfall.com/cards/<série>/<número>?format=image, um redirecionamento), viram /scryfall/cards/<tamanho>/<série>/<número>,
 * e o nginx segue o redirecionamento e guarda a imagem. O Scryfall fica de reserva: uma imagem que não carrega pelo
 * cache é pedida direto a ele.
 */

const ORIGIN = 'https://cards.scryfall.io/';
/** Imagem pela série e número; só números simples (o nginx recusa o resto), com o verso pelo `face=back`. */
const API_IMAGE = /^https:\/\/api\.scryfall\.com\/cards\/([a-z0-9]{2,8})\/([0-9a-z-]{1,12})\?format=image&version=(small|normal|art_crop)(&face=back)?$/i;
const API_PATH = /^cards\/(small|normal|art_crop)\/([a-z0-9]{2,8})\/([0-9a-z-]{1,12})(\/back)?$/i;
/**
 * O host das imagens como origem (https://img.…). Sem esquema vale https: com "img.mesao.online" puro, o endereço virava
 * um caminho dentro do próprio site, que devolve a página do jogo, e as cartas sumiam. Valor que não é endereço: o site.
 */
export function imagesHost(value: string | undefined): string {
  const v = value?.trim().replace(/\/+$/, '');
  if (!v) return '';
  try { return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).origin; } catch { return ''; }
}
const HOST = imagesHost(import.meta.env?.VITE_IMAGENS_URL);
const MIRROR = `${HOST}/scryfall/`;
/** Só os tamanhos que a mesa usa e o caminho no formato do Scryfall; o mesmo filtro está no nginx. */
const PATH = /^(small|normal|art_crop)\/(front|back)\/[0-9a-f]\/[0-9a-f]\/[0-9a-f-]{36}\.jpg(\?\d+)?$/;

/** O endereço da imagem pelo nosso cache; qualquer outro endereço volta como veio. */
export function viaMirror<T extends string | undefined>(url: T): T {
  const api = url?.match(API_IMAGE);
  if (api) return `${MIRROR}cards/${api[3]}/${api[1]!.toLowerCase()}/${api[2]}${api[4] ? '/back' : ''}` as T;
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
    const api = u.pathname.slice('/scryfall/'.length).match(API_PATH);
    if (api) return `https://api.scryfall.com/cards/${api[2]}/${api[3]}?format=image&version=${api[1]}${api[4] ? '&face=back' : ''}`;
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
 * Imagens do cache que já falharam nesta página (endereço absoluto) e o endereço delas no Scryfall. A mesa redesenha as
 * cartas a cada atualização, e a <img> nova iria ao cache de novo: a carta piscava entre o esboço e a imagem.
 */
const failed = new Map<string, string>();

/** O endereço no Scryfall de uma imagem do cache que já falhou nesta página, para ir direto a ele; senão undefined. */
export const knownFallback = (url: string) => failed.get(url);

/**
 * Uma imagem do cache que não carrega é pedida ao Scryfall antes que a tela trate o erro (o verso como reserva, por
 * exemplo): o ouvinte na captura da janela vem antes do da própria imagem. Se o Scryfall também falhar, o erro segue.
 */
function installMirrorFallback(target: Pick<Window, 'addEventListener'> = window) {
  target.addEventListener('error', event => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    const src = img.currentSrc || img.src;
    const original = fromMirror(src);
    if (!original) return;
    event.stopImmediatePropagation();
    failed.set(src, original);
    img.src = original;
  }, true);
}

if (typeof window !== 'undefined' && typeof HTMLImageElement !== 'undefined') installMirrorFallback();
