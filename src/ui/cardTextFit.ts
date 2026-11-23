// Encaixe do texto nas cartas "Arte e texto": nome, tipo e regras diminuem a letra até caber, em vez de cortar.

/** O menor tamanho de cada parte, em fração do tamanho normal: abaixo disso fica ilegível, e o que sobrar é cortado. */
const MIN = { name: 0.7, type: 0.72, text: 0.6 } as const;
type Part = keyof typeof MIN;
const PARTS: [Part, string, string][] = [['name', '.af-name', '--af-ns'], ['type', '.af-type', '--af-ys'], ['text', '.af-text', '--af-ts']];

/** Conta já feita para o mesmo texto no mesmo tamanho: a mesa redesenha as cartas a cada jogada. */
const cache = new Map<string, number>();
const CACHE_MAX = 600;

const overflows = (el: HTMLElement, part: Part) => part === 'text'
  ? el.scrollHeight > el.clientHeight + 1
  : el.scrollWidth > el.clientWidth + 1;

/** Maior escala (entre o mínimo e 1) em que a parte cabe, por busca binária; `null` se nem no mínimo ela cabe. */
function bestScale(el: HTMLElement, part: Part, prop: string): number | null {
  el.style.setProperty(prop, '1');
  if (!overflows(el, part)) return 1;
  let lo: number = MIN[part], hi = 1;
  el.style.setProperty(prop, String(lo));
  if (overflows(el, part)) return null;
  for (let i = 0; i < 6; i++) {
    const mid = (lo + hi) / 2;
    el.style.setProperty(prop, String(mid));
    if (overflows(el, part)) hi = mid; else lo = mid;
  }
  return lo;
}

/** Acerta as três partes de uma carta. Parte escondida (carta pequena, no campo) não tem tamanho e fica como está. */
function fitCardText(face: HTMLElement) {
  for (const [part, selector, prop] of PARTS) {
    const el = face.querySelector<HTMLElement>(selector);
    if (!el || !el.clientWidth || !el.clientHeight) continue;
    const key = `${part}|${el.clientWidth}x${el.clientHeight}|${el.innerHTML}`;
    let scale = cache.get(key);
    if (scale === undefined) {
      const found = bestScale(el, part, prop);
      // Nem no mínimo coube: fica o mínimo, e o texto de regras ganha o esmaecido no fim (cardStyle.css).
      scale = found ?? -MIN[part];
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
      cache.set(key, scale);
    }
    el.style.setProperty(prop, String(Math.abs(scale)));
    el.classList.toggle('af-over', scale < 0);
  }
}

/** Mudou de tamanho (entrou na tela, a mão encolheu, a janela mudou): acerta de novo. */
const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
  for (const e of entries) if (e.target.isConnected) fitCardText(e.target as HTMLElement);
});
const seen = new WeakSet<Element>();

function watch(node: Node) {
  if (!(node instanceof Element) || !resized) return;
  const faces = node.matches('.art-face') ? [node] : node.getElementsByClassName('art-face');
  for (const face of faces) if (!seen.has(face)) { seen.add(face); resized.observe(face); }
}

/** Um só observador para a página: cada carta "Arte e texto" que entra é medida quando ganha tamanho (o ResizeObserver avisa já na primeira vez). */
function install(doc: Document) {
  new MutationObserver(records => { for (const r of records) r.addedNodes.forEach(watch); })
    .observe(doc.documentElement, { childList: true, subtree: true });
  watch(doc.documentElement);
  // A fonte que chega depois muda a largura das letras: as contas antigas não valem mais.
  doc.fonts?.addEventListener?.('loadingdone', () => {
    cache.clear();
    for (const face of doc.getElementsByClassName('art-face')) fitCardText(face as HTMLElement);
  });
}

if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') install(document);
