# A zona de comando na mesa 3D: o comandante fora do campo, junto do retrato, menor e inclinado, com o selo de coroa e
# taxa colado embaixo (e a coroa do canto só no campo).
extends "res://tests/test_case.gd"


func _table() -> TableView:
	var tree: SceneTree = Engine.get_main_loop()
	var catalog := CardCatalog.new()
	tree.root.add_child(catalog)
	var table := TableView.new()
	table.catalog = catalog
	tree.root.add_child(table)
	return table


func _cleanup(table: TableView) -> void:
	table.catalog.queue_free()
	table.queue_free()


func _player(id: int, command: Array, tax: Array, field: Array = []) -> Dictionary:
	var commanders: Array = []
	for i: int in command.size():
		commanders.append({"id": int((command[i] as Dictionary)["id"]), "name": (command[i] as Dictionary)["name"], "casts": 0, "tax": tax[i]})
	return {"id": id, "seat": id, "name": "J%d" % id, "life": 40, "library": 80, "handCount": 7, "hand": [], "battlefield": field,
		"graveyard": [], "exile": [], "commandZone": command, "commanders": commanders}


func _commander(id: int, name: String) -> Dictionary:
	return {"id": id, "name": name, "commander": true, "tapped": false, "typeLine": "Legendary Creature — Vampire", "creature": true,
		"power": 4, "toughness": 4}


func _state(players: Array) -> Dictionary:
	return {"type": "state", "you": 0, "turn": 5, "phase": "MAIN1", "activePlayer": 0, "players": players, "stack": [], "combat": [],
		"input": {"gen": 1, "priority": true, "ok": {"label": "", "enabled": false}, "cancel": {"label": "", "enabled": false}}}


## Os quatro cantos da carta no tampo (x, z), pelo transform dela.
func _corners(node: CardNode) -> Array:
	var out: Array = []
	for corner: Vector2 in [Vector2(-1, -1), Vector2(1, -1), Vector2(-1, 1), Vector2(1, 1)]:
		out.append(node.global_transform * Vector3(corner.x * CardNode.SIZE.x / 2.0, 0, corner.y * CardNode.SIZE.y / 2.0))
	return out


func test_seal_shows_the_crown_and_the_tax() -> void:
	var seal: Dictionary = BadgeSpec.command_seal(4)
	check_eq(seal["icon"], "crown", "coroa no selo")
	check_eq(seal["text"], "+4", "taxa à vista")
	check(not BadgeSpec.command_seal(0).has("text"), "sem taxa, só a coroa")
	var player: Dictionary = _player(0, [_commander(7, "Edgar Markov"), _commander(8, "Krenko")], [2, 0])
	check_eq(BadgeSpec.commander_tax(player, 7), 2, "taxa do comandante pelo id")
	check_eq(BadgeSpec.commander_tax(player, 8), 0, "o parceiro sem taxa")
	check_eq(BadgeSpec.commander_tax(player, 99), 0, "carta que não é comandante")


func test_pose_is_smaller_tilted_and_above_the_table() -> void:
	var t: Transform3D = SeatLayout.command_pose(Vector3(1, 0, -4.5), 0.85, 0, 1)
	check(absf(t.basis.get_scale().x - 0.85) < 0.001, "menor que as cartas do campo")
	var top: Vector3 = t * Vector3(0, 0, -CardNode.SIZE.y / 2.0)
	var bottom: Vector3 = t * Vector3(0, 0, CardNode.SIZE.y / 2.0)
	check(top.y > bottom.y + 0.1, "a ponta de cima erguida, como numa exposição")
	check(bottom.y > 0.0, "a ponta de baixo não entra no tampo")
	check(absf(top.x - bottom.x) > 0.02, "girada no tampo")
	var a: Transform3D = SeatLayout.command_pose(Vector3.ZERO, 0.85, 0, 2)
	var b: Transform3D = SeatLayout.command_pose(Vector3.ZERO, 0.85, 1, 2)
	check(b.origin.x - a.origin.x > CardNode.SIZE.x * 0.85, "a dupla de parceiros lado a lado, sem se cobrir")


func test_my_commander_leaves_the_field_and_the_crown_goes_to_the_seal() -> void:
	var table := _table()
	var me: Dictionary = _player(0, [_commander(600, "Edgar Markov")], [2])
	var opp: Dictionary = _player(1, [_commander(610, "Thrasios, Triton Hero"), _commander(611, "Tymna the Weaver")], [4, 0])
	table.apply_state(_state([me, opp]))
	var node: CardNode = table.card_node(600)
	check(node != null, "o comandante está na mesa")
	check_eq(table.zone_of(600), "command", "na zona de comando (clique e inspetor seguem por ela)")
	for corner: Vector3 in _corners(node):
		check(not SeatLayout.inside_my_border(corner), "fora da borda dourada (canto em %s)" % str(corner))
	check(node.global_transform.basis.get_scale().x < 1.0, "menor que as permanentes")
	var keys: PackedStringArray = BadgeFx.badges_of(node).keys()
	check(keys.has("bottom_mid"), "o selo de coroa e taxa embaixo (veio %s)" % str(keys))
	check(not keys.has("corner:crown"), "sem a coroa do canto na zona de comando")
	check(table.zone_position(0, "command").distance_to(node.global_position) < 0.6, "os voos saem do lugar novo")
	# Os do oponente: junto do retrato, longe das fileiras do campo dele.
	var frame: Dictionary = table.frame_of(1)
	for id: int in [610, 611]:
		var other: CardNode = table.card_node(id)
		check(other.global_position.z < float(frame["lands_z"]) - 1.4, "o comandante do oponente fora do campo dele")
		check(absf(other.global_position.z - (frame["portrait"] as Vector3).z) < 0.6, "na altura do retrato")
		check(BadgeFx.badges_of(other).keys().has("bottom_mid"), "o selo nos oponentes também")
	check(table.card_node(611).global_position.x > table.card_node(610).global_position.x + 0.4, "os parceiros lado a lado")
	# Conjurado e no campo: a coroa volta para o canto e o selo da zona sai.
	me["commandZone"] = []
	me["battlefield"] = [_commander(600, "Edgar Markov")]
	table.apply_state(_state([me, opp]))
	keys = BadgeFx.badges_of(table.card_node(600)).keys()
	check(keys.has("corner:crown"), "no campo, a coroa no canto (veio %s)" % str(keys))
	check(not keys.has("bottom_mid"), "no campo, sem o selo da zona")
	_cleanup(table)


func test_opponents_of_four_keep_the_commander_next_to_the_portrait() -> void:
	var table := _table()
	var players: Array = [_player(0, [_commander(600, "Edgar Markov")], [0])]
	for pid: int in [1, 2, 3]:
		players.append(_player(pid, [_commander(600 + pid * 10, "Krenko, Mob Boss")], [pid * 2]))
	table.apply_state(_state(players))
	for pid: int in [1, 2, 3]:
		var frame: Dictionary = table.frame_of(pid)
		var node: CardNode = table.card_node(600 + pid * 10)
		var portrait: Vector3 = frame["portrait"]
		check(node.global_position.x > portrait.x + 0.6, "à direita do retrato (jogador %d)" % pid)
		check(node.global_position.x < (frame["hand"] as Vector3).x - 0.4, "antes do leque da mão (jogador %d)" % pid)
		check(node.global_position.z < float(frame["lands_z"]) - 0.8, "fora das fileiras do campo (jogador %d)" % pid)
	_cleanup(table)
