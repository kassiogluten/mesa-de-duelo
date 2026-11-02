# Animações de 02/11/2026

Resumo das animações que entraram na mesa hoje (versões 0.108.0, 0.113.0, 0.114.0 e 0.115.0) e sugestões para as próximas.

Todas seguem as mesmas regras: não seguram a vez do jogador, acompanham o modo acelerado e, com "reduzir movimento" ligado no sistema, ficam só o número, a cor e o destaque no lugar certo. O código fica em `src/ui/motion.ts` (voos, molas e saídas) e `src/ui/planeswalkerEffects.ts`. Para testar, use o laboratório de efeitos (`tests/fixtures/effects-lab.html`).

---

## O que foi feito hoje

### 0.108.0: Destaque para os planeswalkers

| Momento | O que se vê |
|---|---|
| **Entrada no campo** | Depois de assentar, a moldura acende na cor do planeswalker (dourado se tiver várias cores, prata se for incolor), um anel de luz se abre em volta da carta e o escudo de lealdade surge com um pulo, mostrando o valor inicial. |
| **Habilidade de lealdade** | O escudo pula e fica verde no **+**, vermelho no **−** e dourado no **0** por cerca de 1 s. O custo ("+2", "−3") sobe do topo da carta como um número de dano. O aviso mostra o custo num escudo e o texto da habilidade ("Ana usou +2 de Jace Beleren"). |
| **Ultimate** | Uma onda de luz parte da carta e atravessa a mesa, a mesa treme de leve, o número sai maior com o selo **Ultimate** e o aviso fica maior e dura mais (2,6 s). |
| **Som** | Sons próprios para a entrada (`31-walker`) e a lealdade (`32-loyalty`) nos 8 pacotes. O ultimate toca o da lealdade mais grave (0,8×) e mais forte. |

### 0.113.0: Cartas voam da mão com peso

- A carta jogada (terreno ou mágica) sai **do lugar dela no leque**, com o tamanho e a inclinação que tinha.
- Voa **em arco**: cresce no meio do voo, inclina para o lado em que vai, e a sombra acompanha a altura.
- A mágica conjurada vai **até a pilha**, no canto da mesa (antes ia para o meio). Quando resolve, a permanente **sai da pilha para o campo**.
- No campo, chega já no tamanho certo e **pousa com um quique leve** e uma **onda dourada** em volta.
- Corrigido: a criatura que resolvia ganhava uma segunda cópia voando até ela depois de pousar.

### 0.114.0: Mágicas saem da pilha, mesa com mola e compra em arco

- **Resolver:** a mágica (como o Lightning Bolt) sai da pilha e cai **em arco no cemitério**. O raio do dano também parte da pilha. A habilidade de uma permanente **volta para a carta que a gerou**.
- **Anular:** a mágica **racha na pilha** e cai apagada no cemitério.
- **Monte que recebe pulsa:** o cemitério (ou outro monte) dá um pulso quando a carta chega.
- **Mesa com mola:** tudo que se mexe na mesa (campo e mão abrindo espaço, carta que muda de lugar ou de tamanho, virar e desvirar) assenta com uma mola leve em vez de parar seco. As molas são calculadas (`spring(rigidez, amortecimento)`) e viram `linear()` no CSS.
- **Compra em arco:** a carta sobe do grimório em arco, inclinada e com sombra, chega ao lugar dela no leque já no giro dele e **vira de face para cima com um quique**. Até 7 voos por compra; numa compra grande o resto chega junto com o último.
- O laboratório de efeitos ganhou **Comprar**, **Conjurar e anular** e **Lightning Bolt da mão**.

### 0.115.0: Saídas do campo em arco, fichas com mola, ataque com avanço e janelas com mola

- **Saídas do campo em arco** (todo destino menos o exílio, que continua se apagando num brilho branco):
  - **Destruída:** racha e cai escurecida no cemitério.
  - **Sacrificada ou morta em combate:** cai em sépia no cemitério, ou volta ao grimório.
  - **Devolvida à sua mão:** volta ao lugar dela no leque, já no giro dele.
  - **Descarte:** sai do lugar da carta no leque e cai em arco no cemitério.
  - O monte que recebe a carta pulsa.
- **Fichas com mola:** fichas criadas juntas surgem no lugar com uma mola; as que vêm de outro lugar chegam em arco e assentam. Quando a última pousa, o monte ganha uma **onda dourada**.
- **Ataque com avanço:** ao declarar o ataque, cada atacante **recua um pouco e avança** na direção do oponente, um depois do outro.
- **Janelas e menu com mola:** as escolhas, a barra da escolha recolhida e o aviso de decisão entram com uma mola leve (`--ease-spring`, `--ease-settle`), e o **Menu** da partida desce do botão.
- O laboratório de efeitos ganhou **Atacar** e aceita `move:<movimento>` e `tokens:<N>` no `?jogar`.

---

## Sugestões de novas animações

> **Feitas na 0.117.0**, todas as 19. O servidor passou a mandar `shuffle`, `scry`, `coin`, `die`, `attached` e `control-changed`, e `fight` no dano e `searched` na compra (ver `forge-bridge/README.md`). Transformar não tem evento no Forge: a mesa percebe quando o nome de uma permanente muda. No laboratório de efeitos, a seção **Movimentos da 0.117.0** tem um botão para cada movimento.

Ordenadas pelo que mais ajuda o jogador a entender a mesa (critério: intuitivo, limpo, imersivo). O que já existe e não entra aqui: dano e projéteis (item 15 do `ROADMAP.md`), movimentos das permanentes (item 16), efeitos contínuos (item 17), mill (item 24) e planeswalkers (item 80).

### Prioridade alta: o jogador perde informação sem elas

1. **Bloqueio que desliza até o atacante.** Hoje o bloqueador só pulsa (`event.type === 'blockers'`). Ele deveria deslizar um pouco na direção do atacante, com uma ligação clara entre os dois, e voltar ao lugar. É o único passo do combate que ainda não tem movimento, e no Commander, com vários combates, é onde mais se confunde quem bloqueou quem. (Já está pendente no item 8 do `ROADMAP.md`.)
2. **Reanimar: do cemitério para o campo.** A carta sobe do cemitério em arco, com um brilho roxo escuro, e pousa no campo. Hoje ela só aparece. Reanimação é comum no Commander e passa despercebida, principalmente quando é o oponente.
3. **Busca no grimório (tutor) até a mão.** A carta encontrada sai do grimório, mostra a face por um instante (se for revelada) e voa para a mão. Quando vai para o campo (busca de terreno, como Cultivate ou Rampant Growth), voa direto para lá virada ou não, conforme a carta. Dá para reaproveitar o voo da compra.
4. **Trocar de controle.** A carta desliza do campo de um jogador para o do outro, com um contorno na cor do novo dono que some aos poucos. Hoje ela some de um lado e aparece do outro, e o jogador não percebe que perdeu a criatura (Control Magic, Threaten, Treachery).
5. **Equipar e encantar.** O equipamento ou a aura voa até a criatura e se encaixa atrás dela no leque de anexos, com um pulso curto na criatura. Ao trocar o equipamento de criatura, ele salta de uma para outra.

### Prioridade média: dão peso a jogadas comuns

6. **Transformar (dupla face).** Um giro 3D de 180° no lugar (como a compra que vira de face), trocando a imagem no meio do giro. Vale para lobisomens, sagas que viram criatura, cartas MDFC e o "dia e noite".
7. **Embaralhar.** O grimório balança de leve e as cartas do topo se mexem de lado, por meio segundo. Hoje embaralhar não tem retorno nenhum, e é a forma de o jogador ver que um tutor ou uma busca do oponente terminou.
8. **Vidência e "olhar o topo".** As cartas saem do grimório em leque e, depois da escolha, as que vão para o fundo deslizam por baixo do monte e as do topo voltam por cima. Hoje a escolha some e o grimório fica igual.
9. **Revelar carta.** A carta revelada (do oponente, da mão ou do topo) cresce no meio da tela por um instante, com o nome de quem revelou, e volta para onde estava. Ajuda quando o oponente revela por um efeito que você não acompanhou.
10. **Comandante volta à zona de comando.** Quando o comandante morre ou é exilado e o dono escolhe a zona de comando, ele voa em arco até lá com um brilho dourado, e o imposto (+2) aparece subindo do selo. Hoje ele some.
11. **Conjurar do cemitério ou do exílio** (flashback, escape, foretell, aventura). A carta sai do monte de origem (e não da mão) em arco até a pilha, com um rastro na cor do cemitério ou do exílio, para deixar claro de onde veio.
12. **Lutar (fight).** As duas criaturas avançam uma contra a outra ao mesmo tempo, se chocam no meio e voltam, com o dano de cada uma no impacto. Hoje aparece como dois danos de mágica soltos.
13. **Marcadores +1/+1 crescendo.** Ao receber marcadores, a carta cresce um pouco e assenta com a mola da mesa, e o número salta. Hoje há som e o brilho fixo, mas o momento de ganhar passa rápido.

### Prioridade menor: acabamento e momentos especiais

14. **Mana saindo do terreno.** Ao virar um terreno para pagar, um símbolo de mana na cor dele voa até o selo de custo (ou até a reserva) e o símbolo pago se apaga. Deixa o pagamento mais claro, combinando com a mana que falta pagar (item 58).
15. **Início da partida.** As sete cartas da mão saem do grimório uma depois da outra e se abrem no leque, em vez de aparecerem prontas. No mulligan, a mão volta ao grimório, que embaralha (sugestão 7), e sai de novo.
16. **Fim da partida.** O retrato de quem perdeu racha e escurece; o de quem ganhou acende com uma onda dourada, antes do resultado. Hoje a janela de resultado entra direto.
17. **Habilidade ativada: a carta se ergue.** A carta sobe um pouco do campo enquanto a habilidade vai para a pilha e desce quando ela sai. Está pendente no item 16 do `ROADMAP.md` ("a carta ainda não se ergue").
18. **Moeda e dado.** A moeda gira no ar e cai no resultado (cara ou coroa em português); o dado rola e para no número. Hoje só o resultado aparece no aviso.
19. **Saga avançando de capítulo.** O marcador de capítulo entra com um pulso e o capítulo da vez acende na carta, junto do gatilho. Combina com o layout de capítulos pendente no item 11.

### Antes de seguir: conferir o desempenho no celular

Com o voo em arco valendo para quase tudo, vale fechar o item pendente "conferir desempenho no celular" (itens 8 e 15 do `ROADMAP.md`) antes de somar mais efeitos: um combate grande, uma remoção em massa (Wrath of God com o campo cheio) e uma cascata de fichas, num celular médio, usando o **Campo cheio** do laboratório de efeitos.
