import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const cardtext = uri(await readFile(new URL('../src/ui/cardtext.ts', import.meta.url), 'utf8'));
const source = (await readFile(new URL('../src/ui/permanentEffects.ts', import.meta.url), 'utf8')).replace("'./cardtext'", JSON.stringify(cardtext));
const { permanentFx, permanentFxHTML, permanentFxText, auraColor, protectionLabel, permanentStatus } = await import(uri(source));
const css = await readFile(new URL('../src/ui/permanentEffects.css', import.meta.url), 'utf8');
const creature = extra => ({ id: 1, tapped: false, token: false, creature: true, power: 2, toughness: 2, ...extra });

test('one frame and one glow at most, chosen by importance', () => {
  const fx = permanentFx(creature({ keywords: ['HEXPROOF', 'LIFELINK', 'INDESTRUCTIBLE', 'WARD', 'MENACE'], ward: '{2}' }));
  assert.equal(fx.frame, 'indestructible');
  assert.equal(fx.glow, 'hexproof');
  assert.equal(permanentFx(creature({ keywords: ['LIFELINK'] }), { enchanted: true }).glow, 'lifelink');
  assert.equal(permanentFx(creature({}), { enchanted: true }).glow, 'enchanted');
  assert.equal(permanentFx(creature({ token: true })).frame, 'token');
  assert.equal(permanentFx(creature({ counters: { P1P1: 2 } })).glow, 'plus');
  assert.equal(permanentFx(creature({ counters: { M1M1: 1 } })).glow, 'minus');
  assert.equal(permanentFx({ id: 2, tapped: false, token: false, keywords: ['MENACE'] }).frame, undefined, 'creature-only keywords stay off other permanents');
});

test('ward cost, protection, prevention and face-down get readable seals', () => {
  const fx = permanentFx(creature({ keywords: ['WARD', 'PROTECTION'], ward: '{2}', protection: ['red', 'artifact'], preventDamage: 3 }));
  assert.deepEqual(fx.seals.map(s => s.kind), ['ward', 'protection', 'prevent']);
  assert.match(fx.seals[0].label, /Proteção contra alvos: \{2\}/);
  assert.equal(fx.seals[1].label, 'Proteção contra vermelho, artefatos');
  assert.match(fx.seals[1].html, /Prot\./); assert.match(fx.seals[1].html, /artefatos/);
  assert.equal(fx.seals[2].html, 'Prevenir 3');
  assert.equal(permanentFx({ id: 3, tapped: false, token: false, faceDown: true }).seals[0].html, '2/2');
  const morph = permanentFx({ id: 3, tapped: false, token: false, faceDown: true, faceDownKind: 'morph' }).seals[0];
  assert.equal(morph.html, 'Metamorfose 2/2');
  assert.equal(morph.label, 'Virada para baixo (Metamorfose), 2/2');
  assert.equal(permanentFx(creature({ keywords: ['WARD'], ward: 'Pay 3 life' })).seals[0].html, 'Ward Pay 3 life');
  assert.equal(protectionLabel('vampire'), 'vampire');
});

test('base details, phasing, restrictions and targeting', () => {
  const fx = permanentFx(creature({ keywords: ['DEATHTOUCH', 'DOUBLE_STRIKE', 'FIRST_STRIKE', 'HASTE'], sick: true, cantAttack: true, phasedOut: true }), { targeted: 'theirs' });
  assert.deepEqual(fx.base, ['deathtouch', 'haste', 'chained']);
  const view = permanentFxHTML(fx);
  assert.deepEqual(view.classes, ['fx-phased', 'fx-sick', 'fx-targeted theirs']);
  assert.match(view.html, /fx-crosshair/);
  assert.doesNotMatch(view.html, /fx-mark/, 'first and double strike have no mark on top');
  assert.equal(permanentFxText(fx), 'fora de fase, não pode atacar, alvo de algo na pilha');
  assert.equal(permanentFx(creature({ sick: true })).sick, true, 'summoning sickness stays until its controller\'s next turn');
});

test('effects never take pointer input and only move without reduced motion', () => {
  assert.match(css, /\.fx-seals \{[^}]*pointer-events: none|\.fx-seals[^{]*\{ position: absolute; pointer-events: none; \}/);
  const [, outside] = css.split('@media (prefers-reduced-motion: no-preference)');
  assert.ok(outside, 'continuous motion lives under a no-preference block');
  const before = css.split('@media (prefers-reduced-motion: no-preference)')[0];
  assert.doesNotMatch(before.replace(/@keyframes[\s\S]*$/, ''), /animation:/, 'no animation outside the motion block');
  assert.equal(auraColor('{1}{W}'), '#f4e7b8');
  assert.equal(auraColor('{W}{U}'), '#f2b54c');
});

test('flying, vigilance, trample and deathtouch get small marks on the left edge, creatures only', () => {
  const fx = permanentFx(creature({ keywords: ['DEATHTOUCH', 'TRAMPLE', 'VIGILANCE', 'FLYING'] }));
  assert.deepEqual(fx.corner, ['flying', 'vigilance', 'trample', 'deathtouch']);
  assert.match(permanentFxHTML(fx).html, /fx-corner[^]*class="flying"[^]*class="vigilance"[^]*class="trample"[^]*class="deathtouch"/);
  assert.match(css, /\.fx-corner i\.flying \{ background-image/);
  assert.match(css, /\.fx-corner i\.deathtouch \{ background-image/);
  assert.deepEqual(permanentFx({ id: 4, tapped: false, token: false, keywords: ['FLYING'] }).corner, []);
  assert.deepEqual(permanentFx({ id: 4, tapped: false, token: false, keywords: ['VIGILANCE'] }).corner, []);
  assert.match(css, /\.slot\.attacking:not\(\.tapped\) \.bfc > \.fx-corner i\.vigilance/);
});

test('creatures that cannot attack or block show a crossed sword or shield on the left edge', () => {
  assert.deepEqual(permanentFx(creature({ keywords: ['VIGILANCE'], cantAttack: true, cantBlock: true })).corner, ['vigilance', 'no-attack', 'no-block']);
  assert.deepEqual(permanentFx(creature({ cantBlock: true })).corner, ['no-block']);
  assert.match(css, /\.fx-corner i\.no-attack \{ background-image/);
  assert.match(css, /\.fx-corner i\.no-block \{ background-image/);
});

test('engine-only states become small seals with the full sentence in the tooltip', () => {
  const names = { 1: 'Ana', 2: 'Bruno' };
  const fx = permanentFx(creature({ controller: 2, owner: 1, goadedBy: [1], shields: 2, chosen: { types: ['Elf'], colors: ['green'], names: ['Lightning Bolt'], player: 1 } }), { playerName: id => names[id] });
  const byKind = Object.fromEntries(fx.seals.map(seal => [seal.kind, seal]));
  assert.match(byKind.control.label, /Pertence a Ana; quem a controla agora é Bruno/);
  assert.doesNotMatch(byKind.control.html, /Ana/, 'control shows only the icon on the table');
  assert.match(byKind.goaded.label, /Atiçada por Ana: .*que não seja Ana/);
  assert.match(byKind.regen.html, /×2/);
  assert.match(byKind.regen.label, /2 escudos de regeneração/);
  assert.match(byKind.chosen.html, /Elf/);
  assert.match(byKind.chosen.label, /tipo Elf; cor verde; carta nomeada Lightning Bolt; jogador Ana/);
  assert.match(permanentFxText(fx), /controla agora é Bruno/);
  assert.equal(permanentFx(creature({ controller: 1, owner: 1 })).seals.length, 0, 'owner equal to controller is not a steal');
  assert.match(permanentFxHTML(fx).html, /class="fx-seal regen" title="2 escudos/);
});

test('devotion cards show the count, and gods show how much is missing to become a creature', () => {
  const seal = devotion => permanentFx(creature({ devotion })).seals.find(s => s.kind.startsWith('devotion'));
  const god = seal({ colors: ['U'], value: 3, need: 5 });
  assert.equal(god.kind, 'devotion');
  assert.match(god.html, /3\/5$/);
  assert.equal(god.label, 'Devoção ao azul: 3. Só é criatura com 5 (faltam 2).');
  const awake = seal({ colors: ['B', 'R'], value: 7, need: 7 });
  assert.equal(awake.kind, 'devotion met');
  assert.equal(awake.label, 'Devoção ao preto e vermelho: 7. Com 7 ou mais, é criatura.');
  assert.equal(seal({ colors: ['B'], value: 4 }).label, 'Devoção ao preto: 4.');
  assert.match(seal({ colors: ['B'], value: 4 }).html, /4$/);
  assert.equal(seal(undefined), undefined);
});

test('one-time states become icon-only seals with the name and what changes in the tooltip', () => {
  const fx = permanentFx(creature({ states: ['monstrous', 'suspected', 'saddled', 'crewed', 'exerted', 'detained', 'solved'], saddledBy: ['Llanowar Elves'], crewedBy: ['Soul Warden', 'Llanowar Elves'] }));
  const byKind = Object.fromEntries(fx.seals.map(seal => [seal.kind, seal]));
  assert.match(byKind['state monstrous'].label, /^Monstruosa: /);
  assert.match(byKind['state suspected'].label, /ameaça e não pode bloquear/);
  assert.match(byKind['state saddled'].label, /Selada neste turno por Llanowar Elves/);
  assert.match(byKind['state crewed'].label, /Tripulada neste turno por Soul Warden e Llanowar Elves/);
  assert.match(byKind['state exerted'].label, /não desvira na próxima etapa de desvirar/);
  assert.match(byKind['state detained'].label, /^Detida: /);
  assert.match(byKind['state solved'].label, /Caso solucionado/);
  assert.match(byKind['state exerted'].html, /^<svg/);
  assert.doesNotMatch(byKind['state exerted'].html, /Exaurida/, 'only the icon on the table');
  assert.match(permanentFxHTML(fx).html, /class="fx-seal state suspected" title="Suspeita/);
});

test('a battle shows who protects it, with the defense left in the tooltip', () => {
  const names = { 1: 'Ana', 2: 'Bruno' };
  const battle = { id: 9, name: 'Invasion of Zendikar', controller: 1, protector: 2, counters: { DEFENSE: 3 }, typeLine: 'Battle — Siege' };
  const seal = permanentFx(battle, { playerName: id => names[id] }).seals.find(s => s.kind === 'protector');
  assert.match(seal.html, /Bruno/);
  assert.match(seal.label, /^Batalha defendida por Bruno: .*Faltam 3 de dano/);
  assert.equal(permanentFx(creature({})).seals.some(s => s.kind === 'protector'), false);
});

test('a foretold card explains its foretell cost only in the tooltip', () => {
  const seals = permanentStatus({ id: 5, name: 'Saw It Coming', foretold: true, foretellCost: '{1}{U}' });
  assert.equal(seals.length, 1);
  assert.match(seals[0].label, /^Prevista: quem a previu pode conjurá-la do exílio por \{1\}\{U\}/);
  assert.equal(permanentStatus({ id: 6, faceDown: true, foretold: true }).length, 0, 'the back says nothing more');
});
