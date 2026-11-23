# Lado da mesa no PC do teste de crossplay (scripts/godot-crossplay.mjs): cria uma sala e avisa o código (sem argumento, ou
# -- publica para a sala pública), entra na sala do código dado (-- <código>) ou acha na lista de salas públicas a sala de
# quem criou (-- lista <nome>) e entra nela; fica pronta e, com a partida começada, imprime quem está nela e desiste.
extends SceneTree

const ForgeClient := preload("res://net/forge_client.gd")
const StarterDecks := preload("res://cards/starter_decks.gd")

var _client: ForgeClient
var _left: float = 90.0
var _announced: bool = false
var _readied: bool = false
var _states: int = 0
var _hosting: bool = false
var _searching: String = ""
var _search_wait: float = 0.0


func _initialize() -> void:
	_client = ForgeClient.new()
	_client.message.connect(_on_message)
	var args: PackedStringArray = OS.get_cmdline_user_args()
	_hosting = args.is_empty() or args[0] == "publica"
	if args.size() >= 2 and args[0] == "lista":
		_searching = args[1]
	_client.connected.connect(func() -> void:
		if _hosting:
			_client.send(RoomMessages.host("Mesa no PC", _seat_deck(), RoomMessages.config("standard", "bo1", 2), not args.is_empty()))
		elif _searching == "":
			_client.send(RoomMessages.join(args[0], "Mesa no PC", _seat_deck())))
	_client.connect_to(OS.get_environment("FORGE_URL") if OS.get_environment("FORGE_URL") != "" else ForgeClient.DEFAULT_URL)


func _seat_deck() -> Dictionary:
	return {"deck": StarterDecks.forge_deck(StarterDecks.of_format("standard")[0])}


## Procura na lista pública a sala de quem criou (como o Entrar da tela Jogar online) e entra nela.
func _search() -> void:
	var reply: Dictionary = await _client.request({"type": "list-rooms"}).done
	if _searching == "":
		return
	for room: Dictionary in PublicRooms.joinable(reply.get("rooms", []) if reply.get("rooms") is Array else []):
		if Txt.of(room.get("host")) == _searching:
			var code: String = Txt.of(room.get("code"))
			_searching = ""
			print("LISTA %s" % code)
			var info: Dictionary = await _client.request({"type": "lookup-room", "code": code}).done
			if not bool((info.get("room", {}) as Dictionary).get("available", false)):
				printerr("ERRO a sala %s da lista não está disponível" % code)
				quit(1)
				return
			_client.send(RoomMessages.join(code, "Mesa no PC", _seat_deck()))
			return


func _on_message(msg: Dictionary) -> void:
	match Txt.of(msg.get("type")):
		"room":
			var room: Dictionary = msg["room"]
			# Só quem criou a sala anuncia o código (quem entra já sabe qual é).
			if not _announced and _hosting:
				_announced = true
				print("SALA %s%s" % [room["code"], " PUBLICA" if bool(room.get("public", false)) else ""])
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
	if _searching != "" and _client.is_open():
		_search_wait -= delta
		if _search_wait <= 0.0:
			_search_wait = 1.0
			_search()
	return false
