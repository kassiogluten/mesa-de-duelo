#!/usr/bin/env node
// Gera o pacote do jogo da mesa no PC (game-<versão>.pck) e o manifesto versao.json que o atualizador do boot consulta.
//   npm run godot:pck                      em dist/mesa-pc/, com a versão do package.json mais o hash do pacote
//   npm run godot:pck -- --out <pasta> --version <x.y.z>
// Roda no build do Docker (Dockerfile), então cada deploy do site publica o pacote da mesma versão. O manifesto é
// gravado por último: enquanto ele não muda, ninguém baixa um pacote pela metade.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

// A versão do site (package.json) só sobe quando sai novidade; um deploy só com correções gera um pacote diferente com o
// mesmo número, e a mesa (que atualiza quando o número muda) não o baixaria. Por isso o número leva o começo de um hash do
// código do jogo (`0.240.0+a1b2c3d4`): mudou algo em godot-table/, é versão nova para a mesa; deploy só do site, não. O hash
// é do código e não do pacote porque o Godot não exporta o mesmo pacote duas vezes (o mesmo código dá bytes diferentes).
// `--version` usa o número dado, sem hash.
const fixedVersion = arg('version', '');
const baseVersion = fixedVersion || JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

/** Hash dos arquivos que entram no pacote (godot-table/ sem o que o preset "Jogo" deixa de fora), em ordem fixa e com as
 * quebras de linha normalizadas, para dar o mesmo valor no Windows e no Linux. */
function sourceHash(engineVersion) {
  const base = join(ROOT, 'godot-table');
  const skip = new Set(['.godot', 'export', 'tests', 'tools', 'boot']);
  const files = [];
  const walk = (dir, rel) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { if (!skip.has(path)) walk(join(dir, entry.name), path); }
      else files.push(path);
    }
  };
  walk(base, '');
  const hash = createHash('sha256').update(`engine ${engineVersion}\n`);
  for (const file of files.sort()) {
    const bytes = readFileSync(join(base, file));
    const text = /\.(gd|gdshader|tscn|tres|cfg|godot|import|uid|json|txt|md)$/.test(file);
    hash.update(`${file}\n`).update(text ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')) : bytes);
  }
  return hash.digest('hex');
}

const out = resolve(arg('out', join(ROOT, 'dist', 'mesa-pc')));
mkdirSync(out, { recursive: true });

const versionRun = godot('--version');
const engine = /(\d+\.\d+\.\d+)/.exec(versionRun.out)?.[1];
if (!engine) { console.error(`Não consegui ler a versão do Godot (${process.env.GODOT ?? 'godot'}):
${versionRun.out}`); process.exit(1); }

// Projeto recém-clonado (sem .godot/): importa antes de exportar.
const imported = godot('--headless', '--import');
if (!imported.ok) { console.error(imported.out); process.exit(1); }

// Exporta com um nome provisório e renomeia depois de saber o hash (o nome do arquivo leva a versão).
const draft = join(out, 'game-exportando.pck');
const exported = godot('--headless', '--export-pack', 'Jogo', draft);
// Falha de verdade: o Godot saiu com erro ou o pacote não saiu (ou saiu vazio). Linhas "ERROR:" com o pacote pronto (no
// Linux do Docker o Godot reclama de recursos não liberados ao fechar, de áudio, de dbus) só vão para o log, como aviso.
const draftOk = existsSync(draft) && statSync(draft).size > 64 * 1024;
if (!exported.ok || !draftOk) { console.error(`O pacote da mesa no PC não foi exportado.\n${exported.out}`); process.exit(1); }
const complaints = exported.out.split('\n').filter(line => /ERROR:/.test(line));
if (complaints.length) console.warn(`AVISO: o Godot reclamou ao exportar o pacote (que saiu):\n${complaints.slice(0, 20).join('\n')}`);

const bytes = readFileSync(draft);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const version = fixedVersion || `${baseVersion}+${sourceHash(engine).slice(0, 8)}`;
const pck = `game-${version}.pck`;
// Pacotes de versões anteriores na mesma pasta (build local repetido) ficam de fora do zip e do manifesto.
for (const old of readdirSync(out)) if (/^game-.*\.pck$/.test(old) && old !== 'game-exportando.pck') rmSync(join(out, old));
renameSync(draft, join(out, pck));
const manifest = {
  version,
  pck,
  sha256,
  size: statSync(join(out, pck)).size,
  engine,
  minBoot: MIN_BOOT,
  download: DOWNLOAD_PAGE,
};
writeFileSync(join(out, 'versao.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Pacote ${pck} (${(manifest.size / 1024).toFixed(0)} KB, Godot ${engine}) em ${out}`);
