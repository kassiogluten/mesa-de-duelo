// Momentos da partida: o toque de cada tipo de criatura, primeiro sangue, eliminação dupla, os títulos e o destaque do fim do jogo, a mesa rangendo e a ampulheta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
const { CREATURE_TOUCHES, creatureTouch, subtypes } = await import('../src/ui/creatureTouches.ts');
const { coinOnEdge, COIN_EDGE, COIN_EDGE_ODDS, presentationDuration, PresentationTimeline } = await import('../src/ui/presentationTimeline.ts');
const { knockedOut, multiKill, FIRST_BLOOD } = await import('../src/ui/tableMoments.ts');
const { historyTurns } = await import('../src/ui/historyLog.ts');

const entered = (typeLine, extra = {}) => ({ seq: 1, type: 'entered', card: { id: 1, typeLine, creature: true, ...extra } });

test('creature subtypes come from the face on display, after the dash', () => {
  assert.deepEqual(subtypes('Creature — Elf Druid'), ['Elf', 'Druid']);
  assert.deepEqual(subtypes('Token Creature — Squirrel'), ['Squirrel']);
  assert.deepEqual(subtypes('Creature — Human Werewolf // Creature — Werewolf'), ['Human', 'Werewolf']);
  assert.deepEqual(subtypes('Artifact'), []);
  assert.deepEqual(subtypes(undefined), []);
});

test('a creature entering gets the touch of its first subtype that has one', () => {
  assert.equal(creatureTouch(entered('Creature — Bear'))?.sound, 'bear');
  assert.equal(creatureTouch(entered('Creature — Elf Druid'))?.type, 'Elf');
  assert.equal(creatureTouch(entered('Creature — Human Werewolf'))?.sound, 'wolf', 'Human has no touch, Werewolf howls');
  assert.equal(creatureTouch(entered('Creature — Zombie Bear'))?.type, 'Zombie', 'printed order wins');
  assert.deepEqual(creatureTouch(entered('Token Creature — Squirrel')), { type: 'Squirrel', sound: 'squirrel', critter: 'squirrel' });
  assert.equal(creatureTouch(entered('Creature — Spider'))?.critter, 'spider');
});

test('only creatures on display entering the battlefield have a touch', () => {
  assert.equal(creatureTouch(entered('Creature — Human Soldier')), null, 'common types stay quiet');
  assert.equal(creatureTouch(entered('Creature — Bear', { faceDown: true })), null);
  assert.equal(creatureTouch(entered('Creature — Bear', { creature: false })), null);
  assert.equal(creatureTouch({ seq: 1, type: 'spell-cast', card: { typeLine: 'Creature — Bear', creature: true } }), null);
  const tokens = { seq: 1, type: 'entered', entries: [{ id: 1, typeLine: 'Token Creature — Human', creature: true }, { id: 2, typeLine: 'Token Creature — Squirrel', creature: true }] };
  assert.equal(creatureTouch(tokens)?.type, 'Squirrel', 'tokens entering together count as one entry');
});

test('every creature sound has its file', () => {
  for (const [type, touch] of Object.entries(CREATURE_TOUCHES)) {
    if (touch.sound) assert.ok(existsSync(new URL(`../public/audio/criaturas/${touch.sound}.mp3`, import.meta.url)), `${type}: criaturas/${touch.sound}.mp3`);
  }
});

test('the coin lands on its edge about once in 50 tosses, the same way on every replay', () => {
  const tosses = Array.from({ length: 5000 }, (_, i) => ({ seq: i + 1, type: 'coin', heads: true }));
  const edges = tosses.filter(coinOnEdge).length;
  assert.ok(edges > 5000 / COIN_EDGE_ODDS * .6 && edges < 5000 / COIN_EDGE_ODDS * 1.4, `${edges} edges in 5000`);
  for (const toss of tosses.slice(0, 200)) assert.equal(coinOnEdge(toss), coinOnEdge({ ...toss }));
  assert.equal(coinOnEdge({ seq: 1, type: 'coin', edge: true }), true, 'the lab forces it');
  assert.equal(coinOnEdge({ seq: 1, type: 'coin', edge: true, startingToss: true }), false, 'not the toss for who starts');
  assert.equal(coinOnEdge({ seq: 1, type: 'die', edge: true }), false);
  assert.equal(presentationDuration({ seq: 1, type: 'coin', edge: true }, 1), 1250 + COIN_EDGE);
  assert.equal(presentationDuration({ seq: 1, type: 'coin', edge: false }, 1), 1250);
});

const hit = (seq, player, extra = {}) => ({ seq, type: 'damage', combat: true, actor: 1, sourceId: 50, delta: -2, targets: { players: [player], cards: [] }, ...extra });
const turn = (seq, number) => ({ seq, type: 'turn', actor: 1, turn: number });
const marked = events => { const t = new PresentationTimeline(); t.ingest('m', [], {}); t.ingest('m', events); return t.history.filter(e => e.firstBlood).map(e => e.seq); };

test('first blood is the first combat hit on a player in each game', () => {
  assert.deepEqual(marked([turn(1, 1), hit(2, 2, { combat: false }), hit(3, 2, { prevented: true }), hit(4, 2), hit(5, 1)]), [4], 'spell damage and prevented hits do not count');
  assert.deepEqual(marked([turn(1, 1), { seq: 2, type: 'damage', combat: true, targets: { cards: [9] } }, hit(3, 2)]), [3], 'hitting a creature is not blood');
  assert.deepEqual(marked([turn(1, 1), hit(2, 2), turn(3, 2), hit(4, 1), turn(5, 1), hit(6, 1)]), [2, 6], 'turn 1 starts the next game of the match');
  assert.deepEqual(marked([turn(1, 7), hit(2, 2)]), [], 'opening the match in the middle never shows a false first blood');
});

test('several players knocked out by the same blow name the elimination and the announcer line', () => {
  const lethal = (seq, player) => hit(seq, player, { lethal: true });
  assert.deepEqual(knockedOut([lethal(1, 2), lethal(2, 3), lethal(3, 3), hit(4, 4), hit(5, 5, { lethal: true, prevented: true })]), [2, 3]);
  assert.equal(multiKill(1), null);
  assert.deepEqual(multiKill(2), { title: 'Eliminação dupla', voice: 'voz/double-kill.mp3' });
  assert.equal(multiKill(3)?.title, 'Eliminação tripla');
  assert.equal(multiKill(4)?.voice, 'voz/triple-kill.mp3');
  assert.ok(existsSync(new URL(`../public/audio/${FIRST_BLOOD.voice}`, import.meta.url)));
  for (const n of [2, 3]) assert.ok(existsSync(new URL(`../public/audio/${multiKill(n).voice}`, import.meta.url)));
});

test('the history line of the blow carries the moment badges', () => {
  const names = { player: id => `P${id}`, card: () => 'Grizzly Bears', cardById: () => undefined, label: c => c.name, describe: e => `evento ${e.seq}` };
  const lines = historyTurns([turn(1, 1), { ...hit(2, 2), firstBlood: true }, hit(3, 3, { lethal: true }), hit(4, 4, { lethal: true })], names).flatMap(t => t.lines);
  const badges = lines.flatMap(l => l.badges ?? []);
  assert.ok(badges.includes('Primeiro sangue'), JSON.stringify(lines));
  assert.ok(badges.includes('Eliminação dupla'), JSON.stringify(lines));
});

const { endingTitles, gameHighlight } = await import('../src/ui/gameEnding.ts');
const endState = (life, history, extra = {}) => ({ winner: 'Ana', you: 1, players: [{ id: 1, name: 'Ana', life }, { id: 2, name: 'Bruno', life: 0 }],
  lifeHistory: history.map((n, i) => ({ turn: i + 1, life: { 1: n, 2: 20 } })), ...extra });

test('the winner who fell to 5 life or less and came back to 15 or more gets the comeback', () => {
  assert.deepEqual(endingTitles(endState(18, [20, 4, 9, 16])).map(t => t.kind), ['comeback']);
  assert.equal(endingTitles(endState(18, [20, 4, 3, 16]))[0].detail, 'Você chegou a 3 de vida e virou o jogo.');
  assert.equal(endingTitles(endState(18, [20, 4, 16], { you: 2 }))[0].detail, 'Ana chegou a 4 de vida e virou o jogo.', 'the others see the name');
  assert.deepEqual(endingTitles(endState(14, [20, 4, 9])), [], 'never back to 15');
  assert.deepEqual(endingTitles(endState(18, [20, 16, 6])), [], 'never down to 5');
  assert.deepEqual(endingTitles(endState(18, [20, 4, 16], { match: { abandoned: true } })), []);
});

test('winning with exactly 1 life is winning by a thread', () => {
  assert.deepEqual(endingTitles(endState(1, [20, 10])).map(t => t.title), ['Por um fio']);
  assert.deepEqual(endingTitles(endState(1, [20, 3, 17])).map(t => t.kind), ['comeback', 'thread']);
  assert.deepEqual(endingTitles(endState(2, [20, 10])), []);
  assert.deepEqual(endingTitles({ ...endState(1, [20]), winner: undefined }), [], 'a draw has no titles');
});

test('the game highlight is the play of this game with the most damage, life gained or removals', () => {
  const names = { player: id => `P${id}`, card: e => e.card?.name, cardById: () => undefined, label: c => c.name, describe: e => `evento ${e.seq}` };
  const dmg = (seq, n, extra = {}) => ({ seq, type: 'damage', actor: 1, sourceId: seq, delta: -n, card: { id: seq, name: `Carta ${seq}` }, targets: { players: [2], cards: [] }, ...extra });
  const old = [turn(1, 1), dmg(2, 12), turn(3, 1)];
  assert.equal(gameHighlight([...old, dmg(4, 5), dmg(5, 2)], names)?.events[0].seq, 4, 'only this game of the match');
  assert.equal(gameHighlight([...old, dmg(4, 5)], names)?.kind, 'Maior golpe');
  assert.equal(gameHighlight([turn(1, 1), dmg(2, 2)], names), null, 'nothing big enough');
  const heal = { seq: 9, type: 'life-changed', actor: 1, delta: 10 };
  assert.equal(gameHighlight([turn(1, 1), dmg(2, 5), heal], names)?.kind, 'Maior ganho de vida', '10 life weighs 7.5');
  assert.equal(gameHighlight([turn(1, 1), dmg(2, 5, { prevented: true })], names), null, 'prevented damage does not count');
});

const { crowdedSide, CROWDED } = await import('../src/ui/tableMoments.ts');

test('a crowded battlefield creaks when one more permanent arrives', () => {
  const frame = n => ({ players: [{ id: 1, battlefield: Array.from({ length: n }, (_, i) => ({ id: i })) }, { id: 2, battlefield: [] }] });
  const entry = (n, extra = {}) => ({ seq: 1, type: 'entered', actor: 1, to: 'Battlefield', card: { id: 99, controller: 1 }, frame: frame(n), ...extra });
  assert.equal(crowdedSide(entry(CROWDED + 1)), 1);
  assert.equal(crowdedSide(entry(CROWDED)), null, 'thirty is not crowded yet');
  assert.equal(crowdedSide(entry(CROWDED + 5, { card: { id: 99, controller: 2 } })), null, 'the side that received it is counted');
  assert.equal(crowdedSide(entry(CROWDED + 5, { to: 'Hand' })), null);
});
