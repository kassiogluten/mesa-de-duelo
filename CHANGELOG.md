# Novidades

Todas as mudanças que você sente na mesa. As versões seguem o formato **X.Y.Z**:

- **X** muda quando algo grande deixa de funcionar como antes (decks, partidas salvas, jeito de jogar).
- **Y** muda quando chegam coisas novas: decks, telas, regras, recursos.
- **Z** muda só com correções.

## [0.55.0] - 2026-10-27

### Novo

- **Mágicas do turno.** Quando há na mesa uma carta que conta as mágicas conjuradas no turno, como as de Tempestade (Grapeshot, Brain Freeze) ou Thousand-Year Storm, um selo com um raio aparece ao lado do retrato de cada jogador que já conjurou, com quantas foram. Tocando no selo, o balão diz também o total da mesa, que é o que a Tempestade conta. Sem uma carta dessas à vista, nada aparece.
- **Bênção da cidade e Velocidade.** Quem ganha a bênção da cidade (Ascend, de Ixalan) passa a ter o selo **Bênção** ao lado do retrato, para a partida toda. Com cartas de Start your engines!, a velocidade de cada jogador aparece num selo de velocímetro, de 1 a 4, que fica destacado na velocidade máxima. Tocando nos selos, o balão explica de onde vem a bênção e como a velocidade sobe.
- **Estados das permanentes.** Criaturas e outras permanentes ganham um ícone pequeno embaixo da carta quando ficam monstruosas, renomadas, suspeitas, seladas, tripuladas, exauridas, detidas, atreladas, ou quando um Caso é solucionado. Passando o mouse (ou no inspetor), o balão diz o nome do estado e o que ele muda, como "Exaurida: não desvira na próxima etapa de desvirar de quem a controla" ou quem tripulou o veículo neste turno.
- **Quem defende a batalha.** As batalhas mostram embaixo da carta, ao lado dos marcadores de defesa, um escudo com o nome de quem as defende. O balão lembra que é esse jogador quem bloqueia os atacantes, quanto dano falta para derrotá-la e o que acontece quando ela cai.
- **Cartas previstas à vista.** As cartas que você prevê (Foretell) agora aparecem de face para cima no seu exílio, com a etiqueta **Prevista** e o custo previsto, e ficam na prateleira do exílio ao lado da mão: quando dá para conjurar, toque nela, como uma carta da mão. Antes, até para você ela ficava de costas. Os oponentes continuam vendo só o verso, agora com a etiqueta **Prevista**.

### Corrigido

- **Erros longos na barra lateral.** Quando a mesa avisa um problema comprido embaixo do botão **Jogar** (como um deck com várias cartas fora do formato), a mensagem agora ocupa no máximo algumas linhas e o resto rola dentro dela, em vez de empurrar a barra lateral e esconder o botão.

## [0.54.0] - 2026-10-27

### Novo

- **Votações com a carta à vista.** Em cartas de votação, como Expropriate, Coercive Portal e Council's Judgment, a escolha agora mostra a carta que pediu o voto, com o texto dela, e embaixo de cada opção o trecho que diz o que aquele voto faz. Os votos que já foram dados aparecem em **Votos até agora**, e o aviso de cada voto chega em português ("Ana votou em Time."). Quando o voto é numa permanente, a carta fica ao lado do painel e o pedido diz de qual votação ele é.

### Corrigido

- **Moeda em português.** Ao jogar uma moeda, o pedido agora diz qual carta pede e pergunta "Costurado no Tempo: cara ou coroa?", com os botões **Cara** e **Coroa**. O resultado chega num aviso claro, como "Costurado no Tempo: você ganhou na moeda." ou, nas moedas sem escolha como Duelo de Mana, "a moeda de Oponente deu coroa.", em vez de frases quebradas como "Você vitórias o cara-coroa". Com Krark's Thumb, a escolha entre as duas moedas também ficou em português, e na pilha a mágica mostra o próprio texto em vez de "flips a coin".

## [0.53.0] - 2026-10-27

### Novo

- **Aviso de mana na manutenção.** Na sua manutenção, antes da fase principal, tocar num terreno (ou em outra permanente que só gera mana) agora abre um aviso: a mana gerada ali some quando o jogo passa para a fase principal. Toque em **Voltar** para não virar nada, ou em **Gerar mana mesmo assim** se é isso mesmo que você quer. O aviso aparece uma vez por manutenção; pagando um custo ou respondendo a algo na pilha, os terrenos viram direto, como antes.

## [0.52.0] - 2026-10-27

### Novo

- **Link que cria a sala.** Se você abrir um link de sala que ainda não existe, a mesa não para mais no aviso de erro: ela abre a aba **Criar sala** já com o código do link e como sala pública, e é só conferir as opções e tocar em **Criar sala**. Assim dá para combinar um link com os amigos antes de alguém abrir a sala.

## [0.51.0] - 2026-10-27

### Novo

- **Escolha o código da sala.** Ao criar uma sala, você pode digitar um código de 4 letras ou números, como **MESA** ou **BOLO**, para os amigos lembrarem fácil. Deixando o campo vazio, o código é sorteado como antes. Se o código já estiver em uso, a mesa avisa para escolher outro.
- **Link para convidar.** Na sala de espera, **Copiar link** copia um endereço que leva direto para a sala; no celular, **Compartilhar** manda o link pelo aplicativo que você quiser. Quem abre o link já tendo um nome e um deck que sirva entra na hora; senão, a mesa pede o nome e o deck antes.
- **Sala de espera nova.** Depois de criar ou entrar numa sala, a tela inteira vira a sala de espera: o código em destaque, quantos jogadores faltam e um lugar para cada um, com o nome, a arte do deck e, no Commander, o comandante. As outras cartas continuam escondidas até a partida. Ela começa sozinha quando a mesa enche, como antes.
- **Mensagens rápidas na sala.** Na sala de espera, os botões **Oi, pessoal!**, **Já volto**, **Vou chamar mais gente** e **Boa partida!** mostram um balão sobre o seu lugar para todos da sala.

### Mudou

- **Códigos com O, I, 0 e 1.** O campo de entrar numa sala agora aceita qualquer letra ou número, para os códigos escolhidos funcionarem.

### Corrigido

- **Pagar mana phyrexiana com vida.** Cartas com símbolos phyrexianos, como Gitaxian Probe e Dismember, agora podem ser pagas com 2 de vida por símbolo, como manda a regra. Durante o pagamento, toque no seu retrato ou no botão **Pagar 2 de vida**. A instrução diz quanto de vida você já separou, e a vida sai quando o pagamento termina. O pagamento automático continua usando só mana.
- **Mana incolor na reserva.** A mana incolor (como a de Wastes e Sol Ring) agora aparece no seu retrato junto com as outras cores, e tocar nela a gasta no pagamento.

## [0.50.0] - 2026-10-26

### Novo

- **Topo do grimório à vista.** Com cartas que deixam olhar o topo do grimório a qualquer momento (como Vizier of the Menagerie e Bolas's Citadel), a carta do topo aparece de face para cima no seu grimório, só para você. Quando o topo é revelado (Courser of Kruphix, Future Sight), todos os jogadores o veem. Toque nele para ver a carta.
- **Jogar do topo do grimório.** Quando dá para conjurar ou jogar a carta do topo (Future Sight, Bolas's Citadel, o terreno com Courser of Kruphix), o grimório brilha e a carta aparece também na ponta da sua mão, com a etiqueta **Topo do grimório**. Toque nela para jogar, como uma carta da mão.

## [0.49.0] - 2026-10-26

### Novo

- **Devoção à vista.** As cartas que contam com devoção, como o Mercador Cinzento de Asfódelos, ganham um selo embaixo com o símbolo da cor e a sua devoção atual. Nos deuses de Theros, o selo mostra quanto você tem e quanto precisa para o deus virar criatura (por exemplo, **3/5**), e fica verde quando ele já é criatura. Passando o mouse, o balão explica quanto falta.
- **O que está na pilha.** Cada carta da pilha ganha um selo dizendo por que ela está ali: **Mágica** (foi conjurada), **Habilidade** (alguém ativou uma habilidade dela) ou **Gatilho** (uma habilidade dela disparou sozinha). Ao abrir a pilha, embaixo de cada carta aparece também quem a pôs ali, como **Sua mágica**, **Habilidade ativada por Ana** ou **Gatilho de Ana**.
- **Como a mágica foi conjurada.** O selo da pilha também diz quando a mágica foi paga de um jeito diferente do normal: **Mágica · Reforçada** quando o reforço foi pago (com **×2** se foi mais de uma vez), **Mágica · Flashback**, **Mágica · Aventura**, **Mágica · Evocar** e outras formas de conjurar, **Recompra**, **Entrelaçada** e outros custos opcionais, e o valor de **X**. Ao abrir a pilha, uma linha embaixo do efeito explica tudo, como **Conjurada por flashback, com reforço 2 vezes e com recompra. X = 3.** Assim dá para saber, antes de responder, se aquela mágica vai fazer o efeito maior.

### Mudou

- **Botões claros ao pagar mana.** Na hora de pagar um custo, o botão **Automático** virou **Pagar automaticamente** e, quando a sua mana não dá para pagar, aparece apagado como **Mana insuficiente**. O **Cancelar** agora diz o que acontece: **Desistir da mágica** (a carta volta para a mão), **Desistir da habilidade** ou, quando é uma carta pedindo um pagamento opcional, como o Estudo Rístico do oponente, **Não pagar**. Nesse caso, a frase acima dos botões diz quem pede e quanto (**Estudo Rístico pede {1}**) e avisa quando a sua mana não dá. Sem mana para pagar, o botão de destaque passa a ser o que desiste ou não paga.

### Corrigido

- **Botão certo nas manutenções extras.** Numa manutenção extra que vem depois do combate, o botão de ação não diz mais **Comprar**: ele mostra **Para a principal 2**, que é para onde o jogo vai, já que a compra do turno já passou. Quando uma carta repete a manutenção antes da compra, o botão mostra **Para a manutenção extra** e só diz **Comprar** na última.

## [0.48.2] - 2026-10-26

### Corrigido

- **Cabeçalho numa linha só.** No celular deitado e em telas estreitas, **Jogar**, **Meus decks** e o botão de relato cabem numa linha só, sem quebrar o texto em duas. O botão de relato aparece como **Relatar**.
- **Títulos de Meus decks.** A tela **Meus decks** usa nos títulos a mesma letra do resto do jogo, e a lista de formatos ganhou a mesma seta das outras listas.
- **Créditos uma vez só.** No fim da tela inicial, a linha de créditos não aparece mais repetida embaixo do rodapé.
- **Novidades em imagens no celular.** Na página **Novidades em imagens**, a marca e o botão **Voltar ao jogo** não encostam mais nas bordas da tela.
- **Janela de sugestão.** Com **Sugestão** marcada, a caixa de texto pergunta qual é a sua ideia, em vez de pedir o que deu errado. O fundo da janela também não deixa mais aparecer o texto da tela de trás.
- **Terrenos livres da caixa de ação.** Quando a caixa ao lado dos botões mostrava uma frase ("Escolha um terreno para sacrificar") ou uma escolha de cartas, ela subia por cima dos últimos terrenos da direita, e às vezes era justamente um deles que precisava ser escolhido. Agora a fileira de terrenos sempre termina antes da caixa e, com muitos terrenos, rola em vez de passar por baixo. No celular, a caixa de escolha de cartas ficou da largura dos botões, com os botões um embaixo do outro.

## [0.48.1] - 2026-10-26

### Mudou

- **Exílio jogável em destaque.** As cartas do exílio ao lado da mão ficaram um pouco maiores, mas ainda menores que as da mão. A que dá para jogar agora ganha o mesmo contorno azul das cartas jogáveis da mão, e a que está esperando continua apagada. Passando o mouse, a carta cresce até o tamanho das cartas da mão.
- **Um selo só quando a carta está cheia.** Quando os marcadores e as habilidades de uma permanente não cabem na carta (encostariam no poder/resistência, um no outro ou cobririam mais da metade dela), eles viram um único selo com o total de itens. Passando o mouse, o balão lista todos os marcadores com as quantidades e todas as habilidades; tocando, abre o detalhe da carta com tudo. Os marcadores que cabem continuam à vista, agora sem passar por baixo do poder/resistência, e o balão de um selo fica na frente das cartas vizinhas, sem a prévia da carta por cima.

### Corrigido

- **Janela do exílio com contorno e etiquetas.** Ao abrir o exílio, as cartas que dá para jogar voltaram a ter o contorno azul, e as que você pode jogar por algum efeito mostram a mesma etiqueta da mesa (**Jogar**, **Aguarde**, **Suspensa**). O selo **Tramada** ou **Preparado** não some mais quando a carta pode ser jogada. No cemitério e no exílio, as cartas que só dá para inspecionar perderam a moldura cinza em volta.
- **Quantidade de marcadores à vista.** Os selos de marcadores nas permanentes voltaram a mostrar a quantidade ao lado do ícone, como experiência, tempo, carga, escudo e atordoar, e não só nos +1/+1 e −1/−1. O nome do marcador continua no balão ao passar o mouse ou tocar.
- **Botão Jogar por cima dos créditos.** No celular, ao rolar a tela inicial até o fim, o texto dos créditos passava por cima da barra presa embaixo com o deck escolhido e o botão **Jogar**. Agora a barra fica sempre na frente.

## [0.48.0] - 2026-10-25

### Novo

- **Pacotes de sons.** Em **Opções**, logo abaixo do volume, dá para escolher o pacote de efeitos sonoros da mesa: **Clássico** (o de sempre), **8 bits**, com bipes e ruídos de videogame antigo; **Fantasia**, com harpa, sinos e trompas; **Aventura fofa**, com marimba, bolhas e apitos de desenho; **Arena épica**, com tambores de guerra, metal e explosões pesadas; **Taverna**, com cartas na mesa de madeira, canecas, moedas, dados e alaúde; **Ficção científica**, com lasers, bipes e campos de força; e **Discreto**, só com toques curtos e baixinhos. Ao trocar, toca uma amostra do pacote escolhido, e a escolha fica guardada para as próximas partidas.

## [0.47.0] - 2026-10-25

### Mudou

- **Busca em ordem de custo.** Ao procurar uma carta no grimório (e nas outras escolhas entre cartas, como descartar), as opções aparecem ordenadas pelo custo de mana, da mais barata para a mais cara, e por nome quando o custo empata. Fica mais fácil achar a carta certa com um tutor num grimório cheio.

## [0.46.1] - 2026-10-25

### Mudou

- **Botão Comprar na manutenção.** Quando o jogo para na sua manutenção, o botão de ação mostra **Comprar**, porque passar ali leva você à compra do turno.

## [0.46.0] - 2026-10-25

### Novo

- **Monarca à mostra.** Quem é o monarca ganha um selo de coroa ao lado do retrato, que pulsa quando a coroa troca de mãos. Passando o mouse ou tocando, aparece a regra: o monarca compra um card no começo da etapa final, e quem causar dano de combate a ele passa a ser o monarca.
- **Terrenos do turno.** No turno de cada jogador, um selo pequeno ao lado do retrato mostra quantos terrenos ele já jogou e quantos pode jogar, como 0/1, contando os terrenos extras de cartas como Azusa e Exploration. O selo fica apagado quando não dá para jogar mais nenhum.
- **Permanente roubada.** Uma permanente controlada por quem não é o dono (Threaten, Control Magic, Hostage Taker) ganha um ícone discreto embaixo da carta. Passando o mouse na carta, aparece embaixo da imagem a quem ela pertence e quem a controla agora; o mesmo vale para os outros estados abaixo, que também aparecem no inspetor.
- **Criatura atiçada.** A criatura atiçada ganha um ícone embaixo da carta. O detalhe diz quem atiçou, que ela precisa atacar em todo combate e atacar outro jogador, e até quando dura.
- **Escudos de regeneração.** A permanente com regeneração pronta mostra o escudo embaixo da carta, com a quantidade quando houver mais de um, e o detalhe explica o que acontece da próxima vez que ela seria destruída.
- **O que a carta escolheu.** Cartas que escolhem algo ao entrar mostram a escolha num selo pequeno embaixo da carta: o tipo do Cavern of Souls, a cor do Iona, a carta nomeada pela Pithing Needle, o jogador da Stuffy Doll, o número ou o modo. O texto completo aparece ao passar o mouse e no inspetor.

### Corrigido

- **Ver a carta antes de escolher.** Nas escolhas de carta, como o terreno que uma fetch land vai buscar, passar o mouse numa opção mostra a carta ampliada, e o botão direito (ou segurar o dedo, no celular) abre o detalhe completo. Um clique normal continua escolhendo a carta.

## [0.45.0] - 2026-10-25

### Mudou

- **Parar na sua manutenção quando há o que usar.** O jogo agora para na sua manutenção e na sua compra quando uma permanente sua tem uma habilidade ativada que dá para usar naquele momento, como sacrificar Gnomos de Garrafa ou virar uma criatura para causar dano. Antes ele passava direto por essas etapas, e não dava para usar a habilidade antes de comprar. Habilidades de mana e cartas na mão não fazem o jogo parar ali, e quando não há nada para usar, ele continua passando direto.

### Corrigido

- **Nome da fase à vista.** O nome que aparece ao passar o mouse num ícone da trilha de fases ficava escondido atrás dos botões de ação. Agora ele aparece por cima deles.

## [0.44.0] - 2026-10-24

### Novo

- **Parar no turno do oponente.** Toque num ícone da trilha de fases, no canto da mesa, para escolher em quais etapas daquela fase o jogo deve parar no turno dos oponentes: manutenção, compra, as principais, cada etapa do combate ou a etapa final. A escolha vale para todos os oponentes. Nelas o jogo segura a prioridade com você, mesmo sem nada que dê para jogar e com **Passar respostas** ligado, e você passa quando quiser. Os ícones com etapa marcada ganham um ponto dourado, e a etapa em que o jogo está parado para você fica com um anel dourado. A escolha vale para a partida inteira e fica guardada no navegador.
- **Relógio da partida.** A trilha de fases, no canto da mesa, agora começa com um cronômetro que mostra há quanto tempo a partida está rolando, ao lado do tempo do turno. Ele é contado pelo servidor, então continua certo depois de recarregar a página ou voltar de uma queda de conexão. Numa melhor de três, ele conta o jogo atual.
- **O Anel te tenta.** Com as cartas de O Senhor dos Anéis, o jogador que o Anel já tentou ganha um selo dourado de anel ao lado do retrato, com quantas vezes foi tentado. Passando o mouse ou tocando no selo, aparece o que o Anel já faz: ele ganha uma habilidade a cada vez, até a quarta. A criatura escolhida como Portador do Anel tem um anel dourado no canto da carta, e o selo some dela quando outra criatura vira a portadora ou quando ela deixa o campo ou muda de controlador.
- **Masmorras na mesa.** Quem se aventura na masmorra (cartas de Dungeons & Dragons e a Undercity da iniciativa) ganha um selo de masmorra ao lado do retrato, com o passo em que está e quantos a masmorra tem. Tocando no selo, abre o mapa com todas as salas, o efeito de cada uma, a sala atual, as próximas possíveis e as masmorras já completadas. Na hora de escolher para qual sala ir, o mapa aparece e você toca na sala. Quem tem a **iniciativa** ganha um selo dourado que explica como ela funciona.
- **Novidades em imagens.** O painel **Novidades** ganhou o link **Ver as novidades em imagens**, que abre uma página com prints de como cada mudança aparece na mesa, versão por versão. Toque numa imagem para ampliar. As versões com imagens têm também um atalho **ver em imagens** ao lado do número.
- **Mutação à mostra.** Uma criatura mutada agora tem o selo **Mutada** na mesa, com quantas cartas a formam, e as bordas das cartas de baixo aparecem atrás dela. Inspecionando, aparece qual carta está por cima e quais estão embaixo, cada uma com a miniatura e o texto, já que a criatura tem as habilidades de todas. Tocando na miniatura, a carta abre em tamanho grande.

### Mudou

- **Exílio mais discreto.** As cartas do exílio que dá para jogar, ao lado direito da mão, ficaram menores e com contorno e brilho mais suaves, para não chamarem mais atenção que a própria mão.

### Corrigido

- **Criaturas preparadas à mostra.** Uma criatura preparada (como as de Strixhaven que "entram preparadas") agora tem o selo **Preparada** na mesa. Passando o mouse ou inspecionando, aparece qual feitiço dá para conjurar. O selo some quando a cópia é conjurada.
- **Feitiço preparado no exílio.** A cópia do feitiço que espera no exílio não aparece mais como "Ficha": o inspetor diz de qual criatura ela é, e o exílio a marca como **Preparado**.
- **Marcadores com nome em português.** Os marcadores de cartas como o Black Market (carga), as Sagas (saga), as cartas suspensas (tempo) e outros apareciam com o nome em inglês no balão da carta e no inspetor. Agora aparecem em português, como já apareciam ao proliferar. Na carta, o selo desses marcadores mostra só o ícone, e a quantidade aparece no balão ao passar o mouse ou tocar; os marcadores +1/+1 e −1/−1 continuam com o número à vista.
- **Sem números soltos depois do nome da carta.** O texto da pilha, das decisões, dos botões e do histórico às vezes mostrava um número entre parênteses depois do nome da carta, como "Lightning Bolt (123)". Era um código interno do jogo e não aparece mais.
- **Sem "undefined" nas palavras-chave.** O inspetor de algumas cartas, como as que entram preparadas, mostrava uma palavra-chave "undefined". Ela não aparece mais.
- **Enjoo de invocação até o próximo turno.** A criatura que acabou de entrar perdia o selo de enjoo e o visual apagado assim que o turno passava para o oponente. Agora ela continua marcada durante o turno do oponente e só fica pronta quando começa o próximo turno de quem a controla.

## [0.43.1] - 2026-10-24

### Corrigido

- **Capas dos decks Commander certas.** Ao abrir o jogo, vários decks Commander apareciam com a mesma capa (como Commander's Sphere ou Arcane Signet) até as cartas terminarem de carregar. Agora a capa é sempre a arte do comandante, e os comandantes são carregados antes do resto das cartas, então as capas aparecem bem mais rápido.

## [0.43.0] - 2026-10-24

### Novo

- **Comandante sugerido na importação.** Ao importar uma lista de 100 cartas num deck Commander sem a seção de comandante, se a primeira carta for uma criatura lendária, a revisão pergunta se você quer usá-la como comandante. Aceitando, ela vai para a zona de comando; recusando, fica no deck como estava.
- **Imagens das cartas guardadas no aparelho.** Uma carta que você já viu não é baixada de novo: a imagem fica guardada no navegador por até 90 dias, então a mesa abre mais rápido e gasta menos internet, inclusive no celular.

### Mudou

- **Botões da partida com o mesmo visual.** Os botões principais (OK, Confirmar, Passar, Fim de turno, Sim) têm o mesmo brilho dourado na barra de ação, nas perguntas e nas janelas de escolha. Um botão que ainda não pode ser usado fica escuro e apagado, igual ao "Aguardando…", em vez de um dourado acinzentado. O **Sim** e o **Não** das perguntas ficaram mais largos e fáceis de tocar.
- **Busca de sala pelo código mais protegida.** Depois de muitos códigos que não existem seguidos, a busca pede para esperar alguns minutos, com o aviso "Muitas tentativas com códigos que não existem". Assim ninguém consegue tentar códigos até achar a sala privada de outra pessoa. Quem digita o código certo nunca chega perto do limite.

### Corrigido

- **Terrenos dos oponentes inteiros no celular.** No Commander com três ou mais jogadores, os terrenos, artefatos e encantamentos em pé dos oponentes apareciam achatados, com a parte de cima e a de baixo da carta cortadas. Agora eles têm a altura certa da carta.

## [0.42.0] - 2026-10-24

### Novo

- **Procurando atualização.** Um anel gira em volta do ponto do botão **Novidades** enquanto o jogo confere se saiu uma versão nova, e gira mais rápido enquanto ela está sendo baixada. Quando termina, aparece o aviso de **Nova versão do jogo** de sempre.

### Mudou

- **Abas para entrar ou criar uma sala.** Jogando contra outra pessoa, a coluna da partida ficou mais curta: **Entrar numa sala** mostra as salas públicas e o campo do código, e **Criar sala** reúne os jogadores, a duração e se a sala é privada ou pública. O jogo lembra a última aba usada. Na aba de entrar, o botão de baixo espera você escolher uma sala.
- **Coluna da partida com um visual só.** Formato, oponente, jogadores, tipo de sala, campos e listas agora têm a mesma altura, os mesmos cantos e o mesmo destaque dourado no que está escolhido, com todos os títulos no mesmo estilo. As opções de oponente ficaram só com o nome, sem ícone, e o botão de jogar não quebra mais o texto em duas linhas.

## [0.41.0] - 2026-10-23

### Novo

- **20 novos decks prontos de Commander.** Chegam os comandantes mais populares do EDHREC nos últimos dois anos que ainda não estavam entre os decks prontos, deixando de fora os que têm verde: Oloro, Breya, Teysa Karlov, Zhulodok, Zurgo Stormrender, Arabella, Shorikai, Queen Marchesa, Urza, Terra, K'rrik, Kilo, Ghyrson Starn, Ragost, Norman Osborn, Eriette, Captain N'ghathrod, Alela, Magda e Obeka. Cada lista é o deck médio do EDHREC para o comandante, com as cartas que o oponente controlado pelo computador ainda não sabe jogar trocadas pela carta mais usada do mesmo tipo, então todos servem tanto para você quanto para os oponentes.
- **Preço dos decks prontos.** Na lista de decks e na escolha do deck da partida, os decks prontos com preço registrado mostram quanto custam as cartas em dólar, por exemplo "US$ 922,14". Passe o mouse sobre o valor (ou toque nele, na lista de decks) para ver o que ele significa: quanto custam as cartas pela edição mais barata de cada uma, e em que data foi feita a cotação. Por enquanto só os 20 decks novos de Commander têm preço; os outros chegam depois. Cópias de um deck pronto não levam o preço, já que podem ser mudadas.

### Mudou

- **"Passar respostas" virou um ícone também no computador.** A opção deixou de ocupar uma linha inteira embaixo dos botões: agora é o botão ⏩ ao lado do último botão, como no celular, dourado quando está ligada. Passe o mouse sobre ele para ver o que faz.

## [0.40.0] - 2026-10-23

### Novo

- **Terrenos virados num monte só, no celular.** Depois de pagar uma mágica, os terrenos virados se juntam numa pilha só, mesmo com nomes diferentes, com o total em **×N**. Toque no número para ver cada um. Os terrenos também continuam empilhados na hora de declarar ataque.
- **Segurar para ver.** No celular e no tablet, segure o dedo sobre qualquer carta para ver a carta inteira, inclusive no iPhone. Segurar não joga a carta nem a escolhe, e o toque rápido continua fazendo o de sempre.
- **Tempo de jogo no resultado.** A tela de vitória, derrota ou empate mostra quanto tempo o jogo durou, por exemplo "Turno 9 · 14:32 de jogo". Numa melhor de três, cada jogo conta o seu tempo.
- **Cor da mana nas escolhas.** Quando o jogo pede para escolher uma cor de mana ou qual habilidade de mana usar, cada opção mostra o símbolo da mana ao lado do nome.

### Mudou

- **Reserva de mana dentro do retrato.** A mana que sobra aparece sobre o retrato do jogador, que fica desfocado enquanto houver mana. Mana da mesma cor vira um símbolo só, com a quantidade ao lado (por exemplo, verde ×3), e cada cor fica numa linha. Pagando um custo, tocar no símbolo gasta uma de cada vez. No Commander com vários jogadores, a reserva dos oponentes fica abaixo do nome.
- **Artefatos e encantamentos antes dos terrenos.** Na fileira de trás, artefatos, encantamentos e outras permanentes que não são criaturas vêm primeiro. Com muitos terrenos, são os terrenos que ficam para rolar, e o resto continua à vista.
- **"Passar respostas" virou um ícone no celular.** Em vez de ocupar uma linha inteira embaixo dos botões, a opção é um botão ⏩ ao lado do último botão, dourado quando está ligada. No computador continua com o texto.
- **Desvirar só com o ícone.** No terreno virado cuja mana ainda não foi gasta, o selo de desvirar mostra só a seta ↺, sem o texto.
- **Terrenos menores no celular.** A fileira de terrenos ficou mais baixa, e as criaturas ficam com mais espaço na mesa.
- **Mesa sem lupa no celular.** A lupa cobria boa parte das cartas na mesa, na mão e na zona de comando. Para ver uma carta, segure o dedo sobre ela. As cartas do oponente abrem também com um toque. Na escolha da mão inicial, a lupa continua.
- **Terrenos não empurram mais as criaturas no Commander pelo celular.** Quando terrenos e criaturas ficam lado a lado, os terrenos ocupam no máximo pouco mais de um terço da largura. Se não couberem, a fileira rola. Sem criaturas em campo, os terrenos usam a largura toda.

### Corrigido

- **Selo de enjoo de invocação em dobro.** Em alguns aparelhos o selo da criatura que acabou de entrar aparecia com dois emojis. Agora é um desenho próprio, igual em todo aparelho: estrelinhas girando em volta, como quem ficou tonto. Com a opção de reduzir movimento do sistema ligada, elas ficam paradas.
- **Terrenos escondidos atrás dos botões no celular.** No duelo pelo celular, a sua fileira de terrenos passava por baixo de "Para o combate" e "Fim de turno", e as últimas cartas ficavam escondidas sem dar para rolar até elas. Agora a fileira termina antes dos botões e rola.

## [0.39.1] - 2026-10-23

### Corrigido

- **Servidor ocupando cada vez mais memória.** Cada partida terminada continuava ocupando memória no servidor até ele ser reiniciado, e com o tempo ele podia cair no meio de uma partida. Agora a memória é liberada quando a partida acaba.

## [0.39.0] - 2026-10-22

### Novo

- **Aviso de que é o seu turno.** Fez sua jogada e foi para outra aba ou minimizou o navegador? Quando o seu turno começar, o título da aba pisca **Seu turno!** até você voltar para a mesa.
- **Notificação do sistema.** Em **Opções**, ligue **Notificar quando for seu turno** para receber também um aviso do computador ou do celular. Na primeira vez, o navegador pede permissão. Tocar no aviso traz a mesa de volta.

## [0.38.2] - 2026-10-22

### Corrigido

- **Nome em português que serve para duas cartas.** Na importação de lista, um nome como "Expulsar" (que é tanto Cast Out quanto Expel) não vira mais a primeira carta encontrada sem aviso. A revisão mostra o nome com as opções, o deck fica como rascunho e a partida só começa depois de você trocar pelo nome em inglês da carta certa.

## [0.38.1] - 2026-10-22

### Corrigido

- **Partida que caía com alguns decks.** Com certos decks, principalmente de Commander, a partida podia travar e cair na hora em que voltava a ser a sua vez de agir, por exemplo logo depois do dano de combate. Isso acontecia mais com comandantes de duas faces, cartas com Disfarce e cartas que se conjuram do cemitério, como as liberadas pelo Underworld Breach. O destaque das cartas que você pode jogar do cemitério, do exílio e da zona de comando continua igual, sem derrubar a partida.

## [0.38.0] - 2026-10-22

### Novo

- **Relógio do turno.** Na trilha de fases, ao lado do número do turno, um relógio mostra há quanto tempo o turno atual está rolando (por exemplo **0:42**). Ele zera a cada turno novo, seja o seu ou o do oponente, e some quando a partida termina.

## [0.37.0] - 2026-10-22

### Novo

- **Desvirar o que você virou para mana.** Virou uma criatura ou um terreno para gerar mana e ainda não gastou essa mana? A carta mostra **↺ Desvirar**: um toque nela desvira a carta e tira da reserva a mana que ela gerou. Dá para escolher qual carta desvirar, mesmo que não seja a última que você virou. Depois que a mana é gasta (ou a fase muda), a carta fica virada como de costume.

## [0.36.0] - 2026-10-22

### Mudou

- **Barra de configuração da partida sempre ao alcance.** Em telas mais baixas, as opções de formato, oponente e sala rolam dentro da própria barra, e o resumo com o deck escolhido e o botão **Jogar** (ou **Criar sala**) fica sempre visível embaixo. Não é mais preciso rolar toda a lista de decks para chegar ao botão.
- **Jogar com outra pessoa mais claro.** As opções agora aparecem em dois blocos: **Entrar numa sala**, com as salas públicas e o campo do código, e **Ou crie a sua sala**, com a escolha entre privada e pública. O botão ao lado do código passou a se chamar **Entrar**.

## [0.35.0] - 2026-10-22

### Novo

- **Salas públicas.** Ao criar uma sala para jogar com outra pessoa, escolha **Privada** ou **Pública**. A privada continua como sempre: só entra quem tiver o código. A pública aparece para todo mundo na tela inicial.
- **Lista de salas abertas.** Em **Outra pessoa**, a seção **Salas públicas** mostra quem está esperando, o formato e quantos lugares já foram ocupados. A lista se atualiza sozinha e também pelo botão **Atualizar**. Um toque em **Entrar** coloca você na sala, com as mesmas regras de entrar pelo código: precisa ter lugar, a partida não pode ter começado e o deck tem que servir para o formato da sala.

## [0.34.0] - 2026-10-22

### Novo

- **Proliferar sem confusão.** Ao proliferar, aparece uma lista com tudo que pode ganhar marcadores, separada em **Te ajuda** (verde ▲), **Te prejudica** (vermelho ▼) e **Ajuda e prejudica**. A conta é feita do seu lado: um −1/−1 na criatura do oponente ou o veneno dele aparecem como bons para você; a lealdade do planeswalker dele ou o seu próprio veneno, como ruins. Cada linha mostra o número antes e depois (por exemplo "+1/+1 2→3"), e o veneno que chegaria a 10 avisa "perde a partida".
- **Só o que me ajuda.** Um toque marca de uma vez tudo que só te favorece; **Limpar** desmarca tudo. Também dá para marcar tocando na carta ou no retrato do jogador, e no campo cada um ganha um contorno na cor do efeito.
- **Aviso antes de confirmar.** Se você marcou algo que te prejudica, o painel avisa. O botão diz **Proliferar (N)** ou **Não proliferar**, e a escolha só vale quando você confirma: marcar todos não confirma mais sozinho.

### Corrigido

- **Proliferar com jogadores e permanentes juntos.** Quando havia marcadores em jogadores e em permanentes ao mesmo tempo, não dava para escolher os jogadores nem ver o que já estava marcado.

## [0.33.0] - 2026-10-22

### Novo

- **Créditos, aviso legal e contato.** No fim da tela inicial há um rodapé com os créditos de quem faz o jogo funcionar (Scryfall, Moxfield, Archidekt e as fontes), o aviso de que a Mesa de Duelo é conteúdo de fã gratuito, sem nenhum vínculo com a Wizards of the Coast, e o WhatsApp para contato: (33) 92000-1670.
- **Virar cartas de duas faces na lista do deck.** Ao ver um deck ou ler uma carta (no preview, na prévia ao passar o mouse e na carta ampliada), as cartas de dupla face e que se transformam ganham o botão **Ver o verso**, que gira a carta e mostra a outra face. As cartas flip de Kamigawa ganham **Girar a carta**, que vira a imagem de cabeça para baixo para ler a outra metade.

## [0.32.0] - 2026-10-22

### Novo

- **Enviar sugestão ou erro de dentro do jogo.** Na tela inicial (no topo, ao lado de **Novidades**) e no menu da partida há o botão **Enviar sugestão ou erro**. Escolha **Sugestão** ou **Algo deu errado**, conte o que aconteceu e envie: você recebe um código, como "Relato R-7K2Q enviado", para citar depois. O formulário diz antes o que vai junto: o texto, a versão do jogo e o tipo de aparelho. Nada de e-mail, conta ou IP.
- **Mandar a partida junto.** Marcando **Anexar a partida**, o relato leva as jogadas que você viu, o seu deck e os apelidos dos jogadores, para conseguirmos repetir na mesa o que aconteceu e conferir a correção. Vem marcado quando é um erro durante a partida e desmarcado numa sugestão, e mostra o tamanho antes de enviar. A última partida fica guardada no aparelho, então dá para relatar da tela inicial depois que ela acabou ou depois de recarregar a página.
- **Relatar este erro.** O painel **Erros da partida** ganhou um botão que abre o formulário já como erro, com a partida e a lista de erros juntas.
- **Relato guardado sem internet.** Sem conexão ou com o servidor fora do ar, o relato fica guardado no aparelho e é enviado sozinho quando a conexão voltar.

## [0.31.0] - 2026-10-22

### Novo

- **Cartas no estilo Arena.** Em **Menu › Aparência das cartas** há a nova opção **Arena**: as permanentes no campo mostram só a arte, ocupando a carta inteira, dentro de uma moldura na cor da carta. Quando a permanente tem poder/resistência, lealdade ou marcadores, a moldura se alarga embaixo num rodapé com esses números. A moldura muda com o tipo: criaturas na cor da carta, planeswalkers escuros com filete dourado, encantamentos claros com pontos de luz, artefatos em metal escovado e terrenos em pedra. Criaturas e fichas ficam quadradas, e as fichas têm o topo arredondado. Na mão, nas escolhas e na pilha as cartas continuam com a imagem completa, e o texto inteiro segue no inspetor.

### Mudou

- **Enjoo de invocação mais fácil de ver.** Além de um pouco apagadas, as criaturas com enjoo agora ficam com a imagem levemente borrada, e o selo de enjoo trocou o zZ por um emoji tonto 😵‍💫. O selo e os números continuam nítidos.
- **Ícone de alcance.** O ícone de alcance nas cartas do campo agora é um arco e flecha.
- **Quem não pode atacar ou bloquear.** Criaturas impedidas por um efeito de atacar ganham uma espada riscada de vermelho, e as impedidas de bloquear ganham um escudo riscado, nos selos da borda esquerda da carta, junto com vigilância e atropelar. A corrente embaixo da carta continua.
- **Sem lâminas no canto da carta.** Criaturas com iniciativa ou golpe duplo não mostram mais os traços brancos no canto de cima da carta; essas habilidades continuam nos ícones de palavras-chave.

### Corrigido

- **Cartas cortadas na linha do meio da mesa.** Criaturas declaradas atacantes sobem em direção ao oponente e tinham o topo cortado; nas partidas com vários oponentes, as cartas do fim do campo deles também eram cortadas pela linha que divide a mesa. Agora elas passam por cima da linha, inteiras.
- **Selos e efeitos cortados nas cartas do campo.** Os selos de enjoo e do número do ataque ficavam com o topo cortado; agora aparecem dentro da carta, no alto. Marcas, selos de proteção e outros efeitos que saem um pouco da carta também deixaram de ser cortados.

## [0.30.0] - 2026-10-21

### Novo

- **Vigilância e atropelar visíveis na carta.** Criaturas com vigilância ganham um olho e as com atropelar ganham pegadas, em selos pequenos na borda esquerda da carta. Ao atacar com vigilância, a carta continua de pé e o olho dá um brilho rápido.
- **Vida contando.** Quando a vida de um jogador muda, o número conta até o novo valor, verde ao subir e vermelho ao descer, com um pulso no retrato.
- **Tipo da carta virada para baixo.** O selo "2/2" das permanentes viradas para baixo agora diz como ela entrou assim: **Metamorfose**, **Disfarce**, **Manifestada** ou **Encoberta**.

### Mudou

- **Janelas de escolha saem com animação.** Ao responder, a janela some aos poucos em vez de desaparecer de uma vez.
- **Botão Jogar sempre à vista no celular.** Na tela inicial, o deck escolhido e o botão **Jogar** ficam presos no rodapé, em pé ou deitado. Antes era preciso escolher o deck lá embaixo na lista e voltar para o topo para começar a partida; deitado, o botão nem aparecia na tela.
- **Detalhes da carta melhores no celular deitado.** Ao ampliar uma carta, a imagem ocupa a altura toda da tela à esquerda, e o nome, o texto e os detalhes ficam ao lado. Antes, o título largo em cima empurrava a carta para fora da tela.
- **Mais espaço para os seus decks.** As informações das cartas que o jogo guarda no aparelho (texto, tradução e imagens a mostrar) agora ficam num armazenamento separado, sem disputar espaço com os decks salvos. As que já estavam guardadas passam para lá sozinhas na primeira vez que você abrir o jogo.
- **Cores do deck sobre a arte.** Na escolha de deck da tela inicial e em **Meus decks**, os símbolos das cores ficam no canto inferior esquerdo da imagem do deck, num selo com fundo desfocado, deixando o nome e a quantidade de cartas mais limpos embaixo. Em **Meus decks**, a etiqueta "Seu deck" ou "Deck pronto" foi para o canto de cima.
- **Permanentes assentam ao entrar.** Terrenos e outras permanentes dão um pequeno "assentar" quando chegam ao campo, e fichas surgem com um brilho.

Tudo isso fica parado com "reduzir movimento" do sistema.

### Corrigido

- **Filtros de Meus decks no celular.** Em pé, os rótulos "Buscar deck" e "Formato" ficavam um sobre o outro e o campo de busca ficava espremido. Agora a busca ocupa a linha toda, com o formato e as cores embaixo.

## [0.29.1] - 2026-10-21

### Corrigido

- **Comandante no cemitério ou no exílio: botões com o destino.** Quando o seu comandante ia para o cemitério ou o exílio, às vezes a pergunta aparecia na caixa de ação com o texto da regra em inglês e os botões **Sim** e **Não**. Agora ela diz onde ele está e os botões são **Zona de comando** e **Cemitério** (ou **Exílio**).

## [0.29.0] - 2026-10-20

### Mudou

- **Saiu o deck médio do EDHREC.** A busca do deck médio não funcionava direito e foi retirada: o bloco **Deck médio do EDHREC** na importação de Commander, o botão **Usar o deck médio do EDHREC** ao lado do comandante e os links do EDHREC no campo da lista não existem mais. Para importar por link, use um deck público do Moxfield ou do Archidekt, ou cole a lista em texto. Os decks que você já montou com ele continuam salvos como estão.

## [0.28.1] - 2026-10-20

### Corrigido

- **Botões com o destino do comandante.** Quando o comandante pode ir para a zona de comando, os botões agora dizem os dois lugares: **Zona de comando** ou **Cemitério**, **Zona de comando** ou **Exílio**, **Zona de comando** ou **Mão** (e **Grimório**). Quando ele iria para a mão ou o grimório, a pergunta aparecia com o texto da regra em inglês e os botões **Sim** e **Não**; agora diz em português para onde ele iria.

## [0.28.0] - 2026-10-20

### Novo

- **Votação para pular o turno de quem caiu.** Numa sala, quando alguém perde a conexão, aparece uma faixa avisando quem caiu, com o botão **Votar para pular o turno**. Só votam os jogadores que estão online, e a votação passa com a maioria deles (sozinho online, o seu voto decide). Cada um responde **Sim** ou **Não** e vê a contagem. Aprovada, a mesa passa a vez no lugar da pessoa desconectada, sem jogar nada, sem atacar e sem bloquear, até o fim do turno dela. Se ela voltar antes, joga normalmente.

### Mudou

- **Quem desiste sai da mesa.** No Commander com vários jogadores, quem desiste (pelo menu ou saindo da sala) some da mesa: as cartas dessa pessoa já saíam do jogo, e agora o assento vazio também deixa de aparecer, abrindo espaço para os outros. Quem perde jogando continua com o assento à vista, marcado como eliminado.

## [0.27.0] - 2026-10-20

### Novo

- **Filtro de cores nas listas de decks.** Na escolha do deck da tela inicial e em **Meus decks** há agora um botão para cada cor (branco, azul, preto, vermelho e verde) e um para incolor. Marque quantas quiser: a lista mostra os decks que têm todas as cores marcadas, e cada cor a mais estreita a busca. **Incolor** mostra só os decks sem cor. **Limpar cores** volta a mostrar tudo, e o filtro funciona junto da busca por nome. Na tela inicial, a busca e as cores ficam agora no topo da lista de decks, e não mais embaixo.

### Mudou

- **Comandante nos cartões de deck.** Os decks de Commander mostram o comandante embaixo do nome, com uma coroa (os dois nomes, no caso de parceiros), nas duas listas. A busca também acha o deck pelo nome do comandante.

## [0.26.0] - 2026-10-20

### Mudou

- **Menos avisos na escolha de deck.** Os decks que ainda vão ser verificados quando a partida começar não mostram mais a etiqueta "Verificar … ao jogar". Os avisos "Válido para …", "Precisa de ajustes" e "Incompatível com o formato" continuam.
- **Botões com ícones no fim da partida.** **Início** ganhou um ícone de casa e **Ver campo de batalha**, um ícone de olho.

## [0.25.0] - 2026-10-20

### Novo

- **Setas de ataque.** Nas partidas com mais de um oponente, cada criatura atacando ganha uma seta vermelha até o jogador que ela ataca, então dá para ver de relance quem está indo em quem. Ataques a planeswalkers também ganham seta, em qualquer partida. As setas aparecem já enquanto você escolhe os atacantes e, quando a criatura é bloqueada, a seta dela fica mais apagada, ao lado da seta dourada do bloqueio.

## [0.24.0] - 2026-10-20

### Novo

- **40 novos decks prontos de Commander.** Agora os 50 comandantes mais populares do EDHREC nos últimos dois anos estão entre os decks prontos: aos 10 que já estavam (Y'shtola, Edgar Markov, Atraxa, Krenko, Vivi, Sauron, Giada, Pantlaza, Lathril e Ms. Bumbleflower) se juntam The Ur-Dragon, Kaalia, Teval, Azula, Toph, The Wise Mothman, Jodah, Cloud, Hearthhull, Nekusar, Kefka, Kenrith, Yuriko, Sephiroth, Isshin, Baylen, Valgavoth, Miirym, Chatterfang, Ulalek, Hashaton, Frodo e Sam, Ashling, Esika, Bello, Hakbal, Muldrotha, Rin e Seri, Glarb, Animar, Arcades, Maralen, Aragorn, Mr. House, Kuja, Ygra, Caesar, Flubs, The Necrobloom e Wilhelt. Cada lista é o deck médio do EDHREC para o comandante, com as cartas que o oponente controlado pelo computador ainda não sabe jogar trocadas pela carta mais usada do mesmo tipo, então todos servem tanto para você quanto para os oponentes.

## [0.23.0] - 2026-10-20

### Novo

- **Moer animado.** Quando cartas vão do topo do grimório direto para o cemitério, elas saem uma a uma, viram de face para cima no ar e caem no cemitério. Junto ao grimório aparece quantas saíram (como "−4"). O histórico e o leitor de tela dizem quem moeu, qual mágica ou habilidade mandou moer e quais cartas foram (por exemplo, "Oponente moeu 3 cartas com …: Elfos de Llanowar, Contramágica e Crescimento Desenfreado"). Quando a carta vai para o cemitério por vidência, o aviso diz isso em vez de "moeu". Com 10 cartas ou mais, elas saem mais rápido e abertas em leque, sem segurar a partida. Com "reduzir movimento", só o cemitério ganha destaque.

### Corrigido

- **"Seu grimório" em vez de "você's grimório".** Alguns pedidos do jogo usavam o possessivo do inglês, como "Procurar você's grimório?" e "Olhando as cartas em Oponente's mão". Agora eles aparecem como "Procurar seu grimório?" e "Olhando as cartas na mão de Oponente", nas perguntas, nos pedidos e nos avisos.
- **Comandante removido: botões dizem para onde ele vai.** Quando seu comandante ia para o cemitério ou o exílio, a pergunta mostrava o texto da regra em inglês, com **Sim** e **Não**. Agora ela diz onde ele está ("… está no cemitério") e os botões são **Enviar à zona de comando** e **Manter no cemitério** (ou **Manter no exílio**).
- **Botão de bloqueio diz o que vai acontecer.** Na hora de bloquear, o botão dizia **Confirmar bloqueios** mesmo sem nenhuma criatura escolhida para bloquear. Agora, sem bloqueadores, ele diz **Sem bloqueio**; com bloqueadores, mostra quantos (**Confirmar 1 bloqueador**, **Confirmar 2 bloqueadores**), como já acontece no ataque.

## [0.22.0] - 2026-10-20

### Novo

- **Escolha quais oponentes ver.** No Commander com três ou mais jogadores, cada oponente tem **Ocultar** e **Só este** no alto do campo. O oculto vira uma coluna estreita com vida, mão, marcadores, dano de comandante e as pilhas, e **Mostrar campo** traz o campo de volta. Com **Só este**, o campo daquele oponente fica largo, com os terrenos ao lado das criaturas, e **Ver todos** volta ao normal. Quem estiver atacando você, ou tiver uma carta que você precisa escolher, volta à vista sozinho com o aviso "À vista: …". A escolha vale até o fim da partida.
- **Compra animada.** Quando alguém compra, o verso da carta sai do grimório e voa até a mão. Na sua mão, a carta nova só aparece quando o verso chega, e vira de face para cima. Numa compra de várias cartas, elas saem uma atrás da outra. A mão inicial e os mulligans continuam com a apresentação de sempre.
- **Descarte animado.** A carta descartada sai da mão já de face para cima e cai no cemitério, com aviso no histórico ("Oponente descartou…") e para o leitor de tela. Vale para descartar no fim do turno, reciclar e qualquer outro descarte.
- **"Alvo de" na pilha.** Ao passar o mouse (ou o foco do teclado) sobre um item da pilha, as setas dele ficam em destaque e as dos outros recuam, e cada alvo ganha a etiqueta **Alvo de** com o nome da mágica ou habilidade. Funciona também ao contrário: apontar para uma carta ou um jogador alvejado destaca o item da pilha que mira nele.
- **Erros da partida.** No menu da partida, **Erros da partida** lista os avisos de erro, as ações que o servidor ignorou (como um clique num pedido que já tinha mudado), as quedas de conexão e as falhas da própria mesa, com hora e turno. Um número vermelho no menu avisa quando há erros novos, e **Copiar relatório** junta tudo num texto para relatar um problema.
- **Passar respostas.** Abaixo dos botões de prioridade há a caixa **Passar respostas**. Marcada, a mesa passa sozinha no turno do oponente e quando há algo na pilha, mesmo com instantâneas na mão. Seu turno, ataques, bloqueios e escolhas continuam parando. Ela fica à vista também com o oponente jogando, para desmarcar quando quiser responder de novo, e a escolha fica guardada para as próximas partidas.

- **Fica claro quando a partida espera por você.** Quando o jogo para por uma decisão sua (sacrificar uma criatura, escolher um alvo, descartar, mover o comandante para a zona de comando), aparece um aviso **Sua decisão** no meio da mesa com o que fazer, e a caixa de ação ganha uma moldura dourada. Com cartas para escolher, o resto da mesa escurece e as cartas que você pode escolher ficam em destaque. Perguntas de sim ou não abrem no centro da tela, em vez de ficarem no canto. Se a decisão ficar parada por alguns segundos, o aviso pulsa de novo, com um som discreto se os efeitos sonoros estiverem ligados. A passagem de prioridade, os ataques e os bloqueios continuam como antes, sem o aviso.
- **"Aguardando Ana escolher…".** Quando outro jogador da sala está decidindo algo, a mesa mostra quem ela está esperando: escolhendo, declarando atacantes ou declarando bloqueadores. Assim ninguém acha que a partida travou.

### Mudou

- **Criaturas maiores.** No computador, as criaturas no campo ficaram maiores, mais fáceis de ler sem abrir a carta: cerca de 17% no duelo e 20% a 25% no Commander com três ou mais jogadores, no seu campo e nos dos oponentes. Com menos oponentes à vista, as criaturas deles crescem ainda mais. Os terrenos continuam do mesmo tamanho, e a mesa segue cabendo sem rolar.
- **Você pode responder no fim do turno do oponente.** Antes, no turno do oponente, a mesa só parava para você depois dos bloqueios, então não dava para usar uma instantânea na etapa final dele, logo antes do seu turno. Agora ela também para na etapa final e logo depois dos ataques dele, se houver atacantes. Com **Passar automaticamente** ligado (o padrão), essas paradas só acontecem quando você tem algo que pode usar naquela hora, como uma instantânea e mana para pagá-la. Com ele desligado, a mesa para sempre.
- **Cards de deck com novo visual na tela inicial.** O formato do deck agora aparece como uma etiqueta no rodapé do card (como **Livre**), e o olho e o botão **Editar** deram lugar a um menu **⋮** no canto: ele traz **Ver as cartas** e, nos seus decks, **Editar**. O menu fecha ao clicar fora ou com Esc.
- **Gerenciar decks na tela inicial.** Os botões **Importar lista** e **Criar deck** de **Meus decks** deram lugar a um único **Gerenciar decks**, que leva à sua coleção (onde também dá para importar listas). Para começar um deck novo, use o card vazio **Criar deck**, sempre no fim dos seus decks.

### Corrigido

- **Aviso de deck vazio inteiro em telas largas.** Em monitores largos, o aviso "Deck vazio." de um deck novo aparecia partido em duas colunas, com o texto de um lado e os botões **Adicionar cartas** e **Importar lista** do outro. Agora ele aparece como um bloco só.

## [0.21.0] - 2026-10-19

### Novo

- **Você distribui o dano em bloqueios duplos.** Quando sua criatura atacante é bloqueada por duas ou mais criaturas, ou tem atropelar, abre uma janela com o atacante e o dano total, cada bloqueador com o dano que o mata (**Letal: 2**, ou 1 com toque mortífero) e o jogador defendido como destino do excesso por atropelar. Use **−** e **+**, o botão **Letal** em cada bloqueador e **Todo o resto** no jogador. Ela já abre com a divisão automática pronta, então basta **Confirmar dano** se ela servir. O jogador só pode receber dano depois que todos os bloqueadores tiverem dano letal, e a janela diz o que falta. Antes, o jogo dividia sozinho.

## [0.20.1] - 2026-10-19

### Corrigido

- **Coroa do comandante igual em todas as telas.** No computador, o selo do comandante trazia a palavra "Comandante" e ficava mais largo que a própria carta. Agora, em qualquer tela, o comandante no campo mostra só a coroa dourada no canto, um pouco maior, junto do contorno dourado. O nome continua na dica ao passar o mouse e no leitor de tela.
- **Coroa aparece também com um servidor de partida mais antigo.** Se o servidor da partida ainda não tivesse sido atualizado, a coroa não aparecia. Agora a mesa também reconhece o comandante pela lista de comandantes de cada jogador.

## [0.20.0] - 2026-10-19

### Novo

- **Resolver todos.** Com dois ou mais itens na pilha, a caixa de ação mostra **Resolver todos**, com o total, ao lado de **Resolver**. Um clique deixa a pilha inteira resolver sem precisar passar a vez a cada item. Se alguém acrescentar algo à pilha ou o jogo pedir uma escolha sua, como um alvo ou a ordem de gatilhos, a vez volta para você.
- **Comandante marcado no campo.** No Commander, o comandante de cada jogador, quando está no campo de batalha, ganha uma coroa dourada no canto com a palavra **Comandante** e um contorno dourado, para achá-lo de relance entre as outras permanentes. No celular fica só a coroa. Leitores de tela anunciam "comandante" junto do nome.

## [0.19.0] - 2026-10-19

### Novo

- **Deck de Commander a partir do deck médio do EDHREC.** Na importação de deck, no formato Commander, escreva o nome do comandante (em português ou inglês; para dois, separe com +) e toque em **Usar o deck médio do EDHREC**: a lista chega montada com as cartas mais usadas nos decks publicados para ele e passa pela revisão de sempre, com as cartas não reconhecidas e o comandante na zona de comando. Num deck de Commander que já tem comandante, o mesmo botão aparece ao lado dele; se o deck já tiver cartas, você escolhe entre adicionar e substituir. A revisão mostra de onde veio a lista, quantos decks entraram na média e até que data, e lembra que é uma média, não uma lista testada.
- **Links do EDHREC na importação.** O campo da lista aceita também o link do deck médio ou da página de um comandante no EDHREC (inclusive as versões econômica e temáticas).
- **Espaço para passar.** Na partida, a barra de espaço aperta o botão de passar da caixa de ação: **OK**, **Resolver**, **Para o combate** e afins. O atalho **Fim de turno** continua só no clique, para você não encerrar o turno sem querer. Com uma janela aberta ou com o foco numa carta ou num botão, o Espaço faz o de sempre.

### Mudou

- **Imagens do deck importado já ficam prontas.** Depois de salvar um deck importado (por link ou lista colada), as imagens das cartas, das duas faces e na versão em português quando existe, são baixadas aos poucos em segundo plano. Assim a primeira partida com o deck já abre com as cartas desenhadas.
- **Decks não escolhidos com um círculo vazio.** Na escolha do deck, o escolhido continua com o check dourado e os outros agora mostram um círculo vazio no mesmo canto, para deixar claro que dá para marcá-los. Ao passar o mouse, o check aparece de leve.
- **Adicionar uma lista não duplica o comandante.** Ao somar uma lista a um deck que já tem o mesmo comandante, ele continua com uma cópia só na zona de comando.

## [0.18.0] - 2026-10-19

### Novo

- Dano no estilo do Arena: mágicas e habilidades que causam dano soltam um projétil com rastro da carta (ou da pilha) até o alvo, com um impacto na chegada.
- No combate, o atacante avança até o bloqueador ou até o retrato do defensor e volta; o bloqueador revida do mesmo jeito.
- O número de dano salta sobre o alvo, maior quando o dano é grande; perto do topo da tela ele desce, para não sumir.
- Selos no golpe: "Iniciativa", "1º golpe" e "2º golpe" (golpe duplo), "Atropelar" no excesso que passa para o jogador, "Comandante" e "Vínculo com a vida".
- Toque mortífero mostra uma caveira na criatura atingida; murchar e infectar mostram "−N/−N" e "+N veneno" em roxo; dano a planeswalker aparece em laranja, como lealdade perdida.
- Ganhar vida (vínculo com a vida ou qualquer outro efeito) mostra "+N" verde subindo do retrato.
- Golpe letal: a criatura treme e escurece antes de ir para o cemitério; dano grande ou que zera a vida faz a mesa tremer de leve.
- Com "reduzir movimento" ligado no sistema, só aparecem o número e o destaque no alvo, sem projéteis nem tremor.
- O histórico diz de onde veio o dano e o que mudou o golpe ("Oponente sofreu 4 de dano de Colossal Dreadmaw (Atropelar)").
- Dano prevenido por um escudo ("previna os próximos 3") aparece como um domo azul com o número riscado.
- Dano dividido entre vários alvos: os projéteis saem juntos da mesma mágica, cada um com o seu número.
- Sons novos para ganhar vida, veneno e −1/−1, escudo de prevenção e carta destruída.
- Cada saída do campo tem o seu movimento: destruída racha e solta fragmentos, sacrificada afunda, exilada se desfaz em luz, devolvida voa para a mão; uma carta que volta do exílio (blink) reaparece no mesmo lugar, com um anel de luz.
- Virar e desvirar têm peso: a carta passa um pouco do ponto e assenta; desvirar várias de uma vez vai em onda.
- Gatilhos e habilidades ativadas soltam um feixe da carta até cada alvo (roxo para gatilho, dourado para habilidade).
- As permanentes mostram o que as protege ou muda o tempo todo, na borda da carta e sem cobrir nome, custo nem P/T: brilho de resistência à magia, manto, vínculo com a vida e marcadores; moldura de indestrutível, proteção, ameaçar, defensor e fichas; selos com o custo da proteção contra alvos ("Ward {2}"), de que a proteção protege e quanto dano o escudo ainda previne; lâminas de iniciativa e golpe duplo; fumaça de toque mortífero; corrente em quem não pode atacar ou bloquear; mira em quem é alvo de algo na pilha; carta fora de fase translúcida; carta encantada com o brilho da cor da aura.
- Voar ficou mais claro: a carta flutua um pouco acima da própria sombra.
- Criaturas com enjoo de invocação ficam levemente apagadas no turno de quem as controla.

## [0.17.1] - 2026-10-19

### Corrigido

- **Faixa do topo mais baixa também no computador.** A faixa com o menu, a tela cheia e o retrato do oponente só tinha encolhido no celular. Agora, em qualquer tela, o retrato do oponente fica deitado, com a vida, o nome e os marcadores lado a lado, e a faixa ocupa metade da altura de antes. Os campos ganham esse espaço, e as pilhas do oponente começam logo abaixo da faixa. No Commander com vários jogadores nada muda.
- **"Para o combate extra" também na principal 1.** Com um combate extra marcado para logo depois da principal 1 (Relentless Assault conjurado antes do combate), o botão de passar dizia só "Para o combate". Agora diz **Para o combate extra**, como já fazia na principal 2.
- **Botões de ação menores no celular, fora de cima das cartas.** **Para o combate**, **Fim de turno** e os outros botões ficaram mais baixos e estreitos no celular, e a fileira de baixo do seu campo agora termina antes deles: com muitas permanentes, ela rola para o lado em vez de passar por baixo dos botões. Vale para o 1×1 e para o Commander.

## [0.17.0] - 2026-10-18

### Novo

- **Marcadores de radiação e contrato no jogador.** A radiação ganhou selo próprio, amarelo com o símbolo de radiação, ao lado do retrato. Passe o mouse ou toque no selo para ver o que ela faz: no começo da fase principal antes do combate, as cartas do topo vão para o cemitério e cada uma que não for terreno custa 1 de vida e tira 1 marcador. Os marcadores de contrato também aparecem.

### Mudou

- **Cada marcador de jogador com ícone, cor e explicação.** Veneno, radiação, energia, experiência, tíquete e contrato mostram um ícone e o número, em vez de uma abreviação. Ao passar o mouse ou tocar, um balão diz o nome e o que o marcador faz; o veneno lembra quantos faltam para 10. Quando um número muda, o selo pulsa uma vez. No celular e no Commander com vários jogadores, os selos ficam no mesmo lugar de antes.

## [0.16.0] - 2026-10-18

### Novo

- **Nível dos encantamentos de Classe à vista.** Uma Classe no campo mostra um selo com o nível atual e o máximo, como **Nv 2/3**. O inspetor diz o nível e avisa quando ele já é o máximo, e leitores de tela anunciam o nível junto do nome da carta. Ao subir de nível, a opção aparece como **Subir para o nível 2** (ou 3), com o custo em símbolos de mana.

## [0.15.0] - 2026-10-18

### Novo

- **Ordene seus gatilhos vendo as cartas.** Quando vários gatilhos seus disparam juntos, eles aparecem lado a lado como cartas, cada uma com o texto do que disparou. A da esquerda resolve primeiro e cada posição vem numerada. Toque nos gatilhos na ordem que quiser, ou arraste para trocar de lugar; **Desfazer** volta o último passo e **Ordem automática** resolve sem escolher. Gatilhos iguais da mesma carta ganham um selo ×2 ou ×3, mas continuam separados na pilha. Dá para inspecionar cada carta e usar **Ver a mesa** antes de decidir. Pelo teclado, as setas movem o gatilho e a posição é anunciada.
- **Escolha como jogar uma carta vendo a carta.** Quando uma carta pode ser jogada de mais de um jeito, ela aparece grande com cada opção ao lado: **Conjurar**, **Reciclar**, **Tramar**, **Flashback**, **Evocar**, **Aventura** e outras, com o custo em símbolos de mana, custos extras por extenso (como sacrificar uma criatura ou pagar vida) e uma linha do que acontece. O jeito normal fica em destaque, e **Cancelar** volta para a mesa sem jogar nada. Habilidades de uma permanente aparecem do mesmo jeito.
- **Turnos extras e combates extras à vista.** Um turno extra começa com a faixa **Turno extra** e o número do turno ganha um "+" na trilha de fases. Ao passar o mouse no número, a dica avisa os turnos extras que ainda vêm ("Depois: turno extra seu"). Um combate extra abre com a faixa **Combate extra**, o ícone do combate mostra quantos combates o turno tem (×2, ×3) e o botão de passar diz **Para o combate extra** quando é para lá que o jogo vai.

### Mudou

- **Barra do topo mais útil na partida.** Ao lado do menu aparecem o formato, o código da sala, o placar da melhor de três (como "Jogo 2 · 1 × 0") e um aviso quando o oponente cai da conexão, sem precisar abrir o menu. No Commander com vários jogadores, essas informações continuam no menu para não apertar os assentos.
- **Mais mesa no celular.** Com o celular deitado, a faixa do topo ficou bem mais baixa: o retrato do oponente fica deitado, com a vida ao lado, e o menu mostra só o ícone. As criaturas e os terrenos de cada lado cabem sem rolar.

### Corrigido

- **"Fim de turno" não pula mais um combate extra.** Com um combate extra ainda por vir no seu turno, o atalho **Fim de turno** some até esse combate acontecer, para você não perder o ataque sem querer.
- **Os mesmos gatilhos de novo.** Quando o mesmo conjunto de gatilhos disparava pela segunda vez numa partida, a janela de ordenar podia chegar vazia e os gatilhos não iam para a pilha. Agora eles chegam na ordem que você escolheu da última vez, prontos para confirmar ou mudar.

## [0.14.0] - 2026-10-18

### Mudou

- **A carta ampliada acompanha o mouse.** Na partida, ao passar o mouse sobre uma carta, a versão ampliada aparece ao lado do cursor e o segue enquanto você move o mouse, em vez de ficar parada no canto da tela. Perto da borda direita ela passa para o outro lado do cursor, sem sair da tela. Pelo teclado, a prévia continua no canto, e o botão direito continua abrindo os detalhes completos.

## [0.13.0] - 2026-10-18

### Novo

- **Escolha como as cartas aparecem.** Em **Opções** da partida, a nova opção **Aparência das cartas** troca a imagem completa por **Arte e texto**: a arte da carta com nome, custo, tipo e texto de regras escritos pela mesa, mais fáceis de ler em telas pequenas. No campo, as cartas mostram só o nome e a arte, e o texto inteiro continua no inspetor. Terrenos básicos ficam só com a arte. A escolha fica salva no aparelho e vale na hora.

### Mudou

- **Trilha de fases no canto inferior direito.** A trilha de turno e fases saiu da linha do meio da mesa e fica agora logo abaixo dos botões de ação, no canto inferior direito, perto de onde você passa a vez. As dicas ao passar o mouse abrem para a esquerda.

## [0.12.0] - 2026-10-18

### Mudou

- **Turno e fases no estilo do Arena.** O painel grande de fases no canto da tela virou uma trilha pequena de ícones sobre a linha do meio da mesa: início, principal 1, combate, principal 2 e final. A fase atual fica acesa em dourado no seu turno e em vermelho no turno do oponente, ao lado do número do turno. Passe o mouse num ícone para ver o nome da fase e a etapa exata, como "Combate · Declaração de atacantes". Com o canto livre, a mão e as pilhas do oponente voltaram para o lugar de antes.
- **O botão de passar diz para onde o jogo vai.** No lugar de "Passar prioridade", o botão mostra **Para o combate**, **Para a principal 2**, **Para o fim do turno**, **Resolver** (quando há algo na pilha) ou **Passar** no turno do oponente. A ação é a mesma de antes.
- **Troca de turno em destaque.** Quando o turno muda, uma faixa atravessa a mesa por pouco mais de um segundo: **Seu turno** em dourado, ou **Turno do oponente** (no Commander, **Turno de** e o nome do jogador) em vermelho. Ela não bloqueia cliques nem atrasa o jogo, e o número do turno na trilha pulsa de leve. Com a opção de reduzir animações do aparelho, a faixa só aparece e some, sem movimento.
- **Retrato de quem joga no Commander.** Com mais de dois jogadores, a trilha de fases mostra o retrato pequeno de quem está jogando o turno, com anel dourado quando é você e vermelho quando é outro jogador. Passe o mouse no retrato para ver o nome.

## [0.11.0] - 2026-10-18

### Novo

- **Marcadores de veneno na mesa.** O número de marcadores de veneno de cada jogador aparece num selo verde ao lado do retrato, contando até 10 (com 10, o jogador perde). A partir de 7 o selo brilha como alerta. Energia, experiência e outros marcadores de jogador também aparecem. No Commander com vários jogadores, os selos ficam na linha de cada oponente, ao lado da mão.
- **Importe um deck pelo link.** Em **Importar lista**, cole o link público de um deck do Moxfield ou do Archidekt no lugar da lista. O jogo busca as cartas, usa o nome do deck de origem e mostra a revisão de sempre antes de salvar, com comandante, deck principal e sideboard separados. O Maybeboard fica de fora. Se o deck for privado ou o site não responder, a mensagem diz o motivo e você ainda pode colar a lista em texto.
- **Ver a mesa no meio de uma escolha.** Quando uma janela pede para você escolher cartas ou opções (buscar um terreno, pagar um custo opcional, ordenar gatilhos), o botão **Ver a mesa** recolhe a janela numa barra acima da mão. Dá para olhar o campo e inspecionar cartas antes de decidir, e o que você já marcou continua marcado. Toque em **Voltar à escolha** (ou aperte Esc) para continuar. Enquanto isso, nada é jogado sem querer.

### Mudou

- **Janelas da partida no estilo do Arena.** Quando uma janela abre por cima da mesa (escolher cartas, cemitério e exílio, opções, fim de partida), a mesa fica atrás de uma sombra escura e levemente desfocada, e a janela entra com uma animação curta. Nas escolhas de cartas, as cartas aparecem grandes e soltas sobre o fundo, sem caixa em volta. A carta escolhida sobe e brilha em dourado, e as outras escurecem um pouco. As perguntas só com texto ficaram mais estreitas, com o título e os botões centralizados.
- **Entrar numa sala ficou mais rápido.** Ao buscar o código de uma sala, você já entra nela com o deck que estava escolhido. Se ainda não tem um deck que sirva para o formato da sala, o jogo pede para escolher um antes. Quando não dá para entrar, a mensagem diz o motivo: sala que não existe, sala completa, partida já começada ou falta de conexão.
- **Escolher quem atacar ficou mais fácil.** O seletor de alvo virou um painel **Atacar quem?**, com uma linha larga para cada alvo: a vida do jogador (ou a lealdade do planeswalker), o nome inteiro, de quem é a carta e quantas criaturas já vão para ele. No celular, o painel ganha mais largura enquanto você escolhe.
- **Botão de ataque mais claro.** No combate, o botão diz **Não atacar** enquanto nenhuma criatura foi escalada e **Confirmar 2 atacantes** (com o número certo) depois que você escolhe quem ataca.
- **Instruções da jogada curtas e em português.** Ao escolher um alvo ou pagar mana, a caixa ao lado dos botões diz só o que fazer, como "Escolha um alvo para Raio da Fenda (criatura)." ou "Pague o custo de mana de Jiboia.", em vez do texto inteiro da habilidade com o pedido em inglês. O texto completo continua em **Ver detalhes**, que abre a caixa para cima sem cobrir a mesa toda. Nas outras jogadas, o texto mostra as primeiras linhas inteiras, sem barra de rolagem.
- **Avisos de gatilho ficam mais tempo na tela.** O balão que aparece ao lado da carta quando um gatilho dispara dura cerca de 2,5 segundos, em vez de 1, sem deixar a jogada mais lenta. Com vários gatilhos seguidos, cada carta mostra só o aviso mais recente, e no máximo três aparecem de uma vez.
- **Cartas maiores no Commander pelo celular.** Com a tela deitada, as cartas no campo ficaram quase duas vezes maiores, tanto contra um oponente quanto contra três. Criaturas e terrenos ficam lado a lado, juntos no meio da mesa, cada um com a altura toda do campo. O placar do turno virou uma linha só, com a vez de quem joga e a fase atual.
- **Oponentes mais compactos no Commander pelo celular.** Na mesa com três ou quatro jogadores, o grimório, o cemitério e o exílio de cada oponente ficam na linha de cima, junto da vida, da mão e do dano. Ao lado das cartas fica só o comandante, e o campo ganha mais espaço.

## [0.10.0] - 2026-10-17

### Novo

- **Instale o jogo** no computador ou no celular: no Chrome ou no Edge, use o botão **Instalar o jogo** no topo da tela inicial. Ele ganha ícone próprio, abre em tela cheia e não precisa de download. No iPhone ou iPad, o botão explica como adicionar à Tela de Início pelo Safari.
- O jogo abre mais rápido nas próximas visitas, porque o visual e os sons ficam guardados no aparelho. Sem internet, a tela inicial e a **Mesa livre** continuam funcionando.
- Quando sai uma versão nova, aparece um aviso com **Atualizar agora**. Se você estiver no meio de uma partida, ela continua de onde parou depois de atualizar.

## [0.9.0] - 2026-10-17

### Novo

- **Mesa livre**: um jeito de jogar sem nenhuma regra automática, para testar o deck sozinho. Escolha **Mesa livre** na tela inicial e o deck chega embaralhado, com sete cartas na mão e o comandante na zona de comando. Daí em diante tudo fica com você: comprar, virar e desvirar, jogar cartas, mandar para o cemitério, exílio, mão ou topo e fundo do grimório, pôr a face para baixo, marcadores, fichas, mulligan, vida, turno e **Desfazer**. Toque em uma carta da mão para jogá-la, toque no campo para virar ou desvirar e use o botão direito (ou segure o dedo) para ver todas as opções; no computador também dá para arrastar. O jogo continua de onde parou se a página for recarregada.
- **Catorze novos decks prontos de Commander**, montados a partir das listas mais jogadas de cada comandante: **Noite de Y'shtola**, **Banquete de Sangue** (Edgar Markov), **Marcadores de Phyrexia** (Atraxa), **Horda Goblin** (Krenko), **Feitiços de Vivi**, **Olho de Sauron**, **Coro dos Anjos** (Giada), **Estouro Jurássico** (Pantlaza), **Lâminas Élficas** (Lathril), **Jardim de Bumbleflower**, **Moinho de Hope** (Hope Estheim), **Esgoto do Splinter**, **Ninjas de Satoru** e **Clã do Pé** (Super Shredder). Todos podem ser usados por você ou pelo computador.
- No fim do jogo, **Ver campo de batalha** fecha o resultado e deixa a mesa à mostra, com cartas, cemitérios e exílio ainda abertos para consulta. O botão **Ver resultado** traz de volta a tela de vitória ou derrota, com as opções de jogar de novo ou voltar ao início.
- Uma criatura com duas ou mais auras ou equipamentos ganha um **selo com um clipe e o número de cartas presas**. Clicar nele abre todas em tamanho normal, junto da criatura, para inspecionar, usar ou escolher como alvo. O selo brilha em azul quando alguma delas pode ser escolhida naquele momento.

### Mudou

- Quando uma carta no campo usa uma habilidade, ela não "voa" mais para o meio da mesa (parecia que estava saindo do campo). Agora ela brilha no lugar e ganha um aviso ao lado, que diz se foi um **gatilho** (com um raio) ou uma **habilidade ativada** por alguém (com uma engrenagem).
- O ataque agora é marcado só em vermelho, e uma faixa no meio da mesa diz quem ataca quem e com quantas criaturas, por exemplo: "Diego ataca você e Bruno com 2 criaturas."

### Corrigido

- O seu cemitério voltou a abrir com um clique; a área da mão cobria a pilha em algumas telas.
- Ao ver o cemitério, o exílio, a zona de comando ou as cartas presas a uma criatura, o botão **Inspecionar** agora fica embaixo de cada carta, na largura dela, em vez de solto ao lado.
- Enquanto o oponente está com a prioridade, não aparece mais um botão **OK** sem função: o botão mostra quem está jogando (por exemplo, **Oponente jogando…**) até chegar a sua vez de decidir.

## [0.8.0] - 2026-10-16

### Novo

- **Commander para 2, 3 ou 4 jogadores**, contra computadores ou com outras pessoas em uma sala. Escolha a quantidade de jogadores antes de iniciar; cada computador pode usar um deck diferente.
- Partidas de Commander começam com **40 pontos de vida**, com zona de comando, custo adicional para conjurar novamente o comandante e registro de dano de combate por comandante. Uma eliminação mantém os demais jogadores na mesa; o último sobrevivente vence.
- O editor de Commander destaca o comandante em uma área própria, separado das outras cartas. A seleção, a troca e as parcerias válidas têm controles próprios; a importação e a exportação preservam essa separação.
- Validação de **100 cartas no total**, identidade de cor, limite de uma cópia, exceções do texto Oracle, comandantes, parcerias e legalidade. Decks incompletos podem ser salvos como rascunhos.
- Quatro decks prontos de Commander: **Triunfo das Fichas**, **Destruição Dracônica**, **Perigo no Cemitério** e **Primeiro Voo**.

### Mudou

- A mesa mostra todos os oponentes, com vida em destaque, permanentes e zona de comando de cada um. Os campos usam toda a largura disponível e mantêm o tamanho quando a pilha ou uma janela aparece por cima. Fileiras cheias têm rolagem horizontal e controles nas bordas; a pilha flutua à direita, com cartas grandes, opção de recolher e galeria central.
- Na declaração de atacantes, selecione várias criaturas e depois o jogador ou planeswalker que elas vão atacar, ou escolha o defensor primeiro. Divida os ataques em grupos, troque o defensor e retire apenas as criaturas selecionadas antes de confirmar. Cliques rápidos são preservados enquanto o jogo atualiza as atribuições.
- Salas de Commander mostram os assentos ocupados e as vagas; a partida começa quando todos entram. Reconectar preserva o assento, e jogadores eliminados podem acompanhar o restante da partida sem revelar mãos ocultas.

### Corrigido

- **Atacar com tudo** permite escolher o oponente ou planeswalker antes de atribuir os ataques. Apenas as criaturas que podem atacar o defensor escolhido são selecionadas; a confirmação dos atacantes continua separada.
- Ações de ataque desatualizadas liberam os controles para uma nova tentativa, sem travar a declaração de atacantes.
- O carregamento das imagens das cartas não interrompe cliques em andamento.
- Corrigidas falhas ao sair durante a abertura ou encerrar uma sala com vários jogadores. As decisões pendentes são liberadas, e as outras partidas continuam funcionando.

## [0.7.0] - 2026-10-16

### Novo

- **Pauper** na criação da partida, com decks prontos para o formato e validação de legalidade, cartas banidas, limite de cópias, mínimo de 60 cartas no deck e máximo de 15 no sideboard.
- Séries **melhor de três**, com placar e troca de cartas entre o deck e o sideboard antes da próxima partida. As trocas não são reveladas ao oponente.
- Cartas jogáveis podem ser arrastadas da mão ou do exílio para o campo. O clique continua disponível.
- A pilha ganhou uma galeria central: clique na pilha à direita para ver os efeitos ampliados, rolar horizontalmente e conferir a ordem de resolução e os alvos.
- **Passar automaticamente** nas opções: o jogo passa a prioridade quando não há ações disponíveis, preservando as oportunidades de resposta. A preferência fica salva; o ritmo das animações pode ser ajustado separadamente.
- **14 efeitos sonoros**, com impactos medievais, pequenas variações e sons diferentes para compras, terrenos, mágicas, habilidades, combate e início de cada turno. Dano ao jogador tem animação própria e uma explosão diferente da usada para dano às criaturas.
- **Editar** nos seus decks da tela inicial e **Importar lista** dentro do editor. É possível preencher um deck vazio, somar cartas à lista atual ou substituí-la, mantendo o nome e o formato. A revisão mostra as quantidades do deck e do sideboard antes de salvar.

### Mudou

- **Meus decks** aparecem antes dos decks prontos, com um convite para criar o primeiro deck quando a coleção está vazia. Rascunhos continuam acessíveis para edição.
- **Jogar** e **Meus decks** compartilham o mesmo cabeçalho. A configuração da partida fica em um painel à direita, com modo, formato e duração visíveis; nome e código de sala aparecem apenas nos fluxos de multiplayer que precisam deles.
- O editor destaca o nome e a arte do deck, alinha o seletor de formato e reúne importação, exportação, duplicação e exclusão em **Ações do deck**. Textos redundantes foram removidos; decks vazios mostram apenas os controles necessários para começar.
- A mesa mantém o azul e o dourado, com tipografia, espaçamento e hierarquia visual mais consistentes. As prévias dão prioridade à imagem grande da carta, e criaturas com voar recebem uma indicação visual de flutuação.
- A escolha de quem começa e o mulligan agora acontecem no centro da tela. A mão inicial aparece em leque, cada carta aumenta ao passar o mouse e o botão de manter informa a quantidade de cartas.
- As jogadas do oponente aparecem em sequência na mesa; mágicas e habilidades também aparecem na pilha à direita. Mágicas resolvidas automaticamente continuam visíveis por um breve momento, identificadas como **Jogada recente**, sem exigir confirmação extra nem atrasar suas respostas.
- O turno e todas as fases ficam visíveis no topo, incluindo a etapa específica do combate ou da limpeza. Instruções para selecionar cartas da mão aparecem acima delas, com a quantidade já escolhida e o que falta selecionar.
- Cartas que um efeito permite jogar do exílio ficam separadas ao lado da mão durante todo o prazo, mesmo sem mana ou fora do seu turno. Cartas suspensas mostram os marcadores de tempo; a decisão de conjurar aparece quando o último marcador é removido e a habilidade resolve.
- No topo da partida ficam apenas **Menu** e tela cheia. **Registro** e **Opções** ficam dentro do menu; as opções abrem no centro, com estado visível dos efeitos sonoros, volume e ritmo das jogadas. Animações respeitam a preferência por movimento reduzido.

### Corrigido

- **Labareda Cauterizante** volta a ser reconhecida como jogável quando há mana e alvos válidos, inclusive quando a escolha de um alvo depende do outro.
- **Raio da Fenda** oferece as opções de conjurar normalmente ou suspender quando está na mão. **Explosão de Fogo** distingue o pagamento de mana do sacrifício de duas Montanhas.
- Declarar bloqueadores mantém a ligação entre a criatura selecionada e o atacante escolhido, inclusive com criaturas idênticas. Cartas selecionadas para sacrifício ou descarte recebem contorno, marca de seleção e contagem persistentes.
- Uma escolha de conjuração pendente deixa de travar outras partidas ou dar a impressão de que o oponente parou. Sair de uma série encerra as decisões pendentes, e ações antigas são rejeitadas após mudanças de estado ou reconexão.
- Códigos de sala com números são reconhecidos corretamente. Séries em melhor de três preservam o placar e as preferências ao reconectar ou iniciar a próxima partida.
- Importar listas preserva o sideboard, avisa sobre linhas inválidas e cartas não encontradas e evita sobrescrever alterações feitas em outra aba. Falhas ao salvar mantêm a edição disponível para uma nova tentativa.

## [0.6.0] - 2026-10-16

### Novo
- Setas de alvo: ao escolher o alvo de uma mágica ou habilidade, uma seta azul sai da carta e vai até a criatura, permanente ou jogador escolhido, e continua lá enquanto você paga o custo. Com a mágica na pilha, a seta sai do item da pilha: dourada se for sua, vermelha se for do oponente. Assim dá para ver o que a IA está mirando antes de responder.

## [0.5.1] - 2026-10-16

### Correções
- Publicada na internet, a mesa encontra a ponte sozinha no mesmo endereço do site (`wss://seu-dominio/ws`), sem precisar abrir a porta 7171.

## [0.5.0] - 2026-10-16

### Novo
- Cartas que dá para usar fora da mão (flashback no cemitério; tramadas, foretell e Aventura no exílio) aparecem na ponta da sua mão quando você pode usá-las, com uma etiqueta dizendo de onde vêm (**Cemitério**, **Exílio**, **Tramada**). A pilha de onde elas vêm também acende em azul. A mesa ainda não confere se você tem mana para pagar o custo.
- 5 decks novos, tirados de listas que ficaram no top 8 de torneios de Standard em outubro/2026: **Ninho de Dragões** (Boros Dragons), **Teorema de Jace** (Azorius Control), **Banquete Jund** (Jund Sacrifice), **Destreza Izzet** (Izzet Prowess) e **Revelação em Quatro Cores** (4c Control).
- Tela inicial nova, em três passos: escolha o modo (contra a IA ou em rede) em cartões grandes, o deck, e veja a partida montada (**Você vs Oponente**) num painel ao lado, com o botão **Jogar** sempre à vista.
- Busca de decks por nome e filtros por cor e por origem (prontos ou seus).
- Clique duplo num deck começa a partida contra a IA.
- Botão de olho em cada deck da tela inicial abre uma prévia: as cartas separadas por tipo, com custo de mana, a curva de mana e o custo médio. Passe o mouse numa carta para vê-la ampliada (no celular, toque nela). Dá para escolher o deck direto dali.
- A tela inicial lembra o último deck e o oponente escolhidos.
- O endereço da ponte, na partida em rede, fica recolhido em "Endereço da ponte", para não atrapalhar quem só quer entrar numa sala.
- Ícone novo na aba do navegador: o losango dourado da marca da tela inicial.
- No celular a Mesa de Duelo é jogada **deitada**: ao começar uma partida, o jogo entra em tela cheia e trava a tela na horizontal (Android). Com o aparelho em pé, aparece um aviso para girar, com um botão para jogar em tela cheia onde o navegador permite.
- Mesa e tela inicial ajustadas para celular deitado: cartas, mão, retratos, botões e perguntas no tamanho certo para telas baixas; o trilho de fases mostra só o turno e a fase atual; a carta ampliada fica ao lado do texto, em vez de em cima; e na tela inicial o painel da partida fica fixo à direita.
- Botão de tela cheia no topo da mesa, ao lado de **Registro**: liga e desliga a tela cheia a qualquer momento da partida (no celular, também deixa a tela deitada). Não aparece no iPhone, onde o Safari não permite.
- Adicionar o site à tela inicial do celular abre em tela cheia e na horizontal.
- Tela **Gerenciar decks** nova: a lista mostra a capa de cada deck, as cores e o número de cartas, separada em **Meus decks** e **Decks prontos**, com busca por nome. **Novo deck** e **Importar lista** ficam no topo.
- O deck aberto tem a capa no topo, o nome editável, a contagem de criaturas, outras mágicas e terrenos, e a curva de mana. Cada carta da lista tem a miniatura da arte e botões **−** e **+** ao lado da quantidade.
- Decks prontos avisam que não podem ser alterados e oferecem **Duplicar para editar**.
- A busca de cartas do montador ganhou atalhos de cor, tipo e **Standard**, e as dicas de sintaxe ficam recolhidas. Toque na carta para adicioná-la; um selo mostra quantas já estão no deck (ex.: 2/4).

- Criaturas iguais (mesmo P/T, dano, marcadores e palavras-chave) ficam empilhadas no campo, com o contador **×N**, como os terrenos. Quem entra no combate sai da pilha.
- Pilhas de permanentes têm largura máxima: acima de 4 cópias as cartas ficam mais juntas, e o contador continua mostrando o total.
- De quem é o turno fica sempre à vista: etiqueta **Seu turno** / **Turno de…** no trilho de fases, anel dourado ou vermelho no retrato e um brilho na metade da mesa de quem joga.
- Terrenos básicos com a série de vitrais de Magali Villeneuve (Dominaria United), em todas as telas.
- Menos OK para apertar: quando você não tem nada que possa fazer (nenhuma carta jogável nem habilidade que dê para pagar), a prioridade passa sozinha, inclusive com a sua própria mágica ou gatilho na pilha.

### Mudou
- Letras novas, mais limpas: títulos, nomes de decks e banners trocaram a fonte serifada de estilo antigo (Cinzel) por uma sem serifa moderna (Outfit); o texto corrido e os números da mesa (vida, poder/resistência) passaram para Inter.

### Corrigido
- O botão **OK** não fica mais travado quando o Forge recusa a ação (um bloqueio inválido, por exemplo): dá para corrigir e confirmar de novo.
- No celular deitado, o campo do código da sala mostra o que foi digitado e o botão **Entrar** aparece inteiro.
- O fundo da tela inicial e da tela de decks fica parado ao rolar a página, em vez de rolar junto com o conteúdo.
- Os créditos no rodapé da tela inicial e da tela de decks não cobrem mais o conteúdo.
- O painel de **Novidades** abre por cima dos decks, em vez de ficar escondido atrás deles.
- A busca de cartas do montador de decks voltou a ocupar a coluna inteira (tinha ficado espremida depois da tela inicial nova).
- Ao mudar a busca de cartas rápido, a resposta de uma busca antiga não substitui mais a mais recente.
- Decks sem criaturas (como Teorema de Jace) mostram a arte de outra carta do deck, em vez de um quadro vazio.
- Cartas exiladas agora aparecem na mesa: o **exílio** ganhou uma pilha ao lado do cemitério (só quando tem cartas), e as tramadas levam a etiqueta **Tramada**.
- Cartas tramadas (plot) podem ser conjuradas de novo: antes ficavam presas no exílio, sem como usá-las.
- Pagamento manual com a mana já na reserva: se você virou os terrenos antes de conjurar, os símbolos de mana ao lado do seu retrato acendem durante o pagamento; toque em cada um para gastá-lo. Antes só o botão **Automático** conseguia usar essa mana.

## [0.4.0] - 2026-10-16

### Novo
- Artefatos e encantamentos que não são criaturas saem da fileira das criaturas: ficam ao lado dos terrenos, num grupo próprio, com cópias iguais empilhadas (Tesouros, Pistas…) e um contador **×N** em cima. Os terrenos também ganharam o contador.
- Fichas em campo aparecem com a imagem oficial (coelhos, tesouros, pistas…), em vez do quadro só com texto.

### Corrigido
- Cartas de duas faces (como The Enigma Jewel) aparecem com imagem no montador e na mesa; depois de transformar, a carta mostra a imagem e o nome do verso.
- A mesa não fica mais pedindo de novo ao Scryfall, a cada atualização, cartas que ele não encontra.

## [0.3.0] - 2026-10-16

### Novo
- No combate, uma seta dourada liga cada bloqueador à criatura que ele está bloqueando.
- Marcadores e palavras-chave (Voar, Iniciativa, Resistência a Magia, Proteção…) nas cartas do campo viram ícones, com o número no caso dos marcadores. Passe o mouse ou toque no ícone para ver o nome.
- O custo de mana de cada carta da mão aparece num selo em cima da carta, sem precisar passar o mouse.
- Emblemas de planeswalker aparecem ao lado do retrato do jogador; passe o mouse para ver o texto.
- **Importar lista** no montador de decks: cole a lista exportada do Arena, MTGO, Moxfield ou Archidekt (nomes em inglês ou português). Sideboard fica de fora, e o deck avisa quais cartas não foram encontradas.
- Símbolos de mana X, híbridos e phyrexianos aparecem desenhados, em vez de bolinhas cinza.

### Corrigido
- Explore e outros efeitos que só revelam cartas não travam mais a partida: a carta aparece com um botão OK.
- Cartas de duas faces e aventuras adicionadas ao deck (como Delver of Secrets ou Bonecrusher Giant) entram na partida normalmente.

## [0.2.0] - 2026-10-16

### Novo
- Deck **Toca dos Coelhos** (branco, Standard): um exército de Hare Apparent com Elspeth, Storm Slayer dobrando as fichas.
- Palavras-chave atuais aparecem em cima de cada carta no campo, inclusive as ganhas por efeitos (Voar da Elspeth, por exemplo).
- Poder/resistência fica **verde** quando a criatura está acima do normal e **vermelho** quando está abaixo.
- Planeswalkers mostram a lealdade no escudo, e dá para ver qual criatura está atacando qual planeswalker.
- Auras e equipamentos aparecem presos atrás da carta que encantam ou equipam.
- Selos de **Ficha** e **Cópia** (Clone e afins mostram de qual carta são cópia).
- Buscar no grimório, reanimar do cemitério e escolher no exílio agora funcionam: as cartas aparecem numa pergunta para você escolher.
- Vidência e efeitos parecidos deixam escolher quais cartas vão para o fundo, e mostram a carta do topo quando é uma só.
- O montador de decks aceita qualquer quantidade de cartas como Hare Apparent, que permitem mais de 4 cópias.

### Mudou
- Todas as partidas agora usam o motor do Forge, com todas as cartas e a IA melhor. Saiu o motor simplificado do navegador e, com ele, a escolha de motor na tela inicial e o aviso "só no Forge" nos decks.
- Para jogar é preciso rodar a ponte do Forge junto com o site (veja o README).
- O atalho `#forge` no endereço deixou de existir; use `#jogar`.

## [0.1.0] - 2026-10-15

Primeira versão.

- Mesa de Magic no navegador, contra a IA ou contra outra pessoa pela rede.
- Dois motores: um simples, direto no navegador, e o do Forge, completo.
- 8 decks prontos: Fúria da Montanha, Coração da Mata, Céu Aberto, Auras Brancas, Elementais Izzet, Landfall Verde, Pesadelos Dimir e Ninjas das Sombras.
- Montador de decks com busca de cartas, imagens e nomes em português (via Scryfall).
- Partidas em rede voltam sozinhas ao mesmo assento se a conexão cair ou a página for recarregada; revanche quando os dois pedirem.
