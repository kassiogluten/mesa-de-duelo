import type { DeckData, DeckEntry, DeckFormat } from '../decks';

/** Cliente da ponte do Forge (forge-bridge). Formato das mensagens descrito em forge-bridge/README.md. */

export interface FPreferences {
  autoPassNoActions: boolean;
  /** "Só respostas": passes priority on opponents' turns and with something on the stack. Absent on older bridges. */
  passResponses?: boolean;
  /** Etapas do turno dos oponentes em que o jogo segura a prioridade (nomes do Forge, como "UPKEEP"). Ausente em pontes antigas. */
  opponentStops?: string[];
}
export interface MatchConfig { format: DeckFormat; matchLength: 'bo1' | 'bo3'; playerCount?: number }
export interface ValidationIssue { code: string; message: string; card?: string; section?: string }
export interface DeckValidation { valid: boolean; issues: ValidationIssue[]; mainCount?: number; sideboardCount?: number; commanderCount?: number; rulesVersion: string; engineVersion: string }
export type RoomVisibility = 'private' | 'public';
/** Uma sala pública aberta, como aparece na lista da tela inicial (sem tokens nem decks). */
export interface PublicRoom { code: string; host: string; config: MatchConfig; capacity: number; players: number; started: boolean }
export interface RoomInfo { code: string; config: MatchConfig; available: boolean; capacity?: number; players: {name: string; connected: boolean; seat?: number; playerId?: number; eliminated?: boolean}[]; rulesVersion: string; engineVersion: string }
export interface FEvent {
  seq: number; stateVersion: number;
  type: 'land-played' | 'spell-cast' | 'ability-activated' | 'resolved' | 'countered' | 'entered' | 'left' | 'attackers' | 'blockers' | 'damage' | 'life-changed' | 'turn' | 'priority' | 'draw' | 'discard' | 'mill' | 'stack-removed';
  actor?: number; cards?: number[]; card?: FCard; sourceId?: number; stackId?: number; targets?: FTargets;
  text?: string; from?: string; to?: string; delta?: number; trigger?: boolean;
  /** Só em `damage`; ver forge-bridge/README.md. */
  combat?: boolean; step?: 'first-strike' | 'regular'; doubleStrike?: boolean; trample?: boolean; deathtouch?: boolean; lifelink?: boolean;
  infect?: boolean; wither?: boolean; loyalty?: boolean; commander?: boolean; self?: boolean; lethal?: boolean;
  /** `damage` gasto num escudo de prevenção (o `delta` é o quanto foi prevenido). */
  prevented?: boolean;
  /** `left`: por que a carta saiu do campo, quando o Forge diz. */
  reason?: 'destroyed' | 'sacrificed';
  /** `mill`: a mágica ou habilidade que mandou moer, e se foi vidência em vez de moer. */
  sourceName?: string; surveil?: boolean;
  frame?: {players: Pick<FPlayer, 'id' | 'life' | 'battlefield' | 'handCount' | 'library'>[]; stack: FState['stack']; turn: number; phase: string | null; activePlayer: number | null; combat?: FState['combat']};
}
export interface FMatch {
  gameNumber: number; wins: number[]; draws: number; over: boolean; abandoned?: boolean;
  /** Duração do jogo que acabou de terminar, em ms (medida pelo servidor); ausente enquanto ele não termina. */
  gameMs?: number;
  /** Quanto o jogo em andamento já durou quando o estado saiu do servidor, em ms; ausente depois que ele termina. */
  elapsedMs?: number;
  phase: 'playing' | 'sideboarding' | 'complete'; ready: boolean[];
}
export interface FSideboarding { id: number; main: DeckEntry[]; sideboard: DeckEntry[]; ready: boolean }

export interface FCard {
  id: number;
  controller?: number;
  tapped: boolean;
  token: boolean;
  /** Imagem da ficha no Scryfall, calculada pela ponte (fichas não são achadas pelo nome). */
  image?: string;
  faceDown?: boolean;
  /** Como a permanente ficou virada para baixo (só no campo). */
  faceDownKind?: 'morph' | 'disguise' | 'manifest' | 'cloak';
  /**
   * Frente de uma carta virada para baixo que só quem recebe o estado pode ver (a escondida pela Mosswort Bridge, a
   * sua criatura com metamorfose). Fica à parte: no jogo a carta continua sem nome, e no campo é uma 2/2.
   */
  hiddenFace?: Pick<FCard, 'name' | 'set' | 'manaCost' | 'typeLine' | 'text' | 'creature' | 'land' | 'power' | 'toughness'>;
  name?: string;
  set?: string;
  manaCost?: string;
  typeLine?: string;
  text?: string;
  creature?: boolean;
  land?: boolean;
  power?: number;
  toughness?: number;
  /** Poder/resistência sem bônus, marcadores nem efeitos. */
  basePower?: number;
  baseToughness?: number;
  /** Palavras-chave atuais, com o nome do enum do Forge (FLYING, FIRST_STRIKE…), inclusive as ganhas por efeitos. */
  keywords?: string[];
  damage?: number;
  sick?: boolean;
  attacking?: boolean;
  blocking?: boolean;
  counters?: Record<string, number>;
  planeswalker?: boolean;
  /** Encantamento de Classe: nível atual e o mais alto da carta. */
  classLevel?: number;
  classMaxLevel?: number;
  emblem?: boolean;
  /** É o comandante de alguém (marca a permanente no campo). */
  commander?: boolean;
  /** Portador do Anel de quem a controla (o Anel te tenta). */
  ringBearer?: boolean;
  /** Dono da permanente, só quando outro jogador a controla (controle trocado). */
  owner?: number;
  /** Jogadores que atiçaram a criatura (goad). */
  goadedBy?: number[];
  /** Batalha: o jogador que a defende. */
  protector?: number;
  /** Escudos de regeneração ativos. */
  shields?: number;
  /** O que a carta escolheu (tipo, cores, carta nomeada, jogador, número, modo), só o que existe. */
  chosen?: FChosen;
  /** Cartas que contam com devoção: as cores (W, U, B, R, G), o valor para quem controla e, nos deuses de Theros, o mínimo para ser criatura. */
  devotion?: { colors: string[]; value: number; need?: number };
  /** Estados ligados uma vez por uma mecânica (monstrous, renowned, suspected, saddled, crewed, exerted, detained, harnessed, solved). */
  states?: FCardState[];
  /** Quem selou ou tripulou a permanente neste turno (nomes das cartas). */
  saddledBy?: string[];
  crewedBy?: string[];
  /** Conta as mágicas conjuradas no turno (Tempestade e afins); só no campo, na mão, na pilha e na zona de comando. */
  countsSpells?: boolean;
  /** Prevista (foretell) no exílio; para o dono vem de face para cima, com o custo previsto em foretellCost. */
  foretold?: boolean;
  foretellCost?: string;
  /** Tramada (plot) no exílio. */
  plotted?: boolean;
  /** Criatura preparada: pode conjurar uma cópia do feitiço dela (preparedSpell), que espera no exílio. */
  prepared?: boolean;
  preparedSpell?: string;
  /** No exílio, a cópia do feitiço preparado: o nome da criatura de onde ela veio. */
  preparedFrom?: string;
  /** Custo da proteção contra alvos (ward), como "{2}" ou "Pay 3 life". */
  ward?: string;
  /** De que a proteção protege, como o Forge escreve: "red", "artifact", "multicolored"… */
  protection?: string[];
  /** Fora de fase (phasing): continua no campo, mas como se não existisse. */
  phasedOut?: boolean;
  /** Proibida de atacar ou de bloquear por um efeito (não conta enjoo, estar virada nem defensor). */
  cantAttack?: boolean;
  cantBlock?: boolean;
  /** Dano que os escudos de prevenção ainda vão prevenir. */
  preventDamage?: number;
  /** Id da carta a que esta aura ou equipamento está preso. */
  attachedTo?: number;
  attachedToPlayer?: number;
  /** Nome original de uma carta que está copiando outra (Clone, por exemplo). */
  copyOf?: string;
  /** Mutação: as cartas que formam a permanente, de cima para baixo (sem nome quando viradas para baixo). */
  merged?: FMergedCard[];
}

export interface FMergedCard { id: number; name?: string; set?: string; image?: string; token?: boolean; faceDown?: boolean }

export type FCardState = 'monstrous' | 'renowned' | 'suspected' | 'saddled' | 'crewed' | 'exerted' | 'detained' | 'harnessed' | 'solved';

export interface FChosen { types?: string[]; colors?: string[]; names?: string[]; player?: number; number?: string; mode?: string }

export interface FPlayer {
  id: number;
  seat?: number;
  name: string;
  ai: boolean;
  eliminated?: boolean;
  life: number;
  /** Dano que os escudos de prevenção do jogador ainda vão prevenir. */
  preventDamage?: number;
  /** Marcadores do jogador (POISON, ENERGY, EXPERIENCE, RAD, TICKET...), só os que existem. */
  counters?: Record<string, number>;
  /** Quantas vezes o Anel já tentou o jogador; ausente se nunca tentou. */
  ringTempted?: number;
  /** É o monarca. */
  monarch?: boolean;
  /** Terrenos jogados neste turno e quantos pode jogar (-1 = sem limite). */
  landsPlayed?: number;
  maxLands?: number;
  /** Tem a bênção da cidade (Ascend): dura até o fim da partida. */
  blessing?: boolean;
  /** Velocidade (Start your engines!), de 1 a 4; ausente enquanto o jogador não tem velocidade. */
  speed?: number;
  /** Mágicas que o jogador conjurou neste turno; ausente quando nenhuma. */
  spellsCast?: number;
  /** Quanto durou o turno mais recente que o jogador terminou, em ms (medido pelo servidor); ausente antes do primeiro. */
  lastTurnMs?: number;
  library: number;
  /** Carta do topo do grimório, só quando quem recebe o estado pode vê-la (Vizier of the Menagerie, Courser of Kruphix...). */
  libraryTop?: FCard;
  handCount: number;
  hand: FCard[];
  /** Cartas da mão de outro jogador que você pode ver (Telepathy, Revelation...); ausente quando nenhuma. Não dá para jogá-las. */
  revealedHand?: FCard[];
  battlefield: FCard[];
  graveyard: FCard[];
  exile: FCard[];
  commandZone?: FCard[];
  commanders?: { id: number; name: string; casts: number; tax: number }[];
  commanderDamage?: { commanderId: number; damage: number }[];
  /** Emblemas na zona de comando (nome "Emblem — Planeswalker"). */
  emblems?: FCard[];
  pool: Record<string, number>;
  /** Masmorra em andamento na zona de comando (se aventurar). */
  dungeon?: FDungeon;
  /** Nomes das masmorras que o jogador já completou. */
  completedDungeons?: string[];
  /** Tem a iniciativa. */
  initiative?: boolean;
}

export interface FDungeon {
  id: number;
  name: string;
  image?: string;
  /** Sala atual; ausente antes de entrar. */
  room?: string;
  /** Salas na ordem do card (a primeira é a entrada), com o efeito e para onde cada uma leva. */
  rooms: { name: string; text: string; next: string[] }[];
}

export interface FOption {
  kind?: 'card' | 'player' | 'ability'; card?: FCard; id?: number; label: string; min?: number; max?: number;
  /** Gatilho para ordenar: texto da habilidade sem o nome da carta de origem (que vem em card). */
  ability?: string;
  /** Jeito de jogar a carta (cast, cycling, plot, flashback, evoke, adventure, land, ability...). */
  mode?: string;
  spell?: boolean;
  /** Subir de nível numa Classe: o nível que a opção alcança. */
  level?: number;
  /** Custo de mana da opção ({1}{R}) e os custos extras por extenso, como o Forge escreve. */
  cost?: string;
  extra?: string[];
  description?: string;
  /** Divisão de dano de combate: dano que já mata este bloqueador; defender marca o jogador ou planeswalker atacado. */
  lethal?: number;
  defender?: boolean;
  /** Outra face ou metade usada pela opção (aventura, carta dividida). */
  face?: { name: string; manaCost: string; typeLine: string };
  /** dungeon-room: nome da sala da masmorra que a opção escolhe. */
  room?: string;
}

export interface FQuestion {
  id: number;
  method: string;
  /** reveal: só mostra as cartas (Explore, revelar o topo...); responde com indices vazio. */
  kind: 'choose' | 'confirm' | 'order' | 'text' | 'reveal' | 'amount';
  /** triggers: ordenar gatilhos simultâneos; play-mode: escolher como jogar uma carta; vote: votação do conselho (card é a carta que vota). */
  purpose?: 'triggers' | 'play-mode' | 'combat-damage' | 'commander-zone' | 'dungeon-room' | 'vote' | 'library';
  /** library (vidência e vigilância): o que sai do topo vai para o fundo ou o cemitério, ou "top", a ordem das que ficam. Cartas na ordem do grimório. */
  library?: 'bottom' | 'graveyard' | 'top';
  /** commander-zone: onde o comandante está agora (Graveyard ou Exile). */
  zone?: string;
  /** dungeon-room: id do jogador dono da masmorra. */
  dungeonOwner?: number;
  /** vote: votos já dados nesta votação (fora as secretas), com o rótulo da opção como o Forge escreve. */
  votes?: FVote[];
  /** combat-damage: divisão automática sugerida, se há ordem entre bloqueadores, se vale qualquer divisão e as palavras-chave do atacante. */
  suggested?: number[];
  ordered?: boolean;
  free?: boolean;
  trample?: boolean;
  deathtouch?: boolean;
  title: string;
  total?: number;
  min?: number;
  max?: number;
  options?: (FOption | string)[];
  card?: FCard;
  initial?: string;
  numeric?: boolean;
}

export interface FVote { player: number; label: string }

export interface FButton { label: string; enabled: boolean }

/** Sala de partida em rede. token permite voltar ao assento se a conexão cair. */
export interface FRoom {
  code: string;
  seat: number;
  token: string;
  started: boolean;
  /** Sala pública, listada na tela inicial. Ausente em pontes antigas (privada). */
  public?: boolean;
  capacity?: number;
  config: MatchConfig;
  rulesVersion?: string;
  engineVersion?: string;
  /** conceded: desistiu (pelo menu ou saindo da sala); a mesa tira o assento de vista. */
  /** commander e cover (carta da arte do deck) só aparecem para o lobby; o resto do deck fica escondido. */
  players: { name: string; connected: boolean; rematch: boolean; seat?: number; playerId?: number; eliminated?: boolean; conceded?: boolean; commander?: string; cover?: string }[];
}

/** Mensagens prontas do lobby; a ponte recusa qualquer outra. */
export type RoomSaying = 'hello' | 'back' | 'invite' | 'glhf';

export interface FSkipVote { target: number; name: string; yes: number; no: number; voters: number; needed: number; canVote: boolean; mine?: 'yes' | 'no' }
export interface FSkip { vote?: FSkipVote; skipping: number[] }

/**
 * Previsão do combate de um jogador atacado, com as regras do Forge (prevenção, golpe duplo, atropelar, infectar).
 * poison só vem quando há veneno; commander, os comandantes que causam dano; lethal diz o que derrota o jogador.
 */
export interface FForecast {
  player: number; life: number; lifeAfter: number; poison?: number; poisonAfter?: number;
  commander?: { commanderId: number; damage: number; after: number }[];
  planeswalkers?: { id: number; loyalty: number; after: number }[];
  lethal?: 'life' | 'poison' | 'commander';
}

export interface FState {
  type: 'state';
  config?: MatchConfig;
  preferences?: FPreferences;
  match?: FMatch;
  sideboarding?: FSideboarding;
  matchId?: string;
  events?: FEvent[];
  eventCursor?: number;
  stateVersion?: number;
  rulesVersion?: string;
  engineVersion?: string;
  turn: number;
  phase: string | null;
  activePlayer: number | null;
  /** O turno atual é um turno extra. */
  extraTurn?: boolean;
  /** Jogadores dos turnos extras que ainda vão acontecer, na ordem. */
  extraTurns?: number[];
  /** Qual combate deste turno está acontecendo (2 = o primeiro combate extra). */
  combatNumber?: number;
  /** Combates extras ainda por vir neste turno e as fases depois das quais cada um começa. */
  extraCombats?: number;
  extraCombatAfter?: string[];
  /** Fases que, por causa de uma etapa extra, não seguem para a fase normal, e a fase que vem depois de cada uma. */
  extraPhaseAfter?: Record<string, string>;
  /** Dia ou noite, só depois que a partida vira um dos dois; e as mágicas que quem joga o turno já conjurou nele. */
  dayTime?: 'day' | 'night';
  activeSpells?: number;
  /** Quanto o turno atual já durou quando o estado saiu do servidor, em ms; ausente no fim do jogo e em pontes antigas. */
  turnElapsedMs?: number;
  gameOver: boolean;
  spectating?: boolean;
  winner?: string;
  players: FPlayer[];
  /** Cartas do cemitério ou do exílio (de qualquer jogador) que você pode usar agora: flashback, tramadas... */
  castable?: number[];
  /** Permissões vigentes para jogar do exílio, mesmo sem prioridade ou mana neste momento. */
  playableExile?: number[];
  /** Cartas suspensas e cartas cujo gatilho de suspender ainda está na pilha. */
  suspendedExile?: number[];
  stack: { id: number; text: string; /** Ausente em pontes antigas. */ kind?: 'spell' | 'ability' | 'trigger'; /** Só quando pago além do custo normal: forma de conjurar (flashback, aventura...), vezes reforçada, outros opcionais e o X. */ cast?: { mode?: string; kicker?: number; extras?: string[]; x?: number }; source?: FCard; controller?: number; targets?: FTargets }[];
  combat: { attacker: number; defender?: number; defenderKind?: 'player' | 'card'; blockers: number[] }[];
  /** Só na declaração de bloqueadores: como cada jogador atacado sai do combate com os bloqueios marcados até agora. Ausente em pontes antigas. */
  forecast?: FForecast[];
  log: string[];
  you: number;
  /** gen: versão do prompt; acompanha os cliques em OK/Cancelar para a ponte descartar cliques atrasados. */
  /** actionable: cartas que podem ser usadas agora (jogáveis, atacantes ou bloqueadores possíveis). */
  /** card: carta citada pelo prompt (ex.: a do topo do grimório na vidência ou na vigilância de 1). */
  /** paying: pagando um custo de mana; a mana da reserva pode ser gasta com {type:"mana", color}. */
  /** payingFor: o que o pagamento paga (mágica, habilidade ou custo pedido por um efeito), para o rótulo do Cancelar; canAutoPay: o Automático consegue pagar (fora da trava curta de clique). */
  /** untappable: permanentes viradas para mana com a mana ainda na reserva; clicar ({type:"card"}) desvira e devolve a mana. */
  /** manaOnly: suas permanentes em que um clique agora só geraria mana. Ausente em pontes antigas. */
  /** targeting: escolhendo alvos; source é a carta que alveja (card traz os dados dela) e o resto são os alvos já escolhidos. */
  input: { gen: number; priority?: boolean; opening?: 'starting-player' | 'play-draw' | 'mulligan' | 'mulligan-bottom'; openingStartingPlayer?: number; openingReturnCount?: number; openingReturnRemaining?: number; openingSelected?: number[]; message: string; ok: FButton; cancel: FButton; selectable: number[]; selectableStacks?: number[]; selectablePlayers?: number[]; actionable?: number[]; untappable?: number[]; manaOnly?: number[]; card?: FCard; paying?: boolean; payingFor?: 'spell' | 'ability' | 'effect'; canAutoPay?: boolean; phyrexianLife?: number;
    /** Cartas selecionadas pelo motor no prompt atual, com os limites reais da escolha. */
    /** players: só quando jogadores também podem ser escolhidos (proliferar). */
    selection?: { cards: number[]; players?: number[]; min: number; max: number };
    /** Proliferar: o que pode ganhar marcadores e se cada marcador ajuda ou prejudica quem escolhe. */
    proliferate?: { candidates: ProliferateCandidate[] };
    /** Escolha de conjurar durante a resolução do gatilho de suspender; usa OK/Cancelar. */
    suspendCast?: { card: FCard };
    /** Regra 903.9b: o comandante iria para a mão ou o grimório (to) e pode ir à zona de comando no lugar. */
    /** Comandante iria para `to` (903.9b) ou, com `stays`, já está em `to` (903.9a, cemitério ou exílio). */
    commanderMove?: { to: 'Hand' | 'Library' | 'Graveyard' | 'Exile' | string; stays?: boolean; card?: FCard };
    /** Atacantes e bloqueadores da declaração atual, identificados pela instância da carta. */
    blocking?: { selectedAttacker: number | null; attackers: number[]; blockers: number[]; legalAssignments: { blocker: number; attackers: number[] }[] };
    attacking?: { attackers: number[]; defenders: { id: number; kind: 'player' | 'card' }[]; legalAssignments: { attacker: number; defenders: { id: number; kind: 'player' | 'card' }[] }[] };
    targeting?: FTargeting;
    /** Voto numa permanente, escolhido tocando no campo: a carta que vota e os votos já dados. */
    vote?: { card: FCard; votes: FVote[] } };
  question?: FQuestion;
  /** Outros jogadores com uma decisão aberta (alvo, pergunta, ataque, bloqueio); prioridade comum fica de fora. */
  deciding?: { player: number; kind: 'choice' | 'attack' | 'block' }[];
  room?: FRoom;
  /** Em rede: votação para pular o turno de quem caiu e os jogadores com o turno já aprovado para pular. */
  skip?: FSkip;
  /** Para voltar a esta partida se a conexão cair: {type:"rejoin", code, token}. */
  session?: { code: string; token: string; room: boolean };
  decks: string[];
}

export type ProliferateEffect = 'good' | 'bad' | 'mixed' | 'neutral';
/** holder: jogador de cujo lado o marcador conta (o próprio jogador, o controlador ou quem protege a batalha). */
export interface ProliferateCandidate {
  kind: 'card' | 'player'; id: number; holder?: number; effect: ProliferateEffect; suggested: boolean;
  counters: { type: string; count: number; effect: Exclude<ProliferateEffect, 'mixed'> }[];
}

/** Alvos de uma mágica ou habilidade: ids de cartas e de jogadores. */
export interface FTargets { cards?: number[]; players?: number[] }

/**
 * Escolhendo alvos antes de ir para a pilha: a carta que alveja (source/card) e os alvos já escolhidos. Só na
 * escolha em si (não no pagamento) e ausentes em pontes antigas: kind diz o que pede o alvo; ability é o texto da
 * habilidade ou do gatilho como o motor escreve (fica de fora nas mágicas); min/max/count são deste passo da
 * escolha; valid é o que serve como alvo, na sintaxe do Forge ("Creature.OppCtrl"), e zones, fora do campo.
 */
export interface FTargeting extends FTargets {
  source: number; card?: FCard;
  kind?: 'spell' | 'ability' | 'trigger'; ability?: string;
  min?: number; max?: number; count?: number;
  valid?: string[]; zones?: string[];
}

export type ClientMessage =
  | { type: 'start'; you: unknown; opponent: unknown; opponents?: unknown[]; config: MatchConfig }
  | { type: 'host'; name: string; deck: unknown; config: MatchConfig; visibility?: RoomVisibility; code?: string; cover?: string }
  | { type: 'join'; code: string; name: string; deck: unknown; cover?: string }
  | { type: 'room-say'; key: RoomSaying }
  | { type: 'rejoin'; code: string; token: string }
  | { type: 'validate-deck'; requestId: string; format: DeckFormat; deck: unknown }
  | { type: 'lookup-room'; requestId: string; code: string }
  | { type: 'list-rooms'; requestId: string }
  | { type: 'fetch-deck'; requestId: string; site: 'moxfield' | 'archidekt'; id: string }
  | { type: 'sideboard'; id: number; deck: unknown } | { type: 'next-game'; id: number }
  | { type: 'rematch' } | { type: 'leave' }
  | ({ type: 'preferences' } & Partial<FPreferences>)
  | { type: 'card'; id: number; gen?: number }
  | { type: 'block'; attacker: number; blocker: number; gen: number }
  | { type: 'attack'; attacker: number; defender: number; defenderKind: 'player' | 'card'; gen: number }
  | { type: 'attack-all'; defender: number; defenderKind: 'player' | 'card'; gen: number }
  | { type: 'attack-group'; attackers: number[]; defender: number; defenderKind: 'player' | 'card'; gen: number }
  | { type: 'attack-group'; attackers: number[]; defender: null; gen: number }
  | { type: 'stack'; id: number; gen?: number }
  | { type: 'player'; id: number; gen?: number }
  | { type: 'select-set'; cards: number[]; players: number[]; gen: number }
  | { type: 'mana'; color: string; gen?: number }
  | { type: 'ok' | 'cancel' | 'pass-turn' | 'resolve-all'; gen?: number } | { type: 'concede' } | { type: 'hello' }
  | { type: 'skip-vote'; target: number; value?: boolean }
  | { type: 'answer'; id: number; indices?: number[]; amounts?: number[]; value?: boolean; text?: string };

/**
 * Endereço padrão da ponte: a mesma máquina que serviu a página. Assim, quem abre a página pela rede
 * (http://IP-DO-ANFITRIÃO:5173) já encontra a ponte do anfitrião. "localhost" vira 127.0.0.1 porque a
 * ponte só escuta IPv4. Fora do Vite (dev na 5173, preview na 4173), a página está publicada atrás de um
 * proxy que repassa /ws para a ponte no mesmo endereço (veja deploy/nginx.conf).
 */
function defaultUrl() {
  if (typeof location !== 'undefined' && location.host && !['5173', '4173'].includes(location.port)) {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  }
  const host = typeof location === 'undefined' || !location.hostname || location.hostname === 'localhost' ? '127.0.0.1' : location.hostname;
  return `ws://${host.includes(':') ? `[${host}]` : host}:7171/ws`;
}

/** Erro de uma consulta à ponte; `reason` diz o motivo quando a mesa reage a ele (como 'room-not-found'). */
export class RequestError extends Error {
  readonly reason?: string;
  constructor(message: string, reason?: string) { super(message); this.reason = reason; }
}

export const FORGE_URL: string = import.meta.env?.VITE_FORGE_URL ?? defaultUrl();

export class ForgeClient {
  private ws: WebSocket | null = null;
  state: FState | null = null;
  room: FRoom | null = null;
  onState: (s: FState) => void = () => {};
  onRoom: (r: FRoom) => void = () => {};
  onRoomSay: (seat: number, key: RoomSaying) => void = () => {};
  /** A partida foi aberta em outra janela, que assumiu o assento: não adianta reconectar sozinho. */
  replaced = false;
  /** A ponte não conhece mais a partida pedida no "rejoin". */
  onGone: (text: string) => void = () => {};
  onNotice: (text: string, error: boolean) => void = () => {};
  onClose: () => void = () => {};
  onValidation: (validation: DeckValidation, target: string) => void = () => {};
  /** Ação recusada pela ponte sem aviso ao jogador (ex.: clique num pedido que já tinha mudado). Vai só para o painel de erros. */
  onDiagnostic: (diagnostic: { code: string; action?: string; text: string }) => void = () => {};
  onHello: (info: {supportedFormats: DeckFormat[]; rulesVersion: string; engineVersion: string}) => void = () => {};
  /** Cada mensagem enviada (para a gravação da partida); delivered false quando a conexão já estava fechada. */
  onSend: (msg: ClientMessage, delivered: boolean) => void = () => {};
  private requestSequence = 0;
  private pending = new Map<string, {resolve: (value: any) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout>}>();

  private rejectPending(reason: string) {
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error(reason)); }
    this.pending.clear();
  }

  private request<T>(message: { type: 'validate-deck'; format: DeckFormat; deck: unknown } | { type: 'lookup-room'; code: string } | { type: 'list-rooms' } | { type: 'fetch-deck'; site: 'moxfield' | 'archidekt'; id: string }, timeoutMs = 12000): Promise<T> {
    if (!this.connected) return Promise.reject(new Error('Conecte-se ao servidor para verificar.'));
    const requestId = `request-${++this.requestSequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('O servidor demorou para responder. Tente novamente.')); }, timeoutMs);
      this.pending.set(requestId, {resolve, reject, timer});
      this.send({...message, requestId});
    });
  }

  validateDeck(deck: Pick<DeckData, 'name' | 'cards' | 'sideboard' | 'commanders'>, format: DeckFormat): Promise<DeckValidation> {
    return this.request({type: 'validate-deck', format, deck});
  }

  lookupRoom(code: string): Promise<RoomInfo> { return this.request({type: 'lookup-room', code}); }

  /** Salas públicas abertas (com lugar e sem partida começada). As privadas nunca vêm na lista. */
  listRooms(): Promise<PublicRoom[]> { return this.request({type: 'list-rooms'}); }

  /** JSON da API pública do Moxfield ou do Archidekt, buscado pela ponte (o navegador esbarra no CORS). */
  fetchDeckSource(site: 'moxfield' | 'archidekt', id: string): Promise<string> { return this.request({type: 'fetch-deck', site, id}, 20000); }

  connect(url = FORGE_URL, timeoutMs = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => { ws.close(); reject(new Error('tempo esgotado')); }, timeoutMs);
      ws.onopen = () => { clearTimeout(timer); this.ws = ws; resolve(); };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('conexão recusada')); };
      ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.rejectPending('A conexão foi interrompida.'); this.onClose(); } };
      ws.onmessage = ev => {
        let msg: any;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.requestId && this.pending.has(msg.requestId)) {
          const request = this.pending.get(msg.requestId)!;
          if (['validation', 'room-info', 'room-list', 'deck-source', 'request-error', 'error'].includes(msg.type)) {
            clearTimeout(request.timer); this.pending.delete(msg.requestId);
            if (msg.type === 'validation') request.resolve(msg.validation);
            else if (msg.type === 'room-info') request.resolve(msg.room);
            else if (msg.type === 'room-list') request.resolve(Array.isArray(msg.rooms) ? msg.rooms : []);
            else if (msg.type === 'deck-source') request.resolve(msg.body);
            else request.reject(new RequestError(msg.text ?? 'Não foi possível concluir a solicitação.', msg.reason));
            return;
          }
        }
        if (msg.type === 'state') {
          this.state = msg;
          if (msg.room) this.room = msg.room;
          this.onState(msg);
        } else if (msg.type === 'room') { this.room = msg.room; this.onRoom(msg.room); }
        else if (msg.type === 'room-say') this.onRoomSay(msg.seat, msg.key);
        else if (msg.type === 'validation-error') this.onValidation(msg.validation, msg.target);
        else if (msg.type === 'hello') this.onHello(msg);
        else if (msg.type === 'toast') this.onNotice(msg.text, false);
        else if (msg.type === 'error') this.onNotice(msg.text, true);
        else if (msg.type === 'diagnostic') this.onDiagnostic({ code: String(msg.code ?? ''), action: msg.action, text: String(msg.text ?? '') });
        else if (msg.type === 'gone') this.onGone(msg.text);
        else if (msg.type === 'replaced') { this.replaced = true; this.onNotice(msg.text, true); }
      };
    });
  }

  get connected() { return !!this.ws && this.ws.readyState === WebSocket.OPEN; }

  send(msg: ClientMessage) {
    const delivered = this.connected;
    if (delivered) this.ws!.send(JSON.stringify(msg));
    this.onSend(msg, delivered);
  }

  close() {
    const ws = this.ws;
    this.ws = null;
    this.rejectPending('A conexão foi encerrada.');
    ws?.close();
  }
}
