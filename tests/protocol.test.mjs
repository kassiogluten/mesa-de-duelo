// Contrato do estado com o servidor: cada campo de tests/protocol/state-keys.txt (gerado pelo ProtocolContractTest
// do servidor a partir de uma partida de verdade) precisa existir nos tipos de src/forge/client.ts, a partir de FState.
// Um campo renomeado só de um lado aparece aqui, em vez de a mesa ler `undefined` calada.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const file = (p) => fileURLToPath(new URL(p, import.meta.url));
const keys = readFileSync(file('./protocol/state-keys.txt'), 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));

const clientPath = file('../src/forge/client.ts');
const program = ts.createProgram([clientPath], { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, noEmit: true, skipLibCheck: true, resolveJsonModule: true });
const checker = program.getTypeChecker();
const source = program.getSourceFile(clientPath);
const fstate = source.statements.find(s => ts.isInterfaceDeclaration(s) && s.name.text === 'FState');
const root = checker.getTypeAtLocation(fstate.name);

/** Os tipos que um valor desse tipo pode ter, sem null/undefined e abrindo uniões. */
const parts = (type) => {
  const t = checker.getNonNullableType(type);
  return t.isUnion() ? t.types.flatMap(parts) : [t];
};
const isOpen = (t) => (t.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0;

/** Desce um passo no caminho: `name` é um campo; `[]` é o item de uma lista; `*` é a chave de um mapa por id. */
function step(types, name) {
  const out = [];
  for (const t of types) {
    if (isOpen(t)) { out.push(t); continue; }
    if (name === '[]') {
      if (checker.isArrayType(t) || checker.isTupleType(t)) out.push(...checker.getTypeArguments(t).flatMap(parts));
      continue;
    }
    const prop = name === '*' ? null : t.getProperty(name);
    if (prop) { out.push(...parts(checker.getTypeOfSymbol(prop))); continue; }
    const index = t.getStringIndexType() ?? (name === '*' ? t.getNumberIndexType() : undefined);
    if (index) out.push(...parts(index));
  }
  return out;
}

function declared(path) {
  let types = parts(root);
  for (const segment of path.replace(/\[\]/g, '.[]').split('.').filter(Boolean)) {
    types = step(types, segment);
    if (!types.length) return false;
  }
  return true;
}

test('the contract list was generated from a real match', () => {
  assert.ok(keys.length > 100, `only ${keys.length} fields in tests/protocol/state-keys.txt`);
  assert.ok(keys.includes('players[].battlefield[].name'));
});

test('every field the server sends in the state is declared in client.ts (FState)', () => {
  const missing = keys.filter(k => !declared(k));
  assert.deepEqual(missing, [], 'Declare these fields in src/forge/client.ts (or fix the name on the server):');
});
