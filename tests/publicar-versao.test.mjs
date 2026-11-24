import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// O npm run publicar-versao num projeto de mentira: as pastas de novidades-pendentes/ viram uma versão nova.
const SCRIPT = fileURLToPath(new URL('../scripts/publicar-versao.mjs', import.meta.url));
// Como URL (file://): no Windows, o --import de um caminho com letra de unidade falha no Node 22.
const REGISTER = new URL('./register.mjs', import.meta.url).href;
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

test('os botões novos do laboratório de efeitos ficam com os da última versão que trouxe algum', () => {
  const root = project({
    'golpe/novidade.md': '### Novo\n\n- **Golpe.** Coroa.\n',
    'golpe/lab-efeitos.json': '["gpu:crown", "play:commanderStrike"]',
    'outra/novidade.md': '### Novo\n\n- **Outra.** Mais.\n',
    'outra/lab-efeitos.json': '["gpu:crown", "gpu:echo"]',
  });
  try {
    mkdirSync(join(root, 'tests/fixtures'), { recursive: true });
    writeFileSync(join(root, 'tests/fixtures/effects-lab-new.json'), JSON.stringify({ versao: '0.10.2', botoes: ['gpu:velho'] }));
    run(root);
    assert.deepEqual(JSON.parse(read(root, 'tests/fixtures/effects-lab-new.json')), { versao: '0.11.0', botoes: ['gpu:crown', 'play:commanderStrike', 'gpu:echo'] });
    // A versão seguinte, sem botão novo: os selos da anterior continuam.
    mkdirSync(join(root, 'novidades-pendentes/fix'), { recursive: true });
    writeFileSync(join(root, 'novidades-pendentes/fix/novidade.md'), '### Corrigido\n\n- **Conserto.** Certo.\n');
    run(root);
    assert.deepEqual(JSON.parse(read(root, 'tests/fixtures/effects-lab-new.json')), { versao: '0.11.0', botoes: ['gpu:crown', 'play:commanderStrike', 'gpu:echo'] });
    // Uma versão com botão novo: ele toma o lugar dos anteriores.
    mkdirSync(join(root, 'novidades-pendentes/brilho'), { recursive: true });
    writeFileSync(join(root, 'novidades-pendentes/brilho/novidade.md'), '### Novo\n\n- **Brilho.** Luz.\n');
    writeFileSync(join(root, 'novidades-pendentes/brilho/lab-efeitos.json'), '["gpu:glow"]');
    run(root);
    assert.deepEqual(JSON.parse(read(root, 'tests/fixtures/effects-lab-new.json')), { versao: '0.12.0', botoes: ['gpu:glow'] });
  } finally { rmSync(root, { recursive: true }); }
});

test('lab-efeitos.json precisa ser uma lista de botões', () => {
  const root = project({ 'x/novidade.md': '### Novo\n\n- **X.** Y.\n', 'x/lab-efeitos.json': '{"gpu": "crown"}' });
  try { assert.throws(() => run(root), /lab-efeitos\.json/); } finally { rmSync(root, { recursive: true }); }
});

test('a mesma imagem em dois itens da mesma pasta vai uma vez só, com o mesmo nome nos dois', () => {
  const root = project({
    'relatos/novidade.md': '### Novo\n\n- **Meus relatos.** A lista.\n- **Aviso de resposta.** O ponto.\n',
    'relatos/imagens.json': JSON.stringify({ 'Meus relatos': [{ img: 'menu.webp', legenda: 'O item.' }], 'Aviso de resposta': [{ img: 'menu.webp', legenda: 'O ponto.' }] }),
    'relatos/menu.webp': 'm',
  });
  try {
    run(root);
    const visuals = JSON.parse(read(root, 'src/novidades.json'))['0.11.0'];
    assert.equal(visuals['Meus relatos'][0].img, '0.11.0/menu.webp');
    assert.equal(visuals['Aviso de resposta'][0].img, '0.11.0/menu.webp');
    assert.equal(read(root, 'public/novidades/0.11.0/menu.webp'), 'm');
  } finally { rmSync(root, { recursive: true }); }
});

// As duas mesas: novidade.md vai para o CHANGELOG.md (navegador), novidade-pc.md para o CHANGELOG-PC.md (mesa no PC).
const PC_LOG = '# Novidades da mesa no PC\n\nIntro do PC.\n\n## [0.10.1] - 2025-12-30\n\n### Mudou\n\n- **Pilha.** Maior.\n';

test('cada mesa recebe só os seus itens: pasta só do navegador, só do PC, das duas e com a marca antiga', () => {
  const root = project({
    'nav/novidade.md': '### Novo\n\n- **Abas.** Duas abas.\n',
    'pc/novidade-pc.md': '### Mudou\n\n- **Setas.** De energia.\n',
    'pc/imagens.json': JSON.stringify({ Setas: [{ img: 'setas.webp', legenda: 'As setas.' }] }),
    'pc/setas.webp': 's',
    'duas/novidade.md': '### Corrigido\n\n- **Fichas com arte.** Agora com arte.\n',
    'duas/novidade-pc.md': '### Corrigido\n\n- **Fichas com arte.** Agora com arte.\n',
    'duas/imagens.json': JSON.stringify({ 'Fichas com arte': [{ img: 'fichas.webp', legenda: 'As fichas.' }] }),
    'duas/fichas.webp': 'f',
    'duas/cenarios.json': `[\n  {\n    "nome": "Fichas",\n    "item": "Fichas com arte",\n    "conferir": "Crie.",\n    "cenario": ${JSON.stringify(scenario)}\n  }\n]\n`,
    'velha/novidade.md': '### Novo\n\n- **Carta à vista.** [Mesa no PC] Ao pagar.\n- **Lista.** No navegador.\n',
    'velha/imagens.json': JSON.stringify({ 'Carta à vista': [{ img: 'carta.webp', legenda: 'A carta.' }] }),
    'velha/carta.webp': 'c',
  });
  try {
    writeFileSync(join(root, 'CHANGELOG-PC.md'), PC_LOG);
    run(root);
    const browser = read(root, 'CHANGELOG.md'), pc = read(root, 'CHANGELOG-PC.md');
    assert.ok(browser.includes('Intro.\n\n## [0.11.0] - 2026-02-03\n\n### Novo\n\n- **Abas.** Duas abas.\n- **Lista.** No navegador.\n\n### Corrigido\n\n- **Fichas com arte.** Agora com arte.\n\n## [0.10.2]'), browser);
    assert.ok(pc.includes('Intro do PC.\n\n## [0.11.0] - 2026-02-03\n\n### Novo\n\n- **Carta à vista.** Ao pagar.\n\n### Mudou\n\n- **Setas.** De energia.\n\n### Corrigido\n\n- **Fichas com arte.** Agora com arte.\n\n## [0.10.1]'), pc);
    assert.ok(!browser.includes('Setas') && !browser.includes('Carta à vista') && !pc.includes('[Mesa no PC]') && !pc.includes('Abas'));
    // Os prints e o cenário continuam pelo título, de qualquer das duas mesas.
    const visuals = JSON.parse(read(root, 'src/novidades.json'))['0.11.0'];
    assert.deepEqual(Object.keys(visuals).sort(), ['Carta à vista', 'Fichas com arte', 'Setas']);
    assert.equal(read(root, 'public/novidades/0.11.0/setas.webp'), 's');
    assert.deepEqual(JSON.parse(read(root, 'src/lab-cenarios.json')).map(s => [s.nome, s.versao]), [['Fichas', '0.11.0'], ['Velho', undefined]]);
  } finally { rmSync(root, { recursive: true }); }
});

test('versão só da mesa no PC: o CHANGELOG.md fica como está, e a seguinte conta a partir dela', () => {
  const root = project({ 'pc/novidade-pc.md': '### Novo\n\n- **Painel no PC.** Abre.\n' });
  try {
    run(root);
    assert.equal(read(root, 'CHANGELOG.md'), '# Novidades\n\nIntro.\n\n## [0.10.2] - 2026-01-01\n\n### Novo\n\n- **Antigo.** Texto.\n');
    // Sem CHANGELOG-PC.md, ele nasce com a abertura e a versão.
    assert.match(read(root, 'CHANGELOG-PC.md'), /^# Novidades da mesa no PC\n\n.+\n\n## \[0\.11\.0\] - 2026-02-03\n\n### Novo\n\n- \*\*Painel no PC\.\*\* Abre\.\n$/);
    assert.equal(JSON.parse(read(root, 'package.json')).version, '0.11.0');
    // A seguinte, só do navegador, vem depois da 0.11.0 (o topo mais novo dos dois arquivos), e não da 0.10.2.
    mkdirSync(join(root, 'novidades-pendentes/fix'), { recursive: true });
    writeFileSync(join(root, 'novidades-pendentes/fix/novidade.md'), '### Corrigido\n\n- **Conserto.** Certo.\n');
    run(root);
    assert.ok(read(root, 'CHANGELOG.md').includes('Intro.\n\n## [0.11.1] - 2026-02-03\n\n### Corrigido\n\n- **Conserto.** Certo.\n\n## [0.10.2]'));
    assert.ok(!read(root, 'CHANGELOG-PC.md').includes('0.11.1'));
  } finally { rmSync(root, { recursive: true }); }
});

test('pasta sem novidade.md nem novidade-pc.md, ou com print de um título que não está em nenhum dos dois, não publica', () => {
  const empty = project({ 'x/imagens.json': '{}' });
  try { assert.throws(() => run(empty), /sem novidade\.md \(mesa do navegador\) nem novidade-pc\.md/); } finally { rmSync(empty, { recursive: true }); }
  const wrong = project({ 'x/novidade-pc.md': '### Novo\n\n- **A.** B.\n', 'x/imagens.json': JSON.stringify({ C: [{ img: 'c.webp', legenda: 'C.' }] }), 'x/c.webp': 'c' });
  try { assert.throws(() => run(wrong), /"C" não é um item do novidade\.md nem do novidade-pc\.md/); } finally { rmSync(wrong, { recursive: true }); }
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
