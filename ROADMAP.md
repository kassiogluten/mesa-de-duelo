# Próximas funcionalidades

## 1. Importar deck por link (Moxfield e Archidekt) ✅

Na importação de deck, o campo da lista aceita também o link público de um deck do Moxfield ou do Archidekt. A ponte busca a lista na API do site (o navegador esbarra no CORS) e o deck passa pela mesma revisão da lista colada.

- [x] Reconhecer as URLs (`src/deckLink.ts`):
  - Moxfield: `https://moxfield.com/decks/{id}`
  - Archidekt: `https://archidekt.com/decks/{id}` (com ou sem o slug do nome no fim)
- [x] Buscar a lista nas APIs públicas pela ponte (`DeckLinks.java`, mensagem `fetch-deck`). A ponte só monta endereços desses dois sites a partir do id, para não virar um proxy aberto.
  - Moxfield: `https://api2.moxfield.com/v3/decks/all/{id}` → `boards.mainboard/sideboard/commanders/companions`
  - Archidekt: `https://archidekt.com/api/decks/{id}/` → `cards[]` com `quantity`, `card.oracleCard.name` e `categories` (Sideboard, Commander; categorias fora do deck, como Maybeboard, ficam de fora)
- [x] Converter para lista em texto e seguir a revisão de sempre, com o nome do deck de origem quando o campo de nome estiver vazio.
- [x] Cartas de duas faces (`A // B`) e nomes desconhecidos: a revisão já mostra as cartas não reconhecidas sem falhar o deck inteiro.
- [x] Erros claros: link inválido, deck não encontrado, deck privado ou bloqueado pelo site, sem conexão, deck vazio.
- [x] Bônus: aceitar também a lista em texto colado (`4 Lightning Bolt`, formato de exportação do Moxfield/Arena), que serve de alternativa quando o link falhar.
- [ ] Conferir com um deck público real do Moxfield (testado com um id inexistente, que a API respondeu como "não encontrado", e com um deck real do Archidekt).
- [ ] Pré-carregar as imagens com `fetchByNames` depois de importar.

## 2. Custo de mana visível no leque de cartas da mão ✅

Hoje as cartas da mão (`.hcard`, `src/style.css`) se sobrepõem em 34% da largura (`margin-left: calc(var(--hcw) * -0.34)`), e a carta seguinte cobre o canto superior direito da anterior, que é justamente onde fica o custo de mana. Só dá para ver o custo passando o mouse.

- [x] Mostrar um selo com o custo de mana no canto **superior esquerdo** de cada carta da mão, saindo pela borda de cima (a parte que fica descoberta no leque), usando `manaHTML` de `src/ui/cardtext.ts` com o `manaCost` que já chega em `FCard`.
- [x] Gerar o selo em `face()`/no `map` da mão em `src/ui/forgeTable.ts` (só para a mão, não para o campo de batalha).
- [x] Estilo: fundo escuro semitransparente, símbolos legíveis no tamanho atual de `--hcw`, sem tapar o nome da carta além do necessário.
- [x] Terrenos e cartas sem custo: não mostrar selo.
- [x] Cartas de duas faces / custo alternativo: mostrar o custo da face da frente.
- [x] Conferir em mão cheia (7+ cartas) e em tela estreita, onde a sobreposição é maior.

## 3. Entrar na sala automaticamente ao buscar pelo código ✅

Hoje, depois de digitar o código de uma sala, o jogador ainda precisa de um passo a mais para entrar. Se a sala existe e tem vaga, a busca já deve levá-lo para dentro.

- [x] Ao buscar um código válido (`src/ui/lobby.ts`), entrar na sala direto, sem botão extra de confirmação.
- [x] Manter mensagens claras quando não der para entrar: sala inexistente, sala cheia, partida já começada, sem rede.
- [x] Não entrar duas vezes se o jogador apertar Enter e clicar ao mesmo tempo.
- [x] Se o jogador ainda não escolheu um deck compatível com o formato da sala, pedir o deck antes de entrar (ou entrar e pedir logo em seguida).

## 4. Minimizar o modal de escolha de cartas para ver a mesa ✅

Em escolhas como buscar um terreno com uma fetch land, o modal cobre o campo de batalha, e o jogador não consegue conferir o que já tem em jogo (cores de mana, terrenos, ameaças do oponente) antes de decidir.

- [x] Botão **Ver a mesa** (minimizar) no modal de seleção de cartas (`src/ui/decisionPrompt.ts` / `src/ui/forgeTable.ts`).
- [x] Minimizado, o modal vira uma barra compacta (ex.: "Escolha um terreno — 0/1") com botão para voltar, e a mesa fica visível e navegável (dá para inspecionar cartas).
- [x] Preservar as cartas já marcadas ao minimizar e reabrir.
- [x] Não permitir jogar ou ativar outras coisas enquanto a decisão está pendente; minimizar é só para olhar.
- [x] Funcionar bem no celular, onde o modal ocupa quase a tela toda.

## 5. Instrução curta na caixa de ação

A caixa ao lado dos botões mostra a mensagem do Forge como ela chega, muitas vezes com o texto inteiro da habilidade. Hoje o texto longo fica recolhido atrás de **Ver detalhes**, mas o jogador ainda precisa garimpar o que fazer. O ideal é uma frase curta sempre visível e inteira, e o texto do Forge só nos detalhes.

- [x] Frase curta para escolher alvos ("Escolha um alvo para Raio da Fenda (criatura).") e pagar mana ("Pague o custo de mana de Jiboia."), com o nome da carta em português.
- [ ] Frase curta para os outros tipos de decisão que ainda chegam com o texto do Forge (sim/não, ordem de gatilhos, escolhas especiais), e mostrar o custo em símbolos no pagamento.
- [x] Usar os dados que a ponte já manda (carta de origem, tipo de entrada, quantidade) em vez de reescrever o texto do Forge; quando a ponte não mandar o bastante, expor o que falta no protocolo.
- [x] O texto original do Forge continua acessível em **Ver detalhes** e na carta de origem (inspetor).
- [x] Quando não houver frase curta conhecida, cair no texto do Forge como hoje.
- [x] Mesma frase no anúncio para leitores de tela.

## 6. Avisos de gatilho por mais tempo ✅

Quando um gatilho dispara, o aviso ao lado da carta ("Gatilho de …") some rápido demais para ler: fica 1 s na tela, e só 0,6 s quando há uma decisão pendente ou a apresentação está acelerada (`presentationDuration` em `src/ui/presentationTimeline.ts`).

- [x] Aumentar a duração dos avisos de gatilho (algo como 2–2,5 s), sem atrasar o resto da jogada mais do que o necessário.
- [x] Ajustar também o caso acelerado, para o aviso continuar legível quando há uma decisão esperando.
- [x] Vários gatilhos seguidos não podem se acumular numa fila longa: agrupar ou encurtar quando houver muitos.
- [x] Conferir que o histórico da partida continua registrando cada gatilho, para quem perder o aviso.

## 7. Visual mais parecido com o MTG Arena

A mesa já segue a ideia do Arena, mas os modais e painéis ainda parecem de site: caixas com borda dourada fina, fundo escurecido uniforme e muito texto. No Arena, o foco vai para as cartas, e o fundo some de um jeito mais teatral.

- [x] Modais que escurecem o fundo (escolha de cartas, revelar, cemitério/exílio, pilha, resultado): fundo com vinheta e desfoque leve da mesa, em vez de uma camada preta chapada; entrada animada.
- [x] Nas escolhas de cartas, as cartas grandes e soltas sobre o fundo escuro, sem "caixa" em volta; título curto em cima e botões grandes embaixo, centralizados.
- [x] Carta escolhida com brilho e leve elevação (como no Arena), em vez de só a borda.
- [ ] Saída animada dos modais (hoje somem de uma vez quando a escolha é respondida).
- [ ] Botões principais no estilo do Arena: forma, cor e brilho consistentes entre "OK", "Confirmar", "Passar" e "Fim de turno".
- [ ] Revisar painéis menores (caixa de ação, seletor de ataque, barra de escolha recolhida) para seguir a mesma linguagem.
- [ ] Conferir contraste e leitura no celular e com "reduzir movimento" do sistema.

## 8. Animações mais parecidas com o MTG Arena

Hoje as animações mostram o que aconteceu, mas são discretas e parecidas entre si: uma cópia da carta desliza, a carta pisca e some. No Arena, cada tipo de jogada tem um movimento próprio, com peso e impacto, sem atrasar o jogo.

- [ ] Conjurar: a carta sai da mão, cresce no centro da mesa por um instante e vai para a pilha; ao resolver, desce até o campo (ou vai para o cemitério) com um leve impacto.
- [ ] Ataque: criaturas avançam inclinadas na direção do defensor; no dano, um golpe rápido com tremor e o número de dano saltando no alvo.
- [ ] Bloqueio: o bloqueador desliza até a frente do atacante, com a ligação entre os dois bem visível.
- [ ] Dano e morte: carta treme e escurece ao receber dano letal, depois se desfaz em direção ao cemitério.
- [ ] Vida do jogador: o número conta para cima ou para baixo, com cor e um pulso no retrato.
- [ ] Terreno e fichas: entram com um "assentar" curto no campo; fichas aparecem com brilho.
- [ ] Virar e desvirar com rotação suave e um pouco de peso, em vez de troca seca.
- [ ] Gatilhos e habilidades: brilho na carta de origem e um feixe até o alvo, quando houver.
- [ ] Manter o ritmo: nada pode segurar a vez do jogador; respeitar "reduzir movimento" do sistema e o modo acelerado.
- [ ] Conferir desempenho no celular (sem travar com muitas cartas na mesa).

## 9. Indicador de turno e fases no estilo do Arena

Feito numa versão compacta: trilha de ícones na linha do meio, nomes e etapa só no hover (e no texto para leitores de tela), cor pelo dono do turno e o botão de passar dizendo o destino. As paradas configuráveis ficaram de fora por enquanto.

Hoje o turno aparece num painel no canto com o número do turno, de quem é a vez e a lista de todas as etapas em texto pequeno. No Arena, a informação fica junto da mesa, com ícones e cores, e dá para ler de relance sem procurar.

- [x] Fases como uma trilha de ícones (início, principal 1, combate, principal 2, final), na lateral da mesa entre os dois campos, como no Arena; a etapa atual acesa e as outras apagadas.
- [x] De quem é a vez pela cor e pelo lado: a trilha (ou o brilho do campo) muda de cor quando o turno passa para o oponente.
- [x] Etapa atual com nome curto em destaque ("Combate — declarar atacantes") e o número do turno discreto ao lado.
- [x] Botão de passar integrado à trilha, mostrando para onde vai ("Para o combate", "Para o fim do turno"), como o botão principal do Arena.
- [ ] (Fora por enquanto, a pedido) Paradas: tocar numa fase marca uma parada (o jogo não passa por ela automaticamente), com a marca visível na trilha.
- [x] Animação curta ao trocar de etapa (o ícone atual acende e cresce).
- [x] Destaque maior na troca de turno ("Seu turno"), sem atrasar o jogo.
- [x] Versão compacta para o celular e para o Commander com vários jogadores.
- [x] No Commander com vários jogadores, mostrar o retrato de quem joga junto da trilha.

## 10. Cache das imagens do Scryfall (sob demanda, com CDN)

Hoje cada aparelho baixa as imagens das cartas direto do Scryfall (`cards.scryfall.io`, endereços em `src/cards.ts`), e o service worker do PWA não guarda essas imagens. Cada partida e cada visita ao construtor de decks repete os downloads, e o Scryfall pede para os apps guardarem as imagens em vez de buscá-las de novo.

A ideia é um cache que se forma **aos poucos, só com as imagens que alguém de fato pediu**: nada de baixar a coleção inteira de uma vez.

- [ ] Endpoint de imagem no nosso servidor (por exemplo `/img/{id-scryfall}/{tamanho}` no nginx ou na ponte): na primeira vez busca no Scryfall, guarda e devolve; nas seguintes, devolve a cópia guardada. Só aceita os tamanhos usados pela mesa (`small`, `normal`, `art_crop`) e ids no formato do Scryfall, para não virar um proxy aberto.
- [ ] CDN na frente desse endpoint (Cloudflare ou parecido), com cache longo (`Cache-Control: public, max-age=31536000, immutable`). A imagem só chega à CDN depois que alguém a pediu ao menos uma vez.
- [ ] Sem importação em massa: nenhum job de pré-carga nem varredura dos bulk data do Scryfall. O cache cresce só com o uso real.
- [ ] Respeitar o Scryfall: no máximo uma busca por imagem ainda não guardada, fila com limite de requisições por segundo, `User-Agent` identificado e reaproveitar a imagem já guardada mesmo se a busca falhar depois.
- [ ] No frontend, trocar `cards.scryfall.io` pelo endereço do cache, com volta automática para o Scryfall se o cache estiver fora do ar.
- [ ] No aparelho: regra de cache do service worker para as imagens (CacheFirst, com limite de quantidade e de idade), para quem já viu uma carta não baixar de novo nem pela CDN.
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
- [ ] Usar também no construtor de decks e na Mesa livre.
- [x] Combina com o cache de imagens (item 10): `art_crop` é bem menor que a imagem inteira.

## 12. Aproveitar melhor a barra superior dentro das partidas ✅

Feito assim: a barra mostra, ao lado do menu, o formato, a sala, o placar da melhor de três e quem caiu da conexão (antes só dentro do menu). Turno e fase ficam na trilha e vida no retrato, então não se repetem nela. A faixa do topo baixou em todas as telas, com o retrato do oponente deitado e os marcadores dele em linha: no computador, de 16% da altura (173 px em 1080p) para 8% (86 px), e no celular de ~104 px para 58 px, com o menu só com o ícone e as duas fileiras de cada campo cabendo sem rolar. (Na primeira entrega só o celular tinha mudado.) No Commander (vários jogadores, e 1×1 no celular) o status continua no menu, para não apertar os assentos.

Durante a partida, a barra do topo da tela ocupa espaço sem mostrar muita coisa útil, tanto no computador quanto no celular. Ela pode render mais para o jogador ou encolher para deixar a mesa maior.

- [x] Levantar o que a barra mostra hoje em partida (desktop e celular) e o que fica sobrando ou repetido em outros lugares da mesa.
- [x] Decidir o que vale ficar sempre à vista nela (por exemplo: sala, turno/fase, vida e status dos jogadores, conexão, opções, sair) e o que pode ir para um menu.
- [x] Desktop: usar a largura disponível para informação de relance, sem competir com a trilha de fases e a caixa de ação.
- [x] Celular: barra mais baixa (ou recolhível) para ganhar altura de mesa, com os botões importantes ainda fáceis de tocar.
- [x] Commander com vários jogadores: conferir que a barra não aperta os retratos e campos dos oponentes.
- [x] Respeitar as áreas seguras do celular (entalhe, barra de gestos) e o modo PWA instalado.

## 13. Tela de ordenar gatilhos no estilo do Arena ✅

Quando vários gatilhos do jogador disparam ao mesmo tempo, o Forge pede a ordem em que vão para a pilha, e essa escolha hoje aparece como uma pergunta genérica. No Arena, os gatilhos aparecem como cartas lado a lado, na horizontal, e o jogador arruma a ordem vendo o que cada um faz.

- [x] Tela própria para a ordem de gatilhos: cada gatilho como uma carta (a carta de origem com o texto da habilidade que disparou), enfileiradas na horizontal sobre o fundo escuro dos modais do Arena (item 7).
- [x] Deixar claro qual resolve primeiro: numerar as posições e indicar o sentido ("resolve primeiro" / "resolve por último"), lembrando que o último a ir para a pilha é o primeiro a resolver.
- [x] Reordenar arrastando as cartas e também tocando em sequência (tocar define a próxima posição), com botão para desfazer e um botão grande de confirmar.
- [x] Ordem automática como atalho, para quem não quer escolher.
- [x] Gatilhos repetidos da mesma carta agrupados ou marcados (×2, ×3), sem esconder que são separados na pilha.
- [x] Poder minimizar para olhar a mesa, como nas outras escolhas de cartas (item 4), e inspecionar cada carta.
- [x] Celular: rolar a fileira na horizontal quando não couber, com as cartas grandes o bastante para ler e arrastar.
- [x] Teclado e leitor de tela: mover um gatilho com as setas e anunciar a posição.

## 14. Escolher o modo de conjurar no estilo do Arena ✅

Quando uma carta pode ser jogada de mais de um jeito (conjurar normal, reciclar, tramar/plot, custo alternativo, flashback, evocar etc.), a mesa mostra uma lista de botões só com texto, no formato "habilidade — Custo: …". O jogador não vê a carta e precisa ler cada linha para entender a diferença. No Arena, a carta aparece grande no centro e cada modo é uma opção visual ao lado dela.

- [x] Mostrar a carta grande (imagem ou o layout "Arte e texto" do item 11) com as opções de jogar ao lado ou embaixo, sobre o fundo dos modais do item 7.
- [x] Cada opção como um botão-cartão com o nome do modo em português ("Conjurar", "Reciclar", "Tramar", "Flashback"…), o custo em símbolos de mana (e custos extras, como sacrificar ou descartar, escritos por extenso) e uma linha curta do que acontece ("Compre um card", "Exile e conjure depois de graça").
- [ ] Destacar a opção comum (conjurar normal) ✅ e desabilitar, com o motivo, as que não podem ser pagas agora: a ponte ainda não sabe (o Forge só oferece as opções que a carta permite, sem conferir a mana).
- [x] Cartas de duas faces, aventuras e cartas divididas: mostrar a face ou a metade de cada opção (nome, custo e tipo da face; a imagem continua a da carta).
- [x] Usar os dados que a ponte já manda (habilidade e custo de cada opção); se faltar o tipo do modo para traduzir e escolher o ícone, expor isso no protocolo em vez de interpretar o texto do Forge.
- [x] Cancelar volta para a mesa sem jogar nada; minimizar para ver a mesa, como no item 4.
- [x] Celular: carta e opções empilhadas, com botões grandes de tocar; teclado e leitor de tela anunciando modo e custo.

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
- [ ] Dano prevenido (escudo): escudo sobre o alvo e o número riscado. Dados: o Forge não manda evento de prevenção; precisa expor na ponte (o mapa de prevenção do dano) antes de mostrar.
- [ ] Dano dividido entre vários alvos: vários projéteis saindo juntos da mesma fonte, cada um com seu número. Dados: já chegam vários `damage` seguidos com a mesma fonte; falta agrupá-los numa só apresentação.
- [x] Dano a si mesmo (dor: Sol Ring de dor, terrenos de dor, Phyrexian): o golpe "volta" para o próprio retrato, sem trajeto longo. Dados: `damage` em que o alvo é quem controla a fonte.
- [x] Dano de comandante (Commander): selo de comandante no impacto e o contador "Dano x/21" pulsando. Dados: `commander: true` no `damage` de combate.
- [x] Letal: criatura com dano igual ou maior que a resistência (ou com toque mortífero) treme e escurece antes de ir ao cemitério; jogador chegando a 0 de vida tem um impacto maior. Dados: `lethal: true` no `damage` (calculado pela ponte com a resistência e o dano marcado).
- [x] Tremor leve da mesa em dano grande (5 ou mais, ou letal no jogador).
- [x] Respeitar "reduzir movimento" do sistema: sem projéteis nem tremor, só o número e o destaque no alvo.
- [ ] Som próprio para golpe, projétil, cura e veneno (hoje o dano usa um som só).
- [ ] Conferir desempenho no celular com combates grandes (muitas criaturas atacando ao mesmo tempo).

## 16. Efeitos de movimento das permanentes no estilo do Arena

Hoje as permanentes só deslizam de um lugar para outro e piscam. No Arena, cada jeito de uma permanente mudar de estado ou sair do campo tem um movimento próprio, que diz o que aconteceu sem precisar ler o histórico.

Fonte dos dados: eventos `entered` e `left` da ponte (com `from` e `to`), o quadro público de cada evento (carta virada ou não) e os avisos de habilidade (`ability-activated`, com `trigger`). O motivo da saída (destruída, sacrificada, exilada, devolvida) ainda não vem no evento. Teste no laboratório de efeitos (item 18).

- [ ] Destruída: a carta racha e se desfaz em fragmentos a caminho do cemitério; diferente de sacrificada (afunda no campo) e de morrer por dano (ver item 15). Dados: expor na ponte o motivo da saída (o Forge avisa destruição e sacrifício em eventos próprios).
- [ ] Virar e desvirar (tap/untap): rotação de 90° com um pouco de peso e um assentar no fim; desvirar em lote no começo do turno, em onda. Dados: carta `tapped` no quadro de cada evento; expor um evento de virar para não depender da diferença entre quadros.
- [ ] Blink (exilar e voltar): a carta se dissolve em luz e reaparece no mesmo lugar, com o brilho de entrada. Dados: `left` para o exílio seguido de `entered` vindo do exílio para a mesma carta.
- [ ] Bounce (voltar para a mão): a carta sobe, encolhe e voa até a mão do dono (ou até a contagem de mão do oponente). Dados: `left` com `to: "Hand"`.
- [ ] Exilada: a carta se apaga num brilho branco e vai para a pilha de exílio. Dados: `left` com `to: "Exile"`.
- [ ] Habilidade desencadeada (gatilho): a carta de origem dá um pulso com o raio e solta um feixe até o alvo, quando houver. Dados: `ability-activated` com `trigger: true` e `targets`.
- [ ] Habilidade ativada: a carta se ergue um pouco (e vira, se o custo for virar), com a engrenagem e um feixe até o alvo. Dados: `ability-activated` sem `trigger`, com `targets`.
- [ ] Respeitar "reduzir movimento" e o modo acelerado; nada disso pode segurar a vez do jogador.

## 17. Efeitos visuais contínuos nas permanentes

Hoje as palavras-chave aparecem como ícones pequenos na carta e só voar tem um efeito próprio (uma névoa embaixo da carta). No Arena, o que protege ou muda uma permanente fica visível o tempo todo: um brilho, uma moldura ou partículas que dizem "esta carta não pode ser alvo" ou "esta não morre" sem precisar abrir a carta.

Fonte dos dados: cada carta do campo já traz `keywords` (nomes do enum `Keyword` do Forge: `HEXPROOF`, `WARD`, `SHROUD`, `INDESTRUCTIBLE`, `PROTECTION`, `FLYING`…), `sick`, `token`, `faceDown`, `copyOf`, `attachedTo` e `counters`; a pilha traz os alvos de cada item. O que falta (custo da proteção contra alvos, de que a proteção protege, fases fora, "não pode atacar/bloquear", escudos de prevenção) a ponte precisa expor, sem ler o texto da carta.

Cuidados em todos: o efeito fica na borda e atrás da carta, nunca sobre o nome, o custo ou o P/T; vários efeitos juntos se somam sem virar uma mancha (no máximo uma moldura e um brilho por vez, o resto como detalhe na borda); com "reduzir movimento", tudo fica parado (sem pulsar nem partículas), só a moldura ou o brilho fixo. Teste no laboratório de efeitos (item 18).

- [ ] Resistência à magia (hexproof): brilho azul-claro e fino em volta da carta, com um leve reflexo correndo pela borda. Dados: `keywords` com `HEXPROOF`.
- [ ] Proteção contra alvos (ward): moldura de runas na borda e o custo visível num selo pequeno no canto de baixo ("Ward {2}"). Dados: `WARD` em `keywords`; o custo precisa vir da ponte (`ward: "{2}"` ou o custo em texto do Forge, como "Pague 3 de vida").
- [ ] Manto (shroud): névoa cinza suave em volta da carta, mais opaca que a do hexproof. Dados: `SHROUD`.
- [ ] Indestrutível: moldura dourada grossa com brilho metálico parado. Dados: `INDESTRUCTIBLE`.
- [ ] Proteção contra cor ou tipo: escudo na borda com a cor protegida (pips de mana) ou o tipo ("Proteção contra criaturas"). Dados: `PROTECTION`; a ponte precisa dizer de quê (`protection: ["R", "creatures"]`).
- [ ] Voar: revisar a névoa atual (sombra deslocada para baixo, como se a carta flutuasse um pouco), sem atrapalhar a leitura dos ícones. Dados: `FLYING`.
- [ ] Toque mortífero: fumaça verde-escura discreta na base da carta. Dados: `DEATHTOUCH`.
- [ ] Vínculo com a vida: brilho verde-claro pulsando devagar na borda. Dados: `LIFELINK`.
- [ ] Iniciativa e golpe duplo: um traço (ou dois) de lâmina no canto da carta. Dados: `FIRST_STRIKE`, `DOUBLE_STRIKE`.
- [ ] Vigilância: olho discreto no canto; ao atacar, a carta continua de pé com um brilho rápido. Dados: `VIGILANCE`.
- [ ] Ímpeto e enjoo de invocação: criatura com enjoo levemente apagada com o "zZ" atual; com ímpeto, faíscas curtas ao entrar no campo. Dados: `sick`, `HASTE`.
- [ ] Defensor: moldura de muralha na base, sem brilho. Dados: `DEFENDER`.
- [ ] Ameaçar: borda vermelha serrilhada discreta. Dados: `MENACE`.
- [ ] Atropelar: marca de pegadas no canto. Dados: `TRAMPLE`.
- [ ] Fases fora (phasing): carta translúcida, com contorno tracejado, até voltar. Dados: a ponte precisa expor `phasedOut` (o Forge sabe, a carta fica no campo).
- [ ] Virada para baixo (morph, disfarce, manifestar): verso com textura própria e um selo do tipo ("Metamorfose 2/2"); só o dono vê o que é. Dados: `faceDown`; o tipo (morph, disfarce, manifestar) precisa vir da ponte.
- [ ] Fichas e cópias: fichas com borda prateada; cópias com um selo "Cópia de …". Dados: `token`, `copyOf`.
- [ ] Não pode atacar ou não pode bloquear: corrente cinza fina na base. Dados: a ponte precisa expor `cantAttack` / `cantBlock` (o Forge calcula; não ler o texto).
- [ ] Encantada ou equipada: linha fina ligando a aura ou o equipamento à carta, e um brilho da cor da aura na carta encantada. Dados: `attachedTo` de quem está preso.
- [ ] Alvo de algo na pilha: mira pulsando sobre a carta enquanto o efeito estiver na pilha, da cor de quem conjurou. Dados: `targets` de cada item de `stack`.
- [ ] Prevenção de dano: escudo transparente com o número de dano que ainda será prevenido ("Prevenir 3"). Dados: a ponte precisa expor os escudos de prevenção da carta e do jogador.
- [ ] Marcadores +1/+1 e −1/−1: brilho verde ou roxo fraco atrás da carta, além do número. Dados: `counters`.

## 18. Laboratório de efeitos

Uma página de desenvolvimento para testar os efeitos dos itens 15, 16 e 17 na mesa de verdade, sem a ponte do Forge: `tests/fixtures/effects-lab.html` (abrir com `npm run dev`). Não é para o jogador e não entra nas novidades.

- [ ] Montar o campo dos dois lados: criatura pequena e grande, criatura virada, ficha, planeswalker com lealdade, artefato, encantamento e aura presa a uma criatura, terreno, Classe com nível e carta virada para baixo; remover uma ou limpar tudo.
- [ ] Para a permanente selecionada: ligar e desligar cada palavra-chave e estado do item 17, sozinhos ou vários juntos.
- [ ] Disparar cada efeito de dano do item 15 entre as permanentes e os jogadores escolhidos (fonte e alvo): mágica, combate com bloqueio, atropelar, golpe duplo, toque mortífero, vínculo com a vida, infectar, murchar, dano prevenido, dano dividido, dor, letal.
- [ ] Disparar cada movimento do item 16 na permanente selecionada: destruir, sacrificar, virar e desvirar, blink, devolver para a mão, exilar, gatilho e habilidade ativada com alvo.
- [ ] Alternar a aparência das cartas (imagem inteira ou arte e texto), o tamanho de tela (celular deitado, tablet, computador) e "reduzir movimento" só na página.
- [ ] Campo cheio (muitas permanentes dos dois lados) para conferir desempenho e sobreposição.
