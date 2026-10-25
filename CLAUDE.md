# Mesa de Duelo

## Decisões: perguntar com alternativas

Quando houver uma escolha real a fazer, pergunte antes de seguir, oferecendo alternativas concretas (e marcando a recomendada, com o porquê):

- Vale para decisões relevantes: abordagem ou arquitetura, comportamento de regra do jogo, aparência e texto de telas, nomes que o jogador vê, versão no `CHANGELOG.md` quando houver dúvida entre Y e Z, e qualquer coisa difícil de desfazer.
- Não pergunte o que o código ou este arquivo já respondem, nem detalhes óbvios: siga o padrão existente e diga o que escolheu ao entregar.
- Junte as dúvidas numa única rodada de perguntas sempre que possível, em vez de interromper várias vezes.

## Novidades (CHANGELOG.md)

O painel **Novidades** da tela inicial é gerado do `CHANGELOG.md` (`src/ui/changelog.ts`), e a versão mostrada é a da primeira seção. Ele só fica atualizado se o arquivo for atualizado junto com o código:

- Toda mudança que o jogador percebe (recurso, deck, regra, tela, correção) entra no `CHANGELOG.md` **na mesma mudança de código**, sem esperar pedido.
- Escreva em português, para o jogador: o que muda na mesa, não o que mudou no código. Nada de nomes de arquivos, funções ou classes CSS.
- Use as seções `### Novo`, `### Mudou` e `### Corrigido`, com o cabeçalho `## [X.Y.Z] - AAAA-MM-DD`.
- Versão: **Z** para só correções, **Y** para coisas novas (decks, telas, regras, recursos), **X** quando algo deixa de funcionar como antes. Se a seção do topo ainda não foi publicada (não está na `main`), acrescente nela em vez de abrir outra.
- Mantenha o `version` do `package.json` (e do `package-lock.json`, via `npm version X.Y.Z --no-git-tag-version`) igual ao do topo do `CHANGELOG.md`.
- Mudanças só internas (testes, refatoração, build) não entram.

## Novidades em imagens (novidades.html)

A página **Novidades em imagens** (link no painel Novidades) mostra prints de cada item do `CHANGELOG.md`. Sempre que um item entrar no `CHANGELOG.md`, ele também ganha imagens nessa página, na mesma mudança:

- Tire prints que mostrem a mudança em si (o selo, o menu, a carta, o balão), recortados no detalhe, não a tela inteira. Use as páginas de teste da mesa (`tests/fixtures/*.html`, com `window.fixture` para montar o estado) e o `npx agent-browser` com `set viewport <L> <A> 2`, recortando pela caixa dos elementos. Capture sempre em 2x: a página mostra cada imagem com metade da largura do arquivo, que é o tamanho real na mesa.
- Salve em `public/novidades/<versão>/<nome-do-item>.webp` (WebP, qualidade ~88).
- Registre em `src/novidades.json`: versão → título do item exatamente como está em negrito no CHANGELOG (sem o ponto final) → lista de `{ "img": "<versão>/<arquivo>.webp", "legenda": "..." }`. A legenda segue as mesmas regras do CHANGELOG: português, para o jogador, dizendo o que se vê na imagem.
- Só fica sem imagem o item que não tem nada para ver (por exemplo, uma mudança só de desempenho); nesse caso, diga isso ao entregar a mudança.
- `tests/novidades.test.mjs` confere que cada entrada aponta para um item do CHANGELOG e para um arquivo que existe.
