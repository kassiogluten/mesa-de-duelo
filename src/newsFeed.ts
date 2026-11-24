// Novidades de cada mesa (CHANGELOG.md, do navegador, e CHANGELOG-PC.md, da mesa no PC) e o /novidades.json que a mesa no PC lê do site.

/**
 * Marca antiga de item só da mesa no PC (`- **Título.** [Mesa no PC] O que muda.`), de quando as duas mesas tinham um
 * CHANGELOG só. Hoje o item da mesa no PC vai no `novidade-pc.md` da pasta pendente e sai no CHANGELOG-PC.md; um item
 * com a marca dentro do `novidade.md` (de uma worktree antiga) ainda é aceito e vai para a mesa no PC, sem ela.
 */
export const PC_TAG = '[Mesa no PC]';

/** Versão das novidades ainda sem número (novidades-pendentes/), mostrada como "Próxima versão". */
export const PENDING = 'Próxima';
export const GROUPS = ['Novo', 'Mudou', 'Corrigido'] as const;

/** Tira a marca do começo do texto de um item (o que vem depois do título): `pc` diz se ela estava lá. */
export function takePcTag(text: string): { pc: boolean; text: string } {
  const trimmed = text.trimStart();
  return trimmed.startsWith(PC_TAG) ? { pc: true, text: trimmed.slice(PC_TAG.length).trimStart() } : { pc: false, text };
}

/** Junta os `novidade.md` de várias mudanças num trecho só, com cada grupo (Novo, Mudou, Corrigido) uma vez, nessa ordem. */
export function mergeGroups(mds: string[]): { text: string; groups: string[] } {
  const lines = new Map<string, string[]>(GROUPS.map(g => [g, []]));
  for (const md of mds) {
    let group = '';
    for (const raw of md.split('\n')) {
      const line = raw.trimEnd();
      if (line.startsWith('### ')) { group = line.slice(4).trim(); continue; }
      if (!line.trim()) continue;
      if (!lines.has(group)) throw new Error(`"${line.slice(0, 60)}" fora de ### Novo, ### Mudou ou ### Corrigido`);
      lines.get(group)!.push(line);
    }
  }
  const groups = GROUPS.filter(g => lines.get(g)!.length);
  return { groups, text: groups.map(g => `### ${g}\n\n${lines.get(g)!.join('\n')}\n`).join('\n') };
}

/**
 * Um `novidade.md` dividido entre as mesas: os itens com a marca antiga `[Mesa no PC]` vão para `pc` (sem ela, no mesmo
 * grupo), o resto fica em `browser`. Os dois no formato do `novidade.md` (grupos `### `).
 */
export function splitPcTagged(md: string): { browser: string; pc: string } {
  const browser: string[] = [], pc: string[] = [];
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    if (line.startsWith('### ')) { browser.push('', line, ''); pc.push('', line, ''); continue; }
    const item = /^(- \*\*.+?\*\*)\s*(.*)$/.exec(line);
    const tagged = item ? takePcTag(item[2]!) : null;
    if (item && tagged?.pc) pc.push(`${item[1]} ${tagged.text}`);
    else browser.push(line);
  }
  return { browser: browser.join('\n'), pc: pc.join('\n') };
}

/** O que uma pasta pendente tem para cada mesa: o `novidade.md` (navegador) e o `novidade-pc.md` (mesa no PC). */
export interface PendingTexts { browser?: string | null; pc?: string | null }

/**
 * As pastas pendentes juntas, uma seção para cada mesa (o `{ text, groups }` de mergeGroups): o `novidade.md` vai para
 * o navegador, o `novidade-pc.md` para a mesa no PC, e um item do `novidade.md` com a marca antiga, para a mesa no PC.
 */
export function mergePending(folders: PendingTexts[]): { browser: ReturnType<typeof mergeGroups>; pc: ReturnType<typeof mergeGroups> } {
  const browser: string[] = [], pc: string[] = [];
  for (const f of folders) {
    if (f.browser) { const split = splitPcTagged(f.browser); browser.push(split.browser); pc.push(split.pc); }
    if (f.pc) pc.push(f.pc);
  }
  return { browser: mergeGroups(browser), pc: mergeGroups(pc) };
}

/** Os títulos dos itens (`- **Título.**`, sem o ponto) de um trecho de CHANGELOG ou de um `novidade.md`. */
export const itemTitles = (md: string) => new Set([...md.matchAll(/^- \*\*(.+?)\.?\*\*/gm)].map(m => m[1]!));

/** Um print de um item: o endereço no site (`/novidades/<versão>/<arquivo>.webp`) e a legenda. */
export interface FeedImage { src: string; caption: string }
/**
 * Um item: título em negrito (vazio num parágrafo solto), o texto com o pouco de Markdown do CHANGELOG e, se o item tem
 * prints na página Novidades em imagens, `images` (a vitrine da tela inicial da mesa no PC os mostra).
 */
export interface FeedItem { title: string; text: string; images?: FeedImage[] }
export interface FeedGroup { name: string; items: FeedItem[] }
/** `visual`: algum item da versão tem prints na página Novidades em imagens (/novidades?mesa=pc#v<versão>). */
export interface FeedRelease { version: string; title: string; date: string; visual: boolean; groups: FeedGroup[] }
/** O /novidades.json: `version` é a mais nova com número (a do ponto de "não vista"); as versões vêm da mais nova à mais antiga. */
export interface NewsFeed { version: string; releases: FeedRelease[] }
/**
 * Os prints de src/novidades.json: versão → título do item → figuras. `img` é `<versão>/<arquivo>.webp` (em
 * public/novidades/) ou, nas pendentes, um endereço que já começa com `/`.
 */
export type Visuals = Record<string, Record<string, readonly { img?: unknown; legenda?: unknown }[]>>;

/** O endereço de um print no site. */
const imageSrc = (img: string) => img.startsWith('/') ? img : `/novidades/${img}`;

/**
 * As versões de um CHANGELOG (`## [X.Y.Z] - AAAA-MM-DD`, grupos `### `, itens `- **Título.** texto`) no formato do
 * /novidades.json. `visuals`: os prints de cada versão (src/novidades.json, e "Próxima" com os das pendentes).
 */
export function buildNewsFeed(md: string, visuals: Visuals = {}): NewsFeed {
  const releases: FeedRelease[] = [];
  let release: FeedRelease | null = null;
  let group: FeedGroup | null = null;
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    const head = /^## \[(.+?)\](?:\s*-\s*(\d{4})-(\d{2})-(\d{2}))?/.exec(line);
    if (head) {
      const version = head[1]!;
      release = {
        version, title: version === PENDING ? 'Próxima versão' : `Versão ${version}`,
        date: head[2] ? `${head[4]}/${head[3]}/${head[2]}` : '', visual: false, groups: [],
      };
      releases.push(release);
      group = null;
      continue;
    }
    if (!release || !line) continue;
    if (line.startsWith('### ')) { group = { name: line.slice(4).trim(), items: [] }; release.groups.push(group); continue; }
    if (!group) { group = { name: '', items: [] }; release.groups.push(group); }
    const body = line.startsWith('- ') ? line.slice(2) : line;
    const titled = line.startsWith('- ') ? /^\*\*(.+?)\.?\*\*\s*(.*)$/.exec(body) : null;
    const title = titled?.[1] ?? '';
    const item: FeedItem = { title, text: titled ? titled[2]! : body };
    const shots = title ? (visuals[release.version]?.[title] ?? []) : [];
    const images = shots.filter(s => typeof s?.img === 'string' && s.img).map(s => ({ src: imageSrc(s.img as string), caption: typeof s.legenda === 'string' ? s.legenda : '' }));
    if (images.length) item.images = images;
    group.items.push(item);
    if (shots.length) release.visual = true;
  }
  return { version: releases.find(r => r.version !== PENDING)?.version ?? '', releases };
}
