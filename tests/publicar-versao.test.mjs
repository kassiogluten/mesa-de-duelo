import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// O npm run publicar-versao num projeto de mentira: as pastas de novidades-pendentes/ viram uma versão nova.
const SCRIPT = fileURLToPath(new URL('../scripts/publicar-versao.mjs', import.meta.url));
const REGISTER = fileURLToPath(new URL('./register.mjs', import.meta.url));
const scenario = { active: 0, phase: 'main1', players: [{ hand: ['Shock'] }, {}] };

function project(pending) {
  const root = mkdtempSync(join(tmpdir(), 'publicar-versao-'));
  const write = (path, text) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text); };
  write('CHANGELOG.md', '# Novidades\n\nIntro.\n\n## [0.10.2] - 2026-01-01\n\n### Novo\n\n- **Antigo.** Texto.\n');
  write('src/novidades.json', '{\n  "0.10.2": {\n    "Antigo": [\n      { "img": "0.10.2/a.webp", "legenda": "A." }\n    ]\n  }\n}\n');
  write('src/lab-cenarios.json', '[\n  {\n    "nome": "Velho",\n    "conferir": "c",\n    "cenario": {}\n  }\n]\n');
  write('package.json', '{\n  "name": "x",\n  "version": "0.10.2",\n  "dependencies": { "y": { "version": "1.0.0" } }\n}\n');
  write('package-lock.json', `${JSON.stringify({ name: 'x', version: '0.10.2', packages: { '': { name: 'x', version: '0.10.2' } } }, null, 2)}\n`);
  for (const [path, text] of Object.entries(pending)) write(`novidades-pendentes/${path}`, text);
  return root;
}
const run = (root, ...extra) => execFileSync(process.execPath, ['--import', REGISTER, SCRIPT, '--raiz', root, '--data', '2026-02-03', ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const read = (root, path) => readFileSync(join(root, path), 'utf8');

test('duas mudanças em paralelo saem numa versão só, com os grupos juntos, os prints e os cenários', () => {
  const root = project({
    'lista/novidade.md': '### Novo\n\n- **Decks em lista.** Uma linha por deck.\n',
    'lista/imagens.json': JSON.stringify({ 'Decks em lista': [{ img: 'tela.webp', legenda: 'A lista.' }] }),
    'lista/tela.webp': 'x',
    'choque/novidade.md': '### Corrigido\n\n- **Choque no alvo certo.** Agora acerta.\n',
    'choque/imagens.json': JSON.stringify({ 'Choque no alvo certo': [{ img: 'tela.webp', legenda: 'O alvo.' }] }),
    'choque/tela.webp': 'y',
    'choque/cenarios.json': `[\n  {\n    "nome": "Choque",\n    "item": "Choque no alvo certo",\n    "conferir": "Conjure.",\n    "cenario": ${JSON.stringify(scenario)}\n  }\n]\n`,
  });
  try {
    run(root);
    const changelog = read(root, 'CHANGELOG.md');
    assert.ok(changelog.includes('Intro.\n\n## [0.11.0] - 2026-02-03\n\n### Novo\n\n- **Decks em lista.** Uma linha por deck.\n\n### Corrigido\n\n- **Choque no alvo certo.** Agora acerta.\n\n## [0.10.2]'), changelog);
    const visuals = JSON.parse(read(root, 'src/novidades.json'));
    assert.deepEqual(Object.keys(visuals), ['0.11.0', '0.10.2']);
    // As duas pastas tinham um tela.webp: o segundo ganha o nome da pasta na frente.
    assert.deepEqual(visuals['0.11.0']['Choque no alvo certo'], [{ img: '0.11.0/tela.webp', legenda: 'O alvo.' }]);
    assert.deepEqual(visuals['0.11.0']['Decks em lista'], [{ img: '0.11.0/lista-tela.webp', legenda: 'A lista.' }]);
    assert.equal(read(root, 'public/novidades/0.11.0/tela.webp'), 'y');
    assert.equal(read(root, 'public/novidades/0.11.0/lista-tela.webp'), 'x');
    const lab = JSON.parse(read(root, 'src/lab-cenarios.json'));
    assert.deepEqual(lab.map(s => [s.nome, s.versao]), [['Choque', '0.11.0'], ['Velho', undefined]]);
    assert.deepEqual(lab[0].cenario, scenario);
    assert.equal(JSON.parse(read(root, 'package.json')).version, '0.11.0');
    assert.equal(JSON.parse(read(root, 'package.json')).dependencies.y.version, '1.0.0');
    assert.equal(JSON.parse(read(root, 'package-lock.json')).packages[''].version, '0.11.0');
    assert.equal(existsSync(join(root, 'novidades-pendentes')), false);
  } finally { rmSync(root, { recursive: true }); }
});

test('só correções sobem o Z; --x sobe o X; --dry não grava nada', () => {
  const root = project({ 'a/novidade.md': '### Corrigido\n\n- **Conserto.** Texto.\n' });
  try {
    assert.match(run(root, '--dry'), /Versão 0\.10\.3/);
    assert.match(run(root, '--x', '--dry'), /Versão 1\.0\.0/);
    assert.ok(existsSync(join(root, 'novidades-pendentes/a/novidade.md')));
    run(root);
    assert.match(read(root, 'CHANGELOG.md'), /## \[0\.10\.3\] - 2026-02-03\n\n### Corrigido/);
    assert.equal(read(root, 'src/novidades.json').startsWith('{\n  "0.10.2"'), true);
  } finally { rmSync(root, { recursive: true }); }
});

test('recusa pendente incompleto sem mexer em nada', () => {
  const root = project({ 'a/novidade.md': '### Novo\n\n- **Item.** Texto.\n', 'a/imagens.json': JSON.stringify({ Outro: [{ img: 'x.webp', legenda: 'x' }] }) });
  try {
    assert.throws(() => run(root), /"Outro" não é um item/);
    assert.ok(read(root, 'CHANGELOG.md').includes('## [0.10.2]') && !read(root, 'CHANGELOG.md').includes('0.11.0'));
  } finally { rmSync(root, { recursive: true }); }
});

test('sem pendentes, não faz nada', () => {
  const root = project({});
  try { assert.match(run(root), /Nenhuma novidade pendente/); } finally { rmSync(root, { recursive: true }); }
});
