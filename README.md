# Mesa de Duelo

Simulador de partidas de Magic: The Gathering contra uma IA ou contra outra pessoa pela rede, no navegador, com cartas reais buscadas no [Scryfall](https://scryfall.com/docs/api). Visual inspirado em uma partida do MTG Arena.

As regras, as cartas e a IA são do [Forge](https://github.com/Card-Forge/forge), que roda numa ponte em Java (`forge-bridge/`). O navegador só desenha a mesa e manda os cliques. Veja `forge-bridge/README.md`.

## Instalação

### Requisitos

- [Node.js](https://nodejs.org) 18 ou mais recente (com npm) e Git
- JDK 17 ou mais recente, Maven 3.9+ e cerca de 2 GB de RAM livre para a ponte

No Ubuntu/Debian, Java e Maven saem com `sudo apt install openjdk-17-jdk maven`. Confira com `java -version` e `mvn -v`.

### 1. Baixar e instalar

```bash
git clone https://github.com/kassiogluten/mesa-de-duelo.git
cd mesa-de-duelo
npm install
npm run forge:instalar   # só uma vez: clona o Forge em ~/forge, compila e instala no ~/.m2 (demora vários minutos)
```

### 2. Rodar

Em dois terminais:

```bash
npm run forge      # sobe a ponte em ws://127.0.0.1:7171/ws
npm run dev        # abre o site em http://localhost:5173
```

Na tela inicial, escolha um deck e jogue contra a IA. Abrir com `#jogar` no fim do endereço começa uma partida direto. As imagens e os nomes em português vêm do Scryfall, então o primeiro carregamento de cada deck precisa de internet. Depois eles ficam em cache no navegador.

- Para instalar o Forge em outro lugar, rode `FORGE_DIR=/caminho npm run forge:instalar` e depois `MAVEN_OPTS="-Xmx2g -Dforge.dir=/caminho" npm run forge`.
- A ponte depende da versão do Forge em `forge.version` no `forge-bridge/pom.xml`. Se o `forge:instalar` mostrar outra versão no final (`Forge X instalado em ...`), ajuste esse campo para a versão mostrada.
- Detalhes da ponte e do protocolo estão em `forge-bridge/README.md`.

### Outros comandos

```bash
npm run build      # checagem de tipos + build de produção em dist/
npm run preview    # serve o build de dist/
```

## Partida em rede

Dois jogadores, cada um no seu navegador. Uma máquina (o anfitrião) roda a ponte e o site:

```bash
npm run forge:rede   # ponte aceitando conexões de outras máquinas (0.0.0.0:7171)
npm run dev:rede     # site acessível pela rede (Vite com --host)
```

1. Os dois abrem `http://IP-DO-ANFITRIÃO:5173`, escolhem o deck e o modo **Em rede**.
2. Um clica em **Criar sala** e passa o código de 4 letras; o outro digita o código e clica em **Entrar**. A partida começa na hora.
3. O campo **Ponte** já aponta para a máquina que serviu a página; mude só se a ponte estiver em outro lugar (por exemplo `ws://203.0.113.5:7171/ws`).

Se a conexão cair, o navegador volta sozinho ao mesmo assento, inclusive depois de recarregar a página ou fechar e abrir a aba de novo (a partida fica guardada no `localStorage`). Vale também para partidas contra a IA. A ponte guarda uma partida sem ninguém conectado por 5 minutos (`-Dmesa.grace=SEGUNDOS` em `MAVEN_OPTS` muda isso). No fim, a revanche começa quando os dois pedirem. Fora da rede local é preciso liberar a porta 7171 (e a 5173, se o oponente for abrir o site do anfitrião) no roteador ou usar uma VPN como Tailscale. A ponte não tem senha nem criptografia: só abra para fora em quem você confia.

## Publicar no Coolify

O `docker-compose.yml` sobe dois serviços: `web` (o site no nginx, que repassa `/ws` para a ponte) e `bridge` (a ponte do Forge, compilada dentro da imagem a partir do commit do Forge fixado em `forge-bridge/Dockerfile`).

1. No Coolify, crie um recurso a partir deste repositório no GitHub e escolha o build pack **Docker Compose** (arquivo `docker-compose.yml`).
2. Coloque o domínio (ex.: `https://mesa.seudominio.com`) só no serviço **web**. A ponte não precisa de domínio nem de porta aberta.
3. Defina `ADMIN_PASSWORD` nas variáveis do recurso para ligar a área de admin em `https://seu-dominio/admin` (relatos dos jogadores e partidas em andamento).
4. Faça o deploy. O primeiro build da ponte demora (clona e compila o Forge); o servidor precisa de uns 3 GB de RAM livres para compilar e 2 GB para rodar. `JAVA_OPTS` muda a memória da ponte (padrão `-Xmx2g`).

A página publicada conecta em `wss://seu-dominio/ws` sozinha. Para atualizar o Forge, troque `FORGE_COMMIT` no `forge-bridge/Dockerfile` (e `forge.version` no `pom.xml`, se a versão mudar).

## Relatos dos jogadores

Pelo botão **Enviar sugestão ou erro** (tela inicial e menu da partida), o jogador manda um relato para a ponte (`POST /api/relatos`). Com **Anexar a partida**, vai junto a gravação do que a mesa recebeu e enviou (`src/forge/recording.ts`) e, no servidor, o diário da ponte (decks de todos e retratos do Forge). Desenho completo em `docs/relatos-e-repeticao.md`.

Os relatos se tratam na **área de admin** (`/admin`, senha em `ADMIN_PASSWORD` ou `MESA_ADMIN_PASSWORD` no Coolify, ou `MESA_ADMIN_PASSWORD` na ponte; sem senha, ela fica desligada). Lá dá para filtrar por estado e tipo, ler o relato, repetir a partida na mesa, abrir uma issue já preenchida no GitHub (no seu navegador, sem token no servidor), anotar e marcar como visto, virou issue, resolvido ou descartado, e excluir. A aba **Partidas** mostra as partidas e salas vivas na ponte e o histórico das concluídas (por mês, com totais e o `.jsonl` para baixar; veja `forge-bridge/README.md`), e **Páginas de teste** leva às páginas de `tests/fixtures` (repetição, laboratório de efeitos e as mesas de teste), que também vão no build de produção, fora do cache do app instalado. No `npm run dev`: `MESA_ADMIN_PASSWORD=uma-senha npm run forge` e abra `http://localhost:5173/admin.html`.

Pelo terminal, com os arquivos copiados do servidor:

```bash
node deploy/relatos.mjs baixar             # copia os relatos do container da ponte para ./relatos
node deploy/relatos.mjs listar             # código, data, tipo, versão, formato e tamanho
node deploy/relatos.mjs abrir R-7K2Q       # endereço da página de repetição com o relato aberto
node deploy/relatos.mjs issue R-7K2Q       # monta uma issue só com o texto e o resumo técnico (--criar para publicar)
```

A página de repetição (`/tests/fixtures/replay.html`; com `?relato=R-7K2Q`, abre o relato pela sessão da área de admin) abre um relato ou o arquivo de **Baixar gravação** e entrega os estados gravados à mesa, sem a ponte: tocar e pausar, quadro a quadro, velocidade, ir ao momento do relato, tamanho de tela, aparência das cartas e "reduzir movimento". **Baixar gravação** aparece no painel **Erros da partida** no `npm run dev`, ou em qualquer lugar com `localStorage.setItem('mesa:dev', '1')`.

## Estrutura

| Caminho | O que faz |
|---|---|
| `src/scryfall.ts` | Cliente da API com intervalo entre requisições e cache no `localStorage`. |
| `src/cards.ts` | Dados de exibição de uma carta do Scryfall (nome em português, tipo, cores, imagens). |
| `src/decks.ts` | Decks padrão e decks salvos pelo jogador. |
| `src/ui/` | Telas: início, mesa (`forgeTable.ts`) e montador de decks. |
| `src/forge/client.ts` | Cliente WebSocket da ponte e tipos do protocolo (inclusive salas em rede). |
| `src/forge/recording.ts` e `src/feedback.ts` | Gravação da partida e envio dos relatos, com fila no IndexedDB. |
| `deploy/relatos.mjs` | Triagem dos relatos guardados no servidor. |
| `forge-bridge/` | Ponte em Java para o Forge (licença GPL-3.0). |

Cartas aparecem em português (nome, tipo e imagem da impressão PT do Scryfall) quando existe tradução; sem ela, ficam em inglês.

Magic: The Gathering é marca da Wizards of the Coast. Projeto de fã, sem afiliação. Dados e imagens fornecidos pelo Scryfall.
