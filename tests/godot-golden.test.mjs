// Os fixtures dourados da mesa no PC (godot-table/tests/golden/) guardam a saída das funções de texto da mesa do
// navegador; mudou uma delas, rode `npm run godot:golden` e ajuste o porte em GDScript até o `npm run godot:test` passar.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { GOLDEN_DIR } from '../scripts/godot-golden.mjs';
import { PROJECT, RECORDED, VIEWS, viewFrom } from '../scripts/godot-golden-record.mjs';

const modules = {};
for (const [path, names] of Object.entries(RECORDED)) {
  const mod = await import(`../${path}`);
  for (const name of names) modules[name] = mod[name];
}

test('as saídas guardadas nos fixtures dourados continuam as da mesa do navegador', () => {
  const stale = [];
  for (const file of readdirSync(GOLDEN_DIR).filter(n => n.endsWith('.json'))) {
    const fn = file.replace(/\.json$/, '');
    assert.ok(modules[fn], `${file}: função que não está em RECORDED`);
    for (const c of JSON.parse(readFileSync(join(GOLDEN_DIR, file), 'utf8'))) {
      // null no arquivo é um argumento ausente (o JSON não guarda undefined); { $translate } é a tradução dos nomes, pelo mapa `names`.
      // { $view } é a vista da mesa (objeto com funções), gravada como mapas chave → resultado.
      const args = c.args.map((a, i) => a === null ? undefined : a?.$translate ? (n => c.names?.[n] ?? n) : a?.$view ? viewFrom(a.$view, VIEWS[fn][i]) : a);
      const raw = modules[fn](...args);
      const out = (PROJECT[fn] && raw != null ? PROJECT[fn](raw) : raw) ?? null;
      if (JSON.stringify(out) !== JSON.stringify(c.out)) stale.push(`${fn}(${JSON.stringify(c.args).slice(0, 80)}…)`);
    }
  }
  assert.deepEqual(stale, [], 'fixtures dourados desatualizados: rode `npm run godot:golden`');
});
