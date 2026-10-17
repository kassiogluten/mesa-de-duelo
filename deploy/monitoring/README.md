# Monitoramento

O `docker-compose.yml` sobe, junto do jogo:

| Serviço | O que faz | Público? |
|---|---|---|
| `prometheus` | Coleta as métricas a cada 15 s e guarda 30 dias (até 2 GB). | Não |
| `grafana` | Mostra o painel **Mesa de Duelo**, já configurado. | Sim, com login |
| `cadvisor` | Mede CPU, memória e rede de cada container do servidor. | Não |

A ponte expõe as métricas em `http://bridge:7171/metrics` e um teste de vida em `/health`. O nginx só repassa `/ws`, então esses endereços ficam visíveis apenas na rede interna dos containers.

Consumo aproximado: Prometheus 150–300 MB de RAM, Grafana ~100 MB, cAdvisor ~50 MB.

## Colocar no ar no Coolify

1. Em **Environment Variables**, defina `GRAFANA_ADMIN_PASSWORD` (obrigatória: sem ela o deploy falha de propósito, para o Grafana nunca subir com a senha padrão). Opcionais: `GRAFANA_ADMIN_USER` (padrão `admin`) e `GRAFANA_ROOT_URL` (a URL pública do Grafana).
2. Em **Domains**, dê um domínio ao serviço `grafana` apontando para a porta 3000, por exemplo `https://grafana.seudominio.com:3000`. Não ponha domínio em `prometheus`, `cadvisor` nem `bridge`.
3. Faça o deploy. O painel abre direto na tela inicial do Grafana (pasta **Mesa de Duelo**).

Se os gráficos da seção **Containers do servidor** ficarem vazios, o Docker do servidor não está deixando o cAdvisor ler os cgroups. Acrescente `privileged: true` e `devices: ["/dev/kmsg"]` ao serviço `cadvisor`.

## O painel

- **Agora**: jogadores conectados, conexões abertas (inclui quem está só no lobby), partidas em andamento, salas aguardando, jogadores reconectando e há quanto tempo a ponte está no ar.
- **Uso ao longo do tempo**: jogadores e partidas por formato (Pauper, Commander, livre) e modo (contra a IA ou em rede), partidas iniciadas e encerradas por hora (concluídas ou abandonadas) e duração média.
- **Ponte**: memória da JVM contra o limite `-Xmx`, CPU, pausas de coleta de lixo, tempo para publicar o estado das partidas (acima de 50 ms a mesa atrasa), mensagens e erros, threads.
- **Containers do servidor**: CPU, memória e rede de cada serviço. O seletor **Projeto** no topo filtra o projeto do Coolify quando há outros apps no mesmo servidor.

## Métricas da ponte

| Métrica | Tipo | Etiquetas |
|---|---|---|
| `mesa_ws_connections` | atual | |
| `mesa_players_connected`, `mesa_players_reconnecting` | atual | |
| `mesa_sessions` | atual | `format`, `mode` (`ia`/`rede`), `state` (`jogando`/`aguardando`) |
| `mesa_matches_started_total` | contador | `format`, `mode`, `players` |
| `mesa_matches_ended_total`, `mesa_match_duration_seconds` | contador, tempo | `format`, `mode`, `outcome` (`concluida`/`abandonada`) |
| `mesa_games_finished_total` | contador | `format`, `mode` (cada jogo de uma melhor de três) |
| `mesa_ws_messages_received_total`, `mesa_ws_messages_invalid_total`, `mesa_requests_rejected_total`, `mesa_tick_errors_total` | contador | |
| `mesa_tick_seconds` | tempo | |
| `jvm_*`, `process_*`, `system_cpu_usage` | JVM e processo (Micrometer) | |

Para conferir localmente com a ponte rodando: `curl http://127.0.0.1:7171/metrics`.
