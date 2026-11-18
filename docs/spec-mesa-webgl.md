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

Os valores abaixo foram fixados com a medição da fase 0 (13/11/2026, [Medições](#medições)); não os afrouxe depois.

| # | Critério | Como conferir |
| --- | --- | --- |
| 1 | Com "leves", a mesa fica idêntica à de hoje (pixel a pixel, nos mesmos testes) | `npm run visual -- snap` antes e `compare` depois, com `?gpu=0`; `npm test` sem mudança nos testes de efeitos |
| 2 | Mesa parada não gasta GPU: nenhum quadro desenhado no canvas dos efeitos sem efeito vivo (a mesa viva tem canvas e critério próprios, o 9) | Contador de quadros da camada GPU exposto para teste (`gpuLayer.stats()`) |
| 3 | Durante a cena de dano, a camada GPU não piora a fluidez em relação ao CSS: mediana (de 3 medições) do p95 dos quadros longos (LoAF) igual ou menor que a do CSS medido em seguida, com a CPU 1×, 4× e 6× mais lenta (CSS: 0, 74 e 181 ms) | `scripts/medir-efeitos.mjs`, base (fase 0) contra fase 2 |
| 4 | Nenhuma tarefa longa (> 50 ms) causada por carregar ou iniciar o PixiJS no meio de uma jogada | Mesma medição; o pacote é carregado com a mesa aberta e ociosa (`requestIdleCallback`), e um efeito pedido antes de ele estar pronto sai em CSS |
| 5 | Tela inicial sem crescer nada; pacote da GPU com até 150 KB gzip (medido: ~131 KB na fase 1 e 145 KB na fase 3, carregado só na partida) | Tamanho dos chunks no `npm run build` |
| 6 | Nenhum efeito segura a vez do jogador: a duração de cada passo continua a de `presentationDuration()` | Testes da fila de apresentação continuam passando; o efeito em GPU termina dentro do tempo do passo |
| 7 | Sem WebGL2, contexto perdido ou falha ao carregar o pacote, a mesa continua com os efeitos em CSS, sem erro na tela | Testes da decisão GPU/CSS; `webglcontextlost` forçado com `WEBGL_lose_context` no teste de navegador |
| 8 | Conferido num celular de entrada de verdade (Chrome com depuração remota) antes de publicar a fase 2 | Registrar aparelho e números nesta spec |
| 9 | Mesa viva: no máximo 30 quadros por segundo, parada com a aba escondida, com "leves" e com reduzir movimento; com ela ligada, a mesa parada não passa a ter quadros longos e a cena de dano não piora além da faixa das três medições | `gpu-layer.browser.mjs` (quadros por segundo, some com leves e ao sair); `scripts/medir-efeitos.mjs` com `gpu=1` e `gpu=1&viva=0`, cenas `dano` e `parada` (feito em 15/11/2026; falta o celular) |

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
- Para testar efeitos: a seção **Efeitos na GPU (item 125)** do painel do `effects-lab.html` dispara cada efeito da camada (impactos por tom, golpe pesado e letal, projétil, pouso, estilhaços, ultimate em cinco cores), troca entre GPU e CSS (recarrega a mesa com `?gpu=1` ou `?gpu=0`), põe só a camada em câmera lenta (1×, 4×, 10×) e congela o efeito no meio. E também `tests/fixtures/effects-lab.html` (painel com um botão por movimento; `?mesa` abre só a mesa; `?mesa&jogar=a,b,c` faz uma jogada a cada 2,5 s; `?lento=10` deixa tudo dez vezes mais devagar) e `tests/fixtures/token-burst.html`.

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
- `src/ui/gpu/gpuPort.ts` (feito na fase 1): a porta que a `motionKit` usa. Carrega a camada com a mesa ociosa, pede cada efeito (`play` devolve se desenhou) e cuida da troca automática para leves. Contexto perdido deixa os efeitos em CSS até recarregar a página, sem gravar "leves" (um contexto perdido pode ser só o celular trocando de app); a troca gravada fica para sem WebGL2 e quadros caindo, e só enquanto o jogador não escolheu nada.
- Porta `gpu` na `motionKit.ts`. Cada família `motion*.ts` pede o efeito por nome. O `clear()` também limpa a GPU, e o `reduced()` continua valendo antes de tudo.

### Regras

- **Carregamento:** `import('pixi.js')` dinâmico, pedido quando a mesa abre e fica ociosa (`requestIdleCallback`), nunca no meio de uma jogada. O Vite gera um chunk próprio; ele entra no `assets/` e é guardado pelo service worker com o resto do app. O Workbox ignora arquivos acima de 2 MiB (`maximumFileSizeToCacheInBytes`), então confira o tamanho do chunk no build.
- **Coordenadas:** as mesmas de hoje, em pixels CSS da janela, lidas na hora do efeito. O canvas cobre a janela inteira, então não há conversão.
- **Cores:** lidas das variáveis CSS do tema (`--gold`, `--red`…) com `getComputedStyle` na hora do efeito, para os temas da mesa (`src/temas.css`) continuarem valendo.
- **Ritmo:** o `ticker` do PixiJS só roda enquanto há efeito vivo (`autoStart: false`, liga no primeiro efeito, desliga no último). A duração vem de quem pede o efeito e respeita o modo Rápido.
- **Câmera lenta:** o `effects-lab` troca `setTimeout` e `Element.animate` para o `?lento`. A camada GPU precisa de uma escala de tempo (`gpuLayer.timeScale`), que o `effects-lab` ajusta junto; sem isso, os prints e a conferência em câmera lenta saem errados.
- **Memória:** cada efeito destrói o que criou ao terminar (`destroy({ children: true })`); texturas compartilhadas (faísca, brilho) são criadas uma vez por mesa. Teto de partículas por efeito e no total (por exemplo, 400), com menos no celular.
- **Cartas em voo (fase 3):** a textura vem da mesma imagem do Scryfall que a carta mostra. O Scryfall responde com `Access-Control-Allow-Origin: *` e o service worker já guarda as imagens de `cards.scryfall.io` em modo CORS (`vite.config.ts`), então `fetch(url, { mode: 'cors' })` + `createImageBitmap` serve como textura sem baixar de novo. A carta pode estar em três estilos (imagem completa, arte e texto, Arena; `face.ts`). Os dois últimos são montados em DOM e não viram textura direto: decidir na fase 3 entre voar com a imagem completa ou deixar esses estilos com o voo em DOM.

### Onde fica cada efeito: GPU ou CSS

Regra para efeito novo ou para rever um que já existe, tirada das decisões das fases 2 a 3b e da mesa viva (registrada em 17/11/2026). Faça as perguntas na ordem: a primeira que responder decide.

1. **Fica rodando com a mesa parada? → CSS.** Halo de alvo, voadora flutuando, vínculo com a vida, ward, enjoo, relógio de espera e seta de alvo parada são estados, não momentos. Na camada dos efeitos, o laço desenharia sem parar e quebraria o critério 2. Em CSS, animando só `transform` e `opacity` (nada de `box-shadow`, `filter` ou das propriedades soltas `scale`/`translate`/`rotate`, ver fase 3b), para a placa de vídeo animar sozinha. A exceção é a mesa viva, com canvas e critério próprios (o 9).
2. **É texto, ou algo que o jogador clica, foca ou lê? → DOM.** Número de dano, legendas, balões, avisos e contadores: texto nítido, leitor de tela e os testes de sempre. Quando a GPU desenha o efeito, o texto vai numa peça em DOM por cima (`.gpu-flying`, `.chance-piece.gpu-drawn`).
3. **Precisa acompanhar um elemento que o layout move? → CSS, dentro do elemento.** A camada lê a posição uma vez, na hora do efeito. O que rola com a fileira, muda de lugar num redesenho ou segue o hover fica preso ao `.slot` em CSS (como os riscos de vento da voadora, que ficam dentro do lugar da carta para não abrir barra de rolagem na fileira).
4. **Depende de uma imagem que pode não estar pronta? → GPU, com reserva em CSS.** O voo da carta só sai na GPU se a textura chegou a tempo; se o `play()` da porta devolve `false`, quem pediu usa o CSS.
5. **É um momento com partículas, luz, física, perspectiva ou muitas peças? → GPU.** Explosão de dano, estilhaços, poeira, brasas, rastro, onda de choque, carta em perspectiva, dado em 3D. Em CSS isso vira dezenas de elementos e `filter`/`box-shadow`/`blur` animados; na GPU fica mais bonito e mais barato.
6. **A versão em CSS é um elemento só, com `transform` e `opacity`? → pode ficar em CSS.** Pulso, deslize curto e realce simples já são baratos. Só vale levar à GPU se o visual mudar de nível.

Todo efeito na GPU, seja qual for, precisa de:

- **Reserva em CSS**, para "leves", sem WebGL2 e contexto perdido. Pode ser mínima; com "reduzir movimento", só ficam o número, a cor e o destaque.
- **Caber no passo da apresentação** (critério 6): a duração vem de `presentationDuration()` e respeita o modo Rápido.
- **Medição** com `scripts/medir-efeitos.mjs` antes de publicar: não piorar o p95 dos quadros longos com a CPU 1×, 4× e 6× (critério 3). Se piorar, ou fica em CSS ou fica mais leve na GPU.
- **Botão no laboratório de efeitos** (seção Efeitos na GPU), para disparar, ver em câmera lenta e tirar os prints.

Em uma frase: momento visual rico na GPU, estado contínuo em CSS, texto e interação no DOM; na dúvida, meça.

## Plano em fases

### Fase 0: medir antes (base de comparação)

Mudança só interna: não entra nas novidades.

- [x] Opção `cheio` no `?jogar` do `tests/fixtures/effects-lab.ts`, que manda `{ cmd: 'full' }` (o "Campo cheio" do painel), e comentário do `?jogar` atualizado.
- [x] `scripts/medir-efeitos.mjs`, no estilo dos `scripts/medir-*.mjs` (rodado com `node`, precisa do `npm run dev` ligado). Abre `effects-lab.html?mesa&jogar=…` para cada cena e grava os quadros enquanto as jogadas acontecem. Cenas sugeridas:
  - `dano`: `land,bolt,bolt,move:attack,x:fight,move:destroy`
  - `voos`: `land,x:opening,land,creature,countered,move:bounce,x:reanimate`
  - `campo-cheio`: `cheio,cheio,tokens:20,move:attack,move:destroy`
  - Opções: `--cpu 4` (freio de CPU), `--viewport 1366x768`, `--escala 1|2`, `--query gpu=0` (comparar versões), `--json saida.json`.
- [x] Registrar os números de hoje nesta spec (seção [Medições](#medições)), com a CPU 1×, 4× e 6×.
- [x] Marcar no item 114 o que esta medição cumpre (anotado no item "Medir no Chrome…" de lá: a parte dos efeitos está feita; faltam o tempo de cada `state`, a memória e o celular).

**Fase 0 concluída (13/11/2026).** O script mede só a partir da primeira jogada de verdade (3,1 s depois de carregar), com um laço de CPU cronometrado antes e depois da cena conferindo o freio (deu 4,2× e 6,5× com `--cpu 4` e `--cpu 6`, do começo ao fim), e `--vezes 3` mostra a mediana e a faixa. O que a conferência mostrou:

- O quadro de 300–490 ms sem bloqueio e sem script que aparecia na CPU 1× sai só na primeira medição de cada navegador (imagens das cartas chegando e a GPU emulada segurando o desenho); nas outras duas, zero. Por isso vale a **mediana** das 3 vezes, não a pior.
- Com poucos quadros longos por cena, o p95 é quase o pior caso: a tabela registra também a contagem, o bloqueio e as tarefas longas.
- Para medir sem as próprias edições recarregarem a página (o Vite recarrega a mesa a cada arquivo salvo), meça numa cópia à parte: `git worktree add` do commit, `node_modules` ligado por junção e o Vite em outra porta, com `TABLE_TEST_URL` apontando para ela.

O que já se sabe para escrever o script (descoberto em 13/11/2026):

- **O navegador sem tela limita a 60 quadros por segundo.** Medir só o intervalo entre `requestAnimationFrame` deu exatamente 16,7 ms em todos os quadros, sem nenhum perdido: essa métrica não serve. Use como métrica principal os **quadros longos** (`PerformanceObserver` com `type: 'long-animation-frame'`, que o Chrome 156 do `agent-browser` tem: `duration`, `blockingDuration`, `renderStart`, `styleAndLayoutStart`) e as tarefas longas (`longtask`). O intervalo entre quadros só vale com o freio de CPU, quando passa de 16,7 ms.
- **O `agent-browser` não tem comando de freio de CPU.** Dá para fazer pelo protocolo do Chrome: `agent-browser --session <s> get cdp-url` devolve o endereço; abra um `WebSocket` (global no Node 24), chame `Target.getTargets`, `Target.attachToTarget` com `flatten: true` em cada `page` e `Emulation.setCPUThrottlingRate` com o `sessionId`. Mantenha a conexão aberta durante a medição e reaplique depois de cada `open`.
- **O `?jogar` do effects-lab** faz uma jogada a cada 2,5 s, começando 600 ms depois de carregar, e sempre começa com `deal`; a primeira leva de eventos da página não é apresentada. Meça por `600 + (jogadas + 1) × 2500 + 2000` ms. Um `eval` de cerca de 18 s no `agent-browser` funcionou.
- **WebGL no navegador dos testes:** o `agent-browser` (Chrome 156 sem tela) tem WebGL2 por software (`ANGLE … SwiftShader`) e WebGPU. Os testes de navegador e o `npm run print` conseguem ver o canvas. Como a GPU ali é emulada na CPU, os números de GPU sem tela são pessimistas: servem para comparar antes e depois na mesma máquina, e o critério 8 (celular de verdade) continua necessário.

### Fase 1: a camada GPU, sem efeito novo

Entra nas novidades: a opção nova em Opções → Aparência (`### Novo`, com print da opção).

- [x] Confirmar com o usuário a decisão pendente do [item 114](#relação-com-o-item-114) (uma opção só ou duas): uma opção só, decidido em 13/11/2026.
- [x] `pixi.js` `8.22.0` (exata, sem `^`) no `package.json`.
- [x] `src/ui/gpu/gpuSupport.ts`, `gpuLayer.ts` e `gpuEffects.ts`, como descrito em [Peças](#peças), mais `gpuPort.ts` (a porta da `motionKit`: carrega com a mesa ociosa, pede o efeito e devolve se desenhou).
- [x] Porta `gpu` na `motionKit.ts`; `clear()` limpando a GPU; canvas criado na `.arena` quando a partida abre (`motion.reset()`) e destruído quando a tela da mesa é escondida (sair, voltar ao Laboratório) ou a opção vai para leves.
- [x] Opção "Efeitos: completos / leves" em Opções → Aparência (`tableSettings.ts`, grupo do `#fLookSummary`), com a chave nova em `KEYS` (`src/storage.ts`) e o resumo do grupo mostrando a escolha.
- [x] Troca automática para leves: sem WebGL2, contexto perdido, ou quadros longos seguidos nos primeiros efeitos (limite tirado da fase 0). Com aviso discreto na primeira vez ("Os efeitos ficaram leves neste aparelho. Dá para mudar em Opções.").
- [x] `effects-lab.html?gpu=0|1` para forçar cada versão, e `?lento` ajustando também `gpuLayer.timeScale`.
- [x] Testes (Node, `tests/gpu-effects.test.mjs`): a decisão GPU/CSS em cada caso (opção, reduzir movimento, sem WebGL2, contexto perdido, pacote não carregado), o `clear()` limpando a GPU, e a opção gravando a chave.
- [x] Teste de navegador (`tests/gpu-layer.browser.mjs`): a mesa abre com `?gpu=1`, o canvas existe, `stats()` mostra zero quadros com a mesa parada (critério 2), e perder o contexto (`WEBGL_lose_context`) volta ao CSS sem erro (critério 7).
- [x] Critérios 1 e 5 conferidos: as telas do `npm run visual` iguais antes e depois (com a camada carregada e parada), e o pacote da GPU com ~131 KB gzip, baixado só na partida (a tela inicial não o pede).

### Fase 2: primeiros efeitos na GPU

Entra nas novidades (`### Mudou`), com prints de cada efeito tirados com `?lento` no `effects-lab`.

Começar pelos efeitos mais vistos e mais pobres no CSS:

- [x] **Dano e projétil** (`motionDamage.ts`): explosão de partículas no impacto, com cor pelo tom do dano (`damageLook`: tom, `heavy`, `lethal`, `deathtouch`, escudo), rastro no projétil e um clarão curto no golpe letal. O número de dano continua no DOM.
- [x] **Pouso no campo** (`land-ripple`): onda que se espalha a partir da carta.
- [x] **Destruída / anulada** (`shatter-*`): estilhaços com física simples (gravidade, giro) no lugar dos 9 fragmentos de CSS.
- [x] **Ultimate do planeswalker** (`motionAbility.ts`): onda de choque que atravessa a mesa.
- [x] Medir de novo contra a fase 0 (critérios 3, 4 e 6). Registrado em [Medições](#medições). A primeira rodada mostrou uma tarefa longa de 60–90 ms no primeiro efeito da partida com a CPU 1× (os shaders montados no primeiro desenho); a camada passou a desenhar uma vez cada tipo de peça ao carregar, com a mesa ociosa (`warmUp` em `gpuEffects.ts`), e a tarefa sumiu.
- [ ] Conferir num celular de entrada de verdade (critério 8) antes de publicar a fase 2: Chrome com depuração remota, `effects-lab.html?mesa&jogar=…` com `gpu=0` e com `gpu=1`, e registrar aqui o aparelho e os números.

### Fase 2b: efeitos de movimento na GPU (feita em 13/11/2026)

Pedido depois da fase 2: os movimentos da seção Movimento (item 16) do laboratório ganham efeitos na camada, com a carta continuando no DOM (o voo da carta em si é a fase 3). Ficam em `src/ui/gpu/gpuMoves.ts`; as peças comuns (partículas, duração, borrifo, cores do tema) foram para `gpuParticles.ts`, e o arco do voo foi para `src/ui/flightPath.ts`, usado pelo voo em CSS e pelo rastro na GPU, para os dois andarem juntos.

- [x] Exilar: grãos de luz subindo e anel claro (`dissolve`, no lugar do `exile-ring`); volta do blink: os grãos voltam e a carta acende (`gather`).
- [x] Sacrificar: brasas e fumaça escura no lugar (`ash`); rastro do voo até o monte (`trail`: brasas na sacrificada, poeira na destruída, brilho na devolvida à mão).
- [x] Atacar: riscos de velocidade e poeira atrás do atacante no bote (`charge`); bloqueio: a ligação vira um feixe (`beam`).
- [x] Habilidade e gatilho: grãos subindo em volta da carta (`motes`, dourado ou violeta) e feixe até cada alvo (`beam`, no lugar do `ability-beam`).
- [x] Ninjutsu e sneak: nuvem de fumaça com volume ao sumir e ao surgir (`puff`, somada à fumaça de CSS que espera o ninja).
- [x] Virar sem pagar mana: um pouco de poeira na base da carta (`dust`), discreto de propósito.
- [x] Botões na seção Efeitos na GPU do laboratório, testes e prints (`novidades-pendentes/efeitos-webgl-movimentos`). Sem medição de desempenho nesta etapa (pedido do usuário).

### Fase 3: cartas em voo na GPU

Entra nas novidades (`### Mudou`), com prints.

- [x] Decidir com o usuário o que fazer com os estilos de carta "arte e texto" e "Arena": decidido em 13/11/2026, voam com a imagem completa (a face leva `data-full` em todo estilo). Rastro só nos voos especiais: os da fase 2b e a carta que sai do cemitério (roxo) ou do exílio (branco).
- [x] Textura da carta por `fetch(url, { mode: 'cors' })` + `createImageBitmap`, com os cantos arredondados recortados num canvas, e o voo em DOM se a textura não estiver pronta a tempo (`src/ui/gpu/gpuFlight.ts`). Pré-carga com a mesa ociosa das cartas da mão, da pilha, do campo, do topo dos montes e da zona de comando (a cada desenho e a cada 1,5 s); guarda até 24 normais e 96 pequenas, e o campo usa a pequena se a normal não chegou. Carta virada para baixo e versos (compra, moer, embaralhar, mão inicial) continuam em DOM: o verso é desenhado em CSS e não vira textura direto.
- [x] `fly()` na GPU: carta com perspectiva real (`PerspectiveMesh`, os mesmos números do voo em CSS: arco de `flightPath.ts`, crescer, inclinar e girar), sombra na mesa que desce e se espalha com a altura e brilho de borda pela cor da carta (ou do monte), as duas também em perspectiva. A peça em CSS faz o mesmo caminho, invisível, levando a legenda por cima do canvas (`.gpu-flying`).
- [x] Conjurar até a pilha, resolver, anular, descartar, saídas do campo, troca de controle e a cascata de fichas e de várias permanentes; a compra fica em DOM (versos).
- [x] Medir de novo (critérios 3 a 6). Feito em 14/11/2026, números em [Medições](#medições): os voos ficaram mais leves na GPU, o campo cheio empatou, o pacote cresceu para 145 KB gzip (dentro dos 150) e os testes da fila de apresentação passam; o critério 3 **não** foi cumprido na cena `dano` com a CPU 4× e 6×, e as medições apontam o voo da carta como o que pesa a mais.
- [x] Decidir o que fazer com o dano mais pesado na GPU com a CPU freada (ver [Medições](#medições), fase 3): decidido em 14/11/2026, o celular de verdade decide. Só se ele também mostrar o peso, o voo da carta na GPU fica mais leve (começar por um trace do Chrome na cena `dano`: malha em perspectiva, textura e a peça invisível em CSS).
- [ ] Conferir no celular de entrada de verdade (critério 8), junto com o da fase 2, incluindo a cena `dano`. Em 14/11/2026 não havia aparelho disponível: fica pendente até haver um Android de entrada para ligar por USB (adb, depuração USB e o Chrome com depuração remota).

### Fase 3b: o que sobrou em CSS (feita em 14/11/2026)

Pedido depois da fase 3: levantar o que ainda animava em CSS e levar à camada o que é efeito de momento, sem tentar copiar o desenho de CSS ("pode ser algo mais moderno"). As animações de estado (que ficam rodando com a mesa parada) **não** vão para a GPU: lá o laço desenharia sem parar e quebraria o critério 2. Elas foram refeitas para a placa de vídeo animar sozinha.

- [x] Animações de estado (`novidades-pendentes/animacoes-leves`): a carta e o retrato que podem ser alvo ganham um halo em `::after` (opacidade e `transform`), no lugar do `@keyframes pulse` repetido no `style.css` (o segundo, o da bolinha de "conectando", vencia: a carta-alvo encolhia a 70% e sumia a 25%). Carta apontada, veneno perto do fim, relógio de espera, passar até o fim do turno e previsão letal do combate: o brilho numa camada à parte, sem animar `box-shadow`. Proteção (ward): as runas acendem numa moldura de cima (só opacidade), sem `border-color` e `hue-rotate`. Enjoo: o ícone inteiro gira (e não o grupo de dentro do SVG, que refazia o layout a cada quadro) e a aberração de cor pula em degraus (`steps`), como falha de sinal. E as animações que ficam rodando usam `transform`, e não as propriedades soltas `scale`, `translate` e `rotate`: com elas, o Chrome refazia as camadas da mesa a cada quadro (medido: 330 ms contra 10 ms a cada 3 s).
- [x] Compra, mão inicial, mulligan e busca na GPU (`novidades-pendentes/efeitos-webgl-compra`): o verso é pintado num canvas na cor da capa (`--sleeve-*`, `backTexture` em `gpuFlight.ts`) e a sua carta vira no ar (`flipTo`, de 40% a 85% do voo) se a textura da face já carregou; sem ela, chega de costas e vira na mão, como antes. Moer e embaralhar continuam em CSS (a virada do moer tem caminho próprio, e a face da carta moída quase nunca está carregada a tempo).
- [x] Mana: orbe de luz com rastro do terreno até o custo (`mana` em `gpuPlays.ts`).
- [x] Moeda, dado e fim da partida (`gpuStage.ts`, `novidades-pendentes/efeitos-webgl-momentos`): moeda com espessura, sombra e quique, Cara e Coroa pintadas com a letra da mesa; dado rolando em perspectiva, trocando de número a cada meia volta; vitória com raios, onda e confete; derrota com racha, fumaça e cinzas. A peça em CSS fica só com a legenda (`.chance-piece.gpu-drawn`).
- [x] Toques (`gpuAccents.ts`, `novidades-pendentes/efeitos-webgl-toques`): `flare` (contorno de luz em volta da carta, no lugar de animar o `filter` dela: reanimada, planeswalker, ficha, aura, troca de controle), `warp` (dobra), `heal` (ganho de vida) e `counter` (marcadores). Os anéis de reanimar, planeswalker, aura, controle e busca usam o `arrive`. A função `flare` da `motionKit` faz a GPU primeiro e o `filter` antigo como reserva.
- [x] Botões novos na seção Efeitos na GPU do laboratório e testes no `gpu-layer.browser.mjs` (compra de costas, mana e moeda na GPU).
- [x] Voar e vínculo com a vida (escolhidos numa página de comparação, 14/11/2026): a voadora flutua (o `.slot` inteiro sobe e desce, a sombra em `::before` faz o movimento contrário e fica na mesa) com três riscos de vento por baixo (`.fly-wind`, no `.slot`, para não girarem com a carta virada); o vínculo troca o halo por um fio verde e quatro grãos subindo pelas bordas (`<i>` dentro do `.fx-glow.lifelink`). As animações contínuas seguem um relógio só (`syncLoops` em `motion.ts`, `startTime = 0` antes de medir): sem isso, a voadora recomeçaria a flutuar a cada desenho, dando um pulo, e o passo de cada carta acharia que ela mudou de lugar.
- [x] Mana até a reserva (14/11/2026): virando um terreno sem pagar nada, com a reserva daquele jogador crescendo entre um desenho e outro (`poolTotals`/`poolsThatGrew` em `tableCards.ts`, opção `pooled` do `motion.play`), o mesmo orbe da mana voa até o retrato dele, e a reserva pulsa na chegada. Botão "Gerar mana (reserva)" no laboratório.
- [x] Ficaram em CSS: moer, embaralhar, vidência, o shuriken do ninja, o sorteio de quem começa (`startingRoll`) e o fluxo das setas de alvo (SVG). Levados à camada em 14/11/2026 (item 131): embaralhar e vidência em `gpuPiles.ts` (verso pintado com `backTexture`), moer com o voo de costas que vira no ar (`flight` com `flipTo`, quando a face carregou) e rastro roxo, o shuriken e o nascimento das setas em `gpuMoments.ts`, e o dado do sorteio com o `die` de `gpuStage.ts` rolando no lugar (`travel: 0`). A seta parada continua em SVG (decidido nesse dia), para a camada não desenhar sem parar.

### Mesa viva (feita em 14/11/2026)

Pedido em 14/11/2026: mais ambientação e imersão. Decidido nesse dia: animação contínua (e não só nos momentos), junto com a opção "Efeitos" (sem chave própria), e o critério 2 passa a valer só para a camada dos efeitos; a mesa viva ganhou o critério 9.

- [x] `src/ui/gpu/tableAmbience.ts`: WebGL2 puro (sem PixiJS), um triângulo que cobre a tela e um shader só, num canvas dentro do `.mat` (por baixo dos campos), em meia resolução (um terço no celular), a 30 quadros por segundo, parado com a aba escondida. Contexto próprio: se cair, só ela some. Carrega junto com a camada dos efeitos (`gpuPort.ts`) e some com ela.
- [x] O que mostra (`src/ui/ambienceScene.ts`, a cada desenho, no quadro da jogada mostrada): a luz no campo de quem joga o turno, na cor clara da capa dele (`--sleeve-light`, sem capa o `--gold` do tema), deslizando em cerca de um segundo; névoa e pouca poeira subindo (deixada mais sutil a pedido, no mesmo dia); no combate, a luz fecha e esquenta; com a sua vida em um quarto da inicial ou menos, as bordas escurecem e pulsam em vermelho.
- [x] Botões Passar o turno, Vida baixa e Vida cheia no laboratório de efeitos; `gpu.ambienceStats()` e checagens no `gpu-layer.browser.mjs`.
- [x] Toques do jogo (14/11/2026, item 131): `pulse` com clarão na cor da mágica que resolve (reduzido no mesmo dia a 6% só no meio da mesa, subindo suave: a 30% na mesa inteira, parecia um relâmpago branco quando a mágica chegava ao campo), tremor no golpe pesado e escurecer nos momentos grandes (`motionImpact.ts`), e a poeira com relógio próprio (`drift`), que acelera no combate sem saltar. A cor da luz vem da arte do tapete de quem joga (`vividAverage` em `ambienceScene.ts`, a média pesada pela saturação), e a da capa fica de reserva.
- [x] Momentos grandes na camada dos efeitos (`gpuMoments.ts`): `spotlight` (a mesa escurece em volta do foco, um sprite com o furo e um retângulo com `cut()` cobrindo o resto) e `legend` (raios, anel e brasas); a câmera aproxima 1,2% com a animação de `scale` na `.arena`, com a origem no foco. Reduzidos no mesmo dia (escurecer 0,22 em vez de 0,5, câmera 1,2% em vez de 3%), e a lendária ficou só com o `legend` fraco, sem escurecer nem câmera.
- [x] Medir o custo (critério 9) com `scripts/medir-efeitos.mjs`. Feito em 15/11/2026 (números em [Medições](#medições)): a cena de dano passa; com a mesa parada e a CPU freada ela traz quadros longos, em parte por causa do WebGL emulado na CPU.
- [ ] Medir no celular de entrada, junto com o critério 8.

### Dado em 3D (feito em 16/11/2026)

Pedido em 16/11/2026, como teste de 3D de verdade na camada: o WebGL é 3D, mas o PixiJS é um motor 2D, e até aqui o "3D" da mesa era perspectiva calculada à mão num `PerspectiveMesh` (voo da carta, moeda, dado chapado). Decidido nesse dia: 3D dentro do próprio PixiJS (sem Three.js, que somaria por volta de 150 KB gzip e um segundo contexto WebGL), começando pelo dado e usando o mesmo dado no sorteio de quem começa.

- [x] `src/ui/gpu/diceGeometry.ts` (sem PixiJS, testado em `tests/dice-geometry.test.mjs`): d4, d6, d8, d10 (trapezoedro), d12 e d20 a partir dos vértices, com as faces achadas como casca convexa; números de 1 a N com as faces opostas somando N + 1; a rotação final que deixa o resultado de frente e em pé, com inclinação opcional.
- [x] `src/ui/gpu/gpuDie.ts`: `Mesh` com `Geometry` própria (posição em 3D, normal da face, lugar na textura) e um `Shader` com `GlProgram` próprio. O vértice gira, projeta com perspectiva e devolve `w = 1/f` (textura em perspectiva correta); as faces de trás são descartadas pelo lado em que a câmera está, sem profundidade nem sentido dos triângulos (o dado é convexo, as faces da frente nunca se cobrem). Luz difusa, brilho de verniz e clarão no pouso no fragmento. Os números são pintados uma vez numa textura por dado (`paintOnce`).
- [x] Onde aparece: o dado de carta (evento `die`) do d4 ao d20, inclinado para mostrar o volume; d2 e d100 continuam chapados. No sorteio de quem começa, o d6 rola no lugar e assenta bem de frente, do tamanho do dado em CSS que fica por baixo. Corrigido junto: o dado da GPU do sorteio assentava deslocado do de CSS na primeira rodada, porque era medido com a caixa ainda crescendo na entrada.
- [x] Medido com `scripts/medir-efeitos.mjs --cenas dados` (cinco d20 seguidos), contra o dado chapado: ver [Medições](#medições).

### Objetos 3D (item 140 do ROADMAP, a partir de 16/11/2026)

Depois do dado, os outros objetos em 3D seguem a mesma regra, para não pesar com o FPS baixo: um objeto só (ou poucos), por pouco tempo, num momento em que a mesa já está parada ou esperando, nunca um efeito contínuo nem um por permanente; do degrau 2 do automático em diante, a versão chapada.

- [x] `src/ui/gpu/gpuSolid.ts`: o shader do dado virou o dos sólidos (malha convexa qualquer, cache de malha por camada, `solidPiece` com `pose(rotação, x, y, unidade, clarão)`), com brilho de metal opcional (`uMetal`: o brilho na cor da peça). O `warmUp` de `gpuEffects.ts` desenha uma peça (`warmSolid`): o shader compila com a mesa ociosa, e o primeiro dado da partida não paga mais isso. As formas que não são dados ficam em `solidShapes.ts` (sem PixiJS, testado em `tests/solid-shapes.test.mjs`): prisma de contorno convexo (frente, verso e laterais, com o verso em pé depois de meia volta em x).
- [x] Moeda (`gpuCoin.ts`): disco de 48 lados com 14% do raio de espessura, cara dourada (rosto de perfil) e coroa prateada (a coroa), com o nome pequeno embaixo do ícone (`COIN_HEADS_PATH` e `COIN_TAILS_PATH` em `icons.ts`, os mesmos da moeda de CSS), e serrilha passando de uma cor para a outra; gira em volta de x e assenta deitada (inclinação -0,42). O d2 é a mesma moeda em marfim, com 1 e 2. O d100 são dois d10 (`percentileDice` em `gpuDie.ts`): o azul das dezenas (00 a 90) e o de marfim das unidades (0 a 9), com 00 e 0 valendo 100 (`percentileFaces`). Do degrau 2 em diante, moeda e dados voltam a ser chapados (`solidAllowed` em `gpuSolid.ts`).
- [x] Dia e noite (`gpuMedals.ts`, `motionMedals.ts`): na troca de `dayTime` (`tablePhases.ts`, que já fazia o ícone pulsar), o disco de sol e lua aparece no meio da mesa com o lado de antes, dá uma volta e meia em x, acende (raios e faíscas na cor do lado) e voa encolhendo até o ícone da trilha, em 2 s. Do degrau 2 em diante, só o ícone pulsa. Os medalhões usam a mesma textura de três partes da moeda (`medalAtlas`) e o mesmo `flipAndFly`.
- [x] Monarca e Dianteira (`holderPass` em `gpuMedals.ts`, `holderChanges.ts` testado em `tests/holder-changes.test.mjs`): a cada desenho dos assentos, quem passou a ter a coroa ou a Dianteira; o medalhão (disco com a coroa, ou um prisma com o contorno de escudo) sai do retrato de quem tinha, vira e pousa no selo de quem passou a ter. Abrir uma partida em andamento não faz nada voar; sem ninguém antes, aparece em cima do selo.
- [x] Emblema (`emblem` em `gpuMedals.ts`): o emblema novo (`holderChanges` também conta os emblemas) sai do planeswalker de mesmo nome no campo (sem ele, do meio da mesa) e pousa no `.emblem` ao lado do retrato. A textura é só desse emblema: o aro e o verso saem na hora, e a arte (a mesma imagem pequena do `.emblem-art`, cortada igual: 260% de largura, no alto) é pintada por cima quando chega (`texture.source.update()`), sem esperar. Nos três efeitos que voam até um selo, o selo de destino fica invisível até o pouso (animação de opacidade em `motionMedals.ts`), e o medalhão volta para a frente a cada faísca do rastro (as faíscas entram por cima de tudo).
- [x] Brasão de vitória (`crest` em `gpuMedals.ts`): um prisma com contorno de escudo largo cai girando para a frente (verso vermelho com a estrela, frente dourada com louros, estrela e "Vitória") sobre o retrato de quem venceu, quica e brilha, junto do `victory`. Fica inteiro na tela mesmo com o retrato na borda. Com ele, `finale` devolve 2,1 s em vez de 1,3 s, e a tela do resultado espera o brasão.
- [x] Fichas (`gpuTrinkets.ts`, `tokenTrinkets.ts`): a ficha de artefato Treasure, Clue, Food ou Blood que pousa (nos dois caminhos de `motionFlights.ts`, a carta sozinha e a cascata) ganha o objeto: gema lapidada (casca convexa de 17 pontos), lente (prisma de 32 lados com a lupa), maçã e gota (sólidos de revolução montados anel a anel, sem casca: a casca convexa da maçã levava 118 ms). Caem girando em volta de y, quicam e entram na carta, em 1,15 s. No máximo 3 por jogada (`TRINKET_LIMIT`), e saem já no degrau 1, porque no Commander acontecem em rajada.
- [x] Marcadores de jogador (`gpuTallies.ts`, `playerTallies.ts` testado em `tests/player-tallies.test.mjs`, 16/11/2026): no desenho dos assentos (`motionMedals.ts`, junto com a coroa), o veneno, a energia, a experiência ou a radiação que subiu ganha o objeto caindo sobre o selo: frasco (sólido de revolução com rolha, gargalo e bojo), raio e estrela (chapas com o meio alto, `slab` em `solidShapes.ts`) e disco com o trifólio. O frasco e as chapas não são convexos: a ordem das faces é a ordem de desenhar (o frasco de baixo para cima, sempre visto de cima; as chapas com as laterais antes das tampas). Saem no degrau 1, como as fichas; o veneno de 7 em diante cai maior, com uma onda, e fica até o degrau 2.
- [x] Carta mudando de face (`gpuTurn.ts`, `faceTurns.ts`, 16/11/2026): a permanente que transforma, vira cópia ou vira de face para cima (ou para baixo) sobe, vira de lado em perspectiva mostrando a face de antes (guardada na foto de antes do desenho, `Snap.side`) e a nova, e pousa, com a carta da mesa escondida (também se a mesa redesenhar no meio). De lado, espera a textura da face nova por até 450 ms; sem ela, a carta da mesa termina o giro em CSS. No máximo 4 por jogada; dia e noite (a mesa inteira de uma vez) e o degrau 2 em diante continuam girando no lugar.

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

Navegador sem tela do `agent-browser` (Chrome 156, WebGL2 por SwiftShader), 1366×768, escala 1, num computador rápido. Cada linha é a **mediana de 3 medições** e, entre parênteses, a faixa. Colunas: quadros longos (contagem), p95 da duração deles, soma do bloqueio, tarefas longas e intervalos entre quadros acima de 34 ms. Comando: `node scripts/medir-efeitos.mjs --cpu 1,4,6 --vezes 3 [--cenas …] [--query gpu=0|gpu=1]`.

**Base, efeitos em CSS (fase 0, código da 0.166.0):**

| Cena | CPU | Quadros longos | p95 (ms) | Bloqueio (ms) | Tarefas longas | Intervalos > 34 ms |
| --- | --- | --- | --- | --- | --- | --- |
| dano | 1× | 0 (0–4) | 0 (0–322) | 0 | 0 | 0 (0–4) |
| dano | 4× | 5 (5–6) | 97 (60–107) | 27 (24–77) | 2 (2–3) | 5 (3–6) |
| dano | 6× | 17 (13–18) | 117 (105–168) | 365 (356–665) | 11 (10–15) | 19 (16–19) |
| voos | 1× | 0 (0–5) | 0 (0–115) | 0 | 0 | 0 (0–6) |
| voos | 4× | 8 (8–10) | 132 (127–138) | 251 (75–265) | 7 (3–8) | 7 (4–10) |
| voos | 6× | 13 (12–16) | 190 (161–241) | 752 (579–818) | 12 (11–15) | 14 (13–18) |
| campo-cheio | 1× | 5 (5–5) | 77 (74–100) | 11 (2–13) | 1 (0–2) | 4 (4–4) |
| campo-cheio | 4× | 11 (11–11) | 305 (301–335) | 1941 (1920–2111) | 17 (17–17) | 17 (16–18) |
| campo-cheio | 6× | 12 (12–13) | 559 (512–627) | 3658 (3596–3703) | 30 (29–31) | 50 (49–52) |

O que a base diz: os efeitos de hoje passam bem na CPU normal; o que pesa é o campo cheio (quase 2 s de bloqueio em 15 s de cena com a CPU 4×, e 3,6 s com 6×), que é o redesenho da mesa (item 114), não os efeitos.

**Fase 2, CSS contra GPU no mesmo código (`--query gpu=0` e `gpu=1`, rodados em seguida, 13/11/2026):**

| Cena | CPU | Versão | Quadros longos | p95 (ms) | Bloqueio (ms) | Tarefas longas |
| --- | --- | --- | --- | --- | --- | --- |
| dano | 1× | CSS | 0 (0–5) | 0 (0–447) | 0 | 0 |
| dano | 1× | GPU | 0 (0–5) | 0 (0–443) | 0 (0–13) | 0 (0–1) |
| dano | 4× | CSS | 6 (4–6) | 74 (65–104) | 29 (18–44) | 3 (0–3) |
| dano | 4× | GPU | 4 (4–5) | 65 (62–142) | 23 (17–28) | 2 (1–2) |
| dano | 6× | CSS | 14 (14–16) | 181 (105–192) | 342 (319–351) | 11 (10–11) |
| dano | 6× | GPU | 15 (11–17) | 160 (125–191) | 301 (183–352) | 11 (7–12) |
| campo-cheio | 1× | CSS | 4 (3–5) | 89 (59–92) | 9 (2–11) | 1 (0–1) |
| campo-cheio | 1× | GPU | 3 (2–4) | 74 (71–105) | 23 (0–53) | 1 (0–2) |
| campo-cheio | 4× | CSS | 11 (11–11) | 294 (280–311) | 1785 (1715–1816) | 16 (16–17) |
| campo-cheio | 4× | GPU | 11 (11–13) | 290 (281–296) | 1767 (1758–1780) | 16 (15–19) |
| campo-cheio | 6× | CSS | 12 (12–14) | 518 (503–537) | 3618 (3529–3712) | 29 (26–30) |
| campo-cheio | 6× | GPU | 12 (11–13) | 491 (476–517) | 3467 (3367–3502) | 26 (26–29) |

As linhas GPU da cena `dano` com a CPU 1× e 4× são da segunda rodada, já com o aquecimento dos shaders; as outras linhas GPU são da primeira (antes dele, o que só pode ter pesado contra a GPU). Critério 3: cumprido nas três velocidades (p95 0, 65 e 160 ms contra 0, 74 e 181 ms). Critério 4: com o aquecimento, nenhuma tarefa longa a mais na CPU 1×. Critério 6: os efeitos na GPU duram o mesmo que os de CSS que substituem (impacto 540 ms, pouso 470 ms, estilhaços até ~680 ms, ultimate 1100 ms) e o impacto do projétil sai no mesmo temporizador de antes; os testes da fila de apresentação continuam passando. Critério 8: falta (celular de verdade).

**Fase 3, CSS contra GPU no mesmo código (`--query gpu=0` e `gpu=1`, rodados em seguida por cena, 14/11/2026, código da 0.169.0):**

| Cena | CPU | Versão | Quadros longos | p95 (ms) | Bloqueio (ms) | Tarefas longas |
| --- | --- | --- | --- | --- | --- | --- |
| voos | 1× | CSS | 0 (0–4) | 0 (0–140) | 0 | 0 |
| voos | 1× | GPU | 0 (0–5) | 0 (0–118) | 0 | 0 |
| voos | 4× | CSS | 9 (7–9) | 95 (93–104) | 133 (119–134) | 5 (4–5) |
| voos | 4× | GPU | 7 (7–8) | 86 (72–110) | 73 (66–88) | 4 (3–4) |
| voos | 6× | CSS | 12 | 189 (159–245) | 551 (516–597) | 10 (9–12) |
| voos | 6× | GPU | 12 (11–14) | 129 (125–144) | 413 (407–487) | 9 (9–10) |
| dano | 1× | CSS | 0 (0–3) | 0 (0–341) | 0 | 0 |
| dano | 1× | GPU | 0 (0–3) | 0 (0–334) | 0 | 0 |
| dano | 4× | CSS | 2 (2–3) | 56 (53–93) | 5 (0–10) | 0 (0–1) |
| dano | 4× | GPU | 2 (1–3) | 101 (52–115) | 2 (0–4) | 0 |
| dano | 6× | CSS | 7 (6–9) | 93 (85–111) | 115 (109–148) | 6 (6–9) |
| dano | 6× | GPU | 11 (11–12) | 151 (85–155) | 139 (133–175) | 7 (6–8) |
| campo-cheio | 1× | CSS | 4 (1–7) | 64 (57–132) | 0 (0–10) | 0 (0–1) |
| campo-cheio | 1× | GPU | 3 (2–4) | 93 (65–173) | 0 | 0 |
| campo-cheio | 4× | CSS | 11 (11–12) | 224 (216–263) | 1306 (1267–1311) | 15 (14–16) |
| campo-cheio | 4× | GPU | 12 | 229 (223–230) | 1301 (1261–1336) | 13 (13–15) |
| campo-cheio | 6× | CSS | 14 (14–15) | 398 (365–411) | 2597 (2442–2600) | 27 (27–31) |
| campo-cheio | 6× | GPU | 14 (12–14) | 381 (365–485) | 2554 (2452–2848) | 30 (29–33) |

O que a fase 3 diz:

- **Voos:** a GPU ganha nas três velocidades (p95 0, 86 e 129 ms contra 0, 95 e 189 ms, e quase metade do bloqueio com a CPU 4×). É a cena que a fase 3 mudou. Critério 3 cumprido.
- **Campo cheio:** empate dentro da faixa (o peso é o redesenho, item 114). Com a GPU, os intervalos entre quadros acima de 34 ms sobem (117 contra 16 com a CPU 4×, 143 contra 63 com 6×) porque a camada desenha a cada quadro enquanto há efeito vivo e, freada, cada quadro passa um pouco dos 34 ms (p95 35,8 contra 33,4 ms); não são quadros longos.
- **Dano:** o critério 3 **não** foi cumprido com a CPU 4× (101 contra 56 ms; com só 2 quadros longos por cena o p95 é o pior quadro, e as faixas se cruzam) nem com 6× (151 contra 93 ms). Na fase 2 ele passava (65 e 160 contra 74 e 181), mas o CSS daquela rodada saiu bem mais pesado que o desta, então a comparação entre rodadas não serve. Repetindo só o dano com a CPU 6× (8 medições de cada, alternando as versões), a mediana do p95 deu 134 ms na GPU contra 109 no CSS, o tempo somado dos quadros longos 728 contra 614 ms e o bloqueio 150 contra 106 ms. Os quadros a mais aparecem no terreno, nos Bolts, na luta e na destruída, e os piores (~150 ms) não têm script nem bloqueio: são desenho ou espera pela GPU emulada. Num teste rápido (4 medições de cada, máquina com ruído), a GPU **sem o voo da carta** (fase 3) ficou com p95 86 ms e soma 662 ms, perto do CSS; tirar a sombra animada da peça invisível que leva a legenda não mudou nada (121 ms, 773 ms). A suspeita é o voo da carta na GPU (malha em perspectiva com a textura inteira, mais a peça em CSS fazendo o mesmo caminho), e o celular de verdade (critério 8) é o que diz se isso pesa fora da GPU emulada.
- **Critério 4:** nenhuma tarefa longa com a CPU 1× em nenhuma cena, com a GPU. **Critério 5:** 145,1 KB gzip baixados na partida com a camada ligada (conferido no `vite preview`, somando os arquivos que a página pediu; o renderizador WebGPU e o de canvas não são pedidos), e a tela inicial sem nenhum deles. **Critério 6:** os 614 testes do `npm test`, com os da fila de apresentação, passam.
- O `scripts/medir-efeitos.mjs` passou a gravar no `--json` todos os quadros longos de cada medição (`frames`, com o momento, a duração, o bloqueio e os scripts acima de 5 ms), para achar qual jogada pesou.

**Mesa parada, fase 3b (14/11/2026):** rastro do Chrome por 3 s com a mesa parada no `effects-lab.html?mesa&jogar=cheio,tokens:20` (campo cheio, 20 fichas enjoadas), somando o trabalho de desenho da página (estilo, layout, pré-pintura, pintura, camadas e commit). Antes: cerca de 1.000 ms a cada 3 s (um terço da CPU, só com animações de estado), dos quais o giro do ícone do enjoo (layout a cada quadro), a aberração de cor (pintura e raster das camadas misturadas) e a moldura da proteção (`border-color` e `filter`) eram quase tudo. Depois: cerca de 135 ms, e marcar todas as cartas como alvo não muda nada (antes somava mais uns 150 ms de estilo e pré-pintura).

**Voos, fase 3b (14/11/2026, com a mão inicial voando de costas na GPU):** `--cenas voos --cpu 1,4 --vezes 3`, CSS e GPU em seguida. CPU 1×: zero quadros longos nas duas (a faixa vai a 137 e 163 ms só na primeira medição de cada navegador). CPU 4×: CSS com 7 quadros longos, p95 98 ms (93–101), bloqueio 98 ms; GPU com 7, p95 100 ms (89–108), bloqueio 99 ms. Empate dentro da faixa; os piores quadros são de layout da mesa (o `onmessage` do laboratório redesenhando), não da camada.

**Troca automática para leves (substituída em 15/11/2026):** a troca de mão única (três efeitos lentos entre os oito primeiros trocavam para leves de vez) deu lugar ao regulador do Efeitos: automático (`effectsGovernor.ts`), que desce e sobe por degraus: 1 faíscas pela metade, 2 mesa viva parada e câmera parada, 3 efeitos em CSS. Desce com 3 s abaixo de 30 quadros por segundo (pior quarto da janela, `frameClock.ts`) e sobe com 6 s acima de 50 com algo animando; a subida que recai em até 20 s trava o degrau por 20 s, dobrando até 160 s; mais de 40 permanentes seguram a mesa no degrau 1.

**Mesa viva, critério 9 (15/11/2026, código da 0.179.0):** `--cenas dano,parada --cpu 1,4,6 --vezes 3`, com `--query gpu=1` e `gpu=1&viva=0` (a mesa viva tirada, só a camada dos efeitos) rodados em seguida por cena. A cena `parada` é nova: a mão dada e cinco jogadas `pausa`, a mesa parada por 15 s. Com `gpu=1` o regulador do automático fica desligado, então a mesa viva nunca para sozinha nessa medição.

| Cena | CPU | Mesa viva | Quadros longos | p95 (ms) | Bloqueio (ms) | Tarefas longas | Freio medido |
| --- | --- | --- | --- | --- | --- | --- | --- |
| parada | 1× | com | 0 | 0 | 0 | 0 | 1,1× |
| parada | 1× | sem | 0 | 0 | 0 | 0 | 1,0× |
| parada | 4× | com | 4 (4–10) | 141 (108–195) | 36 (0–120) | 2 (1–6) | 6,6× |
| parada | 4× | sem | 0 | 0 | 0 | 0 | 4,1× |
| parada | 6× | com | 16 (13–16) | 442 (413–658) | 676 (454–1015) | 8 (8–10) | 8,0× |
| parada | 6× | sem | 7 (6–8) | 243 (212–264) | 212 (175–249) | 3 (3–4) | 6,7× |
| dano | 1× | com | 14 (11–21) | 139 (133–175) | 41 (0–42) | 1 (0–2) | 1,1× |
| dano | 1× | sem | 9 (9–14) | 175 (84–209) | 0 (0–48) | 0 (0–2) | 1,0× |
| dano | 4× | com | 51 (42–61) | 308 (300–376) | 3743 (3089–4038) | 67 (53–70) | 6,3× |
| dano | 4× | sem | 44 (40–51) | 256 (242–309) | 3227 (2257–3483) | 52 (44–60) | 5,9× |
| dano | 6× | com | 48 (40–54) | 479 (391–739) | 6255 (5037–6659) | 68 (56–68) | 10,8× |
| dano | 6× | sem | 50 (48–56) | 429 (336–501) | 5206 (4046–6166) | 73 (61–74) | 8,1× |

O que diz:

- **Mesa parada:** com a CPU normal, nada (zero quadros longos com e sem). Freada, a mesa viva **traz** quadros longos que não existiam (4 com a CPU 4×, e 16 contra 7 com 6×): o critério 9 não passa aí. A coluna "freio medido" sobe junto (6,6× contra 4,1×): o WebGL deste navegador é o SwiftShader, que desenha o shader na CPU e disputa os núcleos com a página, então parte do peso é da emulação e não aconteceria numa placa de vídeo de verdade. Quem decide é o celular de entrada (critério 8). Na mesa real, o automático já para a mesa viva no degrau 2 quando os quadros caem abaixo de 30 por segundo.
- **Dano:** a mediana com a mesa viva fica dentro da faixa das medições sem ela com a CPU 4× (308 contra 242–309 ms) e 6× (479 contra 336–501 ms), e com a CPU 1× o p95 é até menor (139 contra 175 ms). Critério 9 cumprido nessa cena.
- **Atenção, fora do critério 9:** a cena `dano` ficou bem mais pesada que na fase 3 mesmo sem a mesa viva (9 quadros longos com a CPU 1×, contra 0 em 14/11, e cerca de 3 s de bloqueio com 4×, contra 2 ms). Muita coisa entrou na cena desde a 0.169.0 (momentos de impacto, mesa reagindo, faíscas, rachaduras ao destruir), e a máquina pode ter estado mais ocupada. Vale um rastro do Chrome na cena antes de concluir.

### Dado em 3D (16/11/2026)

`node scripts/medir-efeitos.mjs --cenas dados --cpu 1,4 --vezes 3`, com `gpu=1`, contra o dado chapado de antes (desligado o 3D só para a medição). Mediana e faixa de 3 medições.

| cena | CPU | versão | quadros longos | p95 (ms) | bloqueio (ms) | intervalo p95 (ms) |
|---|---|---|---|---|---|---|
| dados | 1× | 3D | 0 | 0 | 0 | 16,8 |
| dados | 1× | chapado | 0 | 0 | 0 | 16,7 |
| dados | 4× | 3D | 1 (0–4) | 78 (0–96) | 0 (0–47) | 16,8 (16,7–83,4) |
| dados | 4× | chapado | 0 (0–1) | 0 (0–68) | 0 | 33,3 |

O que diz: com a CPU normal, nenhum dos dois traz quadro longo. Freada 4×, as faixas se cruzam (o pior quadro do 3D foi desenho e layout, sem script, e uma das três medições teve 82 tarefas longas que as outras não tiveram); com WebGL emulado na CPU, não dá para separar o dado do ruído. O desenho do dado em si é pequeno (até 20 faces, um desenho por dado); o custo de uma vez é compilar o shader e pintar a textura dos números no primeiro dado da partida.

## Custo de cada efeito (ROADMAP 134, 16/11/2026)

Cada efeito medido sozinho, para escolher o que o degrau 1 do Efeitos: automático tira. Ferramenta nova: `scripts/medir-cada-efeito.mjs` (com o `npm run dev` ligado). Ela abre o laboratório de efeitos com a mesa cheia (o "Campo cheio": 38 permanentes, 22 criaturas), dispara a jogada três vezes numa janela de 10 s (ou liga um estado em todas as criaturas e deixa a mesa parada) e compara com a mesma mesa sem nada. Com a CPU normal, um rastro do Chrome dá o tempo da linha principal da página e do desenho (estilo, layout, pintura, envio ao compositor). A camada dos efeitos soma por quadro a área que pintou (`gpuProbe` em `gpuSupport.ts`: "telas", recortada na tela, sobrepostos somam), o pico de objetos e a memória das texturas. Com a CPU freada 4× e 6×, contam as janelas de meio segundo abaixo de 30 quadros por segundo no pior quarto, a medida do regulador. Os efeitos são medidos sem a mesa viva, que entra à parte como estado contínuo. Relatório com todas as tabelas: `docs/custo-dos-efeitos.html` (abrir no navegador).

**Placa emulada não serve para isso.** Por padrão, o navegador de testes usa o WebGL emulado na CPU (SwiftShader) e compõe a página sem placa (`--disable-gpu-compositing`). Assim, o canvas da camada é copiado de volta para a memória a cada quadro (`GLES2::ReadPixels` dentro do `Commit`, cerca de 1 s a cada 10 s de efeito). Isso fazia a camada parecer 3 a 4 vezes mais pesada que o CSS na linha principal (mágica de valor 6: 1.587 contra 383 ms) e a mesa viva custar 350 ms por segundo. Com a placa real (`--placa real`, o padrão do script: ANGLE sobre o OpenGL do sistema, Intel UHD 770), a cópia some (o `Commit` do ninjutsu cai de 2.158 para 82 ms), a camada fica perto do CSS e a mesa viva custa 7 ms por segundo. As medições antigas desta spec com a camada GPU, todas com a placa emulada, pesam contra a camada pelo mesmo motivo.

**Pesa uma vez** (por vez, mesa cheia, placa real; "telas" é a área pintada pela camada; as quedas com a CPU 6× são a mediana de 3 medidas nas linhas de sacrificar, terreno, moeda, criatura, Bolt, letal, lendária e mágica de valor 6, e de 1 medida nas outras):

| Jogada | Página (ms) | Em CSS (ms) | Telas | CPU 6×: janelas < 30 |
| --- | --- | --- | --- | --- |
| Criar 10 fichas | 441 | 481 | 13 | 2 (1 medida) |
| Lightning Bolt | 423 | 285 | 21 | 0 |
| Ninjutsu | 415 | 290 | 29 | 1 (1 medida) |
| Conjurar criatura | 380 | 356 | 29 | 1 |
| Mágica de valor 6 (mesa escurece, câmera) | 338 | 302 | 166 | 2 (pior quarto a 15 quadros) |
| Lendária chegando (raios) | 325 | 281 | 42 | 0 (pior quarto a 30) |
| Lutar | 290 | 260 | 4,8 | 0 |
| Reanimar | 258 | 408 | 5,2 | 0 |
| Conjurar do cemitério | 235 | 214 | 18 | 0 |
| Dano de combate no jogador | 178 | 145 | 0,9 | 1 (1 medida) |
| Mão inicial | 155 | 87 | 50 | 0 |
| Golpe letal (protegido) | 117 | 94 | 40 | 1 |
| Ultimate (protegido) | 104 | 104 | 182 | 1 (1 medida) |

**Pesa o tempo todo** (por segundo, o estado em todas as 22 criaturas, mesa parada; por criatura, divida por 22):

| Estado | Página (ms/s) | Desenho (ms/s) |
| --- | --- | --- |
| Voar (vento) | 106 | 79 |
| Vínculo com a vida (seiva) | 89 | 61 |
| Alvo de algo na pilha (mira e luz da seta) | 68 | 48 |
| Enjoo de invocação (aberração de cor) | 67 | 49 |
| Ward (runas) | 26 | 14 |
| Toque mortífero (névoa) | 19 | 8 |
| Resistência à magia (brilho) | 13 | 6 |
| Mesa viva | 7 | 0 |
| Proteção, indestrutível (molduras) | 3 | 1 |

O que diz:

- Com a CPU normal, nada derruba os quadros. O custo de uma jogada na linha principal acompanha quanto tempo ela dura: enquanto a camada desenha, a página refaz o quadro a cada quadro. A parte da própria camada (andar e desenhar) é pequena: 15 a 45 ms por jogada.
- Na placa, a área pintada separa poucos efeitos: o ultimate (182 telas por vez, onda e mesa escurecendo), a mágica de valor 6 (166, a mesa escurecendo: um retângulo preto e um sprite do tamanho da tela por cerca de 1 s), a mão inicial (50), a lendária (42) e o golpe letal (40). O resto fica abaixo de 30.
- Freada 6×, a mágica de valor 6 é a que mais derruba os quadros entre as medidas repetidas. As primeiras medidas de uma vez só apontavam sacrificar, terreno e moeda (4×) ou exilar e embaralhar (6×), e caíram para 0 na repetição: eram travadas esporádicas da máquina.
- Os estados contínuos não derrubam quadros nesta máquina, nem com a CPU 6× (o pior quarto ficou em 60), mas ocupam a linha principal o tempo todo: com dez criaturas voando, perto de 50 ms por segundo num computador rápido.
- Memória das texturas: até 8,4 MB, das imagens das cartas em voo. Não pesa na escolha.

**Decidido em 16/11/2026** (`TIER1_CUTS` em `gpuSupport.ts`): no degrau 1, além das faíscas pela metade, saem a mesa escurecendo da mágica de valor 6 e os raios da lendária, e as animações contínuas das permanentes param à vista (`data-fx-calm` na mesa: o vento do voar, a seiva do vínculo e a luz da seta de alvo somem; a mira e a aberração do enjoo ficam paradas). Golpe letal e ultimate continuam inteiros, com a mesa escurecendo deles (`keep`). O E2 e o E3 continuam como estavam, somando o que o E1 tira.

**O E1 novo, medido de novo** (mesa cheia, placa real, mediana de 3 medidas com a CPU 6× e de 2 ou 3 com a CPU normal; `--degrau 0` e `--degrau 1` rodados em seguida, num servidor de desenvolvimento só com esta mudança, porque outra tarefa salvando arquivos na mesma pasta recarregava a página no meio das medidas):

| Efeito | E0 | E1 |
| --- | --- | --- |
| Mágica de valor 6, CPU 6× | 4 janelas < 30, 108 telas por vez | 1 janela, 36 telas |
| Mágica de valor 6, CPU normal | 602 ms por vez na página, 143 telas | 384 ms, 45 telas |
| Lendária, CPU 6× | 2 janelas < 30, pior quarto a 5 quadros | 0 janelas, pior quarto a 60 |
| Lendária, CPU normal | 864 ms por vez | 435 ms |
| Voar (22 criaturas) | 78 ms/s | 0 |
| Vínculo com a vida | 147 ms/s | 19 ms/s |
| Alvo de algo na pilha | 96 ms/s | 18 ms/s |
| Enjoo de invocação | 70 ms/s | 37 ms/s |

- Parar só o vento do voar não aliviou nada (173 contra 204 ms/s, dentro do ruído): o que pesa é o lugar inteiro da criatura flutuando, com a sombra. O E1 para também a flutuação; a carta fica no alto, parada.
- Os números do E0 desta tabela saíram mais altos que os do ranking acima porque foram tirados noutro momento e noutro servidor; a comparação vale entre as duas colunas, rodadas em seguida.
- A troca de degrau não deixa efeito pela metade: o que já está na camada termina; o que começa depois já sai sem os cortes. As animações contínuas vão para o desenho parado (a mira e a carta que voa dão um pequeno salto até ele) e, de volta ao E0, recomeçam do início.
- Falta conferir, numa partida de verdade e num celular de entrada, que a mesa desce menos vezes para o E2 (critério 8 do item 125).

## Mesa em silêncio (16/11/2026)

Ao prototipar o voar na camada (a recomendação depois do item 134), a medição mostrou que o custo dos estados contínuos não estava nas animações de CSS, e sim na página que nunca descansava. Uma animação só de `transform` e `opacity` vai para o compositor e não custa nada à página, **desde que a página não desenhe quadros**; com algum laço de `requestAnimationFrame` rodando, o Chrome refaz a cada quadro o estilo de todas as animações em andamento, também as do compositor (o rastro mostrava 3,5 vezes mais invalidações "Animation" com o voar ligado). E havia três laços que nunca paravam:

- **PixiJS:** o `SchedulerSystem` do renderizador pendura o agendador do coletor de texturas no `Ticker.system`, que liga sozinho e roda para sempre, com ou sem efeito vivo. A camada parava o próprio laço, mas não esse. Agora `Ticker.system` fica parado e anda só dentro do `tick` da camada (`gpuLayer.ts`): o coletor só marca `_ready`, e quem coleta é o desenho seguinte.
- **Regulador (`frameClock.ts`):** escutava os quadros a partida inteira, e o laço não parava quando quem escutava saía dentro do próprio aviso (o `tick` pedia o quadro seguinte depois de avisar). Agora o regulador só mede com algo animando (decidido nesse dia): acorda com `play` da porta e com as peças e animações do `motionKit`, e dorme depois de duas janelas (1 s) paradas. O tempo parado não conta como quadros baixos (`rest()` em `effectsGovernor.ts`): duas jogadas lentas seguidas descem o degrau; uma jogada lenta depois de um minuto parado, não.
- **Mesa viva:** passou para um worker com `OffscreenCanvas` (`ambienceWorker.ts`; o shader e o estado ficaram em `ambienceDraw.ts`, usados pelos dois caminhos). O canvas do worker chega ao compositor sem quadro da página. Sem `OffscreenCanvas`, ou se o worker não conseguir o WebGL2, a página desenha como antes.

Medido com um rastro do Chrome só da linha principal da página (o `medir-cada-efeito.mjs` roda o próprio laço de quadros para contar as janelas lentas e por isso mantém a página acordada: ele exagera os estados contínuos), no modo de verdade (Efeitos: automático, mesa viva ligada, sem `gpu=1`), o Campo cheio do laboratório parado depois de assentar, placa real, código de antes e de depois rodados em seguida:

| Mesa cheia parada | Antes | Depois |
| --- | --- | --- |
| Nada animando | 725 ms/s, 60 quadros/s | 16 ms/s, 1 quadro/s |
| Voar (22 criaturas) | 877 ms/s | 23 ms/s |
| Vínculo com a vida | 860 ms/s | 14 ms/s |
| Enjoo de invocação | 742 ms/s | 24 ms/s |
| Alvo de algo na pilha | 862 ms/s | 505 ms/s, 48 quadros/s |

- O que sobrava era o pulso de luz da seta de alvo (`.arrow-pulse`): `stroke-dashoffset` num SVG com filtro de desfoque, que nunca vai ao compositor e repintava a cada quadro enquanto a seta existisse. Decidido no mesmo dia: ele passa 3 vezes e para, como o da seta de combate. Enquanto corre (até uns 8 s numa seta longa, a 330 px por segundo), custa o mesmo de antes; depois, a mesa com 4 setas de alvo ficou em 31 ms/s e 1 quadro por segundo. A mira das cartas alvejadas (`fx-aim`) vai ao compositor e não acorda a página.
- O Contador de vida também ficava com o laço do PixiJS ligado depois do primeiro dado em 3D.
- Desenhar os estados contínuos em WebGL (a ideia de antes) deixou de compensar: a flutuação da carta é DOM e ficaria em CSS, e o resto já quase não custa com a página parada.
