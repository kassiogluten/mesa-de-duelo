#!/usr/bin/env node
// Exports de src/ que nenhum outro arquivo usa (nem src, nem tests, nem fixtures, nem páginas HTML).
//   npm run unused            lista
// Conservador: procura o nome como palavra em todos os arquivos; um nome repetido por coincidência conta como uso.
// Cada achado é "export à toa" (usado só no próprio arquivo: tire o `export`) ou "morto" (nem no próprio arquivo: apague).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const walk = (dir, ok) => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  if (name === 'node_modules' || name.startsWith('.')) return [];
  return statSync(path).isDirectory() ? walk(path, ok) : ok(path) ? [path] : [];
});
const sources = walk(join(ROOT, 'src'), p => p.endsWith('.ts'));
const others = [...walk(join(ROOT, 'tests'), p => /\.(mjs|ts|html)$/.test(p)), ...walk(join(ROOT, 'scripts'), p => p.endsWith('.mjs')),
  ...readdirSync(ROOT).filter(n => /\.(html|ts)$/.test(n)).map(n => join(ROOT, n))];
const text = new Map([...sources, ...others].map(p => [p, readFileSync(p, 'utf8')]));

function exportedNames(path) {
  const file = ts.createSourceFile(path, text.get(path), ts.ScriptTarget.ES2022, true);
  const names = [];
  const exported = n => ts.canHaveModifiers(n) && ts.getModifiers(n)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
  for (const st of file.statements) {
    if (!exported(st)) continue;
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) { if (ts.isIdentifier(d.name)) names.push(d.name.text); }
    else if (st.name && ts.isIdentifier(st.name)) names.push(st.name.text);
  }
  return names;
}

const count = (src, name) => (src.match(new RegExp(`(?<![\\w$])${name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g')) ?? []).length;
const found = [];
for (const path of sources) {
  for (const name of exportedNames(path)) {
    let elsewhere = false;
    for (const [other, src] of text) if (other !== path && count(src, name)) { elsewhere = true; break; }
    if (elsewhere) continue;
    found.push({ file: relative(ROOT, path).replace(/\\/g, '/'), name, dead: count(text.get(path), name) <= 1 });
  }
}
for (const f of found) console.log(`${f.dead ? 'morto       ' : 'export à toa'}  ${f.file}  ${f.name}`);
console.log(`\n${found.filter(f => f.dead).length} mortos, ${found.filter(f => !f.dead).length} exports à toa`);
