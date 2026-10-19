// Real-engine regression: node forge-bridge/scripts/test-extra-turns.mjs ws://127.0.0.1:7172/ws
// Extra turns (Time Walk) and extra combats (Relentless Assault) reach the table state.
// The goblins make each combat stop for the attack declaration, so the second one is seen.
import assert from 'node:assert/strict';

const endpoint = process.argv[2] || 'ws://127.0.0.1:7172/ws';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function session(you, opponent, body) {
  const ws = new WebSocket(endpoint);
  const actions = new Map();
  let failure;
  const ctx = { state: null };
  const send = value => ws.send(JSON.stringify(value));
  const once = value => {
    const key = JSON.stringify(value);
    if (Date.now() - (actions.get(key) || 0) > 1700) { actions.set(key, Date.now()); send(value); }
  };
  ws.addEventListener('message', ({data}) => {
    const message = JSON.parse(data);
    if (['error', 'validation-error'].includes(message.type)) failure = new Error(JSON.stringify(message));
    if (message.type === 'state') ctx.state = message;
  });
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, {once: true}); ws.addEventListener('error', reject, {once: true}); });
  const own = () => ctx.state?.players.find(player => player.id === ctx.state.you);
  const priority = () => ctx.state?.input.priority && ctx.state.input.ok.enabled && !ctx.state.question;
  function advance(cast) {
    const { input, question } = ctx.state;
    if (question) {
      once(question.kind === 'confirm' ? {type: 'answer', id: question.id, value: true}
        : question.kind === 'text' ? {type: 'answer', id: question.id, text: question.initial || '0'}
          : {type: 'answer', id: question.id, indices: Array.from({length: question.kind === 'order' ? question.options.length : Math.max(0, question.min ?? 1)}, (_, i) => i)});
    } else if (['play-draw', 'mulligan'].includes(input.opening) && input.ok.enabled) once({type: 'ok', gen: input.gen});
    else if (input.paying && input.ok.enabled) once({type: 'ok', gen: input.gen});
    else if (priority()) {
      const mine = ctx.state.activePlayer === ctx.state.you && ctx.state.phase === 'MAIN1';
      const land = own().hand.find(card => card.land && input.actionable.includes(card.id));
      const spell = cast && own().hand.find(card => cast(card) && input.actionable.includes(card.id));
      if (mine && land) once({type: 'card', id: land.id, gen: input.gen});
      else if (mine && spell) once({type: 'card', id: spell.id, gen: input.gen});
      else once({type: 'ok', gen: input.gen});
    } else if (input.ok.enabled) once({type: 'ok', gen: input.gen});
    else if (ctx.state.phase === 'CLEANUP' && input.selectable.length) once({type: 'card', id: input.selectable[0], gen: input.gen});
  }
  async function until(test, label, cast, timeout = 60000) {
    const deadline = Date.now() + timeout;
    while (!test()) {
      if (failure) throw failure;
      if (Date.now() > deadline || ctx.state?.gameOver) throw new Error(`${label}: ${JSON.stringify({turn: ctx.state?.turn, phase: ctx.state?.phase, question: ctx.state?.question, hand: own()?.hand.map(c => c.name)})}`);
      if (cast !== undefined && ctx.state) advance(cast);
      await wait(60);
    }
  }
  try {
    send({type: 'start', config: {format: 'free', matchLength: 'bo1'}, you, opponent});
    await body({ ctx, own, priority, until, send });
  } finally {
    if (ws.readyState === WebSocket.OPEN) { send({type: 'leave'}); await wait(200); }
    ws.close();
  }
}

await session({name: 'Extra turn', cards: [{name: 'Island', count: 8}, {name: 'Time Walk', count: 8}]},
  {name: 'Idle', cards: [{name: 'Forest', count: 60}]}, async ({ ctx, own, until }) => {
    let queued = false;
    await until(() => { if (ctx.state?.extraTurns?.includes(ctx.state.you)) queued = true; return queued; }, 'Time Walk queues an extra turn', card => card.name === 'Time Walk', 180000);
    const turn = ctx.state.turn;
    await until(() => ctx.state.turn > turn, 'the extra turn begins', () => false);
    assert.equal(ctx.state.activePlayer, ctx.state.you);
    assert.equal(ctx.state.extraTurn, true);
    console.log('PASS extra turn: queued after Time Walk, then flagged on your next turn');
  });

await session({name: 'Extra combat', cards: [{name: 'Mountain', count: 8}, {name: 'Relentless Assault', count: 8}, {name: 'Raging Goblin', count: 6}]},
  {name: 'Idle', cards: [{name: 'Forest', count: 60}]}, async ({ ctx, until }) => {
    await until(() => (ctx.state?.extraCombats ?? 0) > 0, 'Relentless Assault adds a combat', card => card.name === 'Raging Goblin' || (card.name === 'Relentless Assault' && ctx.state.phase === 'MAIN1'), 240000);
    assert.ok(ctx.state.extraCombatAfter?.includes(ctx.state.phase), JSON.stringify({phase: ctx.state.phase, after: ctx.state.extraCombatAfter}));
    await until(() => (ctx.state.combatNumber ?? 0) >= 2, 'second combat this turn', () => false);
    console.log(`PASS extra combat: pending after the main phase, then combat number ${ctx.state.combatNumber}`);
  });
