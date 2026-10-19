import type { FCard, FOption, FQuestion } from '../forge/client';
import { esc, manaHTML } from './cardtext';

/*
 * Duas escolhas no estilo do Arena: a ordem dos gatilhos simultâneos (cartas lado a lado, a da esquerda
 * resolve primeiro) e o jeito de jogar uma carta (a carta grande e cada modo como um botão-cartão).
 */

type Face = (c: FCard) => string;
type Label = (c: FCard) => string;
const opt = (q: FQuestion, i: number) => { const o = q.options?.[i]; return typeof o === 'string' || !o ? { label: o ?? '' } as FOption : o; };

export const isTriggerOrder = (q: FQuestion) => q.kind === 'order' && q.purpose === 'triggers';
export const isPlayMode = (q: FQuestion) => q.method === 'getAbilityToPlay' || q.purpose === 'play-mode';

// ---------- Ordem dos gatilhos ----------

/** Ordem em andamento: a lista inteira como está na tela e quantas posições já foram marcadas por toque. */
export interface TriggerOrder { order: number[]; placed: number; history: { order: number[]; placed: number }[] }

export const newTriggerOrder = (count: number): TriggerOrder => ({ order: Array.from({ length: count }, (_, i) => i), placed: 0, history: [] });

const remember = (t: TriggerOrder) => t.history.push({ order: [...t.order], placed: t.placed });

/** Tocar num gatilho ainda livre o coloca na próxima posição; os outros seguem na ordem em que estavam. */
export function tapTrigger(t: TriggerOrder, option: number) {
  const at = t.order.indexOf(option);
  if (at < t.placed || at < 0) return false;
  remember(t);
  t.order.splice(at, 1); t.order.splice(t.placed, 0, option); t.placed++;
  return true;
}

/** Arrastar (ou as setas do teclado) leva um gatilho para outra posição. */
export function moveTrigger(t: TriggerOrder, from: number, to: number) {
  to = Math.max(0, Math.min(t.order.length - 1, to));
  if (from === to || from < 0 || from >= t.order.length) return false;
  remember(t);
  const [option] = t.order.splice(from, 1); t.order.splice(to, 0, option);
  t.placed = Math.max(t.placed, Math.max(from, to) + 1);
  return true;
}

export function undoTrigger(t: TriggerOrder) {
  const last = t.history.pop();
  if (!last) return false;
  t.order = last.order; t.placed = last.placed;
  return true;
}

const triggerKey = (o: FOption) => `${o.card?.name ?? ''}\u0000${o.ability ?? o.label}`;

/** Quantos gatilhos iguais (mesma carta, mesmo texto) há para cada opção. */
export function duplicateCounts(q: FQuestion) {
  const opts = (q.options ?? []).map((_, i) => opt(q, i));
  const counts = new Map<string, number>();
  for (const o of opts) counts.set(triggerKey(o), (counts.get(triggerKey(o)) ?? 0) + 1);
  return opts.map(o => counts.get(triggerKey(o)) ?? 1);
}

export const positionText = (pos: number, total: number) =>
  pos === 0 ? 'resolve primeiro' : pos === total - 1 ? 'resolve por último' : `resolve em ${pos + 1}º`;

export function triggerOrderHTML(q: FQuestion, t: TriggerOrder, face: Face, label: Label) {
  const total = t.order.length;
  const dup = duplicateCounts(q);
  const cards = t.order.map((option, pos) => {
    const o = opt(q, option);
    const name = o.card ? label(o.card) : 'Gatilho';
    const text = o.ability ?? o.label;
    const marked = pos < t.placed;
    return `<li class="trigger-slot${marked ? ' placed' : ''}" data-trigger-pos="${pos}">
      <div class="trigger-position" aria-hidden="true"><b>${pos + 1}</b><span>${pos === 0 ? 'Resolve primeiro' : pos === total - 1 ? 'Resolve por último' : `${pos + 1}º`}</span></div>
      <button type="button" class="trigger-card" data-trigger="${option}" aria-label="${esc(`${name}: ${text}. Posição ${pos + 1} de ${total}, ${positionText(pos, total)}.${dup[option] > 1 ? ` Um de ${dup[option]} gatilhos iguais.` : ''}`)}" aria-describedby="fTriggerHelp">
        <div class="trigger-face">${o.card ? face(o.card) : ''}</div>
        <p class="trigger-text">${esc(text)}</p>
        ${dup[option] > 1 ? `<span class="trigger-dup" title="${dup[option]} gatilhos iguais, cada um vai separado para a pilha">×${dup[option]}</span>` : ''}
      </button>
      ${o.card && !o.card.faceDown && o.card.name ? `<button type="button" class="trigger-inspect" data-inspect="${o.card.id}" aria-label="Inspecionar ${esc(name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6m-3-3v6"/></svg></button>` : ''}
    </li>`;
  }).join('');
  return `<div class="q-head"><h2>Ordene seus gatilhos</h2><button class="icon-btn q-minimize" data-ui="question-minimize" aria-label="Ver a mesa sem perder esta escolha">Ver a mesa</button></div>
    <p class="q-hint" id="fTriggerHelp">Toque na ordem em que devem resolver, ou arraste. Com o teclado, use as setas. O último a ir para a pilha é o primeiro a resolver.</p>
    <div class="trigger-direction" aria-hidden="true"><span>Resolve primeiro</span><i></i><span>Resolve por último</span></div>
    <ol class="trigger-row" aria-label="Ordem dos gatilhos">${cards}</ol>
    <div class="q-actions">
      <button class="arena-btn secondary" data-trigger-undo ${t.history.length ? '' : 'disabled'}>Desfazer</button>
      <button class="arena-btn secondary" data-q-keep>Ordem automática</button>
      <button class="arena-btn primary big" data-trigger-confirm>Confirmar ordem</button>
    </div>`;
}

// ---------- Modo de jogar ----------

const MODES: Record<string, [string, string]> = {
  cast: ['Conjurar', 'Pague o custo normal.'],
  land: ['Jogar terreno', 'Usa a jogada de terreno do turno.'],
  cycling: ['Reciclar', 'Descarte esta carta e compre uma carta.'],
  plot: ['Tramar', 'Exile a carta. Num turno seu mais adiante, conjure sem pagar o custo de mana.'],
  plotted: ['Conjurar tramada', 'Conjure do exílio sem pagar o custo de mana.'],
  foretell: ['Prever', 'Exile virada para baixo e conjure depois pelo custo previsto.'],
  foretold: ['Conjurar prevista', 'Conjure do exílio pelo custo previsto.'],
  flashback: ['Flashback', 'Conjure do cemitério. Depois a carta é exilada.'],
  escape: ['Fuga', 'Conjure do cemitério exilando outras cartas de lá.'],
  harmonize: ['Harmonizar', 'Conjure do cemitério. Depois a carta é exilada.'],
  evoke: ['Evocar', 'Custo menor, mas a criatura é sacrificada ao entrar.'],
  dash: ['Dash', 'Entra com ímpeto e volta para a mão no fim do turno.'],
  blitz: ['Blitz', 'Entra com ímpeto, compra uma carta ao morrer e é sacrificada no fim do turno.'],
  madness: ['Loucura', 'Conjure pelo custo de loucura ao descartá-la.'],
  overload: ['Sobrecarga', 'Afeta cada alvo possível em vez de um só.'],
  bestow: ['Agraciar', 'Conjure como aura presa a uma criatura.'],
  disturb: ['Perturbar', 'Conjure transformada a partir do cemitério.'],
  adventure: ['Aventura', 'Conjure a aventura. Depois, do exílio, a criatura pode ser conjurada.'],
  omen: ['Presságio', 'Conjure o presságio. Depois a carta volta embaralhada ao grimório.'],
  aftermath: ['Consequência', 'Conjure esta metade a partir do cemitério.'],
  facedown: ['Virada para baixo', 'Conjure como criatura 2/2 sem nome, virada para baixo.'],
  prowl: ['Rondar', 'Custo menor depois de causar dano de combate com o tipo certo.'],
  spectacle: ['Espetáculo', 'Custo menor se um oponente perdeu vida neste turno.'],
  surge: ['Surto', 'Custo menor se você já conjurou outra mágica neste turno.'],
  emerge: ['Emergir', 'Sacrifique uma criatura para pagar menos.'],
  mutate: ['Mutação', 'Junte a uma criatura sua que não seja Humano.'],
  awaken: ['Despertar', 'Também transforma um terreno seu em criatura.'],
  warp: ['Dobra', 'Custo menor; volta ao exílio no fim do turno e pode ser conjurada depois.'],
  ninjutsu: ['Ninjutsu', 'Troque por um atacante não bloqueado seu.'],
  equip: ['Equipar', 'Prenda a uma criatura sua.'],
  crew: ['Tripular', 'Vire criaturas para transformar o veículo em criatura.'],
  ability: ['Habilidade', ''],
};

/** Custos extras do Forge (em inglês) em português, quando a frase é das conhecidas. */
export function extraCostText(text: string) {
  const t = text.trim();
  const rules: [RegExp, (...m: string[]) => string][] = [
    [/^Pay (\d+) life$/i, n => `Pagar ${n} de vida`],
    [/^Discard (?:this card|CARDNAME)$/i, () => 'Descartar esta carta'],
    [/^Discard (a|an|one|two|three|\d+) cards?$/i, n => `Descartar ${({ a: 'uma', an: 'uma', one: 'uma', two: 'duas', three: 'três' } as Record<string, string>)[n.toLowerCase()] ?? n} ${/^(a|an|one|1)$/i.test(n) ? 'carta' : 'cartas'}`],
    [/^Sacrifice (?:a|an|one) creatures?$/i, () => 'Sacrificar uma criatura'],
    [/^Sacrifice (?:a|an|one) artifacts?$/i, () => 'Sacrificar um artefato'],
    [/^Sacrifice (?:a|an|one) lands?$/i, () => 'Sacrificar um terreno'],
    [/^Sacrifice (?:this|CARDNAME)$/i, () => 'Sacrificar esta carta'],
    [/^Tap an untapped creature you control$/i, () => 'Virar uma criatura desvirada sua'],
    [/^Return (?:a|an) land you control to its owner's hand$/i, () => 'Devolver um terreno seu para a mão'],
    [/^Exile (\w+) other cards? from your graveyard$/i, n => `Exilar ${({ one: 'uma', two: 'duas', three: 'três', four: 'quatro', five: 'cinco' } as Record<string, string>)[n.toLowerCase()] ?? n} outras cartas do seu cemitério`],
  ];
  for (const [re, out] of rules) { const m = t.match(re); if (m) return out(...m.slice(1)); }
  return t;
}

export interface PlayChoice { index: number; name: string; detail: string; cost: string; extra: string[]; face?: FOption['face']; recommended: boolean }

/** Nome, linha curta e custos de cada opção, a partir do modo que a ponte manda. */
export function playChoices(q: FQuestion): PlayChoice[] {
  const opts = (q.options ?? []).map((_, i) => opt(q, i));
  const printed = q.card?.manaCost ?? '';
  const casts = opts.filter(o => (o.mode ?? 'cast') === 'cast').length;
  const choices = opts.map((o, index) => {
    const mode = o.mode ?? (opts.length ? 'ability' : 'cast');
    const known = MODES[mode];
    const extra = (o.extra ?? []).map(extraCostText).filter(e => !(mode === 'cycling' && /^Descartar esta carta$/.test(e)));
    // Duas formas de conjurar a mesma carta (Fireblast, por exemplo): a que não usa o custo impresso é a alternativa.
    const alternative = mode === 'cast' && casts > 1 && (extra.length > 0 || (o.cost ?? '') !== printed);
    const abilities = opts.filter(x => x.mode === 'ability').length;
    const name = alternative ? 'Custo alternativo' : mode === 'ability' && abilities > 1 ? `Habilidade ${opts.slice(0, index + 1).filter(x => x.mode === 'ability').length}`
      : known?.[0] ?? mode.charAt(0).toUpperCase() + mode.slice(1);
    const detail = alternative ? 'Conjure pagando este custo no lugar do custo de mana.'
      : mode === 'ability' || !known ? (o.description ?? o.label).replace(/\s+—\s+Custo:.*$/, '') : known[1];
    return { index, name, detail, cost: o.cost ?? '', extra, face: o.face, recommended: false };
  });
  const normal = choices.find(c => (opts[c.index].mode ?? 'cast') === 'cast' && c.name === 'Conjurar') ?? choices.find(c => opts[c.index].mode === 'land');
  if (normal) normal.recommended = true;
  return choices;
}

const costWords = (cost: string) => (cost.match(/\{[^}]+\}/g) ?? []).map(s => s.slice(1, -1)).join(' ');

export function playModeHTML(q: FQuestion, face: Face, label: Label) {
  const choices = playChoices(q);
  const card = q.card;
  const playing = (q.options ?? []).some(o => typeof o !== 'string' && (o.spell || o.mode === 'land' || (o.mode && o.mode !== 'ability')));
  const title = playing ? card ? `Como jogar ${label(card)}?` : 'Como jogar esta carta?' : card ? `Qual habilidade de ${label(card)} usar?` : 'Qual habilidade usar?';
  return `<div class="q-head"><h2>${esc(title)}</h2><button class="icon-btn q-minimize" data-ui="question-minimize" aria-label="Ver a mesa sem perder esta escolha">Ver a mesa</button></div>
    <div class="play-mode-body">
      ${card ? `<div class="play-mode-card" data-peek="${card.id}" role="img" aria-label="${esc(label(card))}">${face(card)}</div>` : ''}
      <ul class="play-mode-options" aria-label="Jeitos de jogar">${choices.map(c => {
        const costs = [c.cost ? `<span class="play-mode-mana">${manaHTML(c.cost)}</span>` : '', ...c.extra.map(e => `<span class="play-mode-extra">${esc(e)}</span>`)].filter(Boolean).join('<span class="play-mode-plus" aria-hidden="true">+</span>');
        const spoken = [c.cost ? `custo ${costWords(c.cost)}` : c.extra.length ? '' : 'sem custo', ...c.extra].filter(Boolean).join(', ');
        return `<li><button type="button" class="play-mode-option${c.recommended ? ' recommended' : ''}" data-q-opt="${c.index}" aria-label="${esc(`${c.name}${c.face ? ` (${c.face.name})` : ''}, ${spoken}. ${c.detail}`)}">
          <span class="play-mode-head"><strong>${esc(c.name)}</strong>${costs || '<span class="play-mode-free">Sem custo</span>'}</span>
          ${c.face ? `<span class="play-mode-face">${esc(c.face.name)}${c.face.manaCost ? ` ${manaHTML(c.face.manaCost)}` : ''}<small>${esc(c.face.typeLine)}</small></span>` : ''}
          ${c.detail ? `<span class="play-mode-detail">${esc(c.detail)}</span>` : ''}
        </button></li>`;
      }).join('')}</ul>
    </div>
    <div class="q-actions"><button class="arena-btn secondary" data-q-none>Cancelar</button></div>`;
}
