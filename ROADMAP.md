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

A ideia é um cache que se forma **aos poucos, só com as imagens que alguém de fato pediu**: nada de baixar a coleção inteira de uma vez.

- [ ] Endpoint de imagem no nosso servidor (por exemplo `/img/{id-scryfall}/{tamanho}` no nginx ou na ponte): na primeira vez busca no Scryfall, guarda e devolve; nas seguintes, devolve a cópia guardada. Só aceita os tamanhos usados pela mesa (`small`, `normal`, `art_crop`) e ids no formato do Scryfall, para não virar um proxy aberto.
- [ ] CDN na frente desse endpoint (Cloudflare ou parecido), com cache longo (`Cache-Control: public, max-age=31536000, immutable`). A imagem só chega à CDN depois que alguém a pediu ao menos uma vez.
- [ ] Sem importação em massa: nenhum job de pré-carga nem varredura dos bulk data do Scryfall. O cache cresce só com o uso real.
- [ ] Respeitar o Scryfall: no máximo uma busca por imagem ainda não guardada, fila com limite de requisições por segundo, `User-Agent` identificado e reaproveitar a imagem já guardada mesmo se a busca falhar depois.
- [ ] No frontend, trocar `cards.scryfall.io` pelo endereço do cache, com volta automática para o Scryfall se o cache estiver fora do ar.
- [x] Dados das cartas (texto, tradução e endereços das imagens) guardados no IndexedDB em vez do localStorage, para não disputar espaço com os decks; o que estava no localStorage passa para lá sozinho.
- [x] No aparelho: regra de cache do service worker para as imagens (CacheFirst, com limite de quantidade e de idade), para quem já viu uma carta não baixar de novo nem pela CDN.
- [ ] Limpeza: limite de espaço no servidor, removendo as imagens menos usadas; métricas de acerto do cache e de buscas ao Scryfall no painel do Grafana.
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
- [ ] Métricas no Grafana: pedidos recusados por limite, por ponto, e alertas quando um IP for bloqueado com frequência.
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

## 37. Registrar partidas abandonadas como concedidas

O histórico de partidas da área de admin só grava a série que termina de verdade (o Forge dá a partida por encerrada). Levantamento feito em 27/10/2026:

- Quem sai da sala no meio, fecha a aba e não volta no prazo de reconexão, ou abandona a partida contra a IA, some do histórico: a partida só vira o contador "abandonada" nas métricas, sem jogadores, decks nem vencedor.
- Na sala em rede, sair já conta como conceder o jogo atual, e o oponente vê a partida encerrada; mas a série não chega a ser concluída, então nada é gravado.
- Com isso, as estatísticas por deck e por jogador contam só quem jogou até o fim, e quem costuma desistir de partidas perdidas não aparece.
- O botão "Desistir e voltar ao início" passa pelo mesmo caminho: numa partida de 1 jogo, ou no jogo que decide a série, ele encerra a série e a linha é gravada (motivo "desistência"); numa melhor de 3 antes do jogo decisivo, ou entre jogos, nada é gravado.

Alternativas (recomendado: A + B):

- [x] **A. Gravar como concessão**: ao encerrar uma partida abandonada, gravar a linha do histórico com os jogos já disputados, o jogo atual como derrota de quem saiu (motivo "concedeu") e a vitória da série para quem ficou.
- [x] **B. Marcar o jeito que acabou**: um campo novo na linha (concluída, concedida, abandonada por queda) para filtrar na área de admin e não misturar com as partidas jogadas até o fim.
- [x] **C. Abandono antes do primeiro turno**: não gravar nada quando ninguém chegou a jogar (mulligan, sala que nem começou), para não encher o histórico.
- [x] **D. Contra a IA**: gravar também as partidas abandonadas contra a IA, ou deixar só as salas em rede.

Decidido em 28/10/2026 e feito: a queda sem volta (ninguém voltou no prazo, ou quem ficou sai depois que o outro caiu) é gravada como "queda", com o jogo interrompido e sem vencedor da série; as abandonadas contra a IA também são gravadas; a partida que não chegou ao turno 1 não é gravada. Em Commander, a saída de um jogador entra só no fim da partida, como já acontecia. Na área de admin, a seção virou "Histórico", com selo "concedida" ou "queda" em cada linha e o filtro "Fim" (os totais seguem o filtro).

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
- [ ] **Conferir o lado da ponte numa partida real**: se, com muitos gatilhos, a demora vem também da prioridade (o jogador ou a IA passando a cada gatilho), avaliar a passagem automática para gatilhos sem escolha.
- [x] Leitor de tela: uma frase só, "8 fichas de Coelho entraram".
- [x] Laboratório de efeitos (item 18): incluir "criar N fichas" e conferir na página de rajada que as 8 fichas aparecem em até 1,5 s.

Decidido em 28/10/2026 (versão 0.61.0): a ponte manda, em cada `entered` que acontece enquanto algo resolve, o `stackId` e o `sourceName` do que está resolvendo. A mesa junta os `entered` seguidos do mesmo jogador, vindos do mesmo lugar e com o mesmo `stackId` (fichas, Living Death, blink em massa); sem `stackId`, cada entrada continua sendo um passo. O movimento junto usa `entryTiming` (até 8 voos, 60 a 110 ms entre eles, 420 ms de viagem): 8 fichas levam ~1 s. As cartas do monte ficam escondidas até a ficha pousar, e o monte mostra "+N". No blink, a saída para o exílio some da apresentação quando a volta vem no mesmo pacote (o histórico continua com ela). Gatilhos iguais seguidos (mesmo jogador e nome): do segundo em diante o aviso é de 400 ms (e o balão, de 1,4 s), as resoluções da sequência têm 180 ms e as fichas dela usam o ritmo rápido; esses passos curtos não contam no limite de 12 da fila. O histórico diz "criou 8 fichas de Rabbit" quando as fichas vêm de uma mágica ou gatilho.

Medido depois (mesmas condições): conjurar com 2, 4 e 8 Hares: 3,4 s, 3,7 s e 3,8 s; blink em 3 Hares (6 fichas): 4,0 s; blink em 5 (20 fichas): 6,7 s, sem pular nenhuma. Ficou aberto o lado da ponte numa partida real (a prioridade entre os gatilhos).

## 44. Entrar com Google e sincronizar Meus decks

O jogador entra com a conta Google e encontra os mesmos decks em qualquer aparelho. Se entrar num navegador que já tem decks, o jogo pergunta se junta esses decks à conta ou se usa só os da conta. A conta também guarda as preferências da mesa e o apelido. Login opcional, pelo cabeçalho.

Spec completa, com as decisões, a arquitetura, o protocolo de sincronia e as fases: [`docs/spec-login-google.md`](docs/spec-login-google.md).

- [x] Fase 1: conta na ponte (`/api/conta/`), botão Entrar com Google, One Tap, sair e apagar conta.
- [x] Fase 2: sincronizar Meus decks, com a pergunta ao entrar, a lixeira de 30 dias e o envio sem rede (0.63.0, junto com a fase 1).
- [x] Fase 3: preferências, apelido e foto (0.64.0).

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

## 88. Botões de exibição do campo dos oponentes só com o ícone

Na faixa de cada oponente, os botões que controlam o que se vê do campo (**Só este**/**Ver todos** e **Ocultar**) ocupam espaço com o texto ao lado do ícone, e com três ou quatro jogadores a faixa fica apertada.

- [x] Deixar só o ícone nesses botões (`seatControls` em `src/ui/forgeTable.ts`), com o texto no balão ao passar o mouse (`title`) e no `aria-label`, como já é hoje.
- [x] Manter a área de toque confortável no celular, mesmo sem o texto.
- [x] O estado ligado de **Só este** continua visível pelo ícone (aria-pressed), já que o texto "Ver todos" deixa de aparecer.

Decidido em 02/11/2026 (versão 0.120.0), itens 82 a 87:

- 82: o pedido de desfazer e a votação para pular o turno de quem caiu abrem no centro (`#fVote`, `src/ui/voteDialog.ts`) e bloqueiam a mesa até o voto, com o som de aviso e a vibração (`turnBuzz.nudge`); o foco começa em Aceitar/Sim. Depois do voto, volta a faixa do alto.
- 83: lápide no cemitério e portal no exílio, no canto de cima à esquerda (o oposto da contagem); o grimório ficou sem ícone.
- 84: dois botões por linha, nome numa linha só com reticências e o completo no balão (`title`).
- 85: o servidor sorteia uma de 8 cores por jogador na primeira partida da sessão (`Session.drawSleeves`, campo `sleeve` de cada jogador), sem repetir; a mesa tinge o verso pelas variáveis `--sleeve-*` da classe `sleeve-N`, e as cartas que voam copiam a cor do grimório de onde saem. Só sorteada, sem escolha nas opções.
- 86: o rasgo (`.warp-rift`) aparece na pilha ao conjurar por dobra (a pilha diz `cast.mode: "warp"`) e, menor, quando a permanente volta para o exílio (o servidor marca `reason: "warped"` quando quem resolve é o gatilho da dobra). O som é o de conjurar a 0,72× com um eco a 0,16 s; no exílio, o do exílio a 0,82×. Seção **Dobra** no laboratório de efeitos.
- 87: página **Salas** em `salas.html`, com link no cabeçalho (com a contagem, atualizada a cada 30 s na tela inicial) e no menu ⋯; a lista da aba Entrar numa sala continua. Entrar e assistir abrem a mesa pelo link da sala (`?sala=`), e "Criar uma sala" pelo `?criar-sala=1`. Ficou de fora: prévia da mesa das partidas em andamento e aviso de sala nova.

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

## 91. Mão cheia: agrupar cartas iguais (e talvez ordenar sozinha)

Com muitas cartas na mão (mais de 10), cada carta fica estreita demais para ler e achar a que se quer jogar dá trabalho, principalmente quando há várias cópias da mesma carta (terrenos básicos, várias cópias compradas de uma vez).

- [x] A partir de 11 cartas na mão, juntar as cópias da mesma carta numa pilha só, com o contador ×N (como as pilhas do campo), liberando espaço para as outras.
- [x] Jogar da pilha usa uma das cópias; passar o mouse ou tocar na pilha mostra que há várias.
- [x] Ao voltar para 10 cartas ou menos, as pilhas se desfazem e cada carta volta ao seu lugar.
- [x] Não agrupar cartas que parecem iguais mas não são (cartas com marcadores, reveladas, vindas do cemitério ou do exílio, ou com custo diferente por algum efeito).
- [x] Item no CHANGELOG e prints na página Novidades em imagens.

Feito na 0.125.0 (decidido em 04/11/2026): a partir de 11 cartas, na ordem do jogador, com a pilha no lugar da primeira cópia; sem ordenação automática. Agrupa pelo nome e pelo custo, entre cartas igualmente jogáveis e sem marcadores; não agrupa quando a mesa pede para escolher cartas da mão nem na mão inicial. Quem assiste vê as costas das cartas, então não se aplica.

## 92. Mão fixa, oculta ou automática: botão para mostrar e esconder, menu para o modo

Hoje o botão ao lado da mão (0.124.0) só alterna entre dois jeitos: mão aberta o tempo todo, ou recolhida por cima do campo, com o topo das cartas à vista, subindo ao passar o mouse. A ideia é ter três modos:

- **Fixa:** a mão fica aberta o tempo todo, como o "Deixar a mão aberta" de hoje.
- **Oculta:** a mão sai da frente do campo e fica só uma faixa fina ou o próprio botão. Passar o mouse não abre a mão; ela só volta pelo botão ou quando a mesa pede uma decisão com cartas da mão (descartar, escolher a mão inicial).
- **Automática:** o comportamento recolhido de hoje. Só o topo das cartas aparece, e a mão sobe ao passar o mouse ou com o foco do teclado.

Decidido em 04/11/2026: mostrar e esconder não passa pelo modo automático. O clique no botão só mostra ou esconde a mão, e o modo é escolhido num menu ao lado.

- [x] Clique no botão: alterna entre **Fixa** e o último jeito de esconder escolhido (**Oculta** ou **Automática**; na primeira vez, **Automática**). Assim, mostrar e esconder é sempre um clique só.
- [x] Uma setinha ao lado do botão (e o clique com o botão direito nele) abre um menu com **Fixa**, **Oculta** e **Automática**, com o modo atual marcado. Escolher no menu já aplica o modo e fecha o menu.
- [x] O ícone do botão e o balão (`title`/`aria-label`) dizem o que o clique vai fazer ("Mostrar a mão" ou "Esconder a mão"); o menu é acessível pelo teclado.
- [x] Guardar o modo escolhido, como já acontece hoje. Quem guardou "aberta" passa a ter "fixa", e quem guardou "recolhida" passa a ter "automática".
- [x] Quem assiste a partida continua começando com a mão recolhida, e trocar o modo assistindo não muda o modo guardado do jogador.
- [x] Mão oculta: avisar de alguma forma quando uma carta nova entra na mão (contador no botão ou um brilho rápido), para o jogador não perder a compra.
- [x] Item no CHANGELOG e prints dos três modos e do menu na página Novidades em imagens.

Feito na 0.125.0 (decidido em 04/11/2026): no modo oculto, só o botão com a contagem de cartas (e um brilho quando chega carta nova); a faixa da mão fica fina e o campo ganha a altura. No celular nada muda.

Mudado em 04/11/2026, ainda na 0.125.0: no lugar do botão com menu, ficaram dois botões centralizados logo acima da mão. **Auto** liga e desliga a mão automática; com o Auto desligado aparece a seta, que esconde (para baixo) ou mostra (para cima) a mão. Com o Auto ligado, a seta some. Depois, ainda no mesmo dia: o Auto virou um ícone pequeno de mão ao lado do relógio do turno (aceso quando ligado), e a seta ficou mais apagada até o mouse chegar nela.

## 93. Painel "Atacar quem?" que dá para arrastar

Ao escolher os atacantes, o painel **Atacar quem?** (a lista de jogadores e planeswalkers que dá para atacar, com **Retirar do combate** e **Limpar seleção**) abre num lugar fixo da mesa. Às vezes ele fica por cima de criaturas do seu próprio campo, justamente as que você quer escolher para atacar.

- [x] Dar ao painel uma alça (a faixa do título "Atacar quem?") para arrastar com o mouse ou o dedo e soltar em qualquer lugar da mesa.
- [x] O painel não pode sair da tela: ao soltar fora, ou ao redimensionar a janela, ele volta para dentro.
- [x] Clicar nos alvos e nos botões continua funcionando normalmente; só arrastar pela alça move o painel.
- [x] Guardar o lugar escolhido para os próximos combates (no mesmo aparelho), com um jeito de voltar ao lugar padrão (duplo clique na alça, por exemplo).
- [x] Item no CHANGELOG e print na página Novidades em imagens.

Feito na 0.125.0 (decidido em 04/11/2026): o arraste move a caixa das ações inteira (o painel e os botões de confirmar), pelo título com pontinhos; um lugar só para duelo e mesa de 3–4 jogadores; só o painel de ataque, por enquanto.

## 94. Planeswalkers sempre juntos, no fim da fileira das criaturas

Hoje os planeswalkers ficam na fileira das criaturas na ordem em que entraram no campo, misturados com elas. Com muitas permanentes, fica difícil achar um planeswalker (para ativar uma lealdade ou escolher quem atacar) e ver quantos cada jogador tem.

- [x] Na fileira das criaturas, as criaturas vêm primeiro e os planeswalkers depois, todos juntos no fim, separados das criaturas por um respiro e um traço discreto, como já acontece entre artefatos/encantamentos e terrenos na fileira de trás.
- [x] Vale para o seu campo, para o do oponente no duelo e para os assentos da mesa de 3–4 jogadores (e para a vista ampliada de um assento).
- [x] Um planeswalker que vira criatura (ou uma criatura que vira planeswalker) muda de grupo na hora.
- [x] Com a fileira cheia e rolando, o grupo dos planeswalkers continua no fim; ver se é preciso deixá-lo sempre à vista.
- [x] Item no CHANGELOG e print na página Novidades em imagens.

Feito na 0.125.0 (decidido em 04/11/2026): batalhas junto dos planeswalkers; o grupo rola com a fileira, sem ficar preso na ponta.

## 102. Quantidade de cartas na mão no ícone da mão automática

Hoje a quantidade de cartas na sua mão aparece num selo junto do seu retrato (a costa da carta e o número), e o ícone de mão ao lado do relógio do turno só liga e desliga a mão automática. A ideia é juntar os dois: o número vai para o ícone da mão, e o selo do retrato sai.

- [ ] O ícone da mão (ao lado do relógio do turno) mostra quantas cartas você tem na mão, e continua ligando e desligando a mão automática ao tocar, aceso quando ligada.
- [ ] O selo de cartas na mão junto do seu retrato deixa de aparecer, no duelo e no Commander, no computador e no celular.
- [ ] O balão e o leitor de tela do ícone dizem as duas coisas: quantas cartas há na mão e se a mão automática está ligada.
- [ ] Conferir se o brilho de carta nova da mão oculta (0.125.0) continua fazendo sentido com o número no ícone.
- [ ] Item no CHANGELOG e print na página Novidades em imagens.
