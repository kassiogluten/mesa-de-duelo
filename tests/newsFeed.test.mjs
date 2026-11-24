import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// As novidades de cada mesa: o CHANGELOG.md no painel do navegador, o CHANGELOG-PC.md no /novidades.json da mesa no PC,
// e a marca antiga [Mesa no PC] de um novidade.md pendente, que manda o item para a mesa no PC.
const { PC_TAG, takePcTag, splitPcTagged, mergePending, buildNewsFeed } = await import('../src/newsFeed.ts');
const { readNewsFeed } = await import('../scripts/news-feed.mjs');

/** O mesmo CHANGELOG-PC.md de exemplo gera o godot-table/tests/fixtures/novidades.json, que o test_news.gd lê. */
const SAMPLE = `# Novidades da mesa no PC

Intro que fica de fora.

## [Próxima]

### Novo

- **Novidades na mesa no PC.** O botão **Novidades** abre o painel.

## [0.239.0] - 2026-11-24

### Novo

- **Setas de energia.** As setas viraram feixes.
- **Zip da mesa no PC.** Baixe em \`/baixar\` e extraia onde quiser.

### Corrigido

- **Choque no alvo certo.** Agora acerta.

## [0.238.0] - 2026-11-22

- **Item sem grupo.** Texto.

Com "reduzir movimento" ligado, nada se move.
`;
const SAMPLE_VISUALS = { '0.239.0': { 'Zip da mesa no PC': [{ img: '0.239.0/zip.webp', legenda: 'O zip.' }] } };
const FIXTURE = new URL('../godot-table/tests/fixtures/novidades.json', import.meta.url);

test('a marca antiga [Mesa no PC] logo depois do título manda o item para a mesa no PC; no meio do texto, não', () => {
  assert.equal(PC_TAG, '[Mesa no PC]');
  assert.deepEqual(takePcTag(' [Mesa no PC] O painel.'), { pc: true, text: 'O painel.' });
  assert.deepEqual(takePcTag('Vale para a [Mesa no PC] também.'), { pc: false, text: 'Vale para a [Mesa no PC] também.' });
  const { browser, pc } = splitPcTagged('### Novo\n\n- **Painel.** [Mesa no PC] Abre.\n- **Lista.** Vale para a [Mesa no PC] também.\n\n### Corrigido\n\n- **Seta.** [Mesa no PC] Certa.\n');
  assert.equal(mergePending([{ browser }]).browser.text, '### Novo\n\n- **Lista.** Vale para a [Mesa no PC] também.\n');
  assert.equal(mergePending([{ pc }]).pc.text, '### Novo\n\n- **Painel.** Abre.\n\n### Corrigido\n\n- **Seta.** Certa.\n');
});

test('as pendentes se dividem por mesa: novidade.md no navegador, novidade-pc.md (e a marca antiga) na mesa no PC', () => {
  const merged = mergePending([
    { browser: '### Novo\n\n- **Abas.** Duas.\n', pc: '### Novo\n\n- **Abas.** Duas.\n' },
    { pc: '### Mudou\n\n- **Pilha.** Calma.\n' },
    { browser: '### Corrigido\n\n- **Antigo.** [Mesa no PC] Da worktree velha.\n' },
  ]);
  assert.deepEqual(merged.browser, { groups: ['Novo'], text: '### Novo\n\n- **Abas.** Duas.\n' });
  assert.deepEqual(merged.pc.groups, ['Novo', 'Mudou', 'Corrigido']);
  assert.ok(merged.pc.text.includes('- **Antigo.** Da worktree velha.'));
});

test('o /novidades.json tem as versões, os grupos, os itens e a versão mais nova com número', () => {
  const feed = buildNewsFeed(SAMPLE, SAMPLE_VISUALS);
  assert.equal(feed.version, '0.239.0');
  assert.deepEqual(feed.releases.map(r => [r.version, r.title, r.date, r.visual]), [
    ['Próxima', 'Próxima versão', '', false], ['0.239.0', 'Versão 0.239.0', '24/11/2026', true], ['0.238.0', 'Versão 0.238.0', '22/11/2026', false],
  ]);
  const [novo, corrigido] = feed.releases[1].groups;
  assert.equal(novo.name, 'Novo');
  assert.deepEqual(novo.items[1], { title: 'Zip da mesa no PC', text: 'Baixe em `/baixar` e extraia onde quiser.' });
  assert.equal(corrigido.name, 'Corrigido');
  // Item sem grupo e parágrafo solto (sem título) também entram.
  assert.deepEqual(feed.releases[2].groups, [{ name: '', items: [
    { title: 'Item sem grupo', text: 'Texto.' }, { title: '', text: 'Com "reduzir movimento" ligado, nada se move.' },
  ] }]);
  // "ver em imagens" só quando algum item desta mesa tem prints, e não só por a versão ter prints de outro item.
  assert.equal(buildNewsFeed(SAMPLE, { '0.239.0': { 'Outro item': [{}] } }).releases[1].visual, false);
  assert.deepEqual(JSON.parse(readFileSync(FIXTURE, 'utf8')), feed,
    'o fixture da mesa no PC saiu do formato: regrave godot-table/tests/fixtures/novidades.json com buildNewsFeed(SAMPLE, SAMPLE_VISUALS)');
});

test('o painel do navegador mostra os itens do CHANGELOG.md sem selo', async () => {
  const { parse } = await import('../src/ui/changelog.ts');
  const [, release] = parse(SAMPLE);
  assert.match(release.html, /<li><b>Zip da mesa no PC\.<\/b> Baixe em <code>\/baixar<\/code>/);
  assert.ok(!release.html.includes('pc-badge'));
  assert.deepEqual(release.items.map(i => [i.group, i.title]), [['Novo', 'Setas de energia'], ['Novo', 'Zip da mesa no PC'], ['Corrigido', 'Choque no alvo certo']]);
});

test('o /novidades.json do projeto vem do CHANGELOG-PC.md, com as pendentes da mesa no PC como Próxima versão', () => {
  const root = mkdtempSync(join(tmpdir(), 'novidades-json-'));
  const write = (path, text) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text); };
  try {
    write('CHANGELOG.md', '# Novidades\n\n## [0.10.3] - 2026-01-02\n\n### Novo\n\n- **Do navegador.** Só lá.\n');
    write('CHANGELOG-PC.md', '# Novidades da mesa no PC\n\n## [0.10.2] - 2026-01-01\n\n### Novo\n\n- **Antigo.** Texto.\n\n## [0.10.1] - 2025-12-30\n\n### Corrigido\n\n- **Velho.** Certo.\n');
    write('src/novidades.json', JSON.stringify({ '0.10.2': { Antigo: [{ img: '0.10.2/a.webp', legenda: 'A.' }] } }));
    write('novidades-pendentes/pc/novidade-pc.md', '### Novo\n\n- **Painel no PC.** Abre.\n');
    write('novidades-pendentes/pc/imagens.json', JSON.stringify({ 'Painel no PC': [{ img: 'p.webp', legenda: 'P.' }] }));
    write('novidades-pendentes/velha/novidade.md', '### Corrigido\n\n- **Conserto.** [Mesa no PC] Certo.\n- **Só no navegador.** Fica lá.\n');
    write('novidades-pendentes/nav/novidade.md', '### Novo\n\n- **Abas.** Duas.\n');
    const feed = readNewsFeed(root);
    assert.equal(feed.version, '0.10.2');
    assert.deepEqual(feed.releases.map(r => [r.version, r.visual]), [['Próxima', true], ['0.10.2', true], ['0.10.1', false]]);
    assert.deepEqual(feed.releases[0].groups.map(g => [g.name, g.items.map(i => [i.title, i.text])]), [['Novo', [['Painel no PC', 'Abre.']]], ['Corrigido', [['Conserto', 'Certo.']]]]);
  } finally { rmSync(root, { recursive: true }); }
});

test('o CHANGELOG-PC.md de verdade vira o /novidades.json sem perder item, e nenhum CHANGELOG usa a marca antiga', () => {
  const feed = readNewsFeed(fileURLToPath(new URL('..', import.meta.url)));
  const changelog = readFileSync(new URL('../CHANGELOG-PC.md', import.meta.url), 'utf8');
  const top = /^## \[(.+?)\]/m.exec(changelog);
  const items = changelog.slice(top.index).split('\n').filter(l => /^- \*\*/.test(l.trim())).length;
  assert.equal(feed.version, top[1]);
  const feedItems = feed.releases.filter(r => r.version !== 'Próxima').flatMap(r => r.groups.flatMap(g => g.items)).filter(i => i.title).length;
  assert.equal(feedItems, items);
  for (const file of ['../CHANGELOG.md', '../CHANGELOG-PC.md', '../docs/changelog-antigo.md']) {
    assert.ok(!/^- \*\*.+?\*\*\s*\[Mesa no PC\]/m.test(readFileSync(new URL(file, import.meta.url), 'utf8')), `${file}: item da mesa no PC vai no CHANGELOG-PC.md, sem a marca`);
  }
});
