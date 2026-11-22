# Grava os estados crus de uma partida contra o computador (passando sempre) em res://tests/fixtures/<nome>.json.
# npm run godot -- --headless --script res://tools/capture_states.gd -- <nome> [segundos]
extends SceneTree

const ForgeClient := preload("res://net/forge_client.gd")
const StarterDecks := preload("res://cards/starter_decks.gd")

var _client: ForgeClient
var _left: float = 30.0
var _states: Array = []
var _name: String = "partida"
var _answered_gen: int = -1


func _initialize() -> void:
	var args: PackedStringArray = OS.get_cmdline_user_args()
	if args.size() > 0:
		_name = args[0]
	if args.size() > 1:
		_left = float(args[1])
	_client = ForgeClient.new()
	_client.message.connect(_on_message)
	_client.connected.connect(_start)
	_client.connect_to(ForgeClient.DEFAULT_URL)


func _start() -> void:
	var decks: Array = StarterDecks.of_format("standard")
	_client.send({"type": "start", "you": StarterDecks.forge_deck(decks[0]), "opponent": StarterDecks.forge_deck(decks[1]), "config": {"format": "standard", "matchLength": "bo1"}})


func _on_message(msg: Dictionary) -> void:
	if msg.get("type") != "state":
		return
	_states.append(msg)
	var input: Dictionary = msg.get("input", {})
	var gen: int = int(input.get("gen", -1))
	if gen == _answered_gen or msg.get("gameOver", false):
		return
	_answered_gen = gen
	# Sempre a resposta mais simples: OK (manter a mão, passar a prioridade) ou a primeira opção de uma pergunta.
	var question: Variant = msg.get("question")
	if question is Dictionary:
		_client.send({"type": "answer", "id": (question as Dictionary)["id"], "indices": [0]})
	elif (input.get("ok", {}) as Dictionary).get("enabled", false):
		_client.send({"type": "ok", "gen": gen})


func _process(delta: float) -> bool:
	_client.poll()
	_left -= delta
	if _left <= 0.0:
		var path: String = "res://tests/fixtures/%s.json" % _name
		DirAccess.make_dir_recursive_absolute("res://tests/fixtures")
		var file: FileAccess = FileAccess.open(path, FileAccess.WRITE)
		file.store_string(JSON.stringify(_states))
		print("%d estados gravados em %s" % [_states.size(), path])
		_client.send({"type": "concede"})
		quit(0)
	return false
