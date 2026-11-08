import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mock } from './register.mjs';
// O Scryfall de verdade iria à rede: no teste, um falso que não acha nada.
mock('../src/scryfall.ts', 'export const autocompleteNames = async () => []; export const cardImageUrls = () => []; export const resolveCardNames = async () => ({ found: new Map(), missing: [], ambiguous: [] });', import.meta.url);
const lab = await import('../src/ui/lab.ts');

const scenario = {
  active: 1, phase: 'combat',
  players: [
    { life: 7, poison: 2, hand: ['Lightning Bolt'], library: ['Island', 'Forest'], graveyard: [], exile: ['Opt', { name: 'Bonecrusher Giant', adventure: true }, { name: 'Saw It Coming', foretold: true }],
      battlefield: [{ name: 'Memnarch, the Warden', tapped: true }, { name: 'Bonesplitter', attachedTo: { player: 1, index: 0 } }] },
    { life: 20, poison: 0, hand: [], library: [], graveyard: ['Grizzly Bears'], exile: [],
      battlefield: [{ name: 'Grizzly Bears', sick: true, counters: { P1P1: 2 } }] },
  ],
};

test('o cenário vai e volta do editor igual, com "presa a" apontando para a carta certa', () => {
  assert.deepEqual(lab.toScenario(lab.fromScenario(scenario)), scenario);
});

test('"presa a" acompanha a carta quando outra sai do campo ou muda de lugar', () => {
  const draft = lab.fromScenario(scenario);
  const bears = draft.players[1].battlefield[0];
  draft.players[1].battlefield.unshift({ uid: 9999, name: 'Forest', tapped: false, sick: false, counters: {}, attachedTo: null });
  assert.deepEqual(lab.toScenario(draft).players[0].battlefield[1].attachedTo, { player: 1, index: 1 });
  draft.players[1].battlefield = draft.players[1].battlefield.filter(c => c !== bears);
  assert.equal(lab.toScenario(draft).players[0].battlefield[1].attachedTo, undefined);
});

test('marcadores zerados não vão para o servidor', () => {
  const draft = lab.fromScenario(scenario);
  draft.players[1].battlefield[0].counters = { P1P1: 0, M1M1: 1 };
  assert.deepEqual(lab.toScenario(draft).players[1].battlefield[0].counters, { M1M1: 1 });
});

test('cenário colado incompleto ou estranho vira uma mesa válida', () => {
  const draft = lab.fromScenario({ phase: 'cleanup', players: [{ hand: ['Opt', 3], battlefield: [{ name: 'Island', attachedTo: { player: 5, index: 0 } }, null] }] });
  const out = lab.toScenario(draft);
  assert.equal(out.active, 0);
  assert.equal(out.phase, 'main1');
  assert.equal(out.players.length, 2);
  assert.deepEqual(out.players[0].hand, ['Opt']);
  assert.deepEqual(out.players[0].battlefield, [{ name: 'Island' }]);
  assert.equal(out.players[1].life, 20);
});

test('"3 Island" e "3x Island" põem várias cópias; o resto é o nome', () => {
  assert.deepEqual(lab.parseEntry('3 Island'), { count: 3, name: 'Island' });
  assert.deepEqual(lab.parseEntry(' 12x Relentless Rats '), { count: 12, name: 'Relentless Rats' });
  assert.deepEqual(lab.parseEntry('Lightning Bolt'), { count: 1, name: 'Lightning Bolt' });
  assert.deepEqual(lab.parseEntry('1000 Island').count, 250);
});

test('cada cenário pronto aponta para uma correção do CHANGELOG (ou fica para investigar) e volta do editor igual', async () => {
  const changelog = (await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8')) + '\n' + (await readFile(new URL('../docs/changelog-antigo.md', import.meta.url), 'utf8'));
  const sections = new Map(changelog.split(/^## /m).slice(1).map(sec => [sec.slice(1, sec.indexOf(']')), sec]));
  assert.ok(lab.READY_SCENARIOS.length > 0);
  const names = new Set();
  for (const r of lab.READY_SCENARIOS) {
    assert.ok(r.nome && r.conferir, `${r.nome}: falta o nome ou o que conferir`);
    assert.ok(!names.has(r.nome), `${r.nome}: nome repetido`); names.add(r.nome);
    assert.equal(!r.versao, !r.item, `${r.nome}: versão e item vêm juntos, ou nenhum dos dois (para investigar)`);
    if (r.versao) {
      const section = sections.get(r.versao);
      assert.ok(section, `${r.nome}: a versão ${r.versao} não está no CHANGELOG`);
      assert.ok(section.includes(`- **${r.item}.**`), `${r.nome}: “${r.item}” não é um item da ${r.versao}`);
    }
    assert.deepEqual(lab.toScenario(lab.fromScenario(r.cenario)), r.cenario, `${r.nome}: o editor não monta o cenário igual`);
  }
});
