import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const cardtext = uri(await readFile(new URL('../src/ui/cardtext.ts', import.meta.url), 'utf8'));
const clock = uri(await readFile(new URL('../src/ui/clock.ts', import.meta.url), 'utf8'));
const mod = await import(uri((await readFile(new URL('../src/ui/playerStatus.ts', import.meta.url), 'utf8')).replace("'./cardtext'", JSON.stringify(cardtext)).replace("'./clock'", JSON.stringify(clock))));
const { playerStatusHTML, playerStatusText, landsText } = mod;
const player = extra => ({ id: 3, name: 'Ana', landsPlayed: 0, maxLands: 1, ...extra });

test('the monarch gets a crown seal that explains the rule and pulses when it arrives', () => {
  const html = playerStatusHTML(player({ monarch: true }), 9, null, new Set(['MONARCH']));
  assert.match(html, /player-counter monarch bump/);
  assert.match(html, /data-ctr="p3:MONARCH"/);
  assert.match(html, /etapa final, compra um card/);
  assert.equal(playerStatusHTML(player({}), 9), '');
  assert.match(playerStatusText(player({ monarch: true }), 9), /é o monarca/);
});

test('land plays show only on the player turn and dim once the last land is played', () => {
  assert.match(playerStatusHTML(player({}), 3), /player-counter land-plays" .*<b>0<\/b><small>\/1<\/small>/);
  assert.match(playerStatusHTML(player({ landsPlayed: 1 }), 3), /player-counter land-plays done/);
  assert.match(playerStatusHTML(player({ landsPlayed: 3, maxLands: -1 }), 3), /<small>\/∞<\/small>/);
  assert.doesNotMatch(playerStatusHTML(player({ landsPlayed: 3, maxLands: -1 }), 3), /done/);
  assert.equal(landsText(player({ landsPlayed: 1, maxLands: 3 })), '1 de 3');
  assert.match(playerStatusText(player({}), 3), /terrenos jogados neste turno: 0 de 1/);
  assert.equal(playerStatusText(player({}), 9), '');
});

test('spells cast this turn show only when a visible card counts them, with the table total in the tooltip', () => {
  const { turnSpellsTotal } = mod;
  const field = extra => ({ battlefield: [], hand: [], commandZone: [], ...extra });
  const ana = player(field({ spellsCast: 2 })), bruno = { ...player(field({ spellsCast: 1 })), id: 4 };
  assert.equal(turnSpellsTotal([ana, bruno]), undefined, 'nobody cares about the count');
  const storm = { ...ana, hand: [{ id: 1, name: 'Grapeshot', countsSpells: true }] };
  assert.equal(turnSpellsTotal([storm, bruno]), 3);
  const html = playerStatusHTML(ana, 9, null, new Set(['SPELLS']), 3);
  assert.match(html, /player-counter spells-cast bump" data-ctr="p3:SPELLS"/);
  assert.match(html, /<b>2<\/b>/);
  assert.match(html, /2 mágicas conjuradas neste turno\. Na mesa, 3 no total, a conta da Tempestade\./);
  assert.doesNotMatch(playerStatusHTML(player({ spellsCast: 1 }), 9, null, new Set(), 1), /Na mesa/);
  assert.doesNotMatch(playerStatusHTML(ana, 9), /spells-cast/, 'hidden without a card that counts');
  assert.doesNotMatch(playerStatusHTML(player({}), 9, null, new Set(), 3), /spells-cast/, 'hidden for players with no spell');
  assert.match(playerStatusText(ana, 9, 3), /, 2 mágicas conjuradas neste turno/);
});

test('the city blessing and the speed get seals by the portrait, with the rule in the tooltip', () => {
  const html = playerStatusHTML(player({ blessing: true, speed: 2 }), 9, null, new Set(['SPEED']));
  assert.match(html, /player-counter blessing" data-ctr="p3:BLESSING"/);
  assert.match(html, /dura até o fim da partida/);
  assert.match(html, /player-counter speed bump" data-ctr="p3:SPEED".*<b>2<\/b><small>\/4<\/small>/);
  assert.match(html, /Velocidade 2 de 4\. Sobe 1, no máximo uma vez por turno/);
  assert.match(playerStatusHTML(player({ speed: 4 }), 9), /player-counter speed max".*Velocidade máxima/);
  assert.doesNotMatch(playerStatusHTML(player({}), 9), /blessing|speed/);
  assert.match(playerStatusText(player({ blessing: true, speed: 3 }), 9), /, tem a bênção da cidade, velocidade 3 de 4/);
});

test('the length of the latest turn shows beside each player, except during their own turn', () => {
  const html = playerStatusHTML(player({ lastTurnMs: 72_400 }), 9);
  assert.match(html, /player-counter last-turn" data-ctr="p3:LASTTURN".*<b>1:12<\/b>/);
  assert.match(html, /Último turno: durou 1:12\./);
  assert.match(playerStatusText(player({ lastTurnMs: 72_400 }), 9), /último turno durou 1:12/);
  assert.doesNotMatch(playerStatusHTML(player({ lastTurnMs: 72_400 }), 3), /last-turn/);
  assert.equal(playerStatusText(player({ lastTurnMs: 72_400, maxLands: undefined }), 3), '');
  assert.doesNotMatch(playerStatusHTML(player({}), 9), /last-turn/);
});
