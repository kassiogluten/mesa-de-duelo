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
  *.webp           os prints
```

`novidade.md`, só com os grupos que a mudança usa:

```markdown
### Novo

- **Título do item.** O que muda na mesa, para o jogador.

### Corrigido

- **Outro item.** ...
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

Enquanto a mudança não sobe, a mesa mostra esses itens como **Próxima versão** no painel Novidades, na página
Novidades em imagens e nos Cenários prontos do Laboratório. A main nunca fica com pastas aqui: o `pre-push` recusa.
