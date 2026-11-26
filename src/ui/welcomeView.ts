// Boas-vindas de quem ainda não jogou: o que é a mesa, quatro decks fáceis com o jeito de jogar e o botão de jogar.
import type { DeckData } from '../decks';
import { esc, pip } from './cardtext';
import { deckArt, deckColors } from './deckStats';
import './welcome.css';

/** Os decks prontos de Commander para começar, com uma frase de como cada um joga. O primeiro já vem escolhido. */
export const WELCOME_DECKS: readonly { id: string; plan: string }[] = [
  { id: 'commander-goblins', plan: 'Enche a mesa de goblins pequenos e ataca com todos juntos.' },
  { id: 'commander-dragoes', plan: 'Dragões enormes que voam por cima de tudo e queimam o caminho.' },
  { id: 'commander-vampiros', plan: 'Cada vampiro que você joga traz outro junto, e todos crescem ao atacar.' },
  { id: 'commander-anjos', plan: 'Anjos voadores que já entram mais fortes a cada anjo na mesa.' },
];

/** Os decks de boas-vindas que existem entre os decks da mesa, na ordem da lista. */
export function welcomeDecks(all: DeckData[]) {
  return WELCOME_DECKS.flatMap(w => { const deck = all.find(d => d.id === w.id); return deck ? [{ deck, plan: w.plan }] : []; });
}

/** O esqueleto da faixa; `welcomeDecksHTML` e o resumo preenchem a cada redesenho. */
export const WELCOME_HTML = `<section class="welcome" id="welcome" aria-labelledby="welcomeTitle" hidden>
  <span class="welcome-art" id="welcomeArt" aria-hidden="true"></span>
  <div class="welcome-head"><p class="welcome-eyebrow">Bem-vindo à Mesa de Duelo</p><h2 id="welcomeTitle">Jogue Magic no navegador, agora.</h2>
  <p class="welcome-lede">De graça e sem instalar. Escolha um deck pronto e enfrente o computador: a mesa cuida das regras para você.</p></div>
  <div class="welcome-pick"><h3>Escolha seu primeiro deck <small>Dá para trocar depois</small></h3><div class="welcome-decks" id="welcomeDecks"></div></div>
  <div class="welcome-go"><button type="button" class="arena-btn primary big replay-btn" id="welcomeStart" data-lobby="start">Jogar contra o computador</button><p class="welcome-summary"><span id="welcomeSummary"></span> · <button type="button" class="link-btn" data-lobby="welcome-adjust">Ajustar</button></p></div>
  <p class="welcome-more"><span>Já joga Magic?</span><button type="button" class="link-btn" data-lobby="welcome-all">Ver todos os decks prontos</button><button type="button" class="link-btn" data-lobby="import">Importar minha lista</button><button type="button" class="link-btn" data-lobby="welcome-friends">Jogar com amigos</button></p>
</section>`;

/** Os cartões dos decks de boas-vindas: arte, cores, nome e o jeito de jogar. */
export function welcomeDecksHTML(decks: { deck: DeckData; plan: string }[], selectedId: string) {
  return decks.map(({ deck, plan }) => {
    const on = deck.id === selectedId, art = deckArt(deck), colors = deckColors(deck);
    return `<button type="button" class="welcome-deck${on ? ' on' : ''}" data-deck="${esc(deck.id)}" aria-pressed="${on}"><span class="welcome-deck-art"${art ? ` style="background-image:url('${esc(art)}')"` : ''}>${colors.length ? `<span class="tile-colors">${colors.map(pip).join('')}</span>` : ''}</span><span class="tile-check${on ? '' : ' empty'}" aria-hidden="true">${on ? '✓' : ''}</span><span class="welcome-deck-info"><span class="welcome-deck-name">${esc(deck.name)}</span><span class="welcome-deck-plan">${esc(plan)}</span></span></button>`;
  }).join('');
}

/** "Meus decks" vazio enquanto as boas-vindas estão à vista: uma linha, sem disputar com o botão de jogar. */
export const PERSONAL_EMPTY_COMPACT = '<div class="personal-empty compact"><p>Os decks que você montar ou importar aparecem aqui.</p><button type="button" class="link-btn" data-lobby="create">Montar um deck</button><button type="button" class="link-btn" data-lobby="import">Importar uma lista</button></div>';
