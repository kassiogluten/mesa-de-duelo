import { esc } from './cardtext';

/*
 * Marcadores que ficam no jogador (veneno, radiação, energia, experiência, tíquete, contrato): ícone, cor,
 * nome em português e uma linha do que fazem. Os que a mesa não conhece aparecem com o nome do Forge e um disco.
 */

const svg = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const DISC = svg('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10z');

interface CounterKind { name: string; icon: string; tone: string; hint: (n: number) => string; limit?: number }

const KINDS: Record<string, CounterKind> = {
  POISON: { name: 'Veneno', tone: 'poison', limit: 10, icon: svg('M12 2.5c3.6 4.6 6 8.3 6 11.3a6 6 0 0 1-12 0c0-3 2.4-6.7 6-11.3z'),
    hint: n => n >= 10 ? 'Com 10 marcadores de veneno, o jogador perde.' : `Com 10 marcadores de veneno, o jogador perde. Faltam ${10 - n}.` },
  RAD: { name: 'Radiação', tone: 'rad', icon: svg('M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM10.3 8.9 7.2 3.5A9.5 9.5 0 0 0 2.5 11.8h6.2a3.4 3.4 0 0 1 1.6-2.9zm3.4 0a3.4 3.4 0 0 1 1.6 2.9h6.2a9.5 9.5 0 0 0-4.7-8.3zM12 15.4a3.4 3.4 0 0 1-1.7-.4l-3.1 5.4a9.5 9.5 0 0 0 9.6 0L13.7 15a3.4 3.4 0 0 1-1.7.4z'),
    hint: n => `No começo da fase principal antes do combate, o jogador coloca ${n === 1 ? 'a carta do topo' : `as ${n} cartas do topo`} do grimório no cemitério. Para cada uma que não for terreno, perde 1 de vida e tira 1 marcador de radiação.` },
  ENERGY: { name: 'Energia', tone: 'energy', icon: svg('M13 2 4 14h6l-1 8 9-12h-6z'),
    hint: () => 'Gasta para pagar custos com o símbolo de energia.' },
  EXPERIENCE: { name: 'Experiência', tone: 'experience', icon: svg('m12 2 2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2l-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8z'),
    hint: () => 'Fica com o jogador para sempre; algumas cartas ficam mais fortes com ela.' },
  TICKET: { name: 'Tíquete', tone: 'ticket', icon: svg('M3 7a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-4zm6 0v10h2V7z'),
    hint: () => 'Gasta para pagar custos com o símbolo de tíquete.' },
  CONTRACT: { name: 'Contrato', tone: 'contract', icon: svg('M6 2h9l5 5v15H6zm8 1.5V8h4.5zM8.5 12h9v1.5h-9zm0 3.5h9V17h-9z'),
    hint: () => 'Marcador de contrato no jogador.' },
};

/** O Anel: as habilidades que ele ganha a cada vez que tenta o jogador, da primeira à quarta. */
export const RING_ABILITIES = [
  'Seu Portador do Anel é lendário e não pode ser bloqueado por criaturas com poder maior.',
  'Sempre que seu Portador do Anel atacar, compre um card e depois descarte um card.',
  'Sempre que seu Portador do Anel ficar bloqueado por uma criatura, o controlador dela a sacrifica no fim do combate.',
  'Sempre que seu Portador do Anel causar dano de combate a um jogador, cada oponente perde 3 pontos de vida.',
];
export const RING_ICON = svg('M12 4C7 4 3 7.6 3 12s4 8 9 8 9-3.6 9-8-4-8-9-8zm0 3c3.6 0 6 2.3 6 5s-2.4 5-6 5-6-2.3-6-5 2.4-5 6-5z');

const times = (n: number) => n === 1 ? '1 vez' : `${n} vezes`;

/** Quantas vezes o Anel tentou e o que ele já faz (as habilidades acumulam até a quarta). */
export function ringText(tempted: number) {
  return `O Anel tentou ${times(tempted)}. ${RING_ABILITIES.slice(0, Math.min(tempted, 4)).join(' ')}`;
}

const kind = (key: string): CounterKind => KINDS[key] ?? {
  name: key.charAt(0) + key.slice(1).toLowerCase().replaceAll('_', ' '), tone: 'other', icon: DISC, hint: () => '',
};

export const playerCounterName = (key: string) => kind(key).name;

/** Veneno primeiro (é o que mata), depois radiação, depois o resto na ordem em que vieram. */
export function playerCounterList(counters: Record<string, number> | undefined) {
  const order = (k: string) => k === 'POISON' ? 0 : k === 'RAD' ? 1 : 2;
  return Object.entries(counters ?? {}).filter(([, n]) => n > 0).sort(([a], [b]) => order(a) - order(b));
}

/** Texto para o leitor de tela, junto do nome e da vida do jogador. */
export function playerCountersText(counters: Record<string, number> | undefined, ringTempted = 0) {
  return playerCounterList(counters).map(([k, n]) => k === 'POISON'
    ? `, ${n} ${n === 1 ? 'marcador' : 'marcadores'} de veneno de 10`
    : `, ${n} ${n === 1 ? 'marcador' : 'marcadores'} de ${kind(k).name.toLowerCase()}`).join('')
    + (ringTempted > 0 ? `, o Anel tentou ${times(ringTempted)}` : '');
}

/**
 * Selos ao lado do retrato. `changed` diz quais tipos mudaram desde o último desenho (pulso curto; RING é o Anel);
 * `open` é a chave do balão aberto por clique. O texto completo do jogador já vai no rótulo do retrato.
 * O Anel vem por último, com quantas vezes tentou o jogador.
 */
export function playerCountersHTML(playerId: number, counters: Record<string, number> | undefined, changed: Set<string> = new Set(), open: string | null = null, ringTempted = 0) {
  const list = playerCounterList(counters);
  if (!list.length && ringTempted <= 0) return '';
  const ringKey = `p${playerId}:RING`;
  const ring = ringTempted > 0
    ? `<span class="player-counter ring${changed.has('RING') ? ' bump' : ''}${open === ringKey ? ' open' : ''}" data-ctr="${ringKey}" data-counter="RING">${RING_ICON}<b>${ringTempted}</b><span class="ctr-tip">${esc(ringText(ringTempted))}</span></span>` : '';
  return `<div class="player-counters" aria-hidden="true">${list.map(([k, n]) => {
    const c = kind(k), key = `p${playerId}:${k}`;
    const danger = k === 'POISON' && n >= 7;
    const tip = `${c.name}: ${n}${c.limit ? ` de ${c.limit}` : ''}. ${c.hint(n)}`.trim();
    return `<span class="player-counter ${c.tone}${danger ? ' danger' : ''}${changed.has(k) ? ' bump' : ''}${open === key ? ' open' : ''}" data-ctr="${key}" data-counter="${esc(k)}">${c.icon}<b>${n}</b>${c.limit ? `<small>/${c.limit}</small>` : ''}<span class="ctr-tip">${esc(tip)}</span></span>`;
  }).join('')}${ring}</div>`;
}
