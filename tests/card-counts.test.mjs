import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const cardtext = uri(await readFile(new URL('../src/ui/cardtext.ts', import.meta.url), 'utf8'));
const { countSeals, countSealsHTML, countLabel, countSubject } = await import(uri((await readFile(new URL('../src/ui/cardCounts.ts', import.meta.url), 'utf8')).replace("'./cardtext'", JSON.stringify(cardtext))));
const css = await readFile(new URL('../src/ui/permanentEffects.css', import.meta.url), 'utf8');

// O JSON abaixo é o que a ponte manda (forge-bridge CardCountsTest), com o motor de verdade.
const combustion = { of: 'cards', zone: 'graveyard', whose: 'you', types: ['Lesson'], qualities: [], value: 3, uses: [{ use: 'damage', amount: 5, plus: 2 }] };
const wisdom = value => ({ of: 'cards', zone: 'graveyard', whose: 'you', types: ['Lesson'], qualities: [], value, uses: [{ use: 'threshold', min: 3 }] });
const craterhoof = { of: 'cards', zone: 'battlefield', whose: 'you', types: ['Creature'], qualities: [], value: 2, entering: 3, uses: [{ use: 'pt', power: '+3', toughness: '+3' }] };
const ghalta = { of: 'cards', zone: 'battlefield', whose: 'you', types: ['Creature'], qualities: [], measure: 'power', value: 7, uses: [{ use: 'costLess', amount: 7 }] };
const name = id => ({ 10: 'você', 23: 'Ana' })[id];

test('Combustion Technique: the Lessons in your graveyard and the damage they make', () => {
  assert.equal(countLabel(combustion), 'Lições no seu cemitério: 3. Causa 5 de dano (2 + 3).');
  const [seal] = countSeals({ counts: [combustion], controller: 10 }, name, 10);
  assert.equal(seal.kind, 'count');
  assert.match(seal.html, /<svg[^>]*>.*<\/svg>3$/);
});

test('Accumulate Wisdom shows the count against the minimum, green once it is met', () => {
  const [before] = countSeals({ counts: [wisdom(2)] });
  assert.equal(before.kind, 'count');
  assert.match(before.html, /2\/3$/);
  assert.equal(before.label, 'Lições no seu cemitério: 2. O efeito extra vale com 3 ou mais (falta 1).');
  const [after] = countSeals({ counts: [wisdom(4)] });
  assert.equal(after.kind, 'count met');
  assert.equal(after.label, 'Lições no seu cemitério: 4. Com 3 ou mais, o efeito extra já vale.');
});

test('Craterhoof counts itself once it enters, and Ghalta says what lowers the cost', () => {
  assert.equal(countLabel(craterhoof), 'Criaturas que você controla: 2; 3 quando ela entrar. Dá +3/+3.');
  assert.match(countSeals({ counts: [craterhoof] })[0].html, /3$/, 'the seal shows the number that will matter');
  assert.equal(countLabel(ghalta), 'Poder total das criaturas que você controla: 7. Custa 7 a menos.');
});

test('counts say whose they are, also when the card belongs to an opponent', () => {
  const scourge = { of: 'cards', zone: 'battlefield', whose: 'opponents', types: ['Creature'], qualities: [], value: 1, uses: [{ use: 'pt', power: '+1', toughness: '+1' }] };
  assert.equal(countLabel(scourge), 'Criaturas que seus oponentes controlam: 1. Dá +1/+1.');
  assert.equal(countSeals({ counts: [scourge], controller: 23 }, name, 10)[0].label, 'Criaturas que os oponentes de Ana controlam: 1. Dá +1/+1.');
  assert.equal(countSeals({ counts: [combustion], controller: 23 }, name, 10)[0].label, 'Lições no cemitério de Ana: 3. Causa 5 de dano (2 + 3).');
  const goyf = { of: 'cards', zone: 'graveyard', whose: 'all', types: ['Card'], qualities: [], measure: 'cardTypes', value: 2, uses: [{ use: 'pt', power: '2', toughness: '3' }] };
  assert.equal(countLabel(goyf), 'Tipos de carta entre as cartas em todos os cemitérios: 2. Fica 2/3.');
  assert.equal(countSubject({ of: 'cards', zone: 'battlefield', whose: 'all', types: ['Elf'], qualities: [] }), 'Elfos no campo, de todos os jogadores');
});

test('types, qualities and the other kinds of count read as Portuguese', () => {
  const subject = extra => countSubject({ of: 'cards', zone: 'battlefield', whose: 'you', qualities: [], ...extra });
  assert.equal(subject({ types: ['Creature'], qualities: ['other', 'untapped'] }), 'outras criaturas desviradas que você controla');
  assert.equal(subject({ types: ['Permanent'], qualities: ['non:Land'] }), 'permanentes não terreno que você controla');
  assert.equal(subject({ types: ['Forest', 'Island'] }), 'Florestas ou Ilhas que você controla');
  assert.equal(subject({ types: ['Creature'], qualities: ['with:Flying', 'powerGE4'] }), 'criaturas com voar com poder 4 ou mais que você controla');
  assert.equal(subject({ types: ['Kor'] }), 'permanentes do tipo Kor que você controla');
  assert.equal(countSubject({ of: 'cards', zone: 'graveyard', whose: 'all', types: ['Creature'], qualities: [] }), 'cartas de criatura em todos os cemitérios');
  assert.equal(countSubject({ of: 'cards', zone: 'battlefield', whose: 'you', types: ['Creature'], qualities: [], measure: 'greatestPower' }), 'maior poder entre as criaturas que você controla');
  assert.equal(countLabel({ of: 'hand', whose: 'you', value: 5, uses: [{ use: 'threshold', min: 7 }] }), 'Cartas na sua mão: 5. O efeito extra vale com 7 ou mais (faltam 2).');
  assert.equal(countLabel({ of: 'life', value: 20, uses: [{ use: 'pt', power: '20', toughness: '20' }] }), 'Seus pontos de vida: 20. Fica 20/20.');
  assert.equal(countLabel({ of: 'devotion', colors: ['B'], value: 1, entering: 3, uses: [{ use: 'lifeLoss', amount: 3 }] }), 'Devoção ao preto: 1; 3 quando ela entrar. Faz perder 3 de vida.');
});

test('seals outside the battlefield sit on the left edge and carry the explanation', () => {
  const html = countSealsHTML({ counts: [combustion] });
  assert.match(html, /^<span class="count-seals"><span class="fx-seal count" title="Lições no seu cemitério: 3\. Causa 5 de dano \(2 \+ 3\)\.">/);
  assert.equal(countSealsHTML({}), '');
  assert.match(css, /\.hcard > \.count-seals \{ left: -6px;/);
  assert.match(css, /\.fx-seal\.count\.met \{/);
});
