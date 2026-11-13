import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

// Cada figura de src/novidades.json aponta para um item que existe no CHANGELOG.md e para um arquivo em public/novidades/.
const changelog = (await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8')) + '\n' + (await readFile(new URL('../docs/changelog-antigo.md', import.meta.url), 'utf8'));
const visuals = JSON.parse(await readFile(new URL('../src/novidades.json', import.meta.url), 'utf8'));
const items = new Map();
let version = '';
for (const line of changelog.split('\n').map(l => l.trim())) {
  const head = /^## \[(.+?)\]/.exec(line);
  if (head) { version = head[1]; items.set(version, new Set()); continue; }
  const item = /^- \*\*(.+?)\.?\*\*/.exec(line);
  if (version && item) items.get(version).add(item[1]);
}

test('every visual matches a changelog item and an image file', async () => {
  for (const [v, byTitle] of Object.entries(visuals)) {
    assert.ok(items.has(v), `versão ${v} não está no CHANGELOG.md`);
    for (const [title, shots] of Object.entries(byTitle)) {
      assert.ok(items.get(v).has(title), `"${title}" não é um item da versão ${v}`);
      assert.ok(shots.length, `"${title}" sem imagens`);
      for (const s of shots) {
        assert.ok(s.legenda?.trim(), `${s.img} sem legenda`);
        await access(new URL(`../public/novidades/${s.img}`, import.meta.url));
      }
    }
  }
});

// As novidades ainda sem número (novidades-pendentes/<pasta>/): cada pasta tem um novidade.md com itens nos grupos
// certos, prints que existem na própria pasta e cenários sem versão apontando para um item dela.
test('cada novidade pendente está completa e no formato que o publicar-versao espera', async () => {
  const { readdir } = await import('node:fs/promises');
  const { mergeGroups } = await import('../src/pendingNews.ts');
  const dir = new URL('../novidades-pendentes/', import.meta.url);
  const folders = (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter(e => e.isDirectory()).map(e => e.name);
  for (const folder of folders) {
    const file = name => new URL(`${folder}/${name}`, dir);
    const md = await readFile(file('novidade.md'), 'utf8').catch(() => assert.fail(`${folder}/ sem novidade.md`));
    assert.ok(mergeGroups([md]).groups.length, `${folder}/novidade.md sem itens`);
    const titles = new Set([...md.matchAll(/^- \*\*(.+?)\.?\*\*/gm)].map(m => m[1]));
    const json = async name => JSON.parse(await readFile(file(name), 'utf8').catch(() => 'null'));
    const used = new Set();
    for (const [title, shots] of Object.entries(await json('imagens.json') ?? {})) {
      assert.ok(titles.has(title), `${folder}/imagens.json: "${title}" não é um item do novidade.md`);
      for (const s of shots) {
        assert.ok(s.legenda?.trim(), `${folder}/${s.img} sem legenda`);
        await access(file(s.img));
        used.add(s.img);
      }
    }
    for (const s of await json('cenarios.json') ?? []) {
      assert.ok(titles.has(s.item), `${folder}/cenarios.json: "${s.nome}" precisa de um item do novidade.md`);
      assert.equal(s.versao, undefined, `${folder}/cenarios.json: "${s.nome}" não leva versao (ela sai na publicação)`);
    }
    const extra = (await readdir(new URL(`${folder}/`, dir))).filter(f => !['novidade.md', 'imagens.json', 'cenarios.json'].includes(f) && !used.has(f));
    assert.deepEqual(extra, [], `${folder}/ tem arquivos que nenhum item usa`);
  }
});
