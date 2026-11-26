import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { WELCOME_DECKS, welcomeDecks, welcomeDecksHTML, PERSONAL_EMPTY_COMPACT } = await import('../src/ui/welcomeView.ts');
const { lobbyHTML, personalShelfHTML } = await import('../src/ui/lobbyView.ts');

const starters = JSON.parse(readFileSync(new URL('../shared/starter-decks.json', import.meta.url), 'utf8'));
const all = Array.isArray(starters) ? starters : Object.values(starters).flat();

test('the welcome decks are ready Commander decks, each with its one-line plan', () => {
  assert.equal(WELCOME_DECKS.length, 4);
  for (const { id, plan } of WELCOME_DECKS) {
    const deck = all.find(d => d.id === id);
    assert.ok(deck, `${id} existe nos decks prontos`);
    assert.equal(deck.format, 'commander', `${id} é de Commander`);
    assert.match(plan, /^[A-ZÀ-Ú].+\.$/, `${id} tem uma frase`);
  }
  assert.deepEqual(welcomeDecks(all).map(w => w.deck.id), WELCOME_DECKS.map(w => w.id));
  assert.deepEqual(welcomeDecks([]), [], 'sem os decks, a faixa não tem o que mostrar');
});

test('the welcome band marks the chosen deck and plays from the same start action', () => {
  const html = welcomeDecksHTML(welcomeDecks(all), WELCOME_DECKS[0].id);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(html, new RegExp(`data-deck="${WELCOME_DECKS[0].id}" aria-pressed="true"`));
  const page = lobbyHTML();
  assert.match(page, /id="welcome"[^>]*hidden/, 'escondida até o lobby decidir');
  assert.match(page, /id="welcomeStart" data-lobby="start"/);
  for (const action of ['welcome-adjust', 'welcome-all', 'welcome-friends', 'import']) assert.match(page, new RegExp(`data-lobby="${action}"`));
});

test('an empty Meus decks shrinks to one line only while the welcome is shown', () => {
  const ctx = { selectedId: '', inRoom: false, format: 'commander', validity: () => '', ptName: n => n, filtering: false };
  assert.equal(personalShelfHTML([], 0, { ...ctx, compact: true }), PERSONAL_EMPTY_COMPACT);
  assert.match(personalShelfHTML([], 0, ctx), /Criar meu primeiro deck/);
});
