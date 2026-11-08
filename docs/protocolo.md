# Protocolo da mesa

Gerado de `src/forge/protocol.ts` por `npm run protocol-doc`; não edite à mão. Os campos do estado (`FState`) são
conferidos contra o servidor pelo `ProtocolContractTest` e pelo `tests/protocol.test.mjs`. Exemplos comentados das
mensagens ficam no `forge-bridge/README.md`.

## FPreferences

| Campo | Tipo | O que é |
|---|---|---|
| `autoPassNoActions` | `boolean` | Interruptores antigos, derivados do nível pela ponte (clientes de versões anteriores ainda os mandam). |
| `passResponses?` | `boolean` |  |
| `passLevel?` | `string` | Nível de passar automaticamente: 'sempre', 'acoes', 'respostas' ou 'afeta'. Ausente em pontes antigas. |
| `passingTurn?` | `boolean` | O atalho "Passar até o fim do turno" está ligado (só no estado; não se envia). |
| `opponentStops?` | `string[]` | Etapas do turno dos oponentes em que o jogo segura a prioridade (nomes do Forge, como "UPKEEP"). Ausente em pontes antigas. |

## MatchConfig

| Campo | Tipo | O que é |
|---|---|---|
| `format` | `DeckFormat` |  |
| `matchLength` | `'bo1' \| 'bo3'` |  |
| `playerCount?` | `number` |  |
| `undo?` | `boolean` |  |

## NoticeDetail

Aviso com título e cartas envolvidas (ataque recusado: o motivo e a carta que o causou).

| Campo | Tipo | O que é |
|---|---|---|
| `title?` | `string` |  |
| `cards?` | `{ id: number; name: string }[]` |  |

## ValidationIssue

| Campo | Tipo | O que é |
|---|---|---|
| `code` | `string` |  |
| `message` | `string` |  |
| `card?` | `string` |  |
| `section?` | `string` |  |

## DeckValidation

| Campo | Tipo | O que é |
|---|---|---|
| `valid` | `boolean` |  |
| `issues` | `ValidationIssue[]` |  |
| `mainCount?` | `number` |  |
| `sideboardCount?` | `number` |  |
| `commanderCount?` | `number` |  |
| `rulesVersion` | `string` |  |
| `engineVersion` | `string` |  |
| `deck?` | `{ name: string; cards: DeckEntry[]; sideboard?: DeckEntry[]; commanders?: DeckEntry[] }` | Só num deck válido: o deck como o servidor leu (nomes corrigidos, com o oracleId). A mesa ainda não usa. |

## RoomVisibility

```ts
'private' | 'public'
```

## LabScenario

Mesa montada no Laboratório (veja forge-bridge Lab.java): o jogador 1 é quem cria a sala.

| Campo | Tipo | O que é |
|---|---|---|
| `active` | `0 \| 1` |  |
| `phase` | `LabPhase` |  |
| `players` | `[LabPlayer, LabPlayer]` |  |

## LabPhase

```ts
'upkeep' | 'draw' | 'main1' | 'combat' | 'main2' | 'end'
```

## LabPlayer

| Campo | Tipo | O que é |
|---|---|---|
| `life` | `number` |  |
| `poison` | `number` |  |
| `hand` | `string[]` |  |
| `library` | `string[]` | A primeira é a do topo. |
| `graveyard` | `string[]` |  |
| `exile` | `(string \| LabExileCard)[]` | O nome, ou a carta com o jeito de estar no exílio (em aventura ou prevista), que deixa jogá-la de lá. |
| `battlefield` | `LabPermanent[]` |  |

## LabExileCard

| Campo | Tipo | O que é |
|---|---|---|
| `name` | `string` |  |
| `adventure?` | `boolean` | Em aventura: a mágica de aventura já foi conjurada, e a criatura pode ser conjurada do exílio. |
| `foretold?` | `boolean` | Prevista (Foretell): pode ser conjurada do exílio pelo custo previsto. |

## LabPermanent

| Campo | Tipo | O que é |
|---|---|---|
| `name` | `string` |  |
| `tapped?` | `boolean` |  |
| `sick?` | `boolean` | Entrou neste turno (enjoo de invocação). |
| `counters?` | `Record<string, number>` |  |
| `attachedTo?` | `{ player: number; index: number }` | Presa a outra permanente: jogador (0 ou 1) e posição no campo dele. |

## PublicRoom

| Campo | Tipo | O que é |
|---|---|---|
| `code` | `string` |  |
| `host` | `string` |  |
| `config` | `MatchConfig` |  |
| `capacity` | `number` |  |
| `players` | `number` |  |
| `started` | `boolean` |  |
| `spectators?` | `number` |  |
| `brackets?` | `number[]` |  |
| `computer?` | `boolean` |  |

## RoomInfo

| Campo | Tipo | O que é |
|---|---|---|
| `code` | `string` |  |
| `config` | `MatchConfig` |  |
| `available` | `boolean` |  |
| `started?` | `boolean` |  |
| `lab?` | `boolean` |  |
| `computer?` | `boolean` |  |
| `capacity?` | `number` |  |
| `players` | `{name: string; connected: boolean; seat?: number; playerId?: number; eliminated?: boolean}[]` |  |
| `rulesVersion` | `string` |  |
| `engineVersion` | `string` |  |

## FEvent

| Campo | Tipo | O que é |
|---|---|---|
| `seq` | `number` |  |
| `stateVersion` | `number` |  |
| `type` | `'land-played' \| 'spell-cast' \| 'ability-activated' \| 'resolved' \| 'countered' \| 'entered' \| 'left' \| 'attackers' \| 'blockers' \| 'damage' \| 'life-changed' \| 'turn' \| 'priority' \| 'draw' \| 'discard' \| 'mill' \| 'stack-removed' \| 'shuffle' \| 'scry' \| 'coin' \| 'die' \| 'attached' \| 'control-changed' \| 'counters' \| 'starting-roll'` |  |
| `actor?` | `number` |  |
| `cards?` | `number[]` |  |
| `card?` | `FCard` |  |
| `sourceId?` | `number` |  |
| `stackId?` | `number` |  |
| `targets?` | `FTargets` |  |
| `text?` | `string` |  |
| `from?` | `string` |  |
| `to?` | `string` |  |
| `delta?` | `number` |  |
| `trigger?` | `boolean` |  |
| `combat?` | `boolean` | Só em `damage`; ver forge-bridge/README.md. |
| `step?` | `'first-strike' \| 'regular'` |  |
| `doubleStrike?` | `boolean` |  |
| `trample?` | `boolean` |  |
| `deathtouch?` | `boolean` |  |
| `lifelink?` | `boolean` |  |
| `infect?` | `boolean` |  |
| `wither?` | `boolean` |  |
| `loyalty?` | `boolean` |  |
| `commander?` | `boolean` |  |
| `self?` | `boolean` |  |
| `lethal?` | `boolean` |  |
| `prevented?` | `boolean` | `damage` gasto num escudo de prevenção (o `delta` é o quanto foi prevenido). |
| `reason?` | `'destroyed' \| 'sacrificed' \| 'warped'` | `left`: por que a carta saiu do campo, quando o Forge diz. |
| `sourceName?` | `string` | `mill`: a mágica ou habilidade que mandou moer, e se foi vidência em vez de moer. |
| `surveil?` | `boolean` |  |
| `fight?` | `boolean` | `damage` de uma luta (fight); `draw` de uma busca no grimório (tutor), sem dizer a carta. |
| `searched?` | `boolean` |  |
| `top?` | `number` | `scry`: quantas ficaram no topo e quantas foram para o fundo. |
| `bottom?` | `number` |  |
| `heads?` | `boolean` | `coin`: cara ou coroa, e se é a moeda de quem começa. `die`: quantos lados e o resultado. |
| `startingToss?` | `boolean` |  |
| `sides?` | `number` |  |
| `result?` | `number` |  |
| `rolls?` | `{ player: number; roll: number }[][]` | `starting-roll` (d6 de quem começa, no primeiro jogo): as rodadas, cada uma com o que cada jogador tirou; da segunda em diante, só os empatados no maior número da anterior. `actor` é quem ganhou e escolhe quem começa. |
| `moved?` | `boolean` | `attached`: já estava presa a outra permanente. `control-changed`: quem controlava antes. |
| `previous?` | `number` |  |
| `counter?` | `string` | `counters`: qual marcador (P1P1, LOYALTY...), se veio com a carta entrando e, na lealdade, se foi custo pago. |
| `entering?` | `boolean` |  |
| `paid?` | `boolean` |  |
| `turn?` | `number` | `turn`: o número do turno que começou. |
| `frame?` | `{players: Pick<FPlayer, 'id' \| 'life' \| 'battlefield' \| 'handCount' \| 'library'>[]; stack: FState['stack']; turn: number; phase: string \| null; activePlayer: number \| null; combat?: FState['combat']}` |  |

## FMatch

| Campo | Tipo | O que é |
|---|---|---|
| `gameNumber` | `number` |  |
| `wins` | `number[]` |  |
| `draws` | `number` |  |
| `over` | `boolean` |  |
| `abandoned?` | `boolean` |  |
| `gameMs?` | `number` | Duração do jogo que acabou de terminar, em ms (medida pelo servidor); ausente enquanto ele não termina. |
| `elapsedMs?` | `number` | Quanto o jogo em andamento já durou quando o estado saiu do servidor, em ms; ausente depois que ele termina. |
| `phase` | `'playing' \| 'sideboarding' \| 'complete'` |  |
| `ready` | `boolean[]` | Quem está pronto para o próximo jogo: os assentos na ordem da sala e depois os computadores (sempre prontos). |
| `concededBy?` | `string` | Nome (no jogo) de quem desistiu da série; só com `abandoned`. Ausente em servidores antigos. |

## FSideboarding

| Campo | Tipo | O que é |
|---|---|---|
| `id` | `number` |  |
| `main` | `DeckEntry[]` |  |
| `sideboard` | `DeckEntry[]` |  |
| `ready` | `boolean` |  |

## FCount

Uma contagem da carta: o que é contado (`of`, com zona, de quem, tipos, qualidades e medida, ou as cores da devoção), o valor de agora para quem a controla, o valor quando ela mesma entrar no campo (`entering`, de um "quando entra" visto da mão) e o que o número muda (`uses`).

| Campo | Tipo | O que é |
|---|---|---|
| `of` | `'cards' \| 'devotion' \| 'hand' \| 'life' \| 'domain'` |  |
| `value` | `number` |  |
| `entering?` | `number` |  |
| `zone?` | `'battlefield' \| 'graveyard' \| 'exile'` |  |
| `whose?` | `'you' \| 'opponents' \| 'all'` |  |
| `types?` | `string[]` | Alternativas, com os nomes do Forge: "Lesson", "Creature", "Forest". "Card" e "Permanent" são qualquer carta. |
| `qualities?` | `string[]` | other, token, nontoken, tapped, untapped, attacking, cores (white...), legendary, snow, basic, non:Land, with:Flying, powerGE4. |
| `measure?` | `'power' \| 'greatestPower' \| 'toughness' \| 'greatestToughness' \| 'manaValue' \| 'greatestManaValue' \| 'cardTypes' \| 'names' \| 'colors'` |  |
| `colors?` | `string[]` |  |
| `uses` | `FCountUse[]` |  |

## FCountUse

```ts
| { use: 'pt'; power?: string; toughness?: string }
  | { use: 'threshold' | 'creature'; min: number }
  | { use: 'damage' | 'costLess' | 'costMore' | 'life' | 'lifeGain' | 'lifeLoss' | 'draw' | 'mill' | 'discard' | 'pick' | 'tokens' | 'counters' | 'mana'; amount: number; plus?: number; others?: boolean }
  | { use: 'other' }
```

## FCard

| Campo | Tipo | O que é |
|---|---|---|
| `id` | `number` |  |
| `controller?` | `number` |  |
| `tapped` | `boolean` |  |
| `token` | `boolean` |  |
| `image?` | `string` | Imagem da ficha no Scryfall, calculada pela ponte (fichas não são achadas pelo nome). |
| `print?` | `{ set: string; cn: string }` | A impressão que o dono escolheu no deck (série do Scryfall e número): todos veem a arte dela. |
| `faceDown?` | `boolean` |  |
| `faceDownKind?` | `'morph' \| 'disguise' \| 'manifest' \| 'cloak'` | Como a permanente ficou virada para baixo (só no campo). |
| `hiddenFace?` | `Pick<FCard, 'name' \| 'set' \| 'manaCost' \| 'typeLine' \| 'text' \| 'creature' \| 'land' \| 'power' \| 'toughness'>` | Frente de uma carta virada para baixo que só quem recebe o estado pode ver (a escondida pela Mosswort Bridge, a sua criatura com metamorfose). Fica à parte: no jogo a carta continua sem nome, e no campo é uma 2/2. |
| `name?` | `string` |  |
| `set?` | `string` |  |
| `manaCost?` | `string` |  |
| `typeLine?` | `string` |  |
| `printedType?` | `string` | Linha de tipo impressa da face à mostra, como o Forge a escreve; a ponte só manda quando um efeito mudou o tipo (typeLine traz o tipo atual). typeChangedBy: as cartas cujos efeitos mudam o tipo, quando se sabe. |
| `typeChangedBy?` | `string[]` |  |
| `text?` | `string` |  |
| `creature?` | `boolean` |  |
| `land?` | `boolean` |  |
| `power?` | `number` |  |
| `toughness?` | `number` |  |
| `basePower?` | `number` | Poder/resistência sem bônus, marcadores nem efeitos. |
| `baseToughness?` | `number` |  |
| `keywords?` | `string[]` | Palavras-chave atuais, com o nome do enum do Forge (FLYING, FIRST_STRIKE…), inclusive as ganhas por efeitos. |
| `damage?` | `number` |  |
| `sick?` | `boolean` |  |
| `attacking?` | `boolean` |  |
| `blocking?` | `boolean` |  |
| `counters?` | `Record<string, number>` |  |
| `planeswalker?` | `boolean` |  |
| `classLevel?` | `number` | Encantamento de Classe: nível atual e o mais alto da carta. |
| `classMaxLevel?` | `number` |  |
| `emblem?` | `boolean` |  |
| `commander?` | `boolean` | É o comandante de alguém (marca a permanente no campo). |
| `ringBearer?` | `boolean` | Portador do Anel de quem a controla (o Anel te tenta). |
| `owner?` | `number` | Dono da permanente, só quando outro jogador a controla (controle trocado). |
| `goadedBy?` | `number[]` | Jogadores que atiçaram a criatura (goad). |
| `protector?` | `number` | Batalha: o jogador que a defende. |
| `shields?` | `number` | Escudos de regeneração ativos. |
| `chosen?` | `FChosen` | O que a carta escolheu (tipo, cores, carta nomeada, jogador, número, modo), só o que existe. |
| `counts?` | `FCount[]` | O valor que a carta conta (item 56), só quando o número muda o que ela faz; inclui a devoção. Só na mão, no campo, na pilha e na zona de comando. |
| `states?` | `FCardState[]` | Estados ligados uma vez por uma mecânica (monstrous, renowned, suspected, saddled, crewed, exerted, detained, harnessed, solved). |
| `saddledBy?` | `string[]` | Quem selou ou tripulou a permanente neste turno (nomes das cartas). |
| `crewedBy?` | `string[]` |  |
| `countsSpells?` | `boolean` | Conta as mágicas conjuradas no turno (Tempestade e afins); só no campo, na mão, na pilha e na zona de comando. |
| `foretold?` | `boolean` | Prevista (foretell) no exílio; para o dono vem de face para cima, com o custo previsto em foretellCost. |
| `foretellCost?` | `string` |  |
| `plotted?` | `boolean` | Tramada (plot) no exílio. |
| `prepared?` | `boolean` | Criatura preparada: pode conjurar uma cópia do feitiço dela (preparedSpell), que espera no exílio. |
| `preparedSpell?` | `string` |  |
| `preparedFrom?` | `string` | No exílio, a cópia do feitiço preparado: o nome da criatura de onde ela veio. |
| `ward?` | `string` | Custo da proteção contra alvos (ward), como "{2}" ou "Pay 3 life". |
| `protection?` | `string[]` | De que a proteção protege, como o Forge escreve: "red", "artifact", "multicolored"… |
| `phasedOut?` | `boolean` | Fora de fase (phasing): continua no campo, mas como se não existisse. |
| `cantAttack?` | `boolean` | Proibida de atacar ou de bloquear por um efeito (não conta enjoo, estar virada nem defensor). |
| `cantBlock?` | `boolean` |  |
| `preventDamage?` | `number` | Dano que os escudos de prevenção ainda vão prevenir. |
| `exiling?` | `number[]` | Cartas no exílio que esta permanente exilou com ela (Journey to Nowhere, Oblivion Ring, imprint, Hideaway), por id. |
| `attachedTo?` | `number` | Id da carta a que esta aura ou equipamento está preso. |
| `attachedToPlayer?` | `number` |  |
| `copyOf?` | `string` | Nome original de uma carta que está copiando outra (Clone, por exemplo). |
| `merged?` | `FMergedCard[]` | Mutação: as cartas que formam a permanente, de cima para baixo (sem nome quando viradas para baixo). |

## FMergedCard

| Campo | Tipo | O que é |
|---|---|---|
| `id` | `number` |  |
| `name?` | `string` |  |
| `set?` | `string` |  |
| `image?` | `string` |  |
| `token?` | `boolean` |  |
| `faceDown?` | `boolean` |  |

## FCardState

```ts
'monstrous' | 'renowned' | 'suspected' | 'saddled' | 'crewed' | 'exerted' | 'detained' | 'harnessed' | 'solved'
```

## FChosen

| Campo | Tipo | O que é |
|---|---|---|
| `types?` | `string[]` |  |
| `colors?` | `string[]` |  |
| `names?` | `string[]` |  |
| `player?` | `number` |  |
| `number?` | `string` |  |
| `mode?` | `string` |  |

## FPlayer

| Campo | Tipo | O que é |
|---|---|---|
| `id` | `number` |  |
| `seat?` | `number` |  |
| `sleeve?` | `number` | Cor do verso das cartas do jogador (0 a 7), sorteada pelo servidor; ausente em pontes antigas. |
| `name` | `string` |  |
| `ai` | `boolean` |  |
| `aiStyle?` | `AiStyle` | Estilo do computador (só nos jogadores da IA). |
| `eliminated?` | `boolean` |  |
| `life` | `number` |  |
| `preventDamage?` | `number` | Dano que os escudos de prevenção do jogador ainda vão prevenir. |
| `counters?` | `Record<string, number>` | Marcadores do jogador (POISON, ENERGY, EXPERIENCE, RAD, TICKET...), só os que existem. |
| `bracket?` | `number` | Bracket do deck de Commander do jogador (1 a 5); ausente fora do Commander ou sem bracket. |
| `ringTempted?` | `number` | Quantas vezes o Anel já tentou o jogador; ausente se nunca tentou. |
| `monarch?` | `boolean` | É o monarca. |
| `landsPlayed?` | `number` | Terrenos jogados neste turno e quantos pode jogar (-1 = sem limite). |
| `maxLands?` | `number` |  |
| `blessing?` | `boolean` | Tem a bênção da cidade (Ascend): dura até o fim da partida. |
| `speed?` | `number` | Velocidade (Start your engines!), de 1 a 4; ausente enquanto o jogador não tem velocidade. |
| `spellsCast?` | `number` | Mágicas que o jogador conjurou neste turno; ausente quando nenhuma. |
| `lastTurnMs?` | `number` | Quanto durou o turno mais recente que o jogador terminou, em ms (medido pelo servidor); ausente antes do primeiro. |
| `library` | `number` |  |
| `libraryTop?` | `FCard` | Carta do topo do grimório, só quando quem recebe o estado pode vê-la (Vizier of the Menagerie, Courser of Kruphix...). |
| `handCount` | `number` |  |
| `hand` | `FCard[]` |  |
| `revealedHand?` | `FCard[]` | Cartas da mão de outro jogador que você pode ver (Telepathy, Revelation...); ausente quando nenhuma. Não dá para jogá-las. |
| `battlefield` | `FCard[]` |  |
| `graveyard` | `FCard[]` |  |
| `exile` | `FCard[]` |  |
| `commandZone?` | `FCard[]` |  |
| `commanders?` | `{ id: number; name: string; casts: number; tax: number }[]` |  |
| `commanderDamage?` | `{ commanderId: number; damage: number }[]` |  |
| `emblems?` | `FCard[]` | Emblemas na zona de comando (nome "Emblem — Planeswalker"). |
| `pool` | `Record<string, number>` |  |
| `dungeon?` | `FDungeon` | Masmorra em andamento na zona de comando (se aventurar). |
| `completedDungeons?` | `string[]` | Nomes das masmorras que o jogador já completou. |
| `initiative?` | `boolean` | Tem a iniciativa. |

## FDungeon

| Campo | Tipo | O que é |
|---|---|---|
| `id` | `number` |  |
| `name` | `string` |  |
| `image?` | `string` |  |
| `room?` | `string` | Sala atual; ausente antes de entrar. |
| `rooms` | `{ name: string; text: string; next: string[] }[]` | Salas na ordem do card (a primeira é a entrada), com o efeito e para onde cada uma leva. |

## FOption

| Campo | Tipo | O que é |
|---|---|---|
| `kind?` | `'card' \| 'player' \| 'ability'` |  |
| `card?` | `FCard` |  |
| `id?` | `number` |  |
| `label` | `string` |  |
| `min?` | `number` |  |
| `max?` | `number` |  |
| `ability?` | `string` | Gatilho para ordenar: texto da habilidade sem o nome da carta de origem (que vem em card). |
| `mode?` | `string` | Jeito de jogar a carta (cast, cycling, plot, flashback, evoke, adventure, land, ability...). |
| `spell?` | `boolean` |  |
| `level?` | `number` | Subir de nível numa Classe: o nível que a opção alcança. |
| `cost?` | `string` | Custo de mana da opção ({1}{R}) e os custos extras por extenso, como o Forge escreve. |
| `extra?` | `string[]` |  |
| `description?` | `string` |  |
| `loyalty?` | `string` | Habilidade de planeswalker: o custo de lealdade como está impresso ("+2", "0", "-3", "-X"). |
| `lethal?` | `number` | Divisão de dano de combate: dano que já mata este bloqueador; defender marca o jogador ou planeswalker atacado. |
| `defender?` | `boolean` |  |
| `face?` | `{ name: string; manaCost: string; typeLine: string }` | Outra face ou metade usada pela opção (aventura, carta dividida). |
| `room?` | `string` | dungeon-room: nome da sala da masmorra que a opção escolhe. |

## FQuestion

| Campo | Tipo | O que é |
|---|---|---|
| `id` | `number` |  |
| `method` | `string` |  |
| `kind` | `'choose' \| 'confirm' \| 'order' \| 'text' \| 'reveal' \| 'amount'` | reveal: só mostra as cartas (Explore, revelar o topo...); responde com indices vazio. |
| `purpose?` | `'triggers' \| 'play-mode' \| 'combat-damage' \| 'commander-zone' \| 'dungeon-room' \| 'vote' \| 'library' \| 'card-name' \| 'piles-split' \| 'piles-choose' \| 'replacement-order'` | card-name: nomear uma carta, com todos os nomes do jogo nas opções (só texto). triggers: ordenar gatilhos simultâneos; play-mode: escolher como jogar uma carta; vote: votação do conselho (card é a carta que vota). |
| `applyToAll?` | `boolean` | replacement-order (qual efeito de substituição vem primeiro): dá para usar a mesma escolha no resto do efeito que está resolvendo (a resposta leva all). |
| `library?` | `'bottom' \| 'graveyard' \| 'top'` | library (vidência e vigilância): o que sai do topo vai para o fundo ou o cemitério, ou "top", a ordem das que ficam. Cartas na ordem do grimório. |
| `pileOwner?` | `number` | piles-split e piles-choose (dois montes): de quem são as cartas, se o dono escolhe o monte e para onde vai cada um ("hand", "graveyard"...), quando o efeito só move as cartas. |
| `ownerChooses?` | `boolean` |  |
| `chosenTo?` | `string` |  |
| `otherTo?` | `string` |  |
| `piles?` | `{ option: number; size: number; cards: number[] }[]` | piles-choose: a opção de cada monte, o tamanho e os índices das cartas dele (um monte virado para baixo vem sem cartas). |
| `zone?` | `string` | commander-zone: onde o comandante está agora (Graveyard ou Exile). |
| `dungeonOwner?` | `number` | dungeon-room: id do jogador dono da masmorra. |
| `votes?` | `FVote[]` | vote: votos já dados nesta votação (fora as secretas), com o rótulo da opção como o Forge escreve. |
| `suggested?` | `number[]` | combat-damage: divisão automática sugerida, se há ordem entre bloqueadores, se vale qualquer divisão e as palavras-chave do atacante. |
| `ordered?` | `boolean` |  |
| `free?` | `boolean` |  |
| `trample?` | `boolean` |  |
| `deathtouch?` | `boolean` |  |
| `title` | `string` |  |
| `total?` | `number` |  |
| `min?` | `number` |  |
| `max?` | `number` |  |
| `options?` | `(FOption \| string)[]` |  |
| `card?` | `FCard` |  |
| `initial?` | `string` |  |
| `numeric?` | `boolean` |  |

## FVote

| Campo | Tipo | O que é |
|---|---|---|
| `player` | `number` |  |
| `label` | `string` |  |

## FButton

| Campo | Tipo | O que é |
|---|---|---|
| `label` | `string` |  |
| `enabled` | `boolean` |  |

## FRoom

Sala de partida em rede. token permite voltar ao assento se a conexão cair.

| Campo | Tipo | O que é |
|---|---|---|
| `code` | `string` |  |
| `seat` | `number` |  |
| `token` | `string` |  |
| `started` | `boolean` |  |
| `public?` | `boolean` | Sala pública, listada na tela inicial. Ausente em pontes antigas (privada). |
| `lab?` | `boolean` | Sala de teste do Laboratório: a mesa começa como foi montada, com as cartas do cenário. |
| `computer?` | `boolean` | Assistindo a uma partida contra o computador: não há sala de verdade. |
| `capacity?` | `number` |  |
| `config` | `MatchConfig` |  |
| `rulesVersion?` | `string` |  |
| `engineVersion?` | `string` |  |
| `players` | `{ name: string; connected: boolean; rematch: boolean; seat?: number; playerId?: number; eliminated?: boolean; conceded?: boolean; commander?: string; cover?: string; bracket?: number; /** Na sala de espera: false enquanto o jogador escolhe o deck. Ausente em pontes antigas (todos com deck). */ ready?: boolean; /** Tocou em Pronto na sala de espera; a partida só começa com todos prontos. Ausente em pontes antigas. */ confirmed?: boolean }[]` | commander, cover (carta da arte do deck) e bracket (no Commander) só aparecem para o lobby; o resto do deck fica escondido. |
| `spectators?` | `string[]` | Nomes de quem assiste sem jogar. Ausente em pontes antigas. |

## RoomSaying

Mensagens prontas do lobby; a ponte recusa qualquer outra.

```ts
'hello' | 'back' | 'invite' | 'glhf'
```

## FSkipVote

`slow`: a votação é para pular a vez de quem está demorando (conectado), não o turno de quem caiu.

| Campo | Tipo | O que é |
|---|---|---|
| `target` | `number` |  |
| `name` | `string` |  |
| `yes` | `number` |  |
| `no` | `number` |  |
| `voters` | `number` |  |
| `needed` | `number` |  |
| `canVote` | `boolean` |  |
| `mine?` | `'yes' \| 'no'` |  |
| `slow?` | `boolean` |  |

## FSkip

`slow`: jogadores conectados que a mesa espera há mais de 2 minutos (dá para votar para pular a vez deles).

| Campo | Tipo | O que é |
|---|---|---|
| `vote?` | `FSkipVote` |  |
| `skipping` | `number[]` |  |
| `slow?` | `number[]` |  |

## FUndoStep

Uma decisão que dá para desfazer: o que o jogador fez e quando; text é a frase pronta ("jogar Floresta").

| Campo | Tipo | O que é |
|---|---|---|
| `action` | `'pass' \| 'land' \| 'cast' \| 'ability'` |  |
| `card?` | `string` |  |
| `turn` | `number` |  |
| `phase?` | `string` |  |
| `text` | `string` |  |

## FUndoRequest

Pedido de desfazer aberto: de quem, o que volta, se é o seu, se você vota e quem ainda não aceitou.

| Campo | Tipo | O que é |
|---|---|---|
| `player?` | `number` |  |
| `name` | `string` |  |
| `step` | `FUndoStep` |  |
| `mine` | `boolean` |  |
| `canVote` | `boolean` |  |
| `vote?` | `'yes' \| 'no'` |  |
| `waiting` | `string[]` |  |

## FUndo

Desfazer (em toda partida, para quem joga): a sua última decisão (o que um pedido desfaria agora) e o pedido aberto.

| Campo | Tipo | O que é |
|---|---|---|
| `last?` | `FUndoStep` |  |
| `pending` | `boolean` |  |
| `request?` | `FUndoRequest` |  |

## FForecast

Previsão do combate de um jogador atacado, com as regras do Forge (prevenção, golpe duplo, atropelar, infectar). poison só vem quando há veneno; commander, os comandantes que causam dano; lethal diz o que derrota o jogador.

| Campo | Tipo | O que é |
|---|---|---|
| `player` | `number` |  |
| `life` | `number` |  |
| `lifeAfter` | `number` |  |
| `poison?` | `number` |  |
| `poisonAfter?` | `number` |  |
| `commander?` | `{ commanderId: number; damage: number; after: number }[]` |  |
| `planeswalkers?` | `{ id: number; loyalty: number; after: number }[]` |  |
| `lethal?` | `'life' \| 'poison' \| 'commander'` |  |

## FState

| Campo | Tipo | O que é |
|---|---|---|
| `type` | `'state'` |  |
| `config?` | `MatchConfig` |  |
| `preferences?` | `FPreferences` |  |
| `match?` | `FMatch` |  |
| `sideboarding?` | `FSideboarding` |  |
| `matchId?` | `string` |  |
| `events?` | `FEvent[]` |  |
| `eventCursor?` | `number` |  |
| `stateVersion?` | `number` |  |
| `rulesVersion?` | `string` |  |
| `engineVersion?` | `string` |  |
| `turn` | `number` |  |
| `phase` | `string \| null` |  |
| `activePlayer` | `number \| null` |  |
| `extraTurn?` | `boolean` | O turno atual é um turno extra. |
| `extraTurns?` | `number[]` | Jogadores dos turnos extras que ainda vão acontecer, na ordem. |
| `combatNumber?` | `number` | Qual combate deste turno está acontecendo (2 = o primeiro combate extra). |
| `extraCombats?` | `number` | Combates extras ainda por vir neste turno e as fases depois das quais cada um começa. |
| `extraCombatAfter?` | `string[]` |  |
| `extraPhaseAfter?` | `Record<string, string>` | Fases que, por causa de uma etapa extra, não seguem para a fase normal, e a fase que vem depois de cada uma. |
| `dayTime?` | `'day' \| 'night'` | Dia ou noite, só depois que a partida vira um dos dois; e as mágicas que quem joga o turno já conjurou nele. |
| `activeSpells?` | `number` |  |
| `turnElapsedMs?` | `number` | Quanto o turno atual já durou quando o estado saiu do servidor, em ms; ausente no fim do jogo e em pontes antigas. |
| `gameOver` | `boolean` |  |
| `lifeHistory?` | `{ turn: number; life: Record<string, number> }[]` | Vida de cada jogador (pelo id) no fim de cada turno; `turn` 0 é a vida inicial. Só no fim do jogo. |
| `spectating?` | `boolean` | Sem decisões a tomar: eliminado no Commander ou, com watching, assistindo sem jogar. |
| `watching?` | `boolean` | Assistindo à partida de uma sala sem ocupar assento; `you` é o jogador de cuja mesa se vê a partida. |
| `winner?` | `string` |  |
| `players` | `FPlayer[]` |  |
| `castable?` | `number[]` | Cartas do cemitério ou do exílio (de qualquer jogador) que você pode usar agora: flashback, tramadas... |
| `playableExile?` | `number[]` | Permissões vigentes para jogar do exílio, mesmo sem prioridade ou mana neste momento. |
| `suspendedExile?` | `number[]` | Cartas suspensas e cartas cujo gatilho de suspender ainda está na pilha. |
| `stack` | `{ id: number; text: string; /** Ausente em pontes antigas. */ kind?: 'spell' \| 'ability' \| 'trigger'; /** Só quando pago além do custo normal: forma de conjurar (flashback, aventura...), vezes reforçada, outros opcionais e o X. */ cast?: { mode?: string; kicker?: number; extras?: string[]; x?: number }; /** Habilidade de lealdade de um planeswalker: o custo ("+2", "0", "-3"), o texto impresso dela, sem o custo, e se é o ultimate. */ loyalty?: { cost: string; text?: string; ultimate?: boolean }; /** Modos escolhidos de uma mágica modal ("Escolha um —"): o número do modo na carta (1 é o primeiro) e o texto dele. */ modes?: { index: number; text: string }[]; source?: FCard; controller?: number; targets?: FTargets }[]` |  |
| `combat` | `{ attacker: number; defender?: number; defenderKind?: 'player' \| 'card'; blockers: number[] }[]` |  |
| `forecast?` | `FForecast[]` | Só na declaração de bloqueadores: como cada jogador atacado sai do combate com os bloqueios marcados até agora. Ausente em pontes antigas. |
| `log` | `string[]` |  |
| `you` | `number` |  |
| `input` | `{ gen: number; priority?: boolean; opening?: 'starting-player' \| 'play-draw' \| 'mulligan' \| 'mulligan-bottom'; openingStartingPlayer?: number; /** Outro jogador na abertura enquanto você espera: quem, se decide quem começa ou a mão, e se você já manteve a sua. */ openingWait?: { player: number; step: 'start' \| 'hand'; kept?: boolean }; openingReturnCount?: number; openingReturnRemaining?: number; openingSelected?: number[]; message: string; ok: FButton; cancel: FButton; selectable: number[]; selectableStacks?: number[]; selectablePlayers?: number[]; actionable?: number[]; untappable?: number[]; manaOnly?: number[]; card?: FCard; paying?: boolean; payingFor?: 'spell' \| 'ability' \| 'effect'; canAutoPay?: boolean; phyrexianLife?: number; /** Pagando: o custo que falta como o motor conta ("{1}{R}", "0" pago), descontado a cada mana gerada; total é o custo quando o pagamento abriu (só depois de pagar uma parte); life, a vida já separada para mana phyrexiana; x, o X escolhido. Ausente em pontes antigas. */ manaCost?: { remaining: string; total?: string; life?: number; x?: number }; /** Cartas selecionadas pelo motor no prompt atual, com os limites reais da escolha. */ /** players: só quando jogadores também podem ser escolhidos (proliferar). */ selection?: { cards: number[]; players?: number[]; min: number; max: number }; /** Improvisar, convocar ou dobrar água: virar permanentes antes da mana (selection traz as já viradas); remaining é o custo que falta. */ tapToPay?: { kind: 'improvise' \| 'convoke' \| 'waterbend'; remaining: string }; /** Proliferar: o que pode ganhar marcadores e se cada marcador ajuda ou prejudica quem escolhe. */ proliferate?: { candidates: ProliferateCandidate[] }; /** Escolha de conjurar durante a resolução do gatilho de suspender; usa OK/Cancelar. */ suspendCast?: { card: FCard }; /** Regra 903.9b: o comandante iria para a mão ou o grimório (to) e pode ir à zona de comando no lugar. */ /** Comandante iria para `to` (903.9b) ou, com `stays`, já está em `to` (903.9a, cemitério ou exílio). */ commanderMove?: { to: 'Hand' \| 'Library' \| 'Graveyard' \| 'Exile' \| string; stays?: boolean; card?: FCard }; /** Atacantes e bloqueadores da declaração atual, identificados pela instância da carta. */ blocking?: { selectedAttacker: number \| null; attackers: number[]; blockers: number[]; legalAssignments: { blocker: number; attackers: number[] }[] }; attacking?: { attackers: number[]; defenders: { id: number; kind: 'player' \| 'card' }[]; legalAssignments: { attacker: number; defenders: { id: number; kind: 'player' \| 'card' }[] }[] }; targeting?: FTargeting; /** Voto numa permanente, escolhido tocando no campo: a carta que vota e os votos já dados. */ vote?: { card: FCard; votes: FVote[] } }` | targeting: escolhendo alvos; source é a carta que alveja (card traz os dados dela) e o resto são os alvos já escolhidos. |
| `question?` | `FQuestion` |  |
| `deciding?` | `{ player: number; kind: 'choice' \| 'attack' \| 'block' }[]` | Outros jogadores com uma decisão aberta (alvo, pergunta, ataque, bloqueio); prioridade comum fica de fora. |
| `waiting?` | `{ player: number; kind: 'priority' \| 'choice' \| 'attack' \| 'block'; ms: number }[]` | Jogadores humanos que a mesa espera agora, inclusive quem recebe o estado e a prioridade comum, com quanto tempo a espera atual já durou quando o estado saiu (ms). Uma resposta abre outra espera. Ausente em pontes antigas. |
| `room?` | `FRoom` |  |
| `audience?` | `{ listed: boolean; spectators: string[] }` | Contra o computador: se a partida está na lista de salas (para assistir) e quem assiste. Ausente em pontes antigas. |
| `skip?` | `FSkip` | Em rede: votação para pular o turno de quem caiu e os jogadores com o turno já aprovado para pular. |
| `undo?` | `FUndo` |  |
| `session?` | `{ code: string; token: string; room: boolean }` | Para voltar a esta partida se a conexão cair: {type:"rejoin", code, token}. |
| `decks` | `string[]` |  |

## ProliferateEffect

```ts
'good' | 'bad' | 'mixed' | 'neutral'
```

## ProliferateCandidate

holder: jogador de cujo lado o marcador conta (o próprio jogador, o controlador ou quem protege a batalha).

| Campo | Tipo | O que é |
|---|---|---|
| `kind` | `'card' \| 'player'` |  |
| `id` | `number` |  |
| `holder?` | `number` |  |
| `effect` | `ProliferateEffect` |  |
| `suggested` | `boolean` |  |
| `counters` | `{ type: string; count: number; effect: Exclude<ProliferateEffect, 'mixed'> }[]` |  |

## FTargets

Alvos de uma mágica ou habilidade: ids de cartas e de jogadores.

| Campo | Tipo | O que é |
|---|---|---|
| `cards?` | `number[]` |  |
| `players?` | `number[]` |  |

## FTargeting

Escolhendo alvos antes de ir para a pilha: a carta que alveja (source/card) e os alvos já escolhidos. Só na escolha em si (não no pagamento) e ausentes em pontes antigas: kind diz o que pede o alvo; ability é o texto da habilidade ou do gatilho como o motor escreve (fica de fora nas mágicas); min/max/count são deste passo da escolha; valid é o que serve como alvo, na sintaxe do Forge ("Creature.OppCtrl"), e zones, fora do campo.

Estende: `FTargets`

| Campo | Tipo | O que é |
|---|---|---|
| `source` | `number` |  |
| `card?` | `FCard` |  |
| `kind?` | `'spell' \| 'ability' \| 'trigger'` |  |
| `ability?` | `string` |  |
| `min?` | `number` |  |
| `max?` | `number` |  |
| `count?` | `number` |  |
| `valid?` | `string[]` |  |
| `zones?` | `string[]` |  |

## MatchOwner

Quem joga com a conta conectada: o token da sessão e o deck salvo, para a partida entrar em Minhas partidas.

| Campo | Tipo | O que é |
|---|---|---|
| `conta?` | `string` |  |
| `deckId?` | `string` |  |

## ClientMessage

```ts
| ({ type: 'start'; you: unknown; bracket?: number; opponent: unknown; opponents?: unknown[]; config: MatchConfig; /** O nome que o jogador usa, só para o histórico (na mesa ele é "Você"). */ name?: string; /** Estilo do computador (src/aiStyle.ts); sem ele, o equilibrado. */ aiStyle?: AiStyle } & MatchOwner)
  | ({ type: 'host'; name: string; /** null: cria a sala sem deck e escolhe lá dentro (room-deck). */ deck: unknown; config: MatchConfig; visibility?: RoomVisibility; code?: string; cover?: string; bracket?: number } & MatchOwner)
  | ({ type: 'join'; code: string; name: string; /** null: entra sem deck e escolhe lá dentro (room-deck). */ deck: unknown; cover?: string; bracket?: number } & MatchOwner)
  | ({ type: 'room-deck'; requestId: string; deck: unknown; cover?: string; bracket?: number } & MatchOwner)
  | { type: 'lab-host'; name: string; scenario: LabScenario }
  | { type: 'room-say'; key: RoomSaying }
  | { type: 'rejoin'; code: string; token: string }
  | { type: 'watch'; code: string; name: string } | { type: 'watch-player'; player: number } | { type: 'watchable'; on: boolean } | { type: 'fill-computers' } | { type: 'room-ready'; on: boolean }
  | { type: 'validate-deck'; requestId: string; format: DeckFormat; deck: unknown }
  | { type: 'lookup-room'; requestId: string; code: string }
  | { type: 'list-rooms'; requestId: string }
  | { type: 'fetch-deck'; requestId: string; site: 'moxfield' | 'archidekt'; id: string }
  | { type: 'similar-cards'; requestId: string; oracleId: string; candidates: string[]; limit?: number }
  | { type: 'sideboard'; id: number; deck: unknown } | { type: 'next-game'; id: number } | { type: 'sideboard-cancel'; id: number }
  | { type: 'rematch' } | { type: 'leave' } | { type: 'lab-close' }
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
  | { type: 'pass-turn-stop' }
  | { type: 'skip-vote'; target: number; value?: boolean }
  | { type: 'undo-request' } | { type: 'undo-vote'; value: boolean } | { type: 'undo-cancel' }
  | { type: 'answer'; id: number; indices?: number[]; amounts?: number[]; value?: boolean; text?: string; all?: boolean }
```

## SimilarCard

Carta parecida devolvida pela ponte: a nota (0 a 1) e as tags em comum que mais pesaram.

| Campo | Tipo | O que é |
|---|---|---|
| `oracleId` | `string` |  |
| `score` | `number` |  |
| `tags` | `string[]` |  |

## RequestReplies

O que cada pedido (com requestId) devolve quando dá certo.

| Campo | Tipo | O que é |
|---|---|---|
| `'validate-deck'` | `DeckValidation` |  |
| `'room-deck'` | `void` |  |
| `'lookup-room'` | `RoomInfo` |  |
| `'list-rooms'` | `PublicRoom[]` |  |
| `'fetch-deck'` | `string` |  |
| `'similar-cards'` | `SimilarCard[]` |  |

## RequestMessage

```ts
| RoomDeckRequest
  | { type: 'validate-deck'; format: DeckFormat; deck: unknown }
  | { type: 'lookup-room'; code: string }
  | { type: 'list-rooms' }
  | { type: 'fetch-deck'; site: 'moxfield' | 'archidekt'; id: string }
  | { type: 'similar-cards'; oracleId: string; candidates: string[]; limit?: number }
```

## ReplyMessage

Respostas a um pedido; `requestId` diz a qual.

```ts
{ requestId: string } & (
  | { type: 'validation'; validation: DeckValidation }
  | { type: 'room-info'; room: RoomInfo }
  | { type: 'room-list'; rooms?: PublicRoom[] }
  | { type: 'room-deck' }
  | { type: 'deck-source'; body: string }
  | { type: 'similar-cards'; cards?: SimilarCard[] }
  | { type: 'validation-error'; validation: DeckValidation; target?: string }
  | { type: 'request-error' | 'error'; text?: string; reason?: string })
```

## ServerMessage

Tudo o que o servidor manda à mesa. Campo novo numa mensagem: declare aqui (o estado tem o próprio contrato, FState).

```ts
| FState
  | { type: 'room'; room: FRoom }
  | { type: 'room-say'; seat: number; key: RoomSaying }
  | { type: 'validation-error'; validation: DeckValidation; target: string; requestId?: string }
  | { type: 'hello'; supportedFormats: DeckFormat[]; rulesVersion: string; engineVersion: string }
  | { type: 'toast'; text: string; title?: string; cards?: { id: number; name: string }[] }
  | { type: 'error'; text: string; requestId?: string; reason?: string }
  | { type: 'diagnostic'; code?: string; action?: string; text?: string }
  | { type: 'gone'; text: string }
  | { type: 'replaced'; text: string }
  | ReplyMessage
```
