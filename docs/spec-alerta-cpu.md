# Spec: Alerta de uso de CPU

Data: 2026-10-28

## Objetivo

Avisar a equipe quando o uso de CPU de uma máquina passar de 85% por 10 minutos seguidos. A espera de 10 minutos evita alertas em picos curtos, como deploys e rotinas agendadas. Esses valores ainda são proposta (ver [Decisões em aberto](#decisões-em-aberto)).

## Abordagem

Recomendação: se já existir Alertmanager, a regra fica no Prometheus; se só existir Grafana, ela fica no Grafana Alerting. A consulta é a mesma nos dois casos. O que muda é onde a regra fica guardada e quem envia a notificação.

| Critério | Prometheus + Alertmanager | Grafana Alerting |
| --- | --- | --- |
| Onde fica a regra | Arquivo YAML versionado no Git | Interface do Grafana (ou provisioning/Terraform) |
| Quem notifica | Alertmanager | Contact points do Grafana |
| Depende do Grafana estar no ar | Não | Sim |
| Esforço para o primeiro alerta | Maior, se o Alertmanager ainda não existir | Menor |
| Revisão e histórico | Pull request | Histórico do próprio Grafana |

## Regra de alerta

O alerta `CPUAlta` dispara por instância quando o uso médio de CPU, medido em janelas de 5 minutos, fica acima de 85% por 10 minutos.

```yaml
groups:
  - name: cpu
    rules:
      - alert: CPUAlta
        expr: 100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 85
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "CPU acima de 85% em {{ $labels.instance }}"
          description: "Uso atual: {{ $value | printf \"%.1f\" }}%"
```

| Parâmetro | Valor proposto | Motivo |
| --- | --- | --- |
| Limite | 85% | Deixa folga antes de a CPU saturar |
| Janela da média | 5 min | Suaviza picos de segundos |
| Duração (`for`) | 10 min | Ignora deploys e rotinas curtas |
| Severidade | warning | Nível de aviso, sem acionar plantão |

Se o alvo for container ou pod no Kubernetes, a expressão passa a usar `container_cpu_usage_seconds_total` dividido pelo limite de CPU do container.

No Grafana Alerting, a mesma expressão vira a query A da regra, com uma condição `IS ABOVE 85`, "Pending period" de 10m e avaliação a cada 1m.

## Pré-requisitos

A métrica precisa chegar ao Prometheus antes de qualquer regra funcionar.

- [ ] `node_exporter` rodando em cada máquina monitorada (ou cAdvisor/kubelet, se o alvo for container)
- [ ] Prometheus coletando esses alvos (`up == 1` para cada instância)
- [ ] Alertmanager configurado e ligado ao Prometheus, ou contact point criado no Grafana
- [ ] Credencial do destino da notificação (webhook do Slack, SMTP para e-mail)
- [ ] Repositório onde a regra vai ficar, se a escolha for Prometheus

## Notificação

- Destino: a definir (Slack ou e-mail).
- Conteúdo: instância, uso atual em %, horário de início e link para o dashboard da máquina.
- Envia também quando o alerta se resolve (`send_resolved: true` no Alertmanager).
- Agrupamento por `alertname` e `instance`, com `repeat_interval` de 4h para não repetir o mesmo aviso sem parar.

Exemplo de rota no Alertmanager (Slack):

```yaml
route:
  receiver: slack-infra
  group_by: [alertname, instance]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

receivers:
  - name: slack-infra
    slack_configs:
      - api_url: <webhook>
        channel: "#alertas"
        send_resolved: true
        title: "{{ .CommonAnnotations.summary }}"
        text: "{{ .CommonAnnotations.description }}"
```

## Decisões em aberto

1. Existe Alertmanager, ou só Grafana em cima do Prometheus? (Isso define a abordagem.)
2. O alvo é CPU de máquina (`node_exporter`) ou de container/pod (Kubernetes)?
3. Limite e duração: manter 85% por 10 minutos? Vale ter também um nível `critical` (ex.: 95% por 5 minutos)?
4. Para onde vai a notificação: qual canal do Slack ou qual lista de e-mail?
5. Em qual repositório a regra fica versionada?

## Critérios de aceite e como testar

- [ ] A regra aparece carregada sem erros (`promtool check rules cpu.yml` e a página `/rules` do Prometheus, ou a lista de regras do Grafana).
- [ ] A consulta, rodada no Explore, mostra o uso de CPU de cada instância com valores coerentes com o `top`/`htop` da máquina.
- [ ] Teste de disparo: gerar carga numa máquina de teste (`stress-ng --cpu 0 --timeout 15m`) e ver o alerta passar de *pending* para *firing* depois de 10 minutos.
- [ ] A notificação chega ao destino com instância e percentual corretos.
- [ ] Ao parar a carga, chega a notificação de resolvido.
- [ ] Picos de menos de 10 minutos não geram notificação.
