import type { FCard } from '../forge/client';
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
  /** Detalhes na borda esquerda: olho (vigilância), pegadas (atropelar) e espada/escudo riscados (não pode atacar/bloquear). */
  corner: ('vigilance' | 'trample' | 'no-attack' | 'no-block')[];
  seals: { kind: 'ward' | 'protection' | 'prevent' | 'face-down' | StatusKind; html: string; label: string }[];
  phased: boolean;
  targeted?: 'mine' | 'theirs';
  sick: boolean;
  /** "não pode atacar", "não pode bloquear" ou os dois. */
  restricted?: string;
}

const COLOR_PIP: Record<string, string> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
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
  const corner: PermanentFx['corner'] = c.creature ? (['VIGILANCE', 'TRAMPLE'] as const).filter(has).map(k => k === 'VIGILANCE' ? 'vigilance' : 'trample') : [];
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

type StatusKind = 'control' | 'goaded' | 'regen' | 'chosen';
const icon = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="currentColor"/></svg>`;
const STATUS_ICON: Record<StatusKind, string> = {
  control: icon('M7 4 3 8l4 4V9h10V7H7zm10 8v3H7v2h10v3l4-4z'),
  goaded: icon('M12 2 9 9H2l5.6 4.2L5.5 21 12 16.3l6.5 4.7-2.1-7.8L22 9h-7z'),
  regen: icon('M12 4V1L8 5l4 4V6a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z'),
  chosen: icon('M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 9A1.5 1.5 0 1 0 7.5 6a1.5 1.5 0 0 0 0 3z'),
};
const list = (names: string[]) => names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0] ?? '';

/**
 * Estados que o motor guarda e a carta impressa não mostra: controle trocado, incitada, escudos de regeneração e o que a
 * carta escolheu. Na mesa ficam como selos pequenos (controle e incitada só com o ícone); o texto vai no balão e no inspetor.
 */
export function permanentStatus(c: FCard, playerName: (id: number) => string = id => `Jogador ${id}`): PermanentFx['seals'] {
  const seals: PermanentFx['seals'] = [];
  if (c.owner !== undefined && c.controller !== undefined && c.owner !== c.controller) {
    const owner = playerName(c.owner);
    seals.push({ kind: 'control', html: STATUS_ICON.control, label: `Pertence a ${owner}; quem a controla agora é ${playerName(c.controller)}. Volta para ${owner} quando o efeito de controle acabar.` });
  }
  if (c.goadedBy?.length) {
    const by = list(c.goadedBy.map(playerName));
    seals.push({ kind: 'goaded', html: STATUS_ICON.goaded, label: `Incitada por ${by}: ataca em todo combate, se puder, e ataca um jogador que não seja ${by}, se puder. Dura até o próximo turno de quem incitou.` });
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
  return seals;
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
