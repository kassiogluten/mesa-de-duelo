/**
 * Frase curta para a caixa de ação, montada com o que a ponte já manda (carta de origem, tipo de entrada)
 * em vez do texto do Forge, que traz a habilidade inteira e o pedido em inglês ("Select target creature").
 * Sem uma frase conhecida, devolve null e a mesa mostra o texto do Forge como sempre.
 */
export interface ShortInstructionInput {
  message: string;
  paying?: boolean;
  payingFor?: 'spell' | 'ability' | 'effect';
  canAutoPay?: boolean;
  /** Mana phyrexiana que ainda dá para pagar com vida: a vida já separada nos cliques anteriores. */
  phyrexianLife?: number;
  /** Custo que ainda falta, como o motor conta (descontado a cada mana gerada); total só depois de pagar uma parte. */
  manaCost?: PaymentCost;
  /** Mana que está na reserva de quem paga ("{G}{C}"), mostrada à parte do que falta. */
  reserve?: string;
  card?: { name?: string };
  /** valid/zones: o que serve como alvo, quando o pedido do Forge não dá para traduzir. */
  targeting?: { card?: { name?: string }; valid?: string[]; zones?: string[] };
  /** Voto numa permanente: a carta que vota. */
  vote?: { card: { name?: string } };
}

export interface PaymentCost { remaining: string; total?: string; life?: number; x?: number }

const paid = (cost: string) => /^(\{0\}|0)?$/.test(cost.trim());

/** "Pague {2}{R} para Jiboia", "Falta {R} de {2}{R} para Jiboia", com o X escolhido e a vida já separada. */
function paymentSentence(cost: PaymentCost, name: string | undefined, effect: boolean, phyrexianPending: boolean) {
  const target = name ? ` para ${name}` : '';
  const x = cost.x !== undefined ? ` (X = ${cost.x})` : '';
  const life = !phyrexianPending && cost.life ? ` Mais ${cost.life} de vida no fim do pagamento.` : '';
  if (paid(cost.remaining)) return `Custo${name ? ` de ${name}` : ''} pago${x}.${life}`;
  if (cost.total && cost.total !== cost.remaining) return `Falta ${cost.remaining} de ${cost.total}${target}${x}.${life}`;
  if (effect) return `${name ?? 'O efeito'} pede ${cost.remaining}${x}.${life}`;
  return `Pague ${cost.remaining}${target}${x}.${life}`;
}

const POOL_ORDER = ['W', 'U', 'B', 'R', 'G', 'C'];
/** Reserva de mana da ponte ({W: 0, G: 2, ...}) como símbolos: "{G}{G}". Vazia, "". */
export function poolCost(pool: Record<string, number> | undefined): string {
  if (!pool) return '';
  const keys = [...POOL_ORDER.filter(k => k in pool), ...Object.keys(pool).filter(k => !POOL_ORDER.includes(k) && /^[A-Z]$/.test(k))];
  return keys.map(k => `{${k}}`.repeat(Math.max(0, Math.min(99, pool[k] || 0)))).join('');
}

const SPOKEN: Record<string, [string, string]> = {
  W: ['branca', 'brancas'], U: ['azul', 'azuis'], B: ['preta', 'pretas'], R: ['vermelha', 'vermelhas'], G: ['verde', 'verdes'],
  C: ['incolor', 'incolores'], S: ['de neve', 'de neve'],
};
function spokenSymbol(sym: string, n: number): string {
  const plural = n !== 1 ? 1 : 0;
  if (/^\d+$/.test(sym)) return `${sym} ${Number(sym) === 1 ? 'genérica' : 'genéricas'}`;
  if (sym === 'X') return 'X';
  const [a = '', b] = sym.split('/');
  const color = (c: string) => SPOKEN[c]?.[plural] ?? c;
  if (b === 'P') return `${n} ${color(a)} ${plural ? 'phyrexianas' : 'phyrexiana'}`;
  if (b) return `${n} ${/^\d+$/.test(a) ? `de ${a} genéricas` : color(a)} ou ${color(b)}`;
  return `${n} ${color(a)}`;
}
/** Para o leitor de tela: "{2}{R}{R}" vira "2 genéricas e 2 vermelhas"; o resto do texto fica como está. */
export function spokenMana(text: string): string {
  return text.replace(/(?:\{[A-Z0-9/]+\})+/g, run => {
    const counts = new Map<string, number>();
    for (const m of run.match(/\{[A-Z0-9/]+\}/g)!) { const sym = m.slice(1, -1); counts.set(sym, (counts.get(sym) ?? 0) + 1); }
    const parts = [...counts].map(([sym, n]) => /^\d+$/.test(sym) ? spokenSymbol(String(Number(sym) * n), 0) : spokenSymbol(sym, n));
    return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}` : parts[0] ?? run;
  });
}

const WORDS: Record<string, string> = {
  creature: 'criatura', creatures: 'criaturas', player: 'jogador', players: 'jogadores',
  planeswalker: 'planeswalker', planeswalkers: 'planeswalkers', permanent: 'permanente', permanents: 'permanentes',
  artifact: 'artefato', artifacts: 'artefatos', enchantment: 'encantamento', enchantments: 'encantamentos',
  land: 'terreno', lands: 'terrenos', spell: 'mágica', spells: 'mágicas', card: 'carta', cards: 'cartas',
  battle: 'batalha', battles: 'batalhas', opponent: 'oponente', opponents: 'oponentes', or: 'ou', and: 'e',
  nonland: 'não terreno', noncreature: 'não criatura', other: 'outra', another: 'outra',
};
const PHRASES: [RegExp, string][] = [
  [/\byou control\b/g, 'que você controla'],
  [/\ban opponent controls\b/g, 'de um oponente'],
  [/\byou don't control\b/g, 'que você não controla'],
];
const CHOOSER = /^(?:Seletor|Chooser)\s*:?$/i;
const COUNTS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** Traduz o tipo do alvo ("creature or player"); null se sobrar alguma palavra desconhecida. */
function targetKind(text: string) {
  let out = text.toLowerCase().trim();
  for (const [re, pt] of PHRASES) out = out.replace(re, `§${pt}§`);
  const parts = out.split('§').flatMap((part, i) => i % 2 ? [part] : part.split(/\s+/).filter(Boolean).map(word => WORDS[word] ?? null));
  return parts.some(part => part === null) ? null : parts.join(' ');
}

/** "Select up to two target creatures" → { count: 2, upTo: true, kind: 'criaturas' }. */
function parseTargetRequest(message: string) {
  const line = message.split('\n').map(l => l.trim()).filter(l => /^select\b/i.test(l)).pop();
  if (!line) return null;
  const m = line.match(/^select\s+(up to\s+)?(?:(an?|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+)?(any\s+target|targets?)\s*(.*?)[.:]?$/i);
  if (!m) return null;
  const upTo = !!m[1];
  const raw = (m[2] ?? '').toLowerCase();
  const count = raw === 'a' || raw === 'an' || raw === '' ? 1 : COUNTS[raw] ?? Number(raw);
  const kind = /^any/i.test(m[3]!) || !m[4] ? '' : targetKind(m[4]);
  return { count, upTo, kind };
}

function sourceName(input: ShortInstructionInput, translate: (name: string) => string) {
  const engine = input.targeting?.card?.name ?? input.card?.name;
  return engine ? translate(engine) : input.message.match(/^(.+?) \(\d+\)(?: -|\n|$)/)?.[1]?.trim();
}

/** translate: nome da carta no idioma da mesa (o motor manda o nome em inglês). */
export function shortInstruction(input: ShortInstructionInput, translate: (name: string) => string = name => name): string | null {
  const name = sourceName(input, translate);
  if (input.vote) return voteRequest(input.vote.card.name ? translate(input.vote.card.name) : undefined);
  // "Um oponente escolhe" com mais de um oponente (Curator of Destinies, Fact or Fiction): o Forge só pergunta "Seletor:".
  if (CHOOSER.test(input.message.trim())) return name ? `${name}: escolha o oponente que vai decidir.` : 'Escolha o oponente que vai decidir.';
  if (input.targeting) {
    const request = parseTargetRequest(input.message);
    const fallback = validTargetKind(input.targeting.valid, input.targeting.zones);
    if (!request) return name ? `Escolha o alvo de ${name}${fallback ? ` (${fallback})` : ''}.` : null;
    const how = request.upTo ? `até ${request.count} ${request.count === 1 ? 'alvo' : 'alvos'}` : request.count === 1 ? 'um alvo' : `${request.count} alvos`;
    const kind = request.kind || fallback;
    return `Escolha ${how}${name ? ` para ${name}` : ''}${kind ? ` (${kind})` : ''}.`;
  }
  // Custo que falta, como a ponte conta: com os símbolos e descontado a cada mana gerada.
  if (input.paying && input.manaCost) {
    const effect = input.payingFor === 'effect';
    const pending = input.phyrexianLife !== undefined;
    const reserve = input.reserve ? ` Na reserva: ${input.reserve}.` : '';
    const ask = paymentSentence(input.manaCost, name, effect, pending) + reserve;
    if (pending) return `${ask} ${phyrexianHint(input.phyrexianLife!)}`;
    if (!effect) return ask;
    return input.canAutoPay === false ? `${ask} A sua mana não dá para pagar.` : `${ask} Pague ou recuse.`;
  }
  // Custo pedido por um efeito (Estudo Rístico, Mana Leak): a carta costuma ser de outro jogador, e pagar é opcional.
  if (input.paying && input.payingFor === 'effect') {
    const cost = input.message.match(/(?:Custo de Mana|Mana Cost):\s*((?:\{[A-Z0-9/]+\})+)/i)?.[1];
    const asks = `${name ?? 'O efeito'} pede ${cost ?? 'um pagamento de mana'}`;
    if (input.phyrexianLife !== undefined) return `${asks}. ${phyrexianHint(input.phyrexianLife)}`;
    return input.canAutoPay === false ? `${asks}, e a sua mana não dá para pagar.` : name ? `${asks}. Pague ou recuse.` : 'Pague o custo pedido ou recuse.';
  }
  if (input.paying) {
    const ask = name ? `Pague o custo de mana de ${name}.` : 'Pague o custo de mana.';
    return input.phyrexianLife === undefined ? ask : `${ask} ${phyrexianHint(input.phyrexianLife)}`;
  }
  return null;
}

const VALID: Record<string, string> = {
  creature: 'criatura', player: 'jogador', opponent: 'oponente', planeswalker: 'planeswalker', permanent: 'permanente',
  artifact: 'artefato', enchantment: 'encantamento', land: 'terreno', battle: 'batalha', card: 'carta',
  instant: 'mágica instantânea', sorcery: 'feitiço', spell: 'mágica',
};
const OWNERS: Record<string, string> = { oppctrl: 'de um oponente', youctrl: 'que você controla', youdontctrl: 'que você não controla' };
const ZONE_NAMES: Record<string, string> = { Graveyard: 'num cemitério', Exile: 'no exílio', Hand: 'na mão', Library: 'no grimório', Stack: 'na pilha' };

/**
 * O que serve como alvo, a partir das restrições do motor ("Creature.OppCtrl", "Player", "Any"): só o tipo e quem
 * controla, que é o que o jogador precisa para achar o alvo. Null se algum tipo não for conhecido ou servir qualquer alvo.
 */
export function validTargetKind(valid: readonly string[] | undefined, zones: readonly string[] = []): string | null {
  if (!valid?.length) return null;
  // "Qualquer alvo" já é o que a frase diz sem o tipo.
  if (valid.some(v => v.toLowerCase() === 'any')) return null;
  const kinds: string[] = [];
  for (const entry of valid) {
    const [base = '', ...rest] = entry.split('.');
    const props = rest.join('.').split('+').map(p => p.toLowerCase());
    // "Card.Creature": a carta pelo tipo dela (fora do campo, como no cemitério).
    const typed = base.toLowerCase() === 'card' ? props.find(p => VALID[p] && p !== 'card') : undefined;
    const word = VALID[typed ?? base.toLowerCase()];
    if (!word) return null;
    const owner = props.map(p => OWNERS[p]).find(Boolean);
    const text = owner ? `${word} ${owner}` : word;
    if (!kinds.includes(text)) kinds.push(text);
  }
  const where = zones.map(z => ZONE_NAMES[z]).filter(Boolean);
  const list = kinds.length > 1 ? `${kinds.slice(0, -1).join(', ')} ou ${kinds[kinds.length - 1]}` : kinds[0] ?? null;
  return where.length ? `${list} ${where.join(' ou ')}` : list;
}

/** Quantos alvos ainda faltam neste passo da escolha: "Falta 1 alvo", "Pode marcar mais 2", "Todos os alvos marcados". */
export function targetProgress(t: { min?: number; max?: number; count?: number }): string | null {
  if (t.min === undefined || t.max === undefined || t.count === undefined || t.max <= 0) return null;
  const alvos = (n: number) => `${n} ${n === 1 ? 'alvo' : 'alvos'}`;
  if (t.count < t.min) return `${t.min - t.count === 1 ? 'Falta' : 'Faltam'} ${alvos(t.min - t.count)}`;
  if (t.count >= t.max) return t.max === 1 ? 'Alvo marcado' : 'Todos os alvos marcados';
  return t.count === 0 ? `Até ${alvos(t.max)}` : `Pode marcar mais ${alvos(t.max - t.count)}`;
}

/** Nome do que pede o alvo, para o rótulo da habilidade na caixa de ação. */
export function abilityKindLabel(kind: 'spell' | 'ability' | 'trigger' | undefined): string | null {
  return kind === 'trigger' ? 'Gatilho' : kind === 'ability' ? 'Habilidade' : null;
}

/** Voto numa permanente (Council's Judgment): a escolha é tocando no campo. */
export function voteRequest(name: string | undefined): string {
  return `Votação${name ? ` de ${name}` : ''}: toque na permanente em que você vota.`;
}

/** O Forge só tira a vida no fim do pagamento: a frase diz quanto já ficou separado. */
function phyrexianHint(pending: number): string {
  const hint = 'Toque no seu retrato para pagar 2 de vida por um símbolo phyrexiano.';
  return pending > 0 ? `${hint} Já são ${pending} de vida.` : hint;
}

/**
 * Rótulos dos botões do pagamento de mana. O Forge só manda "Automático" e "Cancelar"; desativado, o automático
 * quer dizer que a mana à vista não paga o custo, e o Cancelar desfaz a conjuração ou a ativação, ou só recusa o
 * pagamento quando o custo vem de um efeito ("a menos que pague {3}").
 */
export function paymentButtonLabels(input: Pick<ShortInstructionInput, 'payingFor' | 'canAutoPay'> & { ok: { enabled: boolean } }): { ok: string; cancel: string } {
  return {
    ok: input.canAutoPay ?? input.ok.enabled ? 'Pagar automaticamente' : 'Mana insuficiente',
    cancel: input.payingFor === 'spell' ? 'Desistir da mágica' : input.payingFor === 'ability' ? 'Desistir da habilidade' : input.payingFor === 'effect' ? 'Não pagar' : 'Desistir',
  };
}
