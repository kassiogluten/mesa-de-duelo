/**
 * Todas as chaves que a mesa guarda no navegador (localStorage e sessionStorage), num lugar só, para não se
 * desencontrarem entre as telas. Os VALORES são os que já estão gravados nos navegadores dos jogadores: mudar
 * um deles é perder o que o jogador tinha salvo (decks, preferências, a partida em andamento).
 * tests/storage.test.mjs confere que não se repetem e que nenhum outro arquivo escreve 'mesa:…' à mão.
 */
export const KEYS = {
  // Contas e sessões
  /** Sessão da área de admin (token devolvido no login). Admin. */
  admin: 'mesa:admin',
  /** Conta do jogador (Entrar com Google): token e perfil. Menu da conta. */
  conta: 'mesa:conta:v1',
  /** Fila da sincronia de Meus decks com a conta e o retrato da última sincronia. Conta. */
  contaSync: 'mesa:conta:sync:v1',
  /** '1' quando o jogador fechou o aviso de entrar com a conta. Tela inicial. */
  contaAvisoFechado: 'mesa:conta:aviso-fechado',

  // Decks
  /** Biblioteca de Meus decks (formato 2). Meus decks. */
  decks: 'mesa:decks:v2',
  /** Biblioteca antiga de decks (formato 1), lida só para migrar. Meus decks. */
  decksV1: 'mesa:decks:v1',
  /** Cópia intacta da biblioteca antiga, feita ao migrar para o formato 2. Meus decks. */
  decksV1Backup: 'mesa:decks:v1:backup',
  /** Deck escolhido antes de existir um por formato (só o formato livre ainda o lê). Tela inicial. */
  deckLegacy: 'mesa:deck',

  // Preferências sincronizadas com a conta (SYNCED_PREFS)
  /** Volume, mudo e pacote de sons (JSON). Opções de som. */
  audio: 'mesa:audio:v1',
  /** Aviso de "seu turno" com a aba em segundo plano ('on'/'off'). Opções da mesa. */
  turnNotice: 'mesa:turnNotice',
  /** Ritmo da mesa: 'fast' (rápido sem resposta) ou 'normal'. Opções da mesa. */
  pace: 'mesa:pace',
  /** Nível de passar a vez sozinho. Mesa. */
  passLevel: 'mesa:passLevel',
  /** Chave antiga de "passar respostas" ('true'/'false'), ainda gravada para aparelhos antigos. Mesa. */
  passResponses: 'mesa:passResponses',
  /** Chave antiga de "passar sem ações" ('true'/'false'), ainda gravada para aparelhos antigos. Mesa. */
  autoPassNoActions: 'mesa:autoPassNoActions',
  /** Paradas no turno do oponente (JSON). Mesa. */
  opponentStops: 'mesa:opponentStops',
  /** Ordem das cartas nas telas de escolha. Mesa. */
  choiceSort: 'mesa:choiceSort',
  /** Nome do jogador na mesa. Tela inicial (contra outra pessoa). */
  name: 'mesa:name',
  /** Tema das telas (sem a chave, 'noite'). Menu ⋯. */
  tema: 'mesa:tema',

  // Mesa
  /** Estilo das cartas: imagem completa, 'art' (arte e texto) ou 'arena'. Opções da mesa. */
  cards: 'mesa:cards',
  /** Fundo de tapete na mesa ('on'/'off'). Opções da mesa. */
  playmat: 'mesa:playmat',
  /** Como a mão aparece. Mesa. */
  hand: 'mesa:hand',
  /** Chave antiga de esconder a mão, apagada ao escolher o modo da mão. Mesa. */
  handHide: 'mesa:hand-hide',
  /** Grupos abertos no painel de opções da mesa (JSON). Mesa. */
  optionsOpen: 'mesa:options-open',
  /** Posição do painel de ataque arrastado (JSON {x, y}). Mesa. */
  attackPanel: 'mesa:attack-panel',
  /** '1' liga as ferramentas de desenvolvimento na mesa. Mesa. */
  dev: 'mesa:dev',
  /** Vibrar no começo do seu turno. Opções da mesa. */
  vibrate: 'mesa:vibrate',
  /** Manter a tela acesa durante a partida. Opções da mesa. */
  awake: 'mesa:awake',
  /** Partida em andamento, para voltar a ela depois de recarregar (a do Laboratório fica no sessionStorage). Mesa. */
  resume: 'mesa:resume',

  // Tela inicial
  /** Formato escolhido. Tela inicial. */
  format: 'mesa:format',
  /** Contra quem: 'ai', 'net' ou 'free'. Tela inicial. */
  mode: 'mesa:mode',
  /** Melhor de 1 ou de 3 ('bo1'/'bo3'). Tela inicial. */
  matchLength: 'mesa:matchLength',
  /** Quantos jogadores no Commander (2 a 4). Tela inicial. */
  commanderPlayers: 'mesa:commanderPlayers',
  /** Decks dos computadores no Commander, um por lugar (JSON). Tela inicial. */
  commanderOpponents: 'mesa:commanderOpponents',
  /** Deck do computador no 1 contra 1. Tela inicial. */
  opp: 'mesa:opp',
  /** Estilo do computador ('equilibrado', 'cauteloso', 'agressivo', 'experimental'). Tela inicial. */
  aiStyle: 'mesa:aiStyle',
  /** Bracket máximo dos computadores ('any' ou o número). Tela inicial. */
  botBracket: 'mesa:botBracket',
  /** Precon: '1' sorteia os computadores só da série do deck do jogador. Tela inicial. */
  preconSameSeries: 'mesa:preconSameSeries',
  /** Sala nova pública ou privada. Tela inicial (contra outra pessoa). */
  roomVisibility: 'mesa:roomVisibility',
  /** Aba aberta: entrar numa sala ou criar uma. Tela inicial (contra outra pessoa). */
  netTab: 'mesa:netTab',
  /** Endereço do servidor escolhido à mão. Tela inicial (contra outra pessoa) e Salas. */
  forgeUrl: 'mesa:forgeUrl',
  /** '1' depois da primeira partida: mostra o atalho de jogar de novo. Tela inicial. */
  played: 'mesa:played',
  /** Última versão do painel Novidades que o jogador viu. Tela inicial. */
  novidades: 'mesa:novidades',

  // Outras telas
  /** Mesa livre em andamento (JSON). Mesa livre. */
  livre: 'mesa:livre',
  /** Rascunho do cenário em edição (JSON). Laboratório. */
  labRascunho: 'mesa:lab:rascunho',
  /** Cenários salvos neste aparelho (JSON). Laboratório. */
  labCenarios: 'mesa:lab:cenarios',
  /** Filtros da lista de partidas, só desta aba (sessionStorage). Partidas. */
  partidasFiltros: 'mesa:partidas:filtros',
  /** Filtros da lista de salas, só desta aba (sessionStorage). Salas. */
  salasFiltros: 'mesa:salas:filtros',
  /** Eventos de começar a jogar já contados nesta aba (sessionStorage), para cada um contar uma vez só. Funil. */
  funil: 'mesa:funil',
} as const;

export type StorageKey = typeof KEYS[keyof typeof KEYS];

/** Começos de chaves que levam um complemento. */
export const PREFIXES = {
  /** + formato: deck escolhido naquele formato. Tela inicial. */
  deck: 'mesa:deck:',
  /** + horário: cópia da biblioteca de decks que não se conseguiu ler. Meus decks. */
  decksRecovery: 'mesa:decks:recovery:',
  /** + data ISO: cópia dos decks do navegador antes de juntar com a conta. Conta. */
  decksAntesDaConta: 'mesa:decks:antes-da-conta:',
  /** + nome: cartas do Scryfall de versões antigas, levadas para o IndexedDB ao abrir o jogo. */
  scryfallLegacy: 'scry:v1:',
} as const;

/** Eventos da janela que avisam as telas de mudanças no que está guardado. */
export const EVENTS = {
  /** O tema mudou. */
  tema: 'mesa:tema',
  /** As preferências vieram da conta. */
  prefsSincronizadas: 'mesa:prefs-sincronizadas',
  /** Meus decks mudaram pela conta ou por outra aba. */
  decksSincronizados: 'mesa:decks-sincronizados',
  /** Abrir o Laboratório (menu ⋯). */
  laboratorio: 'mesa:laboratorio',
} as const;

/** Outros nomes do navegador: banco, trava entre abas, avisos, arquivos baixados. */
export const NAMES = {
  /** Banco do IndexedDB (cartas do Scryfall e afins). */
  idb: 'mesa-de-duelo',
  /** Trava (navigator.locks) para só uma aba sincronizar os decks com a conta. */
  contaSyncLock: 'mesa-conta-sync',
  /** Etiqueta da notificação de "seu turno": uma nova substitui a anterior. */
  seuTurnoTag: 'mesa-seu-turno',
  /** Começo do nome do arquivo baixado com a gravação da partida (+ horário + '.json.gz'). */
  gravacaoArquivo: 'mesa-gravacao-',
} as const;

type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem' | 'removeItem'>;

/** Lê a chave; sem armazenamento (bloqueado, ausente), null. */
export function load(key: string, storage?: Reader): string | null {
  try { return (storage ?? localStorage).getItem(key); } catch { return null; }
}

/** Grava a chave; null apaga. Sem armazenamento (ou sem espaço), devolve false e não faz nada. */
export function save(key: string, value: string | null, storage?: Writer): boolean {
  try {
    const s = storage ?? localStorage;
    if (value === null) s.removeItem(key); else s.setItem(key, value);
    return true;
  } catch { return false; }
}

/** Lê um JSON; sem a chave, sem armazenamento ou com JSON inválido, o fallback. Um 'null' gravado vira null. */
export function loadJSON<T>(key: string, fallback: T, storage?: Reader): T {
  try {
    const raw = (storage ?? localStorage).getItem(key);
    return raw === null ? fallback : JSON.parse(raw) as T;
  } catch { return fallback; }
}

/** Grava como JSON. Sem armazenamento (ou sem espaço), devolve false. */
export function saveJSON(key: string, value: unknown, storage?: Writer): boolean {
  try { (storage ?? localStorage).setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
