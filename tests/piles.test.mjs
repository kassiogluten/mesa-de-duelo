import test from 'node:test';
import assert from 'node:assert/strict';
const piles = await import('../src/ui/piles.ts');

const card = (id, name) => ({ id, name, typeLine: 'Instant', tapped: false, token: false });
const revealed = ['Lightning Bolt', 'Counterspell', 'Forest', 'Island', 'Grizzly Bears'].map((n, i) => card(700 + i, n));
const opt = c => ({ kind: 'card', card: c, label: c.name });
const marker = (id, label) => ({ kind: 'card', label, card: { id, name: label, tapped: false, token: false } });
const ME = 10, OPP = 23;
const view = { face: c => `<div class="face">${c.name}</div>`, label: c => c.name, playerName: id => id === OPP ? 'Ana' : 'você', you: ME };
const about = owner => ({ pileOwner: owner, chosenTo: 'hand', otherTo: 'graveyard' });
/** Fact or Fiction do oponente: você separa e ele escolhe. Steam Augury sua: você separa e o oponente escolhe. */
const split = (extra) => ({ id: 1, method: 'order', kind: 'choose', purpose: 'piles-split', title: 'Divida ss cartas em duas pilhas', min: 0, max: 5,
  options: revealed.map(opt), card: card(699, 'Fact or Fiction'), ...extra });
const choose = (extra) => ({ id: 2, method: 'getChoices', kind: 'choose', purpose: 'piles-choose', title: 'Escolha uma pilha', min: 1, max: 1,
  options: [marker(-2147483648, '-- Pile 1 (2 cards) --'), opt(revealed[0]), opt(revealed[1]), marker(-2147483647, '-- Pile 2 (3 cards) --'), ...revealed.slice(2).map(opt)],
  piles: [{ option: 0, size: 2, cards: [1, 2] }, { option: 3, size: 3, cards: [4, 5, 6] }], card: card(699, 'Fact or Fiction'), ...extra });

test('only questions the bridge marks as piles use these screens', () => {
  assert.equal(piles.isPilesSplit(split({})), true);
  assert.equal(piles.isPilesChoice(choose({})), true);
  assert.equal(piles.isPilesSplit({ ...split({}), purpose: undefined }), false);
  assert.equal(piles.isPilesChoice({ ...choose({}), piles: undefined }), false);
});

test('splitting starts with every card in pile 1 and a tap moves a card to the other pile and back', () => {
  const first = piles.pilesStart(split({}));
  assert.deepEqual(first, [0, 1, 2, 3, 4]);
  for (const i of [2, 3, 4]) piles.movePileCard(first, i);
  assert.deepEqual(first, [0, 1]);
  assert.equal(piles.splitSummary(split({}), first), 'Monte 1: 2 cartas. Monte 2: 3 cartas.');
  piles.movePileCard(first, 3);
  assert.deepEqual(first, [0, 1, 3]);
  piles.movePileCard(first, 0); piles.movePileCard(first, 1); piles.movePileCard(first, 3);
  assert.equal(piles.splitSummary(split({}), first), 'Monte 1: 0 cartas. Monte 2: 5 cartas.');
});

test('the hints say who chooses and where each pile goes', () => {
  assert.equal(piles.splitHint(split({ ...about(OPP), ownerChooses: true }), view), 'Ana escolhe um dos montes para a mão; o outro vai para o cemitério.');
  assert.equal(piles.splitHint(split({ ...about(ME), ownerChooses: false }), view), 'Um oponente escolhe qual monte vai para a sua mão; o outro vai para o seu cemitério.');
  assert.equal(piles.splitHint(split({ pileOwner: ME, ownerChooses: false }), view), 'Depois, um dos montes é escolhido.');
  assert.equal(piles.choiceHint(choose({ ...about(ME), ownerChooses: true }), view), 'O monte que você escolher vai para a sua mão; o outro, para o seu cemitério.');
  assert.equal(piles.choiceHint(choose({ ...about(OPP), ownerChooses: false }), view), 'O monte que você escolher vai para a mão de Ana; o outro, para o cemitério de Ana.');
  assert.equal(piles.pilesHeading(split({}), view), 'Fact or Fiction: separe em dois montes');
  assert.equal(piles.pilesHeading(choose({ card: undefined }), view), 'Escolha um monte');
});

test('the split screen shows both piles live, with the cards in each one and a button to read them', () => {
  const html = piles.pilesSplitHTML(split({ ...about(OPP), ownerChooses: true }), [0, 1], view);
  const [one, two] = html.split('Monte 2</b>');
  assert.match(one, /data-pile-move="0"[\s\S]*data-pile-move="1"/);
  assert.doesNotMatch(one, /data-pile-move="2"/);
  assert.match(two, /data-pile-move="2"[\s\S]*data-pile-move="3"[\s\S]*data-pile-move="4"/);
  assert.match(html, /data-inspect="700"/);
  assert.match(html, /Confirmar montes/);
  assert.match(piles.pilesSplitHTML(split({}), [0, 1, 2, 3, 4], view), /Vazio/);
});

test('the choice screen groups the real cards under each pile and never offers the fake pile entries', () => {
  const mine = piles.pilesChoiceHTML(choose({ ...about(ME), ownerChooses: true }), view);
  assert.match(mine, /data-pile-pick="0">Ficar com o monte 1/);
  assert.match(mine, /data-pile-pick="3">Ficar com o monte 2/);
  assert.doesNotMatch(mine, /Pile 1|Pile 2|data-q-opt/);
  const [one, two] = mine.split('Monte 2</b>');
  assert.match(one, /Lightning Bolt[\s\S]*Counterspell/);
  assert.doesNotMatch(one, /Forest/);
  assert.match(two, /Forest[\s\S]*Island[\s\S]*Grizzly Bears/);
  assert.match(piles.pilesChoiceHTML(choose({ ...about(OPP), ownerChooses: false }), view), /Escolher o monte 1/);
  // Monte virado para baixo: só o verso das cartas.
  const faceDown = choose({ piles: [{ option: 0, size: 2, cards: [] }, { option: 3, size: 3, cards: [4, 5, 6] }] });
  assert.equal(piles.pilesChoiceHTML(faceDown, view).match(/class="pile-back"/g).length, 2);
});
