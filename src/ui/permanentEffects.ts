import type { FCard, FCardState } from '../forge/client';
import { esc, manaHTML, pip } from './cardtext';

/**
 * Efeitos contínuos de uma permanente no campo (item 17 do roadmap): uma moldura e um brilho no máximo, escolhidos
 * por importância, mais detalhes na base e selos embaixo da carta. Tudo fica na borda ou fora da carta, para não
 * cobrir nome, custo nem P/T; o movimento (pulsar, correr) só existe sem "reduzir movimento" (no CSS).
 */
export interface PermanentFx {
  frame?: 'indestructible' | 'ward' | 'protection' | 'menace' | 'defender' | 'token';
  glow?: 'hexproof' | 'shroud' | 'lifelink' | 'enchanted' | 'plus' | 'minus';
  base: ('deathtouch' | 'haste' | 'chained')[];
  /** Detalhes na borda esquerda: asa (voar), olho (vigilância), pegadas (atropelar), caveira (toque mortífero) e espada/escudo riscados (não pode atacar/bloquear). */
  corner: ('flying' | 'vigilance' | 'trample' | 'deathtouch' | 'no-attack' | 'no-block')[];
  seals: { kind: 'ward' | 'protection' | 'prevent' | 'face-down' | StatusKind; html: string; label: string }[];
  phased: boolean;
  targeted?: 'mine' | 'theirs';
  sick: boolean;
  /** "não pode atacar", "não pode bloquear" ou os dois. */
  restricted?: string;
}

const COLOR_PIP: Record<string, string> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
const PIP_COLOR = Object.fromEntries(Object.entries(COLOR_PIP).map(([name, letter]) => [letter, name]));
const PROTECTION_LABEL: Record<string, string> = {
  white: 'branco', blue: 'azul', black: 'preto', red: 'vermelho', green: 'verde', artifact: 'artefatos', artifacts: 'artefatos',
  creature: 'criaturas', creatures: 'criaturas', multicolored: 'multicoloridas', monocolored: 'monocoloridas', everything: 'tudo',
  colorless: 'incolores', instant: 'instantâneas', sorcery: 'feitiços', enchantment: 'encantamentos', planeswalker: 'planeswalkers',
};
const FACE_DOWN_LABEL: Record<string, string> = { morph: 'Metamorfose', disguise: 'Disfarce', manifest: 'Manifestada', cloak: 'Encoberta' };
const AURA_COLOR: Record<string, string> = { W: '#f4e7b8', U: '#5aa9e6', B: '#a284c9', R: '#ef6a4f', G: '#5cbf74', M: '#f2b54c', C: '#c3c8d2', L: '#c3c8d2' };
/** Cor do brilho da carta encantada: a cor da aura (dourado se tiver várias cores). */
export function auraColor(manaCost = '') {
  const colors = new Set(manaCost.match(/[WUBRG]/g) ?? []);
  return AURA_COLOR[colors.size > 1 ? 'M' : [...colors][0] ?? 'C'];
}
export const protectionLabel = (from: string) => PROTECTION_LABEL[from] ?? from;

export function permanentFx(c: FCard, context: { targeted?: 'mine' | 'theirs'; enchanted?: boolean; playerName?: (id: number) => string } = {}): PermanentFx {
  const k = new Set(c.keywords ?? []);
  const has = (name: string) => k.has(name);
  const p1 = c.counters?.P1P1 ?? 0, m1 = c.counters?.M1M1 ?? 0;
  const frame = has('INDESTRUCTIBLE') ? 'indestructible' : has('WARD') ? 'ward' : has('PROTECTION') ? 'protection'
    : c.creature && has('MENACE') ? 'menace' : c.creature && has('DEFENDER') ? 'defender' : c.token ? 'token' : undefined;
  const glow = has('HEXPROOF') ? 'hexproof' : has('SHROUD') ? 'shroud' : c.creature && has('LIFELINK') ? 'lifelink'
    : context.enchanted ? 'enchanted' : p1 > m1 ? 'plus' : m1 > p1 ? 'minus' : undefined;
  const base: PermanentFx['base'] = [];
  if (c.creature && has('DEATHTOUCH')) base.push('deathtouch');
  if (c.creature && has('HASTE') && c.sick) base.push('haste');
  if (c.creature && (c.cantAttack || c.cantBlock)) base.push('chained');
  const CORNER = { FLYING: 'flying', VIGILANCE: 'vigilance', TRAMPLE: 'trample', DEATHTOUCH: 'deathtouch' } as const;
  const corner: PermanentFx['corner'] = c.creature ? (Object.keys(CORNER) as (keyof typeof CORNER)[]).filter(has).map(k => CORNER[k]) : [];
  if (c.creature && c.cantAttack) corner.push('no-attack');
  if (c.creature && c.cantBlock) corner.push('no-block');
  const seals: PermanentFx['seals'] = [];
  if (has('WARD')) seals.push({ kind: 'ward', html: `Ward ${c.ward?.startsWith('{') ? manaHTML(c.ward) : esc(c.ward ?? '')}`, label: `Proteção contra alvos${c.ward ? `: ${c.ward}` : ''}` });
  if (c.protection?.length) {
    const pips = c.protection.filter(p => COLOR_PIP[p]).map(p => pip(COLOR_PIP[p])).join('');
    const words = c.protection.filter(p => !COLOR_PIP[p]).map(protectionLabel).join(', ');
    seals.push({ kind: 'protection', html: `Prot. ${pips}${words ? `${pips ? ' ' : ''}${esc(words)}` : ''}`, label: `Proteção contra ${c.protection.map(protectionLabel).join(', ')}` });
  }
  if (c.preventDamage) seals.push({ kind: 'prevent', html: `Prevenir ${c.preventDamage}`, label: `Previne os próximos ${c.preventDamage} de dano` });
  if (c.faceDown) {
    const kind = c.faceDownKind && FACE_DOWN_LABEL[c.faceDownKind];
    seals.push({ kind: 'face-down', html: kind ? `${kind} 2/2` : '2/2', label: `Virada para baixo${kind ? ` (${kind})` : ''}, 2/2` });
  }
  seals.push(...permanentStatus(c, context.playerName));
  const restricted = c.cantAttack && c.cantBlock ? 'não pode atacar nem bloquear' : c.cantAttack ? 'não pode atacar' : c.cantBlock ? 'não pode bloquear' : undefined;
  return { frame, glow, base, corner, seals, phased: !!c.phasedOut, targeted: context.targeted, sick: !!(c.creature && c.sick), restricted };
}

type StatusKind = `type ${TypeIcon}` | 'control' | 'goaded' | 'regen' | 'chosen' | 'protector' | 'foretold' | 'devotion' | 'devotion met' | `state ${FCardState}`;
const icon = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="currentColor"/></svg>`;
const STATUS_ICON: Record<'control' | 'goaded' | 'regen' | 'chosen' | 'protector', string> = {
  control: icon('M7 4 3 8l4 4V9h10V7H7zm10 8v3H7v2h10v3l4-4z'),
  goaded: icon('M12 2 9 9H2l5.6 4.2L5.5 21 12 16.3l6.5 4.7-2.1-7.8L22 9h-7z'),
  regen: icon('M12 4V1L8 5l4 4V6a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z'),
  protector: icon('M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z'),
  chosen: icon('M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 9A1.5 1.5 0 1 0 7.5 6a1.5 1.5 0 0 0 0 3z'),
};
const STATE_ICON: Record<FCardState, string> = {
  monstrous: icon('M5 3c1 4 1 7 0 10l3 1c1-3 1-7 0-11zm5 0c1 5 1 9 0 14l3 1c1-5 1-10 0-15zm5 1c1 5 1 9 0 13l3 1c1-5 1-9 0-14zM3 18h18v3H3z'),
  renowned: icon('M12 2l2.4 5 5.6.8-4 3.9.9 5.5L12 14.6 7.1 17.2l.9-5.5-4-3.9 5.6-.8zM6 19h12v3H6z'),
  suspected: icon('M10 2a8 8 0 0 1 6.3 12.9l5.4 5.4-1.4 1.4-5.4-5.4A8 8 0 1 1 10 2zm0 3a2.8 2.8 0 0 0-2.8 2.8h2a.8.8 0 1 1 1.3.6c-.9.7-1.5 1.3-1.5 2.6h2c0-.6.2-.8.8-1.3A2.8 2.8 0 0 0 10 5zm-1 7v2h2v-2z'),
  saddled: icon('M4 9c3 0 5 2 8 2s5-2 8-2l1 4c-2 0-3 1-4 3h-2l-1 5h-4l-1-5H7c-1-2-2-3-4-3z'),
  crewed: icon('M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3a7 7 0 0 1 6.9 6H14a2 2 0 0 0-4 0H5.1A7 7 0 0 1 12 5zM5.1 13H10l-2.5 5.3A7 7 0 0 1 5.1 13zm8.9 0h4.9a7 7 0 0 1-2.4 5.3z'),
  exerted: icon('M11 2h2v11l3.5-3.5 1.4 1.4L12 16.8l-5.9-5.9 1.4-1.4L11 13zM4 19h16v3H4z'),
  detained: icon('M7 10V7a5 5 0 0 1 10 0v3h2v12H5V10zm3 0h4V7a2 2 0 0 0-4 0zm1 4v4h2v-4z'),
  harnessed: icon('M12 2l7 5v10l-7 5-7-5V7zm0 4-3 2v8l3 2 3-2V8z'),
  solved: icon('M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z'),
};
/** Nome e o que o estado muda, para o balão e o inspetor. */
function stateLabel(state: FCardState, c: FCard) {
  const by = (names?: string[]) => names?.length ? ` por ${list(names)}` : '';
  switch (state) {
    case 'monstrous': return 'Monstruosa: já usou a monstruosidade e não fica monstruosa de novo. O que depende de ela ser monstruosa vale enquanto estiver no campo.';
    case 'renowned': return 'Renomada: ganhou o renome ao causar dano de combate a um jogador e não ganha de novo. O que depende de ela ser renomada vale enquanto estiver no campo.';
    case 'suspected': return 'Suspeita: tem ameaça e não pode bloquear enquanto estiver suspeita.';
    case 'saddled': return `Selada neste turno${by(c.saddledBy)}: o que vale quando ela ataca selada está ligado. Deixa de estar selada no fim do turno.`;
    case 'crewed': return `Tripulada neste turno${by(c.crewedBy)}.`;
    case 'exerted': return 'Exaurida: não desvira na próxima etapa de desvirar de quem a controla.';
    case 'detained': return 'Detida: não pode atacar nem bloquear, e as habilidades ativadas dela não podem ser ativadas, até o próximo turno de quem a deteve.';
    case 'harnessed': return 'Atrelada: o que depende de ela estar atrelada está ligado.';
    case 'solved': return 'Caso solucionado: a habilidade de Solucionado está ligada.';
  }
}
const list = (names: string[]) => names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0] ?? '';

/**
 * Estados que o motor guarda e a carta impressa não mostra: controle trocado, atiçada, escudos de regeneração, o que a
 * carta escolheu, a devoção das cartas que contam com ela e os estados de uma vez só (monstruosa, suspeita, exaurida...).
 * Na mesa ficam como selos pequenos (controle, atiçada e os estados só com o ícone); o texto vai no balão e no inspetor.
 */
export function permanentStatus(c: FCard, playerName: (id: number) => string = id => `Jogador ${id}`): PermanentFx['seals'] {
  const seals: PermanentFx['seals'] = [];
  if (c.owner !== undefined && c.controller !== undefined && c.owner !== c.controller) {
    const owner = playerName(c.owner);
    seals.push({ kind: 'control', html: STATUS_ICON.control, label: `Pertence a ${owner}; quem a controla agora é ${playerName(c.controller)}. Volta para ${owner} quando o efeito de controle acabar.` });
  }
  if (c.protector !== undefined) {
    const who = playerName(c.protector), defense = c.counters?.DEFENSE;
    seals.push({ kind: 'protector', html: `${STATUS_ICON.protector}<span class="fx-chosen">${esc(who)}</span>`,
      label: `Batalha defendida por ${who}: é quem bloqueia as criaturas que a atacam${defense !== undefined ? `. Faltam ${defense} de dano para derrotá-la` : ''}. Quando sai o último marcador de defesa, quem a controla a exila e pode conjurá-la transformada.` });
  }
  if (c.goadedBy?.length) {
    const by = list(c.goadedBy.map(playerName));
    seals.push({ kind: 'goaded', html: STATUS_ICON.goaded, label: `Atiçada por ${by}: ataca em todo combate, se puder, e ataca um jogador que não seja ${by}, se puder. Dura até o próximo turno de quem atiçou.` });
  }
  if (c.shields) {
    seals.push({ kind: 'regen', html: `${STATUS_ICON.regen}${c.shields > 1 ? `×${c.shields}` : ''}`, label: `${c.shields > 1 ? `${c.shields} escudos de regeneração` : 'Escudo de regeneração'}: da próxima vez que seria destruída neste turno, em vez disso é virada, sai do combate e perde o dano marcado.` });
  }
  const ch = c.chosen;
  if (ch) {
    const shown: string[] = [], said: string[] = [];
    const colors = ch.colors ?? [];
    if (ch.types?.length) { shown.push(esc(ch.types.join(' / '))); said.push(`tipo ${ch.types.join(' e ')}`); }
    if (colors.length) { shown.push(colors.map(k => COLOR_PIP[k] ? pip(COLOR_PIP[k]) : esc(protectionLabel(k))).join('')); said.push(`${colors.length > 1 ? 'cores' : 'cor'} ${list(colors.map(protectionLabel))}`); }
    if (ch.names?.length) { shown.push(esc(ch.names[0])); said.push(`${ch.names.length > 1 ? 'cartas nomeadas' : 'carta nomeada'} ${list(ch.names)}`); }
    if (ch.player !== undefined) { shown.push(esc(playerName(ch.player))); said.push(`jogador ${playerName(ch.player)}`); }
    if (ch.number) { shown.push(esc(ch.number)); said.push(`número ${ch.number}`); }
    if (ch.mode) { shown.push(esc(ch.mode)); said.push(`modo ${ch.mode}`); }
    if (said.length) seals.push({ kind: 'chosen', html: `${STATUS_ICON.chosen}<span class="fx-chosen">${shown.join(' · ')}</span>`, label: `Escolhido pela carta: ${said.join('; ')}.` });
  }
  const typed = typeSeal(c);
  if (typed) seals.push(typed);
  for (const state of c.states ?? []) if (STATE_ICON[state]) seals.push({ kind: `state ${state}`, html: STATE_ICON[state], label: stateLabel(state, c) });
  // Prevista só existe no exílio: não vira selo na mesa, só a frase do balão e do inspetor.
  if (c.foretold && c.name) seals.push({ kind: 'foretold', html: '', label: `Prevista: ${c.foretellCost ? `quem a previu pode conjurá-la do exílio por ${c.foretellCost}` : 'quem a previu pode conjurá-la do exílio pelo custo previsto'}, a partir do turno seguinte ao da previsão. Os outros jogadores só veem o verso.` });
  const dev = c.devotion;
  if (dev?.colors.length) {
    const pips = dev.colors.map(k => pip(k)).join('');
    const to = `Devoção ao ${list(dev.colors.map(k => protectionLabel(PIP_COLOR[k] ?? k)))}: ${dev.value}`;
    const met = dev.need !== undefined && dev.value >= dev.need;
    const label = dev.need === undefined ? `${to}.`
      : met ? `${to}. Com ${dev.need} ou mais, é criatura.` : `${to}. Só é criatura com ${dev.need} (falta${dev.need - dev.value > 1 ? 'm' : ''} ${dev.need - dev.value}).`;
    seals.push({ kind: met ? 'devotion met' : 'devotion', html: `${pips}${dev.value}${dev.need !== undefined ? `/${dev.need}` : ''}`, label });
  }
  return seals;
}

/*
 * Tipo ganho ou perdido (item 50 do roadmap): March of the Machines, Kormus Bell, Mycosynth Lattice, Imprisoned in the
 * Moon, Urborg... A ponte manda a linha impressa da face à mostra (printedType) só quando difere da atual (typeLine).
 * Os tipos são comparados como conjuntos, então a ordem em que o Forge escreve não conta.
 */
const CARD_TYPES = ['Creature', 'Artifact', 'Enchantment', 'Land', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Kindred', 'Tribal', 'Dungeon'];
const SUPERTYPES = ['Legendary', 'Basic', 'Snow', 'World', 'Ongoing', 'Elite', 'Host'];
const TYPE_LABEL: Record<string, string> = {
  Creature: 'Criatura', Artifact: 'Artefato', Enchantment: 'Encantamento', Land: 'Terreno', Planeswalker: 'Planeswalker', Battle: 'Batalha',
  Instant: 'Mágica Instantânea', Sorcery: 'Feitiço', Kindred: 'Tribal', Tribal: 'Tribal', Dungeon: 'Masmorra',
  Legendary: 'Lendária', Basic: 'Básica', Snow: 'da Neve', World: 'Mundial', Ongoing: 'Contínua', Elite: 'Elite', Host: 'Anfitriã',
};
const typeLabel = (t: string) => TYPE_LABEL[t] ?? t;
interface ParsedType { types: string[]; subtypes: string[]; all: boolean }
/** "Legendary Artifact Creature - Golem" (Forge) ou "Artifact Creature — Golem" (Scryfall): tipos, subtipos e o "(All)" dos changelings. */
export function parseTypeLine(line: string): ParsedType {
  const all = /\(All\b[^)]*\)/.test(line);
  const [before, ...after] = line.replace(/\(All\b[^)]*\)/g, ' ').split(/\s+[—–-]\s+/);
  const words = (text = '') => text.split(/\s+/).filter(Boolean);
  return { types: words(before).filter(w => w !== 'Token'), subtypes: words(after.join(' ')), all };
}
export interface TypeChange {
  /** Tipos e supertipos ganhos e perdidos, com os nomes do Forge (Creature, Artifact, Legendary...). */
  gained: string[]; lost: string[];
  gainedSub: string[]; lostSub: string[];
  /** Ganhou todos os tipos de criatura. */
  allTypes: boolean;
  /** Nenhum dos tipos de carta atuais estava impresso: "agora é Terreno", e não "agora também". */
  replaced: boolean;
  /** Tipos de carta impressos (da face usada na comparação). */
  printed: string[];
}
const changeSize = (t: TypeChange) => t.gained.length + t.lost.length + t.gainedSub.length + t.lostSub.length + (t.allTypes ? 1 : 0);
/**
 * O que mudou entre a linha de tipo impressa e a atual. Numa carta de duas faces ("A // B"), vale a face mais
 * parecida com a atual, para a face transformada nunca parecer um tipo ganho. Sem mudança, undefined.
 */
export function typeChange(printed?: string, current?: string): TypeChange | undefined {
  if (!printed || !current) return undefined;
  const now = parseTypeLine(current);
  const nowCore = now.types.filter(t => CARD_TYPES.includes(t));
  const minus = (a: string[], b: string[]) => a.filter(t => !b.includes(t));
  let best: TypeChange | undefined;
  for (const face of printed.split(/\s+\/\/\s+/).map(parseTypeLine)) {
    const allTypes = now.all && !face.all;
    const gained = minus(now.types, face.types);
    const change: TypeChange = {
      gained, lost: minus(face.types, now.types),
      gainedSub: allTypes ? [] : minus(now.subtypes, face.subtypes), lostSub: now.all ? [] : minus(face.subtypes, now.subtypes), allTypes,
      replaced: nowCore.length > 0 && nowCore.every(t => gained.includes(t)), printed: face.types.filter(t => CARD_TYPES.includes(t)),
    };
    if (!best || changeSize(change) < changeSize(best)) best = change;
  }
  return best && changeSize(best) ? best : undefined;
}
/** Criatura primeiro, como nas cartas em português ("Criatura Artefato"), e os supertipos depois dos tipos. */
function typesText(types: string[]) {
  const core = types.filter(t => !SUPERTYPES.includes(t)).sort((a, b) => Number(b === 'Creature') - Number(a === 'Creature'));
  return [...core, ...types.filter(t => SUPERTYPES.includes(t))].map(typeLabel).join(' ');
}
/** O que a carta ganhou ou perdeu, para ir depois da linha impressa: "agora também Criatura 3/3", "agora é Terreno; não é mais Criatura". */
export function typeChangeText(change: TypeChange, c: Pick<FCard, 'power' | 'toughness' | 'creature'> = {}) {
  const pt = change.gained.includes('Creature') && c.creature && c.power !== undefined && c.toughness !== undefined ? ` ${c.power}/${c.toughness}` : '';
  const sub = [...change.gainedSub, ...(change.allTypes ? ['todos os tipos de criatura'] : [])].join(' ');
  const types = typesText(change.gained);
  const gained = types && sub ? `${types} — ${sub}` : types || sub;
  // Quem perde o tipo de carta perde junto os subtipos dele: basta dizer o tipo.
  const lost = change.lost.length ? typesText(change.lost) : change.lostSub.join(' ');
  return [gained ? `agora ${change.replaced ? 'é' : 'também'} ${gained}${pt}` : '', lost ? `não é mais ${lost}` : ''].filter(Boolean).join('; ');
}
type TypeIcon = 'creature' | 'artifact' | 'land' | 'enchantment' | 'other' | 'lost';
const iconEO = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="currentColor" fill-rule="evenodd"/></svg>`;
const TYPE_ICON: Record<TypeIcon, string> = {
  creature: icon('M4 3.5 6.6 3 9 20.5l-2.6.5zm6.7-.5h2.6v18h-2.6zm6.7.5 2.6.5-2.4 17.5-2.6-.5z'),
  artifact: iconEO('M10.3 2h3.4l.5 2.6 1.9 1 2.4-1 1.8 2.9-1.9 1.8v2.2l1.9 1.8-1.8 2.9-2.4-1-1.9 1-.5 2.6h-3.4l-.5-2.6-1.9-1-2.4 1-1.8-2.9 1.9-1.8V9.3L3.7 7.5l1.8-2.9 2.4 1 1.9-1zM12 8.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z'),
  land: icon('M1.5 20 9 7l3.6 6.2L15.5 9 22.5 20z'),
  enchantment: icon('M12 2l2.1 6.9L21 11l-6.9 2.1L12 20l-2.1-6.9L3 11l6.9-2.1zM19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z'),
  other: STATUS_ICON.chosen,
  lost: iconEO('M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2.5a7.5 7.5 0 0 0-5.9 12.1L16.6 6.1A7.5 7.5 0 0 0 12 4.5zm5.9 3.4L7.4 17.9A7.5 7.5 0 0 0 17.9 7.9z'),
};
/** O tipo mudado da permanente, sem o que já tem marca própria: o changeling (todos os tipos impressos) e o deus de Theros sem devoção. */
export function permanentTypeChange(c: FCard): TypeChange | undefined {
  if (c.faceDown) return undefined;
  const change = typeChange(c.printedType, c.typeLine);
  if (!change) return undefined;
  if (c.keywords?.includes('CHANGELING')) change.allTypes = false;
  if (c.devotion?.need !== undefined) change.lost = change.lost.filter(t => t !== 'Creature');
  return changeSize(change) ? change : undefined;
}
/** Linha impressa e o que mudou: "Artefato — agora também Criatura 3/3". */
export function typeChangeLine(c: FCard, change = permanentTypeChange(c)) {
  if (!change) return undefined;
  const printed = typesText(change.printed);
  return `${printed ? `${printed} — ` : ''}${typeChangeText(change, c)}`;
}
function typeSeal(c: FCard): PermanentFx['seals'][number] | undefined {
  const change = permanentTypeChange(c);
  if (!change) return undefined;
  // Veículo tripulado: o selo de tripulada já diz que ele é criatura neste turno.
  if (c.states?.includes('crewed') && change.gained.join() === 'Creature' && changeSize(change) === 1) return undefined;
  const main = (['Creature', 'Artifact', 'Land', 'Enchantment'] as const).find(t => change.gained.includes(t));
  const kind: TypeIcon = main ? (main.toLowerCase() as TypeIcon) : change.gained.length || change.gainedSub.length || change.allTypes ? 'other' : 'lost';
  const by = c.typeChangedBy?.length ? ` Efeito de ${list(c.typeChangedBy)}.` : '';
  return { kind: `type ${kind}`, html: TYPE_ICON[kind], label: `Tipo mudado: ${typeChangeLine(c, change)}.${by}` };
}

/** Classes da carta e o HTML dos efeitos (desenhados atrás ou na borda da carta, sem receber clique). */
export function permanentFxHTML(fx: PermanentFx, auraColor?: string) {
  const classes = [fx.phased ? 'fx-phased' : '', fx.sick ? 'fx-sick' : '', fx.targeted ? `fx-targeted ${fx.targeted}` : ''].filter(Boolean);
  const parts = [
    fx.glow ? `<span class="fx-glow ${fx.glow}"${fx.glow === 'enchanted' && auraColor ? ` style="--aura:${auraColor}"` : ''} aria-hidden="true"></span>` : '',
    fx.frame ? `<span class="fx-frame ${fx.frame}" aria-hidden="true"></span>` : '',
    ...fx.base.map(b => `<span class="fx-base ${b}" aria-hidden="true"></span>`),
    fx.corner.length ? `<span class="fx-corner" aria-hidden="true">${fx.corner.map(k => `<i class="${k}"></i>`).join('')}</span>` : '',
    fx.targeted ? '<span class="fx-crosshair" aria-hidden="true"></span>' : '',
    fx.seals.length ? `<span class="fx-seals">${fx.seals.map(seal => `<span class="fx-seal ${seal.kind}" title="${esc(seal.label)}">${seal.html}</span>`).join('')}</span>` : '',
  ];
  return { classes, html: parts.join('') };
}

/** Texto para o leitor de tela: o que os efeitos mostram e as palavras-chave não dizem. */
export function permanentFxText(fx: PermanentFx) {
  return [...fx.seals.map(s => s.label), fx.phased ? 'fora de fase' : '', fx.restricted ?? '',
    fx.targeted ? 'alvo de algo na pilha' : ''].filter(Boolean).join(', ');
}
