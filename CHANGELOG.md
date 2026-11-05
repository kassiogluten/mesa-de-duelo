# Novidades

Todas as mudanças que você sente na mesa. As versões seguem o formato **X.Y.Z**:

- **X** muda quando algo grande deixa de funcionar como antes (decks, partidas salvas, jeito de jogar).
- **Y** muda quando chegam coisas novas: decks, telas, regras, recursos.
- **Z** muda só com correções.

As versões anteriores à 0.100.0 estão em [docs/changelog-antigo.md](docs/changelog-antigo.md).

## [0.132.2] - 2026-11-05

### Corrigido

- **O botão de passar diz o próximo passo de verdade no combate.** No início do combate, antes de declarar atacantes, ele dizia "Para a principal 2", como se o ataque fosse ser pulado. Agora diz "Para o ataque" (ou "Para a principal 2" quando nenhuma criatura sua pode atacar), "Para os bloqueios" depois de declarar os atacantes, "Para o dano" depois dos bloqueios e "Para a principal 2" só quando o combate acaba.
- **"Fim de turno" nunca é o botão de destaque.** Do combate em diante, o "Fim de turno" ocupava o botão principal, embaixo, e apertá-lo por hábito pulava o resto do turno. Agora o destaque é sempre o próximo passo, e o "Fim de turno" fica acima dele, como botão secundário.

## [0.132.1] - 2026-11-05

### Corrigido

- **Esperando o oponente decidir a mão, a mesa diz que o mulligan ainda vem.** As mãos iniciais são decididas uma de cada vez, começando por quem joga primeiro. Enquanto o oponente escolhe quem começa ou se mantém a mão, o centro da mesa agora mostra a sua mão com "Fulano está escolhendo quem começa" ou "Fulano está decidindo a mão", e embaixo que em seguida é a sua vez de manter ou fazer mulligan (ou que você já manteve a sua). A mensagem antiga da moeda também não fica mais na caixa de ação.

## [0.132.0] - 2026-11-05

### Mudou

- **Sideboard entre os jogos com as cartas à vista.** Em "Prepare o próximo jogo", o deck principal e o sideboard aparecem lado a lado em miniaturas das cartas, separadas por tipo e em ordem de custo, com a quantidade de cada uma. Toque numa carta para passar uma cópia para o outro lado, ou arraste; soltando sobre uma carta do outro lado, as duas trocam de lugar de uma vez. A lupa da miniatura, o clique direito ou segurar o dedo na carta mostram ela grande. Em cima, uma busca pelo nome (em português ou inglês) e botões para ver só criaturas, outras mágicas ou terrenos. O deck principal mostra quantos terrenos, criaturas e outras mágicas tem e a curva de mana, e avisa quando fica abaixo das 60 cartas. Embaixo, o que sai e o que entra em relação ao jogo anterior, com "Desfazer tudo"; sem trocas, o botão vira "Continuar sem trocas".

### Corrigido

- **A lista do sideboard não volta mais para o topo.** Passar uma carta de um lado para o outro mantém as duas colunas onde estavam, sem precisar rolar de novo até a carta seguinte.

## [0.131.0] - 2026-11-05

### Mudou

- **Combate com cara de combate.** Os atacantes, já à frente do campo, ficam inclinados na direção de quem atacam, e cada bloqueador anda até a frente do atacante que bloqueia e fica lá até o dano. No fim do combate, todos voltam juntos ao lugar. No dano, os golpes da mesma etapa saem juntos, mesmo num combate grande, e o atacante e o bloqueador que se atingem se chocam no meio. A carta ou o retrato atingido treme, mais forte quanto maior o dano. Na mesa de 3–4 jogadores, a seta de ataque tem uma cor para cada jogador atacado. Com "reduzir movimento" ligado no sistema, as cartas vão direto para o lugar, sem o movimento.

## [0.130.0] - 2026-11-05

### Novo

- **Quantas cartas há na sua mão.** Junto do seu retrato aparece a contagem das cartas da sua mão, como a dos oponentes. Ela fica à vista mesmo com a mão recolhida ou oculta.

### Mudou

- **Relógios e turno no topo da mesa.** A duração da partida, o número do turno e o tempo do turno saíram da trilha de fases e foram para o topo, ao lado do Menu e do Desfazer. Na mesa de 3–4 jogadores, o retrato de quem joga o turno vai junto. Embaixo à direita fica só a trilha com as fases. Quando a pilha é recolhida no duelo, ela aparece logo abaixo do topo.
- **Cabeçalho dos oponentes mais enxuto.** Na mesa de 3–4 jogadores, a zona de comando de cada oponente passou para o cabeçalho dele, e o campo ganha a largura toda. Os três botões de exibição do campo (tela cheia, ver só este, ocultar) viraram um botão só, com um olho e uma seta, que abre um menu com as três opções. O dano de comandante só aparece depois do primeiro dano, nas duas mesas.
- **Bracket no balão da vida.** O selo do bracket ao lado do nome de cada jogador saiu. Para ver o bracket, passe o mouse sobre a vida do jogador ou toque nela.

## [0.129.1] - 2026-11-05

### Corrigido

- **Cartas da mão inicial voando para o lugar certo.** Ao receber a mão inicial, as cartas às vezes saíam do grimório rumo a pontos sem sentido, à direita da mesa ou abaixo da borda da tela (com a mão oculta), e só depois apareciam no centro. Agora elas voam direto para o lugar em que ficam, no duelo e na mesa de 3–4 jogadores, com a mão fixa, oculta ou automática. No mulligan, a mão anterior continua voltando ao grimório antes de a nova sair.

## [0.129.0] - 2026-11-05

### Mudou

- **Passar automaticamente num botão pequeno ao lado do principal.** O nível de passar automaticamente deixou de ser uma linha embaixo dos botões de ação: virou um botão pequeno, só com o ícone do nível, na mesma linha do botão principal (o dourado, como Passar ou Para o combate), e a caixa de ação fica mais baixa. As cores continuam dizendo o nível (dourado em Respostas e Só quando me afeta, borda dourada em Parar sempre, pulsando com Até o fim do turno ligado), e o nome aparece ao passar o mouse. Tocar nele abre a mesma troca rápida, do mesmo tamanho de antes.

## [0.128.0] - 2026-11-05

### Mudou

- **Computadores sem comandante repetido.** Os decks sorteados para os computadores não repetem mais o comandante de ninguém da mesa: nem o seu, nem o de outro jogador, nem o de outro computador. Vale contra o computador e ao completar uma sala com computadores, com ou sem bracket máximo e série. Se o bracket ou a série escolhidos não tiverem decks diferentes que bastem, a mesa repete só o necessário. O deck que você escolhe à mão para um computador continua valendo, mesmo que repita.

## [0.127.0] - 2026-11-05

### Mudou

- **Mão fixa com faixa própria, e cartas na medida em telas grandes.** Com a mão fixa (a seta para cima, com a mão automática desligada), a mão volta a ter uma faixa só dela na borda de baixo da mesa e não cobre mais os seus terrenos: os campos dividem o resto da altura. Em telas altas, como um monitor Full HD, a mesa começa com a mão fixa; num notebook, continua começando na automática. Se você já escolheu um modo, a escolha continua valendo. As cartas do campo também param de crescer num tamanho que cabe bem num monitor grande, em vez de ocupar a tela toda.

## [0.126.1] - 2026-11-04

### Corrigido

- **Laboratório: mão e grimório vazios ficam vazios.** Um cenário que deixa vazia a mão ou o grimório de um jogador agora começa assim de verdade; antes, essa zona ficava com as cartas da mão inicial e do grimório de uma partida comum, que o cenário não pedia.

## [0.126.0] - 2026-11-04

### Novo

- **Formato Precon.** Ao lado do Commander, um formato em que cada jogador usa um deck pré-construído oficial de Commander, do jeito que saiu da caixa, com as regras do Commander. São 43 precons de 10 séries (Warhammer 40.000, Fallout, O Senhor dos Anéis, Final Fantasy, Doctor Who, Commander 2013, 2016, 2017, 2020 e Bloomburrow), agrupados por série com o ano, e cada um com o bracket e o preço no card. No Precon os seus decks não aparecem e não dá para fazer a sua versão: só os precons da mesa valem, também nas salas. Contra o computador, os bots jogam com precons, e **Bots só da série do seu deck** sorteia só entre os da mesma série.
- **Bracket máximo dos bots.** Contra o computador no Commander e no Precon, **Bracket máximo dos bots** escolhe até que bracket vão os decks dos computadores: **Qualquer**, 2, 3 ou 4. Começa no bracket do seu deck, o **Deck aleatório** só sorteia entre os que cabem, a lista de cada computador mostra só esses, e um deck já escolhido acima do máximo volta para **Deck aleatório**, com um aviso. A escolha fica guardada, e o resumo da partida diz o máximo ("até Bracket 3").

### Mudou

- **Precons originais no lugar dos adaptados.** Os dez decks prontos de Commander que eram versões adaptadas de um precon agora são o precon original, com as mesmas cartas da caixa, e ganharam o nome dele: Exército Animado (Bello), Salve, César, Guardado para o Inverno (Hazel, no lugar do Chatterfang), Quebra de Limite (Cloud), Comida e Companhia (Frodo e Sam), Ameaça Mutante (Homem-Mariposa), A Hoste de Mordor (Sauron), Transe do Renascimento (Terra), Oferta de Paz (Bumbleflower) e Herdeiros e Feitiçaria (Y'shtola). Quem tinha um deles escolhido continua com ele. Os precons também aparecem entre os decks prontos do Commander, com o selo **Precon**.

## [0.125.0] - 2026-11-04

### Novo

- **Aviso quando uma jogada é recusada.** Quando você tenta conjurar uma mágica, ativar uma habilidade ou jogar um terreno e as regras não deixam, a mesa agora explica o motivo, em vez de o clique não fazer nada. Se uma carta em jogo proíbe a jogada (por exemplo, Myrel, Escudo de Argivo, no turno do dono dela), o aviso diz o nome da carta e mostra a miniatura dela, que você toca para ver a carta inteira. Também avisa quando você já jogou o terreno do turno e quando tenta conjurar um feitiço ou uma criatura fora da sua fase principal ou com a pilha cheia.
- **Mão fixa, oculta ou automática.** No computador, um ícone de mão ao lado do relógio do turno liga e desliga a mão automática: ligada (ícone aceso), a mão fica recolhida, mostrando só o topo das cartas, e sobe quando você passa o mouse. Com ela desligada, aparece uma seta discreta, centralizada logo acima da mão: para baixo, esconde a mão por inteiro, deixando o campo todo à vista; para cima, mostra a mão de novo, aberta o tempo todo. Com a mão escondida, a seta mostra quantas cartas você tem e brilha quando chega uma carta nova. A mesa lembra a sua escolha.
- **Mão cheia agrupa as cartas iguais.** Com 11 cartas ou mais na mão, as cópias da mesma carta viram uma pilha só, com a contagem (×3, ×4) na borda, no lugar da primeira cópia. Jogar a pilha joga uma das cópias, e arrastar a pilha leva todas juntas. A ordem que você arrumou continua valendo; com 10 cartas ou menos, as pilhas se desfazem. Quando um efeito pede para escolher cartas da mão, elas aparecem separadas.
- **Cemitério abre sozinho na hora de escolher o alvo.** Quando uma mágica ou habilidade pede um alvo que só pode estar num cemitério (como Reanimar), o cemitério abre sozinho, no seu se ele tiver alvo, senão no do oponente que tiver. No alto aparecem abas com o cemitério de cada jogador, com quantas cartas tem e quantos alvos há em cada um, para passar ao de um oponente sem fechar a janela. O pedido, o Cancelar e o Ver a mesa ficam ali mesmo; escolhido o alvo, a janela fecha. Se você fechar para olhar a mesa, ela não volta a abrir sozinha naquela escolha: toque no cemitério para abrir de novo. As abas também aparecem quando você abre um cemitério a qualquer hora.
- **Painel "Atacar quem?" pode ser arrastado.** Ao escolher os atacantes, arraste o painel pelo título para qualquer lugar da mesa, quando ele estiver em cima das suas criaturas. A mesa lembra o lugar nos próximos combates, o painel nunca sai da tela, e dois cliques no título o devolvem ao canto de sempre.

### Mudou

- **Planeswalkers e batalhas no fim da fileira.** Na fileira das criaturas, os planeswalkers e as batalhas ficam juntos no fim, separados das criaturas por um traço, em vez de misturados com elas na ordem em que entraram. Vale para o seu campo e para o de cada oponente. Um planeswalker que vira criatura passa para junto das criaturas.

- **Cartas encolhem quando o campo enche.** Quando uma fileira do campo (criaturas ou terrenos, sua ou de um oponente) não cabe na largura, as cartas dela diminuem só o necessário para caberem todas à vista, sem rolar. Elas encolhem até 60% do tamanho cheio; com ainda mais cartas, a fileira volta a rolar para o lado. Quando as cartas saem do campo, as que ficam voltam a crescer.

## [0.124.0] - 2026-11-04

### Novo

- **Mão recolhida por cima do campo.** No computador, em qualquer tamanho de tela, a mão deixa de ocupar uma faixa só dela: fica recolhida na borda de baixo da mesa, mostrando só o topo das cartas, e sobe inteira quando você passa o mouse por cima. O botão de seta ao lado da mão deixa a mão sempre aberta, ou recolhe de novo, e a mesa lembra a sua escolha. Na hora da mão inicial ou quando um efeito pede cartas da sua mão, ela abre sozinha. Na tela de toque, a mão começa aberta; assistindo a uma partida, começa recolhida.

### Mudou

- **Cartas maiores na mesa.** A altura que a mão ocupava vai para os campos, e as cartas crescem junto. Numa tela de notebook (1366×768), ficam cerca de um terço maiores no duelo; com 3 ou 4 jogadores, as suas crescem uns 40% e as dos oponentes, uns 50%. Em monitores maiores, crescem ainda mais. O cabeçalho de cada oponente (vida, nome, mana, dano, botões e montes) cabe numa linha só, e o comandante dele fica ao lado do campo.

## [0.123.0] - 2026-11-03

### Mudou

- **Roda do mouse rola as fileiras para o lado.** Na partida, girar a roda sobre a mão, uma fileira do campo, o exílio ou uma escolha de cartas rola as cartas para o lado, sem precisar segurar Shift. Quando a fileira chega ao fim, a roda volta a rolar a mesa normalmente; no touchpad, nada muda.
- **Mira ao escolher alvos.** Enquanto você escolhe o alvo de uma mágica ou habilidade, o cursor vira uma mira ao passar sobre as cartas e os jogadores que podem ser alvo; no resto da mesa e nos botões, ele continua o de sempre.

## [0.122.0] - 2026-11-03

### Mudou

- **Formatos do deck explicados.** Ao tocar num deck que não serve para o formato escolhido, a janela agora diz o que fazer: **Para usar esse deck, clique abaixo no formato desejado.**, com os formatos em que ele serve logo abaixo.
- **Outros formatos à sua escolha.** Tocar em **Outros** abre os botões de Standard, Pauper, Sacola 50, Oathbreaker e Livre sem escolher nenhum deles por você; a partida só fica pronta depois que você toca no formato que quer.
- **Formato sem o deck que não serve.** Com um deck escolhido, tocar num formato em que ele não serve troca o formato direto, sem abrir janela: o deck deixa de estar selecionado e um aviso no alto da tela diz que ele não serve para aquele formato. Basta escolher outro deck da lista.

## [0.121.0] - 2026-11-03

### Novo

- **Entrar na sala sem deck e escolher lá dentro.** Contra outra pessoa, o deck deixou de ser obrigatório para criar ou entrar numa sala: sem um deck que sirva para o formato da sala, você entra mesmo assim, pelo código, pelo link ou pela lista de salas. Na sala de espera, a seção **Seu deck** mostra só os decks que servem para o formato da sala (os seus e os prontos), com busca, e basta tocar num para sentar com ele. Até a partida começar, dá para tocar em outro e trocar. Os lugares de quem ainda escolhe aparecem como **Escolhendo o deck…**, e a partida começa sozinha quando a mesa enche e todos têm deck. **Completar com computadores** espera todos escolherem.

### Mudou

- **Botões do campo dos oponentes só com o ícone.** Na faixa de cada oponente, os botões de ver só aquele campo e de ocultá-lo ficaram só com o ícone, como o de tela cheia, e a faixa respira melhor com três ou quatro jogadores. Passando o mouse, o balão diz o que cada um faz; com **Só este** ligado, o botão fica com o fundo dourado. No celular, a área de toque continua confortável.
- **Nova imagem na prévia do link.** Ao mandar o endereço da Mesa de Duelo no WhatsApp, no Discord ou numa rede social, o cartão da mensagem mostra a nova arte: o nome do site com a frase **Sua mesa de Magic, onde você estiver.**, ao lado de uma mesa com terrenos das cinco cores.

## [0.120.0] - 2026-11-02

### Novo

- **Pedido de desfazer no centro da tela.** Quando outro jogador pede para desfazer, o pedido abre no centro da mesa, com quem pediu, o que volta e os botões **Recusar** e **Aceitar**, tocando o aviso e vibrando no celular; a mesa espera o seu voto. A votação para pular o turno de quem caiu abre do mesmo jeito. Depois de votar, a faixa do alto mostra quem ainda falta.
- **Ícones no cemitério e no exílio.** Cada monte ganhou um ícone pequeno no canto, uma lápide no cemitério e um portal no exílio, para não confundir os dois de relance.
- **Sleeve na cor de cada jogador.** O verso das cartas de cada jogador tem uma cor própria, sorteada no começo da partida e diferente da dos outros: a mão do oponente, os grimórios, as viradas para baixo e as cartas que voam. A cor continua a mesma na revanche e entre os jogos da melhor de três.
- **Dobra com efeito e som.** A mágica conjurada por dobra chega à pilha rasgando o espaço, num anel violeta e ciano, com o som de conjurar mais grave e com eco. No fim do turno, quando a permanente volta para o exílio, um rasgo menor aparece no lugar dela.
- **Página de Salas.** As salas públicas esperando jogadores e as partidas em andamento para assistir ficam numa página só, com filtros por formato e por situação, e se atualizam sozinhas. O link **Salas** fica no cabeçalho, com a contagem do que está aberto, e no menu **⋯**; sem nada aberto, a página leva a criar uma sala pública.

### Corrigido

- **Nomes de quem assiste cabem nos botões.** Assistindo a uma mesa de Commander, os botões de **Ver a mesa de** ficam dois por linha, com o nome numa linha só; o nome longo termina em reticências, e o completo aparece no balão.

## [0.119.0] - 2026-11-02

### Novo

- **Assistir a partidas contra o computador.** As partidas contra o computador agora aparecem em **Salas públicas**, como "Ana contra o computador", com o botão **Assistir**: quem assiste vê a mesa sem a mão de ninguém. Quem joga é avisado quando alguém começa a assistir, vê quem está assistindo no **Menu** e pode usar **Tirar da lista de salas**: a partida some da lista e quem assistia volta ao início. Pelo mesmo Menu, ela volta para a lista quando quiser.
- **Completar a sala com computadores.** Na sala de espera, quem criou a sala (pública ou privada) pode tocar em **Completar com computadores e começar**: os lugares vazios viram computadores, cada um com um deck pronto sorteado do formato (no Commander, de bracket perto do da mesa), e a partida começa na hora.
- **Modo escolhido na pilha.** Numa mágica de escolha, como o Prismari Charm, uma faixa no pé da carta na pilha mostra o modo escolhido, com o número dele na carta (o 1º, o 2º...) e o texto, para todos na mesa saberem qual foi. Com mais de um modo, aparece um por linha.

## [0.118.0] - 2026-11-02

### Novo

- **Relatar direto do fim do jogo.** A tela de vitória ou derrota ganhou, abaixo dos botões, **Relatar um problema**: ele abre o relato já em **Algo deu errado**, com a partida que acabou de terminar anexada. Na melhor de três, o mesmo botão aparece em **Prepare o próximo jogo**.

### Mudou

- **Partida anexada por padrão.** Ao enviar uma sugestão ou um erro, **Anexar a partida** já vem marcado sempre que há uma partida para mandar, também numa sugestão e ao relatar da tela inicial. Dá para desmarcar, e **O que vai junto** continua dizendo o que vai.

## [0.117.0] - 2026-11-02

### Mudou

- **Bloqueio que vai até o atacante.** Ao declarar os bloqueios, cada bloqueador avança um pouco na direção da criatura que bloqueou e volta, com uma linha dourada acesa entre os dois, um bloqueio depois do outro.
- **Luta com choque.** Quando duas criaturas lutam (Prey Upon, Ravenous Chupacabra e afins), as duas avançam juntas uma contra a outra e se chocam no meio, cada uma com o dano que causou e o selo **Luta**.
- **A carta se ergue ao ativar uma habilidade.** Ao ativar a habilidade de uma permanente, ela sobe um pouco da mesa, com sombra, enquanto a habilidade sai dela, e assenta de novo.
- **Reanimar, buscar e conjurar de outros montes.** A criatura que volta do cemitério sobe dele em arco e chega com um anel roxo. A carta buscada no grimório sai dourada, com uma lupa de luz no grimório, e o histórico diz "buscou uma carta no grimório" (sem dizer qual). A mágica conjurada do cemitério ou do exílio (flashback, escape e afins) sai do monte de onde veio, com o brilho dele, e não mais da mão.
- **Comandante entre o campo e a zona de comando.** O comandante que volta à zona de comando voa em arco até lá, e a zona recebe uma onda dourada. Ao ser conjurado de lá, ele sai da zona de comando com um brilho dourado, e um **+2** com **Taxa de comandante** sobe de onde ele estava.
- **Troca de controle à vista.** Quando um jogador ganha o controle de uma permanente (Control Magic, Threaten e afins), ela atravessa a mesa até o campo dele e chega com um contorno na cor de quem a controla agora: dourado se for você, vermelho se for um oponente. O histórico diz "Ana ganhou o controle de Serra Angel".
- **Equipar e encantar com encaixe.** Ao equipar ou prender uma aura, a criatura recebe a carta com um pulso e um anel dourado, e a carta presa acende ao encaixar. O histórico diz "Equipar: Bonesplitter em Grizzly Bears", ou "passou para", quando o equipamento troca de criatura.
- **Transformar com giro.** A permanente que muda de face no campo (lobisomens, Delver of Secrets, dia e noite) gira no lugar e mostra a face nova, com um brilho no meio do giro.
- **Embaralhar e vidência.** Ao embaralhar, o grimório balança e as duas metades se abrem para os lados e voltam. Na vidência, as cartas sobem do grimório em leque: as que ficam no topo voltam por cima e as que vão para o fundo passam por baixo do monte, e o grimório mostra quantas foram para cada lado ("1 no topo · 2 no fundo"). O histórico diz "Ana fez vidência 3: 1 no topo e 2 no fundo".
- **Cartas reveladas viram de face.** Na janela de cartas reveladas, cada carta entra de costas e vira de face para cima, uma depois da outra.
- **Marcadores que fazem a carta crescer.** A permanente que ganha marcadores +1/+1 cresce um pouco e assenta, e o "+1/+1" sobe dela (em roxo, o "−1/−1"). Ao proliferar ou pôr um marcador em várias criaturas, todas crescem juntas. Numa saga, o capítulo novo sobe da carta, como "Capítulo II".
- **Mana saindo do terreno.** Enquanto você paga um custo, cada terreno que você vira solta uma bolinha de mana na cor dele, que voa até o custo na caixa de ação.
- **Moeda e dado na mesa.** A moeda gira no ar, no centro da mesa, e cai em **Cara** ou **Coroa**; o dado rola, trocando de número, e para no resultado, com quantos lados ele tem ("d20"). Os dois dizem quem jogou, e o histórico também.
- **Mão inicial distribuída.** As cartas da mão inicial saem do grimório uma a uma e viram de face no leque. No mulligan, a mão anterior volta ao grimório, ele embaralha e a nova mão sai do mesmo jeito.
- **Fim da partida com impacto.** Antes de o resultado aparecer, o retrato de quem perdeu racha e escurece, a mesa treme de leve e o retrato de quem ganhou acende com uma onda dourada.

Com "reduzir movimento" ligado no sistema, nada disso se move: ficam o número, a cor e o destaque no lugar certo, e o resultado aparece direto.

## [0.116.0] - 2026-11-02

### Novo

- **Habilidade de planeswalker identificada na pilha.** Quando alguém usa uma habilidade de lealdade, o selo da pilha mostra o custo dela (**Habilidade · +2**) e uma faixa no pé da carta traz o custo e o texto da habilidade usada, para todos na mesa saberem qual foi sem abrir a pilha. O ultimate ganha um brilho dourado na faixa, e a galeria da pilha também diz qual habilidade de lealdade é.

## [0.115.0] - 2026-11-02

### Mudou

- **Saídas do campo em arco.** A carta que sai do campo voa em arco até onde vai: destruída, racha e cai escurecida no cemitério; sacrificada ou morta em combate, cai no cemitério ou volta ao grimório, e o monte pulsa ao recebê-la. Devolvida à sua mão, ela volta ao lugar dela no leque, já no giro dele. O descarte também cai em arco no cemitério, saindo do lugar da carta no leque.
- **Fichas com mola.** Fichas criadas juntas surgem no lugar com uma mola, e as que vêm de outro lugar chegam em arco e assentam; quando a última pousa, o monte ganha uma onda dourada.
- **Ataque com avanço.** Ao declarar o ataque, cada atacante recua um pouco e avança na direção do oponente, um depois do outro.
- **Janelas e menu com mola.** As escolhas, a barra da escolha recolhida e o aviso de decisão entram com uma mola leve, e o **Menu** da partida desce do botão em vez de aparecer de uma vez.

## [0.114.0] - 2026-11-02

### Mudou

- **Mágicas saem da pilha.** Ao resolver, uma mágica como o Lightning Bolt sai da pilha, no canto da mesa (o raio também parte dali), e a carta cai no cemitério em arco; a habilidade de uma permanente volta para a carta que a gerou. A mágica anulada racha na pilha e cai apagada no cemitério. O monte que recebe a carta pulsa quando ela chega.
- **Mesa com mola.** Tudo o que se mexe na mesa (o campo e a mão abrindo espaço, a carta que muda de lugar ou de tamanho, virar e desvirar) agora assenta com uma mola leve, em vez de parar seco.
- **Compra em arco.** A carta comprada sobe do grimório em arco, inclinada e com sombra, chega ao lugar dela no leque já no giro dele e vira de face para cima com um leve quique.

## [0.113.0] - 2026-11-02

### Mudou

- **Cartas voam da mão com peso.** Ao jogar um terreno ou conjurar uma mágica, a carta sai do lugar dela no leque, com o tamanho e a inclinação que tinha, e sobe em arco: cresce no meio do voo, inclina para o lado em que vai e a sombra acompanha a altura. A mágica conjurada voa até a pilha, no canto da mesa (e não mais para o meio dela), e a permanente que resolve sai da pilha para o campo. No campo, ela chega já no tamanho certo e pousa com um leve quique e uma onda dourada em volta. A criatura que resolve não ganha mais uma segunda cópia voando até ela depois de pousar.

## [0.112.1] - 2026-11-02

### Mudou

- **Oathbreaker em Outros.** Na escolha de formato da tela inicial, o **Oathbreaker** saiu do lado do **Commander** e foi para **Outros**, junto de Standard, Pauper, Sacola 50 e Livre.
- **Decks prontos mais recentes primeiro.** Na tela inicial, em **Meus decks** e na escolha dos decks dos computadores, os decks prontos aparecem do mais novo para o mais antigo: no Commander, os seis das séries recentes vêm no topo.

## [0.112.0] - 2026-11-02

### Novo

- **Formato Oathbreaker.** Na tela inicial, o **Oathbreaker** fica ao lado do **Commander**: de dois a quatro jogadores, uma partida só e 20 de vida. O deck tem 60 cartas, uma de cada (fora os terrenos básicos), com duas na zona de comando: um planeswalker, o oathbreaker, que dá a identidade de cor do deck, e uma instantânea ou feitiço, a mágica de assinatura, que só pode ser conjurada enquanto o seu oathbreaker estiver no campo. No construtor de decks, escolha o formato Oathbreaker para montar o seu: a zona de comando pede o oathbreaker (a busca traz só planeswalkers) e depois a mágica de assinatura (só instantâneas e feitiços nas cores dele). Ao importar do Moxfield, a mágica de assinatura vai para a zona de comando junto do planeswalker.
- **10 decks prontos de Oathbreaker.** Os planeswalkers com as listas de Oathbreaker mais vistas no Moxfield, um deck para cada: Raízes de Wrenn (Wrenn and Six), Forja de Dakkon (Dakkon, Shadow Slayer), Elfos de Tyvar (Tyvar, Jubilant Brawler), Faíscas de Rowan (Rowan, Scholar of Sparks), Veneno de Vraska (Vraska, Betrayal's Sting), Arsenal de Elspeth (Archangel Elspeth), Masmorra de Ellywick (Ellywick Tumblestrum), Dragões de Sarkhan (Sarkhan Unbroken), Eldrazi de Ugin (Ugin, Eye of the Storms) e Tempestade de Ral (Ral, Crackling Wit). As poucas cartas que o computador não sabe jogar foram trocadas por outras parecidas, para que ele também jogue com todos.

## [0.111.0] - 2026-11-02

### Mudou

- **Editar ou iniciar agora os cenários do Laboratório.** Nos **Cenários prontos** e nos **Cenários salvos**, o botão **Abrir** deu lugar a dois: **Editar**, que monta a mesa para você ajustar antes de jogar, e **▶ Iniciar agora**, que monta a mesa e já cria a sala de teste, sem passar pelo editor.

## [0.110.1] - 2026-11-02

### Corrigido

- **Espaço confirma e Esc mostra a mesa nas escolhas.** Ao abrir uma escolha, o foco ia para **Ver a mesa**, e o Espaço escondia a janela em vez de confirmar. Agora o foco começa na escolha principal (o modo recomendado, o primeiro gatilho, o botão de confirmar ou o OK; numa lista de cartas, a primeira carta), então o Espaço a aperta, e o **Esc** recolhe a janela para ver a mesa. Outro Esc a traz de volta, com o foco de novo na escolha principal.

## [0.110.0] - 2026-11-02

### Novo

- **Cenários prontos no Laboratório.** O Laboratório ganhou uma lista de **Cenários prontos**, um para cada correção de regra ou de carta, com a mesa já montada para conferir se ela continua certa: mana phyrexiana sem terrenos, Spelunking com terrenos que entram virados, Fact or Fiction, Gifts Ungiven e Intuition, proliferar com o slime do Toxrill, nomear uma carta com a Pithing Needle, responder no início do combate do oponente, improvisar e convocar, a carta escondida pela Mosswort Bridge, as moedas em português e a mana incolor na reserva. Escolha um, toque em **Abrir**, e a mesa aparece montada com um quadro **O que conferir**, que diz o que fazer e o que deve acontecer. Daqui em diante, cada correção de regra ou de carta chega com o seu cenário.
- **Fechar a sala de teste e voltar ao Laboratório.** Na partida de uma sala de teste, o **Menu** traz **Fechar a sala e voltar ao Laboratório** no lugar de **Desistir e voltar ao início**, e o fim do jogo mostra **Laboratório** no lugar de **Início**. A sala fecha para os dois lados: quem está do outro lado volta à tela inicial com o aviso de que a sala foi fechada. Você volta ao Laboratório com a mesa montada como estava, para ajustar e testar de novo.

### Mudou

- **Criar sala de teste sempre à vista.** No Laboratório, o botão **Criar sala de teste** flutua no canto de baixo da tela, sempre à vista enquanto você monta a mesa, por mais longa que ela fique. Os avisos (cenário aberto, carta não encontrada, erro ao criar a sala) aparecem num balão logo acima dele.

## [0.109.0] - 2026-11-02

### Novo

- **Lealdade na escolha da habilidade do planeswalker.** Ao escolher qual habilidade de um planeswalker usar, a carta grande mostra o escudo com a lealdade atual (e não mais a impressa), e cada habilidade traz o custo num escudo verde (**+**) ou vermelho (**−**) e com quanta lealdade ele fica depois, como "+2 → 6". Quando a habilidade deixa o planeswalker sem lealdade, o "→ 0" aparece em vermelho.

## [0.108.0] - 2026-11-02

### Novo

- **Destaque para os planeswalkers.** Quando um planeswalker entra no campo, a moldura acende na cor dele, um anel de luz se abre em volta da carta e o escudo de lealdade surge com o valor inicial. Ao usar uma habilidade de lealdade, o escudo pula e fica verde no **+** ou vermelho no **−**, o custo sobe da carta ("+2", "−3") e o aviso ao lado mostra o custo e o texto da habilidade, como "Ana usou +2 de Jace Beleren". O ultimate é maior: uma onda de luz atravessa a mesa, a mesa treme de leve e o aviso diz "usou o ultimate". A entrada e a lealdade têm sons próprios em todos os pacotes de som, e o ultimate toca o da lealdade mais grave e mais forte. Vale para os seus planeswalkers e para os dos oponentes. Com "reduzir movimento" ligado no sistema, ficam só o número e a cor no escudo, e a partida não espera o efeito terminar.

## [0.107.1] - 2026-11-02

### Corrigido

- **Passar a vez com mana phyrexiana na mão.** Com uma carta que dá para pagar com vida, como Gitaxian Probe, Mental Misstep ou Gut Shot, o jogo às vezes passava a prioridade sozinho, como se você não tivesse nada para fazer, e a carta nem aparecia como jogável. Agora a mesa para quando você tem vida para pagar os símbolos phyrexianos (2 de vida cada) e o resto do custo.

## [0.107.0] - 2026-11-02

### Novo

- **Laboratório.** Uma tela para montar a mesa do jeito que você quiser e jogar de verdade, com as regras do servidor: para achar erros, conferir se foram corrigidos, testar combos e ver até onde as regras aguentam. Abra pelo menu **⋯** da tela inicial. Para cada um dos dois jogadores, escolha a vida, o veneno e as cartas da mão, do campo, do grimório (na ordem, a primeira é a do topo), do cemitério e do exílio; no campo, marque se a carta está virada ou entrou neste turno, ponha marcadores (+1/+1, lealdade, carga, conhecimento e outros) e prenda equipamentos e auras a outra permanente. Escolha também de quem é o turno e em que etapa a partida começa: no início do combate, por exemplo, os gatilhos de "no começo do combate" acontecem. Digite "3 Island" para pôr três cópias de uma vez. Os cenários ficam salvos no aparelho e podem ser copiados e colados para mandar a alguém. **Criar sala de teste** abre uma sala com a mesa montada: você joga como Jogador 1, e o Jogador 2 entra pelo link, que você pode abrir numa outra aba para jogar pelos dois lados ou mandar para outra pessoa. A partida começa direto como foi montada, sem mulligan, não entra no histórico, e o **Desfazer** não precisa do aceite do outro lado.

## [0.106.3] - 2026-11-02

### Corrigido

- **Spelunking e terrenos que entram virados.** Com a Spelunking em campo, cada terreno que entra virado (Bojuka Bog, Golgari Rot Farm, Stomping Ground e afins) abria uma pergunta sobre a ordem dos efeitos, e, escolhendo a Spelunking primeiro, o terreno entrava virado. Agora a mesa não pergunta mais: o terreno sempre entra desvirado. Nos terrenos que pedem 2 de vida para entrar desvirados, como o Stomping Ground, você pode recusar o pagamento e ele entra desvirado do mesmo jeito. Vale também para Horizon Explorer e outras cartas que fazem os terrenos entrarem desvirados.
- **Fact or Fiction e outras cartas de dois montes.** Na hora de escolher um monte, a mesa mostrava dois cartões em branco ("Pile 1", "Pile 2") e as cartas misturadas, fora de ordem: não dava para saber quais cartas estavam em cada monte. Agora os dois montes aparecem lado a lado, cada um com as suas cartas e o botão **Ficar com o monte 1** (ou **Escolher o monte 1**, quando o monte vai para outro jogador), e a mesa diz para onde vai cada um. Quem separa também vê os dois montes enquanto monta: todas as cartas começam no monte 1, e tocar numa carta a passa para o outro; **Ler** abre a carta. Vale para Fact or Fiction, Sphinx of Uthuun, Steam Augury, Epiphany at the Drownyard e outras cartas que dividem em dois montes.
- **Gifts Ungiven e Intuition.** O oponente que escolhe as cartas buscadas via um pedido em inglês ("Select two cards for the graveyard"), sem dizer de quem eram as cartas. Agora a mesa diz em português quantas escolher, para onde vão e o que acontece com as outras, como "Escolha 2 cartas para o cemitério de Ana. As outras vão para a mão."

## [0.106.2] - 2026-11-01

### Corrigido

- **Espaço depois de clicar numa carta.** Ao pagar mana tocando nos terrenos, o Espaço às vezes não confirmava: ele usava de novo o último terreno clicado e abria os detalhes da carta. O mesmo acontecia depois de tocar na mana da reserva. Agora, depois de um clique, o Espaço sempre aperta o botão de confirmar da caixa de ação. Quem navega pela mesa com Tab continua usando o Espaço na carta em que está.
- **Esc fechando as janelas da mesa.** Depois de fechar uma janela ou clicar num canto vazio da mesa, o Esc às vezes deixava de funcionar: a tela de um oponente em destaque, o cemitério, o exílio, o dano de comandante, as opções, o menu e o registro ficavam abertos. Agora o Esc fecha a janela aberta em qualquer situação.

## [0.106.1] - 2026-11-01

### Corrigido

- **Proliferar com slime e outros marcadores que atrapalham.** Ao proliferar, os marcadores de slime nas criaturas do oponente (os do Toxrill e do Sludge Monster) apareciam em vermelho, como se te prejudicassem, e a criatura caía em **Ajuda e prejudica** mesmo tendo só -1/-1 e slime. Agora o slime numa criatura conta como ruim para quem tem: na criatura do oponente, aparece em verde, como o -1/-1 e o atordoamento. O mesmo vale para o gelo (Dark Depths, Thing in the Ice, criaturas que não desviram) e para as marcas que uma carta põe nas criaturas do oponente para caçá-las, como recompensa, presa, rejeição e odor. O slime no Gutter Grime e o gelo no Iceberg continuam bons para quem tem. Quando todos os jogadores proliferam, cada um vê a lista pelo próprio lado.

## [0.106.0] - 2026-11-01

### Novo

- **Som de marcador.** Pôr marcadores numa permanente ou num jogador agora tem som: uma ficha que sobe de tom para os que ajudam (+1/+1, lealdade, carga, energia e os outros) e uma ficha mais grave, que desce, para os que atrapalham (-1/-1, veneno, radiação). Vários marcadores de uma vez, como ao proliferar, tocam um som só. Os marcadores com que uma permanente já entra, e o veneno e os -1/-1 que vêm de um golpe com infectar ou murchar, não tocam de novo, porque a entrada e o golpe já têm o som deles. Tirar marcadores continua em silêncio. Cada pacote de sons tem a sua versão.

## [0.105.0] - 2026-11-01

### Novo

- **Gráfico de vida no fim do jogo.** A tela de Vitória ou Derrota mostra a vida de cada jogador no fim de cada turno, uma linha por jogador, com você em dourado e a vida final na ponta de cada linha. Passe o mouse ou toque num turno para ver a vida de todos naquele momento. No Commander, logo abaixo vem o dano de comandante de cada um: quem recebeu quanto de qual comandante, do maior para o menor, com os 21 que eliminam em vermelho. Na melhor de três, a tela **Prepare o próximo jogo** traz o gráfico do jogo que acabou em **Ver gráfico de vida**. O servidor anota a vida a cada turno, então o gráfico sai completo mesmo depois de uma queda de conexão, de recarregar a página ou para quem só assiste.
- **Lista de atalhos de teclado.** Na partida, aperte **?** para ver todos os atalhos (Espaço para passar, Esc para fechar, I para ver a carta de perto e os outros). A lista também abre em **Menu → Opções → Atalhos de teclado**. Na mesa livre, o **?** mostra os atalhos dela (C para comprar, D para desvirar tudo, Ctrl+Z para desfazer).

### Mudou

- **Topo da mesa mais limpo.** Durante a partida, o canto de cima fica só com **Menu**, tela cheia, **Desfazer** e o placar, que só aparece na melhor de três. O formato e o código da sala passaram para dentro do **Menu**, no alto, junto do placar. Quem caiu da sala continua avisado no topo. No celular, os três botões do topo ganharam área de toque maior.
- **Nome do nível de passar automaticamente à vista.** O selo junto dos botões virou uma linha embaixo deles, com o ícone e o nome do nível (**Só com ações**, **Respostas**…), e mostra **Até o fim do turno** quando esse atalho está ligado. Tocar nele continua abrindo a troca rápida.
- **Nome dos ícones de baixo ao tocar.** Na fileira do canto de baixo (turno, relógios, dia e noite, fases), tocar num ícone mostra o nome dele por alguns segundos, como já acontecia ao passar o mouse. No celular, a fileira ficou mais alta e com mais espaço entre as fases, e um toque entre dois ícones vale para o mais perto.

### Corrigido

- **Aviso quando os dados das cartas não carregam.** Sem internet ou com o site das cartas fora do ar, a tela Jogar e a lista de **Meus decks** mostravam decks sem arte e sem cores, sem dizer por quê. Agora aparece um aviso com **Tentar de novo**, que também passou a existir no editor de deck.
- **Desfazer encostado no retrato do oponente no celular.** No 1x1 pelo celular, o botão **Desfazer** ficava por baixo do ⤢ de focar no oponente. O retrato do oponente foi um pouco para a direita, e o ⤢ virou um selo no canto do retrato.

## [0.104.0] - 2026-11-01

### Novo

- **6 novos decks prontos de Commander das séries mais recentes.** Chegam os dois comandantes mais populares do EDHREC em cada uma das três séries mais novas: de Marvel Super Heroes, **Vilania do Doutor Destino** (Doctor Doom, King of Latveria) e **Exército da Garota Esquilo** (The Unbeatable Squirrel Girl); de O Hobbit, **Reino de Thranduil** (Thranduil, the Elvenking) e **Tesouro de Thorin** (Thorin, King of Durin's Folk); e de Reality Fracture, **Multiverso de Jace** (Jace, Multiverse Architect, um planeswalker que pode ser comandante) e **Possibilidades de Tam** (Tam, the Possibility). Cada lista é o deck médio do EDHREC para o comandante, com as cartas que o oponente controlado pelo computador ainda não sabe jogar trocadas pela carta mais usada do mesmo tipo, então todos servem tanto para você quanto para os oponentes. Eles já vêm com o bracket conferido e com o preço das cartas em dólar, cotado em 01/11/2026: de US$ 172,45 (**Vilania do Doutor Destino**) a US$ 541,88 (**Possibilidades de Tam**).

### Mudou

- **Som ligado desde a primeira partida.** Os efeitos sonoros agora começam ligados: quem nunca mexeu no som ouve a mesa assim que toca em qualquer lugar da página. Quem já tinha desligado continua sem som. Para desligar, use **Menu → Opções → Som**.
- **Sala nova começa pública.** Ao criar uma sala contra outras pessoas, o tipo vem marcado como **Pública**, e a sala aparece na lista de salas públicas para qualquer pessoa entrar. Quem prefere jogar só com quem recebe o código escolhe **Privada**, e a mesa lembra essa escolha nas próximas salas.

## [0.103.0] - 2026-11-01

### Novo

- **Tela acesa durante a partida.** No celular e no tablet, a tela não apaga mais sozinha enquanto os outros jogadores pensam: a mesa pede ao aparelho para mantê-la acesa enquanto a partida (ou a mesa livre) está aberta e solta ao sair. Para desligar, use **Menu → Opções → Jogo → Manter a tela acesa**.
- **Vibrar na sua vez.** O celular dá uma vibração curta quando o seu turno começa, quando você precisa bloquear e quando chega uma decisão sua no turno de outro jogador, como escolher um alvo. Assim dá para jogar com o som desligado sem perder a vez. Vale onde o aparelho deixa o navegador vibrar (no iPhone, não). Para desligar, use **Menu → Opções → Jogo → Vibrar na sua vez**.

### Mudou

- **Escolhas de cartas no celular numa fileira só.** No celular, em pé ou deitado, as janelas que pedem para escolher cartas (descartar, sacrificar, buscar uma carta, ver o cemitério e o exílio, olhar a mão revelada) mostram as cartas numa fileira só, que rola de lado, em vez de empilhar várias linhas e empurrar os botões para fora da tela. A borda escurece do lado em que ainda há cartas, e marcar uma carta não faz a fileira voltar ao começo. Os botões de confirmar e cancelar ficam sempre à vista embaixo, também nas janelas sem cartas e na ordem dos gatilhos. No computador, nada muda.

## [0.102.0] - 2026-11-01

### Novo

- **Focar num oponente.** Cada oponente ganhou um botão ⤢ (no Commander, no cabeçalho do campo dele, ao lado de **Só este** e **Ocultar**; no 1x1, ao lado do retrato do oponente) que abre o campo dele em tela cheia: as permanentes em tamanho grande, todas à vista sem precisar rolar, com a vida, as cartas na mão, os marcadores, o dano de comandante, a zona de comando, o grimório, o cemitério e o exílio. Os nomes dos outros oponentes ficam no alto para trocar o foco sem fechar, e **Fechar** (ou Esc) volta à mesa. A tela é só para olhar: tocar numa carta mostra a carta, e o cemitério e o exílio abrem a lista como na mesa. Se chegar uma decisão sua enquanto você olha (ser atacado, responder a uma mágica, o seu turno), uma faixa dourada avisa ali mesmo, com **Voltar à mesa**, sem tirar a vista do oponente.

### Corrigido

- **Botões dos campos dos oponentes no celular.** No Commander pelo celular, os botões de cada oponente (**Só este**, **Ocultar** e o novo ⤢) ficavam escondidos atrás das pilhas no alto do campo. Agora ficam no canto de baixo do campo de cada um.

## [0.101.0] - 2026-11-01

### Novo

- **Jogar de novo.** Quem já jogou encontra no alto da tela inicial o deck da última partida em destaque, com a arte dele, o resumo da partida (por exemplo, "Commander · 4 jogadores · computadores aleatórios") e o botão **Jogar de novo**, que começa outra partida igual com um toque. O título "Como jogar:" saiu: quem joga pela primeira vez vai direto para a escolha dos decks.
- **Tapete com a arte do deck.** Atrás do campo de cada jogador aparece agora a arte de capa do deck dele, bem escura e desfocada, sumindo nas bordas, como um tapete de mesa. Ela dá clima à partida e mostra de quem é cada lado sem tirar o destaque das cartas. Vale no 1x1 e no Commander com vários jogadores; quem não tiver arte de capa conhecida fica com o fundo de sempre. Para desligar, use **Menu → Opções → Aparência → Tapete com a arte do deck**.

### Mudou

- **Escolha de deck primeiro no celular.** No celular, o formato, os oponentes, o número de jogadores e os decks dos computadores ficam resumidos numa linha ("Partida: Commander · 4 jogadores · computadores aleatórios"), e os decks aparecem logo abaixo. Toque em **Mudar** para abrir os ajustes. Contra outra pessoa, os ajustes já vêm abertos, porque é lá que se escolhe a sala.
- **Cabeçalho mais limpo.** O alto da tela inicial e de Meus decks ficou só com as abas, a conta e dois botões pequenos: **Novidades** virou um ícone, com o ponto dourado quando há versão nova (a versão aparece dentro do painel), e o novo botão **⋯** reúne **Enviar sugestão ou erro** e o **Tema da mesa**.
- **Cartas maiores quando uma fileira está vazia.** Quando um lado do campo ainda não tem criaturas (só terrenos e outras permanentes), ou só tem criaturas, a fileira que tem cartas passa a usar a altura toda daquele lado: no começo da partida, os terrenos aparecem do tamanho das criaturas, e as criaturas sem nada atrás ficam até 60% maiores. Quando a outra fileira ganha a primeira carta, as duas voltam ao tamanho de sempre.

## [0.100.0] - 2026-11-01

### Novo

- **Minhas partidas.** Quem joga com a conta conectada tem agora a página **Minhas partidas**, no menu da conta (a sua foto, no alto da tela). Ela lista cada partida com a data, o formato, o deck que você usou, os oponentes, o resultado, os turnos e quanto durou, e mostra os seus números: partidas, vitórias, taxa de vitória, duração média e a sequência atual, além da taxa por deck, por formato e contra o computador ou contra pessoas. Dá para filtrar pelos últimos 7 dias, 30 dias ou 3 meses, pelo formato e pelo deck. Cada deck conta pelo deck salvo, então editar a lista não começa outra contagem. Entram as partidas jogadas com a conta conectada a partir desta versão, contra o computador e em salas; uma partida que caiu sem ninguém voltar aparece na lista como **Sem vencedor**, mas fica fora dos números. Só você vê a página, e apagar a conta desfaz na hora a ligação com as suas partidas. A política de privacidade foi atualizada para explicar isso.

### Corrigido

- **Nomear entre poucas cartas volta a ser com botões.** Quando a carta pede um nome e as opções são poucas, a escolha volta a mostrar um botão para cada nome, como antes, em vez da busca. A busca só aparece quando a lista é grande demais para caber na tela (100 nomes ou mais), como ao nomear qualquer carta do jogo.
