#!/usr/bin/env node
// Monta o zip da mesa no PC (mesa-de-duelo-pc.zip): o executável (só o boot), o pacote do jogo da versão e o LEIA-ME.
//   npm run godot:zip                       em dist/mesa-pc/, depois do npm run godot:pck
//   npm run godot:zip -- --out <pasta>
// Lê o versao.json da pasta (versão e pacote), exporta o executável (preset "Windows", precisa do template de exportação
// do Windows) e acrescenta ao manifesto zip, zipSize e zipSha256. Roda no build do Docker logo depois do godot-pck.mjs.
// O jogador extrai a pasta "Mesa de Duelo" onde quiser; o pacote dentro dela faz a primeira abertura funcionar sem baixar.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeZip } from './zip-file.mjs';

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

const work = mkdtempSync(join(tmpdir(), 'mesa-pc-zip-'));
const zipPath = join(out, ZIP_NAME);
const part = `${zipPath}.part`;
try {
  const exe = join(work, EXE_NAME);
  const exported = godot('--headless', '--export-release', 'Windows', exe);
  // O executável sai só com o template do Windows instalado; sem ele, o Godot avisa e não grava nada.
  if (!exported.ok || !existsSync(exe) || statSync(exe).size < 1024 * 1024) {
    throw new Error(`O executável não foi exportado (o template de exportação do Windows está instalado?).\n${exported.out}`);
  }

  writeZip(part, [
    { name: `${FOLDER}/` },
    { name: `${FOLDER}/${EXE_NAME}`, data: readFileSync(exe) },
    // Com a versão no nome, como no site: o boot sabe qual é sem abrir o pacote.
    { name: `${FOLDER}/game-${manifest.version}.pck`, data: readFileSync(pckPath) },
    { name: `${FOLDER}/LEIA-ME.txt`, data: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(README.replace(/\n/g, '\r\n'), 'utf8')]) },
  ]);
  renameSync(part, zipPath);

  // O manifesto por último, como no godot-pck.mjs: a página de download lê dele o tamanho e a versão.
  const bytes = readFileSync(zipPath);
  const updated = { ...manifest, zip: ZIP_NAME, zipSize: bytes.length, zipSha256: createHash('sha256').update(bytes).digest('hex') };
  writeFileSync(`${manifestPath}.part`, JSON.stringify(updated, null, 2) + '\n');
  renameSync(`${manifestPath}.part`, manifestPath);
  console.log(`Zip ${ZIP_NAME} (${(bytes.length / 1048576).toFixed(1)} MB, versão ${manifest.version}) em ${out}`);
} catch (e) {
  // O zip e o manifesto anteriores ficam como estavam.
  rmSync(part, { force: true });
  console.error(e.message);
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
