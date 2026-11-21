// Proteção do próprio jogador (The One Ring, Leyline of Sanctity, Ivory Mask): o selo junto do retrato, com o balão, e o aro de luz em volta dele.
import type { FPlayer, FPlayerProtection } from '../forge/client';
import { esc, pip } from './cardtext';
import { KEYWORD_ICON } from './icons';
import { protectionLabel } from './permanentEffects';
import './playerProtection.css';

type Kind = FPlayerProtection['kind'];
const COLOR_PIP: Record<string, string> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
const ICON: Record<Kind, string> = { protection: KEYWORD_ICON.PROTECTION!, hexproof: KEYWORD_ICON.HEXPROOF!, shroud: KEYWORD_ICON.SHROUD! };
const SHORT: Record<Kind, string> = { protection: 'Proteção', hexproof: 'Resistência', shroud: 'Manto' };

/** Uma linha por tipo de proteção (proteção, resistência à magia, manto), com tudo do que protege e as cartas de onde vem. */
interface Group { kind: Kind; from: string[]; sources: string[]; until: FPlayerProtection[] }
function groups(p: FPlayer): Group[] {
  const out: Group[] = [];
  for (const kind of ['protection', 'shroud', 'hexproof'] as Kind[]) {
    const list = (p.protections ?? []).filter(x => x.kind === kind);
    if (!list.length) continue;
    const from = [...new Set(list.map(x => x.from).filter((f): f is string => !!f))];
    // Contra tudo engole as outras proteções.
    out.push({ kind, from: from.includes('everything') ? ['everything'] : from, sources: [...new Set(list.map(x => x.source).filter((s): s is string => !!s))], until: list.filter(x => x.until) });
  }
  return out;
}

const fromText = (from: string[]) => from.map(protectionLabel).join(', ');
function name(g: Group) {
  if (g.kind === 'protection') return `Proteção contra ${g.from.length ? fromText(g.from) : 'algo'}`;
  if (g.kind === 'hexproof') return g.from.length ? `Resistência à magia contra ${fromText(g.from)}` : 'Resistência à magia';
  return 'Manto';
}
function rule(g: Group) {
  if (g.kind === 'protection') return g.from.includes('everything')
    ? 'Nada pode mirar neste jogador, todo dano que ele sofreria é prevenido e auras não podem ser presas nele.'
    : 'Mágicas e habilidades dessas fontes não podem mirar neste jogador, e o dano delas é prevenido.';
  if (g.kind === 'hexproof') return g.from.length ? 'Os oponentes não podem mirar neste jogador com mágicas nem habilidades dessas fontes.' : 'Os oponentes não podem mirar neste jogador com mágicas nem habilidades.';
  return 'Ninguém pode mirar neste jogador, nem ele mesmo.';
}

/** "até o fim do turno", "até o seu próximo turno", "até o próximo turno de Ana"; vazio quando dura enquanto a carta ficar. */
function untilText(g: Group, you: number | undefined, playerName: (id: number) => string) {
  const x = g.until[0];
  if (!x || g.until.length < (g.sources.length || 1)) return '';
  if (x.until === 'turn') return 'até o fim do turno';
  if (x.untilPlayer === undefined) return 'até o próximo turno';
  return x.untilPlayer === you ? 'até o seu próximo turno' : `até o próximo turno de ${playerName(x.untilPlayer)}`;
}

/** O que o balão diz: o nome, até quando, a regra e a carta de onde vem. */
export function protectionHint(g: Group, you: number | undefined, playerName: (id: number) => string) {
  const until = untilText(g, you, playerName);
  return `${name(g)}${until ? `, ${until}` : ''}. ${rule(g)}${g.sources.length ? ` Vem de ${g.sources.join(' e ')}.` : ''}`;
}

/** Texto para o leitor de tela, junto do nome e da vida do jogador. */
export function playerProtectionText(p: FPlayer) {
  return groups(p).map(g => `, tem ${name(g).toLowerCase()}`).join('');
}

/** Classe do aro em volta do retrato: o tipo mais forte que o jogador tem (contra tudo, contra algo, manto, resistência). */
export function protectionHaloClass(p: FPlayer) {
  const g = groups(p);
  const prot = g.find(x => x.kind === 'protection');
  if (prot) return prot.from.includes('everything') ? 'prot-all' : 'prot-some';
  if (g.some(x => x.kind === 'shroud')) return 'prot-shroud';
  return g.length ? 'prot-hexproof' : '';
}

/** Os selos, ao lado dos marcadores do jogador; `changed` traz PROTECTION quando a proteção acabou de chegar. */
export function playerProtectionHTML(p: FPlayer, you: number | undefined, playerName: (id: number) => string, open: string | null = null, changed: Set<string> = new Set()) {
  return groups(p).map(g => {
    const key = `p${p.id}:PROT-${g.kind}`;
    const pips = g.from.flatMap(f => COLOR_PIP[f] ? [pip(COLOR_PIP[f])] : []).join('');
    return `<span class="player-counter protection ${g.kind}${changed.has('PROTECTION') ? ' bump' : ''}${open === key ? ' open' : ''}" data-ctr="${key}" aria-hidden="true">${ICON[g.kind]}${pips ? `<i class="prot-pips">${pips}</i>` : ''}<b>${SHORT[g.kind]}</b><span class="ctr-tip">${esc(protectionHint(g, you, playerName))}</span></span>`;
  }).join('');
}
