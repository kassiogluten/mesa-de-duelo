// docs/protocolo.md é gerado de src/forge/protocol.ts: mudou um tipo, rode `npm run protocol-doc`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { render } from '../scripts/protocol-doc.mjs';

test('docs/protocolo.md está em dia com src/forge/protocol.ts', () => {
  const saved = readFileSync(new URL('../docs/protocolo.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(saved === render(), 'docs/protocolo.md está desatualizado: rode `npm run protocol-doc`.');
});
