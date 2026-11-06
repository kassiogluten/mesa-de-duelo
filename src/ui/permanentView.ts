// As permanentes no campo: cada carta (marcadores, palavras-chave, selos de combate, anexos e efeitos), as pilhas de cópias
// iguais, as duas fileiras de cada jogador e as etiquetas das cartas do exílio que dá para jogar.
import { exiledAria, exiledUnder } from './exiledUnder';
import type { FCard, FPlayer, FState } from '../forge/client';
import { esc, manaHTML } from './cardtext';
import type { CardStyle } from './face';
import { faceDownReminder } from './faceDownReminder';
import { auraColor, permanentFx, permanentFxHTML, permanentFxText } from './permanentEffects';
import { mergedText } from './cardInspector';
import { canPlayExileCard, legalBlockTargets, selectedForInput, validBlockSelection, type BlockSelection, type exileShelfCards } from './playContext';
import { proliferateBoardClass } from './proliferate';
import { ringText, RING_ICON } from './playerCounters';
import { walkerForecast } from './combatForecast';
import type { Defender } from './commanderTable';
import { label } from './cardFaces';
import { COUNTER_DISC, COUNTER_ICON, ICON_CLIP, ICON_CROWN, ICON_DIZZY, ICON_LAYERS, ICON_SHIELD, ICON_SWORD, KEYWORD_ICON, inspectIcon } from './icons';
import { KEYWORD_LABEL, counterLabel, fieldKeywordsOf } from './cardLabels';

/** O que as peças do campo precisam da mesa. */
export interface BoardView {
  face(c: FCard, size: 'small' | 'normal', field?: boolean): string;
  faceStyle(c: FCard, field: boolean): CardStyle;
  playerName(id: number): string;
  /** Marcador com o balão aberto por clique. */
  openCounter: string | null;
  /** Dano de cada permanente no desenho anterior: quem levou mais pisca. */
  lastDamage: Map<number, number>;
  selectedBlocker: BlockSelection | null;
  /** Celular: os terrenos virados vão para um monte só. */
  compact: boolean;
  /** A criatura está marcada para atacar (escolhida, na fila ou no "atacar com tudo"). */
  attackSelected(s: FState, id: number): boolean;
  /** Quem dá para atacar agora, com a seleção atual. */
  attackTargets(s: FState): Defender[];
}

export const selectedBadge = (s: FState, c: FCard) => selectedForInput(s, c.id) ? '<span class="choice-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span>' : '';
export const inspectButton = (c: FCard) => (!c.faceDown && c.name) || c.hiddenFace?.name || faceDownReminder(c) ?`<button class="inspect-card" data-inspect="${c.id}" aria-label="Inspecionar ${esc(label(c))}">${inspectIcon}</button>` : '';
// ---------- Peças ----------
/** Destaque azul: cartas que o Forge marca como selecionáveis no prompt atual ou utilizáveis agora. */
export function usable(s: FState, id: number) {
  return s.input.selectable.includes(id) || !!s.input.actionable?.includes(id);
}
/** Cemitério e exílio: além do que o Forge marca, o que a ponte diz que dá para usar agora (flashback, tramadas...). */
export const canUse = (s: FState, c: FCard) => usable(s, c.id) || (!s.question && !!s.input.priority && s.input.ok.enabled && !!s.castable?.includes(c.id));
/** Etiqueta de uma carta do exílio que dá para jogar ou está suspensa: a mesma na prateleira e na janela do exílio. */
export function exileCaption(s: FState, { card, suspended, choosing }: ReturnType<typeof exileShelfCards>[number]) {
  const playable = canPlayExileCard(s, card.id, s.input.gen);
  const time = card.counters?.TIME ?? 0;
  const status = choosing ? 'Conjurar agora' : suspended ? time > 0 ? `Suspensa · ${time}` : 'Aguardando resolução'
    : card.foretold ? `Prevista${card.foretellCost ? `: conjure por ${card.foretellCost}` : ''}${playable ? '' : ', a partir do turno seguinte ao da previsão'}`
    : playable ? card.land ? 'Jogar terreno' : 'Conjurar' : 'Aguardando o momento de jogar';
  const caption = choosing ? 'Conjurar' : suspended ? time > 0 ? 'Suspensa' : 'Na pilha' : playable ? 'Jogar' : 'Aguarde';
  return { playable, time, status, caption };
}
/** Etiqueta da carta prevista: "Prevista" e, para o dono, o custo previsto. */
export const foretoldTag = (c: FCard) => `<div class="zone-tag foretold" title="${esc(c.foretellCost ? `Prevista: conjure por ${c.foretellCost}` : 'Prevista')}">Prevista${c.foretellCost ? ` ${manaHTML(c.foretellCost)}` : ''}</div>`;
export function combatIndex(s: FState, id: number): { attack?: number; block?: number } {
  const a = s.combat.findIndex(x => x.attacker === id);
  if (a >= 0) return { attack: a + 1 };
  const b = s.combat.findIndex(x => x.blockers.includes(id));
  return b >= 0 ? { block: b + 1 } : {};
}
/** Selo com ícone (e número, se houver); o nome aparece no balão ao passar o mouse ou clicar. */
export const chip = (v: BoardView, cls: string, key: string, icon: string, name: string, n?: number) =>
  `<span class="${cls}${v.openCounter === key ? ' open' : ''}" data-ctr="${key}" role="button" tabindex="0" aria-label="${esc(name)}">${icon}${n !== undefined ? `<b>${n}</b>` : ''}<span class="ctr-tip">${esc(name)}</span></span>`;
export const classLevelText = (c: FCard) => `Nível ${c.classLevel}${c.classMaxLevel ? ` de ${c.classMaxLevel}` : ''}${c.classMaxLevel && c.classLevel === c.classMaxLevel ? ' (máximo)' : ''}`;
/** Classe do número de P/T: verde acima da base, vermelho abaixo. */
export const delta = (v: number, base: number | undefined) => (base === undefined || v === base ? '' : v > base ? 'up' : 'down');
/** Cartas do campo por id, para achar o alvo de um ataque ou a carta que uma aura encanta. */
export const fieldCache = new WeakMap<FState, Map<number, FCard>>();
export function battlefieldById(s: FState) {
  let m = fieldCache.get(s);
  if (!m) fieldCache.set(s, m = new Map(s.players.flatMap(p => p.battlefield).map(c => [c.id, c] as const)));
  return m;
}
/** Auras e equipamentos agrupados pela carta a que estão presos (só quando ela está no campo). */
export function attachmentsOf(s: FState) {
  const byId = battlefieldById(s);
  const m = new Map<number, FCard[]>();
  for (const c of byId.values()) {
    if (c.attachedTo != null && byId.has(c.attachedTo)) m.set(c.attachedTo, [...(m.get(c.attachedTo) ?? []), c]);
  }
  return m;
}
/** Ícone do exílio na etiqueta da carta exilada por uma permanente. */
const ICON_EXILE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="m6.5 17.5 11-11"/></svg>';
/** Nome curto na etiqueta: virada para baixo, sem revelar qual é. */
export function bfCard(v: BoardView, s: FState, c: FCard, attached: FCard[] = []) {
  const ci = combatIndex(s, c.id);
  const byId = battlefieldById(s);
  const slot = ['slot'];
  if (c.creature && c.keywords?.includes('FLYING')) slot.push('has-flying');
  if (c.tapped) slot.push('tapped');
  if (c.attacking || ci.attack) slot.push('attacking');
  if (c.blocking || ci.block) slot.push('blocking');
  const inner = ['bfc'];
  // Virada para mana e com a mana ainda na reserva: um toque desvira e devolve a mana.
  const untappable = !!s.input.untappable?.includes(c.id);
  if (usable(s, c.id) || untappable) inner.push('actionable');
  const selected = selectedForInput(s, c.id);
  const selectionCandidate = !!s.input.selection && (usable(s, c.id) || selected);
  if (selected) inner.push('choice-selected');
  const prolif = proliferateBoardClass(s, 'card', c.id);
  if (prolif) inner.push(prolif);
  const blockCandidate = !!s.input.blocking?.blockers.includes(c.id);
  const blockSelected = validBlockSelection(s, v.selectedBlocker) && v.selectedBlocker.blocker === c.id;
  if (blockCandidate) inner.push('block-candidate');
  if (blockSelected) inner.push('block-selected');
  if (legalBlockTargets(s, v.selectedBlocker).includes(c.id)) inner.push('block-target');
  const dmg = c.damage ?? 0;
  if (dmg > (v.lastDamage.get(c.id) ?? 0)) inner.push('hit');
  // Ataque a um planeswalker: o atacante mostra o alvo e o planeswalker mostra quem o ataca.
  const combat = ci.attack ? s.combat[ci.attack - 1] : undefined;
  const target = combat?.defenderKind !== 'player' ? byId.get(combat?.defender ?? -1) : undefined;
  const defendingPlayer = combat?.defenderKind === 'player' ? s.players.find(p => p.id === combat.defender) : undefined;
  const attackers = s.combat.map((x, i) => (x.defenderKind !== 'player' && x.defender === c.id ? i + 1 : 0)).filter(Boolean);
  if (attackers.length) slot.push('attacked');
  let tag = '';
  if (ci.attack) tag = `<span class="tag atk">${ICON_SWORD}${ci.attack}${target ? ` ▸ ${esc(label(target).split(',')[0]!)}` : defendingPlayer && s.players.length > 2 ? ` ▸ ${esc(defendingPlayer.name)}` : ''}</span>`;
  else if (ci.block) tag = `<span class="tag blk">${ICON_SHIELD}${ci.block}</span>`;
  else if (attackers.length) tag = `<span class="tag atk">Atacado ${ICON_SWORD}${attackers.join(',')}</span>`;
  else if (untappable) tag = '<span class="tag untap" title="A mana ainda não foi gasta: toque para desvirar e devolver a mana" aria-hidden="true">↺</span>';
  else if (c.creature && c.sick) tag = `<span class="tag zzz" title="Enjoo de invocação">${ICON_DIZZY}</span>`;
  if (v.attackSelected(s, c.id)) { inner.push('attack-selected'); tag = `<span class="tag block-pending">${ICON_SWORD}Selecionada</span>`; }
  if (v.attackTargets(s).some(target => target.kind === 'card' && target.id === c.id)) inner.push('attack-target');
  if (blockSelected) tag = `<span class="tag block-pending">${ICON_SHIELD}Selecionada</span>`;
  const loyalty = c.planeswalker ? c.counters?.LOYALTY ?? 0 : undefined;
  const pt = c.creature
    ? `<span class="pt"><b class="${delta(c.power ?? 0, c.basePower)}">${c.power}</b>/<b class="${dmg > 0 ? 'down' : delta(c.toughness ?? 0, c.baseToughness)}">${(c.toughness ?? 0) - dmg}</b></span>`
    : loyalty !== undefined ? loyaltyHTML(s, c.id, loyalty)
    : c.classLevel ? `<span class="pt class-level" title="${esc(classLevelText(c))}"><small>Nv</small><b>${c.classLevel}</b>${c.classMaxLevel ? `<small>/${c.classMaxLevel}</small>` : ''}</span>` : '';
  const shown = Object.entries(c.counters ?? {}).filter(([k]) => !(c.planeswalker && k === 'LOYALTY'));
  const counters = shown.length
    ? `<span class="counters">${shown.map(([k, n]) => chip(v, 'ctr', `${c.id}:${k}`, COUNTER_ICON[k] ?? KEYWORD_ICON[k] ?? COUNTER_DISC, `${counterLabel(k)} ×${n}`, n)).join('')}</span>` : '';
  const kws = fieldKeywordsOf(c);
  const kwHTML = kws.length ? `<span class="kws">${kws.map(k => chip(v, 'ctr kw', `${c.id}:kw:${k}`, KEYWORD_ICON[k] ?? COUNTER_DISC, KEYWORD_LABEL[k] ?? k)).join('')}</span>` : '';
  // Selo único que substitui marcadores e palavras-chave quando eles não cabem na carta (layoutCounters); toca e abre o inspetor.
  const sumText = [shown.length ? `Marcadores: ${shown.map(([k, n]) => `${counterLabel(k)} ×${n}`).join(', ')}.` : '', kws.length ? `Habilidades: ${kws.map(k => KEYWORD_LABEL[k]).join(', ')}.` : ''].filter(Boolean).join(' ');
  const sumHTML = shown.length + kws.length > 1 && !c.faceDown && c.name
    ? `<span class="ctr ctr-sum" data-inspect="${c.id}" role="button" tabindex="0" aria-label="${esc(`${sumText} Toque para ver os detalhes.`)}">${ICON_LAYERS}<b>${shown.length + kws.length}</b><span class="ctr-tip">${esc(sumText)}<small>Toque para ver os detalhes.</small></span></span>` : '';
  // A ponte marca o comandante; uma ponte mais antiga só manda a lista de comandantes de cada jogador (mesmo id da carta).
  const isCommander = !!c.commander || s.players.some(p => p.commanders?.some(cm => cm.id === c.id));
  const mutated = (c.merged?.length ?? 0) > 1;
  if (mutated) inner.push('mutated');
  // Portador do Anel: anel dourado no canto de cima à direita; a dica diz o que o Anel já faz por ele.
  const ringTempted = c.ringBearer ? s.players.find(p => p.id === c.controller)?.ringTempted ?? 0 : 0;
  const badges = [isCommander ? `<span class="badge commander" title="Comandante">${ICON_CROWN}</span>` : '',
    c.ringBearer ? `<span class="badge ring-bearer" title="${esc(['Portador do Anel.', ringTempted ? ringText(ringTempted) : ''].join(' ').trim())}">${RING_ICON}</span>` : '', c.copyOf ? `<span class="badge copy" title="${esc(c.copyOf)} copiando ${esc(label(c))}">Cópia</span>` : '',
    mutated ? `<span class="badge mutated" title="${esc(mergedText(c.merged!))}">Mutada ×${c.merged!.length}</span>` : '',
    c.token ? '<span class="badge token">Ficha</span>' : '',
    c.prepared ? `<span class="badge prepared" title="${esc(c.preparedSpell ? `Preparada: quem a controla pode conjurar uma cópia de ${c.preparedSpell}` : 'Preparada')}">Preparada</span>` : ''].join('');
  // Efeitos contínuos (item 17): moldura, brilho e selos, na borda ou fora da carta.
  const caster = s.stack.find(item => item.targets?.cards?.includes(c.id))?.controller;
  const aura = attached.find(a => /\bAura\b/.test(a.typeLine ?? ''));
  const fx = permanentFx(c, { targeted: caster === undefined ? undefined : caster === s.you ? 'mine' : 'theirs', enchanted: !!aura, playerName: v.playerName, you: s.you });
  const fxView = permanentFxHTML(fx, aura ? auraColor(aura.manaCost) : undefined);
  inner.push(...fxView.classes);
  if (v.faceStyle(c, true) === 'arena') {
    inner.push('ar-field');
    if (c.creature || c.token) slot.push('ar-square');
  }
  const aria = [label(c), untappable ? 'virada para mana, toque para desvirar e devolver a mana' : '', isCommander ? 'comandante' : '', c.ringBearer ? 'Portador do Anel' : '', c.copyOf ? `cópia feita por ${c.copyOf}` : '', mutated ? mergedText(c.merged!).toLowerCase() : '', c.token ? 'ficha' : '', c.prepared ? `preparada${c.preparedSpell ? `, pode conjurar ${c.preparedSpell}` : ''}` : '', permanentFxText(fx),
    kws.map(k => KEYWORD_LABEL[k]).join(', '), shown.map(([k, n]) => `${counterLabel(k)} ×${n}`).join(', '), loyalty !== undefined ? `lealdade ${loyalty}` : '', c.classLevel ? classLevelText(c).toLowerCase() : '', attached.length ? `com ${attached.map(label).join(', ')}` : '', exiledAria(exiledUnder(s, c.id))].filter(Boolean).join(', ');
  const atts = attached.map((a, i) =>
    `<div class="att${usable(s, a.id) ? ' actionable' : ''}${selectedForInput(s, a.id) ? ' choice-selected' : ''}" data-fid="${a.id}" role="button" tabindex="0"${s.input.selection ? ` aria-pressed="${selectedForInput(s, a.id)}"` : ''} style="--i:${i + 1}" aria-label="${esc(label(a))}, presa a ${esc(label(c))}">${v.face(a, 'small', true)}${selectedBadge(s, a)}</div>`).join('');
  // Com dois ou mais anexos o leque fica estreito: o selo abre todos eles, junto da carta, em tamanho normal.
  const attsN = attached.length > 1
    ? `<button class="att-n${attached.some(a => usable(s, a.id)) ? ' actionable' : ''}" data-group="${[c.id, ...attached.map(a => a.id)].join(',')}" data-group-title="Presas a ${esc(label(c))}" aria-label="Ver ${attached.length} cartas presas a ${esc(label(c))}">${ICON_CLIP}${attached.length}</button>` : '';
  // Cartas que ela exilou (Journey to Nowhere, Oblivion Ring...): atrás dela, saindo por baixo, esmaecidas. O selo no
  // alto da permanente (como o dos anexos) abre o inspetor dela, com as exiladas embaixo, como numa mutação.
  const exiled = exiledUnder(s, c.id);
  const exu = exiled.slice(0, 3).map((x, i) =>
    `<div class="exu${usable(s, x.id) ? ' actionable' : ''}" data-fid="${x.id}" role="button" tabindex="0" style="--j:${i + 1}" aria-label="${esc(label(x))}, exilada por ${esc(label(c))}">${v.face(x, 'small', true)}</div>`).join('');
  const exuN = exiled.length
    ? `<button class="exu-n${exiled.some(x => usable(s, x.id)) ? ' actionable' : ''}" data-inspect="${c.id}" aria-label="${esc(exiled.length > 1 ? `Ver ${label(c)} e as ${exiled.length} cartas que exilou` : `Ver ${label(c)} e a carta que exilou`)}">${ICON_EXILE}${exiled.length}</button>` : '';
  if (exiled.length) slot.push('has-exu');
  const style = attached.length || exiled.length ? ` style="${attached.length ? `--atts:${attached.length};` : ''}${exiled.length ? `--exus:${Math.min(exiled.length, 3)}` : ''}"` : '';
  if (attached.length) slot.push('has-att');
  return `<div class="${slot.join(' ')}"${style}>${exu}${atts}<div class="${inner.join(' ')}" data-fid="${c.id}" role="button" tabindex="0"${selectionCandidate ? ` aria-pressed="${selected}"` : blockCandidate ? ` aria-pressed="${blockSelected}"` : ''} aria-label="${esc(aria)}">${fxView.html}${v.face(c, 'small', true)}${badges}${tag}${kwHTML}${pt}${counters}${sumHTML}${selectedBadge(s, c)}</div>${attsN}${exuN}${inspectButton(c)}</div>`;
}
/**
 * Cartas de uma fileira, sem as auras/equipamentos (que vão desenhados junto da carta a que estão presos). As criaturas
 * vêm primeiro; planeswalkers e batalhas (que são atacados, como os jogadores) ficam juntos no fim, num grupo separado.
 */
export function fieldRow(v: BoardView, s: FState, cards: FCard[]) {
  const byId = battlefieldById(s);
  const shown = cards.filter(c => c.attachedTo == null || !byId.has(c.attachedTo));
  const front = stacks(v, s, shown.filter(c => !isAttackablePermanent(c))), attackable = stacks(v, s, shown.filter(isAttackablePermanent));
  if (!attackable) return front;
  return `${front ? `<div class="perm-group creatures-group">${front}</div>` : ''}<div class="perm-group attackable-group" aria-label="Planeswalkers e batalhas">${attackable}</div>`;
}
/** Planeswalker ou batalha que não é criatura: um planeswalker que vira criatura volta para junto das criaturas. */
export function isAttackablePermanent(c: FCard) {
  return !c.creature && (!!c.planeswalker || /\bBattle\b/i.test(c.typeLine ?? ''));
}
/** Fileira de trás: terrenos e artefatos/encantamentos que não são criaturas (nem planeswalkers ou batalhas). */
export function isBackRow(c: FCard) {
  if (c.creature || c.planeswalker) return false;
  return !!c.land || /\b(Artifact|Enchantment)\b/i.test(c.typeLine ?? '');
}
/**
 * Empilha cópias iguais: mesmo nome, estado, marcadores e, nas criaturas, mesmo P/T, dano, palavras-chave
 * e enjoo. Cartas com algo preso ou envolvidas no combate ficam sozinhas (ao declarar ataque, todas menos os
 * terrenos, que não atacam nem são atacados). Com `tappedPile`, os terrenos virados
 * sem marcadores formam um monte só, de nomes diferentes.
 */
export function stacks(v: BoardView, s: FState, cards: FCard[], tappedPile = false) {
  const atts = attachmentsOf(s);
  const groups = new Map<string, FCard[]>();
  for (const c of cards) {
    const ctr = Object.entries(c.counters ?? {}).filter(([, v]) => v).sort().join(',');
    const ci = combatIndex(s, c.id);
    const alone = (!!s.input.attacking && !c.land) || !!s.input.selection || (!!s.input.blocking && c.creature && c.controller === s.you) || atts.has(c.id) || exiledUnder(s, c.id).length > 0 || !!c.merged?.length || c.faceDown || c.attacking || c.blocking || ci.attack || ci.block || s.combat.some(x => x.defender === c.id);
    const body = (c.creature ? `|${c.power}/${c.toughness}|${c.damage ?? 0}|${!!c.sick}` : '') + `|${fieldKeywordsOf(c).sort()}`;
    const k = alone ? `#${c.id}` : tappedPile && c.land && c.tapped && !ctr && !usable(s, c.id) && !s.input.untappable?.includes(c.id) ? 'tapped-lands' : `${c.name}|${c.tapped}|${usable(s, c.id)}|${c.token}|${!!c.prepared}|${c.copyOf ?? ''}|${ctr}${body}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  return [...groups.values()].map(cs => {
    const [first] = cs;
    if (!first) return '';
    const mixed = cs.some(c => c.name !== first.name);
    return `<div class="stack" style="--n:${cs.length}">${cs.map(c => bfCard(v, s, c, atts.get(c.id))).join('')}${
      cs.length > 1 ? `<button class="stack-n" data-group="${cs.map(c => c.id).join(',')}" data-group-title="${mixed ? 'Terrenos virados' : 'Cartas do grupo'}" aria-label="${mixed ? `Ver ${cs.length} terrenos virados` : `Ver ${cs.length} cópias de ${esc(label(first))}`}">×${cs.length}</button>` : ''}</div>`;
  }).join('');
}
export function backRow(v: BoardView, s: FState, p: FPlayer) {
  const byId = battlefieldById(s);
  const back = p.battlefield.filter(c => isBackRow(c) && (c.attachedTo == null || !byId.has(c.attachedTo)));
  const lands = stacks(v, s, back.filter(c => c.land), v.compact);
  const others = stacks(v, s, back.filter(c => !c.land));
  // Artefatos e encantamentos primeiro: a fileira começa por eles, e quando não cabe tudo são os terrenos que ficam para rolar.
  return `${others ? `<div class="perm-group others-group" aria-label="Artefatos e encantamentos">${others}</div>` : ''}${lands ? `<div class="perm-group lands-group">${lands}</div>` : ''}`;
}
/** Lealdade do planeswalker; atacado, na declaração de bloqueadores, também a prevista depois do combate ("3 → 1"). */
export function loyaltyHTML(s: FState, id: number, loyalty: number) {
  const w = walkerForecast(s.forecast, id);
  if (!w || w.after >= w.loyalty) return `<span class="pt loyalty" title="Lealdade"><b>${loyalty}</b></span>`;
  return `<span class="pt loyalty forecast${w.after <= 0 ? ' lethal' : ''}" title="Lealdade: ${w.loyalty} agora, ${w.after} depois do combate"><b>${w.loyalty}</b><span class="lf-arrow">→</span><b>${w.after}</b></span>`;
}
