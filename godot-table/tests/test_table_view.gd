# Testes da mesa 3D com estados gravados de uma partida (tests/fixtures/abertura.json): zonas, voo entre zonas e clique.
extends "res://tests/test_case.gd"

const FIXTURE := "res://tests/fixtures/abertura.json"


func _states() -> Array:
	return JSON.parse_string(FileAccess.get_file_as_string(FIXTURE))


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


func _cards(table: TableView) -> Array[CardNode]:
	var out: Array[CardNode] = []
	for child: Node in table.get_children():
		if child is CardNode and not child.is_queued_for_deletion():
			out.append(child)
	return out


func test_mulligan_state_shows_both_hands_and_libraries() -> void:
	var table := _table()
	var state: Dictionary = _states()[2]
	table.apply_state(state)
	var mine: Array = []
	var backs: int = 0
	for node: CardNode in _cards(table):
		if node.card_id >= 0:
			mine.append(node.card_id)
		elif node.data.is_empty():
			backs += 1
	var me: Dictionary = (state["players"] as Array).filter(func(p: Dictionary) -> bool: return int(p["id"]) == int(state["you"]))[0]
	check_eq(mine.size(), (me["hand"] as Array).size(), "uma carta por carta da sua mão")
	# Versos: os 7 da mão do oponente e os dois grimórios.
	var opponent: Dictionary = (state["players"] as Array).filter(func(p: Dictionary) -> bool: return int(p["id"]) != int(state["you"]))[0]
	check_eq(backs, int(opponent["handCount"]) + 2, "versos da mão do oponente e dos grimórios")
	_cleanup(table)


func test_card_keeps_its_node_when_it_changes_zone() -> void:
	var table := _table()
	var states: Array = _states()
	# Acha um estado em que o oponente jogou um terreno (entrou no campo) e confere que o nó é reaproveitado depois.
	table.apply_state(states[5])
	var opponent: Dictionary = (states[5]["players"] as Array).filter(func(p: Dictionary) -> bool: return int(p["id"]) != int(states[5]["you"]))[0]
	check(not (opponent["battlefield"] as Array).is_empty(), "o oponente tem um terreno no campo no estado 5")
	var land_id: int = int(((opponent["battlefield"] as Array)[0] as Dictionary)["id"])
	var before: CardNode = null
	for node: CardNode in _cards(table):
		if node.card_id == land_id:
			before = node
	check(before != null, "o terreno virou um nó na mesa")
	table.apply_state(states[9])
	var after: CardNode = null
	for node: CardNode in _cards(table):
		if node.card_id == land_id:
			after = node
	check(before == after, "o mesmo nó continua no estado seguinte")
	_cleanup(table)


func test_mouse_click_reaches_the_hand_card() -> void:
	done = false
	var table := _table()
	var state: Dictionary = _states()[2]
	table.apply_state(state)
	var me: Dictionary = (state["players"] as Array).filter(func(p: Dictionary) -> bool: return int(p["id"]) == int(state["you"]))[0]
	var target_id: int = int(((me["hand"] as Array)[3] as Dictionary)["id"])
	var target: CardNode = null
	for node: CardNode in _cards(table):
		if node.card_id == target_id:
			target = node
	var clicked: Array[int] = []
	table.card_clicked.connect(func(n: CardNode) -> void: clicked.append(n.card_id))
	var tree: SceneTree = Engine.get_main_loop()
	await tree.physics_frame
	await tree.physics_frame
	var screen: Vector2 = table.camera.unproject_position(target.global_position)
	for pressed: bool in [true, false]:
		var event := InputEventMouseButton.new()
		event.button_index = MOUSE_BUTTON_LEFT
		event.pressed = pressed
		event.position = screen
		event.global_position = screen
		tree.root.push_input(event, true)
		await tree.physics_frame
		await tree.physics_frame
	check_eq(clicked, [target_id] as Array[int], "o clique no centro da carta chega nela")
	_cleanup(table)
	done = true
