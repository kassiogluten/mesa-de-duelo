#!/usr/bin/env node
// Gera docs/protocolo.md a partir de src/forge/protocol.ts: cada tipo de mensagem com os campos, o tipo de cada um e
// o comentário. O tests/protocol-doc.test.mjs falha quando o arquivo gerado ficou para trás.
//   npm run protocol-doc        regrava docs/protocolo.md
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SRC = fileURLToPath(new URL('../src/forge/protocol.ts', import.meta.url));
const OUT = fileURLToPath(new URL('../docs/protocolo.md', import.meta.url));

const doc = node => ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc).map(d => (typeof d.comment === 'string' ? d.comment : '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
const cell = s => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

export function render() {
  const file = ts.createSourceFile(SRC, readFileSync(SRC, 'utf8'), ts.ScriptTarget.ES2022, true);
  const out = ['# Protocolo da mesa', '',
    'Gerado de `src/forge/protocol.ts` por `npm run protocol-doc`; não edite à mão. Os campos do estado (`FState`) são',
    'conferidos contra o servidor pelo `ProtocolContractTest` e pelo `tests/protocol.test.mjs`. Exemplos comentados das',
    'mensagens ficam no `forge-bridge/README.md`.', ''];
  for (const st of file.statements) {
    if (!ts.isInterfaceDeclaration(st) && !ts.isTypeAliasDeclaration(st)) continue;
    if (!st.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    out.push(`## ${st.name.text}`, '');
    const about = doc(st);
    if (about) out.push(about, '');
    const members = ts.isInterfaceDeclaration(st) ? st.members : ts.isTypeLiteralNode(st.type) ? st.type.members : null;
    if (ts.isInterfaceDeclaration(st) && st.heritageClauses) out.push(`Estende: ${st.heritageClauses.map(h => h.types.map(t => `\`${t.getText(file)}\``).join(', ')).join(', ')}`, '');
    if (members) {
      out.push('| Campo | Tipo | O que é |', '|---|---|---|');
      for (const m of members) {
        if (!ts.isPropertySignature(m)) continue;
        out.push(`| \`${m.name.getText(file)}${m.questionToken ? '?' : ''}\` | \`${cell(m.type?.getText(file) ?? 'unknown')}\` | ${cell(doc(m))} |`);
      }
    } else {
      out.push('```ts', st.type.getText(file).replace(/\r/g, ''), '```');
    }
    out.push('');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(OUT, render());
  console.log('docs/protocolo.md atualizado');
}
