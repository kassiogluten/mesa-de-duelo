import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const cardtext = uri(await readFile(new URL('../src/ui/cardtext.ts', import.meta.url), 'utf8'));
const clock = uri(await readFile(new URL('../src/ui/clock.ts', import.meta.url), 'utf8'));
const { playerStatusHTML, playerStatusText, landsText } = await import(uri((await readFile(new URL('../src/ui/playerStatus.ts', import.meta.url), 'utf8')).replace("'./cardtext'", JSON.stringify(cardtext)).replace("'./clock'", JSON.stringify(clock))));
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

test('the length of the latest turn shows beside each player, except during their own turn', () => {
  const html = playerStatusHTML(player({ lastTurnMs: 72_400 }), 9);
  assert.match(html, /player-counter last-turn" data-ctr="p3:LASTTURN".*<b>1:12<\/b>/);
  assert.match(html, /Último turno: durou 1:12\./);
  assert.match(playerStatusText(player({ lastTurnMs: 72_400 }), 9), /último turno durou 1:12/);
  assert.doesNotMatch(playerStatusHTML(player({ lastTurnMs: 72_400 }), 3), /last-turn/);
  assert.equal(playerStatusText(player({ lastTurnMs: 72_400, maxLands: undefined }), 3), '');
  assert.doesNotMatch(playerStatusHTML(player({}), 9), /last-turn/);
});
