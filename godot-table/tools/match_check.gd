# Teste headless de partida: inicia contra o computador com decks prontos, derruba a conexão e confere a volta ao assento.
# npm run godot:partida (precisa do servidor local ligado: npm run forge).
extends SceneTree

const ForgeClient := preload("res://net/forge_client.gd")
const StarterDecks := preload("res://cards/starter_decks.gd")
const TIMEOUT_S := 60.0

var _client: ForgeClient
var _left: float = TIMEOUT_S
var _states: int = 0
var _last_state: Dictionary = {}


func _initialize() -> void:
	var address: String = OS.get_environment("FORGE_URL")
	_client = ForgeClient.new()
	_client.message.connect(_on_message)
	_client.gave_up.connect(func(reason: String) -> void: _finish(1, "desistiu de voltar: " + reason))
	_client.connect_to(address if address != "" else ForgeClient.DEFAULT_URL)
	_run()


func _run() -> void:
	await _client.connected
	var decks: Array = StarterDecks.of_format("standard")
	if decks.size() < 2:
		_finish(1, "faltam decks prontos de standard em res://data/")
		return
	_client.send({
		"type": "start",
		"you": StarterDecks.forge_deck(decks[0]),
		"opponent": StarterDecks.forge_deck(decks[1]),
		"config": {"format": "standard", "matchLength": "bo1"},
	})
	while _client.session.is_empty():
		await process_frame
	var code: String = _client.session["code"]
	print("Partida %s começou: %s contra %s, %d jogadores." % [code, decks[0]["name"], decks[1]["name"], (_last_state.get("players", []) as Array).size()])

	var before: int = _states
	_client.simulate_drop()
	await _client.reconnected
	while _states == before:
		await process_frame
	if _client.session.get("code") != code:
		_finish(1, "voltou para outra partida (%s)" % _client.session.get("code"))
		return
	print("Voltou ao assento da partida %s depois de cair." % code)
	_client.send({"type": "concede"})
	_client.forget_session()
	_finish(0, "partida iniciada, conexão derrubada e assento recuperado")


func _on_message(msg: Dictionary) -> void:
	match msg.get("type"):
		"state":
			_states += 1
			_last_state = msg
		"error":
			_finish(1, "o servidor recusou: %s" % msg.get("text"))


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
