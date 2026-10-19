// Real-engine regression: node forge-bridge/scripts/test-damage-events.mjs ws://127.0.0.1:7182/ws
// Damage events carry what the table needs for the Arena-style effects: direct vs combat damage, the combat step,
// double strike in both steps, lifelink followed by the controller's life gain, and a destroyed creature leaving with its reason.
import assert from 'node:assert/strict';

const endpoint = process.argv[2] || 'ws://127.0.0.1:7182/ws';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const ws = new WebSocket(endpoint);
const actions = new Map();
const events = new Map();
let state, failure;
const send = value => ws.send(JSON.stringify(value));
const once = value => {
  const key = JSON.stringify(value);
  if (Date.now() - (actions.get(key) || 0) > 1700) { actions.set(key, Date.now()); send(value); }
};
ws.addEventListener('message', ({data}) => {
  const message = JSON.parse(data);
  if (['error', 'validation-error'].includes(message.type)) failure = new Error(JSON.stringify(message));
  if (message.type === 'state') { state = message; for (const e of message.events ?? []) events.set(e.seq, e); }
});
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, {once: true}); ws.addEventListener('error', reject, {once: true}); });

const own = () => state?.players.find(p => p.id === state.you);
const opponent = () => state?.players.find(p => p.id !== state.you);
const damage = () => [...events.values()].filter(e => e.type === 'damage');
const mine = e => e.actor === state.you;

function advance() {
  const { input, question } = state;
  if (question) {
    once(question.kind === 'confirm' ? {type: 'answer', id: question.id, value: true}
      : question.kind === 'text' ? {type: 'answer', id: question.id, text: question.initial || '0'}
        : {type: 'answer', id: question.id, indices: Array.from({length: question.kind === 'order' ? question.options.length : Math.max(0, question.min ?? 1)}, (_, i) => i)});
  } else if (['play-draw', 'mulligan'].includes(input.opening) && input.ok.enabled) once({type: 'ok', gen: input.gen});
  else if (input.targeting || input.selectablePlayers?.length) {
    // Lightning Bolt: an opposing creature when there is one, otherwise the opponent.
    const creature = opponent().battlefield.find(c => c.creature && input.selectable.includes(c.id));
    if (creature) once({type: 'card', id: creature.id, gen: input.gen});
    else if (input.selectablePlayers?.includes(opponent().id)) once({type: 'player', id: opponent().id, gen: input.gen});
    else if (input.ok.enabled) once({type: 'ok', gen: input.gen});
  } else if (input.paying && input.ok.enabled) once({type: 'ok', gen: input.gen});
  else if (input.attacking) {
    const ready = input.attacking.attackers.find(id => !state.combat.some(pair => pair.attacker === id));
    if (ready) once({type: 'card', id: ready, gen: input.gen});
    else once({type: 'ok', gen: input.gen});
  } else if (input.priority && input.ok.enabled) {
    const main = state.activePlayer === state.you && state.phase === 'MAIN1';
    const playable = c => input.actionable.includes(c.id);
    const land = own().hand.find(c => c.land && playable(c));
    const creature = own().hand.find(c => c.creature && playable(c));
    const bolt = own().hand.find(c => c.name === 'Lightning Bolt' && playable(c));
    const boltWanted = damage().filter(e => mine(e) && !e.combat).length < 2;
    const murder = !destroyed() && opponent().battlefield.some(c => c.creature) && own().hand.find(c => c.name === 'Murder' && playable(c));
    if (main && land) once({type: 'card', id: land.id, gen: input.gen});
    else if (murder) once({type: 'card', id: murder.id, gen: input.gen});
    else if (main && bolt && boltWanted && state.turn > 2) once({type: 'card', id: bolt.id, gen: input.gen});
    else if (main && creature) once({type: 'card', id: creature.id, gen: input.gen});
    else once({type: 'ok', gen: input.gen});
  } else if (input.ok.enabled) once({type: 'ok', gen: input.gen});
  else if (state.phase === 'CLEANUP' && input.selectable.length) once({type: 'card', id: input.selectable[0], gen: input.gen});
}

const doubled = () => {
  const hits = damage().filter(e => mine(e) && e.combat && e.doubleStrike);
  return hits.some(a => a.step === 'first-strike' && hits.some(b => b.sourceId === a.sourceId && b.step === 'regular' && b.seq > a.seq));
};
const lifelinked = () => damage().some(e => mine(e) && e.lifelink && [...events.values()].some(l => l.type === 'life-changed' && l.actor === state.you && l.delta > 0 && l.seq > e.seq));
const destroyed = () => [...events.values()].find(e => e.type === 'left' && e.reason === 'destroyed');
const done = () => !!destroyed() && damage().some(e => mine(e) && !e.combat) && damage().some(e => mine(e) && e.combat && e.step === 'regular') && doubled() && lifelinked();

try {
  send({type: 'start', config: {format: 'free', matchLength: 'bo1'},
    you: {name: 'Dano', cards: [{name: 'Mountain', count: 7}, {name: 'Plains', count: 7}, {name: 'Swamp', count: 7}, {name: 'Lightning Bolt', count: 5}, {name: 'Murder', count: 5}, {name: 'Fencing Ace', count: 8}, {name: "Healer's Hawk", count: 8}]},
    opponent: {name: 'Floresta', cards: [{name: 'Forest', count: 34}, {name: 'Grizzly Bears', count: 6}]}});
  const deadline = Date.now() + 420000;
  while (!done()) {
    if (failure) throw failure;
    if (Date.now() > deadline || state?.gameOver) throw new Error(`damage events: ${JSON.stringify({turn: state?.turn, phase: state?.phase, damage: damage().map(({frame, card, ...e}) => ({...e, card: card?.name}))})}`);
    if (state) advance();
    await wait(60);
  }
  const bolt = damage().find(e => mine(e) && !e.combat);
  assert.equal(bolt.card.name, 'Lightning Bolt'); assert.equal(bolt.delta, -3); assert.equal(bolt.step, undefined);
  assert.ok(bolt.frame, 'damage carries the public frame');
  const swing = damage().find(e => mine(e) && e.combat && e.step === 'regular');
  const murdered = destroyed();
  assert.equal(murdered.to, 'Graveyard'); assert.equal(murdered.card.name, 'Grizzly Bears');
  console.log(`PASS direct damage: ${bolt.card.name} ${bolt.delta} combat=${bolt.combat}`);
  console.log(`PASS combat damage: ${swing.card.name} ${swing.delta} step=${swing.step}`);
  console.log('PASS double strike: first-strike and regular hits from the same Fencing Ace');
  console.log("PASS lifelink: Healer's Hawk damage followed by your life gain");
  console.log(`PASS destroyed: ${murdered.card.name} left for the ${murdered.to} with reason ${murdered.reason}`);
} finally {
  if (ws.readyState === WebSocket.OPEN) { send({type: 'leave'}); await wait(200); }
  ws.close();
}
