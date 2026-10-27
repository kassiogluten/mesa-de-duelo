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
- [x] Conferir com um deck público real do Moxfield: "Winota: Snowball Stax" (24/10/2026) veio com 1 comandante, 99 no deck e 17 no sideboard, igual ao site. Também testado com um id inexistente e com um deck real do Archidekt.
- [x] Pré-carregar as imagens com `fetchByNames` depois de importar (`preloadDeckImages` em `src/scryfall.ts`: tradução, depois as imagens de cada face, 4 por vez e com prioridade baixa; inclui a arte recortada no estilo "Arte e texto").

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

## 5. Instrução curta na caixa de ação ✅

A caixa ao lado dos botões mostra a mensagem do Forge como ela chega, muitas vezes com o texto inteiro da habilidade. Hoje o texto longo fica recolhido atrás de **Ver detalhes**, mas o jogador ainda precisa garimpar o que fazer. O ideal é uma frase curta sempre visível e inteira, e o texto do Forge só nos detalhes.

- [x] Frase curta para escolher alvos ("Escolha um alvo para Raio da Fenda (criatura).") e pagar mana ("Pague o custo de mana de Jiboia."), com o nome da carta em português.
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
- [x] Saída animada dos modais (a janela de escolha respondida some com a vinheta e a caixa descendo um pouco).
- [x] Botões principais no estilo do Arena: forma, cor e brilho consistentes entre "OK", "Confirmar", "Passar" e "Fim de turno".
- [ ] Revisar painéis menores (caixa de ação, seletor de ataque, barra de escolha recolhida) para seguir a mesma linguagem.

## 8. Animações mais parecidas com o MTG Arena

Hoje as animações mostram o que aconteceu, mas são discretas e parecidas entre si: uma cópia da carta desliza, a carta pisca e some. No Arena, cada tipo de jogada tem um movimento próprio, com peso e impacto, sem atrasar o jogo.

- [ ] Conjurar: a carta sai da mão, cresce no centro da mesa por um instante e vai para a pilha; ao resolver, desce até o campo (ou vai para o cemitério) com um leve impacto.
- [ ] Ataque: criaturas avançam inclinadas na direção do defensor; no dano, um golpe rápido com tremor e o número de dano saltando no alvo.
- [ ] Bloqueio: o bloqueador desliza até a frente do atacante, com a ligação entre os dois bem visível.
- [x] Dano e morte: carta treme e escurece ao receber dano letal, depois se desfaz em direção ao cemitério. (Feito no item 15, letal, e no item 16, destruída.)
- [x] Vida do jogador: o número conta para cima ou para baixo, com cor e um pulso no retrato.
- [x] Terreno e fichas: entram com um "assentar" curto no campo; fichas aparecem com brilho.
- [x] Virar e desvirar com rotação suave e um pouco de peso, em vez de troca seca. (Feito no item 16.)
- [x] Gatilhos e habilidades: brilho na carta de origem e um feixe até o alvo, quando houver. (Feito no item 16.)
- [x] Manter o ritmo: nada pode segurar a vez do jogador; respeitar "reduzir movimento" do sistema e o modo acelerado.
- [ ] Conferir desempenho no celular (sem travar com muitas cartas na mesa).

## 9. Indicador de turno e fases no estilo do Arena ✅

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
- [x] Dano prevenido (escudo): domo transparente sobre o alvo, o número riscado e o selo "Prevenido". Dados: o Forge não avisa; a ponte vê o escudo de prevenção ("previna os próximos N") diminuir e manda `damage` com `prevented: true`. Prevenções sem escudo (Neblina e afins) ainda não aparecem.
- [x] Dano dividido entre vários alvos: vários projéteis saindo juntos da mesma fonte, cada um com seu número e o selo "Dividido". Dados: vários `damage` seguidos da mesma fonte, fora do combate, saem juntos da fila.
- [x] Dano a si mesmo (dor: Sol Ring de dor, terrenos de dor, Phyrexian): o golpe "volta" para o próprio retrato, sem trajeto longo. Dados: `damage` em que o alvo é quem controla a fonte.
- [x] Dano de comandante (Commander): selo de comandante no impacto e o contador "Dano x/21" pulsando. Dados: `commander: true` no `damage` de combate.
- [x] Letal: criatura com dano igual ou maior que a resistência (ou com toque mortífero) treme e escurece antes de ir ao cemitério; jogador chegando a 0 de vida tem um impacto maior. Dados: `lethal: true` no `damage` (calculado pela ponte com a resistência e o dano marcado).
- [x] Tremor leve da mesa em dano grande (5 ou mais, ou letal no jogador).
- [x] Respeitar "reduzir movimento" do sistema: sem projéteis nem tremor, só o número e o destaque no alvo.
- [x] Som próprio para cura, veneno (e −1/−1), escudo e carta destruída; golpe e projétil usam os sons de impacto que já existiam.
- [ ] Conferir desempenho no celular com combates grandes (muitas criaturas atacando ao mesmo tempo).

## 16. Efeitos de movimento das permanentes no estilo do Arena ✅

Hoje as permanentes só deslizam de um lugar para outro e piscam. No Arena, cada jeito de uma permanente mudar de estado ou sair do campo tem um movimento próprio, que diz o que aconteceu sem precisar ler o histórico.

Fonte dos dados: eventos `entered` e `left` da ponte (com `from` e `to`), o quadro público de cada evento (carta virada ou não) e os avisos de habilidade (`ability-activated`, com `trigger`). O motivo da saída (destruída, sacrificada, exilada, devolvida) ainda não vem no evento. Teste no laboratório de efeitos (item 18).

- [x] Destruída: a carta racha e solta fragmentos antes de cair no cemitério; sacrificada afunda e escurece; morrer por dano segue o item 15. Dados: `left` com `reason: "destroyed"` ou `"sacrificed"`, exposto pela ponte.
- [x] Virar e desvirar (tap/untap): rotação de 90° que passa um pouco do ponto e assenta; desvirar várias de uma vez vai em onda. Dados: `tapped` de cada carta entre um estado e o outro (não precisou de evento novo).
- [x] Blink (exilar e voltar): a carta se dissolve em luz e reaparece no mesmo lugar, com um anel branco. Dados: `left` para o exílio seguido de `entered` com `from: "Exile"`.
- [x] Bounce (voltar para a mão): a carta sobe, encolhe e voa até a mão (ou até a mão do oponente). Dados: `left` com `to: "Hand"`.
- [x] Exilada: a carta se apaga num brilho branco no lugar em que estava. Dados: `left` com `to: "Exile"`.
- [x] Habilidade desencadeada (gatilho): a carta de origem dá um pulso com o raio e solta um feixe roxo até cada alvo. Dados: `ability-activated` com `trigger: true` e `targets`.
- [x] Habilidade ativada: a engrenagem ao lado da carta e um feixe dourado até cada alvo; se o custo for virar, a carta vira com o movimento de virar. Dados: `ability-activated` sem `trigger`, com `targets`. (A carta ainda não "se ergue".)
- [x] Respeitar "reduzir movimento" e o modo acelerado; nada disso pode segurar a vez do jogador.

## 17. Efeitos visuais contínuos nas permanentes ✅

Hoje as palavras-chave aparecem como ícones pequenos na carta e só voar tem um efeito próprio (uma névoa embaixo da carta). No Arena, o que protege ou muda uma permanente fica visível o tempo todo: um brilho, uma moldura ou partículas que dizem "esta carta não pode ser alvo" ou "esta não morre" sem precisar abrir a carta.

Fonte dos dados: cada carta do campo já traz `keywords` (nomes do enum `Keyword` do Forge: `HEXPROOF`, `WARD`, `SHROUD`, `INDESTRUCTIBLE`, `PROTECTION`, `FLYING`…), `sick`, `token`, `faceDown`, `copyOf`, `attachedTo` e `counters`; a pilha traz os alvos de cada item. O que falta (custo da proteção contra alvos, de que a proteção protege, fases fora, "não pode atacar/bloquear", escudos de prevenção) a ponte precisa expor, sem ler o texto da carta.

Cuidados em todos: o efeito fica na borda e atrás da carta, nunca sobre o nome, o custo ou o P/T; vários efeitos juntos se somam sem virar uma mancha (no máximo uma moldura e um brilho por vez, o resto como detalhe na borda); com "reduzir movimento", tudo fica parado (sem pulsar nem partículas), só a moldura ou o brilho fixo. Teste no laboratório de efeitos (item 18).

- [x] Resistência à magia (hexproof): brilho azul-claro e fino em volta da carta, com um leve reflexo correndo pela borda. Dados: `keywords` com `HEXPROOF`.
- [x] Proteção contra alvos (ward): moldura tracejada de runas e o custo num selo embaixo da carta ("Ward {2}"). Dados: `WARD` em `keywords` e `ward` (o custo, do parâmetro da palavra-chave; custos que não são mana vêm como o Forge descreve, em inglês).
- [x] Manto (shroud): névoa cinza suave em volta da carta, mais opaca que a do hexproof. Dados: `SHROUD`.
- [x] Indestrutível: moldura dourada grossa com brilho metálico parado. Dados: `INDESTRUCTIBLE`.
- [x] Proteção contra cor ou tipo: moldura clara e um selo com os símbolos de mana protegidos ou o tipo ("Prot. artefatos"). Dados: `PROTECTION` e `protection` (de quê, do parâmetro da palavra-chave).
- [x] Voar: revisar a névoa atual (sombra deslocada para baixo, como se a carta flutuasse um pouco), sem atrapalhar a leitura dos ícones. Dados: `FLYING`.
- [x] Toque mortífero: fumaça verde-escura discreta na base da carta. Dados: `DEATHTOUCH`.
- [x] Vínculo com a vida: brilho verde-claro pulsando devagar na borda. Dados: `LIFELINK`.
- [x] Iniciativa e golpe duplo: um traço (ou dois) de lâmina no canto da carta. Dados: `FIRST_STRIKE`, `DOUBLE_STRIKE`.
- [x] Vigilância: olho discreto na borda esquerda; ao atacar, a carta continua de pé e o olho dá um brilho rápido. Dados: `VIGILANCE`.
- [x] Ímpeto e enjoo de invocação: criatura com enjoo levemente apagada no turno de quem a controla, com o "zZ" atual; com ímpeto, um brilho alaranjado na base enquanto ela ainda é nova. Dados: `sick`, `HASTE`.
- [x] Defensor: moldura de muralha na base, sem brilho. Dados: `DEFENDER`.
- [x] Ameaçar: borda vermelha serrilhada discreta. Dados: `MENACE`.
- [x] Atropelar: marca de pegadas na borda esquerda, abaixo do olho da vigilância. Dados: `TRAMPLE`.
- [x] Fases fora (phasing): carta translúcida, com contorno tracejado, até voltar. Dados: `phasedOut`, exposto pela ponte.
- [x] Virada para baixo (morph, disfarce, manifestar, encobrir): o verso com o selo "Metamorfose 2/2", "Disfarce 2/2", "Manifestada 2/2" ou "Encoberta 2/2". Dados: `faceDown` e `faceDownKind`, exposto pela ponte.
- [x] Fichas e cópias: fichas com borda prateada (além do selo "Ficha"); cópias com o selo "Cópia", que mostra o original ao passar o mouse. Dados: `token`, `copyOf`.
- [x] Não pode atacar ou não pode bloquear: corrente cinza fina na base, e o leitor de tela diz qual dos dois. Dados: `cantAttack` / `cantBlock`, calculados pela ponte com as regras de combate do Forge.
- [x] Encantada ou equipada: o leque de anexos atrás da carta (que já existia) faz a ligação, e a carta encantada ganha um brilho da cor da aura. Dados: `attachedTo` de quem está preso.
- [x] Alvo de algo na pilha: mira pulsando no meio da arte enquanto o efeito estiver na pilha, azul se foi você, laranja se foi o oponente. Dados: `targets` de cada item de `stack`.
- [x] Prevenção de dano: selo "Prevenir 3" embaixo da carta enquanto o escudo durar. Dados: `preventDamage`, exposto pela ponte (também nos jogadores; o retrato ainda não mostra).
- [x] Marcadores +1/+1 e −1/−1: brilho verde ou roxo fraco atrás da carta, além do número. Dados: `counters`.

## 18. Laboratório de efeitos ✅

Uma página de desenvolvimento para testar os efeitos dos itens 15, 16 e 17 na mesa de verdade, sem a ponte do Forge: `tests/fixtures/effects-lab.html` (abrir com `npm run dev`). Não é para o jogador e não entra nas novidades.

- [x] Montar o campo dos dois lados: criatura pequena e grande, criatura virada, ficha, planeswalker com lealdade, artefato, encantamento e aura presa a uma criatura, terreno, Classe com nível e carta virada para baixo; remover uma ou limpar tudo.
- [x] Para a permanente selecionada: ligar e desligar cada palavra-chave e estado do item 17, sozinhos ou vários juntos.
- [x] Disparar cada efeito de dano do item 15 entre as permanentes e os jogadores escolhidos (fonte e alvo): mágica, combate com bloqueio, atropelar, golpe duplo, toque mortífero, vínculo com a vida, infectar, murchar, dano prevenido, dano dividido, dor, letal.
- [x] Disparar cada movimento do item 16 na permanente selecionada: destruir, sacrificar, virar e desvirar, blink, devolver para a mão, exilar, gatilho e habilidade ativada com alvo.
- [x] Alternar a aparência das cartas (imagem inteira ou arte e texto), o tamanho de tela (celular deitado, tablet, computador) e "reduzir movimento" só na página.
- [x] Campo cheio (muitas permanentes dos dois lados) para conferir desempenho e sobreposição.

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

## 21. Deck médio do EDHREC no construtor de Commander ❌ (removido)

Chegou a existir (bloco na importação, botão no comandante, link do EDHREC aceito no campo da lista, busca pela ponte), mas não funcionava de forma confiável e foi removido por completo em 20/10/2026. A importação por link voltou a aceitar só Moxfield e Archidekt. Os termos de uso do EDHREC também não liberam consultas automatizadas, então não vale voltar a essa fonte sem uma API oficial.

## 22. Distribuir o dano de combate em bloqueios duplos ✅

Quando o atacante é bloqueado por duas ou mais criaturas (ou tem atropelar), o Forge pede a divisão do dano. Antes, a ponte respondia sozinha com letal em ordem.

- [x] Ponte: pergunta `combat-damage` com o atacante, o total, o letal de cada bloqueador (toque mortífero e planeswalker inclusos), o defensor quando há atropelar e a divisão automática sugerida.
- [x] Mesmas regras do diálogo do Forge, validadas na ponte: total exato, ordem entre bloqueadores quando o Forge pede, defensor só depois de letal em todos.
- [x] Tela na mesa: atacante, alvos com − / +, Letal, Todo o resto, Distribuição automática, motivo de cada trava, minimizar para ver a mesa, leitor de tela.
- [x] Teste no motor real com bloqueio duplo numa partida em rede (`forge-bridge/scripts/test-combat-damage.mjs`).
- [x] Bloqueador que bloqueia vários atacantes (a mesma pergunta, vista pelo lado de quem bloqueia): conferido no motor real com Guarda do Mercado Noturno bloqueando dois Ursos Cinzentos (`forge-bridge/scripts/test-multi-block.mjs`). A pergunta vai para quem bloqueia, sem defensor entre as opções.
- [ ] Integrar com os efeitos de dano (itens 15 e 18): pré-visualizar na mesa quem morre com a divisão escolhida.


## 23. Botão "Sem bloqueio" quando nenhum bloqueador foi escolhido ✅

Na declaração de bloqueadores, o botão de confirmar diz **Confirmar bloqueios** mesmo quando o jogador não escolheu nenhum bloqueador, o que deixa dúvida se ele vai mesmo levar o dano todo.

- [x] Sem bloqueadores declarados, o botão vira **Sem bloqueio**; com um ou mais, mostra quantos (**Confirmar 2 bloqueadores**), como o "Não atacar" do ataque.
- [x] O rótulo troca assim que o servidor registra o bloqueio (cada clique de bloqueio já é enviado na hora), sem passo extra.
- [x] Leitor de tela: o próprio botão leva o novo texto.

## 24. Animação de mill ✅

Quando cartas vão do topo do grimório direto para o cemitério (moer, "mill"), hoje elas só aparecem no cemitério e o grimório diminui, sem mostrar o movimento. Fica difícil perceber quantas cartas saíram e quais foram, principalmente quando é o oponente que moeu.

- [x] Ponte: avisar o mill como evento próprio, com o jogador, as cartas na ordem em que saíram do grimório e a fonte (a mágica ou habilidade que mandou moer). O Forge já marca esse momento ("Cards milled").
- [x] Mesa: as cartas saem do topo do grimório uma a uma, viram de face para cima e voam até o cemitério, com um pequeno intervalo entre elas. Com muitas cartas (moer 10 ou mais), acelerar ou agrupar em leque para não travar a partida.
- [x] Mostrar o total moído junto ao grimório (ex.: "−4") e anunciar no leitor de tela quantas cartas foram e quais.
- [x] Respeitar o ritmo rápido e o "reduzir movimento" do sistema: sem animação, só o destaque no cemitério.
- [x] Incluir no laboratório de efeitos (item 18): moer 1, 3 e 10 cartas, dos dois lados (e vidência para o cemitério).

## 25. Escolher quais oponentes ver na mesa ✅

Em partidas com três ou mais jogadores (Commander), todos os oponentes dividem a parte de cima da tela. Com quatro jogadores, cada campo fica pequeno, e quem quer acompanhar de perto uma ameaça ou o oponente que está atacando não tem como dar mais espaço a ele.

- [x] Cada oponente tem **Ocultar** e **Só este** no cabeçalho do campo. O oculto vira uma coluna estreita com retrato, vida, cartas na mão, marcadores (veneno e outros), dano de comandante, grimório e cemitério, e **Mostrar campo** traz o campo de volta (`src/ui/seatVisibility.ts`).
- [x] Atalho "só este": mostra só o campo daquele oponente, largo, com terrenos ao lado das criaturas; **Ver todos** volta. Ficou num botão em vez do clique no retrato, porque o retrato já serve para escolher o jogador como alvo ou defensor.
- [x] O espaço liberado vai para os oponentes exibidos: com dois à vista as criaturas crescem, com um só ficam do tamanho das suas.
- [x] Nunca esconder o que exige a atenção do jogador: o oponente que está atacando você, o dono de uma carta que você precisa escolher ou alvejar, um planeswalker que você pode atacar e um atacante que você pode bloquear voltam à vista sozinhos, com a etiqueta "À vista: …". O retrato do oculto continua clicável para alvos de jogador. O jogador ativo **não** volta sozinho: a cada turno de um oponente oculto, o campo dele reabriria e a escolha deixaria de valer.
- [x] A escolha vale durante a partida (por assento) e volta a mostrar todos numa nova partida. Nunca fica sem nenhum oponente à vista.
- [x] Teclado e leitor de tela: os botões têm nome e estado, o foco fica no botão correspondente depois da troca, e a mesa anuncia "Campo de … oculto" ou "Mostrando só o campo de …".
- [ ] Celular: hoje o oculto vira uma coluna só com retrato e um botão de olho. Faltam as abas com um oponente por vez.

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

## 29. Cartas exiladas sob uma criatura aparecem abaixo dela

Cartas que uma permanente exila "sob si" ou "com ela" (Banisher Priest, Hostage Taker, cartas com imprint como Isochron Scepter etc.) hoje só aparecem no exílio comum, sem ligação visível com quem as exilou. A ideia é mostrá-las presas à permanente, saindo por baixo dela, como os anexos.

- [ ] Descobrir como o Forge liga a carta exilada à fonte (`ExiledWith`, `Imprinted`, `encoded`) e mandar essa ligação pela ponte.
- [ ] Desenhar as cartas exiladas atrás da permanente, aparecendo pela borda de baixo (como o leque de auras e equipamentos, mas para baixo e com aparência de exílio).
- [ ] Contador e janela para ver todas quando forem várias, e a mesma lista no inspetor da permanente.
- [ ] Quando a permanente sai do campo, as cartas voltam a aparecer só no exílio.

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
- [ ] **Dia e noite** (`Game.isDay` / `isNight`): sol ou lua na trilha de fases, com balão da regra de troca. Some enquanto não for nem dia nem noite.
- [ ] **Contagem de mágicas no turno** (`Player.getSpellsCastThisTurn`, tempestade): número na trilha de fases ou no retrato quando houver carta na mesa que se importe (Storm, Prowess não precisa).
- [ ] **Bênção da cidade** (`Player.hasBlessing`, Ascend) e **Velocidade** (`Player.getSpeed`, Aetherdrift): selos no retrato.
- [ ] **Estados de uma vez só** (`isMonstrous`, `isRenowned`, `isSuspected`, `isSaddled`, `getCrewedByThisTurn`, `isExertedThisTurn`, `isDetained`, `isHarnessed`, `isSolved`): ícone pequeno na permanente; o nome em português e o que muda ficam no balão e no inspetor. Suspeita e Exaurida mudam o combate, as outras habilitam habilidades.
- [ ] **Ligações entre cartas** (`getPairedWith` do Soulbond, `getEncodedCards` do Cipher, `getHaunting`/`getHauntedBy`): linha ou destaque entre as duas ao passar o mouse, e a lista no inspetor. Junto do item 29 (exiladas sob a criatura), que usa `getExiledWith`/`getImprintedCards`.
- [ ] **Batalhas** (`CardView.getProtectingPlayer`): quem defende a batalha, ao lado dos marcadores de defesa.
- [ ] **Previstas no exílio** (`isForeTold`): para o dono, mostrar qual carta está prevista e o custo; para os outros, só "Prevista" no verso.

Prioridade baixa:
- [ ] **Tamanho máximo da mão** (`PlayerView.getMaxHandSize` / `hasUnlimitedHandSize`): só quando diferente de 7 (Reliquary Tower, Spellbook).
- [ ] **Pilha mais completa**: marcar cópias de mágica (`isCopiedSpell`), o valor de X escolhido e os custos opcionais pagos (`StackItemView.getOptionalCostString`, kicker, gift). Conferir antes o que o texto da pilha já traz.
- [ ] **Vida ganha e perdida no turno** (`getLifeGainedThisTurn`, `getLifeLostThisTurn`): no balão do retrato, para cartas de revolta, sangue e afins.

Para cada um: mandar o dado pela ponte só quando existir (como `ringTempted`), testar com o motor real em `forge-bridge/src/test`, montar a página de teste e entrar no `CHANGELOG.md` com prints em **Novidades em imagens**.

## 31. Caixa de ação por cima dos terrenos ✅

A caixa ao lado dos botões de ação, quando mostra uma frase (escolher alvo, pagar custo) ou uma escolha de cartas, cresce para cima e ficava por cima dos últimos terrenos da direita. Às vezes era justamente um desses terrenos que precisava ser escolhido, e não havia como alcançá-lo.

- [x] No computador, a fileira de terrenos sempre termina antes da caixa, na largura dela com uma escolha de cartas (a mais larga), como já acontecia no celular. Nada muda de lugar quando a caixa aparece; com muitos terrenos a fileira rola.
- [x] No celular, a caixa de escolha de cartas fica na largura dos botões, com os botões um embaixo do outro, em vez de passar por cima dos terrenos.
- [x] Conferido no duelo, no Commander com vários jogadores e no celular.

## 32. Entender uma remoção que passou despercebida

Distraído, o jogador olha a mesa e uma permanente sua sumiu, sem ter visto a pilha. Hoje fica difícil descobrir o porquê. Levantamento feito em 26/10/2026:

- O histórico existe (Menu → Registro), mas fica escondido e diz só "Carta destruída: X.", sem a mágica ou habilidade que causou.
- A ponte não liga a saída do campo à causa: o evento `left` (`VisibleEvents.java`) leva só a carta, o destino e o motivo (destruída ou sacrificada). O moer já faz essa ligação com `millSource()`, olhando o que está resolvendo no topo da pilha.
- Remoção em massa é justamente o caso que a mesa não mostra: com mais de 12 eventos na fila (`QUEUE_LIMIT` em `presentationTimeline.ts`), ela pula as animações e mostra só as 4 últimas. Com a aba escondida, tudo passa sem animação.
- O histórico guarda 60 eventos: um wrath com gatilhos de morte pode empurrar a própria mágica para fora.

Alternativas (recomendado: A + B, e talvez D):

- [ ] **A. Causa no histórico** (base para as outras): a ponte grava em `left` a carta que estava resolvendo e o `stackId` dela, e o histórico junta tudo numa linha ("Wrath of God (Ana) destruiu 7 permanentes: 3 suas — Llanowar Elves, …"). Mudar também o limite de 60 eventos, ou fazer a remoção em massa ocupar uma linha só, para a causa não sair do histórico.
- [ ] **B. Resumo "Enquanto você não olhava"**: um aviso que fica na tela até o jogador fechar, quando ele perde permanentes por efeito de outro jogador e a mesa não mostrou isso direito (fila pulada, aba escondida ou 3 ou mais de uma vez). Mostra a carta causadora, miniaturas do que saiu e um link para o histórico.
- [ ] **C. Fantasma no lugar da carta**: a vaga fica esmaecida por alguns segundos, ou até a próxima ação, com "Destruída por …". Com muitas cartas o campo fica poluído, e a mesa ainda reorganiza as fileiras.
- [ ] **D. Histórico à mão**: botão do Registro direto na mesa, com contador de eventos não vistos.

A decidir antes de começar: qual combinação; se o resumo vale só para as permanentes do jogador ou também para as do oponente; se aparece só quando a mesa não mostrou a remoção ou em toda remoção em massa.

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

## 35. Bracket de cada deck

Registrar o bracket (a faixa de poder oficial do Commander: 1 Exibição, 2 Básico, 3 Melhorado, 4 Otimizado, 5 cEDH) de cada deck de Commander, tanto dos decks prontos quanto dos decks do jogador, para combinar partidas de força parecida. Só vale para Commander. Levantamento feito em 27/10/2026:

- Hoje nenhum deck guarda o bracket: os decks prontos (`shared/starter-decks.json`) têm nome, cartas, formato e preço; os do jogador, o mesmo sem o preço.
- Parte do bracket dá para calcular pelas cartas, mas o resto é intenção de quem montou o deck: um deck sem nada que pese pode ser 1 ou 2. Por isso o jogador escolhe, mas nunca abaixo do mínimo calculado.

**Onde fica guardado** (sem consultas repetidas):

- Decks prontos: o bracket fica no próprio código, em `shared/starter-decks.json`, como o preço. Calculado uma vez pelo script e conferido à mão.
- Decks do jogador: o bracket (o mínimo calculado e o escolhido) fica no dispositivo, junto com o deck. O mínimo só é recalculado quando a lista de cartas muda, e o cálculo é todo local, com as listas abaixo; nada de consultar sites ao abrir a biblioteca ou escolher deck.
- As listas de cartas que pesam no cálculo ficam em arquivos do código (como `shared/commander-legality.json`), mantidas à mão depois de alimentadas uma vez por script.

**O que entra no cálculo**: tudo o que as regras de bracket olham.

- Game Changers (quantos).
- Destruição de terrenos em massa.
- Turnos extras (em sequência).
- Combos de duas cartas: só os mais usados, para a lista ficar pequena e conferível à mão.
- Tutores eficientes (quantos): os que buscam qualquer carta por pouca mana, como Demonic Tutor e Vampiric Tutor. Tutores de terreno, de criatura de um tipo ou caros não contam.

**De onde vêm as listas** (decidido, conferido em 27/10/2026):

- **Scryfall** para as listas de cartas: `is:gamechanger` (53 cartas, a lista oficial), `otag:mass-land-denial` (106), `otag:extra-turn` (53) e, para os tutores, `otag:tutor mv<=3 o:"search your library for a card"` (52 cartas, com alguns falsos positivos como Alpine Houndmaster, que a revisão à mão tira). É o mesmo caminho da legalidade do Commander (`update-commander-legality.py`), tem as listas completas e uma API estável.
- **Commander Spellbook** para os combos de duas cartas: é a base de combos que o próprio Archidekt usa, permite filtrar por `cards=2 legal:commander` e ordenar por `-popularity` (quantos decks do EDHREC usam o combo; o primeiro, Sanguine Bond + Exquisite Blood, está em cerca de 150 mil). A lista guarda os 100 mais usados, com o `bracketTag` de cada um.
- O Archidekt fica de fora como fonte das listas: os sinais por carta (`gameChanger`, `extraTurns`, `massLandDenial`, `tutor`, `twoCardComboIds`) só vêm dentro de um deck, sem uma lista avulsa. Serve só para trazer o `edhBracket` escolhido pelo dono na importação por link.
- O Commander Spellbook também tem uma rota que estima o bracket de um deck (`/estimate-bracket`), útil para conferir o cálculo local nos decks prontos, não para usar a cada deck.

- [ ] Script para alimentar as listas (Scryfall e Commander Spellbook) em arquivos do código; depois disso, ajustes à mão.
- [ ] Cálculo local do bracket mínimo com todos os sinais acima, explicando o porquê ("3 Game Changers: …; turno extra: …").
- [ ] Bracket dos decks prontos de Commander em `shared/starter-decks.json`, conferido à mão, com o selo na escolha de deck e na biblioteca.
- [ ] Bracket dos decks do jogador guardado no dispositivo: o jogador escolhe a partir do mínimo, nunca abaixo; se o deck ganhar uma carta que sobe o mínimo, o bracket sobe junto.
- [ ] Na importação por link do Archidekt, trazer o `edhBracket` do deck quando vier preenchido (respeitando o mínimo calculado).
- [ ] Mostrar o bracket de cada lugar na sala de espera e, talvez, filtrar a busca de salas e a escolha de deck por bracket.

Decks do jogador já salvos: o bracket é calculado na primeira abertura depois da atualização e guardado no dispositivo; dali em diante, só quando as cartas mudarem.

Combos: entram os 100 mais usados, com todas as marcações de `bracketTag`. Se a lista dos mais usados não se mostrar confiável, os combos saem do cálculo.

## 36. Histórico de jogadas mais detalhado e agrupado

O histórico da partida (Menu → Registro) é uma lista corrida, da jogada mais nova para a mais antiga, com uma frase curta por evento. Levantamento feito em 27/10/2026:

- Cada evento vira uma linha solta (`eventDescription` em `forgeTable.ts`): só o moer de várias cartas seguidas e o terreno jogado já viram uma linha só. Um turno cheio, ou uma remoção em massa, enche a lista de linhas parecidas.
- Não há separação por turno: a linha "Turno de Ana." aparece no meio das outras, sem número do turno nem fase.
- Faltam detalhes que a ponte já manda ou que a mesa já conhece: os alvos da mágica ou da habilidade, quem controlava a carta que saiu do campo, o custo pago, o resultado do combate (quem bloqueou quem, o que morreu). A saída do campo também não diz o que causou (ver item 32, alternativa A).
- Compras de carta ficam de fora (só tocam o som), então não dá para saber quantas cartas alguém comprou no turno.
- O limite de 60 eventos (`HISTORY_LIMIT` em `presentationTimeline.ts`) apaga o começo da partida bem rápido em Commander com quatro.

Alternativas (recomendado: A + B + C, e D junto com o item 32):

- [ ] **A. Agrupar por turno**: um cabeçalho por turno ("Turno 5 · Ana"), com as jogadas dele embaixo; os turnos antigos ficam recolhidos e abrem com um toque.
- [ ] **B. Juntar o que aconteceu junto**: a mágica e o que ela causou numa linha só ("Wrath of God (Ana) destruiu 7 permanentes"), com as cartas afetadas ao abrir a linha; o mesmo para o dano de combate e os gatilhos de morte em sequência.
- [ ] **C. Mais detalhes por linha**: alvos, controlador, de onde a carta veio e para onde foi, compras ("Bruno comprou 2 cartas"), com miniatura da carta e toque para ampliar (como já acontece no nome da carta).
- [ ] **D. Causa da saída do campo**: é a alternativa A do item 32; vale fazer junto, porque o agrupamento de B depende dela.
- [ ] **E. Guardar a partida inteira**: tirar ou aumentar bastante o limite de 60, já que o agrupamento deixa a lista curta.
- [ ] **F. Filtros**: só minhas jogadas, só de um oponente, só combate, só remoções.

A decidir antes de começar: se os turnos antigos ficam recolhidos ou abertos; até onde vão os detalhes (custo pago e fase podem poluir); se as compras dos oponentes aparecem com a quantidade (é informação pública na mesa de verdade).

## 37. Registrar partidas abandonadas como concedidas

O histórico de partidas da área de admin só grava a série que termina de verdade (o Forge dá a partida por encerrada). Levantamento feito em 27/10/2026:

- Quem sai da sala no meio, fecha a aba e não volta no prazo de reconexão, ou abandona a partida contra a IA, some do histórico: a partida só vira o contador "abandonada" nas métricas, sem jogadores, decks nem vencedor.
- Na sala em rede, sair já conta como conceder o jogo atual, e o oponente vê a partida encerrada; mas a série não chega a ser concluída, então nada é gravado.
- Com isso, as estatísticas por deck e por jogador contam só quem jogou até o fim, e quem costuma desistir de partidas perdidas não aparece.

Alternativas (recomendado: A + B):

- [ ] **A. Gravar como concessão**: ao encerrar uma partida abandonada, gravar a linha do histórico com os jogos já disputados, o jogo atual como derrota de quem saiu (motivo "concedeu") e a vitória da série para quem ficou.
- [ ] **B. Marcar o jeito que acabou**: um campo novo na linha (concluída, concedida, abandonada por queda) para filtrar na área de admin e não misturar com as partidas jogadas até o fim.
- [ ] **C. Abandono antes do primeiro turno**: não gravar nada quando ninguém chegou a jogar (mulligan, sala que nem começou), para não encher o histórico.
- [ ] **D. Contra a IA**: gravar também as partidas abandonadas contra a IA, ou deixar só as salas em rede.

A decidir antes de começar: se a queda sem volta conta como concessão de quem caiu (e se for todo mundo, quem perde); em Commander, quando um jogador sai e os outros continuam, se a saída dele já entra no histórico ou só no fim da partida.
