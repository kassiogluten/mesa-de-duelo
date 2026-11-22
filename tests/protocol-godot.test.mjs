// godot-table/net/protocol.gd é gerado de src/forge/protocol.ts: mudou um tipo de mensagem, evento ou pergunta, rode `npm run protocol-godot`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { OUT, render } from '../scripts/protocol-godot.mjs';

test('godot-table/net/protocol.gd está em dia com src/forge/protocol.ts', () => {
  const saved = readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n');
  assert.ok(saved === render(), 'godot-table/net/protocol.gd está desatualizado: rode `npm run protocol-godot`.');
});

test('as constantes trazem os tipos que a mesa no PC usa', () => {
  const text = render();
  for (const value of ['"state"', '"hello"', '"rejoin"', '"damage"', '"choose"', '"triggers"']) assert.ok(text.includes(value), value);
});
