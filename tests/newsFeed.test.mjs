import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// O selo "Mesa no PC" (a marca [Mesa no PC] depois do título) no painel Novidades e o /novidades.json da mesa no PC.
const { PC_TAG, takePcTag, buildNewsFeed } = await import('../src/newsFeed.ts');
const { readNewsFeed } = await import('../scripts/news-feed.mjs');

/** O mesmo CHANGELOG de exemplo gera o godot-table/tests/fixtures/novidades.json, que o test_news.gd lê. */
const SAMPLE = `# Novidades

Intro que fica de fora.

## [Próxima]

### Novo

- **Novidades na mesa no PC.** [Mesa no PC] O botão **Novidades** abre o painel.

## [0.239.0] - 2026-11-24

### Novo

- **Selo nas novidades.** Os itens só da mesa no PC ganham um selo.
- **Zip da mesa no PC.** [Mesa no PC] Baixe em \`/baixar\` e extraia onde quiser.

### Corrigido

- **Choque no alvo certo.** Agora acerta.

## [0.238.0] - 2026-11-22

- **Item sem grupo.** Texto.

Com "reduzir movimento" ligado, nada se move.
`;
const FIXTURE = new URL('../godot-table/tests/fixtures/novidades.json', import.meta.url);

test('a marca [Mesa no PC] logo depois do título vira o selo; no meio do texto, não', () => {
  assert.equal(PC_TAG, '[Mesa no PC]');
  assert.deepEqual(takePcTag(' [Mesa no PC] O painel.'), { pc: true, text: 'O painel.' });
  assert.deepEqual(takePcTag('Vale para a [Mesa no PC] também.'), { pc: false, text: 'Vale para a [Mesa no PC] também.' });
});

test('o /novidades.json tem as versões, os grupos, os itens com o selo e a versão mais nova com número', () => {
  const feed = buildNewsFeed(SAMPLE, new Set(['0.239.0']));
  assert.equal(feed.version, '0.239.0');
  assert.deepEqual(feed.releases.map(r => [r.version, r.title, r.date, r.visual]), [
    ['Próxima', 'Próxima versão', '', false], ['0.239.0', 'Versão 0.239.0', '24/11/2026', true], ['0.238.0', 'Versão 0.238.0', '22/11/2026', false],
  ]);
  const [novo, corrigido] = feed.releases[1].groups;
  assert.equal(novo.name, 'Novo');
  assert.deepEqual(novo.items[1], { title: 'Zip da mesa no PC', text: 'Baixe em `/baixar` e extraia onde quiser.', pc: true });
  assert.deepEqual(novo.items[0].pc, false);
  assert.equal(corrigido.name, 'Corrigido');
  // Item sem grupo e parágrafo solto (sem título) também entram.
  assert.deepEqual(feed.releases[2].groups, [{ name: '', items: [
    { title: 'Item sem grupo', text: 'Texto.', pc: false }, { title: '', text: 'Com "reduzir movimento" ligado, nada se move.', pc: false },
  ] }]);
  assert.deepEqual(JSON.parse(readFileSync(FIXTURE, 'utf8')), feed,
    'o fixture da mesa no PC saiu do formato: regrave godot-table/tests/fixtures/novidades.json com buildNewsFeed(SAMPLE, new Set(["0.239.0"]))');
});

test('o painel do navegador mostra o selo e tira a marca do texto do item', async () => {
  const { parse } = await import('../src/ui/changelog.ts');
  const [, release] = parse(SAMPLE);
  assert.match(release.html, /<li><b>Zip da mesa no PC\.<\/b> <span class="pc-badge">Mesa no PC<\/span> Baixe em <code>\/baixar<\/code>/);
  assert.ok(!release.html.includes('[Mesa no PC]'));
  assert.deepEqual(release.items.map(i => [i.title, i.pc]), [['Selo nas novidades', false], ['Zip da mesa no PC', true], ['Choque no alvo certo', false]]);
  assert.equal(release.items[1].text, 'Baixe em `/baixar` e extraia onde quiser.');
});

test('o /novidades.json do projeto junta as pendentes (Próxima versão) e marca as versões com prints', () => {
  const root = mkdtempSync(join(tmpdir(), 'novidades-json-'));
  const write = (path, text) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text); };
  try {
    write('CHANGELOG.md', '# Novidades\n\n## [0.10.2] - 2026-01-01\n\n### Novo\n\n- **Antigo.** Texto.\n\n## [0.10.1] - 2025-12-30\n\n### Corrigido\n\n- **Velho.** Certo.\n');
    write('src/novidades.json', JSON.stringify({ '0.10.2': { Antigo: [{ img: '0.10.2/a.webp', legenda: 'A.' }] } }));
    write('novidades-pendentes/pc/novidade.md', '### Novo\n\n- **Painel no PC.** [Mesa no PC] Abre.\n');
    write('novidades-pendentes/pc/imagens.json', JSON.stringify({ 'Painel no PC': [{ img: 'p.webp', legenda: 'P.' }] }));
    write('novidades-pendentes/fix/novidade.md', '### Corrigido\n\n- **Conserto.** Certo.\n');
    const feed = readNewsFeed(root);
    assert.equal(feed.version, '0.10.2');
    assert.deepEqual(feed.releases.map(r => [r.version, r.visual]), [['Próxima', true], ['0.10.2', true], ['0.10.1', false]]);
    assert.deepEqual(feed.releases[0].groups.map(g => [g.name, g.items.map(i => [i.title, i.pc])]), [['Novo', [['Painel no PC', true]]], ['Corrigido', [['Conserto', false]]]]);
  } finally { rmSync(root, { recursive: true }); }
});

test('o CHANGELOG.md de verdade vira o /novidades.json sem perder item', () => {
  const feed = readNewsFeed(fileURLToPath(new URL('..', import.meta.url)));
  const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const top = /^## \[(.+?)\]/m.exec(changelog);
  // Os itens a partir da primeira versão (o texto de abertura também tem uma lista).
  const items = changelog.slice(top.index).split('\n').filter(l => /^- \*\*/.test(l.trim())).length;
  assert.equal(feed.version, top[1]);
  const feedItems = feed.releases.filter(r => r.version !== 'Próxima').flatMap(r => r.groups.flatMap(g => g.items)).filter(i => i.title).length;
  assert.equal(feedItems, items);
});
