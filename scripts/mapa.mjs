#!/usr/bin/env node
// Mapa do código: cada arquivo de src/ e do servidor com o comentário do topo e o número de linhas.
//   npm run mapa              tudo
//   npm run mapa -- ui/hand   só os caminhos que contêm o texto
// O comentário do topo é a primeira frase do primeiro comentário do arquivo (// ou /** */), ou do Javadoc da classe.
// tests/mapa.test.mjs confere que todo arquivo tem um.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DIRS = ['src', 'forge-bridge/src/main/java'];

export function files() {
  const walk = dir => readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.(ts|java)$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
  });
  return DIRS.flatMap(d => walk(join(ROOT, d))).map(p => relative(ROOT, p).replace(/\\/g, '/')).sort();
}

/** A primeira frase do primeiro comentário (antes ou logo depois dos imports/package). */
export function summary(text) {
  const body = text.replace(/^﻿/, '');
  const m = /^(?:\s*(?:import[^\n]*|package[^\n]*|export \* from[^\n]*|export type \* from[^\n]*|)\n)*?\s*(\/\*\*?[\s\S]*?\*\/|(?:\s*\/\/[^\n]*\n)+)/.exec(body);
  if (!m) return '';
  const clean = m[1].replace(/^\s*\/\*\*?|\*\/\s*$/g, '').split('\n').map(l => l.replace(/^\s*(\*|\/\/)\s?/, '').trim()).filter(Boolean).join(' ');
  const first = /^(.+?[.!?:])(\s|$)/.exec(clean);
  return (first ? first[1] : clean).slice(0, 160);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const filter = process.argv[2] ?? '';
  let dir = '';
  for (const f of files().filter(f => f.includes(filter))) {
    const text = readFileSync(join(ROOT, f), 'utf8');
    const d = f.slice(0, f.lastIndexOf('/'));
    if (d !== dir) { console.log(`\n${d}/`); dir = d; }
    console.log(`  ${f.slice(d.length + 1).padEnd(28)} ${String(text.split('\n').length).padStart(5)}  ${summary(text) || '(sem comentário no topo)'}`);
  }
}
