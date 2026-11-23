#!/usr/bin/env node
// Gera o pacote do jogo da mesa no PC (game-<versão>.pck) e o manifesto versao.json que o atualizador do boot consulta.
//   npm run godot:pck                      em dist/mesa-pc/, com a versão do package.json
//   npm run godot:pck -- --out <pasta> --version <x.y.z>
// Roda no build do Docker (Dockerfile), então cada deploy do site publica o pacote da mesma versão. O manifesto é
// gravado por último: enquanto ele não muda, ninguém baixa um pacote pela metade.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** Sobe junto com BOOT_VERSION de godot-table/boot/boot.gd quando o pacote passa a depender de um boot novo. */
const MIN_BOOT = 1;
/** Página do site com o zip da mesa no PC: o boot a abre quando a versão nova pede outro executável. */
const DOWNLOAD_PAGE = 'https://mesao.online/baixar';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function godot(...args) {
  const run = spawnSync(process.execPath, [join(ROOT, 'scripts', 'godot.mjs'), ...args], { encoding: 'utf8' });
  return { ok: run.status === 0, out: `${run.stdout ?? ''}${run.stderr ?? ''}` };
}

const version = arg('version', JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version);
const out = resolve(arg('out', join(ROOT, 'dist', 'mesa-pc')));
mkdirSync(out, { recursive: true });

const engine = /(\d+\.\d+\.\d+)/.exec(godot('--version').out)?.[1];
if (!engine) { console.error('Não consegui ler a versão do Godot.'); process.exit(1); }

// Projeto recém-clonado (sem .godot/): importa antes de exportar.
const imported = godot('--headless', '--import');
if (!imported.ok) { console.error(imported.out); process.exit(1); }

const pck = `game-${version}.pck`;
const exported = godot('--headless', '--export-pack', 'Jogo', join(out, pck));
if (!exported.ok || /ERROR:/.test(exported.out)) { console.error(exported.out); process.exit(1); }

const bytes = readFileSync(join(out, pck));
const manifest = {
  version,
  pck,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  size: statSync(join(out, pck)).size,
  engine,
  minBoot: MIN_BOOT,
  download: DOWNLOAD_PAGE,
};
writeFileSync(join(out, 'versao.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Pacote ${pck} (${(manifest.size / 1024).toFixed(0)} KB, Godot ${engine}) em ${out}`);
