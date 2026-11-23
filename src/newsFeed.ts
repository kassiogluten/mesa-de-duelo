// Selo "Mesa no PC" dos itens das novidades e o arquivo de novidades (/novidades.json) que a mesa no PC lê do site.

/**
 * Item que vale só para a mesa no PC: a marca logo depois do título em negrito, no `novidade.md` e no CHANGELOG.md
 * (`- **Título.** [Mesa no PC] O que muda.`). Fica depois do título para o título (e o `imagens.json`) não mudar; o
 * painel Novidades, a página Novidades em imagens e a mesa no PC trocam a marca pelo selo.
 */
export const PC_TAG = '[Mesa no PC]';
/** O texto do selo. */
export const PC_LABEL = 'Mesa no PC';

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

/** Um item: título em negrito (vazio num parágrafo solto), o texto com o pouco de Markdown do CHANGELOG e o selo. */
export interface FeedItem { title: string; text: string; pc: boolean }
export interface FeedGroup { name: string; items: FeedItem[] }
/** `visual`: a versão tem prints na página Novidades em imagens (/novidades#v<versão>). */
export interface FeedRelease { version: string; title: string; date: string; visual: boolean; groups: FeedGroup[] }
/** O /novidades.json: `version` é a mais nova com número (a do ponto de "não vista"); as versões vêm da mais nova à mais antiga. */
export interface NewsFeed { version: string; releases: FeedRelease[] }

/**
 * As versões de um CHANGELOG (`## [X.Y.Z] - AAAA-MM-DD`, grupos `### `, itens `- **Título.** texto`) no formato do
 * /novidades.json. `visual`: as versões com prints (as chaves de src/novidades.json, e "Próxima" com pendentes).
 */
export function buildNewsFeed(md: string, visual: ReadonlySet<string> = new Set()): NewsFeed {
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
        date: head[2] ? `${head[4]}/${head[3]}/${head[2]}` : '', visual: visual.has(version), groups: [],
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
    const { text, pc } = takePcTag(titled ? titled[2]! : body);
    group.items.push({ title: titled?.[1] ?? '', text, pc });
  }
  return { version: releases.find(r => r.version !== PENDING)?.version ?? '', releases };
}
