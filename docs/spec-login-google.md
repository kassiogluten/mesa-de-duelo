# Spec: Entrar com Google e sincronizar Meus decks

Data: 2026-10-28

## Objetivo

O jogador entra com a conta Google e encontra os mesmos decks em qualquer aparelho. Se ele entrar num navegador que já tem decks, o jogo pergunta o que fazer com eles e junta tudo sem perder nada. Junto com os decks, a conta guarda as preferências da mesa e o apelido.

Continua dando para jogar sem conta, como hoje. A conta só serve para guardar e sincronizar.

## Decisões tomadas

| Tema | Decisão |
| --- | --- |
| Onde guardar | Na ponte Java: um arquivo JSON por conta, no volume `/data` (o mesmo dos relatos). Sem serviço novo. |
| Login | Botão do Google Identity Services no navegador. A ponte confere o ID token do Google uma vez e devolve um token próprio de longa duração. Não há redirecionamento, o que funciona também no PWA instalado. |
| Entrar com decks no navegador | O jogo pergunta: **Juntar à conta** ou **Usar só os da conta**. Na segunda opção, os decks locais vão para uma cópia de segurança exportável; nada é apagado. |
| Mesmo deck diferente nos dois lados | Ficam os dois. A versão deste navegador vira uma cópia com "(deste aparelho)" no nome. |
| Quando sincroniza | Automaticamente e offline-first: grava no navegador na hora e envia em segundo plano. Sem rede, as mudanças esperam numa fila. Ao abrir o jogo, baixa o que mudou em outros aparelhos. |
| Apagar deck | Some de todos os aparelhos e fica 30 dias numa lixeira da conta, de onde pode ser restaurado. |
| Sair da conta | O jogo pergunta: **Manter os decks aqui** ou **Tirar deste navegador**. |
| O que a conta guarda | Decks, preferências da mesa, apelido e foto. |
| Nome na mesa | Um apelido que o jogador pode editar. No primeiro login, se o campo "Seu nome" estiver vazio, ele é preenchido com o primeiro nome do Google. O nome completo nunca vai para o oponente. |
| Foto do Google | Aparece só no cabeçalho do próprio jogador. Não vai para a mesa nem para a ponte de jogo. |
| Botão de entrar | No cabeçalho, e o login é opcional. Em Meus decks, um aviso convida a entrar para guardar os decks. |
| Entrega | Em três fases, cada uma com a sua versão no CHANGELOG. A fase 1 fica escondida (só com `mesa:dev`) até a fase 2 ficar pronta. |
| Google One Tap | Junto com o botão, só na tela inicial e em Meus decks, com o login automático ligado (ver [Google One Tap](#google-one-tap)). |
| E-mail | Não é guardado. |
| Contas paradas | Nunca são apagadas por falta de uso. Só o jogador apaga, em **Apagar minha conta**. |
| Limite | 300 decks por conta. |
| Acompanhamento | O número de contas e de sincronizações aparece no admin e no Grafana. |
| Domínio | `https://mtg.kassio.site`. |

## Como é hoje

- Os decks do jogador ficam no `localStorage`, em `mesa:decks:v2` (`{version: 2, decks, recovery}`), lidos e gravados por `readDeckLibrary` e `writeDeckLibrary` em `src/decks.ts`. Cada deck tem `id` (UUID) e `updatedAt`. Os decks prontos (`builtin`) vêm de `shared/starter-decks.json` e não são do jogador.
- As preferências também estão em chaves soltas do `localStorage`: `mesa:audio:v1`, `mesa:turnNotice`, `mesa:pace`, `mesa:passResponses`, `mesa:autoPassNoActions`, `mesa:opponentStops` e `mesa:name`.
- A ponte (Netty) já atende HTTP em `/api/relatos` e `/api/admin/`. O login de admin (`Admin.java`) guarda os tokens só na memória, e o agregador HTTP aceita corpos de até 64 KB.
- O nginx encaminha `/api/` para a ponte. O service worker não intercepta `/api/` (`navigateFallbackDenylist`).

## Arquitetura

### Ponte: `Accounts.java` em `/api/conta/`

```
POST   entrar            {credential}            → {token, expiresAt, conta}
POST   sair                                       → 200 (invalida o token)
GET    estado?desde=REV                           → {rev, decks: [...mudados desde REV], prefs, perfil}
POST   sincronizar       {mudancas: [...]}        → {rev, aplicadas, conflitos}
GET    lixeira                                    → decks apagados nos últimos 30 dias
POST   lixeira/{id}/restaurar
DELETE conta                                      → apaga a conta e tudo dela
```

- **Conferir o Google**: a ponte confere o ID token com as chaves públicas do Google (`https://www.googleapis.com/oauth2/v3/certs`, guardadas em cache pelo `Cache-Control`). Confere a assinatura RS256, `aud` igual ao client ID, `iss` igual a `accounts.google.com` e `exp` no futuro. Dá para fazer só com `java.security`, sem dependência nova; a alternativa é a `google-api-client`.
- **Identidade**: o `sub` do Google. O arquivo da conta se chama `/data/contas/<sha256(sub)>.json`, para o nome do arquivo não expor o id.
- **Sessão**: o token é aleatório (32 bytes). A ponte guarda só o hash dele, em `/data/contas/sessoes.json`, e a sessão vale 180 dias, renovados a cada uso. Diferente do admin, a sessão precisa sobreviver a um reinício da ponte.
- **Gravação**: cada conta tem um lock, e o arquivo é gravado num temporário e depois renomeado, para nunca ficar pela metade.
- **Limites**: até 300 decks por conta, até 2 MB por pedido (as rotas `/api/conta/` precisam de um agregador maior que os 64 KB de hoje) e limite de pedidos por IP, como no `FeedbackRateLimit`. Os decks passam pela mesma validação do cliente (`validDeck`), refeita na ponte.
- **Dados guardados**: o mínimo, que é `sub`, primeiro nome, URL da foto, apelido, preferências e decks. O e-mail não é guardado.

Formato do arquivo da conta:

```json
{
  "version": 1,
  "rev": 42,
  "perfil": { "nome": "Kassio", "foto": "https://…", "apelido": "Kassio" },
  "prefs": { "mesa:pace": { "valor": "…", "rev": 40 } },
  "decks": [
    { "deck": { "id": "…", "name": "…", "cards": [] }, "rev": 41 },
    { "deck": { "id": "…" }, "rev": 42, "apagadoEm": "2026-10-28T12:00:00Z" }
  ]
}
```

O `rev` é um contador da conta inteira. Cada mudança aceita recebe o próximo número, e com ele o cliente pede só o que mudou desde a última vez (`desde=REV`).

### Navegador

Módulos novos:

- `src/conta/session.ts`: token e perfil em `mesa:conta:v1`, e `contaFetch`, no molde de `src/admin/session.ts`.
- `src/conta/google.ts`: carrega o script do GIS (`accounts.google.com/gsi/client`) só quando o botão vai aparecer, e desenha o botão.
- `src/conta/merge.ts`: as regras de junção e de conflito como **funções puras**, sem `localStorage` nem rede, para serem testadas em `tests/`.
- `src/conta/sync.ts`: a fila de mudanças pendentes, o envio, a busca do que mudou e a coordenação entre abas.
- `src/ui/contaMenu.ts` e `contaMenu.css`: o botão e o menu da conta no cabeçalho, mais os diálogos de entrar e de sair.

Como `src/decks.ts` muda: `saveUserDecks` continua gravando no `localStorage` como hoje e, além disso, avisa o `sync` sobre quais decks mudaram ou foram apagados (comparando com a lista anterior). Os decks prontos nunca sobem para a conta. O `localStorage` continua sendo a fonte de verdade local: a conta é uma réplica.

Estado local de sincronia, em `mesa:conta:sync:v1`:

```json
{ "sub": "…", "rev": 42, "base": { "<deckId>": 41 }, "pendentes": { "<deckId>": "salvo" | "apagado" } }
```

### Protocolo de sincronia

1. **Enviar**: cada mudança pendente vai como `{id, baseRev, deck}` ou `{id, baseRev, apagar: true}`.
2. **Na ponte**: se o `rev` do deck na conta for igual ao `baseRev`, a mudança é aplicada. Se for maior, alguém mudou o deck em outro aparelho, e a ponte devolve um **conflito** com a versão da conta.
3. **Conflito**: o cliente adota a versão da conta com o mesmo `id`, guarda a versão local como cópia, com novo `id` e "(deste aparelho)" no nome, e envia a cópia. Se as duas versões tiverem o mesmo conteúdo (mesma impressão digital de cartas, sideboard, comandantes e nome), não há conflito.
4. **Apagar contra editar**: se um aparelho apagou e outro editou depois, a edição vence e o deck sai da lixeira. Não se perde trabalho.
5. **Baixar**: ao abrir o jogo, ao voltar para a aba (`visibilitychange`), depois de enviar, e a cada 5 minutos com a aba visível.
6. **Várias abas**: só uma aba envia de cada vez (`navigator.locks`). As outras ficam sabendo das mudanças pelo evento `storage` e redesenham a lista.
7. **Sem rede**: a fila fica no `localStorage` e é enviada quando a conexão voltar (`online`). Um selo discreto no menu da conta diz "Sincronizado", "Enviando…" ou "Sem conexão: N alterações esperando".

### Primeiro login neste navegador

1. O jogador toca em **Entrar com Google**. A ponte devolve o token, e o cliente baixa o estado da conta (`desde=0`).
2. O jogo calcula os decks locais que **não estão na conta**. Ficam de fora os que têm o mesmo `id` e o mesmo conteúdo, e também os que têm o mesmo conteúdo com outro `id` (por exemplo, a mesma cópia de deck pronto feita em dois aparelhos).
3. Se não sobrar nenhum, os decks da conta entram direto, sem pergunta.
4. Se sobrar algum, aparece o diálogo:
   > **Este navegador tem 5 decks que não estão na sua conta.**
   > [Juntar à conta] [Usar só os da conta]
   - **Juntar à conta**: os decks locais sobem. Os que têm o mesmo `id` de um deck da conta, mas conteúdo diferente, seguem a regra de conflito (ficam os dois).
   - **Usar só os da conta**: os decks locais vão para `mesa:decks:antes-da-conta:<data>` e podem ser baixados pela exportação de recuperação que já existe. O navegador passa a mostrar só os decks da conta.
5. Se o jogador fechar o diálogo sem escolher, ele continua deslogado e nada muda.

### Sair da conta

> **Sair da conta**
> [Manter os decks aqui] [Tirar deste navegador]

- **Manter**: os decks continuam como decks locais comuns, e o estado de sincronia é apagado.
- **Tirar**: as mudanças pendentes são enviadas antes (se não der, o jogo avisa que elas se perderiam e oferece exportar). Depois, decks, preferências sincronizadas e apelido saem do navegador.
- **Trocar de conta** (entrar com a conta B num navegador ligado à conta A): conta como sair da A, com a mesma pergunta, e entrar na B.

### Preferências e apelido (fase 3)

- Chaves sincronizadas: `mesa:audio:v1`, `mesa:turnNotice`, `mesa:pace`, `mesa:passResponses`, `mesa:autoPassNoActions`, `mesa:opponentStops` e `mesa:name`, que é o apelido.
- Ficam de fora: `mesa:resume`, `mesa:novidades`, `mesa:dev`, o cache de cartas e o rascunho do modo livre (`mesa:livre`), que são deste aparelho.
- Vale a última gravação de cada chave, sem pergunta. Ao entrar pela primeira vez, se a conta ainda não tiver preferências, as do navegador sobem.
- As leituras e gravações dessas chaves passam por um único ponto (por exemplo, `src/prefs.ts`), em vez dos `localStorage.setItem` espalhados de hoje.

### Google One Tap

Avaliado em 28/10/2026: **é possível e vale usar**, como complemento ao botão, não no lugar dele.

- **Custo baixo**: o One Tap faz parte da mesma biblioteca (GIS) e devolve o mesmo ID token que o botão. A rota `POST entrar` da ponte não muda, e o trabalho extra fica só no navegador (`google.accounts.id.prompt()`).
- **O que ganha**: quem já tem sessão no Google entra com um toque, sem procurar o botão. Com `auto_select`, quem já entrou antes volta logado sozinho num navegador novo, e isso dispara a pergunta de juntar decks.
- **Limitações** (documentação do Google):
  - Só aparece se o jogador tiver uma sessão ativa no Google naquele navegador.
  - No Safari, no Firefox e em qualquer navegador do iOS, o bloqueio de rastreamento (ITP) troca o One Tap por uma página de boas-vindas seguida de um popup, e o login automático não funciona. No iPhone, o ganho é pequeno.
  - Com FedCM (Chrome 117 ou mais novo), o próprio navegador desenha o aviso: no computador, não dá para escolher a posição. Ele também some se o jogador tiver desligado o "login de terceiros" no Chrome.
  - Quando o jogador fecha o aviso, ele fica escondido por um tempo que cresce a cada vez que é fechado (2 horas, 1 dia, 1 semana, 4 semanas). Isso protege contra insistência, mas obriga o botão do cabeçalho a continuar existindo.
  - O login automático espera 10 minutos entre uma tentativa e outra, o que atrapalha os testes. É preciso esperar ou usar outra conta Google.
  - Os métodos `isDisplayed()`, `isNotDisplayed()` e `getSkippedReason()` não funcionam com FedCM. O código não pode depender de saber se o aviso apareceu.
  - Se um dia o site tiver CSP, é preciso liberar `accounts.google.com` em `script-src`, `connect-src`, `frame-src` e `style-src`. O nginx não tem CSP hoje.
- **Onde mostrar (sugestão)**: só na tela inicial e em Meus decks, e nunca durante uma partida, na sala de espera ou no modo livre, para não cobrir a mesa. Ficaria em `use_fedcm_for_prompt: true`, `auto_select: true` e `cancel_on_tap_outside: true`.
- **Decidido**: entra na fase 1, junto com o botão, só na tela inicial e em Meus decks, com o login automático ligado.

### Configuração do Google

- No Google Cloud Console, criar um projeto e um **OAuth Client ID do tipo "Web application"**. As origens JavaScript autorizadas são `https://mtg.kassio.site` e `http://localhost:5173`.
- Tela de consentimento: só os escopos `openid profile`, que não exigem verificação do Google. Ela pede o nome do app, o logo e o link de uma **página de política de privacidade**, que precisa existir no site.
- Variável: `GOOGLE_CLIENT_ID` no Coolify. O `docker-compose.yml` repassa o mesmo valor para o build do site (`VITE_GOOGLE_CLIENT_ID`) e para a ponte (`MESA_GOOGLE_CLIENT_ID`). Localmente, os dois ficam no `.env` (ver `.env.example`). Sem client ID, o botão não aparece e `/api/conta/` responde 503, como faz a área de admin sem senha.
- Limitação: o GIS não aceita origens por IP. No `npm run dev:rede` (celular na rede local, com IP), o login não funciona, e o resto do jogo continua normal.

## Fases

### Fase 1: conta (escondida, sem versão nova)

Tudo desta fase fica atrás de `mesa:dev`. Por isso, ela não muda a versão nem ganha CHANGELOG ou novidades.html: o primeiro item que o jogador vê é o da fase 2, que traz também o login.

- [x] `Accounts.java` e `GoogleIdToken.java`: entrar, sair, `eu`, apagar conta, sessão persistente (180 dias, renovada com o uso, até 20 aparelhos por conta), conferência do ID token sem dependência nova e limite de 20 logins por IP a cada 15 minutos. Testes em `AccountsTest`.
- [x] Agregador maior só para `/api/conta/sincronizar` (4 MB), feito na fase 2.
- [x] `GOOGLE_CLIENT_ID` no compose (ponte e build do site), `location /api/conta/` no nginx e `.env.example`.
- [x] One Tap na tela inicial e em Meus decks, com login automático para quem já entrou antes (ver [Google One Tap](#google-one-tap)). Ele é cancelado ao abrir a mesa, e o login automático é desligado ao sair.
- [x] Botão **Entrar com Google** no cabeçalho (só o ícone no celular). Logado, ele vira a foto com um menu: nome, **Sair**, **Apagar minha conta**. No computador, a conta fica depois de Novidades; no celular, na linha das abas.
- [x] Página de política de privacidade (`privacidade.html`, versão 0.63.0), linkada no rodapé e no menu da conta. Ela já descreve a sincronia e a lixeira da fase 2; se a fase 2 mudar algo do que está lá, a página muda junto.
- [x] Teste com um ID token falso assinado por uma chave de teste (`AccountsTest`), em vez do `test-protocol.mjs`: as rotas são HTTP e são testadas direto.
- [ ] Testar de ponta a ponta com o client ID real: computador feito em 28/10/2026 (login e pergunta de juntar); faltam Android e iPhone com o PWA instalado.
- [x] Métricas na ponte: `mesa_accounts` (contas), `mesa_accounts_sessions` (aparelhos logados) e `mesa_accounts_logins_total{result=ok|recusado|limite|erro}`.
- [x] Painel no Grafana (linha "Contas dos jogadores": contas, aparelhos conectados e logins por hora) e, no admin, o total de contas e de aparelhos no resumo da aba Partidas.

### Fase 2: sincronizar Meus decks (0.63.0)

- [x] `merge.ts` com testes: junção no primeiro login, deduplicação por conteúdo, conflito que mantém os dois e apagar contra editar.
- [x] `sync.ts`: fila, envio, busca do que mudou, várias abas e sem rede. Testado no navegador com a ponte simulada (junção, mudanças de outro aparelho, conflito, sem conexão, lixeira, sair, cancelar).
- [x] Rotas `estado` e `sincronizar` na ponte, com `rev` por conta (`AccountDecks.java`, testes em `AccountDecksTest`). `sincronizar` aceita até 4 MB.
- [x] Tirar o login de trás de `mesa:dev`: as contas aparecem sempre que o site é gerado com `GOOGLE_CLIENT_ID`.
- [x] Métricas de sincronia: `mesa_accounts_syncs_total`, no painel "Logins e sincronizações" do Grafana.
- [x] Diálogo do primeiro login: **Juntar à conta** / **Usar só os da conta**. A cópia de antes da conta sai pelo menu da conta (**Baixar decks de antes da conta**).
- [x] Diálogo de sair: **Manter os decks aqui** / **Tirar deste navegador**, com aviso quando há alterações ainda não enviadas.
- [x] Lixeira: lista dos decks apagados nos últimos 30 dias, com **Restaurar**, no menu da conta.
- [x] Linha de sincronia no menu da conta (sincronizados, sincronizando, sem conexão com N alterações, erro) e contorno na foto quando há aviso.
- [x] Faixa em Meus decks para quem tem decks e não entrou: "Seus decks ficam só neste navegador. Entre com Google para tê-los em qualquer aparelho.", com o botão do Google e um × que a esconde no aparelho.
- [x] Prints tirados no próprio jogo com a ponte simulada por um script de página (no lugar de uma página em `tests/fixtures/`).
- [x] CHANGELOG (na 0.63.0) e novidades.html: botão, pergunta ao entrar, menu da conta, lixeira e faixa em Meus decks.

### Fase 3: preferências, apelido e foto (0.64.0)

- [ ] `src/prefs.ts` reunindo as chaves sincronizadas.
- [ ] Sincronizar as preferências e o apelido (vale a última gravação).
- [ ] Apelido sugerido pelo primeiro nome do Google quando "Seu nome" estiver vazio.
- [ ] CHANGELOG e novidades.html.

## Riscos

- **Perder decks** é o pior defeito possível aqui. Toda operação destrutiva (usar só os da conta, tirar do navegador, conflito) guarda uma cópia antes, e as regras ficam em funções puras com testes.
- **Volume `/data`**: hoje ele guarda relatos com retenção de 90 dias ou 1 GB. As contas não podem entrar nessa limpeza. Elas ficam numa pasta própria (`/data/contas/`), fora da regra de retenção, e precisam de backup do volume no Coolify.
- **Safari e bloqueio de cookies de terceiros**: o GIS usa FedCM ou um popup e, em geral, funciona. Mesmo assim, é preciso testar no iPhone, com o PWA instalado.
- **LGPD**: dado pessoal mínimo, política de privacidade publicada e **Apagar minha conta** funcionando desde a fase 1.

## Decisões em aberto

Nenhuma. As que estavam aqui foram respondidas em 28/10/2026 e estão em [Decisões tomadas](#decisões-tomadas).

## Antes de começar

- Criar o projeto e o OAuth Client ID no Google Cloud Console, com a origem `https://mtg.kassio.site`.
- Pôr `GOOGLE_CLIENT_ID` no Coolify.
- Ligar o backup do volume `/data` no Coolify.
