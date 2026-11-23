# Referência: o que o protótipo `rea-mtg` deixou (e o que não deu para aproveitar)

Data: 2026-11-23

O `rea-mtg` (`C:\Users\Kassio\rea-mtg`, fora deste repositório) é um protótipo de outubro de 2026: três páginas
estáticas imitando o MTG Arena (`home/`, `match/` e `card/`), montadas com material extraído do cliente instalado do
Arena (`MTGA_Data`) e com análises dos arquivos do jogo (`analysis/`). Ele foi lido para ver o que dava para trazer
para a mesa.

## O que foi aproveitado

Só ideias de código escritas no próprio protótipo (`card/index.html`), refeitas do zero na mesa, sem nenhum arquivo dele:

- **Encaixe do texto na carta** (`src/ui/cardTextFit.ts`): no estilo Arte e texto, nome, tipo e regras diminuem a
  letra até caber, em vez de cortar. No protótipo era um laço que reduzia aos poucos; na mesa virou uma busca binária
  com mínimo por parte, memória por texto e tamanho (a mesa redesenha as cartas a cada jogada) e um só observador para a
  página. O fim esmaecido só aparece quando nem a menor letra dá conta. A mesa também passou a desviar o texto do selo
  de P/R e de lealdade (`.af-gap`), algo que o protótipo não fazia.
- **Tom por cor nas barras** (`src/ui/cardStyle.css`): barras do nome e do tipo e caixa de texto num tom claro da cor
  da carta. O protótipo usava uma tabela de cores por cor de mana sobre texturas do Arena; a mesa usa `color-mix` com as
  cores de moldura que já tinha (`--c1`), sem textura nenhuma.

## O que não deu para aproveitar, e por quê

### Material extraído do cliente do Arena (direitos autorais e termos de uso)

Nada disso entra na mesa, nem como referência visual a copiar: pertence à Wizards of the Coast (ou à Adobe, no caso de
fontes), foi tirado do programa instalado sem licença de redistribuição, e a mesa é pública. A spec da mesa já pede
identidade própria, sem copiar visual, arte, som ou texto do Arena (ver `docs/referencia-log-arena.md`).

| O que | Onde no `rea-mtg` | Observação |
| --- | --- | --- |
| Sprites da partida: escada de fases, botões de passar turno, molduras de vez e de combate, brilhos de decisão, contadores de vidro, base da vida | `assets/duel/Atlas_*`, `match/img/` | Recortados dos atlas do jogo (DXT5) |
| Sprites da interface: abas da barra de navegação, moedas, gemas, curingas, cofre, setas, pontos do carrossel | `assets/ui/`, `home/img/` | Idem |
| Fundo do campo, verso da carta, retratos e molduras de perfil, placas de nome, emblemas de vitória e derrota | `match/img/` | Idem |
| Artes das cartas | `match/art/` | Dos pacotes `*_CardArt_*` do cliente. A mesa já usa a arte recortada do Scryfall |
| Texturas da moldura da carta (barra do título, do tipo, caixa de texto, caixa de P/R, pincel do ilustrador) e símbolos de mana | `card/img/` | A mesa tem os próprios símbolos e desenha a moldura em CSS |
| Fontes Beleren 2016, Minion Pro e Roboto | `card/fonts/`, `match/fonts/` | Beleren é da Wizards e Minion Pro é da Adobe, ambas comerciais. A mesa usa as fontes dela |
| Imagens do carrossel e dos eventos da tela inicial (Alquimia, Brawl, Draft, Jump In, Discord, Sparky) e o logotipo | `home/img/` | Material de divulgação e marca do Arena |
| Banco de cartas em português | `analysis/cartas-ptbr.json` e `.csv` (≈ 30 MB) | Extraído do banco do cliente. A mesa já tira nomes e textos em português do Scryfall |
| Textos da interface em português | `analysis/loc-nav.json`, `home-strings.txt`, `rea-loc.json` | Localização do Arena: os textos da mesa são escritos por nós |
| Análise dos programas do jogo (tipos, membros e consultas SQL do `Core.dll` e de outras bibliotecas do cliente) | `analysis/core-*.json`, `scc-*.json`, `sql-*.txt` | Resultado de descompilar o cliente, que os termos de uso proíbem. A referência que a mesa usa do Arena é só o log que ele grava para ferramentas de terceiros (`docs/referencia-log-arena.md`) |

### Código e ideias que a mesa já tem, e melhor

- **Lógica da partida** (`match/index.html`): turnos, pagamento de mana contando terrenos, combate simplificado e uma IA
  de poucas linhas, só com cartas vermelhas, verdes e terrenos. As regras de verdade vêm do Forge, no servidor.
- **Escada de fases, retrato com a vida, faixa de "seu turno", botão principal que muda com a etapa, prévia da carta ao
  passar o mouse, registro, aviso de mão cheia e tela de vitória ou derrota**: a mesa já tem todos (HUD de fases, painel
  de ações, inspetor, registro, medalhas na GPU), com mais recursos.
- **Brilho de carta que dá para usar, de atacante, de bloqueador e de alvo, carta virada a 90°**: idem, com os efeitos
  da mesa.
- **Tela inicial** (`home/index.html`): barra de navegação com moedas, curingas e loja, carrossel e eventos. É a
  estrutura de um jogo com loja e coleção, que a mesa não tem nem quer imitar. A tela inicial da mesa tem outro desenho.
- **Galeria de cartas com filtro por cor e busca** (`card/index.html`): o montador de decks da mesa já faz isso, com
  muito mais filtros.
- **Moldura de carta com texturas**: depende das texturas do Arena (acima). A ideia que sobra, o tom por cor, entrou.
- **Tirar o texto de ambientação quando não cabe**: a mesa não mostra texto de ambientação na carta, então não se aplica.

### Restos sem uso

- `rea/`: a ferramenta genérica de análise que gerou o `analysis/` (site, exemplos, testes). Não tem relação com a mesa.
- `.claude/launch.json`: só sobe um `python -m http.server` na porta 8765 para abrir as páginas.
