# Direção visual da mesa no PC: Nítido

Roadmap 150. Primeiro foi proposto e recusado um "ornamento dourado" (molduras com cantoneiras, losangos e títulos
serifados): a direção pedida é **moderna e clean**. Das três modernas postas lado a lado (A Nítido: chapado com filete
dourado no topo; B Angular: dois cantos cortados em reta e letra condensada em caixa alta; C Suave: sem borda, cantos
redondos e sombra macia), a B foi escolhida e chegou a sair na 0.246.0, mas, vista nas telas, foi desfeita em 24/11/2026
e a escolha passou para a **A**: a mais legível, a que menos muda o que já existia, e que ainda tem cara de jogo pelo
filete dourado e pela base das teclas.

As pranchas não ficam no repositório (as imagens de `docs/` são ignoradas). O que foi feito para a B (o kit em
`ui_kit.gd`/`cut_box.gd`, um `Theme` único, campos, caixas de marcar, deslizante, abas, selos, cabeçalho de tela, a
tela Jogar online e a entrada animada das telas) está no histórico do git (0.246.0) e num stash local; as ideias de
estrutura (Theme único, entrada das telas, peças de lista) valem para a A também.

## O sistema

- **Formas.** Retângulos de cantos quase retos (raio 4, `ModalStyle.RADIUS`). Nada de pílula nem canto cortado.
- **Painel.** Chapado em azul quase preto (`#0c101a`, 97%), com um filete dourado de 3 px no alto
  (`ModalStyle.TOP_LINE`) e sombra macia por baixo; sem borda nos outros lados (`ModalStyle.panel_style`).
- **Título.** Branco, na letra encorpada de sempre (`HudStyle.bold_font`), sem caixa alta. Nas janelas, no meio, como
  o resto delas. Pode ter acima a etiqueta pequena em dourado, em caixa alta espaçada (`ModalStyle.eyebrow`, "MESA DE
  DUELO" na prancha).
- **Botões.** Chapados, com a base um tom mais escura (3 px, `ModalStyle.BUTTON_BASE`), como uma tecla; letra
  encorpada de sempre. Principal em ouro `#f0b84a` com letra marrom-escura; secundário `#1c2436`; perigoso `#b9452f`;
  discreto só com um filete fraco.
- **Estados** (`ModalStyle.button_box`). Mouse em cima: clareia; o dourado e o perigoso ganham um brilho dourado, o
  secundário e o discreto um filete dourado. Apertado: escurece e afunda (a base some e o texto desce). Desligado:
  cinza, sem base. Foco do teclado: um contorno branco de 2 px por fora.
- **Campos.** Escuros, filete fino que fica dourado com o mouse, cantos quase retos (`HomeStyle.style_field`).

## As peças

- **Tema único** (`ui/ui_theme.gd`, ligado no `main.gd`): campos de texto e de escolha e a lista aberta deles, caixas de
  marcar, deslizantes (puxador dourado com a base de tecla), barras de rolagem, abas de cima (a marcada com o filete
  dourado no alto), listas e dicas. Todo controle sem estilo próprio sai assim.
- **Peças montadas** (`ui/ui_kit.gd`): cabeçalho de tela (Voltar, etiqueta, título branco e explicação), legenda em
  caixa alta, selo de estado, linha de lista, escolhas lado a lado, valor com setas, deslizante com o valor, linha de
  opção (nome, explicação e controle), abas laterais (a marcada com o filete dourado à esquerda) e a entrada e a saída
  das telas e das janelas.
- **Fundo de cena** (`menu/menu_backdrop.gd`): o azul quase preto com uma luz quente que respira, poeira dourada
  subindo e vinheta, nas telas do menu.
- **Movimento e som.** As telas do menu entram aparecendo do escuro e subindo um pouco (0,24 s); as janelas crescem um
  tico do meio e saem descendo (`UiKit.open_modal`, `close_modal`), com os sons de abrir, fechar, confirmar e cancelar
  (`ui/ui_sounds.gd`, gerados no jogo, no volume dos efeitos). Opções > Imagem > "Menos movimento nas telas" tira o
  deslocamento e o crescimento.
- **HUD da partida** (`ui/hud_style.gd`): os mesmos cantos quase retos, o botão principal com a base de tecla e os
  painéis com o filete dourado no alto (`HudStyle.framed`).

## Onde já vale

Em todas as telas (roadmap 150, concluído em 24/11/2026): a tela inicial, Jogar online, Meus decks, as Opções, todas as
janelas (pelo `ModalStyle`) e o HUD da partida. Fica de fora só o que é desenho da mesa 3D (cartas, selos sobre as
cartas, setas).
