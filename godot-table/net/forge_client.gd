# Cliente do servidor da mesa (forge-bridge): WebSocket com JSON, consultas casadas por requestId e volta ao assento.
# O formato das mensagens é o de src/forge/protocol.ts (docs/protocolo.md); este arquivo não conhece regras.
extends RefCounted

const Protocol := preload("res://net/protocol.gd")

## Abriu a conexão; a mesa se apresenta no `hello` e o servidor responde com o dele.
signal connected
## A conexão caiu ou foi fechada. `will_retry`: o cliente vai tentar voltar ao assento sozinho.
signal disconnected(code: int, reason: String, will_retry: bool)
## Antes de cada tentativa de voltar (1, 2, …).
signal reconnecting(attempt: int)
## Voltou ao assento depois de cair (o `rejoin` foi mandado; o estado chega em seguida).
signal reconnected
## Acabaram as tentativas, ou o servidor não conhece mais a partida (`gone`) ou outra janela assumiu (`replaced`).
signal gave_up(reason: String)
## Toda mensagem do servidor que não é resposta de uma consulta (`hello`, `state`, `room`, `toast`, `error`…).
signal message(msg: Dictionary)

const DEFAULT_URL := "ws://127.0.0.1:7171/ws"
## O estado inteiro de uma mesa cheia passa bem de 64 KB (o padrão do Godot).
const INBOUND_BUFFER := 8 * 1024 * 1024
## Intervalos crescentes (~40 s no total) para voltar sozinho à partida (RECONNECT_DELAYS de src/app/retry.ts).
const RECONNECT_DELAYS_S: PackedFloat32Array = [0.3, 1.0, 2.0, 3.0, 5.0, 8.0, 8.0, 10.0]


## Uma consulta à espera da resposta: `var reply: Dictionary = await client.request({...}).done`.
class Pending extends RefCounted:
	signal done(reply: Dictionary)


var url: String = DEFAULT_URL
## Vai no hello para o servidor saber quem é ("" rodando do projeto).
var client_version: String = ""
## Código e token do assento ({code, token}), do último estado; é com ele que o cliente volta depois de cair.
var session: Dictionary = {}

var _ws: WebSocketPeer = WebSocketPeer.new()
var _open: bool = false
var _next_request: int = 0
var _pending: Dictionary = {}
## Tentativa de volta em andamento (0: nenhuma) e quando abrir a próxima conexão (ms do relógio do motor).
var _attempt: int = 0
var _retry_at: int = -1
var _closing: bool = false


func connect_to(address: String = DEFAULT_URL) -> Error:
	url = address
	_closing = false
	_attempt = 0
	_retry_at = -1
	return _open_socket()


func is_open() -> bool:
	return _open


func is_reconnecting() -> bool:
	return _attempt > 0


## Fecha de propósito: não tenta voltar.
func close() -> void:
	_closing = true
	_attempt = 0
	_retry_at = -1
	_ws.close()


## Derruba a conexão como se a rede tivesse caído (para testar a volta ao assento).
func simulate_drop() -> void:
	_ws.close()


## Esquece o assento (saiu da partida): uma queda depois disso não tenta voltar.
func forget_session() -> void:
	session = {}


## Chamar a cada quadro: lê o que chegou, dispara os sinais e cuida das tentativas de voltar.
func poll() -> void:
	if _retry_at >= 0 and Time.get_ticks_msec() >= _retry_at:
		_retry_at = -1
		reconnecting.emit(_attempt)
		_open_socket()
	_ws.poll()
	var state: WebSocketPeer.State = _ws.get_ready_state()
	if state == WebSocketPeer.STATE_OPEN:
		if not _open:
			_on_open()
		while _ws.get_available_packet_count() > 0:
			_receive(_ws.get_packet().get_string_from_utf8())
	elif state == WebSocketPeer.STATE_CLOSED and _retry_at < 0:
		if _open:
			_open = false
			_fail_pending("A conexão com o servidor caiu.")
			var retry: bool = not _closing and not session.is_empty()
			disconnected.emit(_ws.get_close_code(), _ws.get_close_reason(), retry)
			if retry:
				_schedule_retry()
		elif _attempt > 0:
			# A tentativa não chegou a abrir: espera o próximo intervalo.
			_schedule_retry()


func send(msg: Dictionary) -> bool:
	if OS.get_environment("MESA_LOG_ENVIO") == "1":
		print("ENVIO ", JSON.stringify(msg))
	if not _open:
		return false
	return _ws.send_text(JSON.stringify(msg)) == OK


## Manda uma consulta com requestId novo; a resposta chega em `done`.
func request(msg: Dictionary) -> Pending:
	_next_request += 1
	var id: String = "g%d" % _next_request
	var pending := Pending.new()
	_pending[id] = pending
	var body: Dictionary = msg.duplicate()
	body["requestId"] = id
	if not send(body):
		_pending.erase(id)
		_resolve_later(pending, {"type": "request-error", "message": "Sem conexão com o servidor."})
	return pending


func _open_socket() -> Error:
	_ws = WebSocketPeer.new()
	_ws.inbound_buffer_size = INBOUND_BUFFER
	_open = false
	return _ws.connect_to_url(url)


func _on_open() -> void:
	_open = true
	send({"type": "hello", "client": "godot", "clientVersion": client_version})
	if _attempt > 0:
		_attempt = 0
		send({"type": "rejoin", "code": session.get("code", ""), "token": session.get("token", "")})
		reconnected.emit()
	else:
		connected.emit()


func _schedule_retry() -> void:
	if _attempt >= RECONNECT_DELAYS_S.size():
		_attempt = 0
		gave_up.emit("Não foi possível voltar à partida.")
		return
	_retry_at = Time.get_ticks_msec() + int(RECONNECT_DELAYS_S[_attempt] * 1000.0)
	_attempt += 1


## O JSON do Godot lê todo número como decimal (31.0); os ids e contagens do servidor são inteiros, e `[31.0].has(31)`
## dá falso. Ao receber, todo número inteiro vira int, para o resto da mesa comparar ids sem tropeçar.
static func normalize(value: Variant) -> Variant:
	if value is float:
		var f: float = value
		return int(f) if f == floorf(f) and absf(f) < 9.0e15 else f
	if value is Array:
		var list: Array = value
		for i: int in list.size():
			list[i] = normalize(list[i])
		return list
	if value is Dictionary:
		var dict: Dictionary = value
		for key: Variant in dict.keys():
			dict[key] = normalize(dict[key])
		return dict
	return value


func _receive(text: String) -> void:
	var parsed: Variant = normalize(JSON.parse_string(text))
	if not parsed is Dictionary or not (parsed as Dictionary).has("type"):
		return
	var msg: Dictionary = parsed
	var type: String = String(msg["type"])
	var id: Variant = msg.get("requestId")
	if id is String and Protocol.REPLY_MESSAGES.has(type) and _pending.has(id):
		var pending: Pending = _pending[id]
		_pending.erase(id)
		pending.done.emit(msg)
		return
	match type:
		"state":
			var seat_session: Variant = msg.get("session")
			if seat_session is Dictionary:
				session = seat_session
		"room":
			# Na sala de espera ainda não há estado: o assento vem na sala (code, token), para voltar se a conexão cair.
			var room: Variant = msg.get("room")
			if room is Dictionary and not bool((room as Dictionary).get("started", false)) and Txt.of((room as Dictionary).get("token")) != "":
				session = {"code": Txt.of(room["code"]), "token": Txt.of(room["token"]), "room": true}
		"gone", "replaced":
			# A partida acabou para este assento ou outra janela o assumiu: não adianta tentar voltar.
			session = {}
			gave_up.emit(String(msg.get("text", "")))
	message.emit(msg)


func _fail_pending(text: String) -> void:
	var waiting: Array = _pending.values()
	_pending.clear()
	for pending: Pending in waiting:
		pending.done.emit({"type": "request-error", "message": text})


## Responde no próximo quadro, para quem chamou ter tempo de fazer o `await`.
func _resolve_later(pending: Pending, reply: Dictionary) -> void:
	(Engine.get_main_loop() as SceneTree).process_frame.connect(func() -> void: pending.done.emit(reply), CONNECT_ONE_SHOT)
