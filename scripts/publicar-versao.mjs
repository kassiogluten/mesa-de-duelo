#!/usr/bin/env node
// Dá número às novidades pendentes (novidades-pendentes/): junta todas numa versão nova, no CHANGELOG.md (os itens da
// mesa do navegador, dos novidade.md) e no CHANGELOG-PC.md (os da mesa no PC, dos novidade-pc.md), cada um só quando
// tem item para ele, move os prints para public/novidades/<versão>/, registra em src/novidades.json e src/lab-cenarios.json, troca os botões marcados como
// novos no laboratório de efeitos (tests/fixtures/effects-lab-new.json) quando a versão traz algum e acerta a versão do
// package.json.
//
//   npm run publicar-versao [-- --x] [--dry]
//
//   Roda na hora de subir para a main, já em cima da origin/main atualizada (o /cp faz isso): o número é sempre o
//   seguinte ao mais novo dos topos do CHANGELOG.md e do CHANGELOG-PC.md da main, então duas tarefas em paralelo nunca
//   pegam o mesmo. Um item com a marca antiga [Mesa no PC] num novidade.md vai para o CHANGELOG-PC.md, sem ela.
//   Versão: Y se há algum item em Novo ou Mudou, Z se só há Corrigido; --x quando algo deixa de funcionar como antes.
//   --dry     só mostra o que faria
//   --raiz    pasta do projeto (para os testes); --data AAAA-MM-DD fixa a data da versão
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { itemTitles, mergePending } from '../src/newsFeed.ts';

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const ROOT = opt('--raiz') ?? fileURLToPath(new URL('..', import.meta.url));
const DRY = args.includes('--dry'), MAJOR = args.includes('--x');
const PENDING_DIR = join(ROOT, 'novidades-pendentes');
const KNOWN = new Set(['novidade.md', 'novidade-pc.md', 'imagens.json', 'cenarios.json', 'lab-efeitos.json']);
/** As novidades de cada mesa: o CHANGELOG.md é o do navegador, o CHANGELOG-PC.md o da mesa no PC. */
const BROWSER_LOG = 'CHANGELOG.md', PC_LOG = 'CHANGELOG-PC.md';
/** O começo do CHANGELOG-PC.md, quando ele ainda não existe. */
const PC_INTRO = '# Novidades da mesa no PC\n\nAs mudanças que você sente na mesa no PC. O número de cada versão é o mesmo da mesa do navegador.\n\n';
/** Os botões do laboratório de efeitos marcados como novos: os da última versão que trouxe algum. */
const LAB_NEW = 'tests/fixtures/effects-lab-new.json';
const path = p => join(ROOT, p);
const read = p => readFileSync(path(p), 'utf8');
const fail = msg => { console.error(`publicar-versao: ${msg}`); process.exit(1); };

const folders = existsSync(PENDING_DIR) ? readdirSync(PENDING_DIR, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort() : [];
if (!folders.length) { console.log('Nenhuma novidade pendente: nada a publicar.'); process.exit(0); }

// 1. Lê e confere tudo antes de escrever qualquer coisa.
const pend = folders.map(folder => {
  const dir = join(PENDING_DIR, folder);
  const file = name => join(dir, name);
  const text = name => existsSync(file(name)) ? readFileSync(file(name), 'utf8') : null;
  const md = text('novidade.md'), pcMd = text('novidade-pc.md');
  if (md === null && pcMd === null) fail(`${folder}/ sem novidade.md (mesa do navegador) nem novidade-pc.md (mesa no PC)`);
  const json = name => existsSync(file(name)) ? JSON.parse(readFileSync(file(name), 'utf8')) : null;
  // Os títulos das duas mesas: o mesmo item escrito nos dois arquivos usa as mesmas imagens e o mesmo cenário.
  const titles = new Set([...itemTitles(md ?? ''), ...itemTitles(pcMd ?? '')]);
  const shots = json('imagens.json') ?? {};
  const used = new Set();
  for (const [title, list] of Object.entries(shots)) {
    if (!titles.has(title)) fail(`${folder}/imagens.json: "${title}" não é um item do novidade.md nem do novidade-pc.md`);
    for (const s of list) {
      if (!existsSync(file(s.img))) fail(`${folder}/imagens.json: ${s.img} não existe`);
      used.add(s.img);
    }
  }
  const extra = readdirSync(dir).filter(f => !KNOWN.has(f) && !used.has(f));
  if (extra.length) fail(`${folder}/ tem arquivos que nenhum item usa: ${extra.join(', ')}`);
  const scenariosText = existsSync(file('cenarios.json')) ? readFileSync(file('cenarios.json'), 'utf8') : null;
  for (const s of json('cenarios.json') ?? []) {
    if (!s.item || !titles.has(s.item)) fail(`${folder}/cenarios.json: "${s.nome}" precisa de um item do novidade.md ou do novidade-pc.md`);
    if (s.versao) fail(`${folder}/cenarios.json: "${s.nome}" não leva versao (ela sai daqui)`);
  }
  const labButtons = json('lab-efeitos.json') ?? [];
  if (!Array.isArray(labButtons) || labButtons.some(b => typeof b !== 'string' || !/^[a-z-]+:.+/.test(b))) fail(`${folder}/lab-efeitos.json: uma lista de botões como "gpu:crown" ou "play:commanderStrike"`);
  return { folder, dir, md, pcMd, shots, scenariosText, labButtons };
});

let merged;
try { merged = mergePending(pend.map(p => ({ browser: p.md, pc: p.pcMd }))); } catch (e) { fail(e.message); }
const groups = [...new Set([...merged.browser.groups, ...merged.pc.groups])];
if (!groups.length) fail('os novidade.md e novidade-pc.md não têm nenhum item');

// 2. Número: o seguinte ao mais novo dos topos dos dois CHANGELOGs (uma versão pode ter itens de uma mesa só).
const TOP = /^## \[(\d+)\.(\d+)\.(\d+)\]/m;
const logs = [BROWSER_LOG, PC_LOG].map(name => {
  const text = existsSync(path(name)) ? read(name) : null;
  const top = text === null ? null : TOP.exec(text);
  return { name, text, top, number: top ? top.slice(1).map(Number) : null };
});
if (!logs[0].top) fail(`${BROWSER_LOG} sem versão no topo`);
const older = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const [x, y, z] = logs.map(l => l.number).filter(Boolean).sort(older).at(-1);
const previous = `${x}.${y}.${z}`;
const version = MAJOR ? `${x + 1}.0.0` : groups.some(g => g !== 'Corrigido') ? `${x}.${y + 1}.0` : `${x}.${y}.${z + 1}`;
const date = opt('--data') ?? new Date().toLocaleDateString('sv-SE');

// 3. CHANGELOG.md e CHANGELOG-PC.md: a seção nova antes da primeira versão, em cada um que tem item para ela.
const writes = [[logs[0], merged.browser], [logs[1], merged.pc]].filter(([, m]) => m.groups.length).map(([log, m]) => {
  const section = `## [${version}] - ${date}\n\n${m.text}\n`;
  // Sem versão ainda (o CHANGELOG-PC.md que nasce agora), a seção é a última coisa do arquivo.
  const next = log.top ? log.text.slice(0, log.top.index) + section + log.text.slice(log.top.index) : `${log.text ?? PC_INTRO}${section.trimEnd()}\n`;
  return { name: log.name, section, next };
});

// 4. Prints: public/novidades/<versão>/, com o nome da pasta na frente se dois pendentes usam o mesmo nome de arquivo.
const imgDir = `public/novidades/${version}`;
const moves = [], visuals = {};
const taken = new Set(existsSync(path(imgDir)) ? readdirSync(path(imgDir)) : []);
for (const p of pend) {
  for (const [title, list] of Object.entries(p.shots)) {
    visuals[title] = [...(visuals[title] ?? []), ...list.map(s => {
      // A mesma imagem em dois itens da mesma pasta vai uma vez só, com o mesmo nome nos dois.
      const from = join(p.dir, s.img), moved = moves.find(m => m.from === from);
      if (moved) return { img: `${version}/${moved.name}`, legenda: s.legenda };
      const name = taken.has(s.img) ? `${p.folder}-${s.img}` : s.img;
      taken.add(name); moves.push({ from, to: path(`${imgDir}/${name}`), name });
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

// 6. Laboratório de efeitos: os botões novos desta versão tomam o lugar dos anteriores; sem botão novo, os selos da
// última versão que trouxe algum continuam, para o painel sempre mostrar o efeito mais recente.
const labNew = [...new Set(pend.flatMap(p => p.labButtons))];
const nextLabNew = labNew.length ? `${JSON.stringify({ versao: version, botoes: labNew }, null, 2)}\n` : null;

// 7. package.json e package-lock.json com a versão nova (o mesmo que npm version --no-git-tag-version).
const pkg = read('package.json').replace(/("version":\s*")[^"]+"/, `$1${version}"`);
const lock = existsSync(path('package-lock.json')) ? JSON.parse(read('package-lock.json')) : null;
if (lock) { lock.version = version; if (lock.packages?.['']) lock.packages[''].version = version; }

console.log(`Versão ${version} (antes ${previous}), com ${folders.length} ${folders.length === 1 ? 'mudança' : 'mudanças'}: ${folders.join(', ')}`);
for (const w of writes) console.log(`\n${w.name}:\n\n${w.section.trimEnd()}`);
if (moves.length) console.log(`\n${moves.length} ${moves.length === 1 ? 'print' : 'prints'} para ${imgDir}/`);
if (labEntries.length) console.log(`${labEntries.length === 1 ? 'Cenário' : 'Cenários'} do Laboratório na ${version}`);
console.log(labNew.length ? `Laboratório de efeitos: ${labNew.length} ${labNew.length === 1 ? 'botão novo' : 'botões novos'} (${labNew.join(', ')})` : 'Laboratório de efeitos: nenhum botão novo (os selos de antes continuam)');
if (DRY) { console.log('\n(--dry: nada foi gravado)'); process.exit(0); }

for (const w of writes) writeFileSync(path(w.name), w.next);
if (moves.length) mkdirSync(path(imgDir), { recursive: true });
for (const m of moves) renameSync(m.from, m.to);
writeFileSync(path('src/novidades.json'), nextVisuals);
writeFileSync(path('src/lab-cenarios.json'), nextLab);
if (nextLabNew) {
  mkdirSync(path('tests/fixtures'), { recursive: true });
  writeFileSync(path(LAB_NEW), nextLabNew);
}
writeFileSync(path('package.json'), pkg);
if (lock) writeFileSync(path('package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
for (const p of pend) rmSync(p.dir, { recursive: true });
if (!readdirSync(PENDING_DIR).length) rmSync(PENDING_DIR, { recursive: true });
console.log(`\nPublicada a ${version}. Mensagem do commit: "<o que muda para o jogador> (${version})".`);
