# Spec: Mesa nova em Godot (efeitos e desempenho)

Data: 2026-11-22 · Item 148 do `ROADMAP.md`

Esta spec foi escrita para ser executada em várias sessões, sem a conversa que a originou. O que foi decidido e descoberto está aqui.

## Objetivo

Uma segunda mesa, instalável no PC, focada em efeitos e desempenho, com o acabamento de um jogo de cartas digital de primeira linha (mesa 3D, cartas com peso, luz, câmera, partículas, som posicional) e **mais** efeitos do que a mesa atual. Ela consome o mesmo servidor (`forge-bridge`) e joga em crossplay com a mesa do navegador: uma sala criada numa aceita jogadores da outra.

A mesa atual **não** é substituída: continua sendo a porta de entrada (navegador e celular, sem instalar nada). A mesa nova é o "modo caprichado" para quem joga no PC.

**Layout (pedido em 22/11/2026):** aproximado ao da mesa atual, não idêntico. O jogador que conhece uma mesa se acha na outra: as zonas ficam nos mesmos lugares (seu campo embaixo e os oponentes em cima, mão em leque na base, pilha, retratos com vida, cemitério/exílio/grimório perto de cada jogador), e os botões principais seguem com os mesmos nomes e funções. Muitos detalhes da mesa atual existem só por ela rodar no navegador (cartas chapadas em DOM, efeitos limitados a `transform`/`opacity`, desfoques evitados, nada de 3D na mesa, layout que precisa caber no celular): aqui essas regras não valem, e cada tela deve ser repensada com perspectiva, profundidade, luz e animação de verdade.

Referência de qualidade: o nível dos jogos de cartas digitais comerciais. A identidade visual é nossa: nada de copiar layout, arte, sons ou elementos de interface de outro jogo.

## Decisões (22/11/2026)

| Assunto | Decisão | Por quê |
| --- | --- | --- |
| Motor | **Godot 4** (4.7.2 instalado pelo winget), renderizador Forward+ (Vulkan/D3D12) | Motor de jogo de verdade, código aberto, sem licença; partículas na GPU, shaders, pós-processamento, áudio 3D. Exporta para PC e, depois, celular |
| Linguagem | **GDScript tipado** (`var x: int`, `-> void`, avisos de tipo como erro) | O executável instalado é o sem .NET; GDScript não trava exportação para nenhuma plataforma e itera mais rápido. C# só se o profiler apontar gargalo de script |
| Aparelhos | **PC primeiro** (Windows; Mac/Linux pelo mesmo projeto), mouse e teclado | Libera os efeitos pesados; o celular segue com a mesa do navegador |
| Repositório | **Mesmo repositório**, pasta `godot-table/` | Mudança no protocolo atualiza as duas mesas; testes de contrato pegam quebra na hora |
| Primeiro marco | **Partida jogável** contra o computador, do começo ao fim, medindo FPS com o campo cheio | Prova a arquitetura antes de investir em brilho |
| Atualizações | **Atualizador próprio**: instala uma vez, e a cada abertura a mesa baixa só o pacote do jogo (`.pck`) novo do nosso servidor (ver [Atualizações diárias](#atualizações-diárias)) | Vamos publicar todo dia; o jogador não pode ter que reinstalar nada, e nenhuma loja fica no meio |
| Nome que o jogador vê | **Em aberto**: decidir antes da primeira versão para download | Regra do `CLAUDE.md`: nome que o jogador vê se pergunta |

Referência externa: [o que o log do MTG Arena ensina](referencia-log-arena.md) (modelo de estado, motivos de mudança de zona, avisos que duram, perguntas, presença, relógio e lacunas no nosso protocolo).

## O que o levantamento achou

**Servidor (crossplay sai de graça).**
- JSON em texto pelo WebSocket, um objeto com `type` por mensagem (`forge-bridge/.../BridgeServer.java`, Netty, até 1 MB por mensagem). Contrato em `src/forge/protocol.ts`, documentado em `docs/protocolo.md`.
- ~45 tipos cliente→servidor, ~13 servidor→cliente, mais 9 respostas casadas por `requestId`. No estado: 28 tipos de evento (`FEvent`), 7 tipos de pergunta (`FQuestion.kind`), 16 finalidades (`purpose`).
- O estado chega como **snapshot completo por assento** a cada 50 ms (se algo mudou), já filtrado pelo que o assento vê, com a lista **incremental** de eventos desde o `eventCursor`; cada evento traz um `frame` (retrato público da mesa naquele instante) para animar.
- Cliques levam `gen` (versão do prompt); o servidor descarta clique com `gen` velho (`ClientActions.java`).
- Reconexão: o estado traz `session:{code, token}`; `{type:"rejoin", code, token}` volta ao mesmo assento.
- **Não há autenticação no WebSocket nem versão de protocolo/cliente.** O servidor não distingue a mesa do navegador de outro cliente. A conta (Google) é REST em `/api/conta/` e entra no WebSocket só como campo `conta`.

**O que o servidor já entrega pronto (e o que não).**
- Regras, validação de deck, `actionable`/`manaOnly`/`forecast`, passar automaticamente: no servidor.
- Textos de pergunta, botões, pilha e log chegam no português do Forge, às vezes pela metade. A mesa atual conserta com expressões regulares (`src/ui/forgeText.ts`, `forgeRequest.ts`, `shortInstruction.ts`, `tableNotices.ts`). **É o ponto mais frágil de duplicar.**
- Nomes e textos de carta chegam em inglês (Oracle); o cliente traduz por `POST /api/cartas` (`CardDataCache.java`, `src/serverCards.ts`) e completa no Scryfall.
- Imagens: Scryfall pelo nosso cache (`/scryfall/...`, `img.mesao.online`), reescrita em `src/scryfallMirror.ts`.
- Sons: ~37 MP3 em `public/audio/` (mais `criaturas/`, `voz/`, `mesa/`), mapa em `src/ui/audio.ts`.

**A mesa atual (referência de comportamento, não de código).**
- ~40 mil linhas de TS em `src/`. Gargalo medido: o DOM redesenhando o campo (≈55 ms por estado com o campo cheio no Commander com 4), não os efeitos.
- A separação "o que aconteceu" × "como mostrar" já existe e é o modelo a seguir: `src/ui/presentationTimeline.ts` (tipos e duração de cada passo) e `src/ui/tablePresentation.ts` (fila que mostra uma jogada por vez, com a mesa no `frame` daquele passo; modo Rápido).
- Famílias de efeito a portar (e superar): `src/ui/motion*.ts` (dano em 14 variações, mágicas e pilha, combate, saídas do campo, limpa-campo, grimório, habilidades, comandante, momentos, objetos 3D). Laboratório: `tests/fixtures/effects-lab.ts` e `effectsLabPlays.ts`.
- Telas de pergunta (uma por finalidade): `src/ui/tableQuestion.ts`, `questionView.ts`, `amountChoice`, `numberChoice`, `modeChoice`, `nameChoice`, `typeChoice`, `colorChoice`, `libraryChoice`, `piles`, `proliferate`, `replacementOrder`, `triggerOrderInput`, `splitDestinations`, `optionalCosts`, `divideTargets`, `combatDamage`, `voteDialog`/`cardVote`, `dungeon`, `revealWindow`. Combate: `attackChoice.ts`, `combatForecast.ts`.
- Partidas gravadas (`src/forge/recording.ts`, quadros como diferenças): servem de entrada determinística para testar a mesa nova sem servidor.

## Arquitetura da mesa nova

```
godot-table/
  project.godot
  boot/       Tela de atualização e atualizador (embutidos no executável; não importam nada de fora daqui)
  net/        ForgeClient (WebSocketPeer, requestId, rejoin, gen), Protocol (constantes geradas)
  state/      MatchState (último FState), StateDiff (o que mudou entre dois estados, por id de carta)
  present/    PresentationQueue (porta de presentationTimeline/tablePresentation), EventText
  cards/      CardCatalog (/api/cartas + Scryfall, cache em disco em user://), CardTexture (mipmaps)
  table/      Table3D (cena), CardNode, Zones (campo, mão, pilha, cemitério, exílio, comando), Arrows
  ui/         Telas de pergunta e HUD em Control + Theme (texto em português)
  fx/         Efeitos (GPUParticles3D, shaders, Tween, câmera, WorldEnvironment com glow), Governor (degraus de qualidade)
  audio/      Sons (AudioStreamPlayer3D, os MP3 de public/audio)
  lab/        Laboratório de efeitos (cena sem servidor, câmera lenta, congelar)
  tests/      Testes headless (gdUnit4) e os fixtures dourados
```

Princípios:
1. **O servidor manda, a mesa mostra.** Nenhuma regra no cliente; a mesa nova só lê `FState`/eventos e manda cliques com `gen`.
2. **Cena persistente, não redesenho.** Cada carta é um `CardNode` que vive enquanto o id existe; um estado novo vira um diff (moveu de zona, virou, mudou contadores, entrou, saiu) e cada diff vira uma animação. É isso que tira o gargalo do DOM.
3. **Mesa toda na GPU; DOM nenhum.** Cartas como malhas com `ShaderMaterial` (textura, brilho de "pode jogar", foil, virar), mão em leque no espaço da câmera, setas de alvo e ataque como curvas 3D. Interface (perguntas, botões, HUD) em `Control`, por cima.
4. **Paridade por fixtures dourados, não por memória.** A lógica que existe nas duas mesas (consertos de texto do Forge, textos de evento, duração dos passos) é conferida pelos mesmos casos: um script do repositório exporta pares entrada→saída das funções de TS para `shared/golden/*.json`, e os testes da mesa nova rodam os mesmos arquivos. Uma mudança num lado que quebra o outro aparece no teste.
5. **Orçamento de desempenho fixo.** 144 FPS em 1080p num PC médio com o campo cheio do Commander com 4; 60 FPS mínimos com efeito grande vivo. Medidos num cenário fixo (ver Verificação), não afrouxados depois.
6. **Degraus de qualidade.** Como o `effectsGovernor.ts` da mesa atual: Alto/Médio/Baixo + Automático pelo tempo de quadro.

## Atualizações diárias

Requisito (22/11/2026): sai versão nova todo dia, e ela tem que chegar ao jogador sem esforço. Por isso o atualizador entra na **fase 0**, antes da primeira cena de jogo: tudo o que vier depois já nasce atualizável.

**Como funciona para o jogador.**
1. Baixa o instalador no site uma vez. Ele instala só para o usuário (em `%LOCALAPPDATA%`, sem pedir administrador) e cria o atalho.
2. A cada abertura, uma tela curta ("Procurando atualização… / Baixando 4,2 MB…") confere a versão e, se houver nova, baixa e entra. Sem internet ou com o servidor fora, entra com a última versão boa.
3. Com a mesa aberta e saindo versão nova, aparece um aviso discreto ("Versão nova disponível: reinicie quando terminar a partida"). Nunca reinicia sozinha no meio de uma partida.
4. O instalador só é baixado de novo quando o motor (Godot) muda, o que é raro; aí a própria tela de atualização baixa e abre o instalador novo.

**Como funciona por dentro.**
- O executável exportado traz embutido só o **boot** (`godot-table/boot/`): a tela de atualização e o atualizador, pequenos e estáveis. Todo o resto (cenas, scripts, efeitos, sons, texturas) vai num `game.pck` separado.
- Manifesto público no nosso servidor (`/mesa-pc/versao.json`, servido pelo nginx do deploy): `{ version, pck, sha256, size, engine, minBoot, download }`.
- O boot baixa o `.pck` para `user://updates/<versão>.pck.part`, confere tamanho e SHA-256, renomeia, carrega com `ProjectSettings.load_resource_pack()` e troca para a cena principal do jogo. Guarda a versão anterior para voltar se a nova não carregar (e só apaga depois de uma abertura bem-sucedida da nova).
- `engine` diferente do motor do executável ou `minBoot` maior que o do boot: em vez do `.pck`, oferece o instalador novo (se já tiver um pacote que funciona, entra com ele).
- Voltar uma versão ruim é trocar o manifesto para o `.pck` anterior.
- **Regras do código:** o boot não importa nada de fora de `boot/` nem usa `class_name` (ele roda antes do pacote existir). O código do jogo pode usar `class_name`: conferido em 22/11/2026 que classes com nome vindas do `.pck` carregado em tempo de execução funcionam no executável exportado. **Nada de autoload** no `project.godot`: as configurações do projeto vão embutidas no executável, que só tem o boot, e o autoload de um script que só existe no pacote quebraria a abertura. Serviços compartilhados são nós da tela que precisa deles (o `CardCatalog` é filho da `MatchScreen`).
- **Valores do JSON:** `String(null)` é erro no GDScript, e o servidor manda `null` em vários campos (`phase`, `activePlayer`…). Para texto vindo do servidor, use `Txt.of(valor)` (`game/txt.gd`).

**Publicar.** Nenhum passo a mais: o build do Docker exporta o `.pck` headless (`scripts/godot-pck.mjs`, `godot --headless --export-pack`, que não precisa de templates), calcula o hash e grava o manifesto por último, com a versão do `package.json`. Cada deploy da main (`/cp`) publica a mesa no PC junto com o site, quantas vezes for por dia.

**Compatibilidade com o servidor.** Como todo cliente se atualiza ao abrir, quase todos estão na versão do dia; quem ficou com a mesa aberta usa a anterior. O servidor continua aceitando o protocolo de pelo menos a versão anterior e recusa, com mensagem clara ("Atualize a mesa para continuar"), quem estiver abaixo do `protocolVersion` mínimo.

**Instalador.** Inno Setup por usuário (`PrivilegesRequired=lowest`). Assinar o executável e o instalador (por exemplo, Azure Trusted Signing) para o Windows não mostrar o aviso de "aplicativo não reconhecido"; como as atualizações diárias são só o `.pck`, a assinatura pesa apenas no instalador, que muda pouco.

## Mudanças no servidor (pequenas, compatíveis)

- `hello` do cliente passa a mandar `client` (`"web"` ou `"godot"`) e `clientVersion`; o `hello` do servidor ganha `protocolVersion`. Campos opcionais: a mesa do navegador continua igual. O servidor registra o tipo de cliente nas métricas e na área de admin e, no futuro, pode recusar cliente desatualizado com uma mensagem clara.
- Lembrar: mudou o `forge-bridge/`, reinicia o servidor da 7171 (regra do `CLAUDE.md`).
- Médio prazo (opcional): levar para o servidor os consertos de texto do Forge que hoje vivem em regex no cliente, para as duas mesas receberem o texto pronto (casa com `docs/spec-outros-idiomas.md`).

## Fases

Cada fase termina com algo que roda e é medido. Marque as caixas aqui e no item 148 do `ROADMAP.md`.

### Fase 0: Fundação
- [x] Projeto Godot em `godot-table/` (Forward+, GDScript tipado com declaração sem tipo como erro, `.gitignore` do `.godot/`). `npm run godot -- <args>` acha o executável (variável `GODOT`, PATH ou winget). Feito em 22/11/2026.
- [x] `ForgeClient` (`godot-table/net/forge_client.gd`): conecta, se apresenta no `hello`, consultas por `requestId` com `await`, guarda o `session` do estado e, se a conexão cai, tenta voltar ao assento com `rejoin` nos mesmos intervalos da mesa do navegador (~40 s); `gone`/`replaced` param as tentativas. `npm run godot:smoke` (hello e ping) e `npm run godot:partida` (inicia contra o computador com decks prontos, derruba a conexão e confere a volta ao mesmo assento) contra o servidor local. Feito em 22/11/2026.
- [x] `hello` com versão do protocolo: o servidor manda `protocolVersion` (`Rooms.PROTOCOL_VERSION`, hoje 1) e conta os clientes que se apresentam (`mesa.ws.client.hello{client}`); a mesa no PC manda `{type:"hello", client:"godot", clientVersion}`. A mesa do navegador ainda não se apresenta. Feito em 22/11/2026. Falta a mesa no PC recusar servidor com protocolo mais novo do que ela entende (fase 5).
- [x] Gerador `scripts/protocol-godot.mjs` (`npm run protocol-godot`): `godot-table/net/protocol.gd` com os tipos de mensagem, de evento, `kind` e `purpose` a partir de `protocol.ts`; `tests/protocol-godot.test.mjs` falha se o gerado estiver atrasado. Feito em 22/11/2026.
- [x] Testes dentro do Godot: `npm run godot:test` roda `godot-table/tests/test_*.gd` (métodos `test_*`, base `tests/test_case.gd`) headless, sem dependência externa (gdUnit4 ficou de fora: um executor de 40 linhas basta). Feito em 22/11/2026.
- [x] Fixtures dourados (feito na fase 2, 22/11/2026): `npm run godot:golden` roda os testes de TS dos textos com um gancho no carregador (`scripts/godot-golden-record.mjs`) que grava cada chamada às funções listadas em `RECORDED` (entrada, saída e as traduções de nome pedidas), soma as entradas reais das partidas gravadas em `godot-table/tests/fixtures/` e grava `godot-table/tests/golden/<função>.json`. Assim o corpus cresce sozinho quando a mesa do navegador ganha testes. `tests/godot-golden.test.mjs` (no `npm test`) falha se uma saída guardada deixou de ser a da mesa do navegador; `godot-table/tests/test_golden.gd` confere o porte (126 casos hoje). As durações da apresentação **não** entram: a mesa nova tem efeitos próprios, com ritmo próprio.
- [ ] Partida gravada como fixture para testar a cena sem servidor: vai para a fase 1, quando a cena existir (gravar os estados crus que o `ForgeClient` recebe).
- [x] Boot e atualizador (`godot-table/boot/`): o executável (preset "Windows") leva só o boot; o jogo vai no preset "Jogo" (`.pck`, sem `boot/`, `tools/`, `tests/`). Manifesto, download para `.part` com tamanho e SHA-256, versão anterior guardada, sem internet entra com a última boa, versão que não confirma em 2 aberturas vira quebrada e volta à anterior; a mesa confirma 2 s depois de abrir (`UpdateState.confirm()`). `npm run godot:test-atualizador` exporta o executável e confere os 7 casos. Feito em 22/11/2026. **Os arquivos do boot ficam listados um a um no `export_presets.cfg`** (o filtro do Godot não segue `preload` de script): arquivo novo em `boot/` entra lá, senão o executável não abre (o teste pega).
- [x] `class_name` vindo do `.pck` funciona no executável exportado (sonda no teste do atualizador, 22/11/2026).
- [x] Publicação: em vez de um comando à parte, o build do Docker (etapa `mesa-pc` do `Dockerfile`) roda `scripts/godot-pck.mjs` e põe `game-<versão>.pck` e `versao.json` em `/mesa-pc/` do site (rotas no `deploy/nginx.conf`: manifesto sem cache, pacote imutável). Cada deploy da main publica a mesa no PC na mesma versão do site. A etapa não bloqueia o deploy: se falhar, o site sobe e o log diz "AVISO: o pacote da mesa no PC não foi gerado". O `GODOT_VERSION` do `Dockerfile` tem que ser o mesmo do executável distribuído (o manifesto leva `engine`, e o boot recusa pacote de outro motor). Feito em 22/11/2026; **ainda não conferido num deploy de verdade** (sem Docker nesta máquina).

### Fase 1: Esqueleto jogável (primeiro marco)
- [x] Iniciar partida contra o computador com um deck pronto de `shared/starter-decks.json` (o `npm run godot` copia para `godot-table/data/`, fora do git; o pacote inclui `data/*.json`; `cards/starter_decks.gd`). Tela inicial `menu/menu_screen.gd`: seu deck e o do computador, Standard. Feito em 22/11/2026.
- [x] Cena 3D (`table/table_view.gd`, `table/card_node.gd`, `table/card.gdshader`, `table/table_top.gdshader`): campo dos dois jogadores (terrenos atrás, o resto à frente, virada gira, atacante avança), mão em leque de frente para a câmera (a carta sob o mouse sobe e cresce), mão do oponente em versos, pilha à direita, grimório com contagem, cemitério e exílio; cada carta é um nó que vive enquanto o id existe e voa em arco quando muda de zona. Cartas com imagem e nome em português pelo `cards/card_catalog.gd` (`/api/cartas` do servidor, imagens pelo cache `img.mesao.online` com reserva no Scryfall, guardadas em `user://cards/`, decodificadas noutro fio). HUD (`ui/hud.gd`): retratos com vida (anel dourado no turno, amarelo quando dá para escolher), fase do turno, caixa de ação com os botões do servidor, carta ampliada ao passar o mouse, avisos e o fim de partida. Feito em 22/11/2026.
- [x] Clicar carta/jogador/pilha, OK/Cancelar (Espaço = OK) com `gen`; pagar mana pelo botão Automático do servidor; atacar (clique na criatura) e bloquear (sua criatura, depois o atacante; direto se só há um); mulligan; fim de partida com "Voltar ao início". Perguntas pela janela genérica `ui/question_dialog.gd` (escolher, confirmar, número, quantidades, ordem, texto, revelar). Feito em 22/11/2026. **Os textos do Forge ainda chegam crus** ("Select target creature", "Pagar Custo de Mana: {1}"): o porte do `shortInstruction`/`forgeText` com os fixtures dourados é o primeiro item da fase 2.
- [x] Medir FPS e tempo de quadro (`ui/perf_meter.gd`, F3 ou `MESA_FPS=1`; o resumo sai no fim de um `MESA_PRINT`). 2 jogadores registrados em [Medições](#medições). **O Commander com 4 fica para a fase 2**, junto com o layout de 4 jogadores.
- [x] Testes da cena com estados gravados de uma partida de verdade (`tests/fixtures/abertura.json`, gravado por `tools/capture_states.gd`): zonas, o mesmo nó quando a carta muda de zona e o clique do mouse chegando na carta da mão pelo raio da câmera.

### Fase 2: Paridade de jogabilidade
- [x] Textos do Forge em português (22/11/2026), portados com os fixtures dourados: `text/forge_text.gd` (possessivos), `text/short_instruction.gd` (frase curta: alvo, pagamento, voto, contra-feitiço, rótulos do pagamento), `text/forge_request.gd` (pedidos de seleção e títulos), com `text/re.gd` para as expressões no jeito do JavaScript.
- [x] Caixa de ação com as regras da mesa do navegador (`text/action_box.gd`, porte de `boardPrompt`, `buttons`, `passLabel` e `cardDecision`): frase curta em destaque e o texto do Forge consertado embaixo, progresso da seleção, botões com os mesmos rótulos e a mesma ordem ("Para o combate", "Fim de turno", "Resolver todos (N)", "Manter 7", "Confirmar 2 atacantes", "Sem bloqueio", "Pagar automaticamente", "Desistir da mágica", "Sempre sim/não", "Pagar 2 de vida", "<nome> · Você" em quem começa…), cada um já com a mensagem que manda; Espaço aperta o principal.
- [x] As 7 perguntas e as 16 finalidades com tela própria e a resposta no formato da mesa do navegador (22/11/2026): `ui/question_dialog.gd` (roteamento, escolha genérica com cartas ou em lista, cartas reveladas apagadas, revelar, sim/não, texto, peças) e `ui/question_screens.gd` (ordem de gatilhos com "Lembrar esta ordem", outras ordens, modos com os indisponíveis e o motivo, jeito de jogar, vidência/vigilância, os dois montes, escolher monte, dano de combate com letal e a ordem dos bloqueadores, quantidades com "Dividir igual", número com valores soltos/X/vezes/desistir, votação, masmorra, substituição com "usar a mesma escolha", custos opcionais, nomear carta e tipo de criatura com busca, os dois destinos da busca, zona de comando). `tools/preview_question.gd` mostra cada uma com uma pergunta de exemplo.
- [x] Setas na mesa (`table/arrows.gd`): ataque (vermelho, até o retrato ou a permanente), bloqueio (azul), alvos sendo escolhidos e os do topo da pilha (dourado); seguem as cartas quando elas se movem.
- [x] Pilha interativa (clicar no item manda `stack`, o escolhível acende), pagamento de mana manual (clicar no terreno), convocar/improvisar/dobrar água em português, previsão de combate no bloqueio, e a barra do alto (`ui/match_bar.gd`): Desfazer com o pedido e a votação, votação para pular a vez de quem caiu ou demora, os quatro níveis de passar (guardados entre as partidas em `user://preferencias.json`) e "Passando até o fim do turno · parar". Testes da caixa de ação com os estados gravados (`tests/test_action_box.gd`).
- [x] Multijogador até 4 (`table/seat_layout.gd`): oponentes em colunas lado a lado no alto, como no Commander da mesa do navegador, cartas a 80%, retratos menores no alto de cada coluna, eliminado esmaecido. Tela inicial com "Commander · 4 jogadores". Reconexão: fase 0.
- [ ] Espectador ("Assistir" com o código na tela inicial), revanche (no fim do jogo) e o intervalo da melhor de três ("Seguir com o mesmo deck"): feitos em 22/11/2026. Falta trocar cartas com o sideboard entre os jogos e escolher de qual jogador se vê a mesa ao assistir.
- [x] **Crossplay conferido nos dois sentidos** (22/11/2026): `npm run godot:crossplay` — a mesa no PC cria a sala (`tools/room_check.gd`) e o cliente da mesa do navegador (`src/forge/client.ts`, o mesmo código do site) entra pelo código; depois o site cria e a mesa no PC entra. Nos dois, as duas mesas veem a mesma partida com os dois nomes. Na mesa no PC: "Criar sala", "Entrar" e "Assistir" com código na tela inicial e a sala de espera (`ui/room_panel.gd`). Falta uma partida inteira entre duas pessoas, à mão.

### Fase 3: Efeitos (o foco)
- [x] Diretor dos efeitos (`fx/fx_director.gd`, 22/11/2026): lê os eventos novos de cada estado **antes** de a mesa aplicá-lo, segura as cartas que vão para o cemitério ou o exílio (e a mágica anulada) para saírem em cena, e toca um efeito por evento em sequência curta (no máximo 2,4 s por estado; com muitos eventos, o ritmo encurta).
- [x] Peças (`fx/fx.gd`): faíscas na GPU na cor da carta (pelo custo de mana), onda de choque no tampo, projétil em arco com rastro, número que sobe, coluna de luz, clarão de luz de verdade, tremor e aproximação da câmera. Na carta (`table/card.gdshader`, `table/card_node.gd`): queimar com a borda acesa, ser sugada pelo portal, avanço do golpe, clarão e tremida.
- [x] Efeitos por evento: dano de mágica (projétil da fonte até o alvo) e de combate (o atacante avança e golpeia), com faíscas, onda, luz, o número e tremor nos golpes grandes; prevenido; infectar; vida (ganho em verde e o retrato pulsando); mágica conjurada (onda, faíscas e luz na cor, com "Cópia", "Reforçada", "X = n"); habilidade e gatilho (dourado); resolver; anulada (a carta queima em azul); entrada (lendária com coluna dourada, tremor e a câmera chegando perto); destruída queima, sacrificada queima em roxo, exilada vai pelo portal; ataque ("Ataque!") e bloqueio; marcadores; indestrutível/regenerada; compra; embaralhar; moeda e dado; faixa "Seu turno"/"Turno de X"; fogos na vitória e brasas na derrota.
- [x] Som (`fx/sounds.gd`): os mesmos arquivos e o mesmo mapa de evento para som da mesa do navegador, tocados no ponto da mesa onde o efeito acontece (esquerda/direita). Os sons vêm de `public/audio/` (o `npm run godot` copia para `godot-table/data/audio/`, e o deploy também).
- [x] Mesa viva: poeira de luz flutuando sobre o tampo (fica de fora no "leve").
- [x] Laboratório de efeitos (`lab/effects_lab.gd`, botão na tela inicial; `MESA_LAB=<botão>` abre e aperta): mesa montada sem servidor, um botão por efeito (inclusive limpa-campo, vitória e derrota), velocidade 1×, ¼× e 1/10×, "Remontar mesa".
- [x] Qualidade: "Efeitos: automático/alto/médio/leve" e o volume do som na tela inicial (`game/prefs.gd`, `user://preferencias.json`); no automático, o regulador baixa um degrau quando os quadros ficam lentos por 1,5 s.
- [x] Feito com quatro subagentes em paralelo (cada um numa cópia isolada, só com arquivos novos, e a integração no diretor feita depois), 22/11/2026:
  - Dados e moeda em 3D (`fx/dice3d.gd`, `fx/dice_shapes.gd`): d4 a d20 com o resultado em cima, moeda com cara e coroa em relevo, e o d6 de quem começa com os empates rolando de novo.
  - Momentos grandes (`fx/moments.gd`, `fx/moment_pieces.gd`): primeiro sangue (uma vez por jogo), eliminação dupla/tripla, golpe de comandante com o placar "X/21" (mais intenso a partir de 15, vermelho a partir de 18) e ultimate de planeswalker; cada um toca junto do evento que o causou, com o título no meio da tela.
  - Cartas voando (`fx/card_flights.gd`): cascata e descobrir (a encontrada para grande na frente da câmera), moer e vigilância (os eventos de uma carta cada viram um voo só), vidência e busca no grimório.
  - Som de cada tipo de criatura ao entrar (`fx/creature_sounds.gd`, os de `public/audio/criaturas/`), clima da mesa pela cor das mágicas (`fx/table_mood.gd`) e o pouso da carta com um quique pequeno (`fx/card_motion.gd`).
- [ ] Refinamentos: segurar a mudança da mesa até as cartas voando pousarem (hoje a carta de verdade já aparece no cemitério/exílio enquanto o voo acontece); inclinar a carta para o lado do mouse (`CardMotion.hover_tilt`, ainda não ligado); a voz do narrador nos momentos; e o "Cascata · N cartas" ficando atrás da carta encontrada.

### Fase 4: Fora da partida
- [ ] Salas públicas, criar/entrar em sala por código, sala de espera.
- [ ] Decks: importar por texto e pela conta (sincronia REST de `/api/conta/`). Login Google pelo fluxo de app instalado (navegador do sistema + retorno local); conferir se `Accounts.java` aceita o token desse cliente.
- [ ] Enviar relato (`/api/relatos`) com o estado da partida.

### Fase 5: Distribuição
- [ ] Instalador do Windows (Inno Setup, por usuário) assinado; página de download no site.
- [ ] Aviso de versão nova com a mesa aberta e recusa educada de cliente velho pelo `protocolVersion`.
- [ ] Decidir como as novidades da mesa nova aparecem para o jogador (seção própria no painel Novidades ou changelog próprio).

## Verificação

- **Contrato:** `npm test` (inclui o teste do gerador de protocolo e dos fixtures dourados) e `ProtocolContractTest` no servidor.
- **Mesa nova:** `npm run godot:test` (gdUnit4 headless, inclui a partida gravada tocada inteira sem erro).
- **Ponta a ponta:** com `npm run forge` ligado, `npm run godot:smoke` conecta, inicia partida contra o computador e passa turnos até o fim.
- **Crossplay:** a partir da fase 2, uma partida com um jogador em cada mesa, do começo ao fim.
- **Desempenho:** cenário fixo do Commander com 4 e campo cheio, medido com o profiler do Godot (tempo de quadro p50/p95/p99), antes e depois de cada fase de efeitos.

## Medições

**22/11/2026, fase 1, 2 jogadores** (RTX 4060 Ti, 1600×900, Forward+, sombras ligadas, `--disable-vsync`, partida contra o computador jogada pelo `MESA_AUTOJOGAR` por 60 s, turno 8 com ~25 cartas na mesa): **FPS médio 1.403**, 0,6 ms por quadro, ~165 objetos desenhados; 2 de 84.148 quadros acima de 18 ms, ambos na entrada da partida (pior: 147 ms, criando as cartas e compilando os shaders pela primeira vez). Antes de levar a decodificação das imagens para outro fio, os engasgos apareciam também quando as imagens chegavam.

**22/11/2026, fase 2, Commander com 4** (mesma máquina, `--disable-vsync`, partida contra 3 computadores pelo `MESA_AUTOJOGAR` por 110 s, turno 24 com ~70 cartas na mesa): **FPS médio 1.377**, 0,7 ms por quadro no fim, 361 objetos desenhados; 2 de 151.496 quadros acima de 18 ms (de novo só a entrada da partida, ~148 ms).

**22/11/2026, fase 3, efeitos** (mesma máquina, `--disable-vsync`, laboratório): limpa-campo com as cinco criaturas queimando em sequência, **1.305 FPS** durante o efeito (média de 1.233 na sessão, contando a abertura); o regulador do automático não precisou baixar.

Pendente: máquina mais fraca e placa integrada; o engasgo da entrada (compilar os shaders antes de a mesa aparecer).
