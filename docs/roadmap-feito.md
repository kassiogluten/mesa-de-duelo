# Roadmap: itens concluídos

Seções do `ROADMAP.md` já entregues (✅) ou descartadas (❌), com o número original.

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

## 31. Caixa de ação por cima dos terrenos ✅

A caixa ao lado dos botões de ação, quando mostra uma frase (escolher alvo, pagar custo) ou uma escolha de cartas, cresce para cima e ficava por cima dos últimos terrenos da direita. Às vezes era justamente um desses terrenos que precisava ser escolhido, e não havia como alcançá-lo.

- [x] No computador, a fileira de terrenos sempre termina antes da caixa, na largura dela com uma escolha de cartas (a mais larga), como já acontecia no celular. Nada muda de lugar quando a caixa aparece; com muitos terrenos a fileira rola.
- [x] No celular, a caixa de escolha de cartas fica na largura dos botões, com os botões um embaixo do outro, em vez de passar por cima dos terrenos.
- [x] Conferido no duelo, no Commander com vários jogadores e no celular.

## 32. Entender uma remoção que passou despercebida ✅

Distraído, o jogador olha a mesa e uma permanente sua sumiu, sem ter visto a pilha. Hoje fica difícil descobrir o porquê. Levantamento feito em 26/10/2026:

- O histórico existe (Menu → Registro), mas fica escondido e diz só "Carta destruída: X.", sem a mágica ou habilidade que causou.
- A ponte não liga a saída do campo à causa: o evento `left` (`VisibleEvents.java`) leva só a carta, o destino e o motivo (destruída ou sacrificada). O moer já faz essa ligação com `millSource()`, olhando o que está resolvendo no topo da pilha.
- Remoção em massa é justamente o caso que a mesa não mostra: com mais de 12 eventos na fila (`QUEUE_LIMIT` em `presentationTimeline.ts`), ela pula as animações e mostra só as 4 últimas. Com a aba escondida, tudo passa sem animação.
- O histórico guarda 60 eventos: um wrath com gatilhos de morte pode empurrar a própria mágica para fora.

Alternativas (recomendado: A + B, e talvez D):

- [x] **A. Causa no histórico** (base para as outras): a ponte grava em `left` a carta que estava resolvendo e o `stackId` dela, e o histórico junta tudo numa linha ("Wrath of God (Ana) destruiu 7 permanentes: 3 suas — Llanowar Elves, …"). Mudar também o limite de 60 eventos, ou fazer a remoção em massa ocupar uma linha só, para a causa não sair do histórico.
- [ ] **B. Resumo "Enquanto você não olhava"**: um aviso que fica na tela até o jogador fechar, quando ele perde permanentes por efeito de outro jogador e a mesa não mostrou isso direito (fila pulada, aba escondida ou 3 ou mais de uma vez). Mostra a carta causadora, miniaturas do que saiu e um link para o histórico.
- [ ] **C. Fantasma no lugar da carta**: a vaga fica esmaecida por alguns segundos, ou até a próxima ação, com "Destruída por …". Com muitas cartas o campo fica poluído, e a mesa ainda reorganiza as fileiras.
- [ ] **D. Histórico à mão**: botão do Registro direto na mesa, com contador de eventos não vistos.

A decidir antes de começar: qual combinação; se o resumo vale só para as permanentes do jogador ou também para as do oponente; se aparece só quando a mesa não mostrou a remoção ou em toda remoção em massa.

Decidido em 29/10/2026 (versão 0.71.0): no lugar de B, C e D, uma janela só, no estilo da que mostra cartas reveladas, em toda remoção feita por outro jogador, das suas permanentes e das dos oponentes. Ela abre quando a mesa termina de mostrar a jogada (ou quando a aba volta a ficar visível) e espera qualquer escolha ou outra janela fechar; o jogo não espera por ela. Mostra a carta que causou, o título "Wrath of God (Ana) destruiu 7 permanentes" e as cartas que saíram, agrupadas por dono (as suas primeiro). Ficam de fora as remoções que você mesmo fez, as mortes em combate, os custos (sacrificar para ativar) e o blink. Várias seguidas abrem uma depois da outra, até 5 na fila. A ponte manda agora em `left` o `stackId` e o `sourceName` do que está resolvendo (como já fazia em `entered`). A criatura que morre pelas ações baseadas no estado logo depois da mágica (dano de um Raio, -2/-2 do Disfigure) sai sem `stackId`, e a mesa usa a última resolução, desde que só efeitos dela tenham vindo no meio (`src/ui/removalNotice.ts`; `forge-bridge/scripts/test-removal-source.mjs` confere os dois casos no motor). Do item A, o histórico já juntava a mágica e o que ela causou e guardava 3000 eventos; agora também diz de quem eram as permanentes ("destruiu 7 permanentes (3 suas e 4 de Ana)").

## 35. Bracket de cada deck ✅

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

- [x] Script para alimentar as listas (Scryfall e Commander Spellbook) em arquivos do código; depois disso, ajustes à mão (0.72.0: `update-commander-brackets.py` → `shared/commander-brackets.json`, com os falsos positivos de tutores e de destruição de terrenos tirados à mão no próprio script).
- [x] Cálculo local do bracket mínimo com todos os sinais acima, explicando o porquê ("3 Game Changers: …; turno extra: …") (0.72.0, `src/brackets.ts`): 1 a 3 Game Changers pedem 3, 4 ou mais pedem 4; destruição de terrenos em massa pede 4; 3 ou mais cartas de turno extra (dá para encadear) pedem 4, menos que isso só informa; combos pelo `bracketTag` (E 1, C e O 2, P e S 3, R 4). Os tutores só informam: a Wizards os tirou das regras de bracket em 21/10/2025 (os mais fortes já são Game Changers).
- [x] Bracket dos decks prontos de Commander em `shared/starter-decks.json`, conferido à mão, com o selo na escolha de deck e na biblioteca (0.72.0: o mínimo calculado, pelo menos 2; conferido contra o `/estimate-bracket` do Commander Spellbook, que subiu Banquete de Sangue e Kilo para 4 e Estouro Jurássico para 3 por combos fora dos 100 mais usados).
- [x] Bracket dos decks do jogador guardado no dispositivo: o jogador escolhe a partir do mínimo, nunca abaixo; se o deck ganhar uma carta que sobe o mínimo, o bracket sobe junto (0.72.0: só o escolhido fica guardado no deck; o mínimo é recalculado na hora, todo local e sem consulta a sites, e sem escolha o deck fica em 2 ou no mínimo, se for maior).
- [x] Na importação por link do Archidekt, trazer o `edhBracket` do deck quando vier preenchido (respeitando o mínimo calculado).
- [x] Mostrar o bracket de cada lugar na sala de espera (0.72.0, também na lista de salas públicas: "Bracket 3" ou "Brackets 2 a 4", e dentro da partida, no selo "B3" de cada jogador, inclusive contra o computador).
- [ ] Filtrar a busca de salas e a escolha de deck por bracket (deixado para depois).

Decks do jogador já salvos: o bracket é calculado na primeira abertura depois da atualização e guardado no dispositivo; dali em diante, só quando as cartas mudarem.

Combos: entram os 100 mais usados, com todas as marcações de `bracketTag`. Se a lista dos mais usados não se mostrar confiável, os combos saem do cálculo.

## 38. Mostrar a versão durante a partida ✅

Hoje a versão da mesa (a do topo do `CHANGELOG.md`) só aparece no painel Novidades da tela inicial. Durante a partida não há onde ver, e isso atrapalha quando alguém manda um print ou relata um erro: não dá para saber se a pessoa está numa versão antiga guardada no navegador ou no app instalado. Levantamento feito em 27/10/2026:

- A ponte já manda as versões das regras e do motor (`rulesVersion`, `engineVersion`), e elas vão no relato de erro, mas a versão da própria mesa não vai.
- O menu da partida já tem um canto de informações discretas no topo (sala e placar da série).

Alternativas para mostrar (recomendado: A + D):

- [x] **A. Rodapé do menu**: uma linha pequena e apagada no fim do menu da partida ("Mesa de Duelo 0.54.1"), abaixo de "Desistir e voltar ao início". Só vê quem abre o menu.
- [ ] **B. Rodapé de Opções**: a mesma linha no fim da janela de Opções, que é onde se procura esse tipo de coisa num jogo.
- [ ] **C. Escondido**: só aparece com um toque longo (ou passando o mouse) no botão do menu, como dica.
- [x] **D. No relato e no "Copiar relatório"**: incluir a versão da mesa junto das versões de regras e motor, para o admin ver sem depender do print.
- [x] **E. Versões da ponte junto**: ao tocar na linha da versão, mostrar também regras e motor (útil para teste, sem pesar para o jogador).

Decidido em 28/10/2026: A + D + E, com o texto "Mesa de Duelo X.Y.Z". D já estava pronto (o relato leva `app.version` e o "Copiar relatório" tem a linha "versão da mesa"). O aviso de versão nova já existe: é o banner "Nova versão do jogo" do app (`src/ui/pwa.ts`), que aparece também durante a partida.

## 39. Cálculo de vida ao definir bloqueadores ✅

Na declaração de bloqueadores, o jogador precisa somar de cabeça o poder de cada atacante que ficou sem bloqueio para saber com quanta vida vai sair do combate, e se o combate é letal. Em Commander, com vários atacantes, atropelar e dano de comandante, a conta fica difícil e é fácil errar.

- [x] Mostrar, enquanto o jogador escolhe os bloqueadores, a vida prevista depois do combate ("20 → 13"), atualizando a cada bloqueio marcado ou desfeito.
- [x] Destacar quando o combate é letal ("Letal!") ou deixa a vida muito baixa, para o jogador perceber antes de confirmar.
- [x] Entrar na conta: atacantes sem bloqueio, golpe duplo, excesso de atropelar sobre o bloqueador (pelo letal do bloqueador, como na divisão do item 22), dano de comandante (21) e veneno de infectar (10), cada um com o seu limite.
- [x] Também no ataque ao planeswalker: a lealdade prevista dele.
- [x] Leitor de tela: anunciar a vida prevista quando ela mudar.

Decidido em 28/10/2026: a conta vem da ponte (`CombatForecast`, com as contas do Forge em `ComputerUtilCombat`: prevenção, proteção, golpe duplo, atropelar, infectar e veneno extra), e vai no estado como `forecast` só na etapa de declarar bloqueadores. Aparece nos dois lugares: selo no retrato de cada jogador atacado, que todos na mesa veem, e uma frase na caixa de ação de quem bloqueia, junto do **Confirmar bloqueios**. "Vida muito baixa" quer dizer 5 ou menos, ou estar a 2 do limite de veneno ou de dano de comandante. Ficou de fora: vida ganha por bloqueadores com vínculo com a vida e gatilhos de combate (como "sempre que atacar"), que o Forge também não prevê.

## 40. Vidência com as cartas inteiras ✅

Na vidência (scry) de mais de uma carta, a escolha do que vai para o fundo do grimório mostra só o nome de cada carta. Para decidir, o jogador precisa saber o que a carta faz, e acaba tendo que lembrar ou adivinhar. Na vigilância (surveil) com várias cartas, a escolha já mostra cada carta inteira, com os detalhes.

- [x] Mostrar as cartas da vidência inteiras (imagem ou "Arte e texto", conforme a opção do jogador), do mesmo jeito da vigilância com várias cartas, em vez da lista de nomes.
- [x] Tocar na carta abre o inspetor, com o texto em português.
- [x] Manter a ordem do topo do grimório visível (qual é a primeira) e a escolha de topo ou fundo de cada carta, inclusive a ordem das que ficam no topo.
- [x] Funcionar em tela estreita e com muitas cartas (vidência 3 ou mais), sem cobrir os botões de confirmar.
- [x] Leitor de tela: anunciar o nome e o tipo de cada carta, como hoje.

Decidido em 28/10/2026: a diferença não estava na ponte. O Forge pergunta a vidência e a vigilância do mesmo jeito (dois passos: o que sai do topo e, se sobrar mais de uma, a ordem das que ficam), e a ponte já mandava as cartas inteiras, na ordem do grimório, nas duas (conferido com um teste no motor); a lista só de nomes descrita acima não se repetiu nem na leitura do código nem na página de teste da mesa. O que atrapalhava estava na mesa: a escolha genérica de cartas ordena as opções por custo de mana e por nome, então a carta do topo podia aparecer em qualquer lugar, sem nada que dissesse qual era a primeira, e o passo da ordem só dava números por toque. Agora a ponte marca as duas perguntas (`purpose: "library"`, com o passo `bottom`, `graveyard` ou `top`), reconhecidas pelas mensagens do próprio Forge, e a mesa tem uma tela própria, usada também pela vigilância para as duas continuarem iguais: cartas na ordem do grimório, com o número da posição e **Topo** na primeira; tocar na carta abre o inspetor, e a escolha fica em dois botões embaixo de cada carta (**Topo** e **Fundo**, ou **Cemitério**), com todas começando no topo e uma frase de resumo. No passo da ordem, a carta da esquerda é a do topo, setas trocam a carta com a vizinha e não há "Manter ordem", porque confirmar sem mexer já mantém. Em tela baixa as cartas encolhem e a seta de direção some; com muitas cartas a fileira rola de lado, e os botões de confirmar ficam presos embaixo. O leitor de tela lê nome, tipo, posição e destino de cada carta, e anuncia o resumo ou a nova posição a cada mudança. Ficou de fora: arrastar as cartas entre topo e fundo, como no Arena, e escolher a ordem das cartas que vão para o fundo (o Forge não pergunta).

## 41. Testar a mão revelada (Telepathy e afins) ✅

Cartas como Telepathy, Revelation e Seer's Vision fazem o oponente jogar com a mão revelada, e Gitaxian Probe, Thoughtseize e Duress mostram a mão por um momento. Ainda não foi testado como isso aparece na mesa. Pela leitura do código (28/10/2026), a ponte só manda as cartas da mão para o próprio dono: para os outros vai só a quantidade, então a mão revelada provavelmente não aparece.

- [x] Testar com Telepathy no campo (os dois lados, contra a IA e em sala em rede) e anotar o que aparece hoje.
- [x] Testar também quem revela a mão só uma vez (Gitaxian Probe, Peek) e quem escolhe uma carta da mão do oponente (Thoughtseize, Duress).
- [x] Se não aparecer: a ponte manda as cartas da mão para quem o Forge permite ver, e a mesa mostra a mão do oponente de face para cima (sem dar para jogar), com toque para ampliar.
- [x] Quando o efeito sai do campo, a mão volta a ficar escondida.
- [x] Commander: só para os jogadores que podem ver (Telepathy mostra a mão de todos os oponentes; outras cartas, só a de um).
- [x] Incluir no laboratório de efeitos (item 18).

Decidido em 28/10/2026: o teste na ponte (`RevealedHandTest`, com Telepathy e Revelation no campo, conferindo o estado que cada jogador recebe) confirmou que hoje não aparecia nada: o Forge já marcava as cartas como visíveis (`MayLookAt` das cartas, lido por `CardView.canBeShownTo`), mas a ponte mandava aos outros só `handCount`. Agora vai à parte, em `revealedHand`, só o que quem recebe pode ver pela regra do Forge (sem lista de nomes de cartas), como o topo do grimório; o espectador vê o que todos os jogadores veem, a mão jogável (`hand`) continua só do dono e as cartas não entram em `castable`. Telepathy segue o Forge: a mão dos oponentes fica à vista de todos (revelada é pública), a de quem a controla não; Revelation mostra todas; com a carta fora do campo, nada vai. Na mesa: no duelo, o leque do oponente vira de face para cima logo abaixo da linha do retrato (no lugar dele ficaria por baixo dos marcadores), com o selo "Mão revelada", e tocar abre o inspetor; com só parte da mão à vista, o resto fica de costas. No Commander, o selo da mão ganha o olho, com a etiqueta "Revelada" pendurada embaixo para não roubar o espaço do nome, e abre a galeria do cemitério/exílio com o título "Mão revelada" e a nota "Só para ver". A revelação momentânea já funcionava: Peek e Gitaxian Probe passam pelo `reveal()` do Forge, que a ponte manda como pergunta "reveal" com as cartas inteiras, e Thoughtseize e Duress pela escolha de cartas com as faces (a ponte desliga `UI_SELECT_FROM_CARD_DISPLAYS`, então o Forge não pede para tocar em cartas fora da mesa); conferido pela leitura do código e numa cena da página de teste do duelo. O laboratório de efeitos ganhou "Mão revelada" (revelar tudo, só uma carta, esconder). Ficou de fora: testar numa partida real contra a IA e em sala em rede (os testes foram na ponte e nas páginas de teste da mesa) e um teste automático da pergunta "reveal" passando pela ponte.

## 42. Carta de origem na escolha de alvos ✅

Quando um gatilho ou habilidade pede alvo antes de ir para a pilha, a mensagem no centro da mesa diz só o nome da carta ("Escolha um alvo para …"). A imagem da carta só aparece ali quando ela não está à vista na mesa; se a carta está no campo (o caso comum dos gatilhos), o jogador precisa achar a carta e abrir o inspetor para lembrar o que o efeito faz e que alvo serve.

- [x] Mostrar na mensagem a carta que está pedindo o alvo, inteira (imagem ou "Arte e texto", conforme a opção do jogador), também quando ela está no campo, enquanto o efeito ainda não foi para a pilha.
- [x] Destacar o texto da habilidade que disparou (gatilho ou habilidade ativada), em português, para não precisar ler a carta toda.
- [x] Mais detalhes do alvo: que tipo de alvo serve (criatura, jogador, planeswalker…), quantos falta escolher e quais já foram marcados.
- [x] Tocar na carta abre o inspetor; a seta de alvo continua saindo da carta.
- [x] Não cobrir os alvos nem os botões em tela estreita; com "Ver a mesa" (item 4), a carta some junto com a mensagem.
- [x] Leitor de tela: anunciar a carta e a habilidade junto do pedido.

Decidido em 28/10/2026: a ponte manda junto do `targeting`, só na escolha de alvos (não no pagamento), o que pede o alvo (`kind`: mágica, habilidade ou gatilho), o texto da habilidade como o Forge escreve (`ability`: a descrição do gatilho inteira ou o custo e o efeito da ativada; já vem em português quando a carta tem tradução no Forge, como o resto das mensagens), `min`/`max`/`count` do passo atual e as restrições de alvo (`valid`, `zones`). A carta usa a mesma `.prompt-card` da vidência (100px ao lado da caixa de ação, com a opção de imagem ou "Arte e texto"); a habilidade fica num bloco com o rótulo **Gatilho** ou **Habilidade** dentro da caixa, embaixo do pedido, e a linha de baixo diz "Falta 1 alvo", "Pode marcar mais 2 alvos" ou "Alvo marcado", com os nomes já marcados. O tipo de alvo continua na frase curta do pedido; quando a frase do Forge não dá para traduzir, a mesa completa pelas restrições ("criatura de um oponente", "carta num cemitério"). A seta sai da carta no campo quando ela está lá, e da carta na caixa quando não está (mágicas). Em tela estreita, a carta entra na caixa (56px, em cima) e o pedido fica só no aviso do centro da mesa, para a caixa não crescer sobre o campo. "Ver a mesa" só existe nas janelas de escolha; a escolha de alvo fica na caixa de ação, e a carta, dentro dela, some junto. Ficou de fora: destacar o parágrafo dentro da própria carta e traduzir pelo texto do Scryfall a habilidade das cartas que o Forge não traduz (aparece como o Forge manda, em inglês); mágicas não ganham o bloco da habilidade, porque a carta inteira é a mágica.

## 45. Botão principal sempre na ação mais comum ✅

Na caixa de ação, o botão em destaque (primário) deve ser sempre o que o jogador mais costuma apertar naquele momento. Exemplo: na manutenção, **Comprar** é o primário, e não a opção de parar ou agir.

- [x] Levantar os momentos com dois ou mais botões (manutenção, compra, combate, fim de turno, respostas na pilha, escolhas de abertura) e qual é a ação mais comum em cada um.
- [x] Tornar primário o botão da ação mais comum em cada momento, sem mudar o que cada botão faz.
- [x] Conferir que o atalho de teclado (Enter/espaço) segue o botão primário.

Decidido em 29/10/2026 (versão 0.70.0): o levantamento mostrou que só o seu turno com a pilha vazia fugia da regra; nos outros momentos o primário já era o mais comum (**Resolver** com a pilha cheia, **Passar** no turno do oponente, **Manter** no mulligan, **Eu jogo**, o pagamento automático, o **Sim** das perguntas, você no "Quem começa?"). No seu turno, **Fim de turno** era sempre o primário; agora, no início do turno (desvirar, manutenção, compra) e na principal 1, o primário é passar a etapa (**Comprar**, **Para a principal 1**, **Para o combate**, sempre, mesmo sem criaturas), e do combate em diante continua **Fim de turno** (`passIsPrimary` em `src/ui/phaseHud.ts`). O Espaço continua apertando só o botão de passar a etapa e nunca **Fim de turno**, para não encerrar o turno sem querer: até a principal 1 ele segue o primário; depois, aperta o secundário. Na caixa de ação do turno (coluna), o primário fica sempre por último, embaixo, na ordem do HTML (para o Tab e o leitor de tela seguirem a tela), também no **Resolver** e no **Pagar 2 de vida**; as caixas com botões lado a lado (abertura, perguntas, escolhas de carta) ficaram como estavam.

## 46. Arrastar cartas na mão para organizar ✅

O jogador arrasta uma carta da mão para outra posição e organiza a mão do jeito que preferir (por exemplo, terrenos de um lado e mágicas do outro), como no Arena.

- [x] Arrastar uma carta da mão e soltar entre outras duas para mudar a posição dela no leque, com as vizinhas abrindo espaço durante o arrasto.
- [x] Não confundir com jogar a carta: arrastar para o campo continua jogando, arrastar dentro da mão só reorganiza.
- [x] A ordem escolhida se mantém quando a mão muda (carta comprada entra no fim, carta jogada sai sem embaralhar o resto).
- [x] Funcionar no celular sem atrapalhar o tocar e segurar, que hoje abre a carta grande.

Decidido em 29/10/2026 (versão 0.75.0): o arrasto da mão (`src/ui/handDrag.ts`) passou a valer para qualquer carta da mão, não só as que dá para jogar, com o mesmo limiar de 9 px do arrasto para o campo. Soltar dentro da faixa da mão (a caixa de `#fHand`) reorganiza; fora dela, segue a regra de antes (no campo joga, se a carta puder ser jogada; em outro lugar, nada). Durante o arrasto, a carta fantasma segue o ponteiro, a carta de origem fica apagada na posição de destino e as vizinhas entre a origem e o destino andam uma casa (`translateX`), calculado a partir das posições do começo do arrasto. O contorno do campo só aparece quando a carta pode ser jogada. As cartas de fora da mão (cemitério, exílio) continuam no fim e não entram na ordem. A ordem é só da mesa, na memória, e vale até o fim da partida (zera ao trocar de partida); a mão sempre passa por `arrangeHand`, que mantém a ordem conhecida, põe as novas no fim, na ordem do Forge, e tira as que saíram. No celular, o tocar e segurar não mudou (mexer o dedo mais de 10 px desiste dele, e segurar parado cancela o arrasto); no leque, todas as cartas da mão ficam com `touch-action: none`; na mão longa (que rola), as que não dá para jogar ficam com `pan-x`, então deslizar para o lado rola a mão e, para reorganizar, puxa-se um pouco para cima antes. Não há atalho de teclado para reorganizar nem rolagem automática nas pontas da mão longa.

## 47. Buscar cartas por função e cartas parecidas ✅

No construtor de decks, a busca de cartas (`src/ui/deckbuilder.ts`, pelo Scryfall) só acha pelo nome, pelo texto e pelos filtros de cor, tipo e custo. Quem procura "mais uma carta como esta" precisa adivinhar as palavras do texto. Exemplo: quem busca Opt (Optar) também quer ver Consider (Considerar), outra mágica barata de comprar e olhar o topo.

O Scryfall já resolve boa parte: as **tags de função** do Tagger (o projeto de etiquetas da comunidade do Scryfall) marcam o que cada carta faz (`cantrip`, `ramp`, `counterspell`, `removal`, `scry`, `draw`…), organizadas em árvore (por exemplo, `removal` reúne 25 tags filhas).

- [x] Buscar por função: opções com as tags como o Scryfall as chama, sem tradução (`draw`, `removal`, `counterspell`, `ramp`, `cantrip`), e sem o jogador digitar sintaxe. A busca da API já aceita `otag:` e inclui as tags filhas (`otag:removal` trouxe 6.484 cartas; `otag:cantrip t:instant mv=1 c=u` trouxe Opt, Consider, Brainstorm e mais 23). Basta a mesa montar a consulta, como já faz com cor e tipo.
- [x] Cartas parecidas: na carta do resultado (ou no inspetor), um botão **Parecidas**. O card da API não diz as tags de uma carta, mas o Scryfall publica todas num arquivo diário (`oracle_tags` em `/bulk-data`, ~6 MB compactado, 4.596 tags com as cartas de cada uma, por `oracle_id`). A ponte pode baixar esse arquivo uma vez por dia e montar o índice carta → tags.
- [x] Como medir a semelhança (testado em 29/10/2026 com Opt): só comparar as tags dá resultado ruim, porque entram tags curiosas como "nome de três letras" e Consider nem aparece. Funcionou assim: (1) ignorar as tags de nome, arte, errata e afins; (2) somar a cada tag as tags-mãe, para `scry` e `surveil` se encontrarem em `library-manipulation`; (3) dar mais peso às tags raras; (4) comparar só com cartas das mesmas cores, do mesmo tipo e de custo próximo (busca normal no Scryfall). Resultado para Opt: Serum Visions, Preordain e Deliberate empatados no topo, depois Ponder, Omen, Curate e Consider entre as 10 primeiras.
- [x] Respeitar o formato e a identidade de cor do deck, como a busca atual já faz.
- [x] Sem resultado na função escolhida: mensagem clara e opção de voltar à busca por texto.
- [x] Conferir os termos de uso dos dados do Scryfall e dar crédito ao Tagger na tela.

Decidido em 29/10/2026 (versão 0.76.0): a busca de cartas do construtor ganhou a escolha **Função**, com 33 tags do Tagger pelo nome do Scryfall (de `anthem` a `tutor`, incluindo `draw`, `removal`, `counterspell`, `ramp` e `cantrip`), que vira `otag:` na consulta junto do texto, das cores e do tipo (`src/ui/cardSearch.ts`). Cada carta do resultado ganhou o botão **Parecidas** (no inspetor ficou de fora, para não mexer no inspetor compartilhado com a mesa). A mesa busca no Scryfall as candidatas (mesmas cores, mesmo grupo de tipo, com instantânea e feitiço juntos, e valor de mana a um de distância; terrenos pela identidade de cor e sem custo; até 5 páginas, sem buscar a tradução de cada uma) e manda os `oracle_id` à ponte na mensagem `similar-cards`; a ponte (`CardTags`) baixa o `oracle_tags` do `/bulk-data` no máximo uma vez por dia (guardado em `~/.forge/mesa-tags`, ou `-Dmesa.tags.dir`; se o download falhar, usa o arquivo anterior), monta o índice e ordena as candidatas pela medida acima: ignora as árvores `card-names`, `cycle`, `draft-signpost`, `un-design` e `token-versions-of-cards` e toda tag com "errata"; soma as tags-mãe; peso = ln(cartas com tags / cartas com a tag); nota = Jaccard com peso (soma dos pesos em comum / soma dos pesos da união). Com Opt deu o resultado testado: Deliberate, Preordain e Serum Visions empatados em 1,0, depois Hithlain Knots, Scour All Possibilities, Omen, Ponder, Consider e Curate entre as 10 primeiras. Aparecem até 40 parecidas, com as três tags em comum mais raras embaixo de cada carta. O formato do deck vale nas duas buscas, e no Commander com comandante escolhido toda busca de cartas passou a respeitar a identidade de cor dele (antes não respeitava). Sem resultado na função ou nas parecidas, a mesa explica e oferece **Voltar à busca por texto**, que limpa a função. Termos do Scryfall conferidos: dados livres para criar software de Magic, sem paywall, sem dar a entender apoio do Scryfall e sem repassar os dados crus (a ponte só devolve notas); os pedidos levam User-Agent e Accept, como o Scryfall exige, e o arquivo diário é o que ele recomenda no lugar de muitas consultas. O crédito fica embaixo da escolha de função, com link para o Tagger. Ficou de fora: o peso de cada tagging (`weight`) e o botão no inspetor.

## 48. Mesa que acompanha os oponentes sozinha ✅

Numa partida com mais de um oponente (Commander), quem concede ou morre continua com o campo inteiro na mesa, só com o selo **Eliminado** no retrato. O espaço fica ocupado por um campo que não joga mais, e os oponentes que ainda estão na partida ficam menores. E quando um oponente ataca, o campo dele divide a tela com os outros: hoje a mesa só traz de volta um oponente oculto que ataca você, sem dar destaque a ele.

- [x] Quando um oponente conceder ou morrer e ainda houver outro oponente na partida, ocultar o campo dele sozinho, como se o jogador tivesse tocado em **Ocultar** (`src/ui/seatVisibility.ts`): vira a coluna estreita com retrato, vida e o selo **Eliminado**.
- [x] **Mostrar campo** continua trazendo o campo de volta, para quem quiser conferir o que ficou nele.
- [x] No duelo (um oponente só) nada muda: a mesa nunca fica sem oponente à vista.
- [x] Se o jogador tinha escolhido **Só este** no oponente que saiu, voltar a mostrar os que restam.
- [x] Focar no oponente que ataca: quando um oponente declara ataque, a mesa mostra o campo dele em destaque, como se o jogador tivesse tocado em **Só este**, para ver os atacantes e escolher os bloqueios.
- [x] Voltar no fim do turno dele: quando o turno desse oponente acaba, a mesa volta a mostrar os oponentes como o jogador tinha deixado (os mesmos ocultos e o mesmo **Só este**, se havia).
- [x] Se o jogador mexer em **Ocultar**, **Só este** ou **Mostrar campo** durante o ataque, respeitar a escolha dele e não desfazer no fim do turno.
- [x] Decidir se o foco vale só para ataques contra você ou para qualquer ataque do oponente (inclusive contra outro jogador).

Decidido em 29/10/2026 (versão 0.77.0): o foco vale só para ataques contra você (você, um planeswalker seu ou uma batalha que você protege); ataques entre outros jogadores não mudam a mesa. A memória dos assentos fica em `followSeats` (`src/ui/seatVisibility.ts`), chamada a cada renderização: um eliminado, com outro oponente ainda vivo, entra nos ocultos uma vez só (a mesa lembra quem já ocultou, então **Mostrar campo** não é desfeito) e sai do **Só este**; quem concede já saía da mesa antes. O foco começa quando o oponente da vez tem atacantes declarados contra você, uma vez por turno, guarda a escolha de antes e a devolve quando o turno ou o jogador da vez muda (ou se o atacante sai da partida); um eliminado durante o foco também é ocultado na escolha guardada. Qualquer toque em **Ocultar**, **Só este**/**Ver todos** ou **Mostrar campo** durante o foco descarta a escolha guardada (`manualSeatChoice`), e o foco não volta no mesmo turno. O campo em foco mostra a pílula **Em foco: atacando você** (em vermelho, no lugar da dourada "À vista: …"), e o leitor de tela ouve o que a mesa mudou sozinha junto com o pedido atual. Com um oponente só, nada disso acontece.

## 49. Mais destaque no campo de quem é o turno ✅

Hoje o turno de cada jogador aparece só no retrato: um brilho dourado no seu e vermelho no do oponente e, no Commander, a vida e o nome em dourado no cabeçalho do campo. O campo em si fica igual ao dos outros, então, numa mesa com vários oponentes, é fácil perder de vista de quem é a vez.

- [x] Destacar o campo inteiro do jogador da vez (por exemplo, uma borda ou um brilho suave em volta da área dele, ou o fundo um pouco mais claro), sem tapar as cartas nem competir com os destaques de alvo, ataque e bloqueio.
- [x] Usar as mesmas cores do retrato: dourado no seu turno, vermelho no turno de um oponente.
- [x] Na troca de turno, passar o destaque de um campo para o outro com uma transição curta, que ajude a perceber a mudança.
- [x] Funcionar no duelo e no Commander, incluindo o oponente oculto (a coluna estreita) e o campo em **Só este**.
- [x] Anunciar a troca de turno para leitores de tela, se ainda não anuncia.

Decidido em 29/10/2026 (versão 0.78.0): borda com brilho suave, sem tingir o fundo. A área de quem joga o turno ganha um contorno de 1 px na cor do retrato com um brilho leve para dentro (dourado no seu campo, vermelho no do oponente), com as cores e o brilho em `--turn-ring-mine` e `--turn-ring-theirs` (`src/style.css`). No duelo e no seu campo no Commander, o contorno fica num `::after` do campo, por baixo das cartas, e troca de campo com um esmaecer de 0,35 s. No Commander, o assento do oponente da vez (inteiro, oculto na coluna estreita ou em **Só este**) leva o contorno vermelho no próprio assento, no lugar da antiga linha dourada no topo; como os assentos são redesenhados a cada mudança, a troca anima só no desenho em que o turno passa (`turn-arrived` e `turn-left`, de `seatTurnChange` em `src/ui/turnHighlight.ts`). Com o assento à vista por obrigação (o contorno dourado fino de **À vista**), as duas linhas aparecem juntas, a dourada por fora. Com `prefers-reduced-motion`, a troca é imediata. O contorno é mais fraco que os destaques de alvo, ataque e bloqueio (linha de 1 px a 50% e brilho a 13%, contra 2 px cheios e brilho forte). O leitor de tela não ouvia a troca de turno (a faixa "Seu turno" é só visual); agora uma região própria anuncia a mesma frase da faixa a cada turno novo. A vida e o nome em dourado no cabeçalho do assento ficaram como estavam.

## 50. Tipo ganho à mostra na carta ✅

Algumas cartas ganham um tipo além do impresso: um artefato que vira criatura (March of the Machines), terrenos que viram criaturas (Kormus Bell, um terreno animado), tudo virando artefato (Mycosynth Lattice), uma permanente que vira terreno (Imprisoned in the Moon), criaturas que ganham um tipo de criatura. Na mesa, a carta continua mostrando a imagem impressa, e o jogador não percebe que ela agora é outra coisa (que pode ser alvo de uma remoção de artefato, atacar ou bloquear). A ponte já manda a linha de tipo atual da carta.

- [x] Comparar a linha de tipo atual com a impressa e saber o que mudou: tipos ganhos (Criatura, Artefato, Terreno…), subtipos ganhos e, se houver, tipos perdidos.
- [x] No campo, um sinal discreto na carta (um ícone pequeno do tipo ganho), sem cobrir a arte, como os outros selos.
- [x] No balão (mouse ou toque) e no inspetor, a linha de tipo atual com o que foi ganho em destaque ("Artefato — agora também Criatura 3/3") e, quando der, a carta que causou a mudança.
- [x] Conferir que a criatura animada mostra força e resistência, mesmo quando a carta impressa não tem (terreno ou artefato que vira criatura).
- [x] Não marcar o que já está impresso (uma criatura artefato impressa não ganha selo), nem a mudança que a própria carta faz e que já está na imagem, como as faces de cartas de duas faces.

Decidido em 29/10/2026 (versão 0.79.0): a ponte manda `printedType` (a linha de tipo impressa da face à mostra, `getOriginalType` do Forge) só quando ela difere da atual, e `typeChangedBy` com as cartas cujas habilidades estáticas mudam o tipo (lidas dos efeitos estáticos que afetam a carta; a carta de efeito vale pela carta que a criou). Efeitos de uma vez, como animar até o fim do turno (Mutavault, tripular), não guardam a origem: aí vai só a linha impressa. A mesa compara as duas linhas como conjuntos (tipos, supertipos, subtipos e o "todos os tipos de criatura"), então a ordem do Forge não conta; numa linha "A // B" vale a face mais parecida com a atual. No campo, um selo só com o ícone do tipo ganho, embaixo da carta como os outros (garras para Criatura, engrenagem para Artefato, montanha para Terreno, brilho para Encantamento, etiqueta para subtipo e um círculo riscado quando só perde tipo). No balão, no inspetor e no leitor de tela: "Tipo mudado: Artefato — agora também Criatura 1/1. Efeito de March of the Machines."; quando nenhum tipo de carta atual estava impresso, "agora é Terreno; não é mais Criatura". No inspetor, a linha impressa ganha a mudança em destaque. Força e resistência já vinham da ponte sempre que a carta é criatura. Sem selo: changeling (o "todos os tipos" é da própria carta), deus de Theros sem devoção (o selo de devoção já diz) e veículo tripulado que só ganhou Criatura (o selo de tripulada já diz). Os subtipos ficam em inglês, como o Forge escreve.

## 51. Alerta de turno demorado ✅

A mesa já tem o relógio do turno na trilha de fases, com o tempo que o servidor conta para o turno de agora. Mas nada acontece quando um turno se arrasta, e numa mesa com vários jogadores um turno longo deixa todos esperando.

- [x] Quando o turno de um jogador passar de 2 minutos, começar um alerta que cresce aos poucos. Por exemplo: o relógio muda de cor (2 min), depois pulsa de leve (3–4 min), depois o retrato e o campo de quem está demorando ganham um aviso "Demorando…" para todos (5 min ou mais).
- [x] Para quem está demorando, um aviso próprio e discreto, que não atrapalhe a jogada ("Seu turno já passa de 3 min"), e talvez um som curto numa das etapas, que siga a configuração de som da mesa.
- [x] Contar o tempo de quem precisa agir: se, no meu turno, a mesa espera a resposta de um oponente (bloqueio, escolha, prioridade), o alerta vai para ele, e não para mim. Decidir se o relógio do alerta é por turno ou por espera de cada decisão: é por espera de cada decisão.
- [x] Não alertar no turno da IA, nem durante a apresentação de animações; zerar quando o turno passa.
- [x] Só avisar, sem punição automática (passar o turno ou conceder sozinho); deixar uma punição, se fizer sentido, para um item próprio.
- [x] Leitor de tela: anunciar cada etapa do alerta uma vez só, sem repetir a cada segundo.

Decidido em 29/10/2026 (versão 0.80.0): o relógio do alerta conta a espera de cada decisão, não o turno. A ponte manda `waiting`, os jogadores humanos que a mesa espera agora (inclusive a prioridade comum e quem recebe o estado), com `kind` e `ms`, o tempo da espera atual medido no servidor; cada pedido novo do Forge recomeça a contagem, então ela zera a cada resposta e quando o turno passa, e todos (inclusive quem assiste) veem o mesmo tempo. A IA não tem assento e nunca entra; a mesa também ignora jogadores marcados como IA. Com mais de uma espera ao mesmo tempo, vale a mais longa. Etapas (`src/ui/waitAlert.ts`): aos 2 min, um relógio de espera âmbar (ampulheta, nome de quem a mesa espera, ou "Você", e o tempo) aparece na trilha de fases depois do tempo do turno, que continua contando o turno; aos 3 min ele pulsa de leve; aos 5, fica vermelho e o retrato e o campo de quem demora ganham o selo **Demorando…** para todos. Quem demora recebe, a partir dos 3 min, o aviso "Sua vez já passa de 3 min" (aos 5, "de 5 min") em cima do próprio retrato, longe dos botões, e um som curto (o do início do turno, mais baixo) ao chegar aos 3 min, que segue o mudo e o volume da mesa. Durante a animação de uma jogada o alerta some e não anuncia. O leitor de tela ouve cada etapa uma vez ("A mesa espera Ana há 2 minutos.", "Sua vez já passa de 3 minutos."); abrindo a mesa no meio de uma espera longa, ouve só a etapa atual, sem som. Ficou de fora: uma ponte antiga, que não manda `waiting`, não mostra o alerta; nenhuma punição automática (fica para um item próprio, se fizer sentido).

## 52. Filtros e ordem por tipo ao buscar no grimório ✅

Ao buscar cartas no grimório (um tutor como Demonic Tutor, uma busca de criatura, de artefato ou de terreno), a escolha mostra todas as opções numa fileira só, ordenadas por custo de mana e depois pelo nome (`choiceOrder` em `src/ui/choiceScreens.ts`). Num deck de Commander, com até 99 cartas, achar a carta certa vira um garimpo, ainda mais quando o jogador não lembra o nome.

- [x] Filtros por tipo no topo da escolha (Criatura, Terreno, Artefato, Encantamento, Planeswalker, Instantânea, Feitiço, Batalha), com a quantidade de cada um e só os tipos que aparecem nas opções. Uma carta com dois tipos aparece nos dois filtros.
- [x] Ordenação escolhida pelo jogador: por tipo (agrupando, com um título em cada grupo), por custo de mana ou por nome. A escolhida fica lembrada para a próxima busca.
- [x] Campo de busca pelo nome (em português ou inglês) quando houver muitas opções, por exemplo mais de 15.
- [x] Filtros e ordem só mudam o que aparece na tela: a resposta para o Forge continua usando os índices originais, e as cartas já marcadas continuam marcadas ao trocar de filtro.
- [x] Valer para as outras escolhas grandes de cartas (cemitério, exílio, revelar), mas não para as escolhas em que a ordem tem significado (topo do grimório, ordem dos gatilhos).
- [x] Funcionar no celular, com os filtros numa fileira que rola de lado, e com o modal minimizado (**Ver a mesa**).

Decidido em 29/10/2026 (versão 0.81.0): vale para as escolhas de cartas com 8 opções ou mais (`isFilterableChoice` em `src/ui/choiceFilters.ts`), quando todas as opções são cartas à vista e a pergunta é de escolher (`kind: "choose"`) sem `purpose`; as escolhas menores continuam por custo e nome, e ficam de fora as perguntas de ordenar, a vidência e a vigilância (`purpose: "library"`), a ordem dos gatilhos, o jeito de jogar, a votação e o "só olhar" das cartas reveladas (`kind: "reveal"`). A ordem padrão é por tipo, com um título por grupo (Criaturas, Terrenos, Artefatos, Encantamentos, Planeswalkers, Instantâneas, Feitiços, Batalhas, Outras) e, dentro do grupo, por custo e nome; a carta de dois tipos fica no grupo do primeiro tipo dessa lista (criatura artefato em Criaturas) e entra nos dois filtros. O tipo vem da linha de tipo do Forge (só a face da frente; a do Scryfall em português, se a do Forge faltar). A ordem escolhida (Tipo, Custo, Nome) fica em `mesa:choiceSort` e acompanha a conta, como as outras preferências da mesa (entrou em `SYNCED_PREFS` e em `AccountDecks.PREF_KEYS`). Os filtros são botões com a contagem e só aparecem com dois ou mais tipos; a contagem é do total de cada tipo, sem contar a busca. A busca aparece a partir de 16 cartas, procura no nome em português e em inglês, sem acento, e junta com o filtro; digitar só esconde e mostra cartas, sem redesenhar a escolha, para não perder o foco nem o acento em digitação. Uma linha embaixo diz quantas cartas aparecem e quantas marcadas ficaram fora do filtro (lida pelo leitor de tela). Os filtros e a ordem ficam presos no alto e os botões de confirmar presos embaixo ao rolar a lista, e ao marcar uma carta a escolha não rola de volta ao começo nem anima de novo. No celular, os filtros ficam numa fileira que rola de lado, com a busca e a ordem numa linha só. Filtro e busca valem só para a pergunta aberta e continuam depois de **Ver a mesa**. Página de teste: cenário `?cenario=tutor&n=24&max=3` em `tests/fixtures/duel-table.html`. Ficou de fora: filtros por cor e por custo, e lembrar o filtro de tipo entre uma busca e outra.

## 53. Níveis de passar automaticamente ✅

Hoje passar a prioridade sozinho está espalhado em três controles independentes: **Passar automaticamente** nas Opções (passa quando não há nenhuma ação disponível), **Passar respostas** junto dos botões (passa no turno do oponente e com algo na pilha) e as etapas marcadas na trilha de fases (onde o jogo sempre para). O jogador precisa entender como os três se combinam, e não há um jeito simples de dizer "quero jogar mais rápido" ou "quero parar em tudo".

- [x] Um seletor único de nível, do mais cuidadoso ao mais rápido. Proposta para decidir:
  - **Parar sempre**: recebe a prioridade em toda etapa que dá prioridade, mesmo sem ações (para quem está aprendendo ou quer controle total).
  - **Só com ações** (o padrão de hoje): passa quando não há nada que possa usar.
  - **Respostas** (o Passar respostas de hoje): passa também no turno do oponente e com a pilha cheia, mas para no seu turno, nos ataques, bloqueios e escolhas.
  - **Só quando me afeta**: passa tudo até algo mirar você ou suas permanentes, ou até você ser atacado (o Forge já sabe reconhecer esses casos, que ele chama de interrupções).
- [x] Um atalho de uma vez só, como no Arena: **Passar até o fim do turno** (ou até o meu turno), que volta ao nível escolhido quando o turno acaba ou quando algo afeta você.
- [x] As etapas marcadas na trilha de fases continuam valendo em qualquer nível: nelas o jogo sempre para.
- [x] Mostrar o nível atual junto dos botões (um ícone ou selo discreto), com troca rápida, sem abrir as Opções.
- [x] Migrar as escolhas atuais (Passar automaticamente e Passar respostas) para o nível equivalente, sem o jogador perder o que tinha; o nível acompanha a conta, como as outras preferências da mesa.
- [x] Revisar os textos de ajuda das Opções e do menu da trilha de fases, que hoje citam os controles antigos.

Decidido em 29/10/2026 (versão 0.82.0): ficaram os quatro níveis da proposta, com **Só com ações** como padrão, e quem passa continua sendo a ponte (`PassLevel` em `forge-bridge`, com a decisão em `PassLevel.passes`). **Parar sempre** desliga a passagem sem ações do Forge e não pula nenhuma etapa que dá prioridade, nos dois turnos (só o "depois dos ataques" do oponente que não atacou continua pulado, porque não há a que responder). **Respostas** é o antigo Passar respostas, sem mudança. **Só quando me afeta** passa no turno dos outros, com a pilha cheia e no seu turno fora das fases principais, e para quando algo de outro jogador na pilha mira você ou uma permanente sua, ou quando você é atacado (nas etapas de atacantes e bloqueadores do turno de outro jogador); remoção em massa sem alvo não para este nível, só o atalho. Ataques, bloqueios e escolhas nunca são passados: a ponte só responde a pedidos de prioridade. O atalho **Passar até o fim do turno** usa o "fim de turno" do Forge com as interrupções ligadas para alvo em você, remoção em massa e ataque contra você, e sem a de "qualquer mágica do oponente"; a ponte o desliga quando o turno muda ou numa etapa marcada, e há **Parar de passar** (`pass-turn-stop`). Ele só aparece no turno dos outros, porque no seu ele pularia os seus ataques; no seu turno continua o botão **Fim de turno**, que passou a ter as mesmas interrupções (o **Resolver todos** religa a de qualquer mágica, para continuar parando quando algo novo entra na pilha). O nível fica junto dos botões num selo só com o ícone, no lugar da caixa Passar respostas: discreto em Só com ações, com borda dourada em Parar sempre, dourado em Respostas e Só quando me afeta, pulsando com o atalho ligado; tocar abre a troca rápida com os níveis e o atalho. Nas Opções, o interruptor virou a lista **Passar automaticamente**. Migração: sem o nível guardado, Passar respostas ligado vira **Respostas** (mesmo com Passar automaticamente desligado, por ser a escolha visível que o jogador mudava partida a partida), Passar automaticamente desligado vira **Parar sempre**, e o resto, **Só com ações**; o nível (`mesa:passLevel`) entra nas preferências da conta, e os dois interruptores antigos continuam gravados a partir dele, para outra aba ou aparelho com a versão anterior. A ponte aceita ainda as mensagens antigas e devolve os dois campos derivados do nível.

## 54. Formato e deck incompatíveis: dizer onde o deck serve ✅

Na tela inicial, o jogador pode escolher primeiro o formato e depois o deck, ou o contrário, mas nos dois caminhos a mesa não explica bem o desencontro. Levantamento feito em 31/10/2026 (`src/ui/lobby.ts`):

- Com o formato escolhido, os decks incompatíveis ficam escondidos (`allowed`); com **Mostrar incompatíveis**, eles aparecem com a etiqueta "Incompatível com o formato" e, ao escolher um, o **Jogar** fica desligado e a caixa de status mostra os problemas da validação do servidor, sem dizer em que formato o deck serve.
- Ao trocar o formato com um deck já escolhido, a mesa troca o deck pelo último usado no novo formato (`rememberedDeck`), ou deixa sem deck, sem avisar que o deck anterior não serve ali.

- [x] **Formato e depois o deck**: ao clicar num deck incompatível com o formato escolhido, mostrar os formatos em que ele serve (por exemplo "Este deck não serve para Pauper. Serve para: Standard, Livre."), cada um como atalho que troca o formato mantendo o deck escolhido. Se não servir em nenhum além do Livre, dizer isso e oferecer **Editar** (decks do jogador) ou **Ver as cartas**.
- [x] **Deck e depois o formato**: ao escolher um formato em que o deck selecionado não serve, mostrar um erro dizendo que o deck não é compatível com esse formato e em quais ele serve, em vez de trocar de deck em silêncio.
- [x] Usar a validação local (`validateDeckLocal`) para listar os formatos compatíveis na hora, sem esperar o servidor; a validação do servidor continua valendo para o formato escolhido.
- [x] A mensagem fica junto do deck escolhido (ou na caixa de status), é lida pelo leitor de tela e some ao escolher um par compatível.
- [x] Valer também ao entrar numa sala pelo código, onde o formato vem da sala e não pode ser trocado: só a lista de formatos do deck, sem atalhos de troca.

Decidido em 31/10/2026 (versão 0.93.0): os dois caminhos usam o mesmo seletor de formato (`openFormatPicker` em `src/ui/deckFit.ts`), uma janela no desenho das outras janelas da tela inicial (`conta-dialogo`) com o título "<deck> não serve para <formato>" e só os formatos em que o deck serve, como botões dourados no desenho dos segmentos da barra lateral, na ordem da tela (Commander, Standard, Pauper, Sacola 50) e com o Livre no fim. Os formatos compatíveis são calculados na hora (`fitsIn` em `src/ui/lobby.ts`), com os mesmos critérios da lista de decks: deck de Commander só no Commander, deck pronto só no próprio formato e no Livre, e `validateDeckLocal` sem problemas (a legalidade ainda não conferida conta como serve); a validação do servidor continua valendo para o formato escolhido. **Formato e depois o deck**: tocar num deck que não serve (visível com **Mostrar incompatíveis**) escolhe o deck como antes e abre o seletor; tocar num formato troca o formato e mantém o deck; **Fechar** deixa o deck escolhido, com o **Jogar** desligado. **Deck e depois o formato**: num formato em que o deck não serve, a mesa mantém o deck e o formato de antes e abre o seletor, com o formato atual marcado como "atual", **Ir para <formato> sem este deck** (o caminho antigo, com o último deck daquele formato, necessário quando o deck só serve no formato atual, como um deck de Commander ao tocar em Outros) e **Ficar em <formato atual>**; fechar sem escolher também mantém o formato. Num formato em que o deck serve, o deck continua escolhido; sem deck escolhido, volta o último usado no formato. Se só o Livre serve (ou nenhum formato), a janela diz isso e oferece **Editar** (só nos decks do jogador) e **Ver as cartas**. Embaixo do deck escolhido, uma linha âmbar ("Este deck não serve para Pauper. Serve para Sacola 50 e Livre.") é uma região `role="status"` que só muda quando o texto muda, com o atalho **Ver os formatos do deck** que reabre o seletor; ela some com um par compatível. Numa sala encontrada pelo código, o seletor não abre e a linha diz "não serve para Commander, o formato da sala" e onde o deck serve, sem atalho. Na **Mesa livre** (sem regras), onde qualquer deck abre, nada disso aparece. Ficou de fora: usar a validação do servidor para a lista de formatos compatíveis.

## 55. Cemitério e exílio à vista no celular, nas partidas 1x1 ✅

No celular, numa partida de dois jogadores, o jogador não consegue ver o próprio cemitério nem o exílio. Levantamento feito em 31/10/2026:

- Na tela estreita ou deitada e baixa (`max-width: 760px` ou `max-height: 500px`), as pilhas do jogador ficam escondidas (`.forge .piles.me { display: none; }` em `src/ui/gameplay.css`, e o mesmo em `src/style.css` abaixo de 760px), e não há outro caminho para abrir o cemitério ou o exílio. Só a prateleira de exílio aparece, e apenas com cartas que dá para jogar dali.
- As pilhas do oponente continuam no canto de cima (`.piles.opp`), mas pequenas e disputando espaço com a barra da partida; vale conferir num celular de verdade se dá para vê-las e tocá-las.
- No Commander com mais jogadores, cada lugar mostra as próprias pilhas (`seat-zones`), então o problema é só do 1x1 (Commander de dois jogadores incluído).

- [x] Mostrar o cemitério e o exílio do jogador no celular, com a contagem, sem tapar a mão, os botões nem a caixa de ação.
- [x] Tocar abre a mesma lista de sempre (a de **Ver cemitério**), com o brilho de "dá para usar" (flashback, tramadas) também no celular.
- [x] Conferir as pilhas do oponente no celular, em pé e deitado, e deixá-las fáceis de tocar.
- [x] Conferir com a mão cheia, a prateleira de exílio aberta e a pilha com várias mágicas.

Decidido em 31/10/2026 (versão 0.96.1): as pilhas do jogador voltam menores (30×42 px, com a contagem num selo) logo acima do retrato, no canto de baixo à esquerda, fora da mão (que começa depois do retrato), dos botões e da prateleira de exílio, que ficam à direita; as regras ficam em `src/ui/duelPiles.css`, só para o 1×1 (`.forge:not(.multiplayer)`). Tocar abre a mesma lista de **Ver cemitério** e **Ver exílio**, e o brilho de "dá para usar" continua na pilha. O exílio aparece só com cartas, como antes. O grimório fica escondido, como estava, exceto com o topo à vista (Future Sight e afins), quando sobe para uma segunda linha acima das outras duas, para dar para jogar dali. Deitado, as fileiras de criaturas do seu campo começam depois das pilhas (como a de terrenos já fazia por causa do retrato). No Commander de dois jogadores, a zona de comando sobe para logo acima das pilhas (deitado, sem o título "Comando") e o campo deixa a coluna da esquerda livre. As pilhas do oponente ficaram do mesmo tamanho, maiores que antes (eram 6% da altura da tela, uns 23 px deitado): deitado, no canto de cima à direita da faixa, e não fogem mais para a esquerda, por cima do nome e dos marcadores dele, quando a pilha de mágicas aparece (no celular ela fica abaixo da faixa); no Commander 1×1 começam logo depois do menu, para o comandante dele não encostar no retrato. Em pé, a faixa de cima não tem lugar para elas, e as pilhas do oponente descem para o canto de cima do campo dele. Conferido em 390×844, 844×390, 667×375 e 915×412 nas páginas de teste, com a mão cheia, a prateleira de exílio aberta, três mágicas na pilha e o topo do grimório à vista. Ficou de fora: em pé (só numa janela estreita de computador, porque o celular em pé mostra **Gire o aparelho**), a mão já fica estreita ao lado da prateleira de exílio, e a mão do oponente cobre os marcadores dele, como antes; e um atalho para o exílio vazio, que continua sem aparecer.

## 56. Mostrar o valor que a carta conta ✅

Muitas cartas têm um número que depende do que há na mesa: dano, P/T ou custo igual à quantidade de permanentes, de criaturas, de terrenos de um tipo, de artefatos, ou de cartas de um tipo no cemitério. Ex.: Combustion Technique, que soma as Lições do cemitério ao dano; Craterhoof Behemoth, Ghalta, Scion of the Ur-Dragon, Myr Battlesphere, Overwhelming Stampede. Hoje o jogador precisa contar sozinho, na mão e no campo. Levantamento feito em 31/10/2026:

- O Forge descreve essas contagens nas variáveis da carta (`Count$Valid …`, `Count$TypeInYourYard`, `Count$CardsInYourHand` e afins), que já são lidas para a devoção (`PermanentDetails.devotion`, com o valor e as cores) e para as cartas que contam mágicas (`countsSpells`). O valor calculado sai de `AbilityUtils.calculateAmount` / `CardFactoryUtil.xCount`, do jeito que o motor usa na hora de resolver.
- P/T que já muda no campo (Tarmogoyf, criaturas com `*/*`) já aparece no P/T da permanente; o que falta é dizer de onde vem o número e mostrar o valor nas cartas da mão e nas mágicas.

- [x] A ponte manda, para as cartas na mão, no campo, na pilha e na zona de comando, as contagens que a carta usa: o valor atual e o que é contado (por exemplo "Lições no seu cemitério: 3"), só quando a carta tiver uma.
- [x] Na carta, o mínimo: um selo pequeno com o número (como o da devoção), sem cobrir custo, arte nem P/T. Na mão, o selo fica na parte descoberta do leque.
- [x] No balão e no inspetor, o detalhe: o que é contado, o valor de agora e o resultado ("Causa 5 de dano: 2 + 3 Lições no seu cemitério"), em português.
- [x] O número acompanha a mesa ao vivo (entra uma criatura, sai um terreno, uma Lição vai para o cemitério).
- [x] Cartas que contam coisas dos oponentes ou de todos os jogadores dizem de quem é a contagem.
- [x] Contagens que só ligam um efeito a partir de um mínimo ("se houver três ou mais…") mostram o valor e o mínimo ("2/3"), com destaque quando o efeito já vale.
- [x] Testar com o motor real em `forge-bridge/src/test` (Combustion Technique, Accumulate Wisdom, Craterhoof Behemoth, uma carta de custo reduzido como Ghalta) e montar a página de teste.

A decidir antes de começar: se o selo aparece em toda carta que conta algo ou só quando o valor muda o que a carta faz (dano, P/T, custo); se a devoção passa a ser um caso desta mesma marca; e o que fazer com contagens que só têm valor na hora de resolver (alvo escolhido, X pago).

Decidido em 31/10/2026 (versão 0.94.0): o selo só aparece quando o número muda o que a carta faz, e a devoção virou um caso da mesma marca. A ponte (`CardCounts` em `forge-bridge`) lê as habilidades da carta (mágicas e ativadas com as sub-habilidades, gatilhos e o que executam, estáticas) e segue cada parâmetro de quantidade até a variável `Count$` do script: dano (`NumDmg`), P/T (`NumAtt`/`NumDef`, `AddPower`, `SetPower` das criaturas */*), custo (`ReduceCost`/`RaiseCost`, dizendo quando reduz o de outras mágicas), vida, comprar, moer, descartar, fichas, marcadores e mana; e os mínimos que ligam um efeito (`Count$Compare ... GE3`, `CheckSVar` + `SVarCompare` GE/GT nas estáticas, gatilhos e condições, e o LT dos deuses de Theros, que vira "é criatura com N"). O valor é o do motor (`AbilityUtils.calculateAmount` / `doXMath`), mandado em `counts` só na mão, no campo, na pilha e na zona de comando, a cada estado, então acompanha a mesa ao vivo. Contagens reconhecidas: cartas de um tipo (ou subtipo, como Lição, Floresta, Elfo) no campo, no cemitério ou no exílio, de quem controla, dos oponentes ou de todos, com qualidades simples (outras, viradas/desviradas, atacando, fichas ou não, cores, lendárias, "não terreno", "com voar", "poder 4 ou mais") e medidas (poder total, maior poder, resistência, valor de mana, tipos de carta, nomes diferentes, cores); devoção (uma ou duas cores); cartas na mão (só a quantidade: o tipo das cartas na mão é segredo); pontos de vida; domínio. Contas fixas por cima entram (Plus.2 vira "2 + 3"; Twice, Times, HalfUp); uma conta com outra variável (Multani: terrenos + terrenos no cemitério) ou um teto (`LimitMax.1`, que faz da contagem um "tem ou não tem") deixa a carta sem selo, como qualquer propriedade que a mesa não sabe descrever, para o selo nunca dizer algo errado. Num "quando esta carta entra" visto da mão, a ponte manda também `entering`, o valor contando com ela mesma (Craterhoof +1 criatura, Gray Merchant os próprios {B}{B}), e o selo mostra esse número. Na mesa (`src/ui/cardCounts.ts`): no campo, o selo vai com os outros embaixo da carta; na mão, na borda esquerda, a parte do leque que a carta seguinte não cobre; na pilha e na zona de comando, no canto de baixo à esquerda. O selo tem um ícone de contagem e o número, ou "2/3" com mínimo (verde quando já vale); a devoção mantém os símbolos de mana no lugar do ícone. O balão, o inspetor e o leitor de tela dizem o que é contado, o valor e o resultado ("Lições no seu cemitério: 3. Causa 5 de dano (2 + 3).", "Criaturas que você controla: 2; 3 quando ela entrar. Dá +3/+3."), com o nome do dono quando a carta é de outro jogador ("que os oponentes de Ana controlam"). Os tipos de carta e subtipos comuns saem em português; os outros como "permanentes do tipo Kor". O campo `devotion` da ponte deu lugar a `counts`. Ficou de fora: contagens que só têm valor ao resolver (X pago, alvo escolhido, cartas lembradas ou exiladas pela carta, o que entrou, morreu ou foi conjurado no turno), contagens do grimório, duas contagens somadas numa conta só e propriedades que a mesa não descreve; nessas a carta fica sem selo. Testes com o motor real em `CardCountsTest` (Combustion Technique, Accumulate Wisdom, Craterhoof Behemoth, Ghalta, Scourge of Geier Reach, Tarmogoyf, deuses e Gray Merchant, Akki Underling e cartas que não podem ganhar selo). Página de teste: `?cenario=contagens&licoes=3` em `tests/fixtures/duel-table.html`.

## 57. Escolhas no celular em fileira horizontal, com os botões sempre à vista ✅

No celular, as janelas de escolha com cartas crescem para baixo, e os botões de confirmar ficam no fim da rolagem: o jogador escolhe a carta e não acha como confirmar. Levantamento feito em 31/10/2026:

- As opções com carta quebram em várias linhas (`.q-opts.cards` com `flex-wrap: wrap` em `src/style.css`), e no celular cada carta tem 104px (`src/ui/arenaModals.css`); com 6 ou mais cartas, a janela já passa da altura da tela, principalmente deitado.
- Os botões só ficam presos embaixo em dois casos: nas escolhas grandes com filtros (item 52, `src/ui/choiceFilters.css`) e na busca do grimório (`src/ui/libraryChoice.css`). Nas outras (descartar, sacrificar, escolher alvos com carta, ver cemitério e exílio, ordenar gatilhos, mulligan) eles rolam junto.
- A ordem dos gatilhos e o jeito de jogar já têm ajustes próprios para o celular (`src/ui/choiceScreens.css`), mas também ficam altos com muitos itens.

- [ ] No celular (tela estreita ou deitada e baixa), as cartas das escolhas ficam numa fileira só, que rola de lado, com a dica de que há mais cartas para os lados (sombra na borda ou contador).
- [ ] Os botões de confirmar, cancelar e **Ver a mesa** ficam sempre à vista, presos embaixo, em todas as janelas de escolha.
- [ ] O título e a instrução ficam curtos no topo, sem empurrar as cartas para fora da tela.
- [ ] Marcar uma carta não faz a fileira voltar ao começo, e a carta marcada continua visível.
- [ ] Escolhas que já usam fileira (vidência, ordem do topo do grimório) e as com filtros do item 52 continuam como estão.
- [ ] Conferir em pé e deitado, com 2, 7 e 20 cartas, e com o teclado e o leitor de tela.

A decidir antes de começar: se a fileira horizontal vale para todo celular ou só deitado (em pé, duas linhas de cartas talvez caibam melhor); e se as janelas sem carta (escolher modo, sim e não, números) também mudam ou só ganham os botões presos.

Decidido em 31/10/2026 (versão 0.97.1): o item ficou só na janela de remoção (item 32), a que mais sofria no celular; as outras janelas de escolha continuam como estão. No celular (`max-width: 760px` ou `max-height: 500px`), a janela fica deitada como no computador: a carta que causou à esquerda (80px) e, ao lado, um grupo por dono, cada um numa fileira só (cartas de 64px) que rola de lado, sem quebrar linha; o OK fica preso embaixo. Página de teste: `?cenario=remocao&minhas=8&dele=3` em `tests/fixtures/duel-table.html`. Ficaram de fora a fileira horizontal e os botões presos nas outras janelas de escolha.

Retomado e decidido em 01/11/2026 (versão 0.103.0), só nas janelas no celular (mesmo corte de tela): as escolhas com cartas (descartar, sacrificar, buscar, alvo com carta, cemitério, exílio, mão revelada) ficam numa fileira só, em pé e deitado, que rola de lado; a borda do lado que ainda tem cartas escurece (sem contador); marcar uma carta redesenha a janela sem tirar a fileira do lugar. Os botões ficam presos embaixo em todas as janelas de escolha, inclusive as sem carta e a ordem dos gatilhos (que já era uma fileira e ganhou a mesma sombra); o fundo escuro atrás deles só aparece quando a janela rola. Ficam como estavam: as escolhas com filtros (item 52), a busca do grimório, a vidência, o jeito de jogar, o dano de combate, a votação e a janela de remoção. **Ver a mesa** continua no alto, junto do título.

## 58. Mana que falta pagar, à vista e atualizada a cada terreno virado ✅

Na hora de pagar uma mágica ou habilidade, a caixa de ação diz só "Pague o custo de mana de Jiboia." (`shortInstruction` em `src/ui/shortInstruction.ts`). O custo em si fica no texto do Forge, atrás de **Ver detalhes**, e o jogador que vira os terrenos à mão não sabe quanto ainda falta. Levantamento feito em 31/10/2026:

- O motor guarda o que falta no pagamento (`InputPayMana.manaCost`, um `ManaCostBeingPaid`) e já o desconta a cada mana gerada. A ponte lê esse campo (`InputContext`, `PAY_COST`), mas só para a vida das mana phyrexianas; o custo que falta não vai para a mesa.
- Para convocar, improvisar e dobrar água, a ponte já manda o que falta (`remaining` em `InputContext`), e a caixa de ação já sabe dizer se ainda há custo (`unpaid` em `src/ui/decisionPrompt.ts`): o mesmo caminho serve aqui.

- [x] A ponte manda o custo que falta pagar enquanto o pagamento está aberto, atualizado a cada terreno virado ou mana gerada.
- [x] A caixa de ação mostra o custo com os símbolos de mana, sempre visível ("Pague {2}{R} para Jiboia"), e o que já foi pago apagado ou riscado, para o jogador ver o total e o que falta.
- [x] Ao virar um terreno à mão (ou usar outra fonte de mana), o valor desconta na hora; mana que sobra na reserva aparece separada, sem sumir.
- [x] Mana phyrexiana, híbrida e X: mostrar como o motor está contando (por exemplo, a vida que vai custar, o X escolhido).
- [x] O mesmo para custos pedidos por efeitos (Mana Leak, Estudo Rístico) e para os anúncios do leitor de tela ("Falta {R}").
- [x] Testar com o motor real em `forge-bridge/src/test` (pagar à mão uma carta de custo misto, virar um terreno que dá duas manas) e montar a página de teste.

Decidido em 31/10/2026 (versão 0.95.0): o custo aparece só na caixa de ação, sem destaque nos terrenos e nada na pilha. A ponte manda, enquanto o pagamento de mana está aberto, `input.manaCost` (`InputContext.manaCost`, lido do `InputPayMana.manaCost` do motor): `remaining`, o que falta como o motor conta ("{1}{R}", "0" quando pago, com híbrida e phyrexiana nos símbolos do Forge); `total`, o custo quando o pagamento abriu, só depois de pagar uma parte (guardado por input, na primeira vez que a ponte o vê); `life`, a vida já separada para símbolos phyrexianos, que o Forge só tira no fim; e `x`, o X escolhido, quando a mágica ou habilidade tem X (não nos custos pedidos por efeitos). Cada mana gerada muda a mensagem do Forge, e a mesa recebe o valor novo na hora. A frase curta (`shortInstruction`) virou "Pague {4}{G}{G} para Serpente Terrestre de Craw." e, depois de pagar uma parte, "Falta {2}{G}{G} de {4}{G}{G} para …", com os símbolos de mana desenhados; em vez de riscar o que já foi pago (o genérico pago pela metade não tem como riscar), o total aparece ao lado do que falta. Depois vêm "(X = 3)", "Mais 4 de vida no fim do pagamento." (quando não dá para pagar mais nenhum símbolo com vida; enquanto dá, continua a dica do retrato com "Já são 2 de vida.") e a mana da reserva de quem paga à parte ("Na reserva: {C}."). Custos pedidos por efeitos usam o mesmo valor: "Estudo Rístico pede {1}. Pague ou recuse.", "Falta {1} de {3} para Mana Leak. Pague ou recuse." O leitor de tela lê os símbolos por extenso (`spokenMana`: "Falta 1 vermelha de 2 genéricas e 1 vermelha"). O texto do Forge continua em **Ver detalhes**, e uma ponte antiga, sem `manaCost`, mantém a frase de antes. Testado com o motor em `ManaCostTest` (Hill Giant pago à mão com Montanha e Florestas, Sol Ring pagando {2} de uma vez, vida phyrexiana do Thundering Tanadon, custo de efeito e X); página de teste: cenário `?cenario=pagar` em `tests/fixtures/duel-table.html` (`fixture.payMana()` e `fixture.tapForMana(id)`). Ficou de fora: destacar os terrenos que ainda podem pagar o que falta e mostrar o custo na pilha.

## 59. Desfazer sempre ligado, sem aviso na sala ✅

Hoje o **Desfazer** é uma escolha ao criar a partida (Desligado ou Ligado), e quando está ligado a mesa avisa em vários lugares. Como numa sala cada pedido de desfazer só vale se todos os outros aceitarem, ninguém volta uma jogada sem o consentimento da mesa, e o aviso prévio não protege nada. Levantamento feito em 31/10/2026:

- A escolha fica na tela inicial (`#undoChoice` em `src/ui/lobby.ts`, lembrada em `mesa:undo`, desligada por padrão) e vai na configuração da partida (`undo` em `MatchConfig`); sem ela, a ponte nem guarda o histórico (`Session`, `UndoHistory`).
- Os avisos: o selo **Desfazer ligado** na lista de salas públicas e no rótulo para leitor de tela (`src/ui/publicRooms.ts`), a linha na sala de espera (`#roomUndo` em `src/ui/roomLobby.ts`) e no resumo da sala ao buscar pelo código (`#roomInfo` em `src/ui/lobby.ts`).

- [x] Desfazer ligado em toda partida, contra o computador e em sala, sem a escolha na tela inicial.
- [x] Tirar o selo e as linhas de aviso da lista de salas, da sala de espera e do resumo da sala.
- [x] Na partida, nada muda: o botão **Desfazer** à vista, o pedido com **Aceitar** e **Recusar** para os outros jogadores, e cada volta no histórico.
- [x] A ponte passa a guardar o histórico sempre; continuar aceitando o campo `undo` das versões anteriores e das repetições de partidas antigas.
- [x] Conferir o custo de memória e de tempo de guardar o histórico em toda partida, principalmente no Commander com quatro jogadores.
- [x] Atualizar o texto de ajuda e a entrada antiga das Novidades que explicava a escolha.

Decidido em 31/10/2026 (versão 0.96.0): o Desfazer vale em toda partida, contra o computador e nas salas, sem nenhum modo sem desfazer (nem opção de sala para torneios), e a versão subiu em Y. A escolha saiu da tela inicial (`#undoChoice` e `mesa:undo` deixaram de existir; o valor antigo guardado no navegador é só ignorado), e com ela o selo **Desfazer ligado** da lista de salas públicas e do rótulo do leitor de tela, a linha da sala de espera (`#roomUndo`) e o trecho do resumo da sala ao buscar pelo código; a dica do botão perdeu o "Desfazer ligado:" do começo e só explica a regra. Na partida nada mudou: o botão **Desfazer** fica à vista de quem joga (quem assiste não tem), o pedido chega com **Aceitar** e **Recusar** e cada volta entra no histórico. A ponte cria o `UndoHistory` em toda `Session`; `MatchConfig` perdeu o campo `undo`, mas `parse` e `Replay` continuam aceitando (e ignorando) o `undo` de versões anteriores e de diários antigos, e o estado continua mandando `config.undo: true`, para a mesa das versões anteriores (em cache) mostrar o botão. A mesa livre tem o próprio Desfazer e não mudou. A entrada antiga das Novidades (0.69.0) ganhou uma nota de que a escolha deixou de existir. Custo medido (`UndoCostProbe`, só com `-Dmesa.medir=true`; partidas IA x IA de 15 turnos, um retrato a cada prioridade de quem conta como humano, como a ponte faz): no Commander com 4 jogadores, cada retrato leva ~25 a 35 ms (p95 ~40 a 60 ms) na thread do jogo, cerca de 135 retratos por humano em 15 turnos, e os 60 retratos guardados mais o registro do Forge ocupam ~65 a 80 MB por partida (com 4 humanos ou com 1); no Pauper 1x1, ~12 ms por retrato e ~40 MB. Ficou de fora: baixar esse custo (menos retratos guardados, ou não retratar as prioridades que a ponte passa sozinha). Depois (versão 0.97.2), o custo baixou: o Desfazer guarda só o turno atual e o anterior (volta no máximo até o começo do turno anterior), só tira retrato quando o jogador de fato vai decidir (não nas prioridades que o Forge ou a ponte passam sozinhos: fase pulada, sem ações, atalho de fim de turno, nível de passar automaticamente, turno pulado por votação), e só o retrato mais novo fica inteiro, os outros guardam só o que muda em relação ao seguinte (`MementoDelta`, ~2 a 8 mil objetos em vez de ~100 a 135 mil); sem nada guardado, o registro do Forge também é solto. Medido de novo com o `UndoCostProbe` (agora com o jeito antigo e o novo lado a lado): no Commander com 4 humanos, de ~550 para ~25 a 75 retratos por partida, de ~14 a 16 s para ~1 a 3,5 s de thread do jogo e de ~70 a 85 MB para ~14 a 18 MB; com 1 humano, de ~135 para ~5 a 17 retratos e de ~70 a 88 MB para ~0 a 15 MB; no Pauper 1x1, de ~150 para ~10 a 50 retratos e de ~30 a 43 MB para ~0 a 4 MB. Cada retrato custa um pouco mais (~30 a 47 ms, mais ~5 a 12 ms para guardar a diferença), porque muda mais coisa entre um e outro.

## 60. Carta virada para baixo com a imagem de metamorfose ou manifestação ✅

Uma permanente virada para baixo (metamorfose, manifestada, disfarce, encoberta) aparece no campo com o verso da carta, igual a uma carta no grimório. O Scryfall tem as cartas de lembrete impressas para esses casos (a 2/2 de metamorfose e a de manifestação, e para disfarce e encobrir, a conferir), que deixam claro que é uma criatura 2/2 e como ela vira. Levantamento feito em 31/10/2026:

- A ponte já manda como a carta foi virada (`faceDownKind` em `StateJson`: `morph`, `manifest`, `disguise`, `cloak`), e a mesa usa isso só no balão dos efeitos (`FACE_DOWN_LABEL` em `src/ui/permanentEffects.ts`).
- A face é desenhada em `face()` (`src/ui/forgeTable.ts`): virada para baixo sempre vira o verso (`.back`), e o dono que pode olhar vê o verso com um olho no canto.

- [x] Achar no Scryfall as cartas de lembrete de cada tipo (metamorfose, manifestação, disfarce, encobrir; manifestar pavor usa a de manifestação) e guardar qual impressão usar para cada uma.
- [x] No campo, a permanente virada para baixo mostra a imagem do tipo dela, no lugar do verso; sem tipo conhecido, continua o verso.
- [x] Para o dono, o olho no canto e a prévia da carta escondida continuam como hoje; para os outros, a carta não revela nada além do tipo, que já é público.
- [x] O estilo "Arte e texto" e o cache de imagens tratam essas cartas como as outras, com o verso como reserva se a imagem não carregar.
- [x] Conferir na mão, no exílio e no grimório: lá a carta continua com o verso, porque não é uma criatura virada.

A decidir antes de começar: se a imagem de lembrete aparece também nas cartas exiladas viradas para baixo (previstas, tramadas), que não são criaturas 2/2.

Decidido em 31/10/2026 (versão 0.98.0): a carta de lembrete aparece só nas permanentes viradas para baixo no campo; no exílio (previstas, tramadas), na mão e no grimório continua o verso. Impressões conferidas na API do Scryfall: metamorfose, **Morph** de Murders at Karlov Manor Commander (`tmkc/30`); manifestada (e manifestar pavor, que a ponte também manda como `manifest`), **Manifest** da mesma série (`tmkc/29`); disfarce e encoberta, **A Mysterious Creature** de Murders at Karlov Manor (`tmkm/21`), a carta de lembrete impressa para os dois (não há uma só de encobrir). As imagens vêm de endereços fixos em `cards.scryfall.io` pelo id do Scryfall (`src/ui/faceDownReminder.ts`), sem busca, então entram no mesmo cache de imagens das outras cartas. `face()` desenha a carta de lembrete no campo no estilo de carta escolhido (imagem inteira, "Arte e texto" com o nome em português, como "Metamorfose", ou só a arte no Arena), com o verso por baixo (`back` em `FaceInfo`), que aparece se a imagem não carregar; sem `faceDownKind`, fica o verso, como antes. O dono que pode olhar continua com o olho no canto e a prévia da carta escondida, cuja nota agora diz o tipo ("Virada para baixo (Metamorfose): só você pode ver qual carta é."). Para os outros, a virada ganhou o botão de inspecionar, e a prévia e o inspetor mostram a carta de lembrete ampliada, com o texto dela em português, P/T, marcadores e a nota "só quem a controla sabe qual carta é"; nada além do tipo, que já é público. O selo "Metamorfose 2/2" embaixo da carta ficou como estava. Página de teste: `?cenario=viradas` em `tests/fixtures/duel-table.html` (`fixture.faceDown()`). Ficou de fora: imagem de lembrete para as viradas para baixo fora do campo e um teste automático no navegador.

## 61. Prévia do link ao compartilhar (Open Graph) ✅

Quem manda o endereço da mesa no WhatsApp, no Discord ou numa rede social hoje vê só o endereço, sem imagem nem descrição. O link de convite (`?sala=CÓDIGO`) também chega sem dizer que é um convite.

- [x] Etiquetas Open Graph e do Twitter no `index.html`: título, descrição (a do manifest), imagem 1200×630 e o texto alternativo dela.
- [x] Imagem com endereço completo, sem amarrar o domínio no código.
- [x] Prévia própria para o link de convite, com o código da sala.
- [x] Um teste que confere que o nginx acha no `index.html` as linhas que ele troca.

Decidido em 31/10/2026 (versão 0.97.0): a imagem (`public/og-mesa.jpg`, JPEG, que todos os apps mostram) é um print da mesa de teste (`tests/fixtures/duel-table.html`) com criaturas dos dois lados e a mão embaixo. O `index.html` traz `https://__MESA_HOST__/og-mesa.jpg`, e o nginx (`sub_filter` em `deploy/nginx.conf`) troca o marcador pelo esquema (de `X-Forwarded-Proto`, porque o Coolify termina o HTTPS no proxy) e pelo `Host` de quem pediu, então vale em qualquer domínio sem configurar nada. Com `?sala=` de 3 a 12 letras e números, o nginx troca também o título ("Convite para a sala CÓDIGO · Mesa de Duelo") e a descrição; qualquer outro valor fica com a prévia geral, para nada do endereço virar HTML. A prévia do convite não consulta a ponte: o cartão aparece mesmo para uma sala que já acabou. `tests/opengraph.test.mjs` confere que cada `sub_filter` acha a linha dele no `index.html`. Ficou de fora: prévia própria das outras páginas (novidades, privacidade) e uma imagem gerada por sala.

## 62. Pagamento automático usando os talismãs ✅

Ao pagar automaticamente, a mesa vira os terrenos e deixa o Talismã (Talisman of Dominance, Talisman of Progress e afins) sem uso, mesmo quando ele é a única fonte que sobraria e o jogador não tem outro uso para ele no turno. O resultado é o jogador acabar com só o talismã desvirado, sem mana de terreno para responder. Levantamento feito em 31/10/2026:

- O botão de pagar automaticamente é o OK do pagamento do Forge (`canAutoPay` em `Session`), que escolhe as fontes com a lógica da IA (`ComputerUtilMana`). Essa lógica prefere terrenos e evita fontes com desvantagem, como a mana colorida do talismã, que causa 1 de dano a quem a usa (a mana incolor dele não causa dano).
- A ponte não interfere na escolha das fontes: o que o Forge escolhe é o que é virado.

- [x] Reproduzir com o motor real em `forge-bridge/src/test`: terrenos e um talismã no campo, pagar automaticamente um custo que dá para pagar com ou sem o talismã, e anotar o que o Forge vira.
- [x] No pagamento automático do jogador, usar o talismã antes de deixá-lo como a única fonte desvirada: por exemplo, pagar a parte genérica com a mana incolor do talismã (sem dano) e guardar os terrenos, que servem para mais coisas.
- [x] Usar a mana colorida do talismã (com 1 de dano) só quando ela evitar deixar uma cor de que o jogador precisa sem fonte, ou quando não houver outro jeito de pagar.
- [x] Valer também para as outras pedras de mana parecidas (Signets, Mind Stone, Arcane Signet), sem mudar o pagamento manual nem o do computador.
- [x] Testar casos: custo só genérico, custo com cor que os terrenos e o talismã dão, talismã e uma terra de dor (Battlefield Forge) juntos.

A decidir antes de começar: a regra de prioridade entre terrenos e pedras de mana (sempre pedras primeiro na parte genérica, ou só quando sobra mana parecida); e se vale aceitar 1 de dano do talismã para guardar um terreno de cor.

Decidido em 31/10/2026 (versão 0.99.1): reproduzido com o motor real (`AutoPayStonesTest`): com duas Ilhas e o Talisman of Dominance, o Automático do Forge pagava o Mind Stone ({2}) com Ilha e Pântano e o Coral Merfolk ({1}{U}) com as duas Ilhas, sempre deixando o talismã; o mesmo com o Mind Stone em campo, que não tem dano nenhum. A causa não é o dano: `ComputerUtilMana.sortManaAbilities` ordena as fontes da parte genérica por `scoreManaProducingCard`, que soma a pontuação de cada habilidade da carta (e +13 por habilidade que não é de mana), então uma pedra com duas habilidades (talismã, Mind Stone) vale "mais" que um terreno básico e fica por último; a habilidade colorida do talismã, por ter o dano como subabilidade, ainda o põe entre as fontes de recurso limitado em `getAvailableManaSources`. A regra escolhida é sempre pedras primeiro na parte genérica, só no OK do pagamento do jogador (`AutoPay`, chamado pelo `ok` em `Session`): antes do Automático do Forge, a ponte vira as pedras de mana (artefatos que não são criatura nem terreno) cuja habilidade custa só {T}, sem subabilidade (o dano do talismã fica de fora) e sem mana para ativar (os Signets ficam de fora), primeiro as de mana incolor e depois as de uma cor (Arcane Signet), cada uma desde que a mana dela caiba no genérico que falta (o Sol Ring não paga {1}, para não sobrar mana). Uma pedra só entra se o Forge ainda conseguir pagar o resto sem ela (as escolhidas ficam reservadas na memória da IA enquanto ele planeja) e se, ao todo, não virar mais permanentes do que o plano do próprio Forge: assim a mana colorida do talismã continua só para quando faltar a cor, e um Signet que paga duas manas com um Pântano não perde para uma pedra a mais. O resto do custo segue com o Automático do Forge, e a reserva com mana já flutuando também. O pagamento tocando nas cartas e o do computador não mudam. Testes: custo só genérico, cor que os terrenos e o talismã dão, Mind Stone e Arcane Signet, talismã com Battlefield Forge (com Montanha, sem dano; sem ela, 1 de dano de um jeito ou de outro e a Planície fica), talismã como única fonte de azul (paga o azul, com o dano), Signet (o resultado é igual ao do Forge) e Sol Ring. Ficou de fora: usar o Signet na parte genérica (ele pede {1} de outra fonte, e o Forge já o usa quando falta mana) e evitar o dano escolhendo entre o talismã e uma terra de dor quando os dois dão a cor.

## 63. Apelido de quem enviou o relato ✅

Os relatos de sugestão e erro (item 28) chegam sem dizer quem os enviou: levam o texto, o aparelho, as preferências da mesa e, se o jogador escolher, a partida anexada (que tem os nomes de todos os jogadores, mas não diz qual deles relatou). Para responder ou entender o contexto, ajuda saber o apelido de quem enviou. Levantamento feito em 31/10/2026:

- O relato é montado em `src/feedback.ts` (`FeedbackReport`) e enviado para a ponte em `/api/relatos` (`Feedback.java`, guardado por `FeedbackStore`); a área de admin (`src/admin/admin.ts`) lista os relatos.
- A conta (Entrar com Google) guarda o apelido (`apelido` em `ContaPerfil`, `src/conta/session.ts`; `Accounts.java`), e o pedido à ponte já sabe mandar o token da sessão. O nome usado nas salas fica em `mesa:name` (`#netName` em `src/ui/lobby.ts`).

Decidido em 31/10/2026: só o apelido, sem registrar nem pedir e-mail.

- [x] Com a conta conectada, o relato leva o apelido da conta. A ponte o tira da sessão (pelo token), e não do corpo do relato, para ninguém relatar em nome de outra conta; guarda também o id da conta, para juntar os relatos de um mesmo jogador.
- [x] Sem conta, o relato leva o nome usado na partida (o da sala, `mesa:name`), marcado como "nome informado", sem verificação.
- [x] Sem conta e sem nome, continua anônimo, como hoje.
- [x] O formulário diz, numa linha discreta, com que nome o relato vai ("Enviando como Ana"), para o jogador saber antes de mandar.
- [x] A área de admin mostra o apelido em cada relato e permite filtrar por ele.
- [x] Relatos na fila do aparelho (enviados sem rede) levam o apelido do momento em que foram escritos.
- [x] Atualizar a seção "Relatos de erro e sugestões" da política de privacidade (`src/privacidade.ts`): o relato passa a levar o apelido, que é apagado junto com ele em até 90 dias.

Decidido em 31/10/2026 (versão 0.99.0): o relato leva só o apelido, nunca o e-mail, e o jogador pode mandar sem ele. Com a conta conectada, o aparelho manda o token da conta em `Authorization` e a ponte tira dele o id da conta e o apelido (`Accounts.reportAuthor`): o nome na mesa sincronizado com a conta (`mesa:name` nas preferências dela) ou, sem ele, o `apelido` do perfil (o primeiro nome do Google), o mesmo que o menu da conta mostra em "Conectado como"; com a sessão válida, o `name` do corpo é ignorado. Sem conta, o relato leva no corpo o `name` (o `mesa:name` das salas, limpo e cortado em 24 letras), guardado como nome informado. Sem conta e sem nome, vai anônimo. O formulário mostra, entre a descrição e "O que vai junto", a linha "Enviando como Ana" (com conta e sem nome: "Enviando pela sua conta") e a caixa **Enviar sem meu nome**, desmarcada; marcada, a linha vira "Enviando sem nome" e o relato sai sem `name` e sem o token, ou seja, sem apelido nem id da conta. Sem conta e sem nome, a linha nem aparece. O "O que vai junto" passou a citar o nome e terminar em "Nada de e-mail nem IP." O que fica guardado: `author: {nickname, account}` (conta, verificado) ou `author: {nickname, informed: true}` (nome informado), na linha do índice (`indice.jsonl`) e no começo do arquivo do relato, ao lado de `code`, `receivedAt` e `bridge`; relato anônimo não tem `author`, e os relatos antigos continuam sem. O token da conta não é guardado, e o apelido some com o relato na retenção de 90 dias. Fila do aparelho: o relato guardado sem rede leva no corpo o nome do momento em que foi escrito e, no cabeçalho, o token daquele momento (que já ficava no aparelho); com a caixa marcada, não leva nenhum dos dois. Se o token ainda valer quando o relato sair, vale a conta (com o apelido atual dela); se tiver vencido, a pessoa tiver saído ou apagado a conta, a ponte não confia nele e fica com o nome do corpo como nome informado, sem id da conta. Na área de admin, cada relato mostra quem enviou na lista (com "(informado)" quando não veio da conta) e no detalhe ("enviado por" e o começo do id da conta), a busca também acha pelo apelido, e o filtro **Quem enviou** separa por conta (juntando os relatos de um jogador mesmo se o apelido mudou), por nome informado e os anônimos. A issue do GitHub gerada do relato não leva o apelido. A política de privacidade explica o apelido, a caixa e que ele é apagado com o relato. Ficou de fora: mostrar ao jogador a lista dos relatos que ele mandou, e responder a ele pelo jogo.

## 64. Tirar a palavra "ponte" do que o jogador vê ✅

"Ponte" é o nome interno do servidor que roda o Forge (`forge-bridge`), e o jogador não precisa conhecê-lo. Mesmo assim, ele aparece em mensagens da mesa, principalmente nos erros de conexão. Levantamento feito em 31/10/2026 (só textos que aparecem na tela; comentários e nomes no código ficam como estão):

- Tela inicial (`src/main.ts`): "Conectando à ponte do Forge…", "Não encontrei a ponte do Forge em …", "A conexão com a ponte caiu." e "Não consegui voltar à partida em andamento: a ponte em … não respondeu."
- Mesa (`src/ui/forgeTable.ts`): "A conexão com a ponte caiu. Voltando à partida…", "A partida fica guardada na ponte por alguns minutos." e "A ponte do Forge parou de responder."
- Mensagens que o servidor manda e a mesa mostra: "A ponte está ocupada. Tente de novo." (`Admin.java` e o pedido de contas) e o aviso de contas desligadas.
- `CHANGELOG.md` (o painel Novidades): três entradas antigas falam em "ponte" (o endereço da ponte, rodar a ponte do Forge).
- A área de admin (`src/admin`) também usa "ponte", mas é só para o responsável; fica de fora.

- [x] Trocar "ponte" por um termo genérico nos textos da tela inicial e da mesa, por exemplo "servidor" ("Conectando ao servidor…", "A conexão com o servidor caiu.", "O servidor parou de responder."), sem citar o Forge quando ele não ajuda o jogador.
- [x] Mesma troca nas mensagens de erro que o servidor manda para a mesa.
- [x] Reescrever as entradas antigas do `CHANGELOG.md` que falam em "ponte", ou deixá-las como registro histórico (a decidir): reescritas.
- [x] Um teste que procure "ponte" nos textos visíveis (mensagens de `setStatus`, textos das telas, `CHANGELOG.md`, `src/novidades.json`) para a palavra não voltar.
- [x] Ajustar a regra no `CLAUDE.md`: textos para o jogador não usam "ponte".

Decidido em 31/10/2026 (versão 0.97.3): o termo é "servidor", sem citar o Forge. Tela inicial: "Conectando ao servidor…", "Não encontrei o servidor em …", "A conexão com o servidor caiu." e "Não consegui voltar à partida em andamento: o servidor em … não respondeu." Mesa: "A conexão com o servidor caiu. Voltando à partida…", "A partida fica guardada no servidor por alguns minutos." e "O servidor parou de responder." O servidor manda "O servidor está ocupado. Tente de novo." (conta e admin) e "Contas desligadas: defina MESA_GOOGLE_CLIENT_ID no servidor."; o aviso de área de admin desligada, os registros no console do servidor e a área de admin (`src/admin`) ficam como estavam. As três entradas antigas das Novidades (0.5.0 e 0.5.1) passaram a dizer "servidor", sem mudar o sentido. `tests/sem-ponte.test.mjs` procura `ponte`/`pontes` como palavra inteira (não pega "ponteiro") no `CHANGELOG.md`, no `src/novidades.json`, nos textos literais de `src/**/*.ts` fora de `src/admin` (lidos pela árvore do TypeScript, então comentários não contam), no CSS e nas páginas sem comentários, e nas mensagens de `Response.error` do servidor. A mesa de teste (`tests/fixtures/duel-table.html`) ganhou `?cenario=reconectando` e `?cenario=conexao-perdida&sala=1`, usados nos prints das Novidades.

## 65. Histórico e números das minhas partidas ✅

Quem entra com a conta não tem onde ver as próprias partidas: quantas jogou, quantas venceu, com quais decks e contra quem. Levantamento feito em 01/11/2026:

- O servidor já guarda um resumo de cada partida concluída (`MatchHistory`, uma linha JSON por partida em `<dir>/AAAA-MM.jsonl`: formato, jogadores, decks, quem venceu cada jogo, turnos, duração), mas só a área de admin lê, e a linha não diz qual conta era cada jogador (`Session.historyJson`).
- A conta (`Accounts`, um arquivo por conta) já guarda os decks e as preferências; o navegador fala com ela com o token da sessão (`src/conta/session.ts`).

- [x] Ligar cada assento à conta de quem jogou, quando o jogador está conectado (o servidor tira a conta do token, como no relato do item 63), e gravar o id da conta na linha do histórico. Partidas antigas ficam sem dono.
- [x] Rota da conta que devolve as partidas do jogador (só as dele), com paginação.
- [x] Tela **Minhas partidas** (no menu da conta): lista com data, formato, oponentes, deck usado, resultado, duração e número de turnos.
- [x] Números: partidas e vitórias, taxa de vitória por deck, por formato e por oponente (computador ou pessoas), duração média, sequência atual.
- [x] Filtros por período, formato e deck.
- [x] Privacidade: só o próprio jogador vê os números dele; os nomes dos oponentes aparecem como na partida. Apagar a conta apaga a ligação com as partidas. Atualizar a política de privacidade.
- [x] Novidades com prints da tela.

Decidido em 01/11/2026, antes de começar: partidas contra o computador contam junto com as outras; o deck é identificado pelo deck salvo na conta (o id dele), sem comparar a lista jogada, então o mesmo deck editado continua sendo o mesmo; e o item não espera o banco do item 66: lê os arquivos do histórico por enquanto.

## 67. Cartas maiores quando uma fileira do campo está vazia ✅

Veio da sugestão S24. Medido em 01/11/2026 na página de teste da mesa (1440×900): o espaço sobrando no campo é só na largura. Na altura, a fileira de criaturas (153 px) e a de terrenos (86 px) já ocupam os 310 px de cada lado, e a carta não muda de proporção. Por isso o ganho ficou no caso em que uma das fileiras está vazia, comum no começo da partida.

- [x] Com uma fileira vazia, a outra usa a altura livre do campo (medida na mesa, também ao redimensionar): criaturas até 1,6 vez o tamanho normal, terrenos e outras permanentes até o tamanho das criaturas, nunca menores que o normal.
- [x] Vale no 1x1, no Commander 1x1 e no seu campo no Commander com vários jogadores; os assentos dos oponentes no Commander com vários jogadores ficam como estão.
- [x] Conferido no computador e no celular (390×844).

Decidido em 01/11/2026: a fileira vazia cede espaço, em vez de juntar tudo numa fileira só com poucas cartas (as cartas mudariam de lugar no meio da partida).

## 68. Tapete de mesa com a arte do deck ✅

Veio da sugestão S26. Atrás do campo de cada jogador, a arte de capa do deck dele (a mesma do retrato), escura, desfocada e sumindo nas bordas.

- [x] Arte do deck que veio com a partida; em rede, a capa que a sala mostra de cada jogador. Sem arte conhecida, o fundo de sempre.
- [x] 1x1 e Commander com vários jogadores (cada assento com o seu tapete).
- [x] Opção **Tapete com a arte do deck** em Menu → Opções → Aparência, guardada no aparelho como o estilo das cartas.

Decidido em 01/11/2026: intensidade sutil (cerca de 25% do brilho) e ligado por padrão.

## 69. Focar num oponente em tela cheia ✅

Pedido em 01/11/2026. Hoje o **Só este** (item 25) mostra só o campo de um oponente, mas dentro da faixa de cima da mesa: o campo dele continua dividindo a tela com o seu, a mão e a caixa de ação. Para ler com calma a mesa de quem preocupa (um combo montando, muitas permanentes, marcadores), falta um jeito de olhar só para ele.

- [x] Ação **Focar** no cabeçalho de cada oponente (e no retrato dele, pelo inspetor do jogador) que abre o campo daquele oponente em tela cheia: retrato, vida, marcadores, dano de comandante, zona de comando, cemitério, exílio e todas as permanentes em tamanho grande.
- [x] Na tela cheia, **Fechar** volta à mesa como estava, e uma fileira com os retratos dos outros oponentes troca o foco para outro sem fechar.
- [x] As cartas continuam inspecionáveis (passar o mouse, tocar, inspetor), mas a tela é só para olhar: jogar, atacar e escolher continuam na mesa.
- [x] Quando chega uma decisão sua (prioridade com algo na pilha, ser atacado, escolher alvo), avisar na própria tela cheia com um botão para voltar à mesa, ou fechar sozinho; decidir qual antes de começar.
- [x] Vale também no 1x1 (o único oponente) e no celular, onde ganha mais: lá cada campo é bem pequeno.
- [x] Teclado e leitor de tela: Esc fecha, setas trocam de oponente, a tela anuncia de quem é o campo.

Decidido em 01/11/2026 e feito na 0.102.0: a tela cobre a mesa inteira e é só para olhar; uma decisão sua vira uma faixa dourada com **Voltar à mesa**, sem fechar sozinha; a entrada é um botão ⤢ novo (no Commander, ao lado de Só este e Ocultar; no 1x1, ao lado do retrato), e **Só este** continua como estava. No celular, os botões dos assentos do Commander, que ficavam escondidos atrás das pilhas, foram para o canto de baixo do campo de cada oponente. O ⤢ fica no retrato do oponente, e não no inspetor do jogador como estava no plano.

## 70. Tela inicial com o deck primeiro ✅

Veio da sugestão S22. A tela abria com "Como jogar:" e uma frase de instrução, e no celular o jogador passava por formato, oponentes, jogadores e decks dos computadores antes de ver os decks.

- [x] Faixa **Jogar de novo** no alto para quem já jogou: arte do último deck, nome, resumo da partida ("Commander · 4 jogadores · computadores aleatórios") e o botão que começa outra partida igual. Fica escondida contra outra pessoa (é preciso escolher a sala) e com o deck inválido no formato.
- [x] Sem o título "Como jogar:": quem joga pela primeira vez vai direto aos decks (o título continua para leitores de tela).
- [x] No celular, os ajustes ficam numa linha de resumo com **Mudar**; contra outra pessoa, começam abertos. No computador, a barra lateral continua aberta.

Decidido em 01/11/2026: faixa com a arte do deck; ajustes resumidos só no celular.

## 71. Cabeçalho mais limpo ✅

Veio da sugestão S23. O cabeçalho tinha Enviar sugestão ou erro, Novidades com a versão, o tema e a conta com o mesmo peso das abas.

- [x] **Novidades** virou um ícone com o ponto de versão nova; a versão fica dentro do painel.
- [x] Novo botão **⋯** com **Enviar sugestão ou erro** e as paletas do **Tema da mesa**; vale para quem entrou com a conta e para quem não entrou.
- [x] O botão de instalar o jogo continua no cabeçalho quando o navegador oferece.

Decidido em 01/11/2026: Novidades fica como ícone; relatar e tema vão para o ⋯.

## 72. Tela acesa durante a partida ✅

Veio da sugestão S18. No celular, a tela apagava sozinha enquanto o oponente pensava, e às vezes o jogador perdia a vez ou a conexão caía ao voltar.

- [x] Pedir ao aparelho para manter a tela acesa enquanto a partida (ou a mesa livre) está aberta, soltar ao sair e pedir de novo quando a aba volta a aparecer.
- [x] Opção **Manter a tela acesa** em Menu → Opções → Jogo, guardada no aparelho; some onde o navegador não oferece.

Decidido em 01/11/2026 e feito na 0.103.0: ligado por padrão.

## 73. Vibração quando é a sua vez ✅

Veio da sugestão S19. No celular com o som desligado, só a tela avisava que a vez chegou.

- [x] Vibração curta quando o seu turno começa, quando você precisa bloquear e quando chega uma decisão sua no turno de outro jogador (alvo, escolha, pergunta). As decisões no próprio turno não vibram, e duas chegadas seguidas vibram uma vez só.
- [x] Opção **Vibrar na sua vez** em Menu → Opções → Jogo, guardada no aparelho; some onde o aparelho não vibra (no iPhone, por exemplo).

Feito na 0.103.0: ligado por padrão e com opção própria, em vez de seguir a de **Notificar quando for seu turno** como estava na sugestão, porque aquela depende da permissão de notificações e vale só com a mesa em outra aba; ao entrar ou reconectar, a mesa não vibra.

## 74. Som ligado por padrão ✅

Pedido em 01/11/2026. Hoje os efeitos sonoros começam desligados: quem nunca mexeu em **Menu → Opções → Som** joga em silêncio e nem sabe que a mesa tem som.

- [x] Efeitos sonoros ligados para quem nunca escolheu; quem já desligou continua com o som desligado.
- [x] O navegador só toca som depois do primeiro toque na página: conferir que o primeiro som não se perde nem atrasa.
- [x] Decidir o volume inicial e se vale um aviso discreto na primeira partida ("Som ligado · desligar em Opções").

Decidido em 01/11/2026 e feito na 0.104.0: `normalizeAudioSettings` só deixa mudo quem tem `muted: true` gravado. A mesa só grava o som depois de uma escolha (ligar, desligar, volume, pacote), então quem tem "desligado" salvo escolheu isso e continua assim. O volume inicial continua 35% e não há aviso: desligar continua em Opções. A mesa é criada ao abrir a página, então o primeiro toque em qualquer lugar (na escolha de deck, no **Jogar**) já libera o áudio e carrega os sons antes da partida.

## 75. Sala pública por padrão ✅

Pedido em 01/11/2026. Hoje toda sala nova começa privada e só vira pública se o jogador escolher, então a lista de **Salas públicas** fica quase sempre vazia e quem procura partida não acha ninguém.

- [x] Sala nova começa pública; quem quiser jogar só com amigos troca para privada antes de criar.
- [x] Deixar claro na criação que a sala vai aparecer na lista para todos (e como torná-la privada), sem pegar ninguém de surpresa.
- [x] Decidir se a escolha do jogador fica lembrada para a próxima sala e se vale também para as salas com computador nos lugares vazios.

Decidido em 01/11/2026 e feito na 0.104.0: o tipo de sala começa em **Pública** (agora o primeiro botão) e a escolha fica lembrada em `mesa:roomVisibility`, então quem escolheu **Privada** continua com ela. A explicação embaixo dos botões ("Aparece na lista de salas públicas para qualquer pessoa entrar.") já existia. As salas não têm computador nos lugares vazios, então essa parte não se aplica. A sala aberta por um link que ainda não existe continua pública, sem mudar a escolha guardada.

## 76. Menos selos e ícones soltos na mesa ✅

Veio da sugestão S25. O topo da partida mostrava Menu, tela cheia, Desfazer, o formato, a sala e o placar, e a fileira do canto de baixo era só de ícones sem texto, que só se entendiam passando o mouse.

- [x] No topo, Menu, tela cheia, Desfazer e o placar (só na melhor de três); quem caiu e o aviso de quem só assiste continuam lá. Formato e sala foram para o alto do Menu, junto do placar; quem assiste a partida também fica só no Menu.
- [x] Tocar num ícone da trilha de fases mostra o nome dele por 3 segundos; no toque, a trilha tem 44 px de altura, mais espaço entre as fases, e o toque entre dois ícones vale para o mais perto.
- [x] O selo de passar automaticamente virou uma linha embaixo dos botões com o ícone e o nome do nível (44 px de altura no toque).
- [x] No celular, Menu, tela cheia e Desfazer com 44 px; o retrato do oponente no 1x1 foi 16 px para a direita e o ⤢ de focar nele virou um selo no canto do retrato (antes ficava por baixo do Desfazer).

Decidido em 01/11/2026 e feito na 0.105.0: a tela cheia continua no topo; os ícones de baixo ganham rótulo ao tocar, em vez de irem para um botão de ajustes. Os ícones da trilha não chegam a 44 px de largura cada um (a trilha não caberia no celular): a altura é de 44 px e a largura de cada um vai até a metade do caminho para o vizinho.

## 77. Lista de atalhos de teclado ✅

Veio da sugestão S11. A partida tinha atalhos (Espaço para passar, Esc, I no inspetor, setas na pilha e nos gatilhos), mas eles só se descobriam por acaso.

- [x] A tecla **?** abre a lista dos atalhos da partida; na mesa livre, a lista dela (C, D, Ctrl+Z, Shift+F10).
- [x] Link **Atalhos de teclado** no pé de Menu → Opções, escondido nos aparelhos só de toque.

Feito na 0.105.0.

## 78. Gráfico de vida no fim da partida ✅

Veio da sugestão S9. Ao fim do jogo, só sobrava o resultado.

- [x] O servidor anota a vida de cada jogador no começo de cada turno (o fim do anterior) e manda a lista em `lifeHistory`, só com o jogo acabado. Desfazer até um turno anterior reescreve os pontos dali em diante.
- [x] Na tela de resultado, uma linha por jogador, com a vida final na ponta; passar o mouse ou tocar num turno mostra a vida de todos. Tabela escondida para leitores de tela.
- [x] No Commander, o dano de comandante de cada jogador logo abaixo, do maior para o menor.
- [x] Na melhor de três, o gráfico do jogo que acabou também em **Prepare o próximo jogo**, recolhido em **Ver gráfico de vida**.

Decidido em 01/11/2026 e feito na 0.105.0: o histórico fica no servidor, para sobreviver a quedas, recarregar a página e valer para quem assiste; o gráfico aparece no resultado final e, recolhido, entre os jogos da melhor de três. Cores conferidas para daltonismo no fundo da mesa; a quarta linha é tracejada e todas levam o nome na ponta.

## 79. Aviso quando os dados das cartas não carregam ✅

Veio da sugestão S2. Sem rede ou com o Scryfall fora, a biblioteca e a tela Jogar engoliam o erro, e o jogador via decks sem arte e sem cores.

- [x] Aviso com **Tentar de novo** na biblioteca de Meus decks e na tela Jogar, só quando falta mesmo o dado de alguma carta (sem rede, uma legalidade vencida também falha a busca, mesmo com as artes guardadas).
- [x] O aviso do editor ganhou o mesmo **Tentar de novo**.

Feito na 0.105.0.

## 80. Destaque para planeswalkers: entrada e lealdade ✅

Planeswalkers estão no meta e hoje entram na mesa e usam lealdade como qualquer permanente: a carta aparece no campo e o número muda, sem nada que chame a atenção. Dar a eles um momento próprio, para quem joga e para quem assiste.

- [x] Entrada: um efeito quando um planeswalker chega ao campo (brilho na moldura, a carta "pousando" com um pulso na cor dele, o marcador de lealdade surgindo com o valor inicial).
- [x] Habilidade de lealdade: ao ativar, o marcador reage ao custo (sobe com brilho no **+**, desce no **−**), com o custo em número flutuante e um destaque na habilidade usada; o **−** final (ultimate) ganha um efeito maior.
- [x] Som próprio para a entrada e para o uso de lealdade, respeitando o som desligado.
- [x] Respeitar "reduzir movimento" do sistema (só o número e um realce curto) e não atrasar a partida: o efeito acompanha a jogada, sem esperar terminar.
- [x] Ver o que a ponte já manda (entrada no campo, ativação com custo de lealdade, contador mudando) e o que falta para saber que foi uma habilidade de lealdade e qual delas.
- [x] Cenários no laboratório de efeitos (item 18) para entrada, **+**, **−** e ultimate.

Decidido em 02/11/2026 (versão 0.108.0): estilo marcante sem pausar a partida, ultimate com efeito maior e o efeito vale para todos os jogadores (inclusive o computador e quem assiste). A ponte passa a mandar, no `ability-activated` de uma habilidade de lealdade, `loyalty`, `cost` ("+2", "0", "-3", com o X escolhido no "-X") e `ultimate` (o `Ultimate$ True` do script da carta), lidos da habilidade real pelo id da pilha (`Loyalty.java`); o marcador de lealdade posto como custo do **+** chega antes, marcado `paid`, e a mesa não toca o som de marcador por cima. Na mesa (`planeswalkerEffects.ts`, `motion.ts`):
- Entrada: depois do "assentar", a moldura acende na cor do planeswalker (pelo custo de mana: uma cor, a dela; várias, dourado; nenhuma, prata), um anel de luz se abre em volta da carta e o escudo de lealdade surge com um pulo. O passo da entrada vai de 340 para 560 ms. O blink continua com o anel do exílio.
- Lealdade: o escudo pula e fica verde (+), vermelho (−) ou dourado (0) por 1 s; o custo sobe do topo da carta, como o número de dano (no escudo ele cobria o texto e o aviso); o aviso troca a engrenagem por um escudo com o custo e mostra o texto da habilidade embaixo. A frase é "Ana usou +2 de Jace Beleren." (e no histórico também).
- Ultimate: onda de luz da carta pela mesa, tremor leve, número maior com o selo **Ultimate**, aviso maior ("usou o ultimate de Jace Beleren (−10)"), passo de 1,3 s e aviso de 2,6 s.
- Sons: `31-walker` (entrada) e `32-loyalty` (lealdade) nos 8 pacotes; o ultimate toca o da lealdade a 0,8× e 1,3× mais forte; a entrada do planeswalker não é abaixada como a das outras permanentes.
- Reduzir movimento: sem anel, onda nem pulos; ficam a moldura acesa, a cor do escudo e o número.
- Laboratório de efeitos: seção **Planeswalker** com entrar (Jace e um multicolor), +2, 0, −1 e ultimate, dos dois lados.

## 81. Relatar com a partida anexada por padrão e direto da tela de resultado ✅

Hoje **Anexar a partida** só vem marcado num erro relatado durante a partida (ou por **Relatar este erro**); numa sugestão ou ao relatar da tela inicial, vem desmarcado, e muita gente envia sem a partida, que é o que mais ajuda a repetir o problema. E, quando a partida acaba, a tela de vitória ou derrota não tem como relatar: é preciso voltar à tela inicial e abrir o menu.

- [x] **Anexar a partida** vem marcado por padrão sempre que houver uma partida para anexar (erro ou sugestão, da partida ou da tela inicial). O jogador continua podendo desmarcar, e o "o que vai junto" segue dizendo o que vai.
- [x] Botão de relatar na tela final (vitória ou derrota), abrindo o mesmo formulário já com a partida que acabou de terminar anexada.
- [x] Na melhor de três, o mesmo botão entre os jogos, em **Prepare o próximo jogo**.

Decidido em 02/11/2026 (versão 0.118.0): o botão se chama **Relatar um problema**, abre o formulário já em **Algo deu errado** e fica discreto, abaixo dos botões da tela de resultado (e abaixo dos botões de **Prepare o próximo jogo**); a partida que vai junto é a que acabou de terminar, ainda na memória. **Anexar a partida** vem marcado sempre que há partida, em erro ou sugestão, e trocar o tipo não mexe mais na caixa. Página de teste: `window.fixture.gameEnd('result' | 'sideboard')` em `tests/fixtures/duel-table.html`.

## 82. Pedido de desfazer no centro da tela ✅

Hoje, quando alguém pede para desfazer numa sala, quem precisa aceitar vê o pedido só numa faixa estreita no alto da mesa (a mesma das votações para pular o turno de quem caiu), com **Aceitar** e **Recusar**. Ela passa despercebida no meio da jogada, e a partida fica parada esperando um voto que o jogador nem notou.

- [x] O pedido que o jogador precisa votar aparece no centro da tela, por cima da mesa: quem pediu, o que volta ("desfazer: conjurar Lightning Bolt") e os botões **Aceitar** e **Recusar**.
- [x] Some assim que o jogador vota, quando quem pediu desiste ou quando o pedido se resolve; quem só espera o voto dos outros (ou quem pediu) continua vendo a faixa do alto, como hoje.
- [x] Teclado e leitor de tela: o foco vai para o pedido ao aparecer e volta para onde estava ao sumir; o pedido é anunciado.

A decidir: se a janela no centro bloqueia a mesa até o voto (como as escolhas) ou deixa ver e clicar no campo por trás; se toca um som ou vibra ao chegar; e se a votação para pular o turno de quem caiu ganha o mesmo tratamento.

## 83. Ícone no topo do cemitério e do exílio ✅

Hoje o cemitério e o exílio aparecem iguais ao lado do grimório: os dois mostram a carta do topo e a contagem, e só o balão do mouse ("Cemitério", "Exílio") diz qual é qual. No toque, ou de relance no meio da partida, é fácil confundir os dois, principalmente quando o exílio tem uma carta parecida com a do cemitério.

- [x] Um mini ícone no topo de cada monte: um para o cemitério e outro para o exílio, pequeno, sem cobrir a carta do topo nem a contagem (como os outros selos discretos da mesa).
- [x] Vale para todos os jogadores (o seu lado, o do oponente, os assentos do Commander e a mesa em foco) e também com o cemitério vazio.
- [x] O nome do monte continua no balão e no leitor de tela; o ícone só ajuda a reconhecer de relance.
- [x] Funciona nos temas claros e escuros e no celular, onde os montes são menores.

A decidir: o desenho de cada ícone (por exemplo, lápide para o cemitério e um portal ou vórtice para o exílio), o canto em que ele fica, e se o grimório ganha um também para completar o trio.

## 84. Corrigir o texto dos botões "Ver a mesa de" de quem assiste ✅

Assistindo a uma partida de Commander, a fileira **Assistindo. Ver a mesa de:** (acima da barra de baixo) não cabe: os botões com o nome de cada jogador ficam estreitos e o texto sai pela borda. "Alisson" aparece cortado dentro do botão dourado, "Giuseppe Cadura" e "The Powergu…" quebram em duas linhas e vazam para fora, e o último ("MTGomes…") é cortado pela beira da tela. Visto em 02/11/2026 numa mesa de quatro jogadores.

- [x] Cada botão mostra o nome inteiro numa linha só, ou cortado com reticências e o nome completo no balão e no leitor de tela, sem o texto sair do botão.
- [x] A fileira cabe na largura da tela com quatro jogadores de nomes longos: quebra em mais de uma linha ou rola de lado, sem cortar o último botão na beira.
- [x] O botão do jogador que se está vendo (o dourado) continua legível, sem o texto encostar na borda.
- [x] Confere no celular em pé e deitado, e no computador.

A decidir: se os nomes longos são cortados com reticências ou se a fileira quebra em duas linhas; e se a fileira vira uma lista de escolha (como um menu) quando houver nomes demais para caber.

## 85. Verso das cartas (sleeve) na cor de cada jogador ✅

Hoje todas as cartas viradas para baixo têm o mesmo verso: a mão do oponente, os grimórios, as cartas que voam na compra, as viradas para baixo no campo e as escondidas no exílio. Numa mesa com vários jogadores, não dá para saber de relance de quem é um grimório ou uma carta escondida, e a mesa fica sem a cara de "cada um com o seu sleeve" de uma partida de verdade.

- [x] Cada jogador ganha uma cor de sleeve, sorteada no começo da partida entre uma paleta de cores bem diferentes umas das outras; dois jogadores da mesma mesa nunca ficam com a mesma cor.
- [x] O verso de todas as cartas desse jogador usa a cor dele: a mão (a dele, vista pelos outros), o grimório, a compra e as cartas que voam, as viradas para baixo no campo e as escondidas no exílio.
- [x] A cor é a mesma para todos na mesa (o servidor sorteia e manda), continua igual na revanche e entre os jogos da melhor de três, e quem assiste vê as mesmas cores.
- [x] O verso continua reconhecível como verso de carta: a cor tinge a moldura ou o fundo, sem esconder o desenho.
- [x] Funciona nos temas claros e escuros, com reduzir movimento e no celular; as viradas para baixo com a carta de lembrete no campo continuam com a carta de lembrete.

A decidir: a paleta (quantas cores e quais, pensando em quem não distingue vermelho e verde); se o jogador pode escolher a própria cor nas opções em vez do sorteio (e o que acontece quando dois escolhem a mesma); e se a cor aparece também em outros lugares do jogador, como a borda do retrato ou o nome.

## 86. Efeito de som e de luz ao conjurar por dobra ✅

Hoje uma mágica conjurada por **dobra** (warp) entra na pilha como qualquer outra: só a etiqueta "Conjurada por dobra" diz que foi diferente. É uma mecânica chamativa, já que a carta entra mais barata e no fim do turno volta para o exílio, e merece um momento próprio, para quem joga e para quem assiste.

- [x] Efeito visual ao conjurar por dobra: a carta chega à pilha com uma distorção ou um rasgo no espaço, diferente da conjuração comum.
- [x] Som próprio da dobra, nos pacotes de som, respeitando o som desligado.
- [x] Um efeito menor quando a permanente conjurada por dobra volta para o exílio no fim do turno, para o jogador entender por que ela sumiu.
- [x] Respeitar "reduzir movimento" do sistema e não atrasar a partida: o efeito acompanha a jogada.
- [x] Ver o que a ponte já manda: a mesa já sabe que a mágica foi conjurada por dobra (a etiqueta da pilha); conferir se dá para reconhecer também a volta ao exílio.
- [x] Cenário no laboratório de efeitos (item 18).

## 87. Página própria para as salas e partidas em andamento ✅

Hoje a lista de salas fica escondida: só aparece depois de escolher **Outra pessoa** como oponente e a aba **Entrar numa sala**, e mesmo ali divide o espaço com o nome, o código e a escolha do deck. Quem abre o jogo não vê que há gente esperando numa sala ou partidas para assistir (agora também as contra o computador), e as salas públicas acabam vazias.

- [x] Uma página só para isso (por exemplo `salas.html`, ao lado de `partidas.html` e `novidades.html`), com as salas esperando jogadores e as partidas em andamento para assistir, cada uma com formato, bracket, lugares, quem joga e quantos assistem.
- [x] Um caminho bem visível na tela inicial: um botão ou aviso com a contagem ("2 salas esperando · 3 partidas para assistir"), que leva à página; no menu também.
- [x] Entrar e assistir direto da página, com as mesmas regras de hoje (deck do formato, nome, sala cheia ou já começada); entrar numa sala pede o deck sem passar pela tela de configurar partida.
- [x] A lista se atualiza sozinha enquanto a página está aberta, e diz quando não há nada ("Nenhuma sala aberta agora: crie uma") com o atalho para criar uma sala pública.
- [x] Filtros simples por formato (Commander, Standard, Pauper...) e por "esperando jogadores" ou "em andamento".
- [x] Celular primeiro: a lista em cartões grandes, fácil de tocar; tema claro e escuro.

A decidir: o nome e o endereço da página ("Salas", "Mesas abertas", "Ao vivo"); se a lista da tela de configurar partida continua lá ou dá lugar ao atalho; se a página mostra uma prévia da mesa (vida, turno) das partidas em andamento; e se avisa (som ou notificação) quando uma sala nova do formato preferido abre.

## 95. Bracket máximo dos bots na criação da partida ✅

Contra o computador em Commander, o deck de cada bot é um dos decks prontos escolhido à mão ou "Deck aleatório" entre os compatíveis, sem olhar a força. Um deck Bracket 2 pode cair contra um bot com um deck Bracket 4, e o jogador só descobre na mesa (pelo selo "B4"). Os decks prontos já têm o bracket guardado (item 35).

- [x] Na criação da partida contra o computador, um controle **Bracket máximo dos bots** (1 a 5, mais "Qualquer"), que vale para todos os computadores da mesa.
- [x] "Deck aleatório" só sorteia entre os decks prontos com bracket até o máximo escolhido; a lista de decks de cada computador mostra só esses (ou mostra os outros apagados, com o bracket ao lado).
- [x] Um deck já escolhido acima do novo máximo volta para "Deck aleatório", com um aviso curto, como já acontece ao trocar de formato.
- [x] Sugerir como máximo o bracket do deck do jogador, sem forçar.
- [x] Se nenhum deck pronto couber no máximo, avisar e não deixar começar (ou subir o máximo até o menor bracket disponível).
- [x] Lembrar a escolha, como o deck e o oponente.
- [x] O resumo da partida ("Commander · 4 jogadores · computadores aleatórios") diz o máximo ("até Bracket 3").
- [x] Decidir se vale também fora do Commander (hoje o bracket só existe no Commander).

Feito na 0.126.0 (decidido em 04/11/2026): botões **Qualquer**, 2, 3 e 4 (só os brackets que têm deck pronto, então nunca falta deck); vale no Commander e no Precon, e fora deles o controle não aparece. Com máximo ou série escolhidos, o sorteio do "Deck aleatório" é feito na mesa, entre os decks que cabem.

## 96. Formato exclusivo de precons de Commander ✅

Um formato à parte, **Precon**, em que cada jogador só joga com um deck pré-construído oficial de Commander, do jeito que saiu da caixa: nada de trocar cartas. As partidas ficam equilibradas sem precisar de bracket, e quem está começando pode jogar sem montar deck. As listas não precisam ser digitadas: o Forge já traz 180 precons em `forge-gui/res/quest/commanderprecons/*.dck` (comandante, cartas e edição), e todos os listados abaixo estão lá (conferido em 04/11/2026).

**Comportamento**

- [x] Novo formato **Precon** na criação da partida e da sala, com as regras do Commander (40 de vida, dano de comandante, identidade de cor) e só os decks desta lista.
- [x] Na escolha de deck, os precons agrupados por série, com a arte do comandante, as cores e o ano. Sem editar: o menu da carta só tem "Ver as cartas".
- [x] Contra o computador, os bots também jogam com precons, escolhidos à mão ou "aleatório", com a opção de sortear só da mesma série do jogador.
- [x] Na sala, conferir que todos os lugares têm um precon da lista; um deck do jogador, mesmo com as mesmas cartas, não serve.
- [x] Importar as listas do Forge por script (gerar o JSON dos precons a partir dos `.dck`), em vez de copiar à mão; guardar a série, o ano e o comandante de cada uma.
- [x] Nome em português de cada precon e de cada série (a tradução oficial quando houver).
- [x] Bracket de cada precon (item 35), para mostrar no selo como nos outros decks.
- [x] Os decks prontos que hoje são precons adaptados (Linhagem do Ur-Dragão, Radiação do Homem-Mariposa, Olho de Sauron…) dão lugar ao precon original, sem nenhuma alteração: as mesmas cartas da caixa, como estão no `.dck` do Forge. Levantar quais decks prontos são adaptações de um dos 44 precons e trocar cada um pelo original (decidido em 04/11/2026).
- [x] Item no CHANGELOG e prints na página Novidades em imagens.

**As 10 séries** (escolhidas pela popularidade na comunidade; dá para trocar ou acrescentar outras depois, já que o Forge tem as 180 listas)

1. **Warhammer 40,000** (40K, 2022)
   - Forces of the Imperium — Inquisitor Greyfax
   - Necron Dynasties — Szarekh, the Silent King
   - The Ruinous Powers — Abaddon the Despoiler
   - Tyranid Swarm — The Swarmlord
2. **Fallout** (PIP, 2024)
   - Hail, Caesar — Caesar, Legion's Emperor
   - Mutant Menace — The Wise Mothman
   - Science! — Dr. Madison Li
   - Scrappy Survivors — Dogmeat, Ever Loyal
3. **O Senhor dos Anéis: Contos da Terra-média** (LTC, 2023)
   - Elven Council — Galadriel, Elven-Queen
   - Food and Fellowship — Frodo, Adventurous Hobbit e Sam, Loyal Attendant
   - Riders of Rohan — Éowyn, Shieldmaiden
   - The Host of Mordor — Sauron, Lord of the Rings
4. **Final Fantasy** (FIC, 2025)
   - Counter Blitz — Tidus, Yuna's Guardian
   - Limit Break — Cloud, Ex-SOLDIER
   - Revival Trance — Terra, Herald of Hope
   - Scions & Spellcraft — Y'shtola, Night's Blessed
5. **Doctor Who** (WHO, 2023)
   - Blast from the Past — The Fourth Doctor e Sarah Jane Smith
   - Masters of Evil — Davros, Dalek Creator
   - Paradox Power — The Thirteenth Doctor e Yasmin Khan
   - Timey-Wimey — The Tenth Doctor e Rose Tyler
6. **Commander 2013** (C13)
   - Eternal Bargain — Oloro, Ageless Ascetic
   - Evasive Maneuvers — Derevi, Empyrial Tactician
   - Mind Seize — Jeleva, Nephalia's Scourge
   - Nature of the Beast — Marath, Will of the Wild
   - Power Hungry — Prossh, Skyraider of Kher
7. **Commander 2016** (C16)
   - Breed Lethality — Atraxa, Praetors' Voice
   - Entropic Uprising — Yidris, Maelstrom Wielder
   - Invent Superiority — Breya, Etherium Shaper
   - Open Hostility — Saskia the Unyielding
   - Stalwart Unity — Kynaios and Tiro of Meletis
8. **Commander 2017** (C17)
   - Arcane Wizardry — Inalla, Archmage Ritualist
   - Draconic Domination — The Ur-Dragon
   - Feline Ferocity — Arahbo, Roar of the World
   - Vampiric Bloodlust — Edgar Markov
9. **Commander 2020 (Ikoria)** (C20)
   - Arcane Maelstrom — Kalamax, the Stormsire
   - Enhanced Evolution — Otrova, Deepfathom Horror
   - Ruthless Regiment — Jirina Kudro
   - Symbiotic Swarm — Kathril, Aspect Warper
   - Timeless Wisdom — Gavi, Nest Warden
10. **Bloomburrow** (BLC, 2024)
    - Animated Army — Bello, Bard of the Brambles
    - Family Matters — Zinnia, Valley's Voice
    - Peace Offering — Ms. Bumbleflower
    - Squirreled Away — Hazel of the Rootbloom

São 44 precons ao todo. Nos `.dck` do Forge, o comandante às vezes vem com um `+` no fim do nome (o cartão de comandante alternativo da caixa) e uma lista vem com espaço a mais no nome do arquivo (`Primal Genesis [C19] [2019] .dck`): o script de importação precisa tratar os dois.

Feito na 0.126.0 (decidido em 04/11/2026): são 43 precons (a lista acima soma 43, não 44), importados por `forge-bridge/scripts/importar-precons.mjs`. Os 10 adaptados (50% ou mais das cartas iguais) deram lugar ao original com o mesmo id e o nome do precon: Bello, César, Chatterfang (agora Hazel), Cloud, Frodo e Sam, Homem-Mariposa, Sauron, Terra, Bumbleflower e Y'shtola; Ur-Dragão, Edgar Markov, Breya, Atraxa e Oloro eram decks montados à parte e ficaram. Os precons aparecem também no Commander, com o selo **Precon**. Os nomes em português são tradução nossa do nome da caixa. Os bots jogam o precon original mesmo com as cartas que a IA do Forge marca como fora do seu alcance (em média 8 por deck): o servidor deixou de recusá-los para o computador. O servidor confere no Precon que as cartas são exatamente as de um precon; quem garante que não é a cópia do jogador é a mesa.

## 100. Passar automaticamente num mini botão ao lado do botão principal ✅

Hoje o nível de passar automaticamente é uma linha embaixo dos botões de ação, com o ícone e o nome do nível (**Só com ações**, **Respostas**…), e tocar nela abre a troca rápida. A linha ocupa altura na caixa de ação o tempo todo. Antes (versão 0.82.0) era um selo pequeno, só com o ícone, junto dos botões.

- [x] Voltar a um mini botão só com o ícone do nível, ao lado do botão principal (o dourado: **Passar**, **Para o combate**, **Fim de turno**…), na mesma linha, sem empurrar os outros botões para baixo.
- [x] O mini botão mantém os estados de hoje: discreto em **Só com ações**, borda dourada em **Parar sempre**, dourado em **Respostas** e **Só quando me afeta**, pulsando com **Até o fim do turno** ligado. O nome do nível fica no balão (`title`) e no `aria-label`.
- [x] Tocar no mini botão abre a mesma troca rápida (níveis e o atalho **Passar até o fim do turno**), com a mesma largura do menu que abre hoje, alinhada à caixa de ação.
- [x] Área de toque confortável no celular (44 px), mesmo com o botão pequeno.
- [x] Item no CHANGELOG e print na página Novidades em imagens.

Feito na 0.129.0 (05/11/2026): o mini botão entra na grade dos botões, ao lado do primeiro botão principal; sem botão principal, fica sozinho à direita. O menu continua com 300 px, alinhado pela direita do botão.

## 98. Animação do mulligan aparece em lugares sem sentido ✅

No mulligan, as cartas da mão anterior voltam ao grimório e a nova mão sai dele, carta a carta. Na prática, as cartas aparecem voando de (ou para) pontos da mesa que não têm a ver com a mão nem com o grimório.

- [x] Reproduzir em duelo e na mesa de 3–4 jogadores, com a mão fixa, oculta e automática, e anotar de onde as cartas saem e para onde vão.
- [x] Ver se a volta usa os lugares guardados da mão de antes (que podem ser de outro arranjo da tela, com a mão inicial aberta no centro, recolhida ou oculta) e se a chegada mede as cartas antes de a mão terminar de se arrumar.
- [x] A mão anterior sai do lugar onde estava de fato na tela e entra no grimório do jogador; a nova sai do grimório e chega ao lugar final de cada carta.
- [x] Mulligan do oponente: só as costas, do lado dele, sem passar pelo seu lado da mesa.
- [x] Respeitar "reduzir movimento" e o modo acelerado.
- [x] Item no CHANGELOG (Corrigido) e print na página Novidades em imagens.

Feito na 0.129.1 (05/11/2026): a causa era a transição da mão (0,2 s, com 0,12 s de espera, da mão recolhida): a mão inicial vai para o centro com `translate(-50%, -50%)`, e a animação media as cartas antes de a transição andar, no lugar antigo. O `deal` termina as transições da mão antes de medir. A volta da mão anterior no mulligan já usava os lugares certos. O mulligan dos oponentes não tem animação, então nada passa pelo seu lado da mesa.

## 99. Mesa de 3–4 jogadores: cabeçalhos mais limpos ✅

Com três ou quatro jogadores, a mesa espalha informação pelos cantos: o relógio, o número do turno e a duração da partida ficam na trilha de fases, embaixo à direita; a zona de comando de cada oponente fica à esquerda do campo dele; e o cabeçalho de cada assento junta vida, nome, bracket, dano de comandante e três botões de foco, mesmo quando parte disso não diz nada (dano 0/21, por exemplo).

- [x] Relógios, turno e duração da partida no topo geral da mesa, numa faixa só, em vez de junto da trilha de fases.
- [x] Zona de comando de cada oponente no topo do assento dele (no cabeçalho), liberando a coluna à esquerda do campo para as cartas.
- [x] Os três botões de foco de cada assento (**Só este**/**Ver todos**, ampliar e **Ocultar**; item 88) num menu só, aberto por um botão no cabeçalho, com o modo atual marcado; acessível pelo teclado.
- [x] Dano de comandante escondido enquanto for zero; aparece no primeiro dano e continua pulsando como hoje (item 15).
- [x] Contador de cartas na sua própria mão, como o dos oponentes, visível também com a mão recolhida ou oculta.
- [x] Bracket de cada jogador só ao passar o mouse ou tocar na vida dele (balão), em vez do selo B1–B5 sempre à vista ao lado do nome; o leitor de tela continua dizendo o bracket.
- [x] Ver se o duelo deve seguir as mesmas mudanças (relógio no topo, contador da sua mão).
- [x] Item no CHANGELOG e prints na página Novidades em imagens.

Feito na 0.130.0 (05/11/2026, decidido no mesmo dia): o duelo também mudou (relógios no topo, contagem da sua mão, dano de comandante só depois do primeiro, bracket no balão). Os relógios ficam numa pílula (`#fTurnInfo`) na barra do topo, depois do Desfazer; a trilha guarda o resumo para o leitor de tela, o dia e a noite, o botão da mão automática e as fases. O menu de exibição abre por um botão com olho e seta (`seats.menu` guarda o aberto, que sobrevive aos redesenhos; Esc e clique fora fecham). Com um oponente só, fica o botão de tela cheia. O bracket abre no balão da vida pelo mesmo aberto-fechado dos marcadores, menos quando o retrato é um alvo possível. A pilha recolhida no duelo foi para baixo da barra do topo, que ficou mais larga.

## 97. Modernizar a animação de combate ✅

O combate já tem animação própria (faixa de ataque, atacantes recuando e avançando, bloqueador deslizando até o atacante, golpe de ida e volta no dano, item 15), mas ainda parece um conjunto de efeitos soltos: cada parte acontece no seu canto, com o mesmo peso, e não conta a história do combate de uma vez. No Arena, o combate é um momento da partida: dá para ver quem ataca quem, quem bloqueia quem e o que vai acontecer antes do dano, e o dano vem com impacto.

- [x] Declarar atacantes: as criaturas avançam de verdade para a frente do campo, inclinadas na direção de quem atacam (jogador ou planeswalker), e ficam nessa posição até o fim do combate, em vez de recuar e voltar ao lugar. (Item 8, "Ataque".)
- [x] Setas de ataque claras e persistentes do atacante até o alvo, com cor por defensor na mesa de 3–4 jogadores.
- [x] Bloqueio: o bloqueador vai para a frente do atacante e fica ali, com a ligação entre os dois visível até o dano; vários bloqueadores em leque diante do mesmo atacante. (Item 8, "Bloqueio".)
- [x] Dano: golpe com antecipação (o atacante recua um instante), impacto com tremor curto proporcional ao dano e o revide do bloqueador saindo junto, não depois.
- [x] Fim do combate: as criaturas voltam juntas aos seus lugares, as mortas seguem para o cemitério com o efeito de destruída.
- [x] Combates grandes (muitos atacantes): agrupar os golpes para o combate não ficar longo; no modo acelerado, encurtar tudo.
- [ ] Manter o ritmo: nada segura a vez do jogador; respeitar "reduzir movimento" e conferir o desempenho no celular.
- [x] Item no CHANGELOG e print na página Novidades em imagens.

Feito na 0.131.0 (05/11/2026): a pose fica em variáveis de CSS nos slots (`combatPose.ts`: `--atk-tilt` até 7°, `--blk-x`/`--blk-y` até 48 px ou 30% do caminho), aplicada antes das setas a cada desenho; a ida usa uma transição com mola e a volta, a transição de sempre da carta. Os golpes da mesma etapa de dano saem da fila juntos (`takeWhile` por `combat` e `step`), e quem revida o próprio atacante se choca no meio (`clash`, o mesmo alcance da luta). Tremor no alvo de 1,5 a 6 px pelo dano. Setas de ataque com a cor do jogador atacado (pela ordem da mesa) com 3 ou 4 jogadores. Ficou em aberto: conferir o desempenho no celular com muitos atacantes.

## 101. Botões de ação: "Principal 2" antes do combate e "Fim de turno" como destaque ✅

Em algumas situações os botões de ação mostram "Principal 2" (por exemplo "Para a principal 2") mesmo quando a partida ainda está antes do combate. E o botão principal, o de destaque que fica embaixo, às vezes é o "Fim de turno": apertar o botão de sempre por hábito pula o resto do turno.

- [x] Descobrir em que situações o rótulo fala da principal 2 antes do combate (fase principal 1 sem atacantes possíveis, combate pulado, combate extra, passar automaticamente ligado...) e corrigir para dizer o próximo passo de verdade.
- [x] O botão de destaque de baixo nunca pode ser "Fim de turno": ele fica sempre como botão secundário, e o destaque é o próximo passo (ir para o combate, para a principal 2, passar).
- [x] Item no CHANGELOG e print na página Novidades em imagens. Sem cenário no Laboratório: é só o texto e o destaque dos botões.

Feito na 0.132.2 (05/11/2026): o rótulo tratava o combate inteiro como um grupo e dizia "Para a principal 2" já no início do combate (a mesa para ali com gatilhos de início do combate e paradas marcadas). Agora cada etapa diz o passo seguinte: início → "Para o ataque" (ou principal 2 sem criatura desvirada e sem enjoo), atacantes → "Para os bloqueios", bloqueadores → "Para o dano"; combate extra e etapas extras só contam do dano em diante. O `passIsPrimary` saiu: o passar é sempre o destaque. Ficou para ver: na principal 2 os dois botões dizem "Fim de turno" e "Para o fim do turno", parecidos demais.

## 29. Cartas exiladas sob uma criatura aparecem abaixo dela ✅

Cartas que uma permanente exila "sob si" ou "com ela" (Banisher Priest, Hostage Taker, cartas com imprint como Isochron Scepter etc.) hoje só aparecem no exílio comum, sem ligação visível com quem as exilou. A ideia é mostrá-las presas à permanente, saindo por baixo dela, como os anexos.

- [x] Descobrir como o Forge liga a carta exilada à fonte (`ExiledWith`, `Imprinted`, `encoded`) e mandar essa ligação pela ponte.
- [x] Desenhar as cartas exiladas atrás da permanente, aparecendo pela borda de baixo (como o leque de auras e equipamentos, mas para baixo e com aparência de exílio).
- [x] Contador e janela para ver todas quando forem várias, e a mesma lista no inspetor da permanente.
- [x] Quando a permanente sai do campo, as cartas voltam a aparecer só no exílio.

Feito na 0.133.0 (05/11/2026): o servidor manda `exiling` na permanente, com as cartas de `getExiledCards()` e `getImprintedCards()` que continuam no exílio como o mesmo objeto (fora as do Delve e as exiladas pela própria mágica). A mesa desenha até 3 atrás da permanente, descendo, com o nome numa etiqueta (a borda de cima, com o nome impresso, fica escondida), o número abre a lista, e o inspetor diz "Exilando: …" e "Exilada por …" (`exiledUnder.ts`).

## 102. Quantidade de cartas na mão no ícone da mão automática ✅

Hoje a quantidade de cartas na sua mão aparece num selo junto do seu retrato (a costa da carta e o número), e o ícone de mão ao lado do relógio do turno só liga e desliga a mão automática. A ideia é juntar os dois: o número vai para o ícone da mão, e o selo do retrato sai.

- [x] O ícone da mão (ao lado do relógio do turno) mostra quantas cartas você tem na mão, e continua ligando e desligando a mão automática ao tocar, aceso quando ligada.
- [x] O selo de cartas na mão junto do seu retrato deixa de aparecer, no duelo e no Commander, no computador e no celular.
- [x] O balão e o leitor de tela do ícone dizem as duas coisas: quantas cartas há na mão e se a mão automática está ligada.
- [x] Conferir se o brilho de carta nova da mão oculta (0.125.0) continua fazendo sentido com o número no ícone.
- [x] Item no CHANGELOG e print na página Novidades em imagens.

Feito na 0.136.0 (decidido em 05/11/2026): no celular, onde não há mão automática, o ícone aparece só como contador; com a mão oculta, a seta perdeu o número e quem brilha com carta nova é o ícone.

## 103. Mão automática desligada por padrão ✅

Hoje, sem nada guardado, a mão começa no automático no computador com tela baixa (recolhida por cima do campo, subindo ao passar o mouse) e fixa no toque e nas telas altas (`savedHandMode`). Quem joga pela primeira vez no notebook vê só o topo das cartas e não entende que a mão sobe com o mouse.

- [x] Sem nada guardado, a mão começa **fixa** (Auto desligado) em todo aparelho; o automático passa a ser só escolha do jogador, pelo ícone de mão ao lado do relógio do turno.
- [x] Quem já escolheu um modo (guardado no aparelho ou na conta) continua com o dele.
- [x] Conferir que a mão fixa não aperta demais o campo nas telas baixas (notebook de 768 px de altura); se apertar, decidir antes de entregar.
- [x] Item no CHANGELOG e print na página Novidades em imagens.

Feito na 0.141.0: sem nada guardado a mão começa fixa em todo aparelho. Conferido em 1366 × 768, no 1×1 e no Commander com quatro jogadores: a faixa da mão não aperta o campo.

## 105. Precon dentro de Outros, com o nome Commander Precon ✅

Na tela inicial, a escolha do formato tem três botões: **Commander**, **Precon** e **Outros** (que abre Standard, Pauper, Sacola 50, Oathbreaker e Livre). O Precon é uma variação do Commander, só com os decks pré-construídos oficiais, e não precisa de um botão próprio na primeira linha.

- [x] Tirar o botão **Precon** da primeira linha, que fica com **Commander** e **Outros**.
- [x] Pôr o Precon dentro de **Outros**, com o nome **Commander Precon**, e decidir a posição dele na lista (perto do Oathbreaker, que também é de zona de comando, ou no começo).
- [x] Quem tinha o Precon escolhido continua com ele: ao abrir a tela, **Outros** já vem aberto e com o Commander Precon marcado.
- [x] O nome do formato muda também onde mais aparece para o jogador (resumo da partida, selo da sala, Minhas partidas, editor de decks, avisos de deck incompatível), conferindo se fica "Commander Precon" em todos ou se algum lugar pede o nome curto.
- [x] Conferir que "Commander Precon" cabe no botão sem quebrar nem cortar o texto: no computador (1366 × 768 e janelas estreitas), no celular deitado e com a lista de **Outros** aberta. Se não couber, decidir antes de entregar (fonte menor, botão em duas linhas ou a lista em mais de uma fileira).
- [x] Item no CHANGELOG e print na página Novidades em imagens.

Feito na 0.141.0 (decidido em 06/11/2026): o Commander Precon fica em Outros, logo depois do Oathbreaker; o nome completo vale em todos os lugares do formato, e o selo "Precon" no bloco de um deck pronto continua curto, porque diz o tipo do deck. Cabe no botão em 1366, 800 e 740 de largura.

## 111. Sideboard: mostrar se o oponente já terminou, voltar atrás e conceder sem sair ✅

No painel **Prepare o próximo jogo** de uma melhor de três, o jogador só sabia do oponente depois de confirmar ("Aguardando o oponente…"), e, depois de confirmar, não dava mais para mexer no deck. O servidor já mandava quem estava pronto em cada assento (`match.ready`); voltar atrás é que ainda não existia.

- [x] Mostrar o estado do oponente desde que o painel abre: "O oponente ainda está trocando cartas" ou "O oponente já está pronto", mudando na hora em que ele confirma.
- [x] Depois de confirmar, um botão para cancelar e voltar a editar as trocas, enquanto o próximo jogo não começou (o servidor precisa aceitar desfazer o pronto do assento).
- [x] Decidir o nome do botão ("Voltar a editar", "Cancelar") e se o oponente vê que o jogador desfez o pronto.
- [x] Conceder a melhor de três ali mesmo, sem sair da sala: hoje o painel só tem **Sair da partida**. Quem concede perde a série, o oponente vê o resultado, e os dois continuam na sala (para uma revanche ou trocar de deck). Pedir confirmação antes.
- [x] Conferir com mais de dois jogadores (cada oponente com o seu estado) e com o computador, que fica pronto na hora.
- [x] Página de teste: `fixture.gameEnd('sideboard')` em `tests/fixtures/duel-table.html`, com o oponente pronto e não pronto.

Feito na 0.146.0 (decidido em 07/11/2026): uma linha acima dos botões, com o nome do oponente, diz "ainda está trocando cartas" ou "já confirmou o deck" (texto sem gênero); contra o computador, ele aparece sempre pronto. A melhor de três é sempre entre dois jogadores, então não há caso com mais oponentes. O botão **Voltar a editar** manda `sideboard-cancel` (com o id da troca, como o `sideboard`), que desfaz o pronto e o deck aprovado do assento, e as trocas feitas continuam no rascunho; o oponente vê a linha voltar para "trocando cartas". **Desistir da série** pede confirmação e manda `concede` sem sair; o servidor passou a mandar `match.concededBy` (quem encerrou a série, saindo ou desistindo entre os jogos), e a tela de resultado mostra Derrota para quem desistiu e Vitória para o outro, com o placar e Pedir revanche. A mesma tela vale quando o oponente sai da sala antes do fim (em partida de um jogo, sem "da série"). Pedido junto na entrega: o painel perdeu o **Sair da partida** (sair fica só com o jogo em andamento), e o menu da partida trocou o "Desistir e voltar ao início" por **Conceder**, que abre uma confirmação com **Conceder e sair**, **Conceder e continuar na mesa** e **Voltar ao jogo** (em foco); continuando, o jogador vai para o sideboard do próximo jogo, para o resultado ou, no Commander com vários jogadores, assiste. Fora do jogo em andamento (eliminado no Commander ou no resultado), o menu mostra **Sair da partida**; entre os jogos, nada. O servidor tira a marca de desistente dos assentos quando o próximo jogo da série começa. Página de teste: `fixture.gameEnd('sideboard', { ready, opponentReady })` e `fixture.gameEnd('result', { concededBy })`; o `test-protocol.mjs` cobre o voltar a editar, o id antigo e o `concededBy`.

## 109. Medir quantos visitantes começam a jogar ✅

A página de apresentação (/sobre) e o Search Console mostram quem chega, mas não quantos clicam em Jogar, escolhem um deck e começam uma partida. Sugestão da revisão de SEO de 06/11/2026. Feito na 0.148.0.

- [x] Decidido: contar no nosso servidor, só números agregados por semana, sem terceiros e sem cookies.
- [x] Eventos (`src/funnel.ts`, POST `/api/funil` com `{evento}`): `jogar` (botões de jogar e o Jogar do rodapé da /sobre, `src/sobre.ts`), `deck` (deck escolhido na tela inicial ou na sala), `partida-ia` e `partida-sala` (a mesa abriu a partida; assistir e o Laboratório não contam). Cada evento conta uma vez por aba (sessionStorage, `KEYS.funil`).
- [x] Sem nada que identifique o jogador: o servidor (`Funnel.java`) só soma no `funil.json` (semana → evento → quantos); o IP serve só, como resumo em memória, para limitar 30 eventos por 10 min (o nginx limita de novo). Política de privacidade atualizada.
- [x] Painel na área de admin: bloco Começar a jogar na aba Partidas (GET `/api/admin/funil`), com as semanas e a parte dos decks escolhidos que viraram partida.

## 110. Contradição Arcana com o custo reduzido pelo Baral ✅ (conferido, sem erro)

Conferir se a mesa deixa responder com uma mágica que só fica pagável graças a um redutor de custo. Arcane Denial (Contradição Arcana) custa {1}{U}; com Baral, Chief of Compliance no campo, as mágicas instantâneas custam {1} a menos, e uma Island basta.

- [x] Montado no servidor (`CostReductionResponseTest`): Arcane Denial na mão, uma Island e o Baral no campo do jogador, e a Divination do oponente na pilha, com a prioridade no jogador.
- [x] O jogador recebe a prioridade: a conta da passagem automática sem ações (`AvailableActions.compute`, a que o Forge usa com "passar quando não há ações") encontra a resposta. Sem o Baral, a mesma mesa com uma Island passa direto (controle).
- [x] A Contradição Arcana aparece como jogável (`collectActionable`, o destaque da mão), o custo ajustado pelo Forge cai para {U} e uma Island paga (`ComputerUtilMana.canPayManaCost`).
- [x] Nada a corrigir; sem cenário pronto no Laboratório (só correções ganham um). O teste fica para não regredir.

## 112. Decidir no d6 quem começa a partida ✅

No começo da partida, cada jogador rola um d6 na mesa, e quem tirar o maior número escolhe quem joga o primeiro turno. Feito na 0.148.0.

- [x] Servidor (`StartingRoll.java`): no lugar da moeda de quem começa do Forge, um d6 por jogador; empate no maior número, só os empatados rolam de novo, até sobrar um. O Forge já sorteou quem escolhe (cada um com a mesma chance) quando a moeda sai; os dados são rolados condicionados a esse vencedor (a disputa se repete até dar ele), o que dá exatamente a distribuição de uma rolagem de verdade (`StartingRollTest` confere).
- [x] Evento público `starting-roll` (`actor` = quem escolhe, `rolls` = as rodadas), que vai para todos, inclusive quem assiste.
- [x] Mesa (`src/ui/startingRoll.ts`): os dados no centro, um por jogador com o nome, rolando juntos; no empate os outros apagam e os empatados rolam de novo; o vencedor fica em destaque e só então aparece "Quem começa?" (com "Você tirou o maior número no dado") ou "Ana está escolhendo quem começa".
- [x] Decidido: todos rolam sozinhos ao mesmo tempo, e o vencedor escolhe quem começa, como na regra.
- [x] Melhor de três: do segundo jogo em diante o Forge não tira a moeda, e quem perdeu escolhe, sem dado.
- [x] Commander com 3 ou 4 jogadores e contra o computador: o computador também rola.
- [x] Rolagens no Registro, em Início da partida ("Dados para ver quem começa: Ana 3, Bruno 6, Você 6, Diego 2; desempate: Bruno 2, Você 5. Você escolhe quem começa.").
- [x] Item no CHANGELOG e prints nas Novidades em imagens (página de teste: `fixture.startingRoll()` na mesa de Commander).

## 115. Efeitos de ninjutsu e sneak ✅

Pedido em 08/11/2026. Ninjutsu (45 cartas no Forge) e sneak (27, das Tartarugas Ninja) trocam um atacante não bloqueado por uma criatura da mão, que entra virada e atacando. Hoje a mesa mostra isso como dois movimentos soltos: o atacante volta para a mão como qualquer devolução e o ninja aparece no campo com o som de "entrar de fininho" (o mesmo do Sneak Attack). Não fica claro que um tomou o lugar do outro, nem contra quem o ninja está atacando. Na mão, o ninjutsu já aparece como opção ("Troque por um atacante não bloqueado seu."); o sneak, que é uma forma de conjurar, ainda não tem um texto próprio.

**Usar.**

- [x] Depois dos bloqueios, as cartas com ninjutsu ou sneak na mão ganham um brilho discreto quando dá para usar (há um atacante não bloqueado e mana para pagar).
- [x] Ao escolher a troca, só os atacantes não bloqueados ficam escolhíveis, com o defensor de cada um à vista.
- [x] Sneak com nome e explicação próprios no menu de como conjurar, como o ninjutsu.

**Ver a troca.**

- [x] Uma fumaça curta no lugar do atacante, que volta para a mão de quem o controla; o ninja surge da mesma fumaça, no mesmo lugar da fila de ataque, já virado e com a seta para o mesmo defensor.
- [x] Ninjutsu: a carta vem da mão sem passar pela pilha (é uma habilidade). Sneak: passa pela pilha como mágica e, ao resolver, entra direto na fumaça.
- [x] Ninjutsu do comandante: o ninja sai da zona de comando, com o mesmo efeito.
- [x] Registro numa linha só ("Ninjutsu: Ninja of the Deep Hours entra atacando no lugar de Slither Blade"), e o mesmo para o sneak.
- [x] Quem assiste e o oponente veem o mesmo efeito; respeitar "reduzir movimento" (só uma troca rápida, sem fumaça).

**Conferir.**

- [x] Cenário no Laboratório com um ninjutsu, um sneak e o Splinter, Radical Rat (gatilho dobrado do ninja).
- [x] Item no CHANGELOG e prints em Novidades em imagens.

- [x] Decidir antes de fazer: o desenho da troca (fumaça, rastro de sombra ou só um deslize entre a mão e o campo); se o brilho na mão aparece sempre ou só quando você para na etapa de bloqueios (hoje a mesa pode passar direto por ela); se o computador também ganha o efeito completo (recomendado, para o jogador entender o que aconteceu).

Feito em 08/11/2026 (versão 0.152.0): fumaça com shuriken, igual para todos; a mão já destacava o ninjutsu quando o motor o oferece. O ninjutsu passa pela pilha (é uma habilidade), então a fumaça espera no lugar do atacante até ele resolver. O Registro ficou com duas linhas, a saída do atacante e a entrada do ninja. Página de teste: botões Ninjutsu e Sneak em `tests/fixtures/effects-lab.html`.
