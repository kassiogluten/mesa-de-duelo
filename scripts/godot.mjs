#!/usr/bin/env node
// Roda o Godot da mesa nova (godot-table/) com os argumentos dados; acha o executável pela variável GODOT, pelo PATH ou pela instalação do winget.
// Antes, copia para godot-table/data/ os dados de shared/ que o jogo usa.
//   npm run godot -- --headless --script res://tools/smoke.gd
//   npm run godot:smoke     conecta ao servidor local (npm run forge) e mede um ping
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROJECT = join(ROOT, 'godot-table');

function findGodot() {
  if (process.env.GODOT) return process.env.GODOT;
  const winget = join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Packages');
  if (existsSync(winget)) {
    for (const pkg of readdirSync(winget).filter(n => n.startsWith('GodotEngine.GodotEngine'))) {
      const exe = readdirSync(join(winget, pkg)).find(n => /^Godot_v4.*_console\.exe$/.test(n));
      if (exe) return join(winget, pkg, exe);
    }
  }
  return process.platform === 'win32' ? 'godot.exe' : 'godot';
}

/** Dados do repositório que o jogo usa, copiados para godot-table/data/ (fora do git) a cada execução: os decks prontos
 *  e os preços das cartas (shared/) e os sons da mesa (public/audio/*.mp3, os mesmos da mesa do navegador). */
const SHARED_DATA = ['starter-decks.json', 'card-prices-brl.json'];
function syncData() {
  const dir = join(PROJECT, 'data');
  const copy = (from, to) => { if (!existsSync(to) || !readFileSync(to).equals(readFileSync(from))) copyFileSync(from, to); };
  mkdirSync(join(dir, 'audio'), { recursive: true });
  for (const name of SHARED_DATA) copy(join(ROOT, 'shared', name), join(dir, name));
  const audio = join(ROOT, 'public', 'audio');
  // Os sons da mesa, os de cada tipo de criatura (criaturas/) e o rangido da mesa lotada (mesa/).
  for (const sub of ['', 'criaturas', 'mesa']) {
    const from = join(audio, sub);
    if (!existsSync(from)) continue;
    mkdirSync(join(dir, 'audio', sub), { recursive: true });
    for (const name of readdirSync(from).filter(n => n.endsWith('.mp3'))) copy(join(from, name), join(dir, 'audio', sub, name));
  }
}

/** O arquivo mais novo que o Godot importa (scripts, shaders, cenas, sons), fora de .godot/ e export/: se for mais novo que a
 *  última importação, importa de novo (classes novas e sons novos só existem depois disso). */
function newestScript(dir = PROJECT) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'export') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestScript(path));
    else if (/\.(gd|gdshader|tscn|mp3)$/.test(entry.name)) newest = Math.max(newest, statSync(path).mtimeMs);
  }
  return newest;
}

syncData();
const godot = findGodot();
// Script novo ou mudado: importa antes, senão as classes com class_name novas não existem para quem roda do projeto.
const classCache = join(PROJECT, '.godot', 'global_script_class_cache.cfg');
if (!process.argv.includes('--import') && (!existsSync(classCache) || statSync(classCache).mtimeMs < newestScript())) {
  spawnSync(godot, ['--path', PROJECT, '--headless', '--import'], { stdio: 'ignore' });
}
const args = ['--path', PROJECT, ...process.argv.slice(2)];
const run = spawnSync(godot, args, { stdio: 'inherit' });
if (run.error) {
  console.error(`Não consegui rodar o Godot (${godot}): ${run.error.message}. Instale o Godot 4 ou aponte a variável GODOT para o executável.`);
  process.exit(1);
}
process.exit(run.status ?? 1);
