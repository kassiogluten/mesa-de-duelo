// Real-engine regression: node forge-bridge/scripts/test-removal-source.mjs ws://127.0.0.1:7171/ws
// A permanent destroyed while a spell resolves (Fatal Push) leaves with that spell's `stackId` and `sourceName`, and the
// spell is in the frame's stack with its controller. A creature that dies afterwards, from state-based actions
// (Disfigure's -2/-2), leaves without `stackId`, right after the spell's `resolved`: the table uses that resolution.
import assert from 'node:assert/strict';

const endpoint = process.argv[2] || 'ws://127.0.0.1:7171/ws';
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
const history = () => [...events.values()].sort((a, b) => a.seq - b.seq);
const removed = by => history().find(e => e.type === 'left' && e.actor === opponent().id && e.card?.creature && by(e));
const pushed = () => removed(e => e.sourceName === 'Fatal Push');
const disfigured = () => removed(e => e.stackId === undefined);
const AFTERMATH = new Set(['left', 'damage', 'life-changed', 'entered', 'mill', 'discard', 'draw']);

function advance() {
  const { input, question } = state;
  if (question) {
    once(question.kind === 'confirm' ? {type: 'answer', id: question.id, value: true}
      : {type: 'answer', id: question.id, indices: Array.from({length: question.kind === 'order' ? question.options.length : Math.max(0, question.min ?? 1)}, (_, i) => i)});
  } else if (['play-draw', 'mulligan'].includes(input.opening) && input.ok.enabled) once({type: 'ok', gen: input.gen});
  else if (input.paying && input.ok.enabled) once({type: 'ok', gen: input.gen});
  else if (input.targeting) {
    const creature = opponent().battlefield.find(c => c.creature && input.selectable.includes(c.id));
    if (creature) once({type: 'card', id: creature.id, gen: input.gen});
    else once({type: 'cancel', gen: input.gen});
  }
  else if (input.attacking || input.blocking) once({type: 'ok', gen: input.gen});
  else if (input.priority && input.ok.enabled) {
    const main = state.activePlayer === state.you && state.phase === 'MAIN1';
    const playable = c => input.actionable.includes(c.id);
    const land = own().hand.find(c => c.land && playable(c));
    const target = opponent().battlefield.some(c => c.creature);
    const spell = name => own().hand.find(c => c.name === name && playable(c));
    const next = !pushed() ? spell('Fatal Push') : !disfigured() ? spell('Disfigure') : null;
    if (main && land) once({type: 'card', id: land.id, gen: input.gen});
    else if (main && target && next) once({type: 'card', id: next.id, gen: input.gen});
    else once({type: 'ok', gen: input.gen});
  } else if (input.ok.enabled) once({type: 'ok', gen: input.gen});
  else if (state.phase === 'CLEANUP' && input.selectable.length) once({type: 'card', id: input.selectable[0], gen: input.gen});
}

try {
  send({type: 'start', config: {format: 'free', matchLength: 'bo1'},
    you: {name: 'Remoção', cards: [{name: 'Swamp', count: 20}, {name: 'Fatal Push', count: 10}, {name: 'Disfigure', count: 10}]},
    opponent: {name: 'Floresta', cards: [{name: 'Forest', count: 24}, {name: 'Grizzly Bears', count: 16}]}});
  const deadline = Date.now() + 300000;
  while (!pushed() || !disfigured()) {
    if (failure) throw failure;
    if (Date.now() > deadline || state?.gameOver) throw new Error(`removal source: ${JSON.stringify({turn: state?.turn, phase: state?.phase, over: state?.gameOver, players: state?.players.map(p => [p.name, p.life, p.library, p.hand?.map(c => c.name), p.battlefield.map(c => c.name)]), left: history().filter(e => e.type === 'left').map(({frame, ...e}) => e)})}`);
    if (state) advance();
    await wait(60);
  }
  const push = pushed();
  assert.equal(push.reason, 'destroyed');
  const item = push.frame?.stack?.find(entry => entry.id === push.stackId);
  assert.ok(item, 'the resolving spell is in the frame stack');
  assert.equal(item.controller, state.you);
  assert.equal(item.source?.name, 'Fatal Push');
  console.log(`PASS during resolution: ${push.card.name} left with stackId ${push.stackId} from ${push.sourceName}`);

  const death = disfigured();
  const list = history();
  let before = list.findIndex(e => e.seq === death.seq) - 1;
  while (before >= 0 && AFTERMATH.has(list[before].type) && list[before].type !== 'resolved') before--;
  assert.equal(list[before]?.type, 'resolved', JSON.stringify(list.slice(Math.max(0, before - 2), before + 3).map(({frame, ...e}) => e)));
  assert.equal(list[before].card?.name, 'Disfigure');
  assert.equal(list[before].actor, state.you);
  console.log(`PASS after resolution: ${death.card.name} died right after ${list[before].card.name} resolved`);
} finally {
  if (ws.readyState === WebSocket.OPEN) { send({type: 'leave'}); await wait(200); }
  ws.close();
}
