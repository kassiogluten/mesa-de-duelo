# Testes das salas fora da partida: as mensagens iguais às do navegador, o código colado, a lista pública, os decks da sala,
# o assento guardado para voltar e a sala de espera montada a partir do FRoom.
extends "res://tests/test_case.gd"

const ForgeClient := preload("res://net/forge_client.gd")


func _room(seated: int, capacity: int, extra: Dictionary = {}) -> Dictionary:
	var names: Array = ["Ana", "Você", "Caio", "Dora"]
	var players: Array = []
	for i: int in seated:
		players.append({"seat": i, "name": names[i], "connected": true, "rematch": false, "ready": true, "confirmed": i == 0})
	var room: Dictionary = {"code": "K7QM", "seat": 1, "token": "t", "started": false, "public": true, "capacity": capacity,
		"config": {"format": "commander", "matchLength": "bo1", "playerCount": capacity}, "players": players}
	room.merge(extra, true)
	return room


func test_code_from_text_reads_codes_and_invite_links() -> void:
	check_eq(RoomMessages.code_from_text(" k7qm "), "K7QM", "código digitado em minúsculas")
	check_eq(RoomMessages.code_from_text("https://mesao.online/?sala=K7QM"), "K7QM", "link de convite do site")
	check_eq(RoomMessages.code_from_text("http://localhost:5173/?sala=ab12&x=1#jogar"), "AB12", "link local com mais parâmetros")
	check_eq(RoomMessages.code_from_text("K7Q"), "", "código incompleto")
	check_eq(RoomMessages.code_from_text("ABCD2345"), "ABCD2345", "código de 8 para assistir contra o computador")
	check_eq(RoomMessages.invite_link("K7QM", "wss://mesao.online/ws"), "https://mesao.online/?sala=K7QM", "link de convite do site")
	check_eq(RoomMessages.invite_link("K7QM", "ws://127.0.0.1:7171/ws"), "http://localhost:5173/?sala=K7QM", "link com o servidor local")


func test_messages_match_the_browser() -> void:
	var config: Dictionary = RoomMessages.config("commander", "bo3", 3)
	check_eq(config, {"format": "commander", "matchLength": "bo1", "playerCount": 3}, "Commander: bo1 e o número de jogadores")
	check_eq(RoomMessages.config("pauper", "bo3", 4), {"format": "pauper", "matchLength": "bo3", "playerCount": 2}, "Pauper: bo3 e 2 jogadores")
	var host: Dictionary = RoomMessages.host("Ana", {}, config, true, "AB12")
	check_eq(host, {"type": "host", "name": "Ana", "deck": null, "config": config, "visibility": "public", "code": "AB12"}, "host sem deck, pública e com código")
	var private_host: Dictionary = RoomMessages.host("Ana", {"deck": {"name": "x"}, "cover": "Atarka, World Render", "bracket": 3}, config, false)
	check_eq(private_host["visibility"], "private", "privada")
	check(not private_host.has("code"), "sem código: o servidor sorteia")
	check_eq(private_host["cover"], "Atarka, World Render", "a capa vai junto")
	check_eq(RoomMessages.join("K7QM", "Bia", {}), {"type": "join", "code": "K7QM", "name": "Bia", "deck": null}, "join sem deck")
	check_eq(RoomMessages.room_deck({"deck": {"name": "x"}})["type"], "room-deck", "room-deck")
	check_eq(RoomMessages.watch("K7QM", ""), {"type": "watch", "code": "K7QM", "name": "Espectador"}, "assistir sem nome")
	check_eq(RoomMessages.rejoin({"code": "K7QM", "token": "t"}), {"type": "rejoin", "code": "K7QM", "token": "t"}, "rejoin")
	var Protocol: GDScript = load("res://net/protocol.gd")
	for message: Dictionary in [host, RoomMessages.join("K7QM", "Bia", {}), RoomMessages.watch("K7QM", "x"), RoomMessages.rejoin({}), {"type": "list-rooms"}, {"type": "lookup-room"}]:
		check((Protocol.get("CLIENT_MESSAGES") as PackedStringArray).has(message["type"]), "%s está no protocolo" % message["type"])


func test_public_rooms_list() -> void:
	var rooms: Array = [
		{"code": "AAAA", "host": "Ana", "config": {"format": "commander", "matchLength": "bo1", "playerCount": 4}, "capacity": 4, "players": 2, "started": false, "brackets": [2, 4]},
		{"code": "BBBB", "host": "Bia", "config": {"format": "standard", "matchLength": "bo3", "playerCount": 2}, "capacity": 2, "players": 2, "started": false},
		{"code": "CCCC", "host": "Caio", "config": {"format": "pauper", "matchLength": "bo1", "playerCount": 2}, "capacity": 2, "players": 2, "started": true, "spectators": 3},
		{"code": "DDDDDDDD", "host": "Dora", "computer": true, "config": {"format": "standard", "matchLength": "bo1"}, "capacity": 2, "players": 2, "started": true},
	]
	check_eq(PublicRooms.joinable(rooms).size(), 1, "só a com lugar dá para entrar")
	check_eq(PublicRooms.watchable(rooms).size(), 2, "as começadas dá para assistir")
	check_eq(PublicRooms.details(rooms[0]), "Commander · Brackets 2 a 4 · 2/4 jogadores", "detalhes da sala de Commander")
	check_eq(PublicRooms.details(rooms[2]), "Pauper · 2 jogadores · 3 assistindo", "detalhes da em andamento")
	check_eq(PublicRooms.title(rooms[3]), "Dora contra o computador", "partida contra o computador")
	check_eq(PublicRooms.status_text(rooms), "1 sala esperando jogadores e 2 partidas para assistir.", "resumo")
	check_eq(PublicRooms.status_text([]), "Nenhuma sala pública aberta.", "lista vazia")


func test_deck_choices_follow_the_format() -> void:
	var commander: Array = DeckChoices.for_format("commander")
	var precon: Array = DeckChoices.for_format("precon")
	check(not commander.is_empty() and not precon.is_empty(), "há decks de Commander e precons")
	check(commander.all(func(c: Dictionary) -> bool: return (c["deck"] as Dictionary).get("precon") == null), "o Commander não lista os precons")
	check(precon.all(func(c: Dictionary) -> bool: return (c["deck"] as Dictionary).get("precon") != null), "o Precon só lista os precons")
	check(DeckChoices.for_format("free").all(func(c: Dictionary) -> bool: return not RoomMessages.has_command_zone(Txt.of((c["deck"] as Dictionary).get("format")))), "o Livre só tem decks de 60")
	var seat: Dictionary = DeckChoices.seat_deck(commander[0])
	check(seat.has("deck") and seat.has("cover"), "o deck do lugar leva a lista e a capa (o comandante)")
	check_eq(int(seat.get("bracket", 0)), int((commander[0]["deck"] as Dictionary).get("bracket", 0)), "e o bracket")
	check_eq(DeckChoices.seat_deck({}), {}, "sem escolha, sem deck")
	# A fonte de "Meus decks" entra antes dos prontos.
	var mine: Callable = func(format: String) -> Array: return [{"id": "meu", "name": "Meu deck", "group": DeckChoices.GROUP_MINE, "deck": {"format": format, "cards": []}}]
	DeckChoices.add_source(mine)
	check_eq(Txt.of((DeckChoices.for_format("standard")[0] as Dictionary).get("id")), "meu", "os do jogador primeiro")
	DeckChoices.remove_source(mine)
	check(Txt.of((DeckChoices.for_format("standard")[0] as Dictionary).get("id")) != "meu", "a fonte sai")


func test_saved_session_tracks_the_seat() -> void:
	SavedSession.path = "user://partida-teste.json"
	SavedSession.clear()
	SavedSession.track({"type": "room", "room": _room(1, 4)})
	check_eq(Txt.of(SavedSession.current().get("code")), "K7QM", "a sala de espera guarda o assento")
	SavedSession.track({"type": "state", "session": {"code": "K7QM", "token": "u", "room": true}, "config": {"format": "commander"}})
	check_eq(Txt.of(SavedSession.current().get("token")), "u", "o estado atualiza o token")
	SavedSession.track({"type": "state", "session": {"code": "K7QM", "token": "u", "room": true}, "gameOver": true})
	check(SavedSession.current().is_empty(), "no fim da partida, esquece")
	SavedSession.track({"type": "room", "room": _room(1, 4)})
	SavedSession.track({"type": "gone", "text": "A partida K7QM não existe mais."})
	check(SavedSession.current().is_empty(), "gone esquece")
	SavedSession.save("K7QM", "t", true, "commander", "ws://outro:7171/ws")
	check(SavedSession.current("ws://127.0.0.1:7171/ws").is_empty(), "de outro servidor, não oferece")
	SavedSession.clear()
	SavedSession.path = SavedSession.FILE


func test_forge_client_keeps_the_room_seat() -> void:
	var client := ForgeClient.new()
	client._receive(JSON.stringify({"type": "room", "room": _room(1, 4)}))
	check_eq(client.session, {"code": "K7QM", "token": "t", "room": true}, "a sala de espera já dá para voltar se cair")


func test_room_panel_matches_the_browser_lobby() -> void:
	done = false
	var tree: SceneTree = Engine.get_main_loop()
	var panel := RoomPanel.new()
	tree.root.add_child(panel)
	var sent: Array = []
	panel.action.connect(func(message: Dictionary) -> void: sent.append(message))
	panel.show_room(_room(3, 4))
	check(panel.visible, "a sala aparece")
	var seats: RoomSeats = panel.find_child("Seats", true, false)
	check_eq(seats.get_child_count(), 4, "um lugar por assento, livres inclusive")
	var progress: Label = panel.find_child("Progress", true, false)
	check_eq(progress.text, "3 de 4 jogadores. A partida começa quando a mesa encher e todos tocarem em Pronto.", "o que falta")
	var ready: Button = panel.find_child("Ready", true, false)
	check(ready.visible and ready.text == "Pronto", "Pronto à vista")
	ready.pressed.emit()
	check_eq(sent.back(), {"type": "room-ready", "on": true}, "Pronto manda room-ready")
	var fill: Button = panel.find_child("Fill", true, false)
	check(not fill.visible, "só o anfitrião completa com computadores")
	panel.show_room(_room(3, 4, {"seat": 0}))
	check(fill.visible and fill.text == "Completar com um computador e começar", "o anfitrião completa o lugar livre")
	check(fill.disabled, "com alguém ainda não pronto, espera")
	(panel.find_child("Say_glhf", true, false) as Button).pressed.emit()
	check_eq(sent.back(), {"type": "room-say", "key": "glhf"}, "mensagem pronta")
	panel.say(1, "glhf")
	check(seats.find_child("Bubble", true, false) != null, "o balão aparece no lugar")
	var state: Label = seats.get_child(1).find_child("State", true, false)
	check_eq(state.text, "Ainda não está pronto", "a situação de quem não tocou em Pronto")
	var deck: DeckPicker = panel.find_child("Deck", true, false)
	check(deck.choice_count() > 0, "a lista de decks do formato da sala")
	panel.show_room(_room(3, 4, {"started": true}))
	check(not panel.visible, "começada a partida, some")
	panel.queue_free()
	done = true


func test_menu_offers_to_return_to_the_saved_match() -> void:
	SavedSession.path = "user://partida-teste.json"
	SavedSession.clear()
	SavedSession.save("K7QM", "t", true, "commander")
	var tree: SceneTree = Engine.get_main_loop()
	var menu := MenuScreen.new()
	tree.root.add_child(menu)
	var sent: Array = []
	menu.play.connect(func(message: Dictionary) -> void: sent.append(message))
	var resume: Button = menu.find_child("Resume", true, false)
	check(resume != null and resume.text == "Voltar à partida · sala K7QM", "o menu oferece voltar à partida guardada")
	if resume:
		resume.pressed.emit()
	check_eq(sent, [{"type": "rejoin", "code": "K7QM", "token": "t"}], "voltar manda o rejoin com o assento")
	check(menu.find_child("Online", true, false) != null, "e o Jogar online")
	menu.queue_free()
	SavedSession.clear()
	SavedSession.path = SavedSession.FILE
