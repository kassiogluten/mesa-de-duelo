// Monta o /novidades.json que a mesa no PC lê do site: as versões do CHANGELOG-PC.md (e as pendentes da mesa no PC, como
// "Próxima versão") e quais versões têm prints. O vite.config.ts grava no build e serve no `npm run dev`.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PENDING, buildNewsFeed, mergePending } from '../src/newsFeed.ts';

/** O feed da pasta `root` (o projeto): CHANGELOG-PC.md, src/novidades.json e novidades-pendentes/<pasta>/. */
export function readNewsFeed(root) {
  const read = path => readFileSync(join(root, path), 'utf8');
  const optional = path => existsSync(join(root, path)) ? read(path) : null;
  const visuals = JSON.parse(read('src/novidades.json'));
  // As pendentes só existem fora da main (o pre-push recusa): no `npm run dev` de uma branch, como no painel do navegador.
  const pendingDir = join(root, 'novidades-pendentes');
  const folders = existsSync(pendingDir) ? readdirSync(pendingDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort() : [];
  let pending = '';
  try {
    // Os novidade-pc.md, e os itens com a marca antiga [Mesa no PC] dos novidade.md.
    const { pc } = mergePending(folders.map(f => ({ browser: optional(`novidades-pendentes/${f}/novidade.md`), pc: optional(`novidades-pendentes/${f}/novidade-pc.md`) })));
    if (pc.groups.length) pending = `## [${PENDING}]\n\n${pc.text}\n`;
  } catch { /* um novidade.md mal escrito: o teste das novidades é que avisa */ }
  // Os prints das pendentes ficam na pasta delas (o `npm run dev` serve a raiz do projeto): o endereço já vai inteiro.
  const pendingShots = f => Object.fromEntries(Object.entries(JSON.parse(optional(`novidades-pendentes/${f}/imagens.json`) ?? '{}'))
    .map(([title, list]) => [title, list.map(s => ({ ...s, img: `/novidades-pendentes/${f}/${s.img}` }))]));
  visuals[PENDING] = Object.assign({}, ...folders.map(pendingShots));
  // Separadas: o título e a abertura do CHANGELOG-PC.md não podem entrar na seção das pendentes.
  const feed = buildNewsFeed(optional('CHANGELOG-PC.md') ?? '', visuals);
  return { ...feed, releases: [...buildNewsFeed(pending, visuals).releases, ...feed.releases] };
}
