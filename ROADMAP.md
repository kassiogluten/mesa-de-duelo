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

- [ ] Nova opção em **Opções** da partida (junto de sons e passar automaticamente): "Aparência das cartas" com **Imagem completa** (como hoje) e **Arte e texto** (layout próprio). Fica salva no aparelho e vale na hora, sem recarregar.
- [ ] Layout próprio: arte recortada do Scryfall (`art_crop`) no topo, com nome, custo de mana em símbolos, linha de tipo, texto de regras em português (o que a mesa já busca) e poder/resistência ou lealdade, na moldura da cor da carta.
- [ ] Texto legível no tamanho da mesa: no campo, mostrar só nome, custo e P/R (o texto completo fica no inspetor); na mão e no inspetor, o texto inteiro, reduzindo a fonte quando for longo.
- [ ] Casos especiais: cartas de duas faces, sagas, planeswalkers, fichas sem arte, terrenos básicos (arte maior, sem caixa de texto) e cartas viradas para baixo.
- [ ] Manter marcadores, selos de custo, brilhos de jogável/alvo/atacando e animações funcionando igual nos dois modos.
- [ ] Usar também no construtor de decks e nos modais de escolha, ou deixar claro que a opção vale só para a mesa.
- [ ] Combina com o cache de imagens (item 10): `art_crop` é bem menor que a imagem inteira.
