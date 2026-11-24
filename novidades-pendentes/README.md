# Novidades pendentes

Cada mudança que o jogador percebe guarda aqui, numa pasta só dela, o que entraria no `CHANGELOG.md` (mesa do
navegador) e no `CHANGELOG-PC.md` (mesa no PC), em vez de escolher um número de versão. Assim, tarefas em paralelo (em
outras worktrees) nunca pegam o mesmo número nem mexem nas mesmas linhas. O número só sai na hora de subir para a main:
`npm run publicar-versao` (o `/cp` roda) junta todas as pastas numa versão nova, a seguinte à mais nova dos topos dos
dois arquivos, escreve em cada um os itens da mesa dele (só quando tem algum) e apaga as pastas.

```
novidades-pendentes/<nome-da-mudanca>/
  novidade.md      os itens da mesa do navegador, como no CHANGELOG.md
  novidade-pc.md   os itens da mesa no PC, como no CHANGELOG-PC.md (pelo menos um dos dois)
  imagens.json     prints de cada item (se houver o que ver)
  cenarios.json    cenários do Laboratório (correções de regra ou carta)
  lab-efeitos.json botões novos (ou com efeito novo) do laboratório de efeitos
  *.webp           os prints
```

`novidade.md` e `novidade-pc.md`, só com os grupos que a mudança usa:

```markdown
### Novo

- **Título do item.** O que muda na mesa, para o jogador.

### Corrigido

- **Outro item.** ...
```

Cada mesa só mostra as suas novidades:

- Item que vale só para a mesa do navegador: no `novidade.md`.
- Item que vale só para a mesa no PC: no `novidade-pc.md`. Ele aparece no painel Novidades da mesa no PC (que lê o
  `/novidades.json` que o build do site gera do `CHANGELOG-PC.md`, `scripts/news-feed.mjs`) e na aba Mesa no PC da
  página Novidades em imagens; no navegador, não.
- Item que vale para as duas mesas: nos dois arquivos, com o mesmo título (o texto pode mudar, se cada mesa pede uma
  explicação). O `imagens.json` e o `cenarios.json` usam o título, então os prints e o cenário servem às duas.

A marca antiga `[Mesa no PC]` logo depois do título, de quando havia um CHANGELOG só, ainda é aceita num `novidade.md`
(de uma worktree antiga): o item vai para a mesa no PC, sem a marca. Não a use em item novo.

`imagens.json` (um só para as duas mesas): título do item (sem o ponto) → prints desta pasta.

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

Enquanto a mudança não sobe, cada mesa mostra os seus itens como **Próxima versão** no painel Novidades e na aba dela
da página Novidades em imagens, e os cenários aparecem nos Cenários prontos do Laboratório. A main nunca fica com pastas aqui: o `pre-push` recusa.
