import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, files, summary } from '../scripts/mapa.mjs';

// Todo arquivo de src/ e do servidor começa com um comentário dizendo o que faz: é o que o npm run mapa mostra.
test('todo arquivo tem o comentário do topo', () => {
  const list = files();
  assert.ok(list.some(f => f.endsWith('.java')), 'o mapa deveria incluir os arquivos do servidor');
  const sem = list.filter(f => !summary(readFileSync(join(ROOT, f), 'utf8')));
  assert.deepEqual(sem, [], `sem comentário no topo:\n  ${sem.join('\n  ')}\ncomece o arquivo com um comentário de uma frase dizendo o que ele faz (npm run mapa)`);
});
