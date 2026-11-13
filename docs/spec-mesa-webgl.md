# Spec: Efeitos da mesa em WebGL

Data: 2026-11-13 · Item 125 do `ROADMAP.md`

Esta spec foi escrita para ser executada numa sessão nova, sem a conversa que a originou. Tudo o que foi decidido, medido e descoberto está aqui.

## Antes de começar (para quem vai executar)

1. Leia o `CLAUDE.md` inteiro. Valem as regras de sempre: novidade pendente em `novidades-pendentes/<pasta>/`, prints em 2x, nomes em inglês no código e comentários em português, comentário de uma frase no topo de cada arquivo, chaves do navegador só em `src/storage.ts`, e a skill `/entregar` ao fechar cada fase.
2. Leia nesta ordem: esta spec, o item 114 do `ROADMAP.md` (que se sobrepõe a esta, ver [Relação com o item 114](#relação-com-o-item-114)), `src/ui/motionKit.ts`, `src/ui/motionDamage.ts` e `src/ui/tablePresentation.ts`.
3. Rode `npm test` e `npm run test:browser` antes de mexer, e compare com a lista de falhas conhecidas do `TESTES.md`.
4. Esta mudança é só na mesa (`src/`, `tests/`, `scripts/`). O servidor (`forge-bridge/`) não muda e não precisa ser reiniciado.
5. Faça uma fase por vez e entregue cada uma (`/entregar`) antes de começar a seguinte. Cada fase deixa a mesa funcionando, e a opção "leves" é sempre o caminho de volta.
6. Ao concluir uma fase, marque as caixas dela aqui e no item 125 do `ROADMAP.md`.

## Objetivo

Dar à mesa efeitos de jogo (partículas, luz, ondas de choque, rastros, voos de carta com perspectiva) que hoje não cabem no DOM e no CSS, sem perder o que a mesa já tem: abrir no navegador e no celular sem instalar nada, imagens do Scryfall, acessibilidade, testes de navegador, prints das Novidades e o Laboratório.

**O que esta mudança não resolve.** A mesa pesada com o campo cheio vem principalmente de redesenhar a página a cada estado: `scripts/medir-desenho.mjs` mede cerca de 9 ms com o campo vazio e cerca de 55 ms com o campo cheio no Commander com 4, com milhares de elementos. Isso é assunto do item 114 ("Atualizar só o que mudou", "Cartas fora da tela sem montar elementos"), não desta spec. O WebGL aqui serve para os efeitos ficarem mais bonitos **e** mais baratos do que as versões em CSS, não para acelerar o redesenho.

## Critérios de sucesso

Os números de referência saem da fase 0. Os critérios abaixo são a proposta: depois da fase 0, ajuste os valores com base no que foi medido, registre-os aqui e não os afrouxe depois.

| # | Critério | Como conferir |
| --- | --- | --- |
| 1 | Com "leves", a mesa fica idêntica à de hoje (pixel a pixel, nos mesmos testes) | `npm run visual -- snap` antes e `compare` depois, com `?gpu=0`; `npm test` sem mudança nos testes de efeitos |
| 2 | Mesa parada não gasta GPU: nenhum quadro desenhado no canvas sem efeito vivo | Contador de quadros da camada GPU exposto para teste (`gpuLayer.stats()`) |
| 3 | Durante a cena de dano, a camada GPU não piora a fluidez em relação ao CSS: p95 da duração dos quadros longos (LoAF) igual ou menor que a base, com a CPU 1× e 4× mais lenta | `scripts/medir-efeitos.mjs`, base (fase 0) contra fase 2 |
| 4 | Nenhuma tarefa longa (> 50 ms) causada por carregar ou iniciar o PixiJS no meio de uma jogada | Mesma medição; o pacote é carregado com a mesa aberta e ociosa (`requestIdleCallback`), e um efeito pedido antes de ele estar pronto sai em CSS |
| 5 | Tela inicial sem crescer nada; pacote da GPU com até ~200 KB gzip (ajustar após medir) | Tamanho dos chunks no `npm run build` |
| 6 | Nenhum efeito segura a vez do jogador: a duração de cada passo continua a de `presentationDuration()` | Testes da fila de apresentação continuam passando; o efeito em GPU termina dentro do tempo do passo |
| 7 | Sem WebGL2, contexto perdido ou falha ao carregar o pacote, a mesa continua com os efeitos em CSS, sem erro na tela | Testes da decisão GPU/CSS; `webglcontextlost` forçado com `WEBGL_lose_context` no teste de navegador |
| 8 | Conferido num celular de entrada de verdade (Chrome com depuração remota) antes de publicar a fase 2 | Registrar aparelho e números nesta spec |

## Por que não trocar de linguagem

A pergunta de partida foi migrar o jogo para uma linguagem "mais apropriada" para desempenho e efeitos. A conclusão foi não migrar:

- **Servidor (Java, em cima do Forge):** não dá para trocar. O Forge é o motor de regras, com milhares de cartas implementadas; sair da JVM seria reescrever as regras do Magic. O tempo de turno também não é culpa da linguagem. Pela medição de 13/11/2026 (`AiSpeedProbe`, `docs/velocidade-bots-2026-11-13.md`, item 124), o turno de um bot leva cerca de 2,3 s: uns 0,9 s são a pausa do Forge entre fases e resoluções, e uns 1,2 s são o Monte Carlo da IA na força máxima. Sem essas duas configurações, o turno cai para cerca de 0,35 s. Isso é assunto do item 124.
- **Mesa (TypeScript, DOM e CSS):** o limite é de renderização, não de linguagem. Animar muitas cartas e efeitos como elementos da página esbarra num teto: muitos elementos se mexendo juntos, sombras e filtros pesados, partículas. A resposta é desenhar na GPU (WebGL), e isso se faz em TypeScript.

| Opção | Ganha | Perde |
| --- | --- | --- |
| **TS + WebGL (PixiJS)**, adotada | Efeitos de GPU sem reescrever a mesa | Duas formas de desenhar convivendo |
| Godot 4 | Editor de shaders e partículas, app nativo | Reescrever a mesa toda. A versão web é mais fraca (C# historicamente não exportava para web). Prints, testes de navegador e Laboratório se perdem. |
| Unity (C#) | Ecossistema de efeitos mais maduro | A versão web carrega devagar e vai mal no celular. Reescrita total. |
| Rust + WASM (Bevy, wgpu) | Desempenho máximo | Exagero para jogo de cartas, e a interface de menus fica muito mais trabalhosa |

## Decisões (13/11/2026)

- **Escopo:** camada de efeitos por cima, com as cartas no DOM. O campo inteiro em WebGL fica para a fase 4, se os números pedirem.
- **Biblioteca:** PixiJS v8, carregada só ao abrir a partida. Fixar a versão exata **8.22.0** (publicada em 01/10/2026; a 8.23.0 saiu em 11/11/2026 e ainda é nova demais). Iniciar com `preference: 'webgl'` (WebGL2), sem WebGPU por enquanto: menos variação entre aparelhos.
- **Primeiro efeito (fase 2):** dano e projétil.
- **Opção para o jogador:** "Efeitos: completos / leves" em Opções → Aparência, começando em completos. Sem WebGL2 ou com os quadros caindo muito, a mesa troca sozinha para leves. Ver também [Relação com o item 114](#relação-com-o-item-114).

## Relação com o item 114

O item 114 do `ROADMAP.md` ("Melhorar o desempenho em aparelhos fracos") se sobrepõe a esta spec em dois pontos:

- **Medir primeiro:** a fase 0 daqui cumpre a parte de efeitos do "Medir primeiro" de lá (CPU 4× e 6×, tarefas longas, celular de verdade). Marque lá também o que for feito.
- **Modo leve:** o 114 prevê uma opção "Modo leve" (sem desfoque, sem brilhos e sombras animadas, sem efeitos de dano, animações curtas). Não pode haver duas opções que brigam. **Decidido em 13/11/2026: uma opção só.** A recomendação era uma opção só, "Efeitos: completos / leves", em que "leves" já é o modo leve do 114 (efeitos de hoje em CSS nesta spec; os cortes de desfoque e brilho do 114 entram no mesmo "leves" quando aquele item for feito). As alternativas são manter duas opções separadas ou ter três níveis (completos / normais / leves).

## Como a mesa desenha hoje

- `forgeTable.ts` redesenha a mesa por região a cada estado (`renderTable`), com HTML em texto (`setHTML`). As cartas do campo, a mão, a pilha e os retratos são elementos da página (`permanentView.ts`, `seatView.ts`, `handView.ts`). A mesma mesa é usada na partida (`src/main.ts`) e em Rever partida (`src/rever.ts`).
- As animações ficam nas famílias `motion*.ts` e passam todas por `motionKit.ts`:
  - `effect(classe, ponto)` cria uma peça solta (36 usos): `damage-impact`, `damage-bolt`, `land-ripple`, `shatter-flash`, `shatter-shard`, anel do planeswalker… As peças são `position: fixed`, com coordenadas da janela (`center()` → `getBoundingClientRect()`), dentro da `.arena` (`root.firstElementChild`). O CSS delas fica em `src/ui/gameplay.css` (linhas ~310–360) e `src/ui/permanentEffects.css`.
  - `fly(...)` faz o voo com peso de uma carta entre zonas (10 usos), com a carta do DOM escondida durante o voo (`hiddenCards`).
  - `pulse`, `floatNumber`, `animate` (Web Animations API, com as molas `spring()` viradas em `linear()` no CSS); `later()` agenda com `setTimeout` e entra na limpeza.
  - `clear()` desfaz tudo: animações, timers, peças, cartas escondidas e classes de destaque.
- Camadas (z-index) dos efeitos hoje: `.draw-ghost` 31, `.land-ripple` 31, `.presentation-piece` 32, `.ability-callout` e `.combat-banner` 33, `.damage-impact` e `.damage-bolt` 35, `.damage-number` e `.entry-count` 36. As janelas da frente ficam acima (`.stack-gallery-overlay` 42 e as do `tableModal`). Antes de escolher o z-index do canvas, confira com `npm run css-why`.
- A fila de apresentação (`tablePresentation.ts`) mostra uma jogada por vez e para com a aba escondida. A duração de cada passo vem de `presentationDuration(evento, rápido)` (`presentationTimeline.ts`). O modo "Rápido" fica em `prefs.fast` (`tableSettings.ts`, chave `KEYS.pace`).
- Com "reduzir movimento" (`reduced()` em `motionKit.ts`), só ficam o número, a cor e o destaque.
- As setas de combate e de alvo são um SVG por cima da mesa (`tableArrows.ts`) e ficam como estão.
- Para testar efeitos: `tests/fixtures/effects-lab.html` (painel com um botão por movimento; `?mesa` abre só a mesa; `?mesa&jogar=a,b,c` faz uma jogada a cada 2,5 s; `?lento=10` deixa tudo dez vezes mais devagar) e `tests/fixtures/token-burst.html`.

### Testes que dependem das peças de efeito em DOM

- `tests/gameplay.test.mjs` (~linhas 524–571 e 668–669) procura `damage-impact`, `damage-number`, `shatter-shard` (conta 9) e `shatter-flash` entre os nós criados.
- `tests/planeswalker.test.mjs` (~linhas 91–114) confere a classe do `damage-number` da lealdade.

Esses testes rodam no Node (`tests/register.mjs`), sem WebGL. Com a decisão GPU/CSS caindo em CSS quando não há WebGL, eles continuam valendo para o caminho CSS sem mudança. O caminho GPU ganha testes próprios. Os números e textos (`damage-number`, avisos, balões) continuam no DOM mesmo com a GPU: texto é melhor no DOM, e esses testes não mudam.

## Abordagem: uma camada GPU por cima, adotada aos poucos

Um `<canvas>` WebGL transparente, `position: fixed; inset: 0`, sem receber cliques (`pointer-events: none`, `aria-hidden="true"`), dentro da `.arena`. Ele é dono só dos efeitos. As cartas, os menus, os textos e as janelas continuam no DOM, então clique, teclado, leitor de tela, temas e prints continuam funcionando como hoje.

```
┌───────────────────────────── .arena ─────────────────────────────┐
│  DOM: assentos, campo, mão, pilha, retratos (como hoje)          │
│  SVG: setas de combate e alvo (como hoje)                        │
│  canvas WebGL (z ~34, pointer-events: none): partículas, luz,    │
│    ondas, rastros; na fase 3, as cartas em voo                   │
│  DOM: números de dano, avisos, balões (z 33–36, texto no DOM)    │
│  DOM: janelas da frente (z 42+)                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Peças

- `src/ui/gpu/gpuLayer.ts`: cria e destrói o canvas e o `Application` do PixiJS; acompanha o tamanho da janela e o `devicePixelRatio` (com teto: 2 no computador e 1,5 no celular); pausa com a aba escondida; trata `webglcontextlost` (volta ao CSS e não tenta de novo nesta partida); expõe `stats()` (quadros desenhados, efeitos vivos) para os testes e a medição. É destruído junto com a mesa (sair da partida, Rever partida): o navegador limita quantos contextos WebGL abertos uma página pode ter.
- `src/ui/gpu/gpuEffects.ts`: os efeitos que a `motionKit` pode pedir (`burst`, `bolt`, `ripple`, `shatter`, `shockwave`; na fase 3, `flight`). Cada um recebe o ponto (o mesmo `Point` de hoje), o tom e a duração, e devolve se desenhou. Se não desenhou, quem pediu usa a peça de CSS de hoje.
- `src/ui/gpu/gpuSupport.ts`: a decisão GPU/CSS, sem importar o PixiJS (para rodar nos testes do Node): opção do jogador, `prefers-reduced-motion`, WebGL2 disponível, contexto perdido, pacote carregado.
- Porta `gpu` na `motionKit.ts`. Cada família `motion*.ts` pede o efeito por nome. O `clear()` também limpa a GPU, e o `reduced()` continua valendo antes de tudo.

### Regras

- **Carregamento:** `import('pixi.js')` dinâmico, pedido quando a mesa abre e fica ociosa (`requestIdleCallback`), nunca no meio de uma jogada. O Vite gera um chunk próprio; ele entra no `assets/` e é guardado pelo service worker com o resto do app. O Workbox ignora arquivos acima de 2 MiB (`maximumFileSizeToCacheInBytes`), então confira o tamanho do chunk no build.
- **Coordenadas:** as mesmas de hoje, em pixels CSS da janela, lidas na hora do efeito. O canvas cobre a janela inteira, então não há conversão.
- **Cores:** lidas das variáveis CSS do tema (`--gold`, `--red`…) com `getComputedStyle` na hora do efeito, para os temas da mesa (`src/temas.css`) continuarem valendo.
- **Ritmo:** o `ticker` do PixiJS só roda enquanto há efeito vivo (`autoStart: false`, liga no primeiro efeito, desliga no último). A duração vem de quem pede o efeito e respeita o modo Rápido.
- **Câmera lenta:** o `effects-lab` troca `setTimeout` e `Element.animate` para o `?lento`. A camada GPU precisa de uma escala de tempo (`gpuLayer.timeScale`), que o `effects-lab` ajusta junto; sem isso, os prints e a conferência em câmera lenta saem errados.
- **Memória:** cada efeito destrói o que criou ao terminar (`destroy({ children: true })`); texturas compartilhadas (faísca, brilho) são criadas uma vez por mesa. Teto de partículas por efeito e no total (por exemplo, 400), com menos no celular.
- **Cartas em voo (fase 3):** a textura vem da mesma imagem do Scryfall que a carta mostra. O Scryfall responde com `Access-Control-Allow-Origin: *` e o service worker já guarda as imagens de `cards.scryfall.io` em modo CORS (`vite.config.ts`), então `fetch(url, { mode: 'cors' })` + `createImageBitmap` serve como textura sem baixar de novo. A carta pode estar em três estilos (imagem completa, arte e texto, Arena; `face.ts`). Os dois últimos são montados em DOM e não viram textura direto: decidir na fase 3 entre voar com a imagem completa ou deixar esses estilos com o voo em DOM.

## Plano em fases

### Fase 0: medir antes (base de comparação)

Mudança só interna: não entra nas novidades.

- [ ] Opção `cheio` no `?jogar` do `tests/fixtures/effects-lab.ts`, que manda `{ cmd: 'full' }` (o "Campo cheio" do painel), e comentário do `?jogar` atualizado.
- [ ] `scripts/medir-efeitos.mjs`, no estilo dos `scripts/medir-*.mjs` (rodado com `node`, precisa do `npm run dev` ligado). Abre `effects-lab.html?mesa&jogar=…` para cada cena e grava os quadros enquanto as jogadas acontecem. Cenas sugeridas:
  - `dano`: `land,bolt,bolt,move:attack,x:fight,move:destroy`
  - `voos`: `land,x:opening,land,creature,countered,move:bounce,x:reanimate`
  - `campo-cheio`: `cheio,cheio,tokens:20,move:attack,move:destroy`
  - Opções: `--cpu 4` (freio de CPU), `--viewport 1366x768`, `--escala 1|2`, `--query gpu=0` (comparar versões), `--json saida.json`.
- [ ] Registrar os números de hoje nesta spec (seção [Medições](#medições)), com a CPU 1×, 4× e 6×.
- [ ] Marcar no item 114 o que esta medição cumpre.

O que já se sabe para escrever o script (descoberto em 13/11/2026):

- **O navegador sem tela limita a 60 quadros por segundo.** Medir só o intervalo entre `requestAnimationFrame` deu exatamente 16,7 ms em todos os quadros, sem nenhum perdido: essa métrica não serve. Use como métrica principal os **quadros longos** (`PerformanceObserver` com `type: 'long-animation-frame'`, que o Chrome 156 do `agent-browser` tem: `duration`, `blockingDuration`, `renderStart`, `styleAndLayoutStart`) e as tarefas longas (`longtask`). O intervalo entre quadros só vale com o freio de CPU, quando passa de 16,7 ms.
- **O `agent-browser` não tem comando de freio de CPU.** Dá para fazer pelo protocolo do Chrome: `agent-browser --session <s> get cdp-url` devolve o endereço; abra um `WebSocket` (global no Node 24), chame `Target.getTargets`, `Target.attachToTarget` com `flatten: true` em cada `page` e `Emulation.setCPUThrottlingRate` com o `sessionId`. Mantenha a conexão aberta durante a medição e reaplique depois de cada `open`.
- **O `?jogar` do effects-lab** faz uma jogada a cada 2,5 s, começando 600 ms depois de carregar, e sempre começa com `deal`; a primeira leva de eventos da página não é apresentada. Meça por `600 + (jogadas + 1) × 2500 + 2000` ms. Um `eval` de cerca de 18 s no `agent-browser` funcionou.
- **WebGL no navegador dos testes:** o `agent-browser` (Chrome 156 sem tela) tem WebGL2 por software (`ANGLE … SwiftShader`) e WebGPU. Os testes de navegador e o `npm run print` conseguem ver o canvas. Como a GPU ali é emulada na CPU, os números de GPU sem tela são pessimistas: servem para comparar antes e depois na mesma máquina, e o critério 8 (celular de verdade) continua necessário.

### Fase 1: a camada GPU, sem efeito novo

Entra nas novidades: a opção nova em Opções → Aparência (`### Novo`, com print da opção).

- [x] Confirmar com o usuário a decisão pendente do [item 114](#relação-com-o-item-114) (uma opção só ou duas): uma opção só, decidido em 13/11/2026.
- [ ] `pixi.js` `8.22.0` (exata, sem `^`) no `package.json`.
- [ ] `src/ui/gpu/gpuSupport.ts`, `gpuLayer.ts` e `gpuEffects.ts` (ainda vazio), como descrito em [Peças](#peças).
- [ ] Porta `gpu` na `motionKit.ts`; `clear()` limpando a GPU; canvas criado pela mesa (`tableShell.ts` ou `forgeTable.ts`) e destruído ao sair.
- [ ] Opção "Efeitos: completos / leves" em Opções → Aparência (`tableSettings.ts`, grupo do `#fLookSummary`), com a chave nova em `KEYS` (`src/storage.ts`) e o resumo do grupo mostrando a escolha.
- [ ] Troca automática para leves: sem WebGL2, contexto perdido, ou quadros longos seguidos nos primeiros efeitos (limite tirado da fase 0). Com aviso discreto na primeira vez ("Os efeitos ficaram leves neste aparelho. Dá para mudar em Opções.").
- [ ] `effects-lab.html?gpu=0|1` para forçar cada versão, e `?lento` ajustando também `gpuLayer.timeScale`.
- [ ] Testes (Node): a decisão GPU/CSS em cada caso (opção, reduzir movimento, sem WebGL2, contexto perdido, pacote não carregado), o `clear()` limpando a GPU, e a opção gravando a chave.
- [ ] Teste de navegador: a mesa abre com `?gpu=1`, o canvas existe, `stats()` mostra zero quadros com a mesa parada (critério 2), e perder o contexto (`WEBGL_lose_context`) volta ao CSS sem erro (critério 7).
- [ ] Critérios 1 e 5 conferidos.

### Fase 2: primeiros efeitos na GPU

Entra nas novidades (`### Mudou`), com prints de cada efeito tirados com `?lento` no `effects-lab`.

Começar pelos efeitos mais vistos e mais pobres no CSS:

- [ ] **Dano e projétil** (`motionDamage.ts`): explosão de partículas no impacto, com cor pelo tom do dano (`damageLook`: tom, `heavy`, `lethal`, `deathtouch`, escudo), rastro no projétil e um clarão curto no golpe letal. O número de dano continua no DOM.
- [ ] **Pouso no campo** (`land-ripple`): onda que se espalha a partir da carta.
- [ ] **Destruída / anulada** (`shatter-*`): estilhaços com física simples (gravidade, giro) no lugar dos 9 fragmentos de CSS.
- [ ] **Ultimate do planeswalker** (`motionAbility.ts`): onda de choque que atravessa a mesa.
- [ ] Medir de novo contra a fase 0 (critérios 3, 4 e 6) e conferir num celular de verdade (critério 8). Registrar em [Medições](#medições).

### Fase 3: cartas em voo na GPU

Entra nas novidades (`### Mudou`), com prints.

- [ ] Decidir com o usuário o que fazer com os estilos de carta "arte e texto" e "Arena" (voar com a imagem completa ou manter o voo em DOM).
- [ ] Textura da carta por `fetch(url, { mode: 'cors' })` + `createImageBitmap`, com o voo em DOM se a textura não estiver pronta a tempo. Carta virada para baixo: o verso na cor do jogador (`sleeves.ts`).
- [ ] `fly()` na GPU: carta com perspectiva real (`PerspectiveMesh`), sombra que acompanha a altura, brilho de borda pela cor da carta e rastro opcional. A carta do DOM fica escondida durante o voo, como hoje. O mesmo `spring()` vira função de tempo na GPU.
- [ ] Compra, conjurar até a pilha, resolver, saídas do campo, fichas.
- [ ] Medir de novo (critérios 3 a 6) e conferir no celular.

### Fase 4 (decidir com números): o campo inteiro em WebGL

Só se as medições mostrarem que o DOM é o gargalo no Commander com muitas permanentes **depois** dos itens de "mesa mais leve" do 114. Seria a maior mudança: clique e toque por cálculo de posição, Tab e leitor de tela com uma cópia invisível em DOM, temas e marcadores redesenhados na GPU. Vira uma spec própria, se chegar a esse ponto.

## Entrega de cada fase (checklist do `CLAUDE.md`)

- **Novidade pendente:** pasta `novidades-pendentes/efeitos-webgl-fase-<n>/`, em português, para o jogador (o que muda na mesa; sem "WebGL", "PixiJS", "canvas" ou "GPU" no texto do jogador). Exemplo para a fase 2: "**Dano com mais impacto.** Golpes e mágicas de dano explodem em faíscas na cor do dano, e o projétil deixa um rastro." A fase 0 não entra.
- **Prints:** `npm run print` com `--setup` disparando o efeito no `effects-lab` com `?lento`, recortado no efeito, em 2x, salvo na pasta da mudança e registrado no `imagens.json`.
- **Laboratório:** não há cenário pronto (não é correção de regra); dizer isso ao entregar.
- **Testes:** `npm test`, `npm run test:browser` e `npm run typecheck`; `npm run unused` para exports sem uso; falhas novas comparadas com o `TESTES.md`.
- **Mapa:** comentário de uma frase no topo de cada arquivo novo (o `tests/mapa.test.mjs` confere).
- **Roadmap:** marcar as caixas do item 125 e desta spec; o que cumprir do item 114, marcar lá também.
- **Versão:** não escolher número nem editar `CHANGELOG.md` ou `package.json` à mão; o número sai no `/cp`.

## Riscos

| Risco | Como tratar |
| --- | --- |
| Celular fraco esquenta ou perde quadros | DPR com teto, laço parado quando não há efeito, teto de partículas, opção "leves" e troca automática se os quadros longos se repetirem |
| Tamanho do pacote | Carregado só na partida e com a mesa ociosa; medir o chunk e fixar o teto do critério 5 |
| Primeiro efeito engasga carregando o PixiJS | Carregar com a mesa ociosa; efeito pedido antes de o pacote estar pronto sai em CSS |
| Imagens do Scryfall como textura | Já vêm com CORS e ficam no cache do service worker; voo em DOM como reserva |
| Estilos de carta montados em DOM (arte e texto, Arena) | Decisão na fase 3 |
| Duas formas de desenhar se desencontram (posição, tamanho) | Coordenadas sempre lidas do DOM na hora do efeito; conferência visual no `effects-lab` |
| Opção que briga com o "Modo leve" do item 114 | Decidido: uma opção só, "Efeitos: completos / leves" |
| Contextos WebGL acumulando (sair e voltar da partida, Rever partida) | Destruir o `Application` junto com a mesa; teste de navegador abrindo e fechando a mesa várias vezes |
| Testes de navegador sem GPU de verdade | WebGL2 por software já funciona no `agent-browser`; números sem tela só para comparar, e o celular de verdade para aceitar |

## Medições

Preencher na fase 0 e atualizar em cada fase.

| Data | Fase | Cena | CPU | Quadros longos (p95, ms) | Tarefas longas | Observação |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |
