import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const cardtext = uri(await readFile(new URL('../src/ui/cardtext.ts', import.meta.url), 'utf8'));
const { forecastBadgeHTML, forecastLevel, forecastText, forecastLineHTML, walkerForecast } = await import(uri((await readFile(new URL('../src/ui/combatForecast.ts', import.meta.url), 'utf8')).replace("'./cardtext'", JSON.stringify(cardtext))));
const names = { 7: 'Edgar Markov', 8: 'Vraska' };
const name = id => names[id];
const row = extra => ({ player: 3, life: 20, lifeAfter: 13, ...extra });

test('the portrait shows the life after combat and highlights low and lethal results', () => {
  assert.match(forecastBadgeHTML(row()), /→<\/span><b>13<\/b>/);
  assert.equal(forecastLevel(row()), null);
  assert.equal(forecastLevel(row({ lifeAfter: 5 })), 'low');
  assert.match(forecastBadgeHTML(row({ lifeAfter: 5 })), /life-forecast low/);
  const lethal = forecastBadgeHTML(row({ lifeAfter: -2, lethal: 'life' }));
  assert.match(lethal, /life-forecast lethal/); assert.match(lethal, /Letal!/);
  assert.match(forecastBadgeHTML(row({ lifeAfter: 20 })), /Sem dano/);
});

test('poison and commander damage enter the badge with their own limits', () => {
  const poison = row({ lifeAfter: 20, poison: 7, poisonAfter: 8 });
  assert.equal(forecastLevel(poison), 'low');
  assert.match(forecastBadgeHTML(poison), /Veneno 8\/10/);
  assert.doesNotMatch(forecastBadgeHTML(poison), /lf-life/);
  const commander = row({ lifeAfter: 14, commander: [{ commanderId: 7, damage: 15, after: 21 }], lethal: 'commander' });
  assert.match(forecastBadgeHTML(commander), /Comandante 21\/21/);
  assert.equal(forecastText(commander, null, name), 'Depois do combate, você fica com 14 de vida e 21 de dano de Edgar Markov. Letal!');
  assert.equal(forecastLevel(row({ commander: [{ commanderId: 7, damage: 10, after: 19 }] })), 'low');
  // Seu retrato mostra só o que pesa mais: aqui, o dano de comandante que derrota, não a vida.
  const compact = forecastBadgeHTML(commander, true);
  assert.match(compact, /Comandante 21\/21/); assert.doesNotMatch(compact, /lf-life/); assert.match(compact, /Letal!/);
  assert.match(forecastBadgeHTML(row(), true), /<b>13<\/b>/);
});

test('the sentence names the player and the planeswalkers under attack', () => {
  const pw = row({ lifeAfter: 20, planeswalkers: [{ id: 8, loyalty: 3, after: 0 }] });
  assert.equal(forecastText(pw, 'Ana', name), 'Ana não toma dano neste combate. Vraska morre.');
  assert.equal(forecastText(row({ lifeAfter: 4 }), 'Ana', name), 'Depois do combate, Ana fica com 4 de vida. Perto de perder.');
  assert.deepEqual(walkerForecast([pw], 8), { id: 8, loyalty: 3, after: 0 });
  assert.equal(walkerForecast([pw], 9), undefined);
  assert.match(forecastLineHTML(row({ lifeAfter: 0, lethal: 'life' }), name), /block-forecast lethal">Depois do combate, você fica com 0 de vida\. Letal!/);
});
