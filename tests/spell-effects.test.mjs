import test from 'node:test';
import assert from 'node:assert/strict';
import { PresentationTimeline, presentationDuration, cascadeTiming } from '../src/ui/presentationTimeline.ts';
import { boostPower, boostText, cascadeFan, COPIES_SHOWN } from '../src/ui/motionSpells.ts';
import { eventDescription } from '../src/ui/eventText.ts';
import { soundForEvent } from '../src/ui/audio.ts';

const YOU = 1, ANA = 2;
const v = { state: () => ({ you: YOU, players: [{ id: YOU, name: 'Você' }, { id: ANA, name: 'Ana' }] }), label: c => c.name, findCard: () => undefined, ptName: () => undefined };
const card = (id, name, extra = {}) => ({ id, name, ...extra });
/** Uma fila já começada (o primeiro pacote só alcança os eventos), pronta para receber `events`. */
function timeline(events) {
  const t = new PresentationTimeline();
  t.ingest('m', [{ seq: 1, type: 'turn', actor: ANA, turn: 1 }]);
  t.ingest('m', events.map((e, i) => ({ ...e, seq: i + 2 })));
  return t;
}

test('storm copies of the same spell become one step with the count; the original and other spells do not join', () => {
  const shot = n => ({ type: 'spell-cast', actor: ANA, card: card(n, 'Grapeshot'), ...(n > 10 ? { copy: true } : {}) });
  const t = timeline([shot(10), shot(11), shot(12), shot(13), { type: 'spell-cast', actor: ANA, card: card(20, 'Lightning Bolt'), copy: true }]);
  const steps = [];
  for (let e = t.advance(); e; e = t.advance()) steps.push(e.event);
  assert.deepEqual(steps.map(e => [e.card.name, e.copies ?? 0]), [['Grapeshot', 0], ['Grapeshot', 3], ['Lightning Bolt', 0]]);
  assert.equal(eventDescription(v, steps[1]), 'Ana criou 3 cópias de Grapeshot.');
  assert.equal(eventDescription(v, steps[2]), 'Ana copiou Lightning Bolt.');
  assert.ok(presentationDuration(steps[1], 1) > presentationDuration(steps[0], 1));
  assert.ok(COPIES_SHOWN >= 3);
});

test('kicker and X: the text says so, the number shown and the strength of the ring', () => {
  const cast = extra => ({ seq: 1, type: 'spell-cast', actor: ANA, card: card(1, 'Fireball'), ...extra });
  assert.equal(eventDescription(v, cast({ x: 6 })), 'Ana conjurou Fireball com X = 6.');
  assert.equal(eventDescription(v, cast({ kicked: true })), 'Ana conjurou Fireball com reforço.');
  assert.equal(eventDescription(v, cast({ kicked: true, x: 0 })), 'Ana conjurou Fireball com reforço e com X = 0.');
  assert.deepEqual(boostText({ x: 6, kicked: true }), { text: 'X = 6', badges: ['Reforço'] });
  assert.deepEqual(boostText({ kicked: true }), { text: 'Reforço', badges: [] });
  assert.deepEqual([boostPower({ kicked: true }), boostPower({ x: 0 }), boostPower({ x: 40 })], [3, 1, 10]);
});

test('survived, extra turn and cascade have a step, a text and a sound; phasing goes along with the next step', () => {
  const myr = card(5, 'Darksteel Myr');
  assert.equal(eventDescription(v, { seq: 1, type: 'survived', card: myr, actor: ANA, survived: 'indestructible' }), 'Darksteel Myr é indestrutível e ficou no campo.');
  assert.equal(eventDescription(v, { seq: 1, type: 'survived', card: myr, actor: ANA, survived: 'regenerated' }), 'Darksteel Myr se regenerou.');
  assert.equal(eventDescription(v, { seq: 1, type: 'turn', actor: ANA, extra: true }), 'Turno extra de Ana.');
  assert.ok(presentationDuration({ seq: 1, type: 'turn', extra: true }, 1) > presentationDuration({ seq: 1, type: 'turn' }, 1) * 2);
  const dig = { seq: 1, type: 'cascade', actor: ANA, dig: 'cascade', card: card(7, 'Bloodbraid Elf'), revealed: [card(8, 'Forest'), card(9, 'Lightning Bolt')], hit: 9, cast: true };
  assert.equal(eventDescription(v, dig), 'Cascata de Bloodbraid Elf: 2 cartas reveladas; Ana conjurou Lightning Bolt.');
  assert.equal(eventDescription(v, { ...dig, dig: 'discover', cast: false }), 'Descobrir de Bloodbraid Elf: 2 cartas reveladas; Ana encontrou Lightning Bolt.');
  assert.equal(eventDescription(v, { ...dig, hit: undefined, revealed: [card(8, 'Forest')] }), 'Cascata de Bloodbraid Elf: 1 carta revelada; nenhuma carta serviu.');
  assert.deepEqual(['survived', 'cascade', 'phased'].map(type => soundForEvent({ seq: 1, type })), ['shield', 'draw', 'blink']);
  const t = timeline([{ type: 'phased', actor: ANA, card: myr, out: true }, { type: 'phased', actor: ANA, card: card(6, 'Bears'), out: true }, { type: 'survived', card: myr, survived: 'indestructible' }, dig]);
  const first = t.advance();
  assert.ok(first.audioOnly);
  assert.equal(first.event.grouped.length, 2, 'the two permanents phase out together');
  assert.deepEqual([t.advance().event.type, t.advance().event.type], ['survived', 'cascade']);
  assert.ok(t.history.some(e => e.type === 'survived') && t.history.some(e => e.type === 'cascade'));
});

test('the cascade fan: at most 7 cards shown, centred, the last one (the hit) to the right; many cards take no longer than 7', () => {
  assert.equal(cascadeTiming(3, false).shown, 3);
  assert.equal(cascadeTiming(30, false).shown, 7);
  const many = { seq: 1, type: 'cascade', revealed: Array.from({ length: 30 }, (_, i) => card(i, 'Forest')) };
  const seven = { ...many, revealed: many.revealed.slice(0, 7) };
  assert.equal(presentationDuration(many, 1), presentationDuration(seven, 1));
  assert.ok(presentationDuration(many, 1) < 2200);
  const fan = cascadeFan(5, 60);
  assert.deepEqual(fan.map(p => p.dx), [-120, -60, 0, 60, 120]);
  assert.equal(fan[2].rot, 0);
  assert.ok(fan[0].dy > fan[1].dy && fan[1].dy > fan[2].dy);
});
