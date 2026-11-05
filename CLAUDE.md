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
- Nem no `CHANGELOG.md` nem em nenhum texto que o jogador vê (telas, avisos, erros que o servidor manda para a mesa) se usa "ponte", o nome interno do `forge-bridge`: diga "servidor" ("Conectando ao servidor…", "A conexão com o servidor caiu."), sem citar o Forge quando ele não ajuda o jogador. Comentários, nomes no código e a área de admin podem continuar com "ponte"; `tests/sem-ponte.test.mjs` confere o resto.
- Use as seções `### Novo`, `### Mudou` e `### Corrigido`, com o cabeçalho `## [X.Y.Z] - AAAA-MM-DD`.
- Versão: **Z** para só correções, **Y** para coisas novas (decks, telas, regras, recursos), **X** quando algo deixa de funcionar como antes. Se a seção do topo ainda não foi publicada (não está na `main`), acrescente nela em vez de abrir outra.
- Mantenha o `version` do `package.json` (e do `package-lock.json`, via `npm version X.Y.Z --no-git-tag-version`) igual ao do topo do `CHANGELOG.md`.
- Mudanças só internas (testes, refatoração, build) não entram.

## Novidades em imagens (novidades.html)

A página **Novidades em imagens** (link no painel Novidades) mostra prints de cada item do `CHANGELOG.md`. Sempre que um item entrar no `CHANGELOG.md`, ele também ganha imagens nessa página, na mesma mudança:

- Tire prints que mostrem a mudança em si (o selo, o menu, a carta, o balão), recortados no detalhe, não a tela inteira. Use as páginas de teste da mesa (`tests/fixtures/*.html`, com `window.fixture` para montar o estado) e o `npm run print -- <página> "<seletor>" <saída.webp> [--setup js]` (`scripts/print-novidade.mjs`, com o `npm run dev` ligado), que já captura em 2x, recorta pela caixa dos elementos e grava em WebP. Em 2x porque a página mostra cada imagem com metade da largura do arquivo, que é o tamanho real na mesa.
- Salve em `public/novidades/<versão>/<nome-do-item>.webp` (WebP, qualidade ~88).
- Registre em `src/novidades.json`: versão → título do item exatamente como está em negrito no CHANGELOG (sem o ponto final) → lista de `{ "img": "<versão>/<arquivo>.webp", "legenda": "..." }`. A legenda segue as mesmas regras do CHANGELOG: português, para o jogador, dizendo o que se vê na imagem.
- Só fica sem imagem o item que não tem nada para ver (por exemplo, uma mudança só de desempenho); nesse caso, diga isso ao entregar a mudança.
- `tests/novidades.test.mjs` confere que cada entrada aponta para um item do CHANGELOG e para um arquivo que existe.

## Laboratório: um cenário pronto por correção

O Laboratório (menu **⋯** da tela inicial) tem uma lista de **Cenários prontos** (`src/lab-cenarios.json`), para qualquer pessoa conferir à mão, quando precisar, que uma correção continua certa. Ela só serve se for alimentada junto com o código:

- Toda correção de regra ou de carta (item de `### Corrigido` que dá para reproduzir numa mesa montada: carta, regra, gatilho, interação) ganha um cenário pronto **na mesma mudança**. Correções só de tela, de teclado ou de desempenho, que a mesa montada não reproduz, ficam sem; diga isso ao entregar.
- Cada cenário tem `nome` (o que o jogador vê na lista), `versao` e `item` (o título em negrito do item no CHANGELOG, sem o ponto final), `conferir` (o que fazer na mesa e o que deve acontecer, em português, para o jogador) e `cenario` (o mesmo formato de “Copiar cenário”). Monte a mesa mínima que mostra a correção, com as terras para pagar e cartas no grimório para comprar; o Jogador 1 é quem cria a sala.
- Os mais novos ficam no começo da lista. Se a correção mudar de novo, atualize o cenário em vez de criar outro.
- `tests/lab.test.mjs` confere que cada cenário aponta para um item do CHANGELOG e que o editor o monta igual; `LabTest.readyScenariosOfTheTableAreAccepted` (no servidor) confere que as cartas e os marcadores existem.

## Entregar

Ao fechar uma mudança, siga a skill `/entregar` (`.claude/skills/entregar/SKILL.md`): CHANGELOG, versão, prints, cenário do Laboratório, testes e roadmap, na ordem.

## Servidor local: reiniciar quando o servidor muda

A mesa em `localhost:5173` conversa com o servidor local na porta 7171 (`npm run forge`), que só compila o `forge-bridge` ao subir. A mesa (`src/`) se atualiza sozinha; o servidor, não: uma mudança no `forge-bridge/` só vale depois de reiniciá-lo, e testar sem isso parece que a mudança não funciona.

- Reinicie o servidor da 7171 sempre que o `forge-bridge/` mudar (`src/`, `pom.xml`, recursos), seja por uma mudança sua, seja por um `git pull`, merge ou troca de branch que traga mudança nele, antes de dizer que dá para testar. Não espere o pedido.
- Antes de pedir um teste na mesa local, ou quando o jogador disser que algo do servidor não funcionou, confira se o servidor está atrasado: compare a hora em que o processo da 7171 subiu (`Get-NetTCPConnection -LocalPort 7171 -State Listen` e `Get-Process -Id <OwningProcess>` → `StartTime`) com a última mudança no `forge-bridge/` (`git log -1 --format=%ci -- forge-bridge` e o que ainda não foi commitado). Subiu antes: reinicie.
- Como: pare o processo que ouve na 7171 e rode `npm run forge` em segundo plano (`run_in_background`); espere `ws://127.0.0.1:7171/ws` aceitar conexão (a compilação leva até um ou dois minutos) e só então diga que está pronto. Se nada ouve na 7171, suba do mesmo jeito.
- Reiniciar derruba as partidas e salas abertas na mesa local: ao entregar, diga que reiniciou e que é preciso recarregar a mesa e começar a partida de novo.
- Mudança só na mesa (`src/`, `public/`, CSS) não precisa reiniciar.

## Ferramentas

- `npm run css-why -- <página> "<seletor>" [--props a,b]`: quais regras de CSS se aplicam a um elemento e qual vence em cada propriedade. Use antes de subir a especificidade de um seletor. O `style.css` é a base; uma regra de tela que perde para ele precisa de seletor mais forte (não há `@layer`).
- `npm run visual -- snap <pasta>` e `compare <antes> <depois>`: confere que uma refatoração não mudou nenhuma tela.
- `npm run mapa [-- texto]`: cada arquivo do código com o que ele faz e o tamanho. Comece por aqui para achar onde mexer.
- `npm run relatos -- baixar-api` (e `listar`, `mostrar`, `abrir`, `issue`): os relatos dos jogadores, pela área de admin.
- `npm run protocol-doc`: regrava `docs/protocolo.md` (referência dos campos) depois de mudar `src/forge/protocol.ts`.
- `npm run print`, `npm run test:browser`, `npm run test:e2e`, `npm run unused`: ver `TESTES.md` e a skill `/entregar`.
- Chaves do navegador (`localStorage`): só em `src/storage.ts` (`KEYS`); `tests/storage.test.mjs` recusa chave solta.

## Nomes e organização do código

- Arquivo e identificador novos: em inglês, como a maior parte do código (`handView.ts`, `SeatStateView`). Texto que o jogador vê: em português. Comentários: em português. Não renomeie o que já existe só por isso (`salas.ts`, `conta/`, `temas.ts` ficam).
- Todo arquivo de `src/` e do servidor começa com um comentário de uma frase dizendo o que ele faz: é o que o `npm run mapa` mostra (e o `tests/mapa.test.mjs` confere).
- Tipos das mensagens com o servidor: `src/forge/protocol.ts`. Chaves do navegador: `src/storage.ts`. Ícones da interface: `src/ui/icons.ts` (os de um efeito usado num módulo só podem ficar nele). `$` de uma tela: `finder(raiz)` de `src/ui/dom.ts`. Módulo falso num teste: `mock()` de `tests/register.mjs`.
- Arquivo passando de ~600 linhas: divida antes de acrescentar (padrões em `docs/roadmap-manutencao.md`).

## Arquivos grandes

- `CHANGELOG.md` tem as versões desde a 0.100.0 (leia só o topo, `head -40`); as anteriores ficam em `docs/changelog-antigo.md`, que o painel Novidades também lê. Quando o `CHANGELOG.md` passar de ~80 KB, mova as versões mais antigas para o começo das seções de lá.
- `ROADMAP.md` tem só o que falta; os itens concluídos ficam em `docs/roadmap-feito.md`.
- Melhorias internas (estrutura, testes, ferramentas) ficam em `docs/roadmap-manutencao.md`: consulte antes de refatorar e marque o que concluir.

## Testes

Como rodar os testes da mesa e do servidor, e a lista de falhas que já existem, ficam em `TESTES.md`. Antes de investigar uma falha, veja se ela já está lá: as conhecidas não bloqueiam a entrega, só precisam ser citadas. Mantenha a lista em dia (tire o que for corrigido, acrescente o que comprovadamente já falhava antes da sua mudança).
