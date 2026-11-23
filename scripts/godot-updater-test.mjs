#!/usr/bin/env node
// Teste de ponta a ponta do atualizador da mesa no PC: exporta o executável (só o boot), serve versões por HTTP local
// e confere primeira instalação, atualização, servidor fora do ar, pacote corrompido e volta à versão anterior; depois monta
// o zip do site (godot-zip.mjs), confere o que vai dentro e o manifesto, e abre o executável extraído dele sem internet.
//   npm run godot:test-atualizador      (precisa dos templates de exportação do Windows instalados no Godot)
//   SHOW_OUT=1 npm run godot:test-atualizador    mostra também a saída do executável
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readZip } from './zip-file.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXE = join(ROOT, 'godot-table', 'export', 'MesaDeDuelo.exe');
const work = mkdtempSync(join(tmpdir(), 'mesa-pc-atualizador-'));
const site = join(work, 'site');
const appdata = join(work, 'appdata');
const stateOf = dir => join(dir, 'Godot', 'app_userdata', 'Mesa de Duelo', 'updates', 'estado.json');
const stateFile = stateOf(appdata);

function node(script, ...args) {
  const run = spawnSync(process.execPath, [join(ROOT, 'scripts', script), ...args], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`${script} falhou:\n${run.stdout}${run.stderr}`);
}

/** Publica uma versão na pasta servida (como o deploy faz). */
function publish(version) {
  const dir = join(work, `v${version}`);
  node('godot-pck.mjs', '--out', dir, '--version', version);
  mkdirSync(site, { recursive: true });
  cpSync(dir, site, { recursive: true });
}

let serving = true;
const server = createServer((req, res) => {
  const file = join(site, decodeURIComponent(req.url.split('?')[0]));
  if (!serving || !existsSync(file)) { res.writeHead(serving ? 404 : 503); res.end(); return; }
  res.writeHead(200); res.end(readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const manifestUrl = `http://127.0.0.1:${server.address().port}/versao.json`;

/** Abre o executável até a mesa abrir e confirmar a versão (ou dar erro/tempo). Devolve a saída e o estado no disco. */
function open(exe = EXE, userDir = appdata) {
  return new Promise(resolvePromise => {
    const child = spawn(exe, ['--headless'], { env: { ...process.env, APPDATA: userDir, MESA_PC_MANIFEST: manifestUrl } });
    let out = '';
    let opened = false;
    const finish = () => { child.kill(); };
    child.stdout.on('data', d => {
      out += d;
      if (process.env.SHOW_OUT) process.stdout.write(String(d));
      if (!opened && out.includes("Mesa aberta")) { opened = true; setTimeout(finish, 3000); }
    });
    child.stderr.on('data', d => { out += d; });
    const timer = setTimeout(finish, 20000);
    child.on('exit', () => {
      clearTimeout(timer);
      const file = stateOf(userDir);
      const state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
      resolvePromise({ out, opened, state });
    });
  });
}

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'ok' : 'FALHOU'} - ${name}`);
  if (!ok) { failures++; console.log(detail); }
}

try {
  mkdirSync(dirname(EXE), { recursive: true }); // num clone novo a pasta export/ não existe e o Godot recusa
  node('godot.mjs', '--headless', '--export-release', 'Windows', 'export/MesaDeDuelo.exe');
  if (!existsSync(EXE)) throw new Error('O executável não foi exportado (templates do Windows instalados?).');

  publish('1.0.0');
  let r = await open();
  check('primeira abertura baixa o pacote e abre a mesa', r.opened && r.state?.current === '1.0.0' && r.out.includes('Versão 1.0.0'), r.out);
  check('a mesa confirma a versão', r.state?.trying === '', JSON.stringify(r.state));

  publish('1.0.1');
  r = await open();
  check('versão nova é baixada e a anterior fica guardada', r.opened && r.state?.current === '1.0.1' && r.state?.previous === '1.0.0', JSON.stringify(r.state));

  serving = false;
  r = await open();
  check('sem servidor, abre com a última versão', r.opened && r.out.includes('Versão 1.0.1'), r.out);
  serving = true;

  publish('1.0.2');
  const manifest = JSON.parse(readFileSync(join(site, 'versao.json'), 'utf8'));
  writeFileSync(join(site, 'versao.json'), JSON.stringify({ ...manifest, sha256: '0'.repeat(64) }));
  r = await open();
  check('pacote que não confere com o hash é descartado', r.opened && r.state?.current === '1.0.1', JSON.stringify(r.state));

  // Versão que nunca confirma (a mesa fecha antes): depois de 2 tentativas, volta à anterior.
  writeFileSync(join(site, 'versao.json'), JSON.stringify(manifest));
  writeFileSync(stateFile, JSON.stringify({ ...JSON.parse(readFileSync(stateFile, 'utf8')) }));
  r = await open();
  check('versão 1.0.2 baixada', r.state?.current === '1.0.2', JSON.stringify(r.state));
  const crashed = { ...r.state, trying: '1.0.2', tries: 2 };
  writeFileSync(stateFile, JSON.stringify(crashed));
  r = await open();
  check('versão que não abriu duas vezes vira quebrada e volta à anterior', r.opened && r.state?.current === '1.0.1' && r.state?.bad?.includes('1.0.2'), JSON.stringify(r.state));

  // O zip do site: a pasta "Mesa de Duelo" com o executável, o pacote da versão e o LEIA-ME.
  const zdir = join(work, 'zip');
  node('godot-pck.mjs', '--out', zdir, '--version', '2.0.0');
  node('godot-zip.mjs', '--out', zdir);
  const zipFile = join(zdir, 'mesa-de-duelo-pc.zip');
  const entries = readZip(zipFile);
  const names = entries.map(e => e.name);
  check('o zip traz o executável, o pacote e o LEIA-ME numa pasta',
    ['Mesa de Duelo/Mesa de Duelo.exe', 'Mesa de Duelo/game-2.0.0.pck', 'Mesa de Duelo/LEIA-ME.txt'].every(n => names.includes(n)), names.join(', '));
  const zipManifest = JSON.parse(readFileSync(join(zdir, 'versao.json'), 'utf8'));
  const zipBytes = readFileSync(zipFile);
  check('o manifesto diz o nome, o tamanho e o hash do zip',
    zipManifest.zip === 'mesa-de-duelo-pc.zip' && zipManifest.zipSize === zipBytes.length
      && zipManifest.zipSha256 === createHash('sha256').update(zipBytes).digest('hex') && zipManifest.download.endsWith('/baixar'),
    JSON.stringify(zipManifest));
  const folder = join(work, 'extraido');
  for (const e of entries) {
    const target = join(folder, e.name);
    if (e.name.endsWith('/')) { mkdirSync(target, { recursive: true }); continue; }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, e.data);
  }
  const zipExe = join(folder, 'Mesa de Duelo', 'Mesa de Duelo.exe');
  const zipAppdata = join(work, 'appdata-zip');

  serving = false;
  r = await open(zipExe, zipAppdata);
  check('extraído do zip, abre sem internet com o pacote que veio junto', r.opened && r.state?.current === '2.0.0' && r.out.includes('Versão 2.0.0'), r.out);
  serving = true;

  publish('2.0.1');
  r = await open(zipExe, zipAppdata);
  check('a mesa do zip se atualiza como as outras', r.opened && r.state?.current === '2.0.1' && r.state?.previous === '2.0.0', JSON.stringify(r.state));
} catch (e) {
  failures++;
  console.error(e.message);
} finally {
  server.close();
  rmSync(work, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} falha(s).` : '\nTudo certo.');
process.exit(failures ? 1 : 0);
