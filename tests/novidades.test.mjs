import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

// Cada figura de src/novidades.json aponta para um item que existe no CHANGELOG.md e para um arquivo em public/novidades/.
const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
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
