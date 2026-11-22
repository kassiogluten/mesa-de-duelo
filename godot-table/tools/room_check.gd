# Lado da mesa no PC do teste de crossplay (scripts/godot-crossplay.mjs): cria uma sala e avisa o código (sem argumento)
# ou entra na sala do código dado (-- <código>); fica pronta e, com a partida começada, imprime quem está nela e desiste.
extends SceneTree

const ForgeClient := preload("res://net/forge_client.gd")
const StarterDecks := preload("res://cards/starter_decks.gd")

var _client: ForgeClient
var _left: float = 90.0
var _announced: bool = false
var _readied: bool = false
var _states: int = 0


func _initialize() -> void:
	_client = ForgeClient.new()
	_client.message.connect(_on_message)
	var args: PackedStringArray = OS.get_cmdline_user_args()
	_client.connected.connect(func() -> void:
		var deck: Dictionary = StarterDecks.forge_deck(StarterDecks.of_format("standard")[0])
		if args.is_empty():
			_client.send({"type": "host", "name": "Mesa no PC", "deck": deck, "config": {"format": "standard", "matchLength": "bo1", "playerCount": 2}, "visibility": "private"})
		else:
			_client.send({"type": "join", "code": args[0], "name": "Mesa no PC", "deck": deck}))
	_client.connect_to(OS.get_environment("FORGE_URL") if OS.get_environment("FORGE_URL") != "" else ForgeClient.DEFAULT_URL)


func _on_message(msg: Dictionary) -> void:
	match Txt.of(msg.get("type")):
		"room":
			var room: Dictionary = msg["room"]
			# Só quem criou a sala anuncia o código (quem entra já sabe qual é).
			if not _announced and OS.get_cmdline_user_args().is_empty():
				_announced = true
				print("SALA %s" % room["code"])
			# Pronto só depois que o outro jogador entrou (antes, a sala não começaria de qualquer jeito).
			if not _readied and (room.get("players", []) as Array).size() >= 2:
				_readied = true
				_client.send({"type": "room-ready", "on": true})
		"state":
			_states += 1
			if _states == 1:
				var names: PackedStringArray = []
				for p: Variant in msg.get("players", []):
					names.append(Txt.of((p as Dictionary).get("name")))
				print("PARTIDA %s JOGADORES %s" % [Txt.of(msg.get("matchId")), ", ".join(names)])
			if _states == 4:
				_client.send({"type": "concede"})
				print("FIM")
				quit(0)
		"error":
			printerr("ERRO %s" % Txt.of(msg.get("text")))


func _process(delta: float) -> bool:
	_client.poll()
	_left -= delta
	if _left <= 0.0:
		printerr("tempo esgotado")
		quit(1)
	return false
