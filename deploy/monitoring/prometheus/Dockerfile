# Prometheus com a configuração do projeto embutida (o Coolify não precisa montar arquivos do repositório).
FROM prom/prometheus:v2.55.1
COPY prometheus.yml /etc/prometheus/prometheus.yml
CMD ["--config.file=/etc/prometheus/prometheus.yml", "--storage.tsdb.path=/prometheus", "--storage.tsdb.retention.time=30d", "--storage.tsdb.retention.size=2GB"]
