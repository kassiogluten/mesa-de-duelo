# Referência: o que o log do MTG Arena ensina para a mesa em Godot

Data: 2026-11-22 · Apoio à [spec da mesa em Godot](spec-mesa-godot.md) (item 148 do `ROADMAP.md`)

Levantamento feito no log detalhado que o próprio Arena grava no PC de quem joga (8 partidas, ~2.500 estados, outubro de 2026). Serve como **referência de arquitetura e de ritmo**: como um jogo de cartas digital comercial separa "o que aconteceu" de "como mostrar". Nada aqui é para copiar visual, arte, som ou texto do Arena: a mesa nova tem identidade própria (regra da spec).

O que foi e o que não foi feito: só foi lido o log de texto que o Arena escreve de propósito para ferramentas de terceiros (o mesmo que rastreadores como o 17lands usam). O cliente não foi descompilado, nenhum arquivo do jogo foi extraído, a memória do programa não foi lida e a conexão não foi interceptada; isso fica fora (termos de uso e direitos autorais).

## Como obter o log

- **Onde:** `%USERPROFILE%\AppData\LocalLow\Wizards Of The Coast\MTGA\Player.log`.
- **Ligar (vem desligado):** no Arena, Opções → Conta → **Logs detalhados (suporte a plugins)**, e reabrir o Arena. Sem isso, o arquivo existe, mas só com erros e carregamentos.
- **Guarda pouco:** a cada abertura do Arena, o `Player.log` vira `Player-prev.log` e o anterior some. Para juntar muitas partidas, copiar o arquivo antes de abrir de novo.
- **Formato:** texto do Unity com linhas de JSON. As mensagens da partida estão nas linhas que começam com `{` e têm `greToClientEvent.greToClientMessages[]`; cada linha tem um `timestamp` em ms. As do cliente para o servidor têm `clientToMatchServiceMessageType`.
- **O que não tem:** a coleção de cartas do jogador (o Arena parou de gravar). Da conta, tem wildcards, gemas, ouro e o resumo dos decks (nome, formato, sem cartas) a cada abertura, e a lista completa só dos decks jogados ou editados na sessão.

## 1. Modelo de estado: diferenças em lote, passos de animação separados

| Observado | Números | Lição para a mesa em Godot |
| --- | --- | --- |
| O servidor manda **diferenças**, quase nunca o estado inteiro | 1.379 diferenças × 5 estados completos (um por jogo e reconexão) | Nosso servidor manda o estado inteiro do assento a cada 50 ms. Não precisa mudar agora: o `StateDiff` da mesa em Godot compara os dois estados por id de carta e chega no mesmo resultado. Se o tamanho virar problema no Commander com 4, diferença no servidor é o caminho |
| Cada estado tem `gameStateId` e `prevGameStateId` | sempre | A tela sabe sobre qual estado cada diferença se aplica. Nosso `stateVersion`/`eventCursor` cumpre o papel |
| Três tipos de estado: `SendHiFi` (passo intermediário, só para animar), `SendAndRecord` (marco que vale) e `Send` | 1.963 / 442 / 152 | A tela anima pelos passos intermediários e trata o marco como verdade. É a mesma ideia do nosso `frame` por evento: **manter**. A fila de apresentação em Godot deve poder pular passos intermediários no modo Rápido sem perder o marco |
| Vários estados chegam no mesmo instante, para uma jogada só | lotes de até 20; em mais da metade dos instantes chega mais de um | A tela recebe tudo de uma vez e mostra um passo por vez. Confirma a fila de `tablePresentation.ts` como modelo para o porte |
| `pendingMessageCount` no estado | 161 estados | O servidor avisa que vem mais coisa da mesma jogada: a tela não libera o clique no meio. Para nós: não mostrar os botões de ação enquanto a fila de apresentação tem passos |
| `diffDeletedInstanceIds` | 207 estados | Objeto que deixou de existir (ficha que sumiu, habilidade que saiu da pilha): a tela faz a saída dele em vez de só apagar |

## 2. Identidade da carta ao mudar de zona

- Cada objeto tem `instanceId` (aquele objeto, naquele momento) e `grpId` (qual carta é, para imagem e texto).
- Ao mudar de zona, a carta **ganha um id novo** (regra do jogo: é outro objeto), e o aviso `ObjectIdChanged {orig_id, new_id}` liga os dois. A tela usa isso para animar **a mesma carta física** da mão para a pilha e da pilha para o campo, em vez de sumir com uma e criar outra. Embaralhar também troca os ids (`Shuffle {OldIds, NewIds}`), para ninguém seguir a carta dentro do grimório.
- **Para a mesa em Godot:** o nó 3D de cada carta tem que sobreviver à troca de zona. Conferir se o id do Forge que mandamos se mantém entre zonas; se não se mantém em algum caso (cópia, carta que volta à mão, comandante), o servidor precisa mandar a ligação "id antigo → id novo" no evento.

## 3. Avisos de um momento (o que aconteceu, para animar)

Cada estado traz `annotations[]`: `type`, `affectorId` (quem causou), `affectedIds` (quem sofreu) e `details` (chave e valor). Média de 1,9 por estado, até 33 numa jogada. A tela escolhe o efeito por esses avisos, não por comparar zonas.

| Aviso | Vezes | Detalhes | Uso na mesa em Godot | Nós hoje |
| --- | --- | --- | --- | --- |
| `PhaseOrStepModified` | 1.006 | phase, step | Trilha de fases | `turn` e o estado |
| `TappedUntappedPermanent` | 526 | tapped | Virar/desvirar com peso | No estado |
| `ZoneTransfer` | 459 | zone_src, zone_dest, **category** | Escolher a animação **pelo motivo** (seção 4) | `entered`/`left` com `reason` parcial |
| `UserActionTaken` | 444 | actionType, abilityGrpId | Quem fez o quê (jogar, conjurar, ativar, pagar) | `spell-cast`, `ability-activated` |
| `AbilityInstanceCreated` / `Deleted` | 439 / 445 | source_zone | Habilidade nasce da carta e vai para a pilha | `ability-activated`, `stack-removed` |
| `ObjectIdChanged` | 382 | orig_id, new_id | Seção 2 | — |
| `ResolutionStart` / `Complete` | 278 / 280 | grpid | Dois momentos: "começou a resolver" (a carta se ergue na pilha) e "terminou" (efeitos já aplicados) | `resolved` (um só) |
| `ManaPaid` | 251 | id (fonte), color | **A mana sai da terra que pagou e vai até a mágica, na cor certa** | — (falta) |
| `NewTurnStarted` | 91 | — | Abertura de turno | `turn` |
| `CounterAdded` / `CounterRemoved` | 73 / 6 | counter_type, transaction_amount | Marcador entrando ou saindo, com quantidade | `counters` |
| `LayeredEffectCreated` / `Destroyed` | 73 / 35 | — | Começo e fim de um efeito contínuo (aura de bônus acende e apaga) | — |
| `TokenCreated` / `TokenDeleted` | 71 / 7 | — | Ficha nasce (não vem de zona nenhuma) e some (não vai para o cemitério) | `entered`/`left` |
| `DamageDealt` | 62 | damage, type, markDamage | Golpe da fonte (`affectorId`) no alvo; `type` separa combate de outros | `damage` (mais rico: atropelar, toque mortífero etc.) |
| `ModifiedLife` | 58 | life (+/−) | Número da vida | `life-changed` |
| `PlayerSelectingTargets` / `PlayerSubmittedTargets` | 37 / 37 | — | **O oponente está escolhendo alvos agora** (mostrar para os outros) e terminou | — (falta) |
| `SyntheticEvent` | 28 | type | Evento só para a tela (ex.: o golpe que tira vida) | — |
| `RevealedCardCreated` / `Deleted` | 23 / 14 | — | Carta revelada aparece e some | `reveal` |
| `PowerToughnessModCreated` | 20 | power, toughness | Número de poder/resistência pulando (+2/+2) | No estado |
| `Shuffle` | 10 | OldIds, NewIds | Embaralhar | `shuffle` |
| `ChoiceResult` | 8 | Choice_Value, Choice_Domain | Mostrar o que o oponente escolheu (modo, cor, nome) | Parcial, no log |
| `ShouldntPlay` | 8 | Reason | Aviso de jogada ruim antes de confirmar (ex.: mágica sem alvo útil) | — |
| `MultistepEffectStarted` / `Complete` | 5 / 5 | SubCategory | Agrupa um efeito longo (vidência, busca) para a tela tratar como um bloco | — |
| `Scry` | 5 | topIds, bottomIds | Quantas foram para cima e para baixo | `scry` |
| `AttachmentCreated` | 5 | — | Equipamento/aura grudando | `attached` |
| `GainDesignation` | 1 | DesignationType | Monarca, iniciativa, cidade | No estado |

## 4. Motivo de cada mudança de zona (`ZoneTransfer.category`)

Contagem nas 8 partidas: Draw 93, Resolve 91, CastSpell 88, PlayLand 79, Put 28, Mill 18, Sacrifice 16, Exile 14, Return 10, SBA_Damage 7, Discard 5, Destroy 2, Countered 1, Copy 1, SBA_ZeroLoyalty 1, SBA_LegendRule 1.

Com o motivo, cada saída ganha efeito próprio sem a tela adivinhar. Os `SBA_*` são as ações baseadas em estado: a criatura morre **por dano** (`SBA_Damage`), por resistência zero, o planeswalker por **lealdade zero**, a lendária repetida pela **regra da lenda**.

**Lacuna no nosso servidor:** o `left.reason` hoje diz `destroyed`, `sacrificed` e casos de ninjutsu/sneak/warp. Faltam pelo menos: morreu por dano, resistência zero, lealdade zero, regra da lenda, devolvida à mão, exilada, anulada, moída, descartada. É mudança no `forge-bridge` (o Forge sabe o motivo) e serve às duas mesas.

## 5. Avisos que duram (`persistentAnnotations`)

Ficam no estado enquanto valem e somem por `diffDeletedPersistentAnnotationIds`. São o modelo para tudo que a mesa em Godot desenha **continuamente** (estado em CSS na mesa atual; shader ou decalque no Godot):

| Aviso | Vezes | Uso |
| --- | --- | --- |
| `EnteredZoneThisTurn` | 478 | Enjoo de invocação, "entrou neste turno" |
| `TriggeringObject` | 143 | Liga o gatilho na pilha à carta que disparou (seta ou brilho na origem) |
| `ColorProduction` | 94 | Que cores cada terra pode gerar (gema de cor na terra) |
| `Counter` | 77 | Marcadores atuais |
| `Qualification` | 56 | Habilidade ganha por efeito (voar, ameaçar), com aviso de duração (`durationWarning`) |
| `LayeredEffect` | 43 | Efeito contínuo ativo, com a fonte |
| `TargetSpec` | 38 | **Alvos de quem está na pilha** (setas que ficam até resolver) |
| `ModifiedPower` / `ModifiedToughness` | 36 / 29 | De onde vem cada bônus (marcador ou efeito, e qual fonte): o balão do bônus mostra a origem |
| `Designation` | 32 | Monarca, comandante, iniciativa |
| `AbilityWordActive` | 24 | Limiar, metalurgia etc. ativos ou não, com o valor e o limite (ex.: 5/7) |
| `ObjectsSelected` | 21 | O que um jogador está selecionando agora |
| `InstanceRevealedToOpponent` | 20 | Carta da mão que o oponente já viu |
| `AddAbility` / `RemoveAbility` | 15 / 1 | Habilidade dada ou tirada por efeito |
| `CastingTimeOption` | 12 | Escolha feita ao conjurar (kicker, custo alternativo) |
| `CardRevealed` | 12 | Carta revelada |
| `ModifiedType` / `ModifiedColor` | 10 / 1 | Tipo ou cor mudados por efeito |
| `SuppressedPowerAndToughness` | 7 | Poder/resistência escondidos (virada para baixo) |
| `FaceDown` | 6 | Virada para baixo, e por quê |
| `Attachment` | 5 | Quem está preso em quem |
| `DamagedThisTurn` | 5 | Dano marcado neste turno |
| `LoyaltyActivationsRemaining` | 4 | Planeswalker já usou a habilidade do turno |
| `ReplacementEffect` | 4 | Efeito de substituição ativo, com a fonte |
| `ClassLevel` | 3 | Nível da Classe |
| `LossOfGame` | 2 | Motivo da derrota |
| `PredictedDirectDamage` | 1 | **Dano previsto** de uma mágica na pilha (mostrar no alvo antes de resolver) |
| `AbilityExhausted` | 1 | Habilidade de uso limitado já gasta |

## 6. Perguntas do servidor e respostas do cliente

| Pedido (servidor → tela) | Vezes | Nosso equivalente |
| --- | --- | --- |
| `ActionsAvailableReq` | 119 | `actionable` / `manaOnly` no estado |
| `SelectTargetsReq` | 38 | Pergunta de alvos |
| `DeclareAttackersReq` | 36 | `attacking` (atacantes e alvos válidos por atacante) |
| `SelectNReq` | 35 | `choose` com mínimo e máximo |
| `PromptReq` | 18 | `confirm` |
| `DeclareBlockersReq` | 15 | Bloqueio |
| `PayCostsReq` | 9 | Pagar mana manual |
| `MulliganReq` | 8 | Mulligan |
| `ChooseStartingPlayerReq` | 6 | Quem começa |
| `GroupReq` | 5 | Separar em pilhas (`piles`) |
| `CastingTimeOptionsReq` | 3 | Custos opcionais (`optionalCosts`) |
| `DistributionReq` | 1 | Dividir dano/marcadores (`divideTargets`) |
| `OrderReq` | 1 | `order` (ordem de gatilhos, topo do grimório) |
| `OptionalActionMessage` | 1 | "Sempre sim / sempre não" de gatilho opcional |
| `IntermissionReq` | 8 | Entre jogos (sideboard, fim de partida) |

As respostas do cliente seguem o par (`PerformActionResp`, `SelectNResp`, `SelectTargetsResp` + `SubmitTargetsReq`, `DeclareAttackersResp` + `SubmitAttackersReq`, `MulliganResp`, `GroupResp`, `EffectCostResp`, `PerformAutoTapActionsResp`...). Note o padrão de **dois passos** em alvos e combate: o cliente manda cada mudança de seleção (o servidor valida e recalcula o que ainda é válido) e depois confirma. Para nós: o servidor já valida por `gen`; recalcular os válidos a cada clique é o que deixa a seleção de atacantes e alvos sem erro na hora de confirmar.

### O que vem pronto em cada ação disponível

Cada ação de `ActionsAvailableReq` traz: `actionType` (Cast, Play, Activate, ActivateMana...), `instanceId`, **`manaCost` por cor**, `shouldStop` e, quando já dá para saber, os `targets` com `highlight` (`HighlightType_Hot` = alvo sugerido).

- `shouldStop`: o servidor diz se vale parar para esta ação (base do passar automaticamente). Nosso `actionable`/passar automático já faz isso no servidor.
- Alvo sugerido: a tela acende o alvo provável antes do clique. Ideia para a mesa em Godot, com o servidor mandando a sugestão.
- Custo por cor já calculado: a tela mostra o que falta pagar sem conta no cliente.

## 7. Presença: ver o que o oponente olha

- `UIMessage.onHover {objectId}`: a carta sob o mouse de cada jogador vai para o servidor e é repassada aos outros (~670 por sessão, nos dois sentidos; `onHover {}` = tirou o mouse).
- Com `PlayerSelectingTargets` e `ObjectsSelected`, a mesa mostra que o oponente **está pensando e no quê**, sem ele clicar.
- **Para a mesa em Godot (mouse):** é o que mais faz a mesa parecer ter outra pessoa. Hoje temos o `point` (apontar de propósito, com clique). Proposta: mandar o foco do mouse com limite de frequência (ex.: no máximo 5 por segundo, só quando muda) e mostrar um contorno discreto na carta que o oponente olha. Opcional nas configurações. Precisa de mensagem nova no protocolo.

## 8. Relógio da partida

`TimerStateMessage` (286 nas 8 partidas), por assento:

| Relógio | Duração | Aviso a partir de |
| --- | --- | --- |
| Antes de começar (`Prologue`) | 120 s | 30 s |
| Depois de acabar (`Epilogue`) | 145 s | 30 s |
| Jogador da vez (`ActivePlayer`) | 61 s | 30 s |
| Quem responde (`NonActivePlayer`) | 45 s | 30 s |
| Atraso (`Delay`) | 2 s | — |

Comportamento ao estourar: `TakeControl` (o servidor joga pelo jogador). O relógio fica rodando (`running`) e a tela mostra a "corda" nos últimos 30 s. **Nós não temos relógio no protocolo** (a ampulheta da mesa atual é só visual, depois de 2 min de turno). Fica como ideia para salas públicas; não entra na fase 1.

## 9. Zonas e etapas

- Zonas: Hand, Library, Battlefield, Stack, Graveyard, Exile, Command, Sideboard, mais as de apoio: **Revealed** (cartas reveladas por um momento), **Limbo** (objeto que saiu e ainda é referenciado), **Pending** (carta no meio de uma escolha) e **Suppressed**. As de apoio mostram que a tela precisa de lugares temporários para cartas "no ar" (sendo reveladas ou escolhidas), além das zonas do jogo.
- Etapas vistas: Upkeep, Draw, BeginCombat, DeclareAttack, DeclareBlock, CombatDamage, EndCombat, End, Cleanup (mais as fases principais).

## 10. Ordem típica de uma jogada

Conjurar uma mágica pagando 2 manas, como chega em **um** estado:

```
ObjectIdChanged → ZoneTransfer(CastSpell) →
  AbilityInstanceCreated → TappedUntappedPermanent → UserActionTaken → ManaPaid → AbilityInstanceDeleted   (1ª terra)
  AbilityInstanceCreated → TappedUntappedPermanent → UserActionTaken → ManaPaid → AbilityInstanceDeleted   (2ª terra)
→ UserActionTaken (conjurou)
```

Resolver uma mágica que causa 1 de dano:

```
ResolutionStart → DamageDealt → SyntheticEvent → ModifiedLife → ResolutionComplete → AbilityInstanceDeleted
```

Lição: a carta **vai para a pilha primeiro** e o pagamento vem depois, terra por terra. O efeito pode mostrar a carta subindo enquanto cada terra vira e solta a sua mana em direção a ela, em sequência. A resolução tem início, consequências e fim, então a carta da pilha pode "acender" no início e se desfazer no fim, com o dano entre os dois.

## 11. Campos de cada objeto

`instanceId, grpId, type, zoneId, visibility, viewers, ownerSeatId, controllerSeatId, cardTypes, subtypes, superTypes, color, name, power, toughness, damage, loyalty, loyaltyUsed, isTapped, hasSummoningSickness, attackState, attackInfo, blockState, blockInfo, isFacedown, isCopy, parentId, overlayGrpId, uniqueAbilities, objectSourceGrpId, abilityOriginalCardGrpIds, skinCode, baseSkinCode`.

Destaques: `visibility`/`viewers` (quem vê a carta: base para revelar só a quem pode ver), `attackState`/`blockState` separados do estado da carta, `parentId` (habilidade na pilha aponta a carta de origem), `skinCode` (estilo da carta é um campo, não uma carta diferente).

## O que vira trabalho (proposta, a decidir)

Para o servidor (serve às duas mesas):
1. **Motivo de saída completo** no `left.reason` (seção 4).
2. **Pagamento de mana com a fonte**: evento novo (ou campo no `spell-cast`/`ability-activated`) com a lista "carta que pagou → cor", para o efeito da mana indo até a mágica.
3. **Ligação de id** quando o Forge troca o id da carta entre zonas (seção 2), se algum caso trocar.
4. **Foco do mouse e seleção do oponente** (seção 7), opcional.
5. **Dano previsto** da mágica na pilha (já temos `forecast` no combate; estender às mágicas).

Para a mesa em Godot:
- Fila de apresentação com passos intermediários e marcos (seção 1), sem liberar clique com passo pendente.
- Nó 3D por carta física, que sobrevive à troca de zona (seção 2).
- Efeito escolhido pelo motivo (seção 4); estado contínuo por avisos que duram (seção 5).
- Zonas temporárias para cartas "no ar" (seção 9).

## Ainda falta medir (precisa de partidas gravadas)

O log tem a hora de chegada das mensagens, não a duração das animações. Com 2 ou 3 partidas gravadas (Win+Alt+R), medindo quadro a quadro com o ffmpeg e cruzando com o log da mesma partida: duração e curva de cada animação (compra, conjurar, pilha, resolver, dano, morte, ficha), tempo do clique até a resposta, efeitos simultâneos, proporções da tela. E, de fora do programa (Barra de Jogo do Windows ou PresentMon), o FPS e o tempo de quadro do Arena no campo cheio, como referência para o orçamento de 144 FPS.

## Cartas vistas nas 8 partidas (lista para testar efeitos)

102 permanentes que chegaram ao campo, úteis como lista de teste na mesa em Godot (variedade de terras de duas cores, fichas, sagas e classes, planeswalkers, criaturas grandes):

- **Fichas:** Hero, Jace, Knight, Ninja, Rabbit, Treasure, Wizard.
- **Terrenos:** Abandoned Air Temple, Access Tunnel, Adventurer's Inn, Bloodfell Caves, Blossoming Sands, Cavern of Souls, Choked Estuary, Command Tower, Dark Fortress, Elven Passage, Escape Tunnel, Evolving Wilds, Fabled Passage, Mirrex, Mount Doom, Oakhollow Village, Peculiar Lighthouse, Shipwreck Marsh, Sunken Hollow, Swarmyard, Temple of Deceit, Temple of Malice, Terramorphic Expanse e os básicos.
- **Demais:** Affectionate Indrik, Airbender Ascension, Aqueous Form, Arcane Signet, Authority of the Consuls, Azusa, Lost but Seeking, Beamtown Beatstick, Black Mage's Rod, Changeling Outcast, Chatterfang, Squirrel General, Coldsteel Heart, Cultivator Colossus, Death to Our Enemies, Delighted Halfling, Delney, Streetwise Lookout, Dimir Signet, Dragonspeaker Shaman, Drakuseth, Maw of Flames, Dryad of the Ilysian Grove, Fallen Shinobi, Gandalf, Goblins' Bane, Ghalta, Stampede Tyrant, Hare Apparent, Harmonized Trio, Hexing Squelcher, Imprisoned in the Moon, Innkeeper's Talent, Kaito, Bane of Nightmares, Kaito, Cunning Infiltrator, Liliana the Repentant, Mishra's Bauble, Mockingbird, Mysidian Elder, Network Disruptor, Nezumi Prowler, Ninja Teen, Nyxbloom Ancient, Primal Witchstalker, Prosperous Thief, Quilled Greatwurm, Radagast of Rhosgobel, Railway Brawler, Ride the Shoopuf, Sabotender, Sarkhan, Dragon Ascendant, Seam Rip, Silver-Fur Master, Simulacrum Shaper, Solid Ground, Squirrelanoids, Super Shredder, The Mind Stone, Thousand-Faced Shadow, Topiary Lecturer, Topiary Stomper, Traveling Chocobo, Tyrant of Kher Ridges, Unflinching Hortimancer, Unstable Amulet, Vaultborn Tyrant, Virulent Emissary, Vraska, the Cutting Glare, Wall of Omens, Way of the Mentor, Winter, Tormented Loner, Yuriko, the Tiger's Shadow, Zookeeper Mechan.

Os códigos do Arena (`grpId`) foram traduzidos para nomes pelo Scryfall (`/cards/arena/:id`) e, onde ele não tinha, pela tabela pública de cartas do 17lands (`cards.csv`).
