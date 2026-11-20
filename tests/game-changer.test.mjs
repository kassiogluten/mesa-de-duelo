// Game Changers na mesa: quais cartas levam o selo (só nas partidas com as regras do Commander), quais jogadas ganham a cena do holofote com a gema e quanto tempo a fila dá a ela.
import test from 'node:test';
import assert from 'node:assert/strict';
const { isGameChanger } = await import('../src/brackets.ts');
const { gameChangerCard, gameChangerBadge, GAME_CHANGER_TIP } = await import('../src/ui/gameChanger.ts');
const { gameChangerPlay, GAME_CHANGER, GAME_CHANGER_FLIGHT } = await import('../src/ui/impactRules.ts');
const { impactOf } = await import('../src/ui/motionImpact.ts');
const { presentationDuration, PresentationTimeline } = await import('../src/ui/presentationTimeline.ts');

const commander = { config: { format: 'commander', matchLength: 'bo1' } };

test('the official list decides, by the whole name or the front face', () => {
  assert.ok(isGameChanger('Rhystic Study'));
  assert.ok(isGameChanger('rhystic study '), 'case and spaces do not matter');
  assert.ok(isGameChanger("Tergrid, God of Fright // Tergrid's Lantern"));
  assert.ok(isGameChanger('Tergrid, God of Fright'), 'the front face alone');
  assert.ok(!isGameChanger('Grizzly Bears'));
});

test('the gem badge only shows in matches with the Commander rules, on real cards face up', () => {
  const study = { id: 1, name: 'Rhystic Study' };
  assert.ok(gameChangerCard(commander, study));
  assert.ok(gameChangerCard({ config: { format: 'precon' } }, study), 'precons follow the Commander rules');
  for (const format of ['standard', 'pauper', 'free', 'oathbreaker']) assert.ok(!gameChangerCard({ config: { format } }, study), format);
  assert.ok(!gameChangerCard({}, study), 'without the match config, no badge');
  assert.ok(!gameChangerCard(commander, { ...study, token: true }), 'a token copy does not count');
  assert.ok(!gameChangerCard(commander, { ...study, faceDown: true }), 'face down, nobody knows what it is');
  assert.ok(!gameChangerCard(commander, { id: 2, name: 'Grizzly Bears' }));
  assert.match(gameChangerBadge(), /class="badge game-changer"/);
  assert.ok(gameChangerBadge().includes(GAME_CHANGER_TIP));
});

test('casting a Game Changer or playing one as a land gets the scene, only in Commander matches', () => {
  const study = { id: 10, name: 'Rhystic Study', manaCost: '{2}{U}' }, tomb = { id: 11, name: 'Ancient Tomb', land: true };
  const events = [
    { seq: 1, type: 'spell-cast', actor: 1, card: study, from: 'Hand', stackId: 5 },
    { seq: 2, type: 'resolved', actor: 1, card: study, stackId: 5, from: 'Stack', to: 'Battlefield' },
    { seq: 3, type: 'entered', actor: 1, card: study, from: 'Stack', to: 'Battlefield' },
    { seq: 4, type: 'land-played', actor: 1, card: tomb, to: 'Battlefield' },
    { seq: 5, type: 'spell-cast', actor: 1, card: { ...study, id: 12 }, copy: true, stackId: 6 },
    { seq: 6, type: 'spell-cast', actor: 1, card: { id: 13, name: 'Lightning Bolt' }, stackId: 7 },
  ];
  const marked = gameChangers => {
    const timeline = new PresentationTimeline();
    timeline.ingest('game', []);
    timeline.ingest('game', events, { gameChangers });
    return timeline.history.filter(e => e.gameChanger).map(e => e.seq);
  };
  assert.deepEqual(marked(true), [1, 4], 'the cast and the land, not the resolution, the copy or other cards');
  assert.deepEqual(marked(false), [], 'outside Commander, a normal cast');
});

test('the scene replaces the big spell moment and the queue gives it time, shortened by the fast pace', () => {
  const cast = { seq: 1, type: 'spell-cast', card: { id: 1, name: 'Rhystic Study', manaCost: '{6}' }, gameChanger: true };
  assert.ok(gameChangerPlay(cast));
  assert.ok(gameChangerPlay({ ...cast, type: 'land-played' }));
  assert.ok(!gameChangerPlay({ ...cast, gameChanger: undefined }));
  assert.equal(impactOf(cast), null, 'its own spotlight, not the big spell one');
  assert.equal(presentationDuration(cast, false), GAME_CHANGER);
  assert.ok(presentationDuration(cast, true) < GAME_CHANGER);
  // A cena (depois do voo) fica com pelo menos 2 s no Normal.
  assert.ok(GAME_CHANGER * (1 - GAME_CHANGER_FLIGHT) >= 2000);
});
