# Próximas funcionalidades

Os itens concluídos (✅) e descartados (❌) ficam em `docs/roadmap-feito.md`, com o mesmo número. Ao concluir um item, mova a seção inteira para lá. Item novo recebe o número seguinte ao maior dos dois arquivos.

## 7. Visual mais parecido com o MTG Arena

A mesa já segue a ideia do Arena, mas os modais e painéis ainda parecem de site: caixas com borda dourada fina, fundo escurecido uniforme e muito texto. No Arena, o foco vai para as cartas, e o fundo some de um jeito mais teatral.

- [x] Modais que escurecem o fundo (escolha de cartas, revelar, cemitério/exílio, pilha, resultado): fundo com vinheta e desfoque leve da mesa, em vez de uma camada preta chapada; entrada animada.
- [x] Nas escolhas de cartas, as cartas grandes e soltas sobre o fundo escuro, sem "caixa" em volta; título curto em cima e botões grandes embaixo, centralizados.
- [x] Carta escolhida com brilho e leve elevação (como no Arena), em vez de só a borda.
- [x] Saída animada dos modais (a janela de escolha respondida some com a vinheta e a caixa descendo um pouco).
- [x] Botões principais no estilo do Arena: forma, cor e brilho consistentes entre "OK", "Confirmar", "Passar" e "Fim de turno".
- [ ] Revisar painéis menores (caixa de ação, seletor de ataque, barra de escolha recolhida) para seguir a mesma linguagem.

## 8. Animações mais parecidas com o MTG Arena

Hoje as animações mostram o que aconteceu, mas são discretas e parecidas entre si: uma cópia da carta desliza, a carta pisca e some. No Arena, cada tipo de jogada tem um movimento próprio, com peso e impacto, sem atrasar o jogo.

- [ ] Conjurar: a carta sai da mão, cresce no centro da mesa por um instante e vai para a pilha; ao resolver, desce até o campo (ou vai para o cemitério) com um leve impacto.
- [x] Ataque: criaturas avançam inclinadas na direção do defensor; no dano, um golpe rápido com tremor e o número de dano saltando no alvo. (Feito no item 97.)
- [x] Bloqueio: o bloqueador desliza até a frente do atacante, com a ligação entre os dois bem visível. (Feito no item 97.)
- [x] Dano e morte: carta treme e escurece ao receber dano letal, depois se desfaz em direção ao cemitério. (Feito no item 15, letal, e no item 16, destruída.)
- [x] Vida do jogador: o número conta para cima ou para baixo, com cor e um pulso no retrato.
- [x] Terreno e fichas: entram com um "assentar" curto no campo; fichas aparecem com brilho.
- [x] Virar e desvirar com rotação suave e um pouco de peso, em vez de troca seca. (Feito no item 16.)
- [x] Gatilhos e habilidades: brilho na carta de origem e um feixe até o alvo, quando houver. (Feito no item 16.)
- [x] Manter o ritmo: nada pode segurar a vez do jogador; respeitar "reduzir movimento" do sistema e o modo acelerado.
- [ ] Conferir desempenho no celular (sem travar com muitas cartas na mesa).

## 10. Cache das imagens do Scryfall (sob demanda, com CDN)

Hoje cada aparelho baixa as imagens das cartas direto do Scryfall (`cards.scryfall.io`, endereços em `src/cards.ts`), e o service worker do PWA não guarda essas imagens. Cada partida e cada visita ao construtor de decks repete os downloads, e o Scryfall pede para os apps guardarem as imagens em vez de buscá-las de novo.

A ideia é um cache que se forma **aos poucos, só com as imagens que alguém de fato pediu**: nada de baixar a coleção inteira de uma vez. O objetivo é usar menos o Scryfall: ele fica como segunda escolha.

Decidido em 15/11/2026: o cache é o `proxy_cache` do nginx (`deploy/nginx.conf`), não código na ponte; o endereço espelha o caminho do Scryfall em `/scryfall/<tamanho>/<face>/a/b/<id>.jpg` (`/cartas/` já é da arte própria da mesa), então a mesa só troca o começo do endereço e o verso das cartas de duas faces vem junto (`src/scryfallMirror.ts`); a CDN é a Cloudflare no plano gratuito num domínio só para as imagens, `img.mesao.online` (o Free não aceita só um subdomínio do `kassio.site` sem levar o domínio, e levar o jogo inteiro para um domínio novo deixaria para trás os decks guardados no aparelho), ligado pela variável `IMAGENS_URL` no Coolify, que entra no build (passo a passo no `README.md`); se uma imagem não carrega pelo cache, a mesma imagem é pedida direto ao Scryfall.

- [x] Endpoint de imagem no nosso servidor: `/scryfall/…` no nginx busca no Scryfall na primeira vez, guarda no volume `scryfall-cache` e devolve; nas seguintes, devolve a cópia guardada (`X-Cache: MISS`/`HIT`). Só aceita `small`, `normal` e `art_crop`, frente ou verso, e ids no formato do Scryfall; qualquer outro caminho dá 404, então não vira um proxy aberto.
- [x] Cache longo para a CDN (`Cache-Control: public, max-age=31536000, immutable`, só nas respostas de sucesso). A imagem só chega à CDN depois que alguém a pediu ao menos uma vez.
- [x] Host das imagens configurável no build (`IMAGENS_URL` → `VITE_IMAGENS_URL`), com CORS no nginx e a volta ao Scryfall valendo também para ele.
- [ ] Ligar a Cloudflare em `img.mesao.online` (DNS, domínio no Coolify, regra de cache para `/scryfall/*`) e pôr `IMAGENS_URL` no Coolify, seguindo o `README.md`.
- [ ] Abrir a mesa também em `mesao.online`, sem tirar o `mtg.kassio.site` (DNS na Cloudflare, domínio no Coolify, origem no OAuth do Google), seguindo "Segundo domínio" no `README.md`.
- [x] Sem importação em massa: nenhum job de pré-carga nem varredura dos bulk data do Scryfall. O cache cresce só com o uso real (a pré-carga das imagens de um deck importado, que já existia, passa pelo cache).
- [x] Respeitar o Scryfall: uma busca só por imagem ainda não guardada, mesmo com várias mesas pedindo ao mesmo tempo (`proxy_cache_lock`), `User-Agent` identificado e a cópia guardada continua valendo se o Scryfall falhar (`proxy_cache_use_stale`). Não há fila por segundo: a busca de imagens no `cards.scryfall.io` não tem limite de requisições (o limite do Scryfall é na API), e o limite por IP do endpoint segura os excessos.
- [x] No frontend, os endereços de `cards.scryfall.io` passam pelo cache (as cartas novas ao chegar do Scryfall, as guardadas no IndexedDB ao abrir a mesa) e, se a imagem não carrega, a mesa a pede direto ao Scryfall (`<img>` e o voo da carta na GPU). Os fundos em CSS (retratos, capas dos decks, tapete) não têm essa volta: se o nginx estiver fora do ar, o site inteiro também está.
- [x] Terrenos básicos da série Nyx e fichas (as da partida e as escolhidas no deck) vinham por `api.scryfall.com/…?format=image` (um redirecionamento): viram `/scryfall/cards/<tamanho>/<série>/<número>[/back]`, que o nginx guarda no mesmo cache, seguindo ele mesmo o redirecionamento por uma rota interna (só números simples; os com ★ continuam direto na API). As da partida são trocadas ao ler a mensagem do servidor (`parseServerMessage`).
- [x] Dados das cartas (texto, tradução e endereços das imagens) guardados no IndexedDB em vez do localStorage, para não disputar espaço com os decks; o que estava no localStorage passa para lá sozinho.
- [x] No aparelho: regra de cache do service worker para as imagens (CacheFirst, com limite de quantidade e de idade), para quem já viu uma carta não baixar de novo nem pela CDN.
- [x] Limpeza: até 5 GB no servidor; a imagem que fica 90 dias sem ser pedida sai, e com o disco cheio saem as menos usadas (`max_size` e `inactive` do `proxy_cache_path`).
- [ ] Métricas de acerto do cache e de buscas ao Scryfall no painel do Grafana (o nginx ainda não tem exportador; por ora, o `X-Cache` na resposta).
- [ ] Limites por IP de verdade atrás do proxy do Coolify e da Cloudflare (`real_ip` no nginx), que hoje veem o IP do proxy: vale para todos os limites, ver o item 19.
- [ ] Conferir os termos de uso de imagens do Scryfall e da Wizards antes de publicar.

## 11. Escolher como as cartas aparecem (imagem inteira ou arte com layout próprio)

Hoje a mesa mostra a imagem inteira da carta do Scryfall (`face()` em `src/ui/forgeTable.ts`). Em telas pequenas o texto impresso fica ilegível, e a imagem inteira pesa mais para baixar. Já existe um layout de texto montado pela mesa (`faceHTML`), usado quando não há imagem; ele pode virar uma opção de verdade.

- [x] Nova opção em **Opções** da partida (junto de sons e passar automaticamente): "Aparência das cartas" com **Imagem completa** (como hoje) e **Arte e texto** (layout próprio). Fica salva no aparelho e vale na hora, sem recarregar.
- [x] Layout próprio: arte recortada do Scryfall (`art_crop`) no topo, com nome, custo de mana em símbolos, linha de tipo, texto de regras em português (o que a mesa já busca) e poder/resistência ou lealdade, na moldura da cor da carta.
- [x] Texto legível no tamanho da mesa: no campo, mostrar só nome, custo e P/R (o texto completo fica no inspetor); na mão e no inspetor, o texto inteiro, reduzindo a fonte quando for longo.
- [x] Casos especiais já cobertos: planeswalkers (lealdade), terrenos básicos (só a arte), cartas viradas para baixo (verso), fichas sem arte do Scryfall (ficam com a imagem completa).
- [ ] Cartas de duas faces e sagas: hoje usam a arte e o texto da face principal; mostrar a face visível e o layout de capítulos.
- [x] Manter marcadores, selos de custo, brilhos de jogável/alvo/atacando e animações funcionando igual nos dois modos.
- [x] Vale para toda a partida (mesa, mão, pilha e janelas de escolha); o inspetor continua com a imagem completa.
- [x] Combina com o cache de imagens (item 10): `art_crop` é bem menor que a imagem inteira.

## 15. Efeitos de dano no estilo do Arena

Hoje o dano aparece como um número vermelho sobre a vida do jogador e um contorno vermelho na criatura. Não dá para ver de onde veio o dano, se foi combate ou mágica, nem as palavras-chave que mudam o resultado (atropelar, toque mortífero, vínculo com a vida). No Arena cada golpe tem origem, trajeto e impacto, e o número salta no alvo.

Fonte dos dados: cada dano chega como evento `damage` da ponte (um por fonte e alvo, na ordem em que o Forge o causa, com o quadro público da mesa naquele instante). A ponte passa a dizer no próprio evento se é combate, em qual etapa (iniciativa ou normal), se é excesso de atropelar, se a fonte tem toque mortífero, vínculo com a vida, infectar ou murchar, se o alvo é planeswalker e se a fonte é comandante. Ganho e perda de vida chegam como `life-changed`. Teste no laboratório de efeitos (item 18).

- [x] Dano direto (mágica ou habilidade): projétil com rastro da fonte (carta no campo, ou a carta que está resolvendo) até o alvo — criatura, jogador ou planeswalker — e impacto no ponto de chegada. Dados: `damage` com `combat: false`; a fonte é `sourceId`/`card`.
- [x] Dano de combate: o atacante avança até o bloqueador ou até o retrato do defensor e volta, com impacto no alvo; o bloqueador revida no atacante. Dados: `damage` com `combat: true`.
- [x] Número flutuante de dano sobre o alvo (vermelho), com tamanho maior para dano grande. Dados: `delta` do `damage`.
- [x] Atropelar (trample): o golpe atinge o bloqueador e o excesso segue até o jogador num segundo trajeto, marcado como "Atropelar". Dados: `damage` com `trample: true` quando o atacante bloqueado causa dano ao jogador ou planeswalker atacado.
- [x] Golpe duplo (double strike): dois golpes, um na etapa de iniciativa e outro na normal, com selo "1º golpe"/"2º golpe". Dados: `step: "first-strike" | "regular"` e `doubleStrike: true`.
- [x] Iniciativa (first strike): o golpe da etapa de iniciativa sai antes e marcado, sem esperar o revide. Dados: `step: "first-strike"`.
- [x] Toque mortífero (deathtouch): impacto com marca própria (caveira) na criatura atingida, mesmo com 1 de dano. Dados: `deathtouch: true` (o Forge já informa o tipo de dano).
- [x] Vínculo com a vida (lifelink): número verde "+N" subindo do retrato de quem controla a fonte, logo depois do golpe. Dados: `lifelink: true` no `damage` e o `life-changed` positivo que vem em seguida.
- [x] Ganho de vida em geral: "+N" verde no retrato. Dados: `life-changed` com `delta` positivo.
- [x] Infectar e murchar (infect/wither): em vez de número de dano, o alvo recebe marcadores −1/−1 (criatura) ou veneno (jogador), com cor e ícone próprios. Dados: `infect: true` (jogador) e `wither: true` (criatura, inclusive dano de infectar em criatura).
- [x] Dano a planeswalker: projétil ou golpe até o planeswalker e a lealdade caindo em número flutuante. Dados: o Forge não avisa dano a planeswalker como dano, só a lealdade caindo; a ponte transforma essa queda em `damage` com `loyalty: true` quando ela acontece no dano de combate ou durante a resolução de outra carta.
- [x] Dano prevenido (escudo): domo transparente sobre o alvo, o número riscado e o selo "Prevenido". Dados: o Forge não avisa; a ponte vê o escudo de prevenção ("previna os próximos N") diminuir e manda `damage` com `prevented: true`. Prevenções sem escudo (Neblina e afins) ainda não aparecem.
- [x] Dano dividido entre vários alvos: vários projéteis saindo juntos da mesma fonte, cada um com seu número e o selo "Dividido". Dados: vários `damage` seguidos da mesma fonte, fora do combate, saem juntos da fila.
- [x] Dano a si mesmo (dor: Sol Ring de dor, terrenos de dor, Phyrexian): o golpe "volta" para o próprio retrato, sem trajeto longo. Dados: `damage` em que o alvo é quem controla a fonte.
- [x] Dano de comandante (Commander): selo de comandante no impacto e o contador "Dano x/21" pulsando. Dados: `commander: true` no `damage` de combate.
- [x] Letal: criatura com dano igual ou maior que a resistência (ou com toque mortífero) treme e escurece antes de ir ao cemitério; jogador chegando a 0 de vida tem um impacto maior. Dados: `lethal: true` no `damage` (calculado pela ponte com a resistência e o dano marcado).
- [x] Tremor leve da mesa em dano grande (5 ou mais, ou letal no jogador).
- [x] Respeitar "reduzir movimento" do sistema: sem projéteis nem tremor, só o número e o destaque no alvo.
- [x] Som próprio para cura, veneno (e −1/−1), escudo e carta destruída; golpe e projétil usam os sons de impacto que já existiam.
- [ ] Conferir desempenho no celular com combates grandes (muitas criaturas atacando ao mesmo tempo).

## 19. Limite de requisições (rate limit) nos pontos sensíveis

Hoje nada limita quantas vezes um mesmo cliente pode abrir conexões ou pedir operações caras. Cada partida roda o Forge inteiro na ponte (memória e CPU), a importação por link busca o deck no Moxfield ou no Archidekt a partir do nosso servidor, e o cache de imagens (item 10) vai buscar no Scryfall. Um cliente com defeito, um script ou alguém mal-intencionado pode derrubar a ponte, esgotar a máquina ou fazer os serviços de fora bloquearem o nosso IP.

A ideia é limitar **por IP (e por conexão, quando fizer sentido)** cada ponto que gasta recurso de verdade, com folga para o uso normal e uma mensagem clara em português quando o limite for atingido, sem derrubar a partida de quem está jogando.

- [ ] Levantar os pontos sensíveis e quanto cada um custa: abrir conexão em `/ws`, criar sala e começar partida (sobe um jogo do Forge), entrar em sala (busca pelo código), validar deck, importar deck por link (busca externa), mensagens dentro da partida, `/metrics` e `/health`, e o endpoint de imagens do item 10.
- [x] nginx: `limit_conn` e `limit_req` por IP em `/ws` (novas conexões por segundo e conexões abertas ao mesmo tempo), com rajada pequena permitida.
- [x] `/metrics` e `/health` só para a rede interna (Prometheus), não para a internet: conferido, o nginx só repassa `/ws` para a ponte, então os dois ficam visíveis apenas na rede dos containers.
- [ ] Ponte: limite de partidas e salas abertas ao mesmo tempo por IP e no total do servidor (fila ou recusa com aviso quando a máquina estiver cheia), e tempo máximo para salas vazias ou paradas.
- [ ] Ponte: limite de mensagens por conexão (por exemplo, balde de fichas por segundo), descartando ou fechando a conexão que inundar; respostas de jogo legítimas (passar, atacar, escolher) nunca podem esbarrar no limite.
- [x] Busca de sala pelo código: limitar tentativas por IP para ninguém varrer os códigos até achar uma sala alheia.
- [ ] Importar por link: poucas importações por minuto por IP, cache curto do mesmo link, e respeitar os limites do Moxfield e do Archidekt (fila com intervalo mínimo e `User-Agent` identificado).
- [ ] Imagens (item 10): o limite de buscas ao Scryfall já previsto lá, mais um limite por IP no endpoint para não virar um jeito de forçar downloads.
- [x] Busca de cartas no construtor de decks: o aparelho já fala direto com a API do Scryfall; conferido: a busca só sai ao enviar o formulário ou trocar um filtro (não a cada tecla), e todo pedido ao Scryfall passa por uma fila com 110 ms entre pedidos (~9 por segundo).
- [x] Mensagem para o jogador quando bater no limite da busca de sala ("Muitas tentativas com códigos que não existem. Espere alguns minutos e tente de novo.").
- [ ] Mesma mensagem para os limites que ainda virão na ponte. O limite do nginx em `/ws` recusa a conexão sem mensagem: o navegador não recebe o código 429 de um WebSocket recusado, por isso ele é folgado (30 por minuto com rajada de 20, 30 abertas por IP).
- [ ] Métricas no Grafana: pedidos recusados por limite, por ponto, e alertas quando um IP for bloqueado com frequência. Já no painel (seção **Cartas e pedidos recusados**): as recusas do servidor por pedido e por motivo, inclusive o IP bloqueado por códigos errados. Faltam as recusas do nginx em `/ws` (sem exportador) e os alertas.
- [ ] Testes: script que dispara conexões e mensagens em excesso e confere que o limite segura sem afetar uma partida normal rodando ao lado.

## 20. Migrar a interface para Preact (ou React)

Hoje a interface é TypeScript puro: cada tela monta o HTML em texto (`innerHTML`) e atualiza o DOM à mão (`src/ui/`, com a mesa da partida em `forgeTable.ts`, perto de 2.000 linhas). Isso funcionou até aqui, mas cada recurso novo (efeitos, modais do Arena, Commander com vários jogadores) aumenta o código que precisa lembrar o que já está na tela, onde ficam os ouvintes de evento e o que redesenhar quando o estado da ponte muda. Isso abre espaço para erros de tela desatualizada e torna mais difícil mexer sem quebrar outra parte.

A ideia é passar para componentes com estado declarado, **aos poucos e sem parar o resto do roadmap**, com a mesa funcionando igual para o jogador em cada etapa.

- [ ] Escolher a biblioteca: **Preact** (cerca de 4 KB, API do React, bom para PWA no celular) é o candidato principal; React só se alguma biblioteca indispensável exigir. Comparar peso no build, tempo de carga no celular e suporte do Vite.
- [ ] Definir o estado: um modelo único do quadro da ponte (o que hoje chega pelo `client`) com sinais (`@preact/signals`) ou um store simples, e as telas lendo dele em vez de cada uma guardar sua cópia.
- [ ] Migrar primeiro as telas mais isoladas (novidades, opções, lobby, importar deck, construtor de decks), uma por vez, convivendo com o código antigo.
- [ ] Depois os modais de escolha (gatilhos, modo de conjurar, escolha de cartas, alocar dano) e por último a mesa da partida, quebrada em componentes (campo, mão, pilha, retratos, trilha de fases, caixa de ação).
- [ ] Efeitos e animações (itens 15, 16 e 17, `motion.ts`, linha do tempo de apresentação) ficam fora do ciclo de redesenho: componentes expõem os elementos (refs) e os efeitos continuam animando direto no DOM, sem renderizar a mesa a cada quadro.
- [ ] Desempenho: conferir que uma atualização da ponte só redesenha o que mudou, inclusive com campo cheio e no Commander com vários jogadores (laboratório de efeitos, item 18).
- [ ] Manter o CSS atual (sem trocar por CSS-in-JS), o PWA, o modo offline e a acessibilidade (teclado, leitor de tela) iguais ou melhores.
- [ ] Testes: testes de componente para as telas migradas e os testes de protocolo da ponte passando sem mudanças.
- [ ] Remover o código antigo de cada tela assim que a versão nova estiver no ar.

## 26. Mulligan em paralelo com os outros jogadores

Hoje cada jogador decide a mão inicial na sua vez, e em Commander com quatro pessoas a mesa espera uma de cada vez. A ideia é todos decidirem ao mesmo tempo (a regra permite: as decisões só são reveladas juntas). Fazer **só se a implementação for simples**.

- [x] Avaliação inicial (20/10/2026): não é simples. O próprio Forge faz o mulligan em sequência: o serviço de mulligan percorre os jogadores em ordem na thread da partida, e a escolha de cada humano trava essa thread até a resposta. Paralelizar exige substituir esse serviço por um nosso (pedir as decisões a todos os assentos de uma vez pela ponte, esperar todas e só então aplicar na ordem de turno), cuidando também do London (devolver cartas ao fundo), de quem cai no meio e da IA.
- [ ] Alternativa mais barata, se quiser só reduzir a espera: mostrar a mão inicial a todos assim que as cartas são compradas, para cada um já ir pensando enquanto os anteriores decidem.

## 27. Arte da coleção mais recente nas cartas

Hoje a imagem de cada carta é a da impressão que o Scryfall devolve na busca por nome (terrenos básicos já têm arte fixa). A ideia é usar sempre a arte da coleção mais recente, preferindo a versão **borderless** e, sem ela, a **versão padrão** (moldura normal), nunca promos, versões estendidas, showcase de temas estranhos ou impressões só digitais.

- [ ] Escolher a impressão com uma busca `!"Nome" unique=prints order=released dir=desc`, filtrando `border_color:borderless` primeiro e depois `frame_effects` vazio, sem `promo`, `digital` ou `oversized`.
- [ ] Fazer isso em lote, sem uma busca por carta: o `/cards/collection` aceita `set` + `collector_number`, então dá para guardar a impressão escolhida no cache e só refazer a escolha de tempos em tempos.
- [ ] Manter a impressão em português quando ela existe para a mesma coleção; se a tradução for de uma coleção antiga, decidir entre arte nova em inglês ou arte antiga em português.

## 28. Relatos de sugestões e erros, com a partida anexada

Hoje, quem encontra um erro ou tem uma ideia precisa falar com a gente por fora do jogo, e quase nunca dá para saber o que estava na mesa naquela hora. O painel **Erros da partida** copia um relatório em texto, mas não tem como enviá-lo e ele não mostra a mesa. A ideia é o jogador relatar **de dentro do jogo**, na tela inicial ou durante a partida, e, se quiser, anexar a partida, para darmos um jeito de repeti-la, ver o erro acontecer e conferir a correção.

Desenho e motivos de cada decisão em `docs/relatos-e-repeticao.md`. Em resumo: o aparelho grava os estados que recebeu da ponte e as ações que enviou. Esses dados bastam para **repetir a partida na mesa, sem a ponte** (como o laboratório de efeitos). A ponte guarda os decks de todos e um retrato do Forge (`GameState`) a cada turno, para **restaurar a partida no motor** quando o erro for de regra. Os relatos ficam em arquivos no servidor, recebidos por uma rota HTTP própria com limite de envio. Nada vai sozinho para o GitHub.

Etapa 1: gravar a partida no aparelho
- [x] Gravador da mesa: cada `state` recebido (sem repetir `stateVersion`), cada mensagem enviada com `gen` e o quadro visto, os avisos e erros da ponte e da mesa, com horário.
- [x] Junto: versão da mesa, regras e motor, formato, o próprio deck, aparelho (navegador, tela, toque, PWA) e preferências (aparência das cartas, ritmo, reduzir movimento, passar automaticamente).
- [x] Limite de 2 MB comprimidos (gzip nativo do navegador): passando disso, ficam o primeiro quadro e os mais recentes. Os quadros já são guardados como diferenças do anterior, com um inteiro a cada 40 (o gzip só enxerga 32 KB para trás). Uma partida 1×1 de 13 turnos deu 181 quadros e 29 KB comprimidos.
- [x] A última partida fica guardada no IndexedDB, para relatar da tela inicial depois que ela acabou ou depois de recarregar a página.
- [x] Para desenvolvimento: **Baixar gravação** no painel de erros, com o mesmo arquivo que o relato vai enviar.

Etapa 2: repetir a partida na mesa (página de desenvolvimento)
- [x] `tests/fixtures/replay.html`, no molde do laboratório de efeitos (item 18): abre o arquivo, monta a mesa com um cliente falso e entrega os quadros na ordem, com as animações.
- [x] Controles: tocar e pausar, quadro a quadro, velocidade, ir ao momento do relato, e trocar aparência, tamanho de tela e "reduzir movimento".
- [x] Lista lateral com as ações enviadas, os cliques recusados e os erros, cada um levando ao seu quadro.
- [x] Conferir com uma partida 1×1 contra o computador (do envio à repetição).

Etapa 3: formulário e envio
- [x] Botão **Enviar sugestão ou erro** no menu da tela inicial e no menu da partida, e **Relatar este erro** no painel de erros.
- [x] Formulário curto: **Sugestão** ou **Algo deu errado**, descrição obrigatória (até 2.000 caracteres) e **Anexar a partida**, com o tamanho e um "o que vai junto". Vem marcado num erro durante a partida e desmarcado numa sugestão.
- [x] Rota `POST /api/relatos` na ponte, com agregador próprio de até 3 MB, sem mexer no limite das outras rotas. No nginx: a rota, `client_max_body_size 3m` e `X-Real-IP`.
- [x] Relatos guardados em arquivos num volume próprio (`relatos/AAAA-MM/<código>.json.gz` e um índice). O jogador recebe o código ("Relato R-7K2Q enviado").
- [x] Sem rede ou com o servidor fora, o relato fica numa fila no IndexedDB e sai sozinho depois.
- [x] Limites (ligados ao item 19): `limit_req` no nginx, até 10 relatos por hora por IP na ponte (o IP só como resumo, em memória, sem gravar), recusa clara quando o disco estiver cheio e mensagem em português ao bater no limite.
- [x] Teclado, leitor de tela e celular. Enviar não pausa a partida nem segura a vez.

Etapa 4: diário da partida na ponte
- [x] Guardar em memória, enquanto a partida existir, os decks de todos os jogadores (inclusive os do computador), a configuração, quem começou e os mulligans.
- [x] Retrato do Forge (`GameState`) no começo de cada turno (os últimos 3) e no instante do relato. O do turno é tirado logo depois de desvirar: tirado antes, a restauração perderia o desvirar, porque o Forge não refaz a etapa em que a partida começa.
- [x] Diário das ações aceitas e recusadas de cada assento e das respostas a perguntas (até 2.000 por partida).
- [x] O relato com partida anexada leva esse lado junto, gravado só no servidor. Mão e grimório dos outros nunca voltam a nenhum jogador.

Etapa 5: restaurar a partida no Forge
- [x] Modo de desenvolvimento da ponte que lê um relato, cria a partida com os mesmos decks e aplica o retrato do turno escolhido, para continuar dali pela mesa com o diário ao lado.
- [x] Do retrato ao teste: transformar um relato num teste de regressão em `forge-bridge/src/test`, no estilo dos testes com o motor real.
- [x] Ao restaurar, a ponte compara o retrato com a partida nova e mostra no console o que não voltou igual. Pelo código do Forge, não voltam: efeitos até o fim do turno, gatilhos atrasados, a pilha, escolhas que não ficam na carta, contadores do turno (tempestade, mágicas conjuradas), o histórico de mulligan e o placar da melhor de três. Numa partida de teste (turno 5) tudo voltou igual.
- [ ] Ver os limites acontecendo num relato de verdade e anotar no próprio relato o que não voltou igual.
- [ ] Descartado por enquanto: repetir a partida inteira por semente. O Forge usa um gerador aleatório só para todas as partidas do processo, e a IA depende da ordem das threads.

Etapa 6: triagem e manutenção
- [x] Script para listar, baixar e abrir relatos do servidor, e para criar uma issue no GitHub a partir de um relato escolhido, só com o texto e o resumo técnico, sem a partida.
- [x] Área de admin protegida por senha (`/admin`, senha em `ADMIN_PASSWORD`): relatos com estado (novo, visto, virou issue, resolvido, descartado), nota e issue, leitura, repetição na mesa, issue preenchida no GitHub sem token no servidor e exclusão; partidas e salas vivas na ponte; links para as páginas de teste, que passam a ir no build de produção.
- [x] Retenção de 90 dias ou 1 GB, apagando os mais antigos primeiro.
- [x] Métricas no Grafana: relatos recebidos por tipo e com ou sem partida, recusados por motivo e espaço ocupado.
- [x] Novidades (`CHANGELOG.md`) a cada etapa que o jogador perceber (a 3 principalmente).

## 30. Mostrar na mesa o que o Forge já acompanha

Como aconteceu com mutação, preparar, o Anel e as masmorras: o motor já aplica a regra, mas a mesa não diz nada, e o jogador só percebe pelo efeito (ou não percebe). Levantamento feito em 24/10/2026 comparando o que a ponte manda (`StateJson`, `PermanentDetails`, `TurnExtras`) com o que o Forge guarda em `Game`, `Player` e `CardView`. Nada disto aparece hoje na mesa.

Regra de visual para todos: na mesa, o mínimo (um ícone pequeno, um contorno, um ponto), sem cobrir a arte nem disputar atenção com P/T e marcadores. O detalhe vai no balão ao passar o mouse ou tocar, e no inspetor: o que é, de onde veio, quem escolheu, até quando vale e o que a regra faz.

Prioridade alta (comum em Commander, muda decisões na hora):
- [x] **Monarca** (`Game.getMonarch`): selo de coroa no retrato de quem é o monarca, com balão explicando (compra no fim do turno, quem causar dano de combate toma). Aviso quando troca de mãos.
- [x] **Controle trocado** (`CardView.getOwner` ≠ controlador): marca na permanente roubada (Threaten, Treachery, Hostage Taker) com o nome do dono, e no inspetor "Controlada por X, dona: Y". Ainda falta distinguir o "até o fim do turno".
- [x] **Escolhas feitas pela carta** (`getChosenType`, `getChosenColors`, `getNamedCard`, `getChosenPlayer`, `getChosenNumber`, `getChosenMode`): mostrar na permanente e no inspetor o que foi escolhido. Ex.: tipo do Cavern of Souls/Kindred Discovery, cor do Iona, carta nomeada pela Pithing Needle, oponente da Curse/Stuffy Doll.
- [x] **Incitada** (`Card.isGoaded`, `getGoadMap`): selo na criatura e de quem é o goad; ajuda a entender por que ela é obrigada a atacar e não pode atacar quem incitou.
- [x] **Escudos de regeneração** (`CardView.getShieldCount`): selo com a quantidade, como já existe para a prevenção de dano.
- [x] **Terrenos jogados no turno** (`Player.getLandsPlayedThisTurn` / `getMaxLandPlays`): "0/1" ao lado do retrato no turno do jogador, contando terrenos extras (Azusa, Exploration).

Prioridade média (mecânicas de coleções específicas):
- [x] **Dia e noite** (`Game.isDay` / `isNight`): sol ou lua na trilha de fases, com balão da regra de troca. Some enquanto não for nem dia nem noite.
- [x] **Contagem de mágicas no turno** (`Player.getSpellsCastThisTurn`, tempestade): número na trilha de fases ou no retrato quando houver carta na mesa que se importe (Storm, Prowess não precisa).
- [x] **Bênção da cidade** (`Player.hasBlessing`, Ascend) e **Velocidade** (`Player.getSpeed`, Aetherdrift): selos no retrato.
- [x] **Estados de uma vez só** (`isMonstrous`, `isRenowned`, `isSuspected`, `isSaddled`, `getCrewedByThisTurn`, `isExertedThisTurn`, `isDetained`, `isHarnessed`, `isSolved`): ícone pequeno na permanente; o nome em português e o que muda ficam no balão e no inspetor. Suspeita e Exaurida mudam o combate, as outras habilitam habilidades.
- [ ] **Ligações entre cartas** (`getPairedWith` do Soulbond, `getEncodedCards` do Cipher, `getHaunting`/`getHauntedBy`): linha ou destaque entre as duas ao passar o mouse, e a lista no inspetor. Junto do item 29 (exiladas sob a criatura), que usa `getExiledWith`/`getImprintedCards`.
- [x] **Batalhas** (`CardView.getProtectingPlayer`): quem defende a batalha, ao lado dos marcadores de defesa.
- [x] **Previstas no exílio** (`isForeTold`): para o dono, mostrar qual carta está prevista e o custo; para os outros, só "Prevista" no verso.

Prioridade baixa:
- [ ] **Tamanho máximo da mão** (`PlayerView.getMaxHandSize` / `hasUnlimitedHandSize`): só quando diferente de 7 (Reliquary Tower, Spellbook).
- [ ] **Pilha mais completa**: marcar cópias de mágica (`isCopiedSpell`), o valor de X escolhido e os custos opcionais pagos (`StackItemView.getOptionalCostString`, kicker, gift). Conferir antes o que o texto da pilha já traz.
- [ ] **Vida ganha e perdida no turno** (`getLifeGainedThisTurn`, `getLifeLostThisTurn`): no balão do retrato, para cartas de revolta, sangue e afins.

Para cada um: mandar o dado pela ponte só quando existir (como `ringTempted`), testar com o motor real em `forge-bridge/src/test`, montar a página de teste e entrar no `CHANGELOG.md` com prints em **Novidades em imagens**.

## 33. Melhorar a sala de espera

Depois de criar ou entrar numa sala, a barra lateral vira a sala de espera: formato, código, lugares ("Pronto", "Reconectando…", "Aguardando") e o botão "Sair da sala". Levantamento feito em 26/10/2026:

- A partida começa sozinha quando o último lugar é ocupado (`join` em `Rooms.java`). Ninguém confirma que está pronto, e o anfitrião não pode começar antes com menos gente.
- Um lugar vazio só se preenche com outra pessoa: em Commander com quatro, se aparecerem três, a mesa fica esperando. O motor já aceita computadores junto com pessoas (`Session` monta os jogadores além dos assentos com `aiDecks`), só a sala não oferece.
- O código aparece grande, mas não tem botão de copiar nem link para mandar: quem recebe precisa abrir o site, ir em Entrar e digitar.
- A sala mostra só o nome de cada um; o deck, as cores e o comandante ficam escondidos até a partida.
- Com a aba escondida, nada avisa que alguém entrou ou que a partida começou (o aviso do título e da notificação, `turnNotice.ts`, só existe para o turno).
- Não há como tirar da sala quem entrou e sumiu; o lugar só se libera quando a pessoa sai.

Alternativas (recomendado: A, B e C primeiro; D e E em seguida):

- [x] **A. Convite fácil** (0.51.0): botão de copiar o código e de compartilhar um link (`/?sala=CÓDIGO`, com o compartilhamento do celular quando houver) que abre a tela inicial já na sala, pronta para escolher o deck e entrar (o item 3 já entra direto pelo código).
- [x] **Código escolhido por quem cria a sala** (0.51.0): campo opcional de 4 letras ou números (vazio, sorteia), com aviso na sala privada de que códigos fáceis podem ser adivinhados. Código ocupado conta como tentativa errada, como na busca, para ninguém achar salas alheias por aí.
- [ ] **B. Avisos com a aba escondida**: som curto, título piscando e notificação quando alguém entra, sai ou a partida começa, reaproveitando a permissão já pedida para o aviso de turno.
- [ ] **C. Completar com o computador**: o anfitrião troca um lugar vazio por um computador (deck aleatório ou escolhido, como no Commander contra a IA) e pode desfazer enquanto a partida não começa. Precisa da ponte aceitar assentos de IA numa sala.
- [ ] **D. Pronto e começar**: cada jogador marca "Pronto" (e pode trocar o deck antes), e o anfitrião começa quando todos estiverem prontos, inclusive com lugares vazios virando computador. Muda o começo automático de hoje.
- [x] **E. Ver quem está na mesa** (0.51.0: lobby em tela própria com nome, arte e comandante; o nome do deck continua escondido): deck, cores e comandante de cada lugar (o comandante já é público), com o mesmo selo de deck verificado da escolha de deck.
- [ ] **F. Anfitrião tira da sala**: remover quem está "Reconectando…" há muito tempo, para o lugar voltar a ficar livre.
- [x] **G. Conversa curta na sala** (0.51.0): mensagens rápidas prontas ("Já volto", "Pode começar", "Vou trocar o deck"), sem texto livre para não precisar de moderação.

A decidir antes de começar: se o começo continua automático quando a sala enche ou passa a depender do anfitrião (D); se o deck dos outros aparece antes da partida ou só o comandante (E); se o computador pode ocupar lugar em sala pública ou só em privada (C).

## 34. Filtro de formato também nos meus decks

Ao escolher um formato, só os decks prontos são filtrados; os decks do próprio jogador continuam todos na lista, inclusive os de outro formato. Levantamento feito em 27/10/2026:

- Na biblioteca de decks (Gerenciar decks), o seletor "Formato" filtra só a seção "Decks prontos" (`renderLibrary` em `deckbuilder.ts`); "Meus decks" usa só o nome e as cores.
- Na escolha de deck da tela inicial, os decks prontos passam por `allowed()`, mas "Meus decks" passa só pela busca e pelas cores (`refresh` em `lobby.ts`).

- [ ] Aplicar o formato também a "Meus decks" nas duas telas, com o contador mostrando quantos aparecem de quantos existem.
- [ ] Mensagem de lista vazia que diga que há decks de outros formatos, com o atalho "Mostrar decks incompatíveis" que já existe na tela inicial.

A decidir antes de começar: se o deck de formato "Livre" aparece em todos os formatos; se o deck que existe no formato mas está incompleto ou inválido some da lista ou aparece marcado.

## 36. Histórico de jogadas mais detalhado e agrupado

O histórico da partida (Menu → Registro) é uma lista corrida, da jogada mais nova para a mais antiga, com uma frase curta por evento. Levantamento feito em 27/10/2026:

- Cada evento vira uma linha solta (`eventDescription` em `forgeTable.ts`): só o moer de várias cartas seguidas e o terreno jogado já viram uma linha só. Um turno cheio, ou uma remoção em massa, enche a lista de linhas parecidas.
- Não há separação por turno: a linha "Turno de Ana." aparece no meio das outras, sem número do turno nem fase.
- Faltam detalhes que a ponte já manda ou que a mesa já conhece: os alvos da mágica ou da habilidade, quem controlava a carta que saiu do campo, o custo pago, o resultado do combate (quem bloqueou quem, o que morreu). A saída do campo também não diz o que causou (ver item 32, alternativa A).
- Compras de carta ficam de fora (só tocam o som), então não dá para saber quantas cartas alguém comprou no turno.
- O limite de 60 eventos (`HISTORY_LIMIT` em `presentationTimeline.ts`) apaga o começo da partida bem rápido em Commander com quatro.

Alternativas (recomendado: A + B + C, e D junto com o item 32):

- [x] **A. Agrupar por turno**: um cabeçalho por turno ("Turno 5 · Ana"), com as jogadas dele embaixo; os turnos antigos ficam recolhidos e abrem com um toque.
- [x] **B. Juntar o que aconteceu junto**: a mágica e o que ela causou numa linha só ("Wrath of God (Ana) destruiu 7 permanentes"), com as cartas afetadas ao abrir a linha; o mesmo para o dano de combate e os gatilhos de morte em sequência.
- [x] **C. Mais detalhes por linha**: alvos, controlador, de onde a carta veio e para onde foi, compras ("Bruno comprou 2 cartas"), com miniatura da carta e toque para ampliar (como já acontece no nome da carta).
- [ ] **D. Causa da saída do campo**: é a alternativa A do item 32; vale fazer junto, porque o agrupamento de B depende dela.
- [x] **E. Guardar a partida inteira**: tirar ou aumentar bastante o limite de 60, já que o agrupamento deixa a lista curta.
- [ ] **F. Filtros**: só minhas jogadas, só de um oponente, só combate, só remoções.

Feito em 28/10/2026 (0.57.0): A + B + C + E. Decidido: o turno atual e o anterior ficam abertos, os mais antigos recolhidos; sem custo pago nem fase nas linhas; as compras de todos aparecem só com a quantidade. Sem mexer na ponte (D), a mesa liga à mágica o que acontece enquanto ela é o topo da pilha, logo antes de resolver (a remoção em massa já aparece como "Cólera de Deus: destruiu 4 permanentes"); o que morre depois, por ação de estado, continua numa linha à parte. Ficaram para depois: D (junto com o item 32) e F.

## 43. Várias fichas de uma vez

Quando uma mágica ou um gatilho cria várias fichas, elas entram no campo uma por uma, e a jogada demora. Com Hare Apparent, cada Hare novo cria uma ficha de Coelho para cada outro Hare: com 8 no campo, são 8 fichas, cada uma com a sua animação de entrada.

Página de teste: **Rajada de fichas** (`tests/fixtures/token-burst.html`, também na lista da área de admin). Ela monta o campo com N Hare Apparent e manda os eventos como a ponte manda: um `entered` por ficha, cada um com o quadro do campo naquele momento. O painel mede quanto a mesa leva para mostrar tudo.

Medido em 28/10/2026 (computador, movimento normal, 150 ms entre um estado da ponte e o próximo):

| Caso | Hares | Fichas | Tempo na mesa |
| --- | --- | --- | --- |
| Conjurar mais um | 2 | 2 | 3,4 s |
| Conjurar mais um | 4 | 4 | 4,1 s |
| Conjurar mais um | 8 | 8 | 5,5 s |
| Blink em todos | 3 | 6 | 2,9 s |
| Blink em todos | 5 | 20 | 3,9 s (pulou fichas) |

Causa: a fila de apresentação da mesa (`presentationTimeline.ts`) trata cada ficha como um evento `entered` próprio, de 340 ms (204 ms no modo rápido), e avança o quadro do campo uma ficha por vez. Quando a fila passa de 12 eventos, a mesa desiste, pula para os 4 últimos sem som, e as fichas do meio aparecem de repente. Então são dois defeitos: até 12 fichas fica lento, e acima disso a apresentação dá um salto.

Como resolver (na ordem em que eu faria):

- [x] **Juntar as entradas da mesma origem num movimento só**, como o mill (item 24) já faz: `entered` seguidos, do mesmo jogador e da mesma resolução (a ponte manda o `sourceName`/`stackId` de quem criou, como faz no mill), viram um evento com a lista de cartas. As fichas entram juntas, em cascata curta (60 a 110 ms entre elas, só as 8 primeiras voam e o resto chega com a última, como em `millTiming`). Com 8 fichas, a parte das fichas cai de ~2,7 s (8 × 340 ms) para ~1,4 s, o mesmo de moer 8.
- [x] **Fichas iguais entram empilhadas**: o campo já agrupa cartas iguais num monte com "×N"; a animação vai direto para esse monte, que cresce com um "+8", em vez de 8 cartas voando para o mesmo lugar.
- [x] **Histórico numa linha**: "Hare Apparent criou 8 fichas de Coelho", em vez de 8 linhas.
- [x] **A fila não pula fichas**: o limite de 12 eventos passa a contar os movimentos juntos, e não cada ficha, para a rajada não ser descartada no meio.
- [x] **Vários gatilhos seguidos (blink em todos)**: cada gatilho continua sendo um passo, com o aviso do gatilho, mas mais curto quando vários iguais resolvem em sequência (por exemplo, o segundo em diante sem o aviso de 1 s, ou um aviso só, "×5").
- [x] **Conferir o lado da ponte numa partida real**: se, com muitos gatilhos, a demora vem também da prioridade (o jogador ou a IA passando a cada gatilho), avaliar a passagem automática para gatilhos sem escolha. Feito em 15/11/2026 (`novidades-pendentes/pilha-rapida`, `forge-bridge/scripts/test-lifegain-stack.mjs`): numa cadeia de ganho de vida, cada item levava ~870 ms sem ninguém clicar (400 ms de pausa do Forge a cada passe automático, por jogador); com o `YIELD_SKIP_RESOLVE_DELAY` a cadeia inteira leva ~1,3 s. O que sobrava para o jogador eram as perguntas: "Lembrar esta ordem" na ordem dos gatilhos (7 telas viraram 2), "Sempre sim/não" nos opcionais e itens iguais juntos na galeria da pilha.
- [x] Leitor de tela: uma frase só, "8 fichas de Coelho entraram".
- [x] Laboratório de efeitos (item 18): incluir "criar N fichas" e conferir na página de rajada que as 8 fichas aparecem em até 1,5 s.

Decidido em 28/10/2026 (versão 0.61.0): a ponte manda, em cada `entered` que acontece enquanto algo resolve, o `stackId` e o `sourceName` do que está resolvendo. A mesa junta os `entered` seguidos do mesmo jogador, vindos do mesmo lugar e com o mesmo `stackId` (fichas, Living Death, blink em massa); sem `stackId`, cada entrada continua sendo um passo. O movimento junto usa `entryTiming` (até 8 voos, 60 a 110 ms entre eles, 420 ms de viagem): 8 fichas levam ~1 s. As cartas do monte ficam escondidas até a ficha pousar, e o monte mostra "+N". No blink, a saída para o exílio some da apresentação quando a volta vem no mesmo pacote (o histórico continua com ela). Gatilhos iguais seguidos (mesmo jogador e nome): do segundo em diante o aviso é de 400 ms (e o balão, de 1,4 s), as resoluções da sequência têm 180 ms e as fichas dela usam o ritmo rápido; esses passos curtos não contam no limite de 12 da fila. O histórico diz "criou 8 fichas de Rabbit" quando as fichas vêm de uma mágica ou gatilho.

Medido depois (mesmas condições): conjurar com 2, 4 e 8 Hares: 3,4 s, 3,7 s e 3,8 s; blink em 3 Hares (6 fichas): 4,0 s; blink em 5 (20 fichas): 6,7 s, sem pular nenhuma. Ficou aberto o lado da ponte numa partida real (a prioridade entre os gatilhos).

## 66. Avaliar um banco Postgres

Hoje o servidor guarda tudo em arquivos (`MatchHistory` em `.jsonl` por mês, `FeedbackStore` com um índice `.jsonl` e um `.json.gz` por relato, `Accounts` com um arquivo por conta e as sessões em `sessoes.json`), e os próprios comentários dizem "sem banco de dados: o volume esperado é pequeno". Avaliar quando um Postgres passa a compensar e o que migrar.

Onde ele ajudaria:
- **Números por jogador (item 65)**: contas por deck, formato, oponente e período viram consultas, em vez de ler todos os meses de `.jsonl` a cada pedido.
- **Contas e sessões**: atualizar um deck ou uma sessão sem regravar o arquivo da conta inteiro, com transação e sem risco de duas gravações se atropelarem.
- **Relatos e admin**: filtros e buscas (por apelido, estado, versão, período) direto no banco, sem carregar o índice todo.
- **Vários servidores**: se um dia houver mais de uma instância do servidor, os arquivos locais deixam de servir; o banco é o lugar comum.
- **Cópia de segurança**: um `pg_dump` no lugar de copiar pastas, e restauração mais simples.

O que custa:
- Mais um serviço no `docker-compose.yml` (memória, atualização, backup) e uma dependência nova no servidor (driver JDBC, pool de conexões, migrações de esquema).
- Testes passam a precisar de um banco (ou de um banco em memória compatível).
- Os arquivos de hoje são fáceis de ler e de apagar à mão; o banco pede ferramenta.

- [ ] Medir o volume atual: partidas por mês, tamanho do histórico, número de contas e de relatos, tempo das leituras da área de admin.
- [ ] Definir os gatilhos para migrar, por exemplo: o item 65 em andamento, mais de N contas, leituras do admin acima de X ms, ou a necessidade de mais de uma instância.
- [ ] Desenhar o esquema mínimo (contas, sessões, decks, partidas e assentos, relatos) e uma camada de acesso que permita trocar arquivo por banco sem mexer no resto.
- [ ] Plano de migração: importar os `.jsonl` e os arquivos de conta, rodar os dois em paralelo um tempo, conferir, e só então desligar os arquivos. Os relatos grandes (`.json.gz`) podem continuar em arquivo, com o índice no banco.
- [ ] Backup e restauração testados antes de virar a chave.

A decidir: se o primeiro passo é só o histórico de partidas (para o item 65) ou tudo de uma vez; e onde o banco roda (no mesmo servidor, num container, ou um serviço gerenciado).

## 89. Avisar por que não deu para conjurar ou ativar

Cartas que proíbem conjurar mágicas ou ativar habilidades (por exemplo **Myrel, Escudo de Argivo**: "Durante o seu turno, seus oponentes não podem conjurar mágicas nem ativar habilidades de artefatos, criaturas ou encantamentos") já funcionam: o Forge não deixa a jogada acontecer. Mas quem tenta jogar não recebe nenhum retorno: clica (ou arrasta) a carta e nada acontece, sem saber por quê.

- [x] Quando a tentativa de conjurar uma mágica ou ativar uma habilidade for recusada, mostrar um alerta na mesa explicando o motivo, citando a carta que impede ("Myrel, Escudo de Argivo impede que você conjure mágicas durante o turno de Ana.").
- [x] Descobrir no servidor por que a jogada foi recusada: as restrições estáticas do Forge (`CantBeCast`, `CantBeActivated` e parecidas) e a carta de onde vêm; mandar para a mesa o motivo e a carta junto com a recusa.
- [x] Cobrir também as recusas comuns que hoje ficam mudas, quando o motivo for conhecido: momento errado (feitiço fora da fase principal ou com a pilha cheia) e terreno do turno já jogado.
- [ ] Mana insuficiente e falta de alvo válido: hoje o Forge entra no pagamento ou na escolha de alvos, então o clique não fica mudo; ver se vale avisar antes.
- [x] O alerta some sozinho e não bloqueia a mesa; tocar no nome da carta que impede mostra a carta.
- [x] Texto em português, para o jogador, sem citar o Forge.
- [x] Cenário pronto no Laboratório com Myrel em jogo, para conferir o alerta à mão.

Feito na 0.125.0 (decidido em 04/11/2026: só depois da tentativa, no aviso com miniatura que o ataque recusado já usava). O servidor (`PlayRefusal`) explica o clique numa carta que o Forge não deixaria jogar e também o caso em que o Forge oferece a mágica mas uma carta como a Myrel a proíbe depois. No campo, só fala de cartas com habilidade ativada; clicar numa criatura sem habilidade continua sem aviso.

## 90. Carta de dupla face modal: conjurar a mágica depois de já ter jogado o terreno do turno

Cartas de dupla face modal com uma face de mágica e outra de terreno (por exemplo, as das coleções de Zendikar Rising e Kaldheim) não podem ser conjuradas como mágica depois que você já jogou um terreno no turno: clicar ou arrastar a carta não faz nada. Pela regra, a face de mágica continua podendo ser conjurada normalmente; só a face de terreno fica bloqueada até o próximo turno.

- [ ] Reproduzir numa mesa montada: carta de dupla face modal na mão, terreno já jogado no turno e mana para pagar a face de mágica.
- [ ] Descobrir onde a jogada se perde: se a mesa trata a carta como terreno (pela face da frente) e tenta jogá-la como terreno, se o servidor deixa a carta fora das jogadas possíveis quando o terreno do turno já foi usado, ou se a escolha da face nem chega a ser oferecida.
- [ ] Com o terreno do turno já usado, a carta continua jogável e vai direto para a face de mágica, sem perguntar a face; com o terreno ainda livre, continua a escolha entre as duas faces.
- [ ] Conferir clicando e arrastando a carta, e também com a carta virada na mão mostrando a face de terreno.
- [ ] Item em `### Corrigido` no CHANGELOG e cenário pronto no Laboratório com a carta na mão e um terreno já jogado.

Investigado em 04/11/2026, sem reproduzir: no motor e no servidor de verdade, com o terreno do turno já jogado, a face de mágica continua jogável (Kazandu Mammoth, Bala Ged Recovery com alvo no cemitério), e a mesa manda o clique normalmente. Falta saber qual carta e em que situação aconteceu. Desde a 0.125.0, uma jogada recusada mostra o motivo (item 89), o que deve ajudar a descobrir.

## 104. Página de apresentação com SEO

Hoje quem chega ao site cai direto na tela do jogo, que é feita para quem já joga e não diz a quem procura no Google o que a Mesa de Duelo é. Uma página de apresentação (promopage) serve para divulgar e para os buscadores indexarem.

- [x] Página própria (por exemplo, `/sobre` ou a raiz para quem chega de fora) que explica em poucas telas o que é a mesa: jogar Magic no navegador, contra o computador ou com amigos, Commander, decks prontos, sem instalar; com prints da mesa e um botão **Jogar agora** que leva ao jogo.
- [x] HTML pronto no servidor (gerado no build, sem depender de JavaScript para o conteúdo), com `<title>`, `meta description`, títulos `h1`/`h2` com as palavras que as pessoas buscam ("jogar Magic online", "Commander online grátis", "mesa de Magic no navegador"), textos alternativos nas imagens e `lang="pt-BR"`.
- [x] Open Graph e Twitter Card (título, descrição, imagem) para o link ficar bonito no WhatsApp e nas redes; dados estruturados (`schema.org`, tipo `WebApplication`/`VideoGame`) e URL canônica.
- [x] `robots.txt` e `sitemap.xml` com as páginas públicas (apresentação, Novidades em imagens, Salas, privacidade), fora a área de admin e as páginas de teste.
- [x] Desempenho de página leve: imagens em WebP de 1600 px, a primeira pré-carregada e as outras só quando aparecem, fontes com `display=swap` e nenhum JavaScript.
- [ ] Conferência no Lighthouse (SEO e desempenho) e no Google Search Console, depois de publicar.
- [x] Decidir antes de fazer: se a raiz continua sendo o jogo (e a apresentação fica em outra rota) ou se a raiz vira a apresentação para quem não tem decks nem partida em andamento; o texto e os prints da página.

Parte feita na 0.141.0 (decidido em 06/11/2026): a apresentação fica em `/sobre` (`sobre.html`, só HTML e CSS) e a raiz continua sendo o jogo; link no rodapé da tela inicial. Falta conferir no Lighthouse e cadastrar o site e o `sitemap.xml` no Google Search Console, depois de publicar.

## 106. SEO e desempenho das páginas públicas (Lighthouse e PageSpeed)

Medição local do Lighthouse em 06/11/2026, no build (`npx vite preview`), perfil de celular:

| Página | Desempenho | Acessibilidade | Boas práticas | SEO |
|---|---|---|---|---|
| `/sobre` (celular e computador) | 100 | 100 | 100 | 100 |
| `/` (o jogo) | 76 | 100 | 96 | 91 |
| `/novidades.html` | 87 | 100 | 100 | 92 |
| `/salas.html` | 97 | 100 | 96 | 100 |

Itens em ordem de ganho por esforço. Os quatro primeiros são rápidos e de baixo risco.

- [ ] nginx: ligar `gzip` (HTML, CSS, JS, JSON, XML, SVG, `text/plain`) e cache longo para as imagens de `/sobre/` e `/novidades/` (`expires` de alguns meses; elas não mudam de nome, então não dá para usar `immutable`). Vale para todas as páginas; o Lighthouse local não mede.
- [ ] Imagens no tamanho certo: gerar versões de 800 px das imagens da `/sobre` e servir com `srcset`/`sizes` (o Lighthouse aponta de 325 a 470 KB de sobra no celular), com `imagesrcset` no preload da primeira.
- [ ] Novidades em imagens: `meta description`; a primeira imagem sem `loading="lazy"` (é o maior elemento da tela); `width` e `height` em todas as imagens, que hoje fazem a página pular (CLS 0,156); e o mesmo `srcset` (690 KB de sobra).
- [ ] Indexação: páginas que não existem respondem 200 com a tela do jogo (o Google pode tratá-las como "soft 404"; responder 404 para endereços que não são do app); `<noscript>` no `/` com um texto curto e o link para a `/sobre`; `lastmod` no `sitemap.xml`.
- [ ] Fontes sem bloquear a primeira pintura: servir Inter e Outfit (woff2, só os pesos usados) do nosso servidor, com `preload` e `font-display: swap`, em vez do CSS do Google Fonts (290 a 850 ms de bloqueio). Conferir o aviso de créditos do rodapé e a política de privacidade, que citam o Google Fonts.
- [ ] Página do jogo (`/`): imagens fora do WebP (cerca de 2,2 MB economizáveis), peso total de quase 8 MB, erros no console, links que o buscador não segue (botões que fingem ser link), árvore da página com 6.111 elementos, JavaScript e CSS sem uso na primeira tela (208 KB e 69 KB) e nomes acessíveis diferentes do texto visível. É o trabalho mais longo; para o buscador, a porta de entrada é a `/sobre`.
- [ ] Depois de publicar: cadastrar o site e o `sitemap.xml` no Google Search Console e no Bing Webmaster Tools, e rodar o PageSpeed Insights no endereço real (é onde gzip, cache e CDN aparecem). Junto com o último item pendente do 104.

## 107. Sons mais leves no aplicativo instalado

Os sons do pacote clássico (`public/audio/*.wav`, 32 arquivos) são guardados pelo service worker na instalação e somam cerca de 2,5 MB dos 5,1 MB que o aplicativo baixa (conferido na 0.141.6); os outros pacotes, em `public/audio/<pacote>/`, também são WAV. Em Opus ou MP3 ficariam com perto de um décimo do tamanho, sem diferença que se ouça na mesa.

- [ ] Converter os sons para Opus (`.webm`/`.ogg`) e MP3 (para o Safari antigo), mantendo o volume e o corte de cada um; guardar os originais fora de `public/` para reconverter.
- [ ] `src/ui/audio.ts`: escolher o formato que o navegador toca (`canPlayType`) e trocar os nomes dos arquivos.
- [ ] `vite.config.ts`: as extensões novas no `globPatterns` do service worker (hoje `wav`) e na regra dos pacotes temáticos.
- [ ] Conferir no celular que nenhum som ficou atrasado ou cortado, e medir o tamanho do que o aplicativo baixa antes e depois.

## 113. Combos infinitos e loops, do jogador e do computador

Pedido em 08/11/2026. Hoje nada na mesa nem no servidor trata loop: um loop obrigatório deixa o servidor girando e a sala travada, um combo infinito opcional precisa ser clicado volta por volta, e o computador às vezes repete a mesma jogada centenas de vezes, enchendo o Registro e a fila de animações. São três casos, com respostas diferentes.

**Loop obrigatório (ninguém consegue parar).** Pela regra 104.4b, a partida empata.

- [ ] Conferir se o Forge já tem alguma trava de loop ou de pilha (para não duplicar).
- [ ] Vigia no servidor: conta resoluções e gatilhos desde a última decisão de verdade de algum jogador; passando de um limite (por exemplo, 300 sem ninguém escolher nada, ou o mesmo estado da mesa repetido), encerra o jogo como empate. Numa série, o jogo seguinte segue normal.
- [ ] Mesa: o motivo na tela de fim e no Registro ("Loop sem fim que ninguém pode parar: empate.").
- [ ] Teste do servidor com um loop obrigatório montado e cenário no Laboratório.

**Computador repetindo jogadas.**

- [ ] Teto por turno: depois de N ações iguais no mesmo turno (ou X segundos de turno), o servidor faz o computador passar a prioridade.
- [ ] Registro agrupando repetições ("Ativou Ashnod's Altar ×150"), junto com o item 36.
- [ ] Animações aceleradas ou puladas quando a fila passa de um tamanho, com aviso "O computador está repetindo uma jogada…" e um botão para acelerar.

**Combo infinito opcional de um jogador.** A regra permite o atalho: mostrar o loop, dizer quantas vezes repete, e os oponentes aceitam ou dizem em qual volta querem responder.

- [ ] A. "Tenho um combo infinito": abre uma votação (aproveitando a de pular a vez, `SkipVote`) em que os oponentes respondem "Concedo" ou "Quero ver jogado".
- [ ] C. Aliviar o clique: "Repetir esta ativação" com contador, e escolhas repetidas lembradas (como o "Usar a mesma escolha" da ordem dos efeitos).
- [ ] B. (só se A e C não bastarem) Repetir N vezes a sequência gravada de uma volta, com cada oponente podendo parar numa volta específica para responder. Difícil no Forge: cada volta pode pedir alvos e escolhas diferentes, e a legalidade precisa ser conferida a cada uma.

Ordem sugerida: vigia do loop obrigatório, depois o teto do computador com Registro e animações, depois a votação do combo (A) e o alívio do clique (C).

- [ ] Decidir antes de fazer: loop obrigatório com empate automático (recomendado, não depende de ninguém responder) ou perguntando à mesa; combo de jogador só com a votação (A) ou já com o "Repetir N vezes" (B); quando o computador bate o teto, só passar a prioridade ou também avisar a mesa (recomendado avisar, para quem assiste entender a pausa); os limites (quantas resoluções, quantas ações iguais).

## 114. Melhorar o desempenho em aparelhos fracos

> Os efeitos em WebGL do item 125 (`docs/spec-mesa-webgl.md`) cumprem parte da medição daqui, e a opção "leves" de lá é a mesma do "Modo leve" daqui: uma opção só, "Efeitos: completos / leves" (decidido em 13/11/2026).

Pedido em 08/11/2026. Em celulares e computadores mais simples a mesa pesa: muitas cartas no campo, combates grandes, desfoques (`backdrop-filter` em 15 regras de CSS), brilhos, sombras e animações de dano e de cartas voando. Hoje a mesa só respeita o "reduzir movimento" do sistema (`prefers-reduced-motion`); não há uma opção própria nem detecção de aparelho fraco. Itens 7 e 8 já pediam "conferir desempenho no celular"; este junta tudo.

**Medir primeiro.**

- [ ] Partida de referência gravada (Commander com 4 jogadores, mesa cheia, combate grande) para repetir sempre igual na página de repetição.
- [ ] Medir no Chrome com a CPU 4× e 6× mais lenta e num celular de entrada de verdade: quadros por segundo, tarefas longas, tempo de cada `state` até a mesa pintar, memória e tamanho da árvore da página (o Lighthouse contou 6.111 elementos, item 106). A parte dos efeitos (quadros longos, tarefas longas e bloqueio com a CPU 1×, 4× e 6×, nas cenas de dano, voos e campo cheio) foi medida em 13/11/2026 pelo item 125 (`scripts/medir-efeitos.mjs`, números em `docs/spec-mesa-webgl.md`); faltam o tempo de cada `state` até pintar, a memória e o celular de verdade.
- [ ] Lista dos maiores culpados, em ordem, antes de mexer.

**Mesa mais leve (sem mudar o que se vê).**

- [ ] Atualizar só o que mudou a cada `state`, em vez de redesenhar zonas inteiras (ou casar com o item 20, Preact).
- [ ] Cartas fora da tela e zonas fechadas sem montar elementos; imagens das cartas no tamanho em que aparecem (miniatura no campo, grande só no zoom), com `decoding="async"`.
- [ ] Animações só com `transform` e `opacity`; nada animando `box-shadow`, `filter` ou tamanho; `will-change` só durante a animação.
- [x] Fila de animações com limite: quando acumula (combate grande, muitos gatilhos), acelerar ou pular para o fim. Feito em 14/11/2026 (`novidades-pendentes/animacoes-sem-pular`): os passos encurtam com a fila crescendo (`presentationPace`, até 35% do tempo, nunca abaixo de 200 ms) e só uma fila de mais de 60 passos (loop do computador) pula para o fim; a sua decisão espera a fila acabar (`holdDecision`).

**Modo leve.**

- [x] Animações que ficam rodando com a mesa parada só com opacidade e `transform` (14/11/2026, fase 3b do item 125): com o campo cheio e 20 fichas enjoadas, o trabalho de desenho da mesa parada caiu de cerca de 1.000 ms para 135 ms a cada 3 s. Regra para as próximas: animação infinita não mexe em `box-shadow`, `filter`, `border-color`, `background`, grupo de dentro de SVG nem nas propriedades soltas `scale`/`translate`/`rotate`.
- [ ] Opção "Modo leve" nas Opções: sem desfoque (fundo escuro chapado), sem brilhos e sombras animadas, sem tremor nem efeitos de dano, animações curtas, arte em resolução menor.
- [ ] Ligado sozinho na primeira vez em aparelho fraco (`navigator.deviceMemory`, `hardwareConcurrency`, ou quadros lentos medidos nos primeiros segundos), com aviso e como desligar; também quando o sistema pede para reduzir movimento.
- [ ] Item no CHANGELOG e prints em Novidades em imagens (mesa normal e no modo leve).

- [ ] Decidir antes de fazer: se o modo leve liga sozinho ou só sugere ("A mesa está lenta neste aparelho. Ligar o modo leve?"); o que ele desliga; qual celular de entrada usar como referência.

## 120. Testar Shorikai, Genesis Engine: habilidade e Tripular

Pedido em 11/11/2026. Shorikai, Motor da Gênese é veículo e comandante; conferir numa partida de verdade, e no Laboratório, as duas partes dela.

- [x] Habilidade ({1}, {T}): compra duas, descarta uma (a janela de descartar aparece certa) e cria a ficha Piloto 1/1 incolor, com a imagem da ficha e o texto "tripula Veículos como se o seu poder fosse 2 pontos maior".
- [x] Tripular 8: escolher criaturas com poder total 8 ou mais vira a Shorikai criatura artefato 8/8 até o fim do turno; o Piloto conta como 3; não deixa confirmar com menos de 8.
- [ ] A Shorikai tripulada ataca e bloqueia, e volta a ser só veículo no fim do turno.
- [ ] Como comandante: conjurar da zona de comando (com o imposto) e o dano de comandante contar quando ela ataca tripulada.
- [x] O que não funcionar vira correção no CHANGELOG com cenário no Laboratório; o que funcionar, um cenário pronto para conferir.

Conferido em 11/11/2026 (`forge-bridge/scripts/test-crew.mjs` e o cenário "Shorikai: habilidade e Tripular 8"): a habilidade e o Tripular funcionavam, mas o OK do Tripular ficava ligado com qualquer poder e, abaixo de 8, desistia em silêncio, e a contagem vinha em inglês ("Crewing"); corrigido na 0.157.1. Falta a parte de comandante, que o Laboratório não monta (não tem zona de comando): conferir numa sala de Commander de verdade.

## 124. Bots mais rápidos com a mesa cheia

Pedido em 13/11/2026. No Commander com 4, cada turno de bot leva em mediana ~2,3 s, e com o campo cheio 12 s (40
permanentes na mesa), 27 s (100) e 65 s (160). Estudo completo, números e como medir de novo em
`docs/velocidade-bots-2026-11-13.md` (sonda `AiSpeedProbe`, `scripts/medir-apresentacao.mjs`, `scripts/medir-desenho.mjs`).
Causas: a pausa do Forge quando o humano passa sozinho (200 ms por fase, 400 ms por item da pilha), o Monte Carlo da IA na
força máxima de computador de mesa (até 6 s por turno de cada bot), um trecho do servidor com custo quadrático no tamanho
do campo (`VisibleEvents.prevented()`), a IA e as regras do Forge com muitas cartas, e a mesa redesenhando tudo a cada
estado.

**Meta (combinada em 13/11/2026; o item só fecha quando a sonda mostrar isto, na mesma máquina em que o estudo foi medido):**

- Partida normal (`AiSpeedProbe#realSession`, Commander com 1 humano e 3 bots, 16 turnos, as duas mesas): turno de bot com mediana de até **1 s** (hoje 2,3 s).
- Campo cheio com 100 permanentes na mesa (`AiSpeedProbe#boardSize -Dmesa.campo=25`): mediana de até **5 s** (hoje 27 s). Pela conta do estudo, só a parte 1 e a força da IA não bastam: vai precisar do teto de tempo do turno do bot (decisão C).
- Sem a mesa pular jogadas: na simulação da fila (`scripts/medir-apresentacao.mjs`, modo normal) no máximo 1 vez por partida em que a fila passa do limite e pula para o fim (hoje 1–3; sem a pausa e sem Monte Carlo, sem mexer na mesa, seria 7–9).
- Medir antes e depois de cada parte e anotar os números aqui.

As decisões A, B e C (no fim do item) são perguntadas ao usuário, com as alternativas e a recomendação, quando o plano for executado, antes das partes 2 e 3.

**1. Servidor sem custo quadrático (sem decisão pendente).**

- [ ] `VisibleEvents.prevented()`: juntar uma vez por evento os escudos de prevenção da partida, em vez de chamar `getPreventNextDamageTotalShields()` por permanente (cada chamada percorre todas as cartas da partida). Mesmo resultado na mesa.
- [ ] Teste do servidor de que o dano prevenido continua saindo igual (escudo em jogador e em criatura, gasto em parte e por inteiro), e medir de novo com `AiSpeedProbe#boardSize` (esperado: ~20% a menos com 100–160 permanentes).
- [ ] Conferir se o log em INFO do Forge (`ProtocolGuiGame: Sending batch...`, `DeltaSyncManager`) vai para o log de produção e, se for, baixar o nível.

**2. Ritmo: o servidor não dorme, a mesa segura (depende da decisão A).**

- [ ] Ligar `YIELD_SKIP_PHASE_DELAY` (no `WebGuiGame.openView`, ao lado do `YIELD_SKIP_RESOLVE_DELAY`), para o Forge não dormir 200 ms por fase quando o humano passa sozinho. O `YIELD_SKIP_RESOLVE_DELAY` (400 ms por item da pilha) foi ligado em 15/11/2026 (`novidades-pendentes/pilha-rapida`), pedido para as pilhas longas de ganho de vida; a decisão A segue aberta só para a pausa das fases.
- [x] Na mesa, a fila de animações acompanhar sem pular jogadas: com a fila crescendo, encurtar os passos (como o "Rápido sem resposta") antes de chegar ao limite de 12, e só pular para o fim em último caso. Feito em 14/11/2026 (o limite passou a 60, para o loop do computador; ver o item 114). Casa com o item de fila de animações do 114 e com as animações do computador repetindo jogadas do 113.
- [ ] Medir com `-Dmesa.semPausa=true` e `scripts/medir-apresentacao.mjs` que a mesa mostra as jogadas (quase) todas e termina perto do servidor.

**3. Força da IA (depende da decisão B).**

- [ ] Escolher o modo do Monte Carlo por estilo do computador (`AiStyle`, S12): por exemplo, equilibrado/cauteloso/agressivo no modo de celular do Forge (até 600 ms por decisão e 2,5 s por turno) e um estilo "forte" na força máxima. O `HostedMatch` decide pela tela (`GuiBase.isMobile()`), então a ponte precisa acertar o `Game` depois de criado (`AI_FLAT_MONTE_CARLO_MAX`/`_LITE`) ou um override por jogador (`flatMcMaxOverride` do `AiController`).
- [ ] Com o campo cheio, um teto para o turno do bot (tempo de IA por turno), para nenhum turno passar de alguns segundos; junto com o teto por turno do item 113.
- [ ] Item nas novidades se o jogador perceber (bots mais rápidos, estilo novo) e, se mudar a lista de estilos, print do menu.

**4. Mesa com campo cheio.**

- [ ] Os itens "Atualizar só o que mudou a cada `state`" e "Cartas fora da tela... sem montar elementos" do 114, medidos com `scripts/medir-desenho.mjs` (hoje: 9 ms com o campo vazio, ~55 ms com 100–160 permanentes, ~80 ms com 240, num computador rápido).

- [ ] Decidir antes de fazer: (A) a pausa do Forge: tirar do servidor e deixar o ritmo com a fila da mesa (recomendado: a mesa já tem fila e modo rápido, e o servidor deixa de perder ~0,8 s por turno de bot e muito mais com campo cheio), só encurtar, ou manter; (B) o Monte Carlo: modo de celular nos estilos atuais e a força máxima num estilo à parte (recomendado), manter a força máxima para todos, ou desligar (bots mais fracos); (C) o teto de tempo do turno do bot com campo cheio, e de quanto.

## 125. Efeitos da mesa em WebGL

Pedido em 13/11/2026. Uma camada WebGL (PixiJS v8) por cima da mesa, só para os efeitos (partículas, luz, ondas, rastros e,
depois, as cartas em voo), com as cartas, os menus e os textos no DOM como hoje. A opção "Efeitos: completos / leves" em
Opções → Aparência volta aos efeitos de hoje em CSS. Spec completa, com decisões, critérios de sucesso, o que já foi
descoberto e o plano de cada fase: `docs/spec-mesa-webgl.md`. Se sobrepõe ao item 114 (medição e "Modo leve").

- [x] Decidir antes da fase 1: uma opção só ("Efeitos: completos / leves", em que "leves" é o modo leve do 114) ou duas opções separadas. Decidido em 13/11/2026: uma opção só.
- [x] Fase 0: medir os efeitos de hoje (`scripts/medir-efeitos.mjs`, CPU 1×, 4× e 6×) e fixar os números dos critérios de sucesso. Feita em 13/11/2026: números em "Medições" na spec.
- [x] Fase 1: a camada GPU (carregada só na partida), a opção para o jogador e a troca automática para leves, sem efeito novo. Feita em 13/11/2026 (`novidades-pendentes/efeitos-webgl-fase-1`).
- [ ] Fase 2: dano e projétil, pouso, estilhaços e ultimate na GPU; medir de novo e conferir num celular de entrada. Os quatro efeitos e a medição sem tela estão feitos (13/11/2026, `novidades-pendentes/efeitos-webgl-fase-2`); falta conferir num celular de entrada de verdade (critério 8) antes de publicar.
- [x] Fase 2b: efeitos de movimento na GPU (exilar, blink, sacrificar, rastros do voo, ataque, habilidades, ninjutsu, virar), com a carta ainda no DOM. Feita em 13/11/2026 (`novidades-pendentes/efeitos-webgl-movimentos`).
- [x] Fase 3: cartas em voo na GPU (textura da imagem do Scryfall, perspectiva, sombra). Feita em 13/11/2026 (`novidades-pendentes/efeitos-webgl-fase-3`), com os estilos Arte e texto e Arena voando com a imagem completa (decidido nesse dia); versos e compra continuam em CSS. Medida em 14/11/2026 (números na spec): voos mais leves na GPU, campo cheio empatado, pacote com 145 KB gzip; a cena de dano ficou mais pesada na GPU com a CPU 4× e 6× (critério 3), com o voo da carta como suspeito.
- [ ] Conferir num celular de entrada de verdade (critério 8, junto com a fase 2), incluindo a cena de dano: decidido em 14/11/2026 que é o celular quem diz se o voo da carta na GPU precisa ficar mais leve. Sem aparelho disponível nesse dia. Em 15/11/2026, ainda sem aparelho: no celular, conferir também a mesa viva parada (critério 9) e a cena de dano, que ficou mais pesada desde a fase 3 mesmo sem a mesa viva (ver a medição de 15/11 na spec).
- [x] Fase 3b: o que sobrou em CSS. Feita em 14/11/2026 (detalhes na spec): animações de estado refeitas para a placa de vídeo animar sozinha (a mesa parada com o campo cheio gastava um terço da CPU; caiu para cerca de um sétimo), compra e mão inicial de costas na GPU com a sua carta virando no ar, mana em orbes, moeda, dado, fim da partida, dobra, vida, marcadores e os brilhos de chegada. Ficaram em CSS: moer, embaralhar, vidência, shuriken, sorteio de quem começa e as setas de alvo (foram para a GPU em 14/11/2026, item 131).
- [x] Mesa viva (14/11/2026, `novidades-pendentes/mesa-viva`): um shader por baixo das cartas, com a luz no campo de quem joga, poeira, combate e vinheta da vida baixa, a 30 quadros por segundo em meia resolução (decidido nesse dia: contínua, junto com "Efeitos"; o critério 2 vale só para a camada dos efeitos, e entrou o critério 9). Medida com `scripts/medir-efeitos.mjs` em 15/11/2026 (critério 9, números na spec): passa na cena de dano; com a mesa parada e a CPU freada traz quadros longos, em parte pelo WebGL emulado na CPU. Falta o celular de entrada (abaixo).
- [x] Dado em 3D (16/11/2026, `novidades-pendentes/dado-3d`): o primeiro objeto em 3D de verdade na camada, dentro do PixiJS (malha e shader próprios, sem biblioteca nova), do d4 ao d20, também no sorteio de quem começa. Medido na cena `dados` (detalhes na spec): sem quadro longo com a CPU normal; com a 4×, dentro do ruído do WebGL emulado.
- [ ] Fase 4, só se os números pedirem depois do 114: o campo inteiro em WebGL (spec própria).

## 129. Torneios suíços dentro do sistema

Pedido em 14/11/2026. O objetivo final é a mesa organizar torneios com as partidas jogadas aqui mesmo: classificação automática, sorteio das rodadas e os pontos de quem vence registrados sozinhos. O primeiro passo saiu como ferramenta para torneios presenciais (`novidades-pendentes/torneios-suicos`): qualquer conta cria um torneio, inscreve jogadores pelo nome e lança os placares à mão; só o organizador mexe, e qualquer um com o link vê. A regra (sorteio sem revanche, bye, atrasados com derrota na 1ª rodada, desempates do Magic) fica no servidor (`Tournament.java`), pronta para ser reaproveitada. Decidido no mesmo dia: placar em jogos, atrasados até o sorteio da 2ª rodada, rodadas sugeridas pela quantidade de jogadores e editáveis, sem top 8.

- [x] Ferramenta para torneios presenciais: criar, inscrever, sortear, lançar placares, classificação e link público.
- [ ] Avaliar com os jogadores e decidir se segue para os torneios dentro do sistema.
- [ ] Inscrição pela conta (o jogador entra pelo link, em vez de o organizador digitar o nome).
- [ ] Sortear a rodada abrindo as salas das mesas, com o resultado da partida lançado sozinho no torneio.
- [x] Relógio da rodada (50 minutos editáveis, iniciar, pausar e ajustar, aviso dos 5 turnos extras, tela cheia para a TV). Feito em 14/11/2026 (`novidades-pendentes/torneios-relogio`).
- [ ] O que fazer com quem não aparece (derrota por atraso depois de alguns minutos do relógio).
- [ ] Top 8 eliminatório depois das rodadas suíças.
- [ ] Pontos acumulados de quem vence entre torneios (ranking de temporada).

## 131. Animações e imersão: próximos passos

Sugestões de 14/11/2026, depois da fila sem pular jogadas e da mesa viva (itens 114 e 125). Cada uma vira item próprio, ou decisão, quando for escolhida.

**Animações que não se perdem**

- [x] Mostrar quem está agindo durante a espera: enquanto a sua decisão espera a fila (`holdDecision`), um selo discreto "Mostrando a jogada do oponente…" no lugar dos botões, para a espera não parecer travamento. Feito em 14/11/2026: o botão diz "Mostrando a jogada de Ana…" (decidido nesse dia: com o nome), em dourado, respirando.
- [x] Ver a jogada de novo: tocar numa linha do Histórico repete aquela animação na mesa (a fila já guarda o quadro de cada jogada). Feito em 15/11/2026 (`novidades-pendentes/ver-jogada-de-novo`). Decidido nesse dia: um botão ▶ em cada linha (tocar no texto continua ampliando a carta), a mesa no quadro daquela jogada com a faixa "Repetindo" e o botão Parar, e o Histórico fechado durante a repetição, voltando aberto no mesmo ponto. Só com a fila parada; a sua decisão espera a repetição, como espera a fila.
- [ ] Resumo do turno do oponente: se a aba ficou escondida e a mesa alcançou o jogo em silêncio, um painel curto com as jogadas perdidas, em miniaturas.
- [ ] Ritmo por tipo de jogada: com a fila cheia, encurtar mais gatilhos e compras e manter inteiras mágicas, dano letal e ultimate (`presentationPace` hoje encurta tudo por igual).

**Imersão e ambientação**

- [x] Momentos de impacto: a mesa escurece e a câmera aproxima um pouco em ultimate, mágica grande e golpe letal; mítica e lendária entram com uma cena própria. Feito em 14/11/2026 (`novidades-pendentes/momentos-e-mesa-reagindo`). Decidido nesse dia: mágica de valor 6 ou mais, golpe que derruba um jogador, e cena para criatura ou planeswalker lendário (o estado não traz raridade; mítica pediria mudar o servidor). Regras em `impactRules.ts`, cena em `motionImpact.ts` e `gpuMoments.ts`.
- [ ] Som ambiente por mesa: um fundo bem baixo (vento, brasa, floresta) que combina com a superfície, com volume próprio em Som.
- [x] Mesa viva reagindo ao jogo: clarão breve no fundo quando uma mágica resolve, luz tremendo num golpe pesado, poeira acelerando no combate (valores novos no shader de `tableAmbience.ts`). Feito em 14/11/2026 (`novidades-pendentes/momentos-e-mesa-reagindo`).
- [x] Luz na cor do deck: tirar a cor média da arte do tapete, em vez da cor da capa, para cada deck ter a sua luz. Feito em 14/11/2026 (`novidades-pendentes/momentos-e-mesa-reagindo`). Sem tapete, fica a cor da capa.

**WebGL**

- [x] O que ainda anima em CSS na GPU: moer, embaralhar, vidência, shuriken, sorteio de quem começa e as setas de alvo (as setas com fluxo de energia são o ganho mais visível). Feito em 14/11/2026 (`novidades-pendentes/momentos-e-mesa-reagindo`). Decidido nesse dia: a seta nasce na GPU (um traço de luz até o alvo) e a seta parada continua em SVG, para a camada dos efeitos continuar parando.
- [x] Contador de FPS e ping na mesa (Opções › Aparência, `perfMeter.ts`), para medir a mesa cheia com os efeitos novos. Feito em 14/11/2026 (`novidades-pendentes/contador-fps-ping`); `perfMeter.fps()` já expõe a última medida.
- [x] Aliviar os efeitos sozinho com a mesa cheia e com FPS baixo (pedido em 14/11/2026). Feito em 15/11/2026 (`novidades-pendentes/efeitos-automaticos`): Efeitos: Automático (padrão) com o regulador de `effectsGovernor.ts`, em degraus (1 faíscas pela metade, 2 mesa viva e câmera paradas, 3 CSS). Decidido nesse dia: limites que protegem os efeitos (desce com 3 s abaixo de 30, sobe com 6 s acima de 50 animando), em silêncio, com o degrau no selo de FPS; trava dobrando quando a subida recai; mais de 40 permanentes seguram no degrau 1; letal e ultimate nunca perdem faíscas. Falta medir num celular de entrada se os limites estão bons.
- [x] Medir a mesa viva (critério 9 da `docs/spec-mesa-webgl.md`): `scripts/medir-efeitos.mjs` com e sem ela. Feito em 15/11/2026 (`?viva=0` e a cena `parada`; números na spec): a cena de dano passa; com a mesa parada e a CPU freada ela traz quadros longos (em parte pelo WebGL emulado na CPU). Falta o celular de entrada, no item 125.
- [ ] Brilho de raridade no voo: míticas e foils voando com um reflexo que corre pela carta, na textura que a fase 3 já carrega.

**Acabamento**

- [x] Tour no laboratório de efeitos: um botão que roda todos os efeitos em sequência, para conferir depois de cada mudança e tirar os prints das novidades. Feito em 14/11/2026 (seção "Momentos e mesa viva" do `effects-lab.html`).

## 134. Achar os efeitos mais pesados e desligá-los no degrau E1

Pedido em 15/11/2026. Hoje o degrau 1 do Efeitos: Automático (`src/ui/gpu/effectsGovernor.ts`, "E1" no selo de FPS) só corta as faíscas pela metade. Os outros efeitos seguem iguais até o degrau 2 (mesa viva e câmera paradas) e o 3 (efeitos leves). Se o que derruba os quadros é um efeito específico, cortar as faíscas não resolve, e a mesa desce mais um degrau à toa, perdendo efeitos leves junto com os pesados.

A ideia é medir quanto cada efeito custa e, no E1, desligar (ou trocar por uma versão simples) só os poucos mais caros, mantendo o resto.

- [ ] Medir cada efeito sozinho, com a mesa vazia e com a mesa cheia (cenário "Mesa cheia para medir FPS" do Laboratório), com a CPU freada (4× e 6×): tempo por quadro, quadros longos e memória da GPU. Usar `scripts/medir-efeitos.mjs` e os botões do laboratório de efeitos (`/efeitos`), incluindo as jogadas simuladas e os efeitos que ficam rodando (enjoo, proteção, alvo possível, voar, mesa viva, setas).
- [ ] Ranking dos efeitos por custo, numa tabela em `docs/spec-mesa-webgl.md`, separando o que pesa uma vez (destruir partindo a carta, portal do exílio, golpe letal, confete) do que pesa o tempo todo (animações contínuas por permanente, poeira, luz da mesa).
- [ ] Decidir quais saem no E1 (provavelmente os 3 a 5 mais caros) e o que cada um vira: desligado, versão simples em CSS ou com menos partículas. Golpe letal e ultimate continuam protegidos, como hoje.
- [ ] Ligar a lista ao regulador: o E1 passa a ser "faíscas pela metade + sem os efeitos pesados", e o E2 e o E3 continuam como estão.
- [ ] Conferir que o E1 novo segura a mesa cheia sem descer para o E2 com tanta frequência (medir de novo com o mesmo cenário) e que a troca de degrau não deixa efeito pela metade na tela.
- [ ] Mostrar no laboratório de efeitos quais efeitos cada degrau desliga, para conferir à mão.

## 135. Primeiro acesso mais leve

Pedido em 15/11/2026. No primeiro acesso, o service worker guarda o aplicativo inteiro: 133 arquivos, cerca de 3,3 MB (cerca de 1,25 MB se viessem comprimidos), medidos no build da 0.187.0. São 56 arquivos `.js` (2,4 MB), 18 `.css` (466 KB), 37 sons `.mp3` (380 KB), além de ícones e HTML. Os maiores:

| Arquivo | Tamanho | Com gzip | O que é |
|---|---|---|---|
| `decks-*.js` | 532 KB | 104 KB | os decks prontos (`shared/starter-decks.json`) dentro do código |
| `forgeTable-*.js` | 452 KB | 154 KB | a mesa de jogo |
| `changelog-*.js` | 377 KB | 121 KB | o `CHANGELOG.md` e o `docs/changelog-antigo.md` inteiros, para o painel Novidades |
| `forgeTable-*.css` | 219 KB | 43 KB | o visual da mesa |
| `main-*.js` | 174 KB | 52 KB | |
| pedaços do pixi.js | ~300 KB | ~90 KB | WebGL, WebGPU, Graphics e afins |

O nginx (`deploy/nginx.conf`) só comprime o `/api/cartas`: JS, CSS e HTML saem sem gzip, a não ser que o proxy do Coolify ou a Cloudflare comprimam no caminho. O objetivo é baixar menos no primeiro acesso, e baixar primeiro o que a tela inicial precisa, sem perder o jogo sem internet depois de instalado.

Itens em ordem de ganho por esforço:

- [ ] Medir no endereço real o que chega comprimido (`curl -sI -H 'Accept-Encoding: gzip, br'` num `.js` e num `.css`). Se não chega, ligar `gzip` (e `brotli`, se o nginx da imagem tiver) para HTML, CSS, JS, SVG e o manifesto; é o mesmo primeiro item do 106, fazer junto. Sozinho tira cerca de 2 MB.
- [ ] Novidades fora do código: o `changelog-*.js` vira um arquivo de texto (ou JSON) buscado só ao abrir o painel Novidades, com só as versões recentes no primeiro pedaço e as anteriores à 0.100.0 sob demanda. A versão mostrada na tela inicial continua vindo no código.
- [ ] Decks prontos fora do código: a lista leve (nome, cores, bracket, preço, capa) no código e as listas de cartas num JSON buscado ao escolher ou abrir um deck pronto, guardado pelo service worker em tempo de execução. Conferir a validação do computador e o tutorial, que usam os decks prontos.
- [ ] Mesa e pixi.js só quando a partida começa: conferir com o `vite build` o que a tela inicial importa de `forgeTable` e do pixi.js e, se algo vier sem precisar, trocar por `import()` dinâmico. O service worker continua guardando os dois, mas depois da tela inicial.
- [ ] Ordem do service worker: a tela inicial carrega primeiro e o resto do pacote (`globPatterns`) é guardado depois. Avaliar tirar do pacote o que só abre por clique e funciona bem buscado na hora (Torneios, Rever partida, Privacidade), passando para regra em tempo de execução, sem voltar ao problema da página que abria em branco sem internet (comentário do `rollupOptions` no `vite.config.ts`).
- [ ] CSS: medir quanto do `forgeTable-*.css` (219 KB) e do `style-*.css` não é usado na primeira tela (o Lighthouse do 106 apontou 69 KB) e separar o da mesa do da tela inicial, se valer.
- [ ] Medir antes e depois: total do precache (o `vite build` já mostra "precache N entries (X KiB)"), bytes transferidos no primeiro acesso pelo DevTools com rede "4G lenta" e o tempo até a tela inicial aparecer; anotar aqui. Um teste que falhe se o precache passar de um limite (por exemplo, o tamanho de depois mais 10%).

## 136. Jogar sem falar português

Pedido em 16/11/2026. Hoje a mesa inteira está em português: os textos estão escritos direto no código (mais de 3 mil, sem camada de tradução), o servidor liga o Forge em português para o processo todo (o `Localizer` do Forge é um só por processo) e uns 10 pontos da mesa leem o texto do Forge em português para decidir algo. As cartas já caem para o inglês quando não há tradução. O objetivo é que quem não fala português jogue do começo ao fim em inglês, sem o português perder nada, e com estrutura para outros idiomas depois. Levantamento, decisões e fases: `docs/spec-outros-idiomas.md`.

- [ ] Tomar as 8 decisões da spec (idiomas, como escolher, texto do Forge na partida, salas mistas, nomes dos decks prontos, novidades, prints e página de apresentação).
- [ ] Fase 0: camada de tradução (`t()`), `mesa:lang` nas preferências da conta, idioma na entrada da sala e o teste curto do idioma por jogador no servidor.
- [ ] Fase 1: telas fora da partida e cartas em inglês, escondidas atrás do `mesa:dev`.
- [ ] Fase 2: a partida (textos da mesa, os pontos que leem o texto do Forge, o servidor no idioma de cada jogador e os textos próprios do servidor).
- [ ] Fase 3: conteúdo (nomes dos decks prontos, Como jogar, Laboratório, Novidades e a página de apresentação do item 104).
- [ ] Fase 4: revisão do inglês por quem joga Magic, lançamento, contagem por idioma e regras novas no `CLAUDE.md` e no `/entregar`.

## 137. Ordem das animações ao entrar na partida

Pedido em 16/11/2026. As primeiras telas depois de tocar em Jogar têm animações ao mesmo tempo e elementos que atrapalham. Gravados nesse dia três vídeos da entrada (Commander contra o computador, com o relógio contado do clique em Jogar), em `~/Vídeos/mesa-entrada-na-partida/`: `4-jogadores-oponente-comeca.mp4`, `2-jogadores-empate-e-oponente-comeca.mp4` e `2-jogadores-voce-escolhe.mp4`. O jogador vai apontando o que mudar; cada item abaixo é um pedido dele.

- [x] Nenhuma carta voa por cima da tela dos dados. Hoje, quando o computador ganha o sorteio, as cartas de costas da mão inicial voam por cima da caixa dos dados enquanto eles rolam (vídeo de 4 jogadores, por volta de 0:01). A compra da mão inicial só começa depois que os dados param ou depois que quem começa é escolhido. Quando você ganha o sorteio, a mão já chega depois da escolha.
- [x] A mão inicial vai até a mão no campo. Ao tocar em Manter, a tela da mão inicial some de uma vez e a mesa aparece com o leque já em outro lugar, descendo até a mão (vídeo de 2 jogadores com empate, de 0:09.5 a 0:10.4). As cartas devem sair do lugar em que estavam na tela da mão inicial e ir, animadas, até a mão no campo.
  Feitos em 16/11/2026 (`novidades-pendentes/entrada-na-partida`). A compra espera o sorteio sair da mesa. Ao manter, a transição de CSS da mão termina na hora, e cada carta desliza do leque até a mão junto com a sua lupa. Também nesse dia: as lupas das cartas ainda a caminho não aparecem mais nos lugares vazios. Os efeitos da mesa começam a carregar no clique em Jogar, e o sorteio espera por eles (até 1,5 s) para rolar o dado em 3D; antes, a primeira rodada saía sempre chapada.
- [ ] Os dados ficam parados em "?" enquanto os efeitos carregam: cerca de 1,3 s no navegador de testes (WebGL na CPU). Conferir num aparelho de verdade; se a espera aparecer, sacudir os dados enquanto esperam ou encurtar o prazo.
- [ ] Vistos nos vídeos, ainda não pedidos: a mesa inteira pisca por um instante antes da caixa dos dados (0:00.5); o aviso "Segure uma carta para ver os detalhes" aparece em cima do sorteio; a caixa de ação continua com "Você quer manter a mão?" depois de manter e diz "Você está indo 2nd.".

## 138. Botões da caixa de decisão mais bem distribuídos

Pedido em 16/11/2026. Na caixa de decisão de um gatilho opcional ("Use a habilidade desencadeada de Quintessential Katana?"), os quatro botões ficam numa linha só, com larguras desiguais: Não e Sim numa linha, Sempre não e Sempre sim quebrados em duas, todos em forma de pílula muito alta, e o Sim maior que os outros. Fica apertado, os quatro parecem ter o mesmo peso e é fácil tocar num Sempre sem querer. Os botões são montados em `src/ui/actionPanel.ts` (`always(...)`).

- [ ] Escolher a distribuição (decidir com o jogador antes): Não e Sim como botões principais lado a lado, com Sempre não e Sempre sim menores numa linha de baixo; ou só Não e Sim, com uma caixa "Lembrar esta resposta" acima; ou os Sempre num menu ao lado de cada botão.
- [ ] Texto de cada botão numa linha só, botões da mesma linha com a mesma altura e largura parecida, sem o Sim engolir o espaço dos outros.
- [ ] Conferir na caixa de ação recolhida, no celular (largura estreita) e nas outras decisões que usam os mesmos botões (com Passar, sem os Sempre).

## 139. Alça de mover as janelas mais fácil de achar e de pegar

Pedido em 16/11/2026. Os avisos que se arrastam (a caixa de ação, a decisão no centro da mesa, o "Atacar quem?" e a barra de "Ver a mesa") têm uma alça de seis pontinhos dourados de 12px, meio apagada, numa faixa de 10px de altura acima do "Sua decisão". Ela passa despercebida, é difícil de acertar com o mouse e não diz que dá para mover; que dois cliques devolvem a janela ao lugar só aparece no texto que surge ao passar o mouse, que no celular não existe. Código em `src/ui/dragPanel.ts` e `src/ui/dragPanel.css`, ícone `DRAG_GRIP` em `src/ui/icons.ts`.

- [ ] Escolher o desenho (decidir com o jogador antes): uma barra (pílula) larga no topo, como a das folhas do celular; a faixa de cima inteira (com o "Sua decisão") como alça, com a mãozinha ao passar; ou os pontinhos maiores e mais visíveis ao passar o mouse.
- [ ] Área de pegar maior no mouse e no toque, sem empurrar os botões nem o texto da janela.
- [ ] Um jeito visível de devolver a janela ao lugar depois de movida (por exemplo, um botão pequeno que só aparece quando ela saiu do lugar), além dos dois cliques.
- [ ] Mesma alça e mesmo comportamento em todos os avisos que se arrastam; conferir no celular e com a caixa recolhida.
