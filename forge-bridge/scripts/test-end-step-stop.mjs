// Real-engine regression: node forge-bridge/scripts/test-end-step-stop.mjs ws://127.0.0.1:7172/ws
// "Passar respostas" checked: the same instants never stop the opponent's turn.
// With an instant and untapped mana, the player gets priority in the opponent's end step.
// An opponent that doesn't attack doesn't stop us after attacks; with nothing usable (only lands), the opponent's turn passes without asking anything.
import assert from 'node:assert/strict';

const endpoint = process.argv[2] || 'ws://127.0.0.1:7172/ws';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Plays until the opponent's second turn ends; returns the phases where we got priority on their turns. */
async function opponentStops(you, preferences) {
  const ws = new WebSocket(endpoint);
  let state, failure;
  const sent = new Map();
  const once = value => {
    const key = JSON.stringify(value);
    if (Date.now() - (sent.get(key) || 0) > 1700) { sent.set(key, Date.now()); ws.send(key); }
  };
  ws.addEventListener('message', ({data}) => {
    const message = JSON.parse(data);
    if (['error', 'validation-error'].includes(message.type)) failure = new Error(JSON.stringify(message));
    if (message.type === 'state') state = message;
  });
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, {once: true}); ws.addEventListener('error', reject, {once: true}); });
  const stops = [];
  try {
    ws.send(JSON.stringify({type: 'start', config: {format: 'free', matchLength: 'bo1'}, you, opponent: {name: 'Idle', cards: [{name: 'Forest', count: 60}]}}));
    const deadline = Date.now() + 240000;
    let theirTurns = 0, lastTurn = 0;
    while (theirTurns < 3) {
      if (failure) throw failure;
      assert.ok(Date.now() < deadline && !state?.gameOver, `timeout: ${JSON.stringify({turn: state?.turn, phase: state?.phase})}`);
      await wait(60);
      if (!state) continue;
      if (preferences && state.preferences?.passResponses !== preferences.passResponses) { once({type: 'preferences', ...preferences}); continue; }
      const theirs = state.activePlayer !== state.you;
      if (state.turn !== lastTurn) { lastTurn = state.turn; if (theirs) theirTurns++; }
      const { input, question } = state;
      if (question) {
        once(question.kind === 'confirm' ? {type: 'answer', id: question.id, value: true}
          : {type: 'answer', id: question.id, indices: Array.from({length: question.kind === 'order' ? question.options.length : Math.max(0, question.min ?? 1)}, (_, i) => i)});
      } else if (input.priority && input.ok.enabled) {
        const key = `${state.turn}:${state.phase}`;
        if (theirs && !stops.includes(key)) stops.push(key);
        const own = state.players.find(p => p.id === state.you);
        const land = own.hand.find(card => card.land && input.actionable.includes(card.id));
        if (!theirs && state.phase === 'MAIN1' && land) once({type: 'card', id: land.id, gen: input.gen});
        else once({type: 'ok', gen: input.gen});
      } else if (input.ok.enabled) once({type: 'ok', gen: input.gen});
      else if (state.phase === 'CLEANUP' && input.selectable.length) once({type: 'card', id: input.selectable[0], gen: input.gen});
    }
    return stops.map(key => key.split(':')[1]);
  } finally {
    if (ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({type: 'leave'})); await wait(200); }
    ws.close();
  }
}

const withInstant = await opponentStops({name: 'Instants', cards: [{name: 'Mountain', count: 30}, {name: 'Lightning Bolt', count: 30}]});
assert.ok(withInstant.includes('END_OF_TURN'), `priority in the opponent's end step: ${withInstant}`);
assert.ok(!withInstant.includes('COMBAT_DECLARE_ATTACKERS'), `no stop after attacks when nobody attacked: ${withInstant}`);
const landsOnly = await opponentStops({name: 'Lands', cards: [{name: 'Mountain', count: 60}]});
assert.deepEqual(landsOnly, [], 'nothing usable: no stops on the opponent\'s turn');
const passing = await opponentStops({name: 'Instants', cards: [{name: 'Mountain', count: 30}, {name: 'Lightning Bolt', count: 30}]}, {passResponses: true});
assert.deepEqual(passing, [], '"Passar respostas" checked: no stops on the opponent\'s turn even holding instants');
console.log('ok: opponent end step stops', withInstant.join(', '));
