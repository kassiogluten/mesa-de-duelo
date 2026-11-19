// Busca que manda as cartas achadas para dois lugares (Cultivate, Kodama's Reach): as cartas achadas em cima e um espaço para cada destino ("Campo (virado)", "Mão"), preenchidos na ordem em que se toca.
import type { FQuestion } from '../forge/client';
import { esc } from './cardtext';

export const isSplitDestinations = (q: FQuestion) => q.purpose === 'split-destinations' && (q.destinations?.length ?? 0) === 2;

const ZONE: Record<string, string> = { Battlefield: 'Campo', Hand: 'Mão', Graveyard: 'Cemitério', Library: 'Grimório', Exile: 'Exílio' };

/** O destino de cada posição da resposta: as count primeiras vão para o primeiro lugar, o resto para o segundo. */
export function slotsOf(q: FQuestion) {
  const [a, b] = q.destinations!;
  const max = q.max ?? 2, first = Math.min(a!.count ?? 1, max);
  const name = (d: { zone: string; tapped?: boolean }) => `${ZONE[d.zone] ?? d.zone}${d.tapped ? ' (virado)' : ''}`;
  return Array.from({ length: max }, (_, i) => (i < first ? name(a!) : name(b!)));
}

export interface SplitView { face(c: NonNullable<import('../forge/client').FOption['card']>): string; label(c: NonNullable<import('../forge/client').FOption['card']>): string }

/** picked: as opções na ordem dos espaços. */
export function splitDestinationsHTML(v: SplitView, q: FQuestion, picked: number[]) {
  const opts = q.options ?? [];
  const slots = slotsOf(q);
  const max = q.max ?? 2;
  const card = (i: number) => { const o = opts[i]; return o && typeof o !== 'string' ? o.card : undefined; };
  const title = `${q.card ? `${v.label(q.card)}: e` : 'E'}scolha até ${max} ${max === 1 ? 'carta' : 'cartas'} do grimório`;
  const found = opts.map((_, i) => {
    const c = card(i), on = picked.includes(i);
    return `<button type="button" class="dest-card${on ? ' used' : ''}" data-dest-pick="${i}" aria-pressed="${on}" aria-label="${esc(c ? v.label(c) : `Carta ${i + 1}`)}">${c ? v.face(c) : ''}</button>`;
  }).join('');
  const boxes = slots.map((name, k) => {
    const i = picked[k], c = i === undefined ? undefined : card(i);
    return `<button type="button" class="dest-slot${c ? ' filled' : ''}" data-dest-slot="${k}" ${c ? '' : 'disabled'} aria-label="${esc(c ? `${name}: ${v.label(c)}. Tocar para tirar.` : `${name}: vazio`)}"><b>${esc(name)}</b>${c ? `<span class="dest-face">${v.face(c)}</span>` : ''}</button>`;
  }).join('');
  return `<div class="q-head"><h2>${esc(title)}</h2><button class="icon-btn q-minimize" data-ui="question-minimize" aria-label="Ver a mesa sem perder esta escolha">Ver a mesa</button></div>
    <p class="q-hint">Toque numa carta para pô-la no primeiro espaço livre; toque no espaço para tirar.</p>
    <div class="dest-found">${found}</div>
    <div class="dest-slots">${boxes}</div>
    <div class="q-actions"><button class="arena-btn secondary" data-q-none>Não procurar</button><button class="arena-btn primary" data-q-submit>${picked.length ? 'Confirmar' : 'Confirmar sem nenhuma'}</button></div>`;
}

/** Tocar numa carta: vai para o primeiro espaço livre (ou sai, se já estava num). Tocar num espaço: a carta sai e as seguintes sobem. */
export function pickDestination(q: FQuestion, picked: number[], option: number) {
  const at = picked.indexOf(option);
  if (at >= 0) picked.splice(at, 1);
  else if (picked.length < (q.max ?? 2)) picked.push(option);
}
