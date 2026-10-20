# forge-bridge

Ponte entre o motor de regras do [Forge](https://github.com/Card-Forge/forge) e o frontend da Mesa de Duelo. O Forge roda sem tela, em Java. O navegador recebe o estado da partida em JSON e manda de volta os cliques e as respostas, por WebSocket.

Licença: **GPL-3.0-or-later**, a mesma do Forge (veja `LICENSE`). A ponte usa o código do Forge como biblioteca, então é uma obra derivada dele. O frontend em `../src` só conversa com ela pela rede.

## Instalação

Precisa de JDK 17 ou mais recente e de Maven.

```bash
./scripts/instalar-forge.sh   # clona o Forge em ~/forge (ou $FORGE_DIR), compila e instala no ~/.m2
./scripts/rodar.sh            # sobe a ponte em ws://127.0.0.1:7171/ws (modo play)
./scripts/rodar.sh --host=0.0.0.0   # idem, aceitando outras máquinas (partidas em rede)
```

Pela raiz do projeto, os mesmos comandos são `npm run forge:instalar` e `npm run forge`.

- O `instalar-forge.sh` corrige os poms instalados. O Forge usa a versão `${revision}` sem o flatten-maven-plugin, e sem essa correção o Maven não resolve a dependência fora do projeto do Forge.
- A ponte lê as cartas de `~/forge/forge-gui/res`. Para usar outro lugar, rode com `-Dforge.dir=...`.
- As preferências e os logs do Forge ficam em `~/.forge`.

## Modos

| Comando | O que faz |
|---|---|
| `./scripts/rodar.sh` | **play**: humano x IA (`start`) e humano x humano em salas (`host`/`join`). Cada conexão joga a sua partida. |
| `./scripts/rodar.sh --mode=watch --a=verde --b=vermelho --delay=150` | **watch**: partidas IA x IA, transmitindo o estado a cada evento. Útil para depurar o JSON. |
| `--lang=en-US` | Idioma dos prompts do Forge (padrão `pt-BR`). |
| `--port=7171` | Porta da WebSocket. |
| `--host=127.0.0.1` | Endereço em que a ponte escuta. Use `0.0.0.0` para partidas em rede (`npm run forge:rede`). |

## Protocolo

### Servidor → navegador

```jsonc
{
  "type": "state",
  "turn": 3, "phase": "MAIN1", "activePlayer": 0, "gameOver": false, "winner": null,
  "you": 0,
  "players": [{ "id": 0, "name": "Você", "life": 20, "library": 30, "handCount": 6,
                "hand": [/* cartas; vazio para o oponente */], "battlefield": [], "graveyard": [], "exile": [],
                "pool": { "W": 0, "U": 0, "B": 0, "R": 0, "G": 1, "C": 0 } }],
  "stack": [{ "id": 12, "text": "...", "source": { /* carta */ }, "controller": 1,
              "targets": { "cards": [40], "players": [] } }], // alvos, somando as sub-habilidades
  "combat": [{ "attacker": 40, "defender": 0, "blockers": [33] }],
  "log": ["..."],
  "input": { "message": "Prioridade: Você ...", "ok": { "label": "OK", "enabled": true },
             "cancel": { "label": "Fim de Turno", "enabled": true }, "selectable": [29, 31],
             // conjurando (escolhendo alvos ou pagando): a carta que alveja e os alvos já escolhidos
             "targeting": { "source": 18, "card": { /* carta */ }, "cards": [], "players": [1] } },
  "question": null,
  "session": { "code": "K7QM", "token": "...", "room": true }, // para voltar com "rejoin" se a conexão cair
  "room": null, // em rede: { "code": "K7QM", "seat": 0, "token": "...", "started": true,
                //            "players": [{ "name": "Ana", "connected": true, "rematch": false }] }
  "decks": ["vermelho", "verde", "azorius"]
}
```

Cada carta tem: `id`, `name` (em inglês, usado para buscar a imagem no Scryfall), `set`, `manaCost`, `typeLine`, `text`, `creature`, `land`, `power`, `toughness`, `damage`, `tapped`, `sick`, `attacking`, `blocking` e `counters`. Quando se aplicam, também vêm `planeswalker: true`, `attachedTo` (id da carta a que uma aura ou equipamento está preso), `attachedToPlayer` (jogador encantado) e `copyOf` (nome original de uma carta que está copiando outra, como Clone). Criaturas trazem também `basePower`/`baseToughness` (sem bônus, marcadores nem efeitos). `keywords` lista as palavras-chave atuais, com os nomes do enum `Keyword` do Forge (`FLYING`, `FIRST_STRIKE`…), incluindo as palavras-chave ganhas por efeitos. Em `combat`, `defender` é o id do jogador ou do planeswalker atacado.

Turnos e combates extras: `extraTurn: true` quando o turno atual é extra; `extraTurns` lista os jogadores dos turnos extras que ainda vêm, na ordem; durante um combate, `combatNumber` diz qual combate do turno é (2 = o primeiro extra); `extraCombats` conta os combates extras ainda por vir e `extraCombatAfter` traz as fases depois das quais eles começam (`MAIN1`, `MAIN2`, `COMBAT_END`…). Os campos só aparecem quando há algo extra.

`question` aparece quando o Forge precisa de uma decisão e a partida fica parada até a resposta:

| `kind` | Campos | Resposta |
|---|---|---|
| `choose` | `title`, `min`, `max`, `options[]` (`label`, e `card` ou `id` de jogador) | `{type:"answer", id, indices:[...]}` |
| `confirm` | `title`, `options` (rótulos sim/não), `card?` | `{type:"answer", id, value:true}` |
| `order` | `title`, `options[]` | `{type:"answer", id, indices:[nova ordem]}` |
| `text` | `title`, `initial`, `numeric` | `{type:"answer", id, text:"3"}` |

`purpose` marca perguntas com tela própria na mesa:

- `"triggers"` (`kind: "order"`): gatilhos simultâneos. Cada opção traz `kind: "ability"`, `card` (a carta de origem) e `ability` (o texto do gatilho sem o nome da carta). A primeira da resposta resolve primeiro. Quando o Forge já tem uma ordem guardada para o mesmo conjunto de gatilhos, ela vem como ordem inicial das opções.
- `"combat-damage"` (`kind: "amount"`, `method: "assignCombatDamage"`): dividir o dano de um atacante bloqueado por duas ou mais criaturas, ou com atropelar. `card` é o atacante e `total` o dano. Cada opção traz `card` e `lethal` (o dano que já mata aquele bloqueador, 1 com toque mortífero, a lealdade num planeswalker). A opção com `defender: true` é o jogador ou planeswalker atacado, que recebe o excesso. `ordered` diz se um bloqueador só recebe dano depois do letal no anterior; `free` libera qualquer divisão. O defensor só recebe dano quando todos os bloqueadores têm letal. `suggested` é a divisão automática do Forge. A resposta é `{type:"answer", id, amounts:[...]}`, e a ponte recusa uma divisão fora dessas regras.
- `"play-mode"` (`method: "getAbilityToPlay"`): jeitos de jogar uma carta ou de ativar uma habilidade. Cada opção traz `mode` (`cast`, `land`, `cycling`, `plot`, `foretell`, `flashback`, `evoke`, `adventure`, `ability`… e os custos alternativos do Forge em minúsculas), `spell`, `cost` (só a mana, como `{1}{R}`), `extra` (os outros custos, como o Forge escreve), `description` e, quando a opção usa outra face ou metade, `face` com `name`, `manaCost` e `typeLine`. Responder com `indices: []` cancela sem jogar nada.

`events` traz os eventos públicos do jogo em ordem (`seq` crescente; `eventCursor` é o último), cada um com `type`, `actor` (jogador), `card`/`sourceId` (a carta de origem), `targets` e, quase sempre, `frame` (a mesa pública naquele instante, para a animação mostrar o estado certo).

Compra (`draw`) só traz `actor`: a carta comprada é secreta e o evento vai para todos. Descarte (`discard`) traz a carta (pública no cemitério), `actor` (o dono), `from: "Hand"` e `to: "Graveyard"`; vale para qualquer carta que vá da mão para o cemitério. Moer (`mill`) chega um por carta, na ordem em que saem do topo do grimório, com a carta (já pública), `actor` (o dono), `from: "Library"`, `to: "Graveyard"`, `sourceName` (a mágica ou habilidade que estava resolvendo, quando há) e `surveil: true` quando a carta foi para o cemitério por vidência, não por moer.

Dano (`type: "damage"`) chega um por fonte e alvo, na ordem em que o Forge causa o dano; `card`/`sourceId` é a fonte, `targets` o alvo e `delta` o dano (negativo). A ponte acrescenta, a partir do estado do jogo (nunca do texto):

| Campo | Quando |
|---|---|
| `combat` | sempre: `true` no dano de combate. Nas criaturas o Forge não diz; a ponte usa a etapa de dano de combate, a fonte em combate e nada resolvendo na pilha. |
| `step` | no combate: `"first-strike"` (etapa de iniciativa) ou `"regular"`. |
| `doubleStrike`, `deathtouch`, `lifelink` | a fonte tem golpe duplo, toque mortífero ou vínculo com a vida. |
| `trample` | um atacante bloqueado causando dano ao jogador ou planeswalker que ataca (o excesso de atropelar). |
| `wither` | o dano virou marcadores −1/−1 numa criatura (murchar ou infectar). |
| `infect` | o dano a um jogador virou veneno. |
| `loyalty` | dano a planeswalker. O Forge só avisa a lealdade caindo; a queda vira `damage` quando acontece no dano de combate (a fonte é o atacante desse planeswalker) ou enquanto outra carta resolve (a fonte é ela). |
| `commander` | dano de combate de um comandante a um jogador. |
| `self` | o jogador atingido controla a fonte (dor: terrenos de dor, Sol Ring de dor…). |
| `prevented` | o dano foi gasto num escudo de prevenção ("previna os próximos N"): `delta` é o quanto foi prevenido. O Forge não avisa; a ponte vê o escudo diminuir (fora da limpeza do turno, onde eles expiram). Prevenções sem escudo (como Neblina) ainda não aparecem. |
| `lethal` | criatura com dano marcado igual ou maior que a resistência (ou com toque mortífero), planeswalker sem lealdade, ou jogador cuja vida, somando o dano ainda não aplicado, chega a 0. |

Saída do campo (`left`) traz `reason: "destroyed"` ou `"sacrificed"` quando é o caso (destruída e sacrificada vão para o cemitério; `to` diz para onde a carta foi: `Graveyard`, `Exile`, `Hand`, `Library`).

Permanentes trazem, quando se aplicam: `ward` (custo da proteção contra alvos, como `"{2}"` ou o custo descrito pelo Forge), `protection` (de que a proteção protege: `"red"`, `"artifact"`, `"multicolored"`…, do parâmetro da palavra-chave), `phasedOut`, `cantAttack` / `cantBlock` (proibida por um efeito, pelas regras de combate do Forge; não conta enjoo, estar virada nem defensor) e `preventDamage` (dano que os escudos ainda vão prevenir; também nos jogadores).

A perda de vida pelo dano vem depois, em `life-changed` (o Forge tira a vida de todos de uma vez); o ganho do vínculo com a vida vem como `life-changed` positivo do controlador logo depois do dano da fonte.

Também chegam `{type:"toast", text}` com mensagens do Forge e `{type:"error", text}` quando um comando falha. Quando a ponte ignora uma ação vencida (pedido que já mudou, clique duplo), chega `{type:"diagnostic", code:"stale-action", action, text}`: a mesa não mostra aviso, só registra no painel "Erros da partida". Em rede chega `{type:"room", room}` ao criar, entrar ou voltar para uma sala, com o mesmo formato do campo `room`.

A mão do oponente vai só como contagem, as perguntas vão só para quem precisa responder, e um clique numa carta da mão do outro jogador é ignorado.

### Navegador → servidor

| Mensagem | Efeito |
|---|---|
| `{type:"start", you, opponent}` | Começa uma partida contra a IA. Cada deck é um id padrão (`"verde"`) ou `{name, cards:[{name, count}]}`. |
| `{type:"host", name, deck}` | Cria uma sala em rede e responde com `room` (código de 4 letras). |
| `{type:"join", code, name, deck}` | Entra na sala; com os dois assentos ocupados, a partida começa. |
| `{type:"rejoin", code, token}` | Volta ao assento depois de a conexão cair, em sala ou contra a IA (`code` e `token` vêm em `session`). Se a partida não existe mais, a resposta é `{type:"gone", text}`; se outra conexão ocupava o assento, ela recebe `{type:"replaced", text}` e é fechada. |
| `{type:"rematch"}` | Contra a IA recomeça na hora; em rede, quando os dois pedirem. |
| `{type:"leave"}` | Concede e sai da sala. A sala fecha quando não sobra ninguém conectado. |
| `{type:"card", id}` | Clica numa carta: jogar, conjurar, escolher alvo, atacar, bloquear ou pagar mana. |
| `{type:"player", id}` | Clica num jogador, por exemplo como alvo. |
| `{type:"ok"}` / `{type:"cancel"}` | Os dois botões do Forge; os rótulos vêm em `input`. |
| `{type:"pass-turn", gen}` | Passa até o fim do turno (o "Fim de turno" da mesa). |
| `{type:"resolve-all", gen}` | Passa até a pilha esvaziar. Para sozinho se algo novo entrar na pilha ou se o jogo pedir uma decisão sua. |
| `{type:"concede"}` | Desiste da partida. |
| `{type:"answer", ...}` | Responde à `question` aberta. |

## Como funciona

- `HeadlessGui` faz o papel de interface sem tela. Ela tem sua própria thread de "interface", porque as entradas do jogador humano exigem que a thread do jogo seja outra.
- `WebGuiGame` estende o `ProtocolGuiGame` do Forge, que já transforma cada chamada da tela num evento. Ele também define as paradas de fase: na sua fase principal 1 e 2 e na janela depois dos bloqueios.
- `Session` é uma partida: um ou dois assentos humanos (`Seat`), cada um com o seu `WebGuiGame`, prompt, perguntas e conexão. Ela monta o estado visto por cada jogador. Os cliques do navegador são repassados ao `PlayerControllerHuman` do assento, sempre pela thread de interface.
- `Rooms` liga cada conexão a uma `Session`, cuida das salas (códigos, reconexão, revanche) e publica o estado a cada 50 ms. Uma partida sem ninguém conectado é encerrada depois de 5 minutos (`-Dmesa.grace=SEGUNDOS`).
- A distribuição de dano de combate entre vários bloqueadores é feita automaticamente: dano letal em cada um, na ordem, e o resto vai para o jogador quando há atropelar.
