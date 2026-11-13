#!/usr/bin/env node
// Dá número às novidades pendentes (novidades-pendentes/): junta todas numa versão nova do CHANGELOG.md, move os prints
// para public/novidades/<versão>/, registra em src/novidades.json e src/lab-cenarios.json e acerta a versão do package.json.
//
//   npm run publicar-versao [-- --x] [--dry]
//
//   Roda na hora de subir para a main, já em cima da origin/main atualizada (o /cp faz isso): o número é sempre o
//   seguinte ao do topo do CHANGELOG.md da main, então duas tarefas em paralelo nunca pegam o mesmo.
//   Versão: Y se há algum item em Novo ou Mudou, Z se só há Corrigido; --x quando algo deixa de funcionar como antes.
//   --dry     só mostra o que faria
//   --raiz    pasta do projeto (para os testes); --data AAAA-MM-DD fixa a data da versão
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeGroups } from '../src/pendingNews.ts';

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const ROOT = opt('--raiz') ?? fileURLToPath(new URL('..', import.meta.url));
const DRY = args.includes('--dry'), MAJOR = args.includes('--x');
const PENDING_DIR = join(ROOT, 'novidades-pendentes');
const KNOWN = new Set(['novidade.md', 'imagens.json', 'cenarios.json']);
const path = p => join(ROOT, p);
const read = p => readFileSync(path(p), 'utf8');
const fail = msg => { console.error(`publicar-versao: ${msg}`); process.exit(1); };

const folders = existsSync(PENDING_DIR) ? readdirSync(PENDING_DIR, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort() : [];
if (!folders.length) { console.log('Nenhuma novidade pendente: nada a publicar.'); process.exit(0); }

// 1. Lê e confere tudo antes de escrever qualquer coisa.
const pend = folders.map(folder => {
  const dir = join(PENDING_DIR, folder);
  const file = name => join(dir, name);
  if (!existsSync(file('novidade.md'))) fail(`${folder}/ sem novidade.md`);
  const json = name => existsSync(file(name)) ? JSON.parse(readFileSync(file(name), 'utf8')) : null;
  const md = readFileSync(file('novidade.md'), 'utf8');
  const titles = new Set([...md.matchAll(/^- \*\*(.+?)\.?\*\*/gm)].map(m => m[1]));
  const shots = json('imagens.json') ?? {};
  const used = new Set();
  for (const [title, list] of Object.entries(shots)) {
    if (!titles.has(title)) fail(`${folder}/imagens.json: "${title}" não é um item do novidade.md`);
    for (const s of list) {
      if (!existsSync(file(s.img))) fail(`${folder}/imagens.json: ${s.img} não existe`);
      used.add(s.img);
    }
  }
  const extra = readdirSync(dir).filter(f => !KNOWN.has(f) && !used.has(f));
  if (extra.length) fail(`${folder}/ tem arquivos que nenhum item usa: ${extra.join(', ')}`);
  const scenariosText = existsSync(file('cenarios.json')) ? readFileSync(file('cenarios.json'), 'utf8') : null;
  for (const s of json('cenarios.json') ?? []) {
    if (!s.item || !titles.has(s.item)) fail(`${folder}/cenarios.json: "${s.nome}" precisa de um item do novidade.md`);
    if (s.versao) fail(`${folder}/cenarios.json: "${s.nome}" não leva versao (ela sai daqui)`);
  }
  return { folder, dir, md, shots, scenariosText };
});

let merged;
try { merged = mergeGroups(pend.map(p => p.md)); } catch (e) { fail(e.message); }
if (!merged.groups.length) fail('os novidade.md não têm nenhum item');

// 2. Número: o seguinte ao do topo do CHANGELOG.md.
const changelog = read('CHANGELOG.md');
const top = /^## \[(\d+)\.(\d+)\.(\d+)\]/m.exec(changelog);
if (!top) fail('CHANGELOG.md sem versão no topo');
const [x, y, z] = top.slice(1).map(Number);
const version = MAJOR ? `${x + 1}.0.0` : merged.groups.some(g => g !== 'Corrigido') ? `${x}.${y + 1}.0` : `${x}.${y}.${z + 1}`;
const date = opt('--data') ?? new Date().toLocaleDateString('sv-SE');

// 3. CHANGELOG.md: a seção nova antes da primeira versão.
const section = `## [${version}] - ${date}\n\n${merged.text}\n`;
const nextChangelog = changelog.slice(0, top.index) + section + changelog.slice(top.index);

// 4. Prints: public/novidades/<versão>/, com o nome da pasta na frente se dois pendentes usam o mesmo nome de arquivo.
const imgDir = `public/novidades/${version}`;
const moves = [], visuals = {};
const taken = new Set(existsSync(path(imgDir)) ? readdirSync(path(imgDir)) : []);
for (const p of pend) {
  for (const [title, list] of Object.entries(p.shots)) {
    visuals[title] = [...(visuals[title] ?? []), ...list.map(s => {
      const name = taken.has(s.img) ? `${p.folder}-${s.img}` : s.img;
      if (!moves.some(m => m.from === join(p.dir, s.img))) { taken.add(name); moves.push({ from: join(p.dir, s.img), to: path(`${imgDir}/${name}`) }); }
      return { img: `${version}/${name}`, legenda: s.legenda };
    })];
  }
}
let nextVisuals = read('src/novidades.json');
if (Object.keys(visuals).length) {
  const block = `  ${JSON.stringify(version)}: {\n${Object.entries(visuals).map(([title, list]) =>
    `    ${JSON.stringify(title)}: [\n${list.map(s => `      { "img": ${JSON.stringify(s.img)}, "legenda": ${JSON.stringify(s.legenda)} }`).join(',\n')}\n    ]`).join(',\n')}\n  }`;
  const body = nextVisuals.replace(/^\{\s*/, '');
  nextVisuals = `{\n${block}${body.startsWith('}') ? '\n' : ',\n  '}${body}`;
  JSON.parse(nextVisuals);
}

// 5. Laboratório: os cenários das correções no começo da lista, com a versão logo antes do item (como os outros).
let nextLab = read('src/lab-cenarios.json');
const labEntries = pend.filter(p => p.scenariosText?.trim().replace(/^\[\s*|\s*\]$/g, ''))
  .map(p => p.scenariosText.trim().replace(/^\[\s*\n?/, '').replace(/\s*\]$/, '').replace(/^(\s*)"item":/gm, `$1"versao": ${JSON.stringify(version)},\n$1"item":`));
if (labEntries.length) {
  const body = nextLab.replace(/^\[\s*/, '');
  nextLab = `[\n  ${labEntries.map(e => e.replace(/^\s*/, '')).join(',\n  ')}${body.startsWith(']') ? '\n' : ',\n  '}${body}`;
  const parsed = JSON.parse(nextLab);
  const added = pend.reduce((n, p) => n + (p.scenariosText ? JSON.parse(p.scenariosText).length : 0), 0);
  if (parsed.slice(0, added).some(s => s.versao !== version)) fail('não consegui pôr a versão nos cenários (confira o "item" de cada um)');
}

// 6. package.json e package-lock.json com a versão nova (o mesmo que npm version --no-git-tag-version).
const pkg = read('package.json').replace(/("version":\s*")[^"]+"/, `$1${version}"`);
const lock = existsSync(path('package-lock.json')) ? JSON.parse(read('package-lock.json')) : null;
if (lock) { lock.version = version; if (lock.packages?.['']) lock.packages[''].version = version; }

console.log(`Versão ${version} (antes ${top.slice(1).join('.')}), com ${folders.length} ${folders.length === 1 ? 'mudança' : 'mudanças'}: ${folders.join(', ')}\n`);
console.log(section.trimEnd());
if (moves.length) console.log(`\n${moves.length} ${moves.length === 1 ? 'print' : 'prints'} para ${imgDir}/`);
if (labEntries.length) console.log(`${labEntries.length === 1 ? 'Cenário' : 'Cenários'} do Laboratório na ${version}`);
if (DRY) { console.log('\n(--dry: nada foi gravado)'); process.exit(0); }

writeFileSync(path('CHANGELOG.md'), nextChangelog);
if (moves.length) mkdirSync(path(imgDir), { recursive: true });
for (const m of moves) renameSync(m.from, m.to);
writeFileSync(path('src/novidades.json'), nextVisuals);
writeFileSync(path('src/lab-cenarios.json'), nextLab);
writeFileSync(path('package.json'), pkg);
if (lock) writeFileSync(path('package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
for (const p of pend) rmSync(p.dir, { recursive: true });
if (!readdirSync(PENDING_DIR).length) rmSync(PENDING_DIR, { recursive: true });
console.log(`\nPublicada a ${version}. Mensagem do commit: "<o que muda para o jogador> (${version})".`);
