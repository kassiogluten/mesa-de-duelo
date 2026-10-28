import type { FForecast } from '../forge/client';
import { esc } from './cardtext';

/** Vida que já conta como baixa, e quanto falta do limite de veneno (10) e de dano de comandante (21) para avisar. */
export const LOW_LIFE = 5, NEAR_LIMIT = 2;
const POISON_LIMIT = 10, COMMANDER_LIMIT = 21;

const lifeLoss = (f: FForecast) => f.lifeAfter < f.life;
const poisonGain = (f: FForecast) => (f.poisonAfter ?? 0) > (f.poison ?? 0);
const commanderHits = (f: FForecast) => (f.commander ?? []).filter(c => c.after > c.damage);

/** O combate muda alguma coisa para o jogador (vida, veneno ou dano de comandante)? */
export const forecastChanges = (f: FForecast) => lifeLoss(f) || poisonGain(f) || commanderHits(f).length > 0;

/** O que pesa mais no combate: o que derrota o jogador, senão o que chega perto do limite, senão a vida. */
function forecastReason(f: FForecast): 'life' | 'poison' | 'commander' {
  if (f.lethal) return f.lethal;
  if (lifeLoss(f) && f.lifeAfter <= LOW_LIFE) return 'life';
  if (poisonGain(f) && (f.poisonAfter ?? 0) >= POISON_LIMIT - NEAR_LIMIT) return 'poison';
  if (commanderHits(f).some(c => c.after >= COMMANDER_LIMIT - NEAR_LIMIT)) return 'commander';
  return lifeLoss(f) ? 'life' : poisonGain(f) ? 'poison' : 'commander';
}

/** Letal, perigoso (vida 5 ou menos, ou a 2 do limite de veneno ou de comandante) ou nada a destacar. */
export function forecastLevel(f: FForecast): 'lethal' | 'low' | null {
  if (f.lethal) return 'lethal';
  const reason = forecastReason(f);
  const low = reason === 'life' ? lifeLoss(f) && f.lifeAfter <= LOW_LIFE
    : reason === 'poison' ? (f.poisonAfter ?? 0) >= POISON_LIMIT - NEAR_LIMIT
    : commanderHits(f).some(c => c.after >= COMMANDER_LIMIT - NEAR_LIMIT);
  return low ? 'low' : null;
}

/**
 * Selo ao lado da vida no retrato: "→ 13", com veneno e dano de comandante quando entram, e "Letal!". `compact` (seu
 * retrato, no canto apertado) mostra só o que pesa mais; a frase inteira está na caixa de ação.
 */
export function forecastBadgeHTML(f: FForecast, compact = false) {
  const level = forecastLevel(f);
  if (!forecastChanges(f)) return '<div class="life-forecast safe" aria-hidden="true">Sem dano</div>';
  const reason = forecastReason(f);
  const worst = commanderHits(f).sort((a, b) => b.after - a.after)[0];
  const show = (part: 'life' | 'poison' | 'commander') => !compact || part === reason;
  const html = [lifeLoss(f) && show('life') ? `<span class="lf-life"><span class="lf-arrow">→</span><b>${f.lifeAfter}</b></span>` : '',
    poisonGain(f) && show('poison') ? `<small class="lf-poison">Veneno ${f.poisonAfter}/${POISON_LIMIT}</small>` : '',
    worst && show('commander') ? `<small class="lf-commander">Comandante ${worst.after}/${COMMANDER_LIMIT}</small>` : ''].join('');
  return `<div class="life-forecast${level ? ` ${level}` : ''}" aria-hidden="true">${html}${level === 'lethal' ? '<em>Letal!</em>' : ''}</div>`;
}

/** Lealdade prevista de um planeswalker atacado, se ele está no combate. */
export function walkerForecast(forecast: FForecast[] | undefined, id: number) {
  for (const f of forecast ?? []) for (const w of f.planeswalkers ?? []) if (w.id === id) return w;
  return undefined;
}

/**
 * Frase para a caixa de ação e o leitor de tela: "Depois do combate, você fica com 13 de vida. Letal!".
 * `name` é null quando a previsão é do próprio jogador; `cardName` dá o nome de comandantes e planeswalkers.
 */
export function forecastText(f: FForecast, name: string | null, cardName: (id: number) => string) {
  const who = name ?? 'você';
  const parts = [`${f.lifeAfter} de vida`];
  if (poisonGain(f)) parts.push(`${f.poisonAfter} de veneno`);
  for (const c of commanderHits(f)) parts.push(`${c.after} de dano de ${cardName(c.commanderId)}`);
  const head = forecastChanges(f) ? `Depois do combate, ${who} fica com ${list(parts)}.` : `${name ? `${name} não toma` : 'Você não toma'} dano neste combate.`;
  const walkers = (f.planeswalkers ?? []).filter(w => w.after < w.loyalty)
    .map(w => w.after <= 0 ? `${cardName(w.id)} morre.` : `${cardName(w.id)} fica com ${w.after} de lealdade.`);
  const level = forecastLevel(f);
  return [head, ...walkers, level === 'lethal' ? 'Letal!' : level === 'low' ? 'Perto de perder.' : ''].filter(Boolean).join(' ');
}

const list = (items: string[]) => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;

/** Linha da caixa de ação, junto do Confirmar bloqueios. */
export function forecastLineHTML(f: FForecast, cardName: (id: number) => string) {
  const level = forecastLevel(f);
  return `<p class="block-forecast${level ? ` ${level}` : ''}">${esc(forecastText(f, null, cardName))}</p>`;
}
