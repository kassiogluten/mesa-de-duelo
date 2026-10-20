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
- [x] Dano prevenido (escudo): domo transparente sobre o alvo, o número riscado e o selo "Prevenido". Dados: o Forge não avisa; a ponte vê o escudo de prevenção ("previna os próximos N") diminuir e manda `damage` com `prevented: true`. Prevenções sem escudo (Neblina e afins) ainda não aparecem.
- [x] Dano dividido entre vários alvos: vários projéteis saindo juntos da mesma fonte, cada um com seu número e o selo "Dividido". Dados: vários `damage` seguidos da mesma fonte, fora do combate, saem juntos da fila.
- [x] Dano a si mesmo (dor: Sol Ring de dor, terrenos de dor, Phyrexian): o golpe "volta" para o próprio retrato, sem trajeto longo. Dados: `damage` em que o alvo é quem controla a fonte.
- [x] Dano de comandante (Commander): selo de comandante no impacto e o contador "Dano x/21" pulsando. Dados: `commander: true` no `damage` de combate.
- [x] Letal: criatura com dano igual ou maior que a resistência (ou com toque mortífero) treme e escurece antes de ir ao cemitério; jogador chegando a 0 de vida tem um impacto maior. Dados: `lethal: true` no `damage` (calculado pela ponte com a resistência e o dano marcado).
- [x] Tremor leve da mesa em dano grande (5 ou mais, ou letal no jogador).
- [x] Respeitar "reduzir movimento" do sistema: sem projéteis nem tremor, só o número e o destaque no alvo.
- [x] Som próprio para cura, veneno (e −1/−1), escudo e carta destruída; golpe e projétil usam os sons de impacto que já existiam.
- [ ] Conferir desempenho no celular com combates grandes (muitas criaturas atacando ao mesmo tempo).

## 16. Efeitos de movimento das permanentes no estilo do Arena

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

## 17. Efeitos visuais contínuos nas permanentes

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
- [ ] Vigilância: olho discreto no canto; ao atacar, a carta continua de pé com um brilho rápido. Dados: `VIGILANCE`. (Por ora só o ícone de palavra-chave que já existia.)
- [x] Ímpeto e enjoo de invocação: criatura com enjoo levemente apagada no turno de quem a controla, com o "zZ" atual; com ímpeto, um brilho alaranjado na base enquanto ela ainda é nova. Dados: `sick`, `HASTE`.
- [x] Defensor: moldura de muralha na base, sem brilho. Dados: `DEFENDER`.
- [x] Ameaçar: borda vermelha serrilhada discreta. Dados: `MENACE`.
- [ ] Atropelar: marca de pegadas no canto. Dados: `TRAMPLE`. (Por ora só o ícone de palavra-chave que já existia.)
- [x] Fases fora (phasing): carta translúcida, com contorno tracejado, até voltar. Dados: `phasedOut`, exposto pela ponte.
- [ ] Virada para baixo (morph, disfarce, manifestar): o verso já aparece e agora tem um selo "2/2" ✅; falta o tipo no selo ("Metamorfose", "Disfarce", "Manifestada"), que precisa vir da ponte. Dados: `faceDown`.
- [x] Fichas e cópias: fichas com borda prateada (além do selo "Ficha"); cópias com o selo "Cópia", que mostra o original ao passar o mouse. Dados: `token`, `copyOf`.
- [x] Não pode atacar ou não pode bloquear: corrente cinza fina na base, e o leitor de tela diz qual dos dois. Dados: `cantAttack` / `cantBlock`, calculados pela ponte com as regras de combate do Forge.
- [x] Encantada ou equipada: o leque de anexos atrás da carta (que já existia) faz a ligação, e a carta encantada ganha um brilho da cor da aura. Dados: `attachedTo` de quem está preso.
- [x] Alvo de algo na pilha: mira pulsando no meio da arte enquanto o efeito estiver na pilha, azul se foi você, laranja se foi o oponente. Dados: `targets` de cada item de `stack`.
- [x] Prevenção de dano: selo "Prevenir 3" embaixo da carta enquanto o escudo durar. Dados: `preventDamage`, exposto pela ponte (também nos jogadores; o retrato ainda não mostra).
- [x] Marcadores +1/+1 e −1/−1: brilho verde ou roxo fraco atrás da carta, além do número. Dados: `counters`.

## 18. Laboratório de efeitos

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
- [ ] nginx: `limit_conn` e `limit_req` por IP em `/ws` (novas conexões por segundo e conexões abertas ao mesmo tempo), com rajada pequena permitida; `/metrics` só para a rede interna (Prometheus), não para a internet.
- [ ] Ponte: limite de partidas e salas abertas ao mesmo tempo por IP e no total do servidor (fila ou recusa com aviso quando a máquina estiver cheia), e tempo máximo para salas vazias ou paradas.
- [ ] Ponte: limite de mensagens por conexão (por exemplo, balde de fichas por segundo), descartando ou fechando a conexão que inundar; respostas de jogo legítimas (passar, atacar, escolher) nunca podem esbarrar no limite.
- [ ] Busca de sala pelo código: limitar tentativas por IP para ninguém varrer os códigos até achar uma sala alheia.
- [ ] Importar por link: poucas importações por minuto por IP, cache curto do mesmo link, e respeitar os limites do Moxfield e do Archidekt (fila com intervalo mínimo e `User-Agent` identificado).
- [ ] Imagens (item 10): o limite de buscas ao Scryfall já previsto lá, mais um limite por IP no endpoint para não virar um jeito de forçar downloads.
- [ ] Busca de cartas no construtor de decks: o aparelho já fala direto com a API do Scryfall; conferir que a busca espera o jogador parar de digitar e respeita os ~10 pedidos por segundo que o Scryfall pede.
- [ ] Mensagem para o jogador quando bater no limite ("Muitas tentativas, espere alguns segundos") em vez de erro genérico ou conexão caindo sem explicação.
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

## 21. Deck médio do EDHREC no construtor de Commander ✅

No formato Commander, o jogador escolhe o comandante e o deck é preenchido com o "deck médio" do EDHREC, passando pela mesma revisão da importação.

- [x] Fonte: `https://json.edhrec.com/pages/average-decks/{slug}.json` → `deck.commander` (nomes) e `deck.cards` agrupado por tipo, cada carta como `[nome, quantidade]` (um grupo pode ter subgrupos). Número de decks em `container.json_dict.card.num_decks`; a data mostrada é a do deck mais recente em `savedate_counts`.
- [x] Slug conferido com casos reais: nome em inglês, só a face da frente (`Esika, God of the Tree // …` → `esika-god-of-the-tree`), sem acentos (`Lim-Dûl` → `lim-dul`), sem apóstrofos, vírgulas ou dois-pontos (`Ratonhnhaké:ton` → `ratonhnhaketon`), espaços e hífens viram um hífen. Duplas: os dois slugs juntos; na ordem "errada" o EDHREC responde `{"redirect": "/average-decks/…"}` e a ponte segue uma vez (vale para parceiros e antecedentes). Variações `/{slug}/budget`, `/expensive` e temas também existem.
- [x] Ponte (`DeckLinks.java`, site `edhrec` na mensagem `fetch-deck`): só monta o endereço a partir de um slug validado (`[a-z0-9]+(-[a-z0-9]+)*`, com uma variação opcional), e só segue redirecionamentos para outro slug válido. Comandante sem deck médio responde **403** (não 404) com XML do S3; vira "o EDHREC não tem deck médio para este comandante".
- [x] Frontend: bloco "Deck médio do EDHREC" na importação (formato Commander), botão no comandante do editor, nome em português resolvido pelo Scryfall, link `edhrec.com/average-decks/…` ou `edhrec.com/commanders/…` aceito no campo da lista. A origem (EDHREC, número de decks, data) aparece na revisão e fica como comentário no topo da lista original salva.
- [ ] Alguns decks médios vêm com 99 cartas no total (ex.: Kraum + Tymna), porque a média do EDHREC arredonda. A validação aponta; dá para sugerir completar com terrenos básicos.
- [ ] Ao adicionar a lista a um deck que já tem cartas, cópias repetidas somam (a validação de Commander aponta). Talvez um modo "completar o deck" que pule as cartas que já estão nele.

**Termos de uso do EDHREC (lidos em 19/10/2026, versão de 06/08/2024, edhrec.com/terms):** não há API pública documentada; o JSON é o que o próprio site usa. Os termos dão licença de acesso "somente para uso pessoal e não comercial", proíbem "gerar buscas, requisições ou consultas automatizadas ao site" por software ou scripts, e proíbem copiar, redistribuir ou republicar partes do site sem indicação em contrário. O `robots.txt` do site não bloqueia `/average-decks/` (e o EDHREC publica um sitemap dessas páginas), mas isso não muda os termos. Como fizemos para ficar o mais perto possível do permitido: uma requisição por ação do jogador, sem cache nem coleta em lote, sem guardar ou redistribuir os dados do EDHREC no projeto (os testes usam dados inventados), com a origem e o link de volta para o EDHREC na revisão. **Mesmo assim, é uma consulta automatizada a partir de um servidor.** Antes de abrir para muita gente (ou se o projeto tiver qualquer receita), pedir autorização ao EDHREC (contato do site) ou trocar por um link que o jogador abre e cola. Se o EDHREC pedir, basta tirar o site `edhrec` de `DeckLinks.java`.

## 22. Distribuir o dano de combate em bloqueios duplos ✅

Quando o atacante é bloqueado por duas ou mais criaturas (ou tem atropelar), o Forge pede a divisão do dano. Antes, a ponte respondia sozinha com letal em ordem.

- [x] Ponte: pergunta `combat-damage` com o atacante, o total, o letal de cada bloqueador (toque mortífero e planeswalker inclusos), o defensor quando há atropelar e a divisão automática sugerida.
- [x] Mesmas regras do diálogo do Forge, validadas na ponte: total exato, ordem entre bloqueadores quando o Forge pede, defensor só depois de letal em todos.
- [x] Tela na mesa: atacante, alvos com − / +, Letal, Todo o resto, Distribuição automática, motivo de cada trava, minimizar para ver a mesa, leitor de tela.
- [x] Teste no motor real com bloqueio duplo numa partida em rede (`forge-bridge/scripts/test-combat-damage.mjs`).
- [ ] Bloqueador que bloqueia vários atacantes (a mesma pergunta, vista pelo lado de quem bloqueia): o Forge já usa o mesmo método, mas falta conferir numa partida.
- [ ] Integrar com os efeitos de dano (itens 15 e 18): pré-visualizar na mesa quem morre com a divisão escolhida.


## 23. Botão "Sem bloqueio" quando nenhum bloqueador foi escolhido

Na declaração de bloqueadores, o botão de confirmar diz **Confirmar bloqueios** mesmo quando o jogador não escolheu nenhum bloqueador, o que deixa dúvida se ele vai mesmo levar o dano todo.

- [ ] Sem bloqueadores selecionados, o botão vira **Sem bloqueio**; com um ou mais, volta para **Confirmar bloqueios** (`src/ui/forgeTable.ts`, onde o rótulo de `s.input.blocking` é montado).
- [ ] Trocar o rótulo na hora em que o jogador marca ou desmarca um bloqueador, sem esperar a resposta do servidor.
- [ ] Leitor de tela: anunciar o novo rótulo.

## 24. Animação de mill

Quando cartas vão do topo do grimório direto para o cemitério (moer, "mill"), hoje elas só aparecem no cemitério e o grimório diminui, sem mostrar o movimento. Fica difícil perceber quantas cartas saíram e quais foram, principalmente quando é o oponente que moeu.

- [ ] Ponte: avisar o mill como evento próprio, com o jogador, as cartas na ordem em que saíram do grimório e a fonte (a mágica ou habilidade que mandou moer). O Forge já marca esse momento ("Cards milled").
- [ ] Mesa: as cartas saem do topo do grimório uma a uma, viram de face para cima e voam até o cemitério, com um pequeno intervalo entre elas. Com muitas cartas (moer 10 ou mais), acelerar ou agrupar em leque para não travar a partida.
- [ ] Mostrar o total moído junto ao grimório (ex.: "−4") e anunciar no leitor de tela quantas cartas foram e quais.
- [ ] Respeitar o ritmo rápido e o "reduzir movimento" do sistema: sem animação, só o destaque no cemitério.
- [ ] Incluir no laboratório de efeitos (item 18): moer 1, 3 e 10 cartas, dos dois lados.

## 25. Escolher quais oponentes ver na mesa ✅

Em partidas com três ou mais jogadores (Commander), todos os oponentes dividem a parte de cima da tela. Com quatro jogadores, cada campo fica pequeno, e quem quer acompanhar de perto uma ameaça ou o oponente que está atacando não tem como dar mais espaço a ele.

- [x] Cada oponente tem **Ocultar** e **Só este** no cabeçalho do campo. O oculto vira uma coluna estreita com retrato, vida, cartas na mão, marcadores (veneno e outros), dano de comandante, grimório e cemitério, e **Mostrar campo** traz o campo de volta (`src/ui/seatVisibility.ts`).
- [x] Atalho "só este": mostra só o campo daquele oponente, largo, com terrenos ao lado das criaturas; **Ver todos** volta. Ficou num botão em vez do clique no retrato, porque o retrato já serve para escolher o jogador como alvo ou defensor.
- [x] O espaço liberado vai para os oponentes exibidos: com dois à vista as criaturas crescem, com um só ficam do tamanho das suas.
- [x] Nunca esconder o que exige a atenção do jogador: o oponente que está atacando você, o dono de uma carta que você precisa escolher ou alvejar, um planeswalker que você pode atacar e um atacante que você pode bloquear voltam à vista sozinhos, com a etiqueta "À vista: …". O retrato do oculto continua clicável para alvos de jogador. O jogador ativo **não** volta sozinho: a cada turno de um oponente oculto, o campo dele reabriria e a escolha deixaria de valer.
- [x] A escolha vale durante a partida (por assento) e volta a mostrar todos numa nova partida. Nunca fica sem nenhum oponente à vista.
- [x] Teclado e leitor de tela: os botões têm nome e estado, o foco fica no botão correspondente depois da troca, e a mesa anuncia "Campo de … oculto" ou "Mostrando só o campo de …".
- [ ] Celular: hoje o oculto vira uma coluna só com retrato e um botão de olho. Faltam as abas com um oponente por vez.
