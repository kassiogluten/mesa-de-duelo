# Testes do lugar da pilha: o painel diz onde fica cada camada e a mesa põe a carta 3D exatamente ali, o topo na frente.
extends "res://tests/test_case.gd"


func _setup() -> Array:
	var tree: SceneTree = Engine.get_main_loop()
	var catalog := CardCatalog.new()
	tree.root.add_child(catalog)
	var table := TableView.new()
	table.catalog = catalog
	tree.root.add_child(table)
	var panel := StackPanel.new()
	panel.catalog = catalog
	tree.root.add_child(panel)
	return [catalog, table, panel]


func _cleanup(nodes: Array) -> void:
	for node: Node in nodes:
		node.queue_free()


func _state(stack: Array) -> Dictionary:
	var players: Array = []
	for pid: int in [0, 1]:
		players.append({"id": pid, "name": "Você" if pid == 0 else "Ana", "life": 20, "library": 30, "handCount": 0, "hand": [],
			"battlefield": [{"id": 500 + pid, "name": "Soul Warden", "creature": true, "power": 1, "toughness": 1, "controller": pid}], "graveyard": [], "exile": []})
	return {"you": 0, "turn": 3, "players": players, "stack": stack, "combat": [], "input": {"gen": 2, "priority": true}}


func _items() -> Array:
	return [
		{"id": 3, "kind": "spell", "controller": 1, "source": {"id": 300, "name": "Counterspell"}, "targets": {"cards": [150]}},
		{"id": 2, "kind": "trigger", "controller": 1, "source": {"id": 501, "name": "Soul Warden"}},
		{"id": 1, "kind": "spell", "controller": 0, "source": {"id": 150, "name": "Lightning Bolt"}, "targets": {"players": [1]}},
	]


func test_layers_peek_up_and_left_and_collapse_small() -> void:
	var nodes: Array = _setup()
	var panel: StackPanel = nodes[2]
	var top: Rect2 = panel.layer_rect(0)
	var below: Rect2 = panel.layer_rect(1)
	check(below.position.x < top.position.x and below.position.y < top.position.y, "a camada de baixo aparece em cima e à esquerda")
	check_eq(panel.layer_rect(7), panel.layer_rect(StackPanel.MAX_PEEK), "da terceira em diante, no mesmo lugar")
	check(top.end.x <= panel.get_viewport_rect().size.x, "dentro da tela")
	panel.collapsed = true
	check(panel.layer_rect(0).size.y < top.size.y / 2.0, "recolhida, a carta fica pequena")
	_cleanup(nodes)


func test_stack_cards_land_on_the_panel_slot_top_in_front() -> void:
	var nodes: Array = _setup()
	var table: TableView = nodes[1]
	var panel: StackPanel = nodes[2]
	table.stack_slot = panel.layer_rect
	table.apply_state(_state(_items()))
	var camera: Camera3D = table.camera
	for depth: int in 3:
		var t: Transform3D = table.stack_transform(depth, 3)
		var rect: Rect2 = panel.layer_rect(depth)
		check(camera.unproject_position(t.origin).distance_to(rect.get_center()) < 1.5, "camada %d no centro do vão" % depth)
		# A altura na tela: as pontas de cima e de baixo da carta projetadas.
		var half: Vector3 = t.basis * Vector3(0, 0, CardNode.SIZE.y / 2.0)
		var height: float = absf(camera.unproject_position(t.origin + half).y - camera.unproject_position(t.origin - half).y)
		check(absf(height - rect.size.y) < rect.size.y * 0.06, "camada %d do tamanho do vão (%.0f px para %.0f)" % [depth, height, rect.size.y])
	var near: float = camera.global_position.distance_to((table.stack_transform(0, 3) as Transform3D).origin)
	var far: float = camera.global_position.distance_to((table.stack_transform(2, 3) as Transform3D).origin)
	check(near < far, "o topo fica na frente das de baixo")
	check(table.card_node(300) != null and table.zone_of(300) == "stack", "a mágica do topo é a carta dela")
	check_eq(int(table.card_node(300).data.get("stackId", -1)), 3, "a carta sabe qual item da pilha é (para o clique)")
	check(table.card_node("stack:2") != null, "o gatilho vira uma carta da pilha")
	_cleanup(nodes)


func test_without_panel_the_stack_stays_on_the_table() -> void:
	var nodes: Array = _setup()
	var table: TableView = nodes[1]
	var t: Transform3D = table.stack_transform(0, 3)
	check(t.origin.x > 4.5 and t.origin.y < 1.5, "o monte inclinado no tampo, à direita")
	_cleanup(nodes)
