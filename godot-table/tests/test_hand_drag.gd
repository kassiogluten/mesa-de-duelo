# Testes da mão: arrastar para jogar (soltar fora da mão joga, dentro devolve ou muda a ordem), a carta jogável mais
# alta no leque, a mão que desce parada e sobe com o mouse ou numa escolha, a carta impressa e o voo da carta comprada.
extends "res://tests/test_case.gd"


func _card(id: int, name: String) -> Dictionary:
	return {"id": id, "name": name, "manaCost": "{G}", "typeLine": "Creature — Elf", "creature": true, "power": 1, "toughness": 1,
		"tapped": false, "controller": 0}


func _state(actionable: Array = [5], extra: Dictionary = {}) -> Dictionary:
	var hand: Array = [_card(5, "Llanowar Elves"), _card(6, "Grizzly Bears"), _card(8, "Forest")]
	var players: Array = [
		{"id": 0, "name": "Você", "life": 20, "library": 30, "hand": hand, "handCount": 3, "battlefield": [], "graveyard": [], "exile": []},
		{"id": 1, "name": "Oponente", "life": 20, "library": 30, "hand": [], "handCount": 2, "battlefield": [], "graveyard": [], "exile": []},
	]
	var input: Dictionary = {"gen": 7, "priority": true, "ok": {"label": "OK", "enabled": true}, "cancel": {"label": "", "enabled": false},
		"selectable": [], "actionable": actionable}
	var state: Dictionary = {"type": "state", "you": 0, "turn": 3, "phase": "MAIN1", "activePlayer": 0, "players": players, "stack": [],
		"combat": [], "input": input, "events": [], "gameOver": false}
	state.merge(extra, true)
	return state


func test_only_a_playable_hand_card_can_be_dragged_to_play() -> void:
	check(HandDrag.can_drag(_state(), 5), "a carta jogável da mão")
	check(not HandDrag.can_drag(_state(), 6), "a que não está em actionable")
	check(not HandDrag.can_drag(_state(), 99), "carta que não está na sua mão")
	check(not HandDrag.can_drag(_state([5], {"question": {"id": 1}}), 5), "com uma pergunta aberta")
	var targeting: Dictionary = _state()
	(targeting["input"] as Dictionary)["targeting"] = {"source": 5}
	check(not HandDrag.can_drag(targeting, 5), "escolhendo alvos")
	var waiting: Dictionary = _state()
	(waiting["input"] as Dictionary)["priority"] = false
	check(not HandDrag.can_drag(waiting, 5), "sem a prioridade")


func test_dropping_outside_the_hand_plays_and_inside_returns() -> void:
	var hand := Rect2(500, 700, 600, 300)
	var start := Vector2(700, 800)
	check_eq(HandDrag.drop_action(_state(), 5, start, Vector2(800, 400), hand), {"type": "card", "id": 5, "gen": 7}, "solta no campo: joga com o gen")
	check_eq(HandDrag.drop_action(_state(), 5, start, Vector2(750, 760), hand), {}, "solta na mão: não joga")
	check_eq(HandDrag.drop_action(_state(), 5, start, Vector2(703, 797), hand), {}, "quase não andou: é clique, não arrasto")
	check_eq(HandDrag.drop_action(_state(), 6, start, Vector2(800, 400), hand), {}, "carta que não dá para jogar volta")
	check(HandDrag.inside_hand(hand, Vector2(510, 1060)), "abaixo da mão também é a mão")
	check(not HandDrag.inside_hand(hand, Vector2(300, 800)), "ao lado da mão é o campo")


func test_hand_order() -> void:
	check_eq(HandDrag.arrange([8, 5, 3], [5, 6, 8]), [8, 5, 6] as Array[int], "mantém a ordem guardada; a nova entra no fim; a que saiu some")
	check_eq(HandDrag.move_in_hand([5, 6, 8], 5, 2), [6, 8, 5], "leva a carta para o fim")
	check_eq(HandDrag.move_in_hand([5, 6, 8], 6, 1), [], "no mesmo lugar não muda nada")
	check_eq(HandDrag.drop_index([100.0, 200.0, 300.0], 0, 250.0), 1, "solta entre a segunda e a terceira")
	check_eq(HandDrag.drop_index([100.0, 200.0, 300.0], 2, 50.0), 0, "solta antes da primeira")


func test_arrival_flight_goes_from_library_face_down_to_the_slot() -> void:
	var to := Transform3D(Basis(Vector3.RIGHT, -0.8), Vector3(1, 3, 4))
	var q0 := Quaternion.IDENTITY
	var q1: Quaternion = to.basis.get_rotation_quaternion()
	var p0 := Vector3(-5, 0.3, 2)
	var p1 := Vector3(-2, 2.0, 3)
	var start: Transform3D = HandMotion.arrive_pose(q0, q1, 1.0, 1.0, p0, p1, to.origin, true, 0.0)
	check(start.origin.is_equal_approx(p0), "sai do grimório")
	check(start.basis.y.dot(Vector3.UP) < -0.99, "de costas (a face para baixo)")
	var end: Transform3D = HandMotion.arrive_pose(q0, q1, 1.0, 1.0, p0, p1, to.origin, true, 1.0)
	check(end.is_equal_approx(to), "termina no lugar da mão, de frente")
	var middle: Transform3D = HandMotion.arrive_pose(q0, q1, 1.0, 1.0, p0, p1, to.origin, true, 0.5)
	check(middle.origin.y > lerpf(p0.y, to.origin.y, 0.5) + 0.1, "passa pelo alto")
	var tilt: Vector3 = HandMotion.drag_tilt(Vector2(5000, 0), 0.0)
	check(tilt.y < 0.0 and absf(tilt.y) <= HandMotion.DRAG_TILT_MAX, "arrastando para a direita, inclina com teto")


func _table() -> TableView:
	var tree: SceneTree = Engine.get_main_loop()
	var catalog := CardCatalog.new()
	tree.root.add_child(catalog)
	var table := TableView.new()
	table.catalog = catalog
	tree.root.add_child(table)
	return table


func test_playable_card_sits_higher_and_the_hand_has_a_drop_band() -> void:
	var table := _table()
	table.apply_state(_state())
	var before: Array = table.hand_slots()
	table.apply_hand_layout([5], true)
	var after: Array = table.hand_slots()
	var screen := func(slot: Dictionary) -> Vector2: return table.camera.unproject_position((slot["transform"] as Transform3D).origin)
	check_eq(after.map(func(s: Dictionary) -> int: return int(s["id"])), [5, 6, 8], "a mão na ordem do servidor")
	check((screen.call(after[0]) as Vector2).y < (screen.call(before[0]) as Vector2).y - 2.0, "a jogável sobe na tela")
	check((screen.call(after[1]) as Vector2).is_equal_approx(screen.call(before[1])), "as outras ficam no lugar")
	var band: Rect2 = table.hand_rect()
	var view: Vector2 = table.get_viewport().get_visible_rect().size
	check(band.size.x > 100.0 and band.position.y > view.y * 0.5, "a faixa da mão fica embaixo (%s em %s)" % [band, view])
	table.set_hand_order([8, 5, 6])
	check_eq(table.hand_slots().map(func(s: Dictionary) -> int: return int(s["id"])), [8, 5, 6], "a ordem escolhida vale")
	table.apply_state(_state())
	check_eq(table.hand_slots().map(func(s: Dictionary) -> int: return int(s["id"])), [8, 5, 6], "e continua no estado seguinte")
	table.catalog.queue_free()
	table.queue_free()


func test_hand_rests_low_and_rises_with_the_mouse_or_a_choice() -> void:
	check_eq(HandPlacement.level_drop(false, false), HandPlacement.REST_DROP, "parada, a mão desce")
	check_eq(HandPlacement.level_drop(true, false), HandPlacement.PEEK_DROP, "com o mouse em cima, sobe um pouco")
	check_eq(HandPlacement.level_drop(false, true), 0.0, "numa escolha na mão, sobe inteira")
	check(not HandPlacement.choosing_hand(_state()), "com a prioridade, não é escolha na mão")
	var discard: Dictionary = _state([], {})
	(discard["input"] as Dictionary).merge({"priority": false, "selectable": [6, 8]}, true)
	check(HandPlacement.choosing_hand(discard), "descartar: as cartas da mão estão entre as escolhíveis")
	var field: Dictionary = _state([], {})
	(field["input"] as Dictionary).merge({"priority": false, "selectable": [40]}, true)
	check(not HandPlacement.choosing_hand(field), "escolha só no campo: a mão fica baixa")
	var mulligan: Dictionary = _state([], {})
	(mulligan["input"] as Dictionary)["opening"] = "mulligan"
	check(HandPlacement.choosing_hand(mulligan), "no mulligan a mão sobe inteira")

	var table := _table()
	table.apply_state(_state())
	var view: Vector2 = table.get_viewport().get_visible_rect().size
	var low: Rect2 = table.hand_rect()
	check(low.end.y > view.y + low.size.y * 0.15, "parada, a parte de baixo das cartas fica fora da tela (%s em %s)" % [low, view])
	table.update_hand_peek(Vector2(low.get_center().x, low.position.y + 20.0))
	var peek: Rect2 = table.hand_rect()
	check(peek.position.y < low.position.y - 10.0, "o mouse na mão: ela sobe")
	check(peek.end.y > view.y, "mas ainda passa um pouco da borda")
	table.update_hand_peek(Vector2(low.get_center().x, view.y * 0.2))
	check(is_equal_approx(table.hand_rect().position.y, low.position.y), "o mouse saiu: desce de novo")
	table.apply_hand_layout([], false, true)
	check(table.hand_rect().end.y < view.y, "numa escolha na mão, as cartas ficam inteiras na tela")
	var card: CardNode = table.card_node(5)
	check(bool(card.get_meta("printed", false)), "a carta da mão aparece como impressa")
	check(not bool(table.card_node("hand:1:0").get_meta("printed", false)), "os versos da mão do oponente, não")
	table.catalog.queue_free()
	table.queue_free()


func _push(tree: SceneTree, event: InputEvent) -> void:
	tree.root.push_input(event, true)


func _mouse(tree: SceneTree, pos: Vector2, pressed: Variant = null) -> void:
	if pressed == null:
		var motion := InputEventMouseMotion.new()
		motion.position = pos
		motion.global_position = pos
		_push(tree, motion)
		return
	var button := InputEventMouseButton.new()
	button.button_index = MOUSE_BUTTON_LEFT
	button.pressed = bool(pressed)
	button.position = pos
	button.global_position = pos
	_push(tree, button)


func test_dragging_a_card_to_the_field_plays_it_and_to_the_hand_brings_it_back() -> void:
	done = false
	var tree: SceneTree = Engine.get_main_loop()
	var table := _table()
	var state: Dictionary = _state()
	table.apply_state(state)
	table.apply_hand_layout([5], true)
	var drag := HandDrag.new()
	drag.table = table
	drag.state = func() -> Dictionary: return state
	tree.root.add_child(drag)
	var played: Array = []
	var tapped: Array = []
	drag.play.connect(func(message: Dictionary) -> void: played.append(message))
	drag.tapped.connect(func(node: CardNode) -> void: tapped.append(node.card_id))
	var card: CardNode = table.card_node(5)
	var from: Vector2 = table.camera.unproject_position(card.global_position)

	# Clique sem arrastar: vale como clique.
	_mouse(tree, from, true)
	drag.press(card)
	_mouse(tree, from, false)
	check_eq(tapped, [5], "apertar e soltar no lugar é clique")

	# Arrasta até o campo e solta: joga.
	_mouse(tree, from, true)
	drag.press(card)
	var field := Vector2(from.x, table.hand_rect().position.y - 250.0)
	for i: int in 6:
		_mouse(tree, from.lerp(field, (i + 1) / 6.0))
		await tree.process_frame
	check(drag.active(), "virou arrasto")
	check(not card.visible, "a carta da mão some enquanto a cópia segue o mouse")
	_mouse(tree, field, false)
	check_eq(played, [{"type": "card", "id": 5, "gen": 7}], "soltar no campo manda o mesmo pedido do clique")
	check_eq(tapped, [5], "e não conta como clique")
	# O servidor não aceitou (novo gen, a carta continua na mão): ela volta.
	var next: Dictionary = _state()
	(next["input"] as Dictionary)["gen"] = 8
	drag.before_state(next)
	await tree.create_timer(HandDrag.RETURN_TIME + 0.15).timeout
	check(card.visible, "recusada, a carta volta para a mão")

	# Arrasta e solta de volta na mão: não joga.
	_mouse(tree, from, true)
	drag.press(card)
	for i: int in 4:
		_mouse(tree, from + Vector2(0, -12.0 * (i + 1)))
		await tree.process_frame
	_mouse(tree, from + Vector2(0, -20), false)
	check_eq(played.size(), 1, "soltar na mão não joga")
	await tree.create_timer(HandDrag.RETURN_TIME + 0.15).timeout
	check(card.visible, "a carta volta ao lugar")

	drag.queue_free()
	table.catalog.queue_free()
	table.queue_free()
	done = true
