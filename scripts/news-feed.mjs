// Monta o /novidades.json que a mesa no PC lê do site: as versões do CHANGELOG.md (e as pendentes, como "Próxima versão"),
// com o selo "Mesa no PC" e quais versões têm prints. O vite.config.ts grava no build e serve no `npm run dev`.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PENDING, buildNewsFeed, mergeGroups } from '../src/newsFeed.ts';

/** O feed da pasta `root` (o projeto): CHANGELOG.md, src/novidades.json e novidades-pendentes/<pasta>/. */
export function readNewsFeed(root) {
  const read = path => readFileSync(join(root, path), 'utf8');
  const visual = new Set(Object.keys(JSON.parse(read('src/novidades.json'))));
  // As pendentes só existem fora da main (o pre-push recusa): no `npm run dev` de uma branch, como no painel do navegador.
  const pendingDir = join(root, 'novidades-pendentes');
  const folders = existsSync(pendingDir)
    ? readdirSync(pendingDir, { withFileTypes: true }).filter(e => e.isDirectory() && existsSync(join(pendingDir, e.name, 'novidade.md'))).map(e => e.name).sort()
    : [];
  let pending = '';
  try {
    if (folders.length) pending = `## [${PENDING}]\n\n${mergeGroups(folders.map(f => read(`novidades-pendentes/${f}/novidade.md`))).text}\n`;
  } catch { /* um novidade.md mal escrito: o teste das novidades é que avisa */ }
  if (folders.some(f => existsSync(join(pendingDir, f, 'imagens.json')))) visual.add(PENDING);
  // Separadas: o título e a abertura do CHANGELOG.md não podem entrar na seção das pendentes.
  const feed = buildNewsFeed(read('CHANGELOG.md'), visual);
  return { ...feed, releases: [...buildNewsFeed(pending, visual).releases, ...feed.releases] };
}
