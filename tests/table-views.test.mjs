// Peças de HTML da mesa que saíram da forgeTable.ts: pilha, perguntas, fim de jogo, caixa de ação, zonas e a casca.
import test from 'node:test';
import assert from 'node:assert/strict';
const { stackPanel, stackGalleryHTML } = await import('../src/ui/stackView.ts');
const { amountStatus, missingPicks, newQuestionDraft, questionHTML, questionBar, zoneName, zoneWithArticle } = await import('../src/ui/questionView.ts');
const { gameResult, rematchButton, reconnectingHTML, disconnectedHTML } = await import('../src/ui/resultView.ts');
const { sideboardHTML } = await import('../src/ui/sideboardView.ts');
const { actionIconHTML } = await import('../src/ui/actionIcons.ts');
const { attackConfirmLabel, blockConfirmLabel, buttons, targetInfoHTML, targetInfoText } = await import('../src/ui/actionPanel.ts');
const { commanderLedgerHTML, zoneHTML, zoneKey } = await import('../src/ui/zoneView.ts');
const { tableShellHTML } = await import('../src/ui/tableShell.ts');

const face = c => `<i class="face">${c.name}</i>`;
const card = (id, name, extra = {}) => ({ id, name, tapped: false, token: false, ...extra });
function state(input = {}, extra = {}) {
  return { type: 'state', you: 0, turn: 3, activePlayer: 0, gameOver: false, stack: [], combat: [],
    players: [{ id: 0, name: 'Você', battlefield: [], graveyard: [], exile: [], hand: [] }, { id: 1, name: 'Ana', battlefield: [], graveyard: [], exile: [], hand: [] }],
    input: { gen: 7, priority: false, selectable: [], selectablePlayers: [], selectableStacks: [], ok: { enabled: false, label: '' }, cancel: { enabled: false, label: '' }, message: '', ...input }, ...extra };
}

test('stack pile: the top card resolves first, and a replay only offers to inspect', () => {
  const s = state({}, { stack: [{ id: 5, controller: 1, kind: 'spell', text: 'Causa 2 de dano.', source: card(50, 'Shock') }] });
  const view = { face, label: c => c.name, ptText: () => undefined, playerName: id => (id === 1 ? 'Ana' : 'você'), you: 0, targetsText: () => '' };
  const live = stackPanel(view, s, false, { minimized: false, galleryOpen: false });
  assert.match(live, /data-ui="stack-open"/);
  assert.match(live, /Resolve primeiro/);
  assert.match(live, /aria-label="Recolher a pilha/);
  assert.match(stackPanel(view, s, true, { minimized: true, galleryOpen: false }), /data-ui="stack-replay"[\s\S]*Jogada recente/);
  const gallery = stackGalleryHTML(view, { ...s, input: { ...s.input, selectableStacks: [5] } });
  assert.match(gallery, /Selecionar como alvo/);
  assert.match(gallery, /<i class="face">Shock<\/i>/);
});

test('question drafts start from the option minimums and amounts must add up to the total', () => {
  const q = { id: 3, kind: 'amount', title: 'Distribua', total: 3, options: [{ label: 'Ana', min: 1 }, { label: 'Bia' }] };
  const draft = newQuestionDraft(q);
  assert.deepEqual(draft, { id: 3, picked: [], text: '', amounts: ['1', '0'] });
  assert.equal(amountStatus(q, draft).text, 'Restante: 2.');
  assert.equal(amountStatus(q, { ...draft, amounts: ['1', '2'] }).valid, true);
  assert.equal(amountStatus(q, { ...draft, amounts: ['3', '2'] }).text, 'Excesso: 2.');
  assert.equal(amountStatus(q, { ...draft, amounts: ['0', '3'] }).text, 'Respeite os limites indicados para cada alvo.');
  assert.equal(zoneName('Graveyard'), 'Cemitério');
  assert.equal(zoneWithArticle('Hand'), 'a mão');
  assert.equal(zoneName('Sideboard'), 'Sideboard');
});

test('yes/no questions get one button each, and the minimized bar shows how many were chosen', () => {
  const view = { face, label: c => c.name, ptName: () => undefined, ptType: () => undefined, ptText: () => undefined, playerName: () => 'Ana', players: [],
    piles: { face, label: c => c.name, playerName: () => 'Ana', you: 0 }, choiceSort: 'type', choiceView: () => ({}), damageSplit: () => [], triggerOrder: () => ({}) };
  const confirm = { id: 1, kind: 'confirm', title: 'Pagar?', options: ['Sim', 'Não'] };
  const html = questionHTML(view, confirm, newQuestionDraft(confirm));
  assert.match(html, /data-q-confirm="true">Sim/);
  assert.match(html, /data-q-confirm="false">Não/);
  const choose = { id: 2, kind: 'choose', title: 'Escolha', min: 1, max: 3, options: ['A', 'B', 'C', 'D'] };
  assert.match(questionBar(view, choose, 2), /2 de 3 escolhidas/);
  assert.match(questionBar(view, choose, 2), /data-ui="question-restore"/);
  // Escolha de várias: selo x/y ao lado do Confirmar (verde quando vale), Confirmar sempre tocável e marcar/desmarcar todas.
  const empty = questionHTML(view, choose, newQuestionDraft(choose));
  assert.match(empty, /class="q-pick-count" id="fQPickCount"[^>]*>0<small>\/ 3<\/small>/);
  assert.match(empty, /data-q-submit>Confirmar/);
  assert.match(empty, /data-q-all>Selecionar todas/);
  const full = questionHTML(view, choose, { ...newQuestionDraft(choose), picked: [0, 1, 2] });
  assert.match(full, /class="q-pick-count ok"/);
  assert.match(full, /data-q-all>Desmarcar todas/);
  assert.equal(missingPicks({ ...choose, min: 2 }, 1), 1);
  assert.equal(missingPicks(choose, 1), 0);
  // Reordenar o cemitério (Fossil Find): a primeira escolhida vai para o fundo, e a dica diz isso.
  const order = { id: 3, kind: 'order', title: 'Escolha a ordem', options: ['A', 'B'] };
  assert.match(questionHTML(view, order, newQuestionDraft(order)), /a primeira fica em cima/);
  const graveyard = { ...order, firstAt: 'bottom' };
  assert.match(questionHTML(view, graveyard, newQuestionDraft(graveyard)), /a primeira fica embaixo/);
});

test('game result: winner, loser, watchers and the rematch button', () => {
  const over = (extra = {}) => state({}, { gameOver: true, turn: 9, ...extra });
  assert.deepEqual(gameResult(over({ winner: 'Você' })), { tone: 'win', title: 'Vitória', detail: 'Turno 9 · Você venceu' });
  assert.equal(gameResult(over({ winner: 'Ana' })).title, 'Derrota');
  assert.equal(gameResult(over({ winner: 'Ana', watching: true })).title, 'Ana venceu');
  assert.match(rematchButton(over()), /Jogar de novo/);
  const room = { seat: 0, players: [{ name: 'Você', connected: true }, { name: 'Ana', connected: true, rematch: true }] };
  assert.match(rematchButton(over({ room })), /Aceitar revanche/);
  assert.match(reconnectingHTML(2), /tentativa 2/);
  assert.match(disconnectedHTML(undefined, true), /Reconectar/);
  assert.doesNotMatch(reconnectingHTML(1) + disconnectedHTML(undefined, false), /ponte/i);
});

test('sideboard panel locks the moves while the server checks the list', () => {
  const s = state({}, { gameOver: true, sideboarding: { id: 1, ready: false, main: [], sideboard: [] }, match: { gameNumber: 1, wins: [1, 0] } });
  const draft = { id: 1, main: [{ name: 'Forest', count: 2 }], sideboard: [] };
  const html = sideboardHTML(s, draft, { error: '', busy: true, details: '', filter: { text: '', type: '' }, ptName: n => n, feedback: false });
  assert.match(html, /Deck principal <b>2<\/b>/);
  assert.match(html, /Verificando…/);
  assert.match(html, /data-sb-move="main" data-sb-key="Forest"[^>]*disabled/);
  assert.match(html, /Entram 2/);
  assert.match(html, /data-sb-reset disabled/);
});

test('action box: confirm labels, the result button when observing, and the target panel', () => {
  assert.equal(attackConfirmLabel(0), 'Não atacar');
  assert.equal(attackConfirmLabel(2), 'Confirmar 2 atacantes');
  const s = state({}, { players: [{ id: 0, name: 'Você', battlefield: [card(10, 'Bear')] }, { id: 1, name: 'Ana', battlefield: [] }], combat: [{ attacker: 20, blockers: [10] }] });
  assert.equal(blockConfirmLabel(s), 'Confirmar 1 bloqueador');
  assert.equal(blockConfirmLabel({ ...s, combat: [] }), 'Sem bloqueio');
  const view = { findCard: () => undefined, playerName: () => 'Ana', observing: true, disconnected: false, clickLocked: () => false,
    passLevel: 'acoes', passLevelSupported: true, passingTurn: false, passPending: false, passMenuOpen: false, attackAll: false, attackSelecting: 0, attackBusy: false };
  assert.match(buttons(view, state({}, { gameOver: true, winner: 'Você' })), /Vitória · Jogo encerrado[\s\S]*data-ui="result"/);
  assert.match(buttons(view, state({}, { spectating: true })), /Você foi eliminado/);
  // O destaque (o último, embaixo) é sempre o próximo passo; "Fim de turno" fica secundário em qualquer fase.
  const playing = { ...view, observing: false };
  for (const phase of ['MAIN1', 'COMBAT_END', 'MAIN2']) {
    const html = buttons(playing, state({ priority: true, ok: { enabled: true, label: 'OK' }, cancel: { enabled: true, label: 'Fim de turno' } }, { phase }));
    assert.match(html, /arena-btn secondary" data-act="pass-turn"[\s\S]*arena-btn primary" data-act="ok"/, phase);
    assert.doesNotMatch(html, /arena-btn primary" data-act="pass-turn"/, phase);
  }
  const info = { source: 'Shock', kind: 'Mágica', ability: 'Causa 2 de dano', progress: '1 de 2 alvos', chosen: ['Ana'] };
  assert.match(targetInfoHTML(info), /Marcado: Ana/);
  assert.equal(targetInfoText(info), 'Mágica de Shock: Causa 2 de dano. 1 de 2 alvos. Marcado: Ana.');
});

test('zone window: graveyard tabs per player, newest card first, and the commander damage ledger', () => {
  const s = state({}, { players: [
    { id: 0, name: 'Você', graveyard: [card(1, 'Forest'), card(2, 'Shock')], exile: [], battlefield: [], hand: [] },
    { id: 1, name: 'Ana', graveyard: [], exile: [], battlefield: [], hand: [], commanderDamage: [{ commanderId: 90, damage: 7 }], commanders: [] }] });
  const view = { face, findCard: () => undefined, targetHead: () => '', buttons: () => '' };
  const key = zoneKey('gy', 0, null);
  assert.equal(key, 'gy:0:');
  const html = zoneHTML(view, s, { kind: 'gy', player: s.players[0], groupIds: null, groupTitle: '', key });
  assert.match(html, /role="tablist"/);
  assert.ok(html.indexOf('Shock') < html.indexOf('Forest'));
  assert.match(html, /Cemitério · Você \(2\)/);
  assert.match(commanderLedgerHTML(s, s.players[1]), /7 \/ 21/);
});

test('table shell: every fixed part is there, and the optional buttons follow the options', () => {
  globalThis.document ??= { fullscreenEnabled: false }; // a casca pergunta se dá para pôr em tela cheia
  const plain = tableShellHTML({ feedback: false, download: false, buzz: false });
  for (const id of ['fAction', 'fHand', 'fStack', 'fQuestion', 'fZone', 'fRemoval', 'fVote', 'fSettings', 'fMenu']) assert.match(plain, new RegExp(`id="${id}"`));
  assert.match(plain, /data-ui="feedback" aria-haspopup="dialog" hidden/);
  assert.doesNotMatch(plain, /id="fBuzz"/);
  const full = tableShellHTML({ feedback: true, download: true, buzz: true });
  assert.match(full, /data-ui="feedback" aria-haspopup="dialog">/);
  assert.match(full, /id="fBuzz"/);
});

test('stack gallery: equal items in a row become one card with ×N, but an item you can target stays alone', () => {
  const view = { face, label: c => c.name, ptText: () => undefined, playerName: () => 'você', you: 0, targetsText: () => '' };
  const warden = id => ({ id, controller: 0, kind: 'trigger', text: 'Você ganha 1 de vida.', source: card(60 + id, 'Soul Warden') });
  const pridemate = { id: 9, controller: 0, kind: 'trigger', text: 'Coloque um marcador +1/+1.', source: card(70, "Ajani's Pridemate") };
  const s = state({}, { stack: [warden(1), warden(2), warden(3), pridemate, warden(4)] });
  const gallery = stackGalleryHTML(view, s);
  assert.equal((gallery.match(/class="stack-gallery-item/g) ?? []).length, 3);
  assert.match(gallery, /<b>1–3<\/b><span>3 iguais<\/span>/);
  assert.match(gallery, /stack-gallery-copies[^>]*>×3</);
  assert.match(gallery, /<b>5<\/b><span>5º na resolução/);
  // Um deles pode ser alvo: ele sai do grupo para ser escolhido.
  const targeting = stackGalleryHTML(view, { ...s, input: { ...s.input, selectableStacks: [2] } });
  assert.equal((targeting.match(/class="stack-gallery-item/g) ?? []).length, 5);
});

test('an optional trigger offers "always yes" and "always no" next to this time\'s yes and no', () => {
  const view = { findCard: () => undefined, playerName: () => 'Ana', observing: false, disconnected: false, clickLocked: () => false,
    passLevel: 'acoes', passLevelSupported: true, passingTurn: false, passPending: false, passMenuOpen: false, attackAll: false, attackSelecting: 0, attackBusy: false };
  const ask = { ok: { enabled: true, label: 'Sim' }, cancel: { enabled: true, label: 'Não' } };
  const html = buttons(view, state({ ...ask, triggerChoice: true }));
  assert.match(html, /data-act="cancel"[^>]*>(?:<span class="act-icon">.*?<\/span>)?Não<[\s\S]*data-act="cancel" data-always[^>]*>(?:<span class="act-icon">.*?<\/span>)?Sempre não<[\s\S]*data-act="ok" data-always[^>]*>(?:<span class="act-icon">.*?<\/span>)?Sempre sim<[\s\S]*arena-btn primary" data-act="ok"[^>]*>(?:<span class="act-icon">.*?<\/span>)?Sim</);
  assert.doesNotMatch(buttons(view, state(ask)), /data-always/);
});

test('each action button carries the icon of what it does, and a choice from the card stays without one', () => {
  const view = { findCard: () => undefined, playerName: () => 'Ana', observing: false, disconnected: false, clickLocked: () => false,
    passLevel: 'acoes', passLevelSupported: true, passingTurn: false, passPending: false, passMenuOpen: false, attackAll: false, attackSelecting: 0, attackBusy: false };
  const icon = (html, act) => html.match(new RegExp(`data-act="${act}"[^>]*>(<span class="act-icon">.*?</span>)?`))?.[1] ?? '';
  const turn = buttons(view, state({ priority: true, ok: { enabled: true, label: 'OK' }, cancel: { enabled: true, label: 'Fim de turno' } }, { phase: 'MAIN1' }));
  assert.equal(icon(turn, 'ok'), actionIconHTML('pass'));
  assert.equal(icon(turn, 'pass-turn'), actionIconHTML('endTurn'));
  assert.equal(icon(buttons(view, state({ ok: { enabled: true, label: 'Sim' }, cancel: { enabled: true, label: 'Não' } })), 'cancel'), actionIconHTML('cancel'));
  assert.equal(icon(buttons(view, state({ ok: { enabled: true, label: 'Cara' }, cancel: { enabled: true, label: 'Coroa' } })), 'ok'), '');
});
