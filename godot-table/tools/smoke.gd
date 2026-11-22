# Teste de fumaça headless: conecta ao servidor, espera o hello e mede um ping (npm run godot:smoke).
extends SceneTree

const ForgeClient := preload("res://net/forge_client.gd")
const TIMEOUT_S := 15.0

var _client: ForgeClient
var _left: float = TIMEOUT_S
var _hello: Dictionary = {}


func _initialize() -> void:
	var address: String = OS.get_environment("FORGE_URL")
	_client = ForgeClient.new()
	_client.message.connect(_on_message)
	_client.disconnected.connect(func(code: int, reason: String, _retry: bool) -> void: _finish(1, "conexão fechada (%d %s)" % [code, reason]))
	var err: Error = _client.connect_to(address if address != "" else ForgeClient.DEFAULT_URL)
	if err != OK:
		_finish(1, "não abriu a conexão: %s" % error_string(err))
		return
	print("Conectando a %s…" % _client.url)
	_run()


func _run() -> void:
	await _client.connected
	while not _hello.has("protocolVersion"):
		await process_frame
	print("hello: protocolo %s, regras %s, motor %s, formatos %s" % [int(_hello.get("protocolVersion", 0)), _hello.get("rulesVersion"), _hello.get("engineVersion"), _hello.get("supportedFormats")])
	var t0: int = Time.get_ticks_usec()
	var reply: Dictionary = await _client.request({"type": "ping"}).done
	if reply.get("type") != "pong":
		_finish(1, "resposta inesperada ao ping: %s" % reply)
		return
	_finish(0, "pong em %.1f ms" % ((Time.get_ticks_usec() - t0) / 1000.0))


func _on_message(msg: Dictionary) -> void:
	# O servidor manda um hello ao conectar e outro em resposta ao da mesa; vale o último.
	if msg.get("type") == "hello":
		_hello = msg


func _process(delta: float) -> bool:
	_client.poll()
	_left -= delta
	if _left <= 0.0:
		_finish(1, "tempo esgotado (%d s)" % int(TIMEOUT_S))
	return false


func _finish(code: int, text: String) -> void:
	if code == 0:
		print("OK: " + text)
	else:
		printerr("FALHOU: " + text)
	quit(code)
