import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

// Cada figura de src/novidades.json aponta para um item que existe no CHANGELOG.md (mesa do navegador) ou no
// CHANGELOG-PC.md (mesa no PC), na mesma versão, e para um arquivo em public/novidades/.
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const changelog = [await read('../CHANGELOG.md'), await read('../CHANGELOG-PC.md'), await read('../docs/changelog-antigo.md')].join('\n');
const visuals = JSON.parse(await read('../src/novidades.json'));
const items = new Map();
let version = '';
for (const line of changelog.split('\n').map(l => l.trim())) {
  const head = /^## \[(.+?)\]/.exec(line);
  if (head) { version = head[1]; if (!items.has(version)) items.set(version, new Set()); continue; }
  const item = /^- \*\*(.+?)\.?\*\*/.exec(line);
  if (version && item) items.get(version).add(item[1]);
}

test('every visual matches a changelog item and an image file', async () => {
  for (const [v, byTitle] of Object.entries(visuals)) {
    assert.ok(items.has(v), `versão ${v} não está no CHANGELOG.md nem no CHANGELOG-PC.md`);
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

// As novidades ainda sem número (novidades-pendentes/<pasta>/): cada pasta tem um novidade.md (mesa do navegador), um
// novidade-pc.md (mesa no PC) ou os dois, com itens nos grupos certos, prints que existem na própria pasta e cenários
// sem versão apontando para um item dela.
test('cada novidade pendente está completa e no formato que o publicar-versao espera', async () => {
  const { readdir } = await import('node:fs/promises');
  const { mergeGroups, itemTitles, PC_TAG } = await import('../src/newsFeed.ts');
  const dir = new URL('../novidades-pendentes/', import.meta.url);
  const folders = (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter(e => e.isDirectory()).map(e => e.name);
  for (const folder of folders) {
    const file = name => new URL(`${folder}/${name}`, dir);
    const optional = name => readFile(file(name), 'utf8').catch(() => null);
    const md = await optional('novidade.md'), pcMd = await optional('novidade-pc.md');
    assert.ok(md !== null || pcMd !== null, `${folder}/ sem novidade.md (mesa do navegador) nem novidade-pc.md (mesa no PC)`);
    for (const [name, text] of [['novidade.md', md], ['novidade-pc.md', pcMd]]) {
      if (text === null) continue;
      assert.ok(mergeGroups([text]).groups.length, `${folder}/${name} sem itens`);
      if (name === 'novidade-pc.md') assert.ok(!text.includes(PC_TAG), `${folder}/novidade-pc.md: aqui o item já é da mesa no PC, sem a marca ${PC_TAG}`);
    }
    const titles = new Set([...itemTitles(md ?? ''), ...itemTitles(pcMd ?? '')]);
    const json = async name => JSON.parse(await optional(name) ?? 'null');
    const used = new Set();
    for (const [title, shots] of Object.entries(await json('imagens.json') ?? {})) {
      assert.ok(titles.has(title), `${folder}/imagens.json: "${title}" não é um item do novidade.md nem do novidade-pc.md`);
      for (const s of shots) {
        assert.ok(s.legenda?.trim(), `${folder}/${s.img} sem legenda`);
        await access(file(s.img));
        used.add(s.img);
      }
    }
    for (const s of await json('cenarios.json') ?? []) {
      assert.ok(titles.has(s.item), `${folder}/cenarios.json: "${s.nome}" precisa de um item do novidade.md ou do novidade-pc.md`);
      assert.equal(s.versao, undefined, `${folder}/cenarios.json: "${s.nome}" não leva versao (ela sai na publicação)`);
    }
    const extra = (await readdir(new URL(`${folder}/`, dir))).filter(f => !['novidade.md', 'novidade-pc.md', 'imagens.json', 'cenarios.json', 'lab-efeitos.json'].includes(f) && !used.has(f));
    assert.deepEqual(extra, [], `${folder}/ tem arquivos que nenhum item usa`);
  }
});
