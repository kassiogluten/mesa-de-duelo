import assert from 'node:assert/strict';
import { test } from 'node:test';

const { PresentationTimeline, presentationDuration, calloutDuration } = await import('../src/ui/presentationTimeline.ts');
const { walkerTone, walkerArrives, loyaltyLook } = await import('../src/ui/planeswalkerEffects.ts');
const { soundForEvent, soundVariation, AudioEventMix, SOUND_FILES } = await import('../src/ui/audio.ts');
const { createMotion } = await import('../src/ui/motion.ts');
const event = (seq, type, extra = {}) => ({ seq, type, ...extra });
const jace = { id: 7, name: 'Jace Beleren', planeswalker: true, manaCost: '{1}{U}{U}', counters: { LOYALTY: 5 } };
const loyalty = (cost, extra = {}) => event(2, 'ability-activated', { card: jace, sourceId: 7, actor: 1, loyalty: true, cost, text: 'Jace Beleren - Each player draws a card.', ...extra });

test('the planeswalker glow follows its mana colors', () => {
  assert.equal(walkerTone({ manaCost: '{1}{U}{U}' }), '#6fb8ff');
  assert.equal(walkerTone({ manaCost: '{U}{B}{B}{B}{R}' }), '#f2b54c', 'more than one color is gold');
  assert.equal(walkerTone({ manaCost: '{7}' }), '#dfe6ee', 'colorless is silver');
  assert.equal(walkerTone(undefined), '#dfe6ee');
});

test('only a planeswalker arriving (not a blink or a batch) gets the arrival effect', () => {
  assert.equal(walkerArrives(event(1, 'entered', { card: jace, from: 'Stack' })), true);
  assert.equal(walkerArrives(event(1, 'entered', { card: jace, from: 'Exile' })), false);
  assert.equal(walkerArrives(event(1, 'entered', { card: { id: 3, name: 'Grizzly Bears' }, from: 'Stack' })), false);
  assert.equal(walkerArrives(event(1, 'entered', { card: jace, entries: [jace, { ...jace, id: 8 }] })), false);
});

test('loyalty abilities read their printed cost, with a real minus sign, and the ultimate', () => {
  assert.deepEqual(loyaltyLook(loyalty('+2')), { cost: '+2', tone: 'up', ultimate: false });
  assert.deepEqual(loyaltyLook(loyalty('-3')), { cost: '−3', tone: 'down', ultimate: false });
  assert.deepEqual(loyaltyLook(loyalty('0')), { cost: '0', tone: 'zero', ultimate: false });
  assert.deepEqual(loyaltyLook(loyalty('-10', { ultimate: true })), { cost: '−10', tone: 'down', ultimate: true });
  assert.equal(loyaltyLook(event(2, 'ability-activated', { card: jace })), null, 'other abilities are left alone');
  assert.equal(loyaltyLook(event(2, 'damage', { loyalty: true, delta: -3 })), null, 'damage to a planeswalker is not an ability');
});

test('the loyalty paid as a cost is shown by the ability, not as a separate counter sound', () => {
  const timeline = new PresentationTimeline(); timeline.ingest('a', []);
  timeline.ingest('a', [event(1, 'counters', { counter: 'LOYALTY', delta: 2, paid: true, card: jace }), loyalty('+2', { seq: 2 })]);
  const entries = []; let entry;
  while ((entry = timeline.advance())) entries.push(entry);
  assert.deepEqual(entries.map(e => e.event.type), ['ability-activated']);
});

test('the arrival and the ultimate get a little more time, without holding the game', () => {
  const plain = presentationDuration(event(1, 'entered', { card: { id: 3 } }), false);
  const arrival = presentationDuration(event(1, 'entered', { card: jace, from: 'Stack' }), false);
  assert.ok(arrival > plain && arrival <= 600);
  assert.equal(presentationDuration(event(1, 'entered', { card: jace, from: 'Exile' }), false), plain);
  assert.ok(presentationDuration(loyalty('-10', { ultimate: true }), false) > presentationDuration(loyalty('-1'), false));
  assert.ok(calloutDuration(loyalty('-10', { ultimate: true }), false) > calloutDuration(loyalty('-1'), false));
});

test('planeswalkers have their own sounds, and the ultimate plays the loyalty one lower and louder', () => {
  assert.ok(SOUND_FILES.walker && SOUND_FILES.loyalty);
  assert.equal(soundForEvent(event(1, 'entered', { card: jace, from: 'Stack' })), 'walker');
  assert.equal(soundForEvent(event(1, 'entered', { card: jace, from: 'Exile' })), 'blink');
  assert.equal(soundForEvent(loyalty('+2')), 'loyalty');
  assert.equal(soundForEvent(event(2, 'ability-activated', { card: jace })), 'ability');
  const normal = soundVariation(loyalty('-10'), 'm', 1), ultimate = soundVariation(loyalty('-10', { ultimate: true }), 'm', 1);
  assert.ok(ultimate.rate < normal.rate * .85);
  assert.ok(ultimate.gain > normal.gain * 1.2);
  assert.equal(new AudioEventMix().level(event(1, 'entered', { card: jace }), 'm'), 1, 'the arrival is not played softer like other permanents');
});

function motionFixture(reduce) {
  const animated = [], nodes = [];
  class Element {
    constructor(rect = { left: 0, top: 0, width: 80, height: 112 }) {
      this.rect = rect; this.children = []; this.classes = new Set(); this.className = '';
      this.style = { setProperty: (k, v) => { this.style[k] = v; } };
      this.classList = { add: c => this.classes.add(c), remove: (...cs) => cs.forEach(c => this.classes.delete(c)) };
    }
    getBoundingClientRect() { return this.rect; }
    setAttribute() {}
    append(...children) { this.children.push(...children); }
    remove() { this.removed = true; }
    animate(frames, options) { animated.push({ element: this, frames, options }); return { cancel() {} }; }
    closest() { return null; }
    querySelector(selector) { return selector === ':scope > .pt.loyalty' ? this.badge ?? null : null; }
  }
  const arena = new Element({ left: 0, top: 0, width: 1280, height: 800 });
  const card = new Element({ left: 420, top: 300, width: 80, height: 112 });
  card.badge = new Element({ left: 470, top: 390, width: 22, height: 20 });
  globalThis.window = { matchMedia: () => ({ matches: reduce }) };
  globalThis.innerWidth = 1280; globalThis.innerHeight = 800;
  globalThis.document = { hidden: false, createElement: () => { const el = new Element(); nodes.push(el); return el; } };
  const root = { hidden: false, firstElementChild: arena, getBoundingClientRect: () => arena.rect,
    querySelector: selector => selector === '.field [data-fid="7"]' ? card : selector === '.arena' ? arena : null, querySelectorAll: () => [] };
  return { motion: createMotion(root), card, arena, animated, nodes };
}
const show = (f, e) => f.motion.present(e, { you: 1, html: '<div class="face"></div>', label: 'Você usou +2 de Jace Beleren.', duration: 1000, calloutDuration: 2000 });
const number = f => f.nodes.find(n => n.className.startsWith('damage-number'));

test('a loyalty ability bumps the shield, floats the cost and shows it in the callout', () => {
  const f = motionFixture(false);
  show(f, loyalty('+2'));
  assert.equal(number(f).className, 'damage-number loyalty-cost up');
  assert.equal(number(f).children.find(c => c.textContent && !c.className).textContent, '+2');
  assert.ok(f.card.badge.classes.has('loyalty-up'));
  assert.ok(f.card.classes.has('walker-glow'));
  assert.equal(f.card.style['--walker'], '#6fb8ff');
  assert.ok(f.animated.some(a => a.element === f.card.badge));
  const note = f.nodes.find(n => n.className.startsWith('ability-callout'));
  assert.equal(note.className, 'ability-callout loyalty up');
  assert.equal(note.children[0].textContent, '+2');
  assert.equal(note.children[1].children[0].textContent, 'Each player draws a card.', 'the card name is not repeated');
  assert.equal(f.nodes.some(n => n.className === 'walker-wave'), false, 'only the ultimate sends a wave');
  f.motion.reset();
});

test('the ultimate sends a wave across the table, with a bigger callout and number', () => {
  const f = motionFixture(false);
  show(f, loyalty('-10', { ultimate: true }));
  assert.ok(f.nodes.some(n => n.className === 'walker-wave'));
  assert.equal(number(f).className, 'damage-number loyalty-cost down heavy');
  assert.ok(f.nodes.find(n => n.className.startsWith('ability-callout')).className.includes('ultimate'));
  assert.ok(f.animated.some(a => a.element === f.arena), 'the table shakes a little');
  f.motion.reset();
});

test('with reduced motion the loyalty ability keeps only the number and the shield color', () => {
  const f = motionFixture(true);
  show(f, loyalty('-10', { ultimate: true }));
  assert.equal(f.animated.length, 0);
  assert.equal(f.nodes.some(n => n.className === 'walker-wave'), false);
  assert.ok(number(f));
  assert.ok(f.card.badge.classes.has('loyalty-down'));
  f.motion.reset();
});

test('a planeswalker landing lights its frame and raises the shield; reduced motion keeps only the frame', async () => {
  for (const reduce of [false, true]) {
    const f = motionFixture(reduce);
    f.motion.present(event(1, 'entered', { card: jace, from: 'Stack', actor: 1 }), { you: 1, html: '<div class="face"></div>', label: 'Jace Beleren entrou no campo.', duration: 20 });
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.ok(f.card.classes.has('walker-glow'));
    assert.equal(f.nodes.some(n => n.className === 'walker-ring'), !reduce);
    assert.equal(f.animated.some(a => a.element === f.card.badge), !reduce);
    f.motion.reset();
  }
});
