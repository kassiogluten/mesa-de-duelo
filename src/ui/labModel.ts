// A mesa do Laboratório como o editor a guarda: tipos, ida e volta do cenário do servidor e as cartas repetidas juntas.
import type { LabExileCard, LabPhase, LabPlayer, LabScenario } from '../forge/client';
import READY from '../lab-cenarios.json';
import { PENDING, PENDING_SCENARIOS } from '../pendingNews';

export type Zone = 'battlefield' | 'hand' | 'library' | 'graveyard' | 'exile';
export const ZONES: [Zone, string][] = [
  ['battlefield', 'Campo'], ['hand', 'Mão'], ['library', 'Grimório'], ['graveyard', 'Cemitério'], ['exile', 'Exílio'],
];
export const PHASES: [LabPhase, string][] = [
  ['upkeep', 'Manutenção'], ['draw', 'Compra'], ['main1', 'Fase principal 1'],
  ['combat', 'Início do combate'], ['main2', 'Fase principal 2'], ['end', 'Etapa final'],
];
/** Marcadores que o servidor aceita, com o nome que o jogador vê. */
export const LAB_COUNTERS: [string, string][] = [
  ['P1P1', '+1/+1'], ['M1M1', '−1/−1'], ['LOYALTY', 'Lealdade'], ['DEFENSE', 'Defesa'], ['CHARGE', 'Carga'],
  ['LORE', 'Conhecimento'], ['STUN', 'Atordoamento'], ['SHIELD', 'Escudo'], ['OIL', 'Óleo'], ['TIME', 'Tempo'],
  ['FADE', 'Desvanecer'], ['AGE', 'Idade'], ['QUEST', 'Missão'],
];
export const counterName = (type: string) => LAB_COUNTERS.find(([t]) => t === type)?.[1] ?? type;
/** Mesmos limites do servidor (Lab.java). */
export const MAX_PER_ZONE = 250;

/** No editor, a permanente tem um id para "presa a" continuar certo quando outras cartas saem ou mudam de lugar. */
export interface Permanent { uid: number; name: string; tapped: boolean; sick: boolean; counters: Record<string, number>; attachedTo: number | null }
/** No exílio, a carta pode estar em aventura ou prevista: é o que deixa jogá-la de lá. */
type ExileMode = '' | 'adventure' | 'foretold';
export interface Exiled { name: string; mode: ExileMode }
export const EXILE_MODES: [ExileMode, string][] = [['', 'Só exilada'], ['adventure', 'Em aventura'], ['foretold', 'Prevista']];
export interface Side { life: number; poison: number; hand: string[]; library: string[]; graveyard: string[]; exile: Exiled[]; battlefield: Permanent[] }
export interface Draft { active: 0 | 1; phase: LabPhase; players: [Side, Side] }
/** O nome de uma carta de qualquer zona. */
export const nameOf = (entry: string | Exiled | Permanent) => typeof entry === 'string' ? entry : entry.name;
export const zoneList = (side: Side, zone: Zone): (string | Exiled | Permanent)[] => side[zone];

/**
 * Cenário pronto para conferir à mão uma correção do CHANGELOG (item é o título em negrito, sem o ponto). Sem versão
 * e item, é um problema ainda sem correção, deixado para investigar; ganha os dois quando a correção sair.
 */
export interface Ready { nome: string; versao?: string; item?: string; conferir: string; cenario: LabScenario }
/** "0.145.0" numa correção; "Próxima versão" numa que ainda não subiu; "Para investigar" num problema ainda sem correção. */
export const readyTag = (r: Ready) => r.versao === PENDING ? 'Próxima versão' : r.versao ?? 'Para investigar';
/** Os das correções que ainda não ganharam número vêm primeiro: são os mais novos. */
export const READY_SCENARIOS = [...PENDING_SCENARIOS, ...READY as unknown as Ready[]];

let nextUid = 1;
export const newPermanent = (name: string): Permanent => ({ uid: nextUid++, name, tapped: false, sick: false, counters: {}, attachedTo: null });
const emptySide = (): Side => ({ life: 20, poison: 0, hand: [], library: [], graveyard: [], exile: [], battlefield: [] });
export const emptyDraft = (): Draft => ({ active: 0, phase: 'main1', players: [emptySide(), emptySide()] });

/** O cenário que vai para o servidor: "presa a" vira jogador e posição no campo. */
export function toScenario(d: Draft): LabScenario {
  const where = new Map<number, { player: number; index: number }>();
  d.players.forEach((p, player) => p.battlefield.forEach((c, index) => where.set(c.uid, { player, index })));
  const side = (p: Side): LabPlayer => ({
    life: p.life, poison: p.poison, hand: [...p.hand], library: [...p.library], graveyard: [...p.graveyard],
    exile: p.exile.map(c => c.mode ? { name: c.name, [c.mode]: true } : c.name),
    battlefield: p.battlefield.map(c => {
      const counters = Object.fromEntries(Object.entries(c.counters).filter(([, n]) => n > 0));
      const to = c.attachedTo === null ? undefined : where.get(c.attachedTo);
      return { name: c.name, ...(c.tapped ? { tapped: true } : {}), ...(c.sick ? { sick: true } : {}), ...(Object.keys(counters).length ? { counters } : {}), ...(to ? { attachedTo: to } : {}) };
    }),
  });
  return { active: d.active, phase: d.phase, players: [side(d.players[0]), side(d.players[1])] };
}

/** O contrário de toScenario, aceitando o que vier de um cenário colado (o servidor confere o resto). */
export function fromScenario(s: Partial<LabScenario>): Draft {
  const names = (v: unknown) => Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string') : [];
  const exiled = (v: unknown): Exiled[] => Array.isArray(v) ? v.flatMap((c: string | LabExileCard) =>
    typeof c === 'string' ? [{ name: c, mode: '' as ExileMode }]
      : c && typeof c.name === 'string' ? [{ name: c.name, mode: (c.adventure ? 'adventure' : c.foretold ? 'foretold' : '') as ExileMode }] : []) : [];
  const num = (v: unknown, def: number) => typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : def;
  const players = Array.isArray(s.players) ? s.players : [];
  const toSide = (p: LabPlayer) => {
    const field = Array.isArray(p?.battlefield) ? p.battlefield.filter(c => c && typeof c.name === 'string') : [];
    return {
      life: num(p?.life, 20), poison: num(p?.poison, 0),
      hand: names(p?.hand), library: names(p?.library), graveyard: names(p?.graveyard), exile: exiled(p?.exile),
      battlefield: field.map(c => ({ ...newPermanent(c.name), tapped: !!c.tapped, sick: !!c.sick, counters: { ...(c.counters ?? {}) } })),
      raw: field,
    };
  };
  const sides = [toSide(players[0] ?? {} as LabPlayer), toSide(players[1] ?? {} as LabPlayer)] as const;
  sides.forEach(side => side.raw.forEach((c, i) => {
    const to = c.attachedTo, target = to && sides[to.player]?.battlefield[to.index], own = side.battlefield[i];
    if (target && own) own.attachedTo = target.uid;
  }));
  const strip = ({ raw: _raw, ...side }: Side & { raw: unknown }): Side => side;
  return {
    active: s.active === 1 ? 1 : 0,
    phase: PHASES.some(([p]) => p === s.phase) ? s.phase! : 'main1',
    players: [strip(sides[0]), strip(sides[1])],
  };
}

/** "3 Island" ou "3x Island": quantas cópias e o nome. */
export function parseEntry(text: string): { count: number; name: string } {
  const m = /^\s*(\d{1,4})\s*x?\s+(.+?)\s*$/i.exec(text);
  return m ? { count: Math.max(1, Math.min(MAX_PER_ZONE, Number(m[1]))), name: m[2]! } : { count: 1, name: text.trim() };
}

/** Um trecho de cartas iguais em sequência numa zona: onde começa e quantas são. */
export interface Run { start: number; count: number }

/** Junta as cartas iguais seguidas; {@code same} diz se duas vizinhas podem ficar na mesma linha. */
export function runs<T>(list: readonly T[], same: (a: T, b: T) => boolean): Run[] {
  const out: Run[] = [];
  list.forEach((item, i) => {
    const last = out.at(-1);
    if (last && same(list[last.start]!, item)) last.count++;
    else out.push({ start: i, count: 1 });
  });
  return out;
}

/**
 * As linhas de uma zona. No campo, só ficam juntas as permanentes sem nada de diferente (desvirada, sem marcador, sem
 * "presa a" e sem nada preso nela); a que está sendo ajustada sai do grupo para ganhar a linha dela.
 */
export function zoneRuns(d: Draft, side: Side, zone: Zone, open: (index: number) => boolean): Run[] {
  if (zone === 'battlefield') {
    const targets = new Set(d.players.flatMap(s => s.battlefield.map(c => c.attachedTo)).filter(uid => uid !== null));
    const plain = (c: Permanent) => !c.tapped && !c.sick && c.attachedTo === null && !targets.has(c.uid)
      && !Object.values(c.counters).some(n => n > 0) && !open(side.battlefield.indexOf(c));
    return runs(side.battlefield, (a, b) => a.name === b.name && plain(a) && plain(b));
  }
  if (zone === 'exile') return runs(side.exile, (a, b) => a.name === b.name && a.mode === b.mode && !open(side.exile.indexOf(a)) && !open(side.exile.indexOf(b)));
  return runs(side[zone], (a, b) => a === b);
}

/** Troca o trecho de lugar com o vizinho de cima ({@code dir} -1) ou de baixo (1), como um bloco. */
export function moveRun<T>(list: T[], run: Run, dir: -1 | 1, all: readonly Run[]) {
  const at = all.findIndex(r => r.start === run.start);
  const other = all[at + dir];
  if (!other) return;
  const [first, second] = dir < 0 ? [other, run] : [run, other];
  const a = list.slice(first.start, first.start + first.count), b = list.slice(second.start, second.start + second.count);
  list.splice(first.start, first.count + second.count, ...b, ...a);
}
