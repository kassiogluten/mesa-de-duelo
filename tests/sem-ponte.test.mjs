import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import ts from 'typescript';

// "Ponte" é o nome interno do servidor (forge-bridge): o jogador lê "servidor". Este teste procura a palavra só no que
// aparece na tela (Novidades, páginas, textos da mesa e erros que o servidor manda), nunca em comentários ou nomes.
// A área de admin (src/admin, admin.html) fica de fora: é só para o responsável.
const root = new URL('../', import.meta.url);
const PONTE = /\bpontes?\b/i;
const read = path => readFile(new URL(path, root), 'utf8');

async function files(dir, ext) {
  const out = [];
  for (const e of await readdir(new URL(dir, root), { withFileTypes: true })) {
    const path = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...await files(path, ext));
    else if (ext.some(x => e.name.endsWith(x))) out.push(path);
  }
  return out;
}

/** Os textos literais de um arquivo TypeScript (strings e pedaços de template), sem comentários. */
function tsStrings(path, source) {
  const found = [];
  const visit = node => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)
      || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) found.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true));
  return found;
}

const hits = (texts, where) => texts.filter(t => PONTE.test(t)).map(t => `${where}: ${t.trim().slice(0, 120)}`);

test('ignora comentários e palavras como "ponteiro"', () => {
  assert.deepEqual(tsStrings('x.ts', "// a ponte\n/** da ponte */ const a = 'ponteiro'; const b = `ponte ${a}`;"), ['ponteiro', 'ponte ', '']);
  assert.equal(PONTE.test('ponteiro'), false);
  assert.equal(PONTE.test('A Ponte caiu.'), true);
});

test('o painel Novidades não fala em "ponte"', async () => {
  const changelog = (await read('CHANGELOG.md')).split('\n');
  assert.deepEqual(hits(changelog, 'CHANGELOG.md'), []);
  assert.deepEqual(hits((await read('docs/changelog-antigo.md')).split('\n'), 'docs/changelog-antigo.md'), []);
  assert.deepEqual(hits([await read('src/novidades.json')], 'src/novidades.json'), []);
});

test('as telas do jogo não falam em "ponte"', async () => {
  const found = [];
  for (const path of await files('src', ['.ts'])) {
    if (path.startsWith('src/admin/')) continue;
    found.push(...hits(tsStrings(path, await read(path)), path));
  }
  for (const path of await files('src', ['.css'])) {
    const css = (await read(path)).replace(/\/\*[\s\S]*?\*\//g, '');
    found.push(...hits(css.split('\n'), path));
  }
  for (const path of ['index.html', 'novidades.html', 'privacidade.html', 'partidas.html']) {
    const html = (await read(path)).replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    found.push(...hits(html.split('\n'), path));
  }
  assert.deepEqual(found, []);
});

test('os erros que o servidor manda para a mesa não falam em "ponte"', async () => {
  const found = [];
  for (const path of await files('forge-bridge/src/main/java', ['.java'])) {
    const java = (await read(path)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const call of java.matchAll(/Response\.error\(\s*\d+\s*,\s*("(?:[^"\\]|\\.)*")/g)) {
      // A área de admin desligada só aparece para o responsável.
      if (call[1].includes('MESA_ADMIN_PASSWORD')) continue;
      found.push(...hits([JSON.parse(call[1])], path));
    }
  }
  assert.deepEqual(found, []);
});
