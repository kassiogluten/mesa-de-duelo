# Velocidade dos bots com a mesa cheia (estudo de 13/11/2026)

Pergunta: por que os bots demoram no Commander com 4 jogadores, e quanto o tamanho do campo pesa. Este arquivo guarda o
que foi medido, como medir de novo e o que ficou para decidir; o plano de trabalho é o item 124 do `ROADMAP.md`.

## Resumo

- Pensar, sozinho, é rápido: só o Forge (4 IAs, sem servidor, sem Monte Carlo) leva **~0,26 s** por turno de bot.
- Na partida de verdade, cada turno de bot leva em mediana **~2,3 s** (pior ~5–7 s), por duas causas que dá para ajustar:
  1. **Pausa do Forge quando o humano passa sozinho** (~0,8–0,9 s por turno de bot).
  2. **Monte Carlo da IA na força máxima de computador de mesa** (~1,1–1,3 s por turno de bot).
- Com o campo cheio o tempo explode: **1,7 s → 12 s → 27 s → 65 s** de mediana com 0, 40, 100 e 160 permanentes na mesa.
  Além das duas causas acima, crescem a IA e as regras do Forge e um trecho do próprio servidor
  (`VisibleEvents.prevented()`), que tem custo quadrático.
- Na mesa, a fila de animações hoje acompanha o servidor justamente porque a pausa do Forge segura o ritmo; sem a pausa,
  a mesa passa a pular muito mais jogadas. Mexer no servidor pede ajustar a fila da mesa junto.

## Como foi medido

- `forge-bridge/src/test/java/mesadeduelo/bridge/AiSpeedProbe.java` (fora do `mvn test` normal, só com
  `-Dmesa.medir=true`). Uma amostragem da pilha das threads do laço do jogo a cada 5 ms classifica o tempo em: IA
  pensando, regras do Forge, trabalho do servidor (por classe) e esperando (com onde espera).
  - `#engineOnly`: 4 e 2 IAs direto no `Match` do Forge (sem `HostedMatch`, então sem Monte Carlo e sem pausa).
  - `#realSession`: partida contra o computador pelo `Rooms` ("start"), com as preferências do `Main` e um humano
    automático que passa tudo, responde perguntas com a primeira opção e escolhe começar. Duas mesas
    (`commander-atraxa,goblins,elfos,zumbis` e `commander-fichas,dragoes,muldrotha,voadores`), 16 turnos.
    Grava os eventos que a mesa recebe em `forge-bridge/target/ai-speed-events*.jsonl`.
  - `#boardSize`: a mesma partida (primeira mesa) começando com N permanentes por jogador já em jogo (terrenos, mana,
    criaturas simples, Soul Warden, Glorious Anthem, Lightning Greaves...), 9 turnos. Mede também o tempo do servidor para
    montar e mandar o estado da mesa e o tamanho dele.
  - Opções: `-Dmesa.semPausa=true`, `-Dmesa.semMC=true`, `-Dmesa.umaMesa=true`, `-Dmesa.turnos=16`,
    `-Dmesa.campo=0,10,25,40`, `-Dmesa.turnosCampo=9`.
- `scripts/medir-apresentacao.mjs`: simula a fila de animações da mesa (`tablePresentation.ts`, `presentationTimeline.ts`)
  sobre os eventos gravados: quanto a mesa termina de mostrar cada turno depois do servidor e quantas vezes a fila passa de
  12 e pula para o fim (normal e "Rápido sem resposta").
- `scripts/medir-desenho.mjs`: tempo de redesenhar a mesa a cada estado novo, no navegador, com 0 a 60 permanentes por
  jogador (página `tests/fixtures/commander-table.html`, com o `npm run dev` ligado).

Exemplos:

```sh
cd forge-bridge
mvn -o test -Dtest=AiSpeedProbe#realSession -Dmesa.medir=true                       # como hoje
mvn -o test -Dtest=AiSpeedProbe#realSession -Dmesa.medir=true -Dmesa.semPausa=true  # sem a pausa
mvn -o test -Dtest=AiSpeedProbe#boardSize -Dmesa.medir=true -Dmesa.campo=0,25       # campo cheio
cd .. && node --import ./tests/register.mjs scripts/medir-apresentacao.mjs forge-bridge/target/ai-speed-events.jsonl
node scripts/medir-desenho.mjs
```

Limites: tudo numa máquina de 20 threads, rápida (um servidor mais fraco deixa a IA heurística e as regras mais lentas;
o Monte Carlo e a pausa têm tempo fixo); o humano automático não joga nada, então o campo dele fica vazio; cada partida
sorteia cartas diferentes, então as comparações têm ruído (os números são de 2 mesas por configuração); a mistura do
campo cheio tem Soul Warden e Glorious Anthem, que multiplicam gatilhos e efeitos contínuos, um caso pesado de propósito;
a parte da mesa é uma simulação da fila, e o desenho foi medido sem simular um celular.

## Resultados

### Partida de verdade, 16 turnos (mediana do turno de bot)

| Como roda | Turno de bot | Partida inteira |
|---|---|---|
| Hoje | 2,3 s | ~30–33 s |
| Sem a pausa do Forge | ~1,4–1,7 s | ~21 s |
| Sem a pausa e sem Monte Carlo | ~0,3–0,4 s | ~6–8 s |
| Só o Forge, sem servidor (sem Monte Carlo) | ~0,2–0,26 s | — |

Onde vai o tempo hoje (thread do jogo): ~45–52% esperando, quase tudo na pausa do Forge
(`PlayerControllerHuman.chooseSpellAbilityToPlay`) e o resto na thread de avaliação da IA; ~40% IA pensando
(`AiController.chooseSpellAbilityToPlay`, com o Monte Carlo); ~4–8% servidor (`VisibleEvents.receive`); o trabalho do
servidor para o humano (`AvailableActions`, Desfazer, `Castable`) fica abaixo de 1%.

### Campo cheio (permanentes postas no começo, 9 turnos)

| Na mesa | Turno de bot (mediana) | Pior turno | Estado para a mesa | Montar e mandar (mediana / p95 / máx) |
|---|---|---|---|---|
| 0 | 1,7 s | 2,8 s | 17 KB | 1,7 / 3,8 / 55 ms |
| 40 | 12 s | 18 s | 43 KB | 2,7 / 6,0 / 10 ms |
| 100 | 27 s | 76 s | 66 KB | 6,5 / 15 / 34 ms |
| 160 | 65 s | 88 s | 83 KB | 9,8 / 24 / 180 ms |

Com 100 (partida de 248 s): ~64 s na pausa do Forge (cada gatilho que resolve vale 400 ms), ~125 s na IA (a avaliação
das jogadas e dos ataques passa por todas as cartas), ~45 s em `VisibleEvents.receive`. Com 160 (421 s): IA 27%,
regras do Forge 26%, esperando 26% (83% disso na pausa), `VisibleEvents.receive` 20%.

### Na mesa (navegador)

Simulação da fila de animações sobre os eventos gravados (atraso médio da mesa no fim de cada turno, e quantas vezes por
partida a fila passou de 12 e pulou para o fim):

| Servidor | Normal | Rápido sem resposta |
|---|---|---|
| Hoje | ~1,5–2,7 s, pula 1–3 vezes | ~0,4–1,3 s, pula 0 vezes |
| Sem a pausa | ~1,8–2,0 s, pula 3–4 vezes | ~1,4 s, pula 1–2 vezes |
| Sem a pausa e sem Monte Carlo | ~0,8–1,3 s, pula 7–9 vezes (mostra ~25 passos em vez de ~70) | ~0,6–0,9 s, pula 6–9 vezes |

Redesenhar a mesa a cada estado novo (Commander com 4, computador rápido; num celular de entrada, espere 4 a 6 vezes
mais; os estados chegam a cada 50 ms enquanto os bots jogam):

| Permanentes por jogador | Na mesa | Elementos na página | Redesenhar (mediana / máx) | Até aparecer |
|---|---|---|---|---|
| 0 | 0 | 777 | 9 / 24 ms | 33 ms |
| 10 | 40 | 1.378 | 20 / 38 ms | 47 ms |
| 25 | 100 | 2.290 | 54 / 83 ms | 86 ms |
| 40 | 160 | 3.182 | 56 / 75 ms | 82 ms |
| 60 | 240 | 4.376 | 81 / 114 ms | 124 ms |

## As causas, com o código

1. **Pausa do Forge ao passar sozinho.** Em `PlayerControllerHuman.chooseSpellAbilityToPlay` (Forge), quando a
   prioridade do humano passa sem perguntar, o Forge dorme `FControlGamePlayback.phasesDelay` (200 ms) numa fase que o
   jogador não pula e `resolveDelay` (400 ms) com algo na pilha, a menos que `FPref.YIELD_SKIP_PHASE_DELAY` /
   `YIELD_SKIP_RESOLVE_DELAY` estejam ligadas. O `Main` não liga. Era para a tela do Forge no computador não pular as
   jogadas; na nossa mesa, quem dá o ritmo deveria ser a fila de animações.
2. **Monte Carlo na força máxima.** `HostedMatch` põe `game.AI_FLAT_MONTE_CARLO = MATCH_AI_FLAT_MONTE_CARLO`
   (padrão ligado) e `AI_FLAT_MONTE_CARLO_MAX = !GuiBase.isMobile()`; o `HeadlessGui` não é celular, então vale
   `FlatMonteCarloPicker.Config.maximized()`: até 1,5 s por decisão e 6 s por turno de cada bot (o perfil Default.ai sozinho
   seria 450 ms e 2 s; o modo de celular, `mobileLite()`, 600 ms e 2,5 s). Com heap de até 768 MB o Forge já cai para o modo
   de celular; em produção o `-Xmx4g` mantém o máximo.
3. **`VisibleEvents.prevented()` quadrático.** A cada evento do jogo (menos prioridade), chama
   `getPreventNextDamageTotalShields()` para cada jogador e cada permanente; no Forge isso é
   `ReplacementHandler.getTotalPreventionShieldAmount`, que percorre **todas as cartas da partida** (`forEachCardInGame`,
   ~400 no Commander com 4, contando grimórios) e os efeitos de substituição de cada uma. Custo: eventos × permanentes ×
   cartas. Daí o `CardType.isSaga` / `CardState.getReplacementEffects` no topo da pilha. Correção barata: juntar uma vez
   por evento os escudos de prevenção da partida (os `ReplacementEffect` com `PreventionEffect`) e só então ver de quem é
   cada um, ou só olhar quando existe algum escudo; o resultado para a mesa não muda.
4. **IA e regras com o campo cheio.** `AiController.chooseSpellAbilityToPlay` e `declareAttackers` crescem com o campo;
   no topo da pilha, `CardType.hasSubtype`, `CardProperty.cardHasProperty`, `Card.getStaticAbilities`. É do Forge; do
   nosso lado dá para limitar o tempo (Monte Carlo, `AI_TIMEOUT`) mas não para encurtar a conta.
5. **Mesa.** Redesenhar zonas inteiras a cada estado (item 114 do ROADMAP); com 100+ permanentes já passa de 50 ms por
   estado num computador rápido.

Achados menores: o Forge escreve no console, em INFO, cada lote de eventos (`ProtocolGuiGame: Sending batch...`,
`DeltaSyncManager`); vale conferir se em produção isso vai para o log e quanto custa. O estado para a mesa chega a 83 KB
com 160 permanentes, mandado a cada 50 ms enquanto há mudança.
