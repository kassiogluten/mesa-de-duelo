#!/usr/bin/env node
// Monta os downloads da mesa no PC: o zip do Windows e o .tar.gz do Linux, cada um com o executável (só o boot), o pacote do jogo da versão e o LEIA-ME.
//   npm run godot:zip                       em dist/mesa-pc/, depois do npm run godot:pck
//   npm run godot:zip -- --out <pasta>
// Lê o versao.json da pasta (versão e pacote), exporta os executáveis (presets "Windows" e "Linux", cada um com o seu
// template de exportação) e acrescenta ao manifesto zip, zipSize e zipSha256 (Windows) e linux, linuxSize e linuxSha256.
// Roda no build do Docker logo depois do godot-pck.mjs. Só o Windows falhar dá erro; o Linux que falha fica de fora com
// um aviso. O jogador extrai a pasta "Mesa de Duelo" onde quiser; o pacote dentro dela faz a primeira abertura funcionar
// sem baixar.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeZip } from './zip-file.mjs';
import { writeTarGz } from './tar-gz-file.mjs';
import { LINUX_ARCHIVE, LINUX_EXE, LINUX_README, SHORTCUT_SCRIPT, SHORTCUT_SCRIPT_TEXT } from './godot-linux-files.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ZIP_NAME = 'mesa-de-duelo-pc.zip';
const FOLDER = 'Mesa de Duelo';
const EXE_NAME = 'Mesa de Duelo.exe';

/** O LEIA-ME que vai na pasta, com quebras de linha do Windows (o Bloco de Notas antigo não entende só \n). */
const README = `Mesa de Duelo no PC

COMO ABRIR
Deixe esta pasta onde preferir (Documentos, Área de Trabalho, um pendrive) e abra "${EXE_NAME}".
Se o Windows avisar que protegeu o computador, clique em "Mais informações" e depois em "Executar assim mesmo".
Para ter um atalho na Área de Trabalho: clique com o botão direito no "${EXE_NAME}", "Mostrar mais opções",
"Enviar para" e "Área de trabalho (criar atalho)".

ATUALIZAÇÕES
A mesa se atualiza sozinha: cada vez que abre, ela confere se saiu versão nova e baixa só o que mudou.
Não precisa baixar o zip de novo. Raramente uma versão precisa ser baixada de novo no site; quando
isso acontecer, a própria mesa avisa e abre a página.

ONDE FICAM SEUS DADOS
As atualizações, os decks guardados no computador, as preferências e o login ficam em
  %APPDATA%\\Godot\\app_userdata\\Mesa de Duelo
(cole esse endereço na barra do Explorador de Arquivos para abrir a pasta). Mudar esta pasta de lugar
não perde nada.

DESINSTALAR
Apague esta pasta. Para apagar também as atualizações, os decks guardados no computador e o login,
apague a pasta acima. Os decks da sua conta continuam no site.

https://mesao.online
`;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function godot(...args) {
  const run = spawnSync(process.execPath, [join(ROOT, 'scripts', 'godot.mjs'), ...args], { encoding: 'utf8' });
  return { ok: run.status === 0, out: `${run.stdout ?? ''}${run.stderr ?? ''}` };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** Exporta o executável do preset; sem o template da plataforma, o Godot avisa e não grava nada. */
function exportExe(preset, path) {
  const exported = godot('--headless', '--export-release', preset, path);
  if (!exported.ok || !existsSync(path) || statSync(path).size < 1024 * 1024) {
    throw new Error(`O executável ${preset} não foi exportado (o template de exportação ${preset} está instalado?).\n${exported.out}`);
  }
  return readFileSync(path);
}

/** Grava pelo .part e devolve o nome, o tamanho e o hash; o arquivo anterior só é trocado com o novo inteiro. */
function publishArchive(path, write) {
  const part = `${path}.part`;
  try {
    write(part);
    renameSync(part, path);
  } finally {
    rmSync(part, { force: true });
  }
  const bytes = readFileSync(path);
  return { size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

const out = resolve(arg('out', join(ROOT, 'dist', 'mesa-pc')));
const manifestPath = join(out, 'versao.json');
if (!existsSync(manifestPath)) fail(`Falta ${manifestPath}: rode antes o npm run godot:pck.`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const pckPath = join(out, manifest.pck);
if (!existsSync(pckPath)) fail(`Falta o pacote ${pckPath}.`);

// Projeto recém-clonado (sem .godot/): importa antes de exportar.
if (!existsSync(join(ROOT, 'godot-table', '.godot'))) {
  const imported = godot('--headless', '--import');
  if (!imported.ok) fail(imported.out);
}

const pck = readFileSync(pckPath);
// Com a versão no nome, como no site: o boot sabe qual é sem abrir o pacote.
const bundledPck = `game-${manifest.version}.pck`;
const mb = bytes => `${(bytes / 1048576).toFixed(1)} MB`;
const work = mkdtempSync(join(tmpdir(), 'mesa-pc-zip-'));
const updated = { ...manifest };
let changed = false;
try {
  try {
    const exe = exportExe('Windows', join(work, EXE_NAME));
    const zip = publishArchive(join(out, ZIP_NAME), part => writeZip(part, [
      { name: `${FOLDER}/` },
      { name: `${FOLDER}/${EXE_NAME}`, data: exe },
      { name: `${FOLDER}/${bundledPck}`, data: pck },
      { name: `${FOLDER}/LEIA-ME.txt`, data: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(README.replace(/\n/g, '\r\n'), 'utf8')]) },
    ]));
    Object.assign(updated, { zip: ZIP_NAME, zipSize: zip.size, zipSha256: zip.sha256 });
    changed = true;
    console.log(`Zip ${ZIP_NAME} (${mb(zip.size)}, versão ${manifest.version}) em ${out}`);
  } catch (e) {
    // O zip e os campos dele no manifesto ficam como estavam.
    console.error(e.message);
    process.exitCode = 1;
  }

  try {
    const exe = exportExe('Linux', join(work, LINUX_EXE));
    const linux = publishArchive(join(out, LINUX_ARCHIVE), part => writeTarGz(part, [
      { name: `${FOLDER}/`, mode: 0o755 },
      { name: `${FOLDER}/${LINUX_EXE}`, data: exe, mode: 0o755 },
      { name: `${FOLDER}/${bundledPck}`, data: pck, mode: 0o644 },
      { name: `${FOLDER}/icon.png`, data: readFileSync(join(ROOT, 'godot-table', 'boot', 'icon.png')), mode: 0o644 },
      { name: `${FOLDER}/LEIA-ME.txt`, data: Buffer.from(LINUX_README, 'utf8'), mode: 0o644 },
      { name: `${FOLDER}/${SHORTCUT_SCRIPT}`, data: Buffer.from(SHORTCUT_SCRIPT_TEXT, 'utf8'), mode: 0o755 },
    ]));
    Object.assign(updated, { linux: LINUX_ARCHIVE, linuxSize: linux.size, linuxSha256: linux.sha256 });
    changed = true;
    console.log(`Linux ${LINUX_ARCHIVE} (${mb(linux.size)}, versão ${manifest.version}) em ${out}`);
  } catch (e) {
    // Nunca derruba o deploy: o Windows sai igual e o manifesto fica sem os campos do Linux desta versão.
    console.warn(`AVISO: o pacote Linux da mesa no PC ficou de fora.\n${e.message}`);
  }

  // O manifesto por último, como no godot-pck.mjs: a página de download lê dele os tamanhos e a versão.
  if (changed) {
    writeFileSync(`${manifestPath}.part`, JSON.stringify(updated, null, 2) + '\n');
    renameSync(`${manifestPath}.part`, manifestPath);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
