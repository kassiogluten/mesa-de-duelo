# Direção visual da mesa no PC: Angular

Roadmap 150. Escolhida em 24/11/2026. Primeiro foi proposto e recusado um "ornamento dourado" (molduras com
cantoneiras, losangos e títulos serifados): a direção pedida é **moderna e clean**. Das três modernas postas lado a lado
(A Nítido: chapado com filete dourado no topo; B Angular; C Suave: sem borda, cantos redondos e sombra macia), ficou a
B, a mais limpa que ainda tem cara de jogo, e a que mais se afasta da cara de site que motivou o item.

A prancha mostra o mesmo modal, os estados de botão e a coluna da tela inicial, hoje (à esquerda) e com o kit (à
direita). Ela não fica no repositório (as imagens de `docs/` são ignoradas); para gerá-la (escala 2 dá o print em 2x):

```
npm run godot -- --resolution 1920x1080 --script res://tools/preview_style_board.gd -- <saída.png> [escala]
```

## O sistema

- **Formas.** Retângulos com dois cantos cortados em reta, em diagonal oposta: painéis em cima à direita e embaixo à
  esquerda (22 px); botões em cima à esquerda e embaixo à direita (10 px). Nada de pílula nem canto redondo.
- **Superfície.** Chapada, sem degradê nem textura: painel em azul quase preto (`#0b0f1a`, 97%) com um filete claro
  fino (branco a 12%) e sombra macia por baixo. Tudo desenhado em código, nítido em qualquer escala.
- **Letra.** Botões e títulos em Barlow Condensed (SemiBold nos botões, Bold nos títulos), em versalete: a caixa alta vem
  da letra (`smcp` e `c2sc`), então um texto trocado depois ("Procurando…") também sai em caixa alta. O versalete é
  menor que a maiúscula, e a letra cresce 30% para compensar (`UiKit.caps_size`). Licença OFL, incluída em
  `godot-table/ui/fonts/`. Texto corrido, listas e números continuam na letra de hoje, pela leitura.
- **Título.** Branco, com uma barra dourada de 4 px antes. Nas janelas (que centralizam o texto e os botões) fica no
  meio, numa linha só; numa tela com o conteúdo à esquerda, fica à esquerda (`UiKit.title`).
- **Paleta.** A de hoje: ouro `#f0b84a` no principal (letra marrom-escura), secundário `#1c2436` com filete fraco,
  perigoso `#b9452f`, discreto só com o filete.
- **Estados.** Mouse em cima: clareia, ganha filete dourado e um brilho dourado em volta (o discreto só o filete).
  Apertado: escurece. Desligado: cinza, sem filete. Foco do teclado: um contorno branco de 2 px, diferente do mouse em
  cima.

## Peças

- `godot-table/ui/cut_box.gd` (`CutBox`): a caixa com os cantos cortados, filete, brilho e sombra (StyleBox).
- `godot-table/ui/ui_kit.gd` (`UiKit`): o painel, o título com a barra, os botões em cada tipo e estado e as letras.
- Testes em `godot-table/tests/test_ui_kit.gd`.

## Onde já vale

- Todas as janelas, pelo `ModalStyle` (`panel_style`, `title`, `button` e `style_button` passam ao kit): perguntas da
  partida, sala de espera, relatos, novidades, decks, conta, atualização e sair da partida.
- Tela inicial: os botões da coluna (`HomeStyle.action_button`), os campos de formato e deck e a lista aberta deles
  (`style_field`, `style_popup`), o painel da partida, Novidades, a caixa de Opções e a faixa de versão nova.
- Ainda no estilo de antes: a tela Jogar online (títulos e listas), a mesa da partida (HUD) e as peças que o kit ainda
  não tem (caixa de texto, caixa de marcar, deslizante, cartões de jogador da sala).

Ainda falta, no kit: abas, caixa de seleção, deslizante, campo de texto, lista com rolagem, cabeçalho de tela, um
`Theme` único com tudo isso, e a entrada e saída das telas.
