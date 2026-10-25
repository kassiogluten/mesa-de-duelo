import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const cardtext = uri(await readFile(new URL('../src/ui/cardtext.ts', import.meta.url), 'utf8'));
const stopsModule = uri((await readFile(new URL('../src/ui/opponentStops.ts', import.meta.url), 'utf8')).replace("'./cardtext'", JSON.stringify(cardtext)));
const source = (await readFile(new URL('../src/ui/phaseHud.ts', import.meta.url), 'utf8')).replace("'./cardtext'", JSON.stringify(cardtext)).replace("'./opponentStops'", JSON.stringify(stopsModule));
const { phaseHudHTML, passLabel, turnBannerText, turnTimeText, upcomingTurnsText } = await import(uri(source));
const state = { turn: 4, phase: 'MAIN1', activePlayer: 1, you: 1, players: [{ id: 1, name: 'Você' }, { id: 2, name: 'Oponente' }], gameOver: false };
const current = html => html.match(/<li class="phase-step current"[^>]*data-phase="([^"]+)"/)?.[1];

test('the compact turn track keeps five informational icons and never adds game controls', () => {
  for (const phase of ['UNTAP', 'UPKEEP', 'DRAW', 'MAIN1', 'COMBAT_DAMAGE', 'MAIN2', 'END_OF_TURN']) {
    const input = structuredClone({ ...state, phase });
    const before = structuredClone(input);
    const html = phaseHudHTML(input);
    assert.equal((html.match(/<li /g) ?? []).length, 5);
    assert.equal((html.match(/phase-step current/g) ?? []).length, 1);
    for (const label of ['Início', 'Principal 1', 'Combate', 'Principal 2', 'Final']) assert.ok(html.includes(`data-tip="${label}`));
    assert.doesNotMatch(html, /<button|data-act|role="button"|tabindex=/);
    assert.deepEqual(input, before);
  }
});
test('beginning steps share one icon and the precise step shows in the hover tip and the screen-reader summary', () => {
  for (const phase of ['UNTAP', 'UPKEEP', 'DRAW']) assert.equal(current(phaseHudHTML({ ...state, phase })), 'start');
  const cleanup = phaseHudHTML({ ...state, phase: 'CLEANUP' });
  assert.equal(current(cleanup), 'end'); assert.match(cleanup, /Final · Limpeza/);
  for (const [phase, detail] of [['COMBAT_DECLARE_ATTACKERS', 'Declaração de atacantes'], ['COMBAT_DECLARE_BLOCKERS', 'Declaração de bloqueadores'], ['COMBAT_FIRST_STRIKE_DAMAGE', 'Dano de iniciativa'], ['COMBAT_DAMAGE', 'Dano de combate']]) {
    const html = phaseHudHTML({ ...state, phase });
    assert.equal(current(html), 'combat'); assert.ok(html.includes(`Combate · ${detail}`));
    assert.match(html, new RegExp(`<span class="sr-only">Turno 4 · Seu turno · ${detail}</span>`));
  }
});
test('unknown or completed phases never imply an active decision', () => {
  const unknown = phaseHudHTML({ ...state, phase: 'FUTURE_PHASE' });
  assert.equal(current(unknown), undefined);
  assert.match(unknown, /Aguardando o início do turno/);
  const finished = phaseHudHTML({ ...state, gameOver: true });
  assert.equal(current(finished), undefined);
  assert.match(finished, /Jogo concluído/);
});
test('turn owner is shown by color, explicit in the summary, and player names remain escaped', () => {
  assert.match(phaseHudHTML(state), /phase-track mine/);
  assert.match(phaseHudHTML(state), /Seu turno/);
  const theirs = phaseHudHTML({ ...state, activePlayer: 2 });
  assert.match(theirs, /phase-track theirs/); assert.match(theirs, /Turno do oponente/);
  const html = phaseHudHTML({ ...state, activePlayer: 2, players: [{ id: 2, name: '<img src=x>' }] });
  assert.match(html, /Turno de &lt;img src=x&gt;/);
  assert.doesNotMatch(html, /<img/);
});
test('the pass button names where the game goes next', () => {
  const s = (phase, extra = {}) => ({ phase, activePlayer: 1, you: 1, stack: [], ...extra });
  assert.equal(passLabel(s('UPKEEP')), 'Para a principal 1');
  assert.equal(passLabel(s('MAIN1')), 'Para o combate');
  assert.equal(passLabel(s('COMBAT_DECLARE_BLOCKERS')), 'Para a principal 2');
  assert.equal(passLabel(s('MAIN2')), 'Para o fim do turno');
  assert.equal(passLabel(s('END_OF_TURN')), 'Passar');
  assert.equal(passLabel(s('MAIN1', { activePlayer: 2 })), 'Passar');
  assert.equal(passLabel(s('MAIN1', { stack: [{ id: 1 }] })), 'Resolver');
});
test('in multiplayer Commander the active player portrait sits by the track, colored by owner, with the escaped name in the tip', () => {
  const players = [{ id: 1, name: 'Você' }, { id: 2, name: 'Ana' }, { id: 3, name: '<b>"Bia"</b>' }, { id: 4, name: 'Caio' }];
  const multi = { ...state, players };
  const art = 'https://cards.scryfall.io/art_crop/front/a/b/ab.jpg?1700000000';
  const theirs = phaseHudHTML({ ...multi, activePlayer: 3 }, art);
  assert.match(theirs, /<span class="phase-active-portrait theirs" aria-hidden="true" data-tip="Turno de &lt;b&gt;&quot;Bia&quot;&lt;\/b&gt;"/);
  assert.ok(theirs.includes(`background-image:url('${art}')`));
  assert.doesNotMatch(theirs, /<b>/);
  const mine = phaseHudHTML(multi, art);
  assert.match(mine, /phase-active-portrait mine[^>]*data-tip="Seu turno"/);
  const fallback = phaseHudHTML({ ...multi, activePlayer: 4 });
  assert.match(fallback, /<span class="phase-active-portrait theirs"[^>]*>C<\/span>/);
  assert.doesNotMatch(fallback, /background-image/);
  assert.doesNotMatch(phaseHudHTML({ ...multi, gameOver: true }, art), /phase-active-portrait/);
});
test('the portrait never shows in a 1x1 game and unsafe image addresses never reach the style attribute', () => {
  assert.doesNotMatch(phaseHudHTML(state, 'https://example.com/a.jpg'), /phase-active-portrait/);
  assert.doesNotMatch(phaseHudHTML({ ...state, activePlayer: 2 }, 'https://example.com/a.jpg'), /phase-active-portrait/);
  const players = [{ id: 1, name: 'Você' }, { id: 2, name: 'Ana' }, { id: 3, name: 'Bia' }];
  for (const bad of ["x');background:url('//evil", 'javascript:alert(1)', 'https://a.b/c d.jpg', 'https://a.b/"><img src=x>']) {
    const html = phaseHudHTML({ ...state, players, activePlayer: 2 }, bad);
    assert.doesNotMatch(html, /background-image|<img|javascript/);
    assert.match(html, /phase-active-portrait theirs[^>]*>A<\/span>/);
  }
});

test('extra turns and extra combats are named on the trail, the banner and the pass button', () => {
  const extra = { ...state, phase: 'MAIN2', extraTurn: true, extraTurns: [1, 1], extraCombats: 1, extraCombatAfter: ['MAIN2'], stack: [] };
  assert.equal(turnBannerText(extra), 'Turno extra');
  assert.equal(turnBannerText({ ...extra, activePlayer: 2 }), 'Turno extra do oponente');
  assert.equal(turnBannerText(state), 'Seu turno');
  assert.equal(upcomingTurnsText(extra), 'Depois: 2 turnos extras seu');
  assert.equal(upcomingTurnsText({ ...extra, extraTurns: [2] }), 'Depois: turno extra do oponente');
  assert.equal(passLabel(extra), 'Para o combate extra');
  assert.equal(passLabel({ ...extra, phase: 'COMBAT_DAMAGE', extraCombatAfter: ['COMBAT_END'] }), 'Para o combate extra');
  assert.equal(passLabel({ ...extra, phase: 'COMBAT_DAMAGE' }), 'Para a principal 2');
  assert.equal(passLabel({ ...extra, phase: 'MAIN1', extraCombatAfter: ['MAIN1'] }), 'Para o combate extra');
  const html = phaseHudHTML(extra);
  assert.match(html, /phase-turn-badge mine extra/);
  assert.match(html, /phase-combat-count">×2</);
  assert.match(html, /Seu turno extra/);
  const second = phaseHudHTML({ ...state, phase: 'COMBAT_DECLARE_ATTACKERS', combatNumber: 2 });
  assert.match(second, /Declaração de atacantes · Combate extra/);
  assert.doesNotMatch(phaseHudHTML(state), /phase-combat-count|extra/);
});

test('the turn clock shows minutes and seconds, and hours only past one hour', () => {
  assert.equal(turnTimeText(0), '0:00');
  assert.equal(turnTimeText(7_900), '0:07');
  assert.equal(turnTimeText(750_000), '12:30');
  assert.equal(turnTimeText(3_725_000), '1:02:05');
  assert.equal(turnTimeText(-500), '0:00');
  assert.match(phaseHudHTML(state), /data-turn-timer/);
  assert.doesNotMatch(phaseHudHTML({ ...state, gameOver: true }), /data-turn-timer/);
});

test('marked opponent steps show a dot on their group, and the held step gets a ring only during an opponent turn', () => {
  const theirs = { ...state, activePlayer: 2, phase: 'UPKEEP', stack: [] };
  const stops = ['UPKEEP', 'DRAW', 'COMBAT_DECLARE_ATTACKERS'];
  const html = phaseHudHTML(theirs, undefined, stops);
  assert.equal((html.match(/phase-stop-dot/g) ?? []).length, 2);
  assert.match(html, /data-phase="start" data-tip="Início · Manutenção · Parada no turno do oponente: Manutenção, Compra"/);
  assert.match(html, /Combate · Parada no turno do oponente: Atacantes/);
  assert.match(html, /phase-step current held/);
  assert.match(html, /Parada sua/);
  assert.doesNotMatch(html, /<button|data-act|role="button"|tabindex=/);
  assert.doesNotMatch(phaseHudHTML({ ...theirs, stack: [{ id: 1 }] }, undefined, stops), /held/);
  assert.doesNotMatch(phaseHudHTML({ ...theirs, phase: 'MAIN1' }, undefined, stops), /held/);
  const mine = phaseHudHTML({ ...state, phase: 'UPKEEP', stack: [] }, undefined, stops);
  assert.equal((mine.match(/phase-stop-dot/g) ?? []).length, 2);
  assert.doesNotMatch(mine, /current held|Parada sua/);
});

test('with editable stops every track icon is a button that opens the menu of its group, for opponents and on your own turn', () => {
  const stops = ['UPKEEP', 'COMBAT_DAMAGE'];
  for (const s of [{ ...state, stack: [] }, { ...state, activePlayer: 2, stack: [] }]) {
    const html = phaseHudHTML(s, undefined, { value: stops, editable: true, open: 'combat' });
    assert.equal((html.match(/<button type="button" class="phase-step-btn"/g) ?? []).length, 5);
    assert.doesNotMatch(html, /<ol[^>]*aria-hidden/);
    assert.match(html, /data-stop-group="start" aria-label="Início: paradas no turno do oponente \(Manutenção\)" aria-haspopup="true" aria-expanded="false"/);
    assert.match(html, /data-stop-group="combat" aria-label="Combate: paradas no turno do oponente \(Dano de combate\)" aria-haspopup="true" aria-expanded="true"/);
    assert.equal((html.match(/phase-stop-dot/g) ?? []).length, 2);
    assert.doesNotMatch(html, /data-phase="combat" data-tip/);
  }
  assert.doesNotMatch(phaseHudHTML({ ...state, gameOver: true }, undefined, { value: stops, editable: true }), /<button/);
});
