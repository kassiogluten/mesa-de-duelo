# Baixa as imagens das cartas por conexões que ficam abertas de um pedido para o outro (keep-alive), várias por servidor,
# seguindo os redirecionamentos do Scryfall; sem a conexão nova (e o aperto de mão do TLS) a cada imagem.
class_name ImageFetcher
extends Node

## Conexões abertas ao mesmo tempo por servidor: o espelho de imagens aguenta mais; a API do Scryfall pede calma.
const PER_HOST := {"img.mesao.online": 16, "api.scryfall.com": 6}
const DEFAULT_PER_HOST := 8
const MAX_REDIRECTS := 5
## Conexão parada há mais que isso fecha (o servidor do outro lado costuma fechar antes).
const IDLE_CLOSE_S := 25.0
const HEADERS: PackedStringArray = ["User-Agent: MesaDeDuelo/1.0", "Accept: image/*,*/*;q=0.8"]


## Um pedido: avisa uma vez, em `finished`, com os bytes (ok) ou sem eles.
class Job:
	extends RefCounted
	signal finished(ok: bool, bytes: PackedByteArray)
	var url: String = ""
	## Segundos até chegar a resposta (o cabeçalho), e até o fim.
	var answer_timeout: float = 15.0
	var timeout: float = 30.0
	var started_ms: int = 0
	var redirects: int = 0
	var sent: bool = false
	var answered: bool = false
	var code: int = 0
	var headers: Dictionary = {}
	var body := PackedByteArray()
	## Já tentou de novo depois de a conexão reaproveitada ter caído antes da resposta.
	var retried: bool = false
	var done: bool = false
	var conn: Conn


## Uma conexão com um servidor (esquema, nome e porta).
class Conn:
	extends RefCounted
	var key: String = ""
	var host: String = ""
	var port: int = 443
	var tls: bool = true
	var client := HTTPClient.new()
	var job: Job
	## Pedidos já atendidos por ela (a partir do segundo, ela foi reaproveitada).
	var served: int = 0
	var idle_ms: int = 0


var _waiting: Array[Job] = []
var _conns: Array[Conn] = []
## Quantas conexões abriram e quantos pedidos foram atendidos (para medir o reaproveitamento).
var opened: int = 0
var requests: int = 0


## Pede um endereço; `answer_timeout` é o tempo até a resposta começar (o espelho que demora cai antes, para a mesa
## buscar direto no Scryfall). Espere com `var result: Array = await job.finished` ([ok, bytes]).
func fetch(url: String, answer_timeout: float = 15.0, timeout: float = 30.0) -> Job:
	var job := Job.new()
	job.url = url
	job.answer_timeout = answer_timeout
	job.timeout = timeout
	job.started_ms = Time.get_ticks_msec()
	_waiting.append(job)
	set_process(true)
	return job


## Para o pedido sem avisar (quem pediu desistiu).
func cancel(job: Job) -> void:
	if job.done:
		return
	job.done = true
	_waiting.erase(job)
	if job.conn:
		_drop(job.conn)


func _exit_tree() -> void:
	for conn: Conn in _conns:
		conn.client.close()
	_conns.clear()


func _process(_delta: float) -> void:
	_assign()
	var now: int = Time.get_ticks_msec()
	for conn: Conn in _conns.duplicate():
		if conn.job:
			_step(conn, now)
		elif now - conn.idle_ms > IDLE_CLOSE_S * 1000.0:
			_drop(conn)
		else:
			conn.client.poll()
			if conn.client.get_status() != HTTPClient.STATUS_CONNECTED:
				_drop(conn)
	if _waiting.is_empty() and _conns.is_empty():
		set_process(false)


## Dá uma conexão a cada pedido da fila: uma parada do mesmo servidor, ou uma nova se o servidor ainda tem vaga.
func _assign() -> void:
	var i: int = 0
	while i < _waiting.size():
		var job: Job = _waiting[i]
		var parts: Dictionary = split_url(job.url)
		if parts.is_empty():
			_waiting.remove_at(i)
			_finish(job, false)
			continue
		var conn: Conn = _idle_conn(Txt.of(parts["key"]))
		if conn == null and _count(Txt.of(parts["key"])) < int(PER_HOST.get(parts["host"], DEFAULT_PER_HOST)):
			conn = _open(parts)
		if conn == null:
			i += 1
			continue
		_waiting.remove_at(i)
		conn.job = job
		job.conn = conn
		job.sent = false


func _idle_conn(key: String) -> Conn:
	for conn: Conn in _conns:
		if conn.job == null and conn.key == key:
			return conn
	return null


func _count(key: String) -> int:
	var n: int = 0
	for conn: Conn in _conns:
		if conn.key == key:
			n += 1
	return n


func _open(parts: Dictionary) -> Conn:
	var conn := Conn.new()
	conn.key = parts["key"]
	conn.host = parts["host"]
	conn.port = parts["port"]
	conn.tls = parts["tls"]
	conn.client.read_chunk_size = 262144
	var err: Error = conn.client.connect_to_host(("https://" if conn.tls else "http://") + conn.host, conn.port, TLSOptions.client() if conn.tls else null)
	if err != OK:
		return null
	opened += 1
	_conns.append(conn)
	return conn


## Um passo do pedido na conexão: conectar, mandar, ler a resposta; no fim, segue o redirecionamento ou avisa.
func _step(conn: Conn, now: int) -> void:
	var job: Job = conn.job
	var client: HTTPClient = conn.client
	var elapsed: float = (now - job.started_ms) / 1000.0
	if elapsed > job.timeout or (not job.answered and elapsed > job.answer_timeout):
		_drop(conn)
		_finish(job, false)
		return
	client.poll()
	var status: int = client.get_status()
	if job.sent and not job.answered and client.has_response():
		job.answered = true
		job.code = client.get_response_code()
		job.headers = {}
		var raw: Dictionary = client.get_response_headers_as_dictionary()
		for key: Variant in raw:
			job.headers[Txt.of(key).to_lower()] = raw[key]
	match status:
		HTTPClient.STATUS_RESOLVING, HTTPClient.STATUS_CONNECTING, HTTPClient.STATUS_REQUESTING:
			return
		HTTPClient.STATUS_CONNECTED:
			if not job.sent:
				var parts: Dictionary = split_url(job.url)
				if client.request(HTTPClient.METHOD_GET, Txt.of(parts["path"]), HEADERS) != OK:
					_drop(conn)
					_finish(job, false)
					return
				job.sent = true
				requests += 1
			elif job.answered:
				_complete(conn)
		HTTPClient.STATUS_BODY:
			# Lê o que já chegou (vários pedaços no mesmo quadro).
			for _i: int in 16:
				var chunk: PackedByteArray = client.read_response_body_chunk()
				if chunk.is_empty():
					break
				job.body.append_array(chunk)
				client.poll()
				if client.get_status() != HTTPClient.STATUS_BODY:
					break
			if client.get_status() == HTTPClient.STATUS_CONNECTED:
				_complete(conn)
		_:
			# Caiu. Com a resposta inteira (o servidor fecha depois de mandar), vale; reaproveitada e caída antes da
			# resposta, tenta de novo numa conexão nova; senão, falhou.
			var length: int = int(Txt.of(job.headers.get("content-length", "-1")))
			if job.answered and not job.body.is_empty() and (length < 0 or job.body.size() >= length):
				_complete(conn)
				return
			var reused: bool = conn.served > 0
			_drop(conn)
			if reused and not job.retried and not job.answered:
				job.retried = true
				job.body = PackedByteArray()
				_waiting.push_front(job)
				return
			_finish(job, false)


## O pedido terminou nesta conexão: devolve a conexão (se continua aberta) e segue o redirecionamento ou avisa.
func _complete(conn: Conn) -> void:
	var job: Job = conn.job
	conn.job = null
	job.conn = null
	conn.served += 1
	conn.idle_ms = Time.get_ticks_msec()
	if Txt.of(job.headers.get("connection", "")).to_lower() == "close" or conn.client.get_status() != HTTPClient.STATUS_CONNECTED:
		_drop(conn)
	var location: String = Txt.of(job.headers.get("location", ""))
	if job.code in [301, 302, 303, 307, 308] and location != "" and job.redirects < MAX_REDIRECTS:
		if location.begins_with("/"):
			var parts: Dictionary = split_url(job.url)
			location = ("https://" if bool(parts["tls"]) else "http://") + Txt.of(parts["host"]) + location
		job.url = location
		job.redirects += 1
		job.sent = false
		job.answered = false
		job.retried = false
		job.headers = {}
		job.body = PackedByteArray()
		_waiting.push_front(job)
		return
	_finish(job, job.code == 200 and not job.body.is_empty())


func _drop(conn: Conn) -> void:
	conn.client.close()
	_conns.erase(conn)
	if conn.job:
		conn.job.conn = null
		conn.job = null


func _finish(job: Job, ok: bool) -> void:
	if job.done:
		return
	job.done = true
	job.finished.emit(ok, job.body if ok else PackedByteArray())


## As partes de um endereço http(s): {key, host, port, tls, path}; {} se não é um.
static func split_url(url: String) -> Dictionary:
	var tls: bool
	var rest: String
	if url.begins_with("https://"):
		tls = true
		rest = url.substr(8)
	elif url.begins_with("http://"):
		tls = false
		rest = url.substr(7)
	else:
		return {}
	var slash: int = rest.find("/")
	var authority: String = rest if slash < 0 else rest.substr(0, slash)
	var path: String = "/" if slash < 0 else rest.substr(slash)
	var host: String = authority
	var port: int = 443 if tls else 80
	var colon: int = authority.rfind(":")
	if colon > 0:
		host = authority.substr(0, colon)
		port = int(authority.substr(colon + 1))
	if host == "":
		return {}
	return {"key": "%s://%s:%d" % ["https" if tls else "http", host, port], "host": host, "port": port, "tls": tls, "path": path}
