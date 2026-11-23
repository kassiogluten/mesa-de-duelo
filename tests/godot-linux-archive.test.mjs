// Pacote Linux da mesa no PC: o .tar.gz guarda os modos (executável 0755), o tar do sistema o entende e o criar-atalho.sh grava um .desktop certo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { readTarGz, writeTarGz } = await import('../scripts/tar-gz-file.mjs');
const { DESKTOP_FILE, LINUX_EXE, LINUX_README, SHORTCUT_SCRIPT, SHORTCUT_SCRIPT_TEXT } = await import('../scripts/godot-linux-files.mjs');

/** O comando existe nesta máquina (no Windows, o tar e o sh do Git for Windows nem sempre estão no PATH). */
const has = cmd => spawnSync(cmd, ['--version'], { encoding: 'utf8' }).status === 0;

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mesa-linux-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('the tar.gz keeps names, contents and modes', () => withDir(dir => {
  const file = join(dir, 'a.tar.gz');
  const big = Buffer.alloc(70_000, 7);
  const long = `Mesa de Duelo/${'pasta-comprida/'.repeat(6)}arquivo.txt`;
  writeTarGz(file, [
    { name: 'Mesa de Duelo/', mode: 0o755 },
    { name: `Mesa de Duelo/${LINUX_EXE}`, data: big, mode: 0o755 },
    { name: 'Mesa de Duelo/LEIA-ME.txt', data: Buffer.from('ação', 'utf8') },
    { name: long, data: Buffer.from('x') },
  ]);
  const entries = readTarGz(file);
  assert.deepEqual(entries.map(e => [e.name, e.mode.toString(8), e.type]), [
    ['Mesa de Duelo/', '755', '5'],
    [`Mesa de Duelo/${LINUX_EXE}`, '755', '0'],
    ['Mesa de Duelo/LEIA-ME.txt', '644', '0'],
    [long, '644', '0'],
  ]);
  assert.ok(entries[1].data.equals(big));
  assert.equal(entries[2].data.toString('utf8'), 'ação');
  assert.equal(readFileSync(file).length > 0, true);
}));

test('the system tar reads the archive with the executable bit', { skip: !has('tar') && 'sem tar nesta máquina' }, () => withDir(dir => {
  const file = join(dir, 'b.tar.gz');
  writeTarGz(file, [
    { name: 'Mesa de Duelo/', mode: 0o755 },
    { name: `Mesa de Duelo/${LINUX_EXE}`, data: Buffer.from('#!/bin/sh\n'), mode: 0o755 },
    { name: 'Mesa de Duelo/icon.png', data: Buffer.from('png'), mode: 0o644 },
  ]);
  // Pelo nome relativo: o tar do Git for Windows confunde "C:" com um host remoto.
  const list = spawnSync('tar', ['tvzf', 'b.tar.gz'], { cwd: dir, encoding: 'utf8' });
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, new RegExp(`-rwxr-xr-x root/root\\s+10 .* Mesa de Duelo/${LINUX_EXE}`));
  assert.match(list.stdout, /-rw-r--r-- root\/root\s+3 .* Mesa de Duelo\/icon\.png/);
}));

test('the README explains how to open, the shortcut, the data folder and uninstalling', () => {
  for (const text of [`./${LINUX_EXE}`, 'Executar como programa', `./${SHORTCUT_SCRIPT}`, `${SHORTCUT_SCRIPT} --remover`,
    '~/.local/share/godot/app_userdata/Mesa de Duelo', 'Vulkan', 'atualiza sozinha', 'DESINSTALAR']) {
    assert.ok(LINUX_README.includes(text), text);
  }
  assert.doesNotMatch(LINUX_README, /\r/);
});

test('the shortcut script writes the .desktop without sudo', () => {
  assert.ok(SHORTCUT_SCRIPT_TEXT.startsWith('#!/bin/sh\n'));
  assert.doesNotMatch(SHORTCUT_SCRIPT_TEXT, /sudo|\r/);
  assert.match(SHORTCUT_SCRIPT_TEXT, new RegExp(`/applications"\\nFILE="\\$APPS/${DESKTOP_FILE.replace('.', '\\.')}"`));
  for (const line of ['Type=Application', 'Name=Mesa de Duelo', 'Terminal=false', 'Categories=Game;CardGame;', 'StartupWMClass=Mesa de Duelo']) {
    assert.ok(SHORTCUT_SCRIPT_TEXT.includes(`\n${line}\n`), line);
  }
});

test('the shortcut script quotes odd folder names and runs again without duplicating', { skip: !has('sh') && 'sem sh nesta máquina' }, () => withDir(dir => {
  // Pasta com espaço, cifrão, crase e %: o Exec do .desktop precisa das aspas e dos escapes da especificação.
  const folder = join(dir, 'Jogos $HOME `id` 50%', 'Mesa de Duelo');
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, LINUX_EXE), '#!/bin/sh\n');
  writeFileSync(join(folder, SHORTCUT_SCRIPT), SHORTCUT_SCRIPT_TEXT);
  const home = join(dir, 'home');
  const run = (...args) => spawnSync('sh', [SHORTCUT_SCRIPT, ...args], { cwd: folder, encoding: 'utf8', env: { ...process.env, HOME: home, XDG_DATA_HOME: '' } });
  let r = run();
  assert.equal(r.status, 0, r.stderr);
  r = run();
  assert.equal(r.status, 0, r.stderr);
  const apps = join(home, '.local', 'share', 'applications');
  const desktop = readFileSync(join(apps, DESKTOP_FILE), 'utf8');
  const exec = /^Exec=(.*)$/m.exec(desktop)?.[1];
  assert.match(exec, /^".*\/Jogos \\\\\$HOME \\\\`id\\\\` 50%%\/Mesa de Duelo\/mesa-de-duelo"$/, exec);
  assert.match(desktop, /^Icon=.*\/Jogos \$HOME `id` 50%\/Mesa de Duelo\/icon\.png$/m);
  assert.match(desktop, /^Path=.*\/Mesa de Duelo$/m);
  assert.equal(desktop.match(/\[Desktop Entry\]/g).length, 1);
  r = run('--remover');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(join(apps, DESKTOP_FILE)), false);
}));

