// Contrato das mensagens da mesa para o servidor: cada tipo do ClientMessage (src/forge/protocol.ts) tem um `case`
// no servidor (ClientActions, Rooms ou LobbyRequests), e cada `case` do servidor está declarado no ClientMessage.
// Um tipo renomeado de um lado só é recusado calado pelo servidor ("tipo desconhecido") ou nunca é mandado.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const BRIDGE = 'forge-bridge/src/main/java/mesadeduelo/bridge/';
const HANDLERS = ['ClientActions.java', 'Rooms.java', 'LobbyRequests.java'];

function clientTypes() {
  const file = ts.createSourceFile('protocol.ts', read('src/forge/protocol.ts'), ts.ScriptTarget.ES2022, true);
  const alias = file.statements.find(s => ts.isTypeAliasDeclaration(s) && s.name.text === 'ClientMessage');
  const types = new Set();
  const visit = node => {
    if (ts.isPropertySignature(node) && node.name.getText(file) === 'type' && node.type) {
      const lits = ts.isUnionTypeNode(node.type) ? node.type.types : [node.type];
      for (const l of lits) if (ts.isLiteralTypeNode(l) && ts.isStringLiteral(l.literal)) types.add(l.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(alias);
  return types;
}

/** Os `case "x"` dos switch que leem o tipo da mensagem (os de outros switch, como cores, ficam de fora). */
function serverTypes() {
  const types = new Set();
  for (const f of HANDLERS) {
    const src = read(BRIDGE + f);
    for (const m of src.matchAll(/switch \(type\) \{([\s\S]*?)\n {8}\}/g)) for (const c of m[1].matchAll(/case ((?:"[a-z-]+"(?:, )?)+)/g)) for (const t of c[1].matchAll(/"([a-z-]+)"/g)) types.add(t[1]);
  }
  return types;
}

test('the server handles every message type the table can send, and nothing undeclared', () => {
  const client = clientTypes(), server = serverTypes();
  assert.ok(client.size > 20 && server.size > 20, `poucos tipos: mesa ${client.size}, servidor ${server.size}`);
  assert.deepEqual([...client].filter(t => !server.has(t)).sort(), [], 'Declarados no ClientMessage sem `case` no servidor:');
  assert.deepEqual([...server].filter(t => !client.has(t)).sort(), [], 'Tratados no servidor sem estar no ClientMessage (src/forge/protocol.ts):');
});
