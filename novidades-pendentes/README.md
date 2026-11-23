# Novidades pendentes

Cada mudança que o jogador percebe guarda aqui, numa pasta só dela, o que entraria no `CHANGELOG.md`, em vez de
escolher um número de versão. Assim, tarefas em paralelo (em outras worktrees) nunca pegam o mesmo número nem mexem
nas mesmas linhas. O número só sai na hora de subir para a main: `npm run publicar-versao` (o `/cp` roda) junta todas
as pastas numa versão nova, a seguinte à do topo do `CHANGELOG.md`, e apaga as pastas.

```
novidades-pendentes/<nome-da-mudanca>/
  novidade.md      os itens, como no CHANGELOG (obrigatório)
  imagens.json     prints de cada item (se houver o que ver)
  cenarios.json    cenários do Laboratório (correções de regra ou carta)
  lab-efeitos.json botões novos (ou com efeito novo) do laboratório de efeitos
  *.webp           os prints
```

`novidade.md`, só com os grupos que a mudança usa:

```markdown
### Novo

- **Título do item.** O que muda na mesa, para o jogador.

### Corrigido

- **Outro item.** ...
```

Item que vale só para a mesa no PC: `[Mesa no PC]` logo depois do título, antes do texto. O título continua o mesmo (é
ele que o `imagens.json` e o `cenarios.json` usam), e a marca vira o selo "Mesa no PC" no painel Novidades do navegador,
na página Novidades em imagens e no painel Novidades da mesa no PC (que lê o `/novidades.json` que o build do site gera
do `CHANGELOG.md`, `scripts/news-feed.mjs`). Item que vale para as duas mesas não leva marca.

```markdown
- **Novidades na mesa no PC.** [Mesa no PC] O botão Novidades, no canto da tela inicial, abre o mesmo painel do navegador.
```

`imagens.json`: título do item (sem o ponto) → prints desta pasta.

```json
{
  "Título do item": [
    { "img": "detalhe.webp", "legenda": "O que se vê na imagem." }
  ]
}
```

`cenarios.json`: uma lista no formato de `src/lab-cenarios.json`, com `nome`, `item`, `conferir` e `cenario`, mas
**sem** `versao` (ela entra na publicação).

`lab-efeitos.json`: os botões do laboratório de efeitos que a mudança criou ou que ganharam efeito novo, como
`<atributo>:<valor>` (o `data-` do botão: `gpu:crown` é o `[data-gpu="crown"]`, `play:commanderStrike` a jogada pronta).
Eles ganham o selo "novo" no painel. Ao publicar, `tests/fixtures/effects-lab-new.json` passa a ter só os botões da
versão nova: os marcados numa versão anterior perdem o selo. Versão sem botão novo não mexe nele, e os selos da última
versão que trouxe algum continuam.

```json
["gpu:crown", "play:commanderStrike"]
```

Enquanto a mudança não sobe, a mesa mostra esses itens como **Próxima versão** no painel Novidades, na página
Novidades em imagens e nos Cenários prontos do Laboratório. A main nunca fica com pastas aqui: o `pre-push` recusa.
