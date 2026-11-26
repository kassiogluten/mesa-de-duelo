# Testes da vista da mesa escolhida pelo jogador (table/table_camera.gd): teclas, zoom puxando para o mouse, limites, a
# mão parada na tela em qualquer vista, os efeitos que voltam para a vista escolhida e o que fica guardado.
extends "res://tests/test_case.gd"


func _table() -> TableView:
	var tree: SceneTree = Engine.get_main_loop()
	var catalog := CardCatalog.new()
	tree.root.add_child(catalog)
	var table := TableView.new()
	table.catalog = catalog
	tree.root.add_child(table)
	table.view_rig.load_prefs({})
	return table


func _cleanup(table: TableView) -> void:
	table.catalog.queue_free()
	table.queue_free()


static func _state(opponents: int = 1) -> Dictionary:
	var hand: Array = []
	for i: int in 5:
		hand.append({"id": 50 + i, "name": "Opt", "manaCost": "{U}", "controller": 0})
	var players: Array = [{"id": 0, "seat": 0, "name": "Você", "life": 20, "library": 30, "hand": hand, "handCount": 5, "graveyard": [], "exile": [],
		"battlefield": [{"id": 1, "name": "Island", "land": true, "controller": 0}]}]
	for i: int in opponents:
		players.append({"id": i + 1, "seat": i + 1, "name": "Oponente", "life": 20, "library": 30, "handCount": 4, "graveyard": [], "exile": [],
			"battlefield": [{"id": 10 + i, "name": "Grizzly Bears", "creature": true, "power": 2, "toughness": 2, "controller": i + 1}]})
	return {"you": 0, "turn": 3, "phase": "MAIN1", "activePlayer": 0, "stack": [], "events": [], "input": {}, "players": players}


## Onde fica na tela o meio de cada carta da sua mão (pelo lugar que a mesa deu a ela).
func _hand_on_screen(table: TableView) -> Array:
	var out: Array = []
	for slot: Dictionary in table.hand_slots():
		out.append(table.camera.unproject_position((slot["transform"] as Transform3D).origin))
	return out


func test_camera_keys() -> void:
	check_eq(KeyMap.action_for(KEY_EQUAL, 43, true, false), "zoom_in", "+ (Shift+= no teclado ABNT)")
	check_eq(KeyMap.action_for(KEY_EQUAL, 61, false, false), "zoom_in", "= sozinho também aproxima")
	check_eq(KeyMap.action_for(KEY_KP_ADD, 43, false, false), "zoom_in", "+ do teclado numérico")
	check_eq(KeyMap.action_for(KEY_MINUS, 45, false, false), "zoom_out", "−")
	check_eq(KeyMap.action_for(KEY_KP_SUBTRACT, 45, false, false), "zoom_out", "− do teclado numérico")
	check_eq(KeyMap.action_for(KEY_EQUAL, 43, true, false, true), "zoom_in", "segurar o + continua aproximando")
	check_eq(KeyMap.action_for(KEY_Q, 113, false, false), "view_left", "Q gira para a esquerda")
	check_eq(KeyMap.action_for(KEY_E, 101, false, false), "view_right", "E gira para a direita")
	check_eq(KeyMap.action_for(KEY_E, 101, false, false, true), "view_right", "segurar o E continua girando")
	check_eq(KeyMap.action_for(KEY_V, 118, false, false), "", "o V não troca mais de ângulo pronto")
	check_eq(KeyMap.action_for(KEY_0, 48, false, false), "view_reset", "0 volta à vista padrão")
	check_eq(KeyMap.action_for(KEY_KP_0, 48, false, false), "view_reset", "0 do teclado numérico")
	check_eq(KeyMap.action_for(KEY_MINUS, 45, false, true), "", "Ctrl+− fica para o sistema")


func test_default_view_is_the_old_fixed_camera() -> void:
	var table := _table()
	check(table.view_offset().is_equal_approx(Transform3D.IDENTITY), "na vista padrão o suporte não mexe na câmera")
	check(table.camera.global_transform.is_equal_approx(TableCamera.HOME), "a câmera no lugar de sempre")
	check(table.view_rig.is_default(), "começa na vista padrão")
	_cleanup(table)


func test_hand_stays_put_on_screen_in_every_view() -> void:
	var table := _table()
	table.apply_state(_state())
	var before: Array = _hand_on_screen(table)
	check_eq(before.size(), 5, "as cinco cartas da mão")
	var rig: TableCamera = table.view_rig
	var views: Array = [[0.0, TableCamera.DEFAULT_PITCH], [-TableCamera.MAX_YAW, TableCamera.DEFAULT_PITCH], [TableCamera.MAX_YAW * 0.4, 1.2], [0.0, TableCamera.MAX_PITCH]]
	for i: int in views.size():
		for zoom: float in [TableCamera.ZOOM_NEAR, 1.0, TableCamera.ZOOM_FAR]:
			rig.yaw = (views[i] as Array)[0]
			rig.pitch = (views[i] as Array)[1]
			rig.zoom = zoom
			rig.snap()
			var now: Array = _hand_on_screen(table)
			for k: int in now.size():
				check((now[k] as Vector2).distance_to(before[k]) < 1.0, "ângulo %d, zoom %.2f: a carta %d da mão no mesmo lugar da tela" % [i, zoom, k])
			# A carta pousada no lugar dela (sem voo: a vista mexe direto).
			var node: CardNode = table.card_node(50)
			check(node.transform.is_equal_approx(node.target_transform()), "ângulo %d, zoom %.2f: a mão acompanha a câmera sem voar" % [i, zoom])
			# Com o zoom, a mão encolhe para perto da câmera: nunca entra no tampo.
			for slot: Dictionary in table.hand_slots():
				check((slot["transform"] as Transform3D).origin.y > 0.4, "ângulo %d, zoom %.2f: a mão fica acima do tampo" % [i, zoom])
	_cleanup(table)


func test_zoom_keeps_the_point_under_the_mouse() -> void:
	var table := _table()
	var rig: TableCamera = table.view_rig
	var size: Vector2 = table.get_viewport().get_visible_rect().size
	var mouse := Vector2(size.x * 0.55, size.y * 0.42)
	var ground := Plane(Vector3.UP, TableCamera.POINT_Y)
	var point: Variant = ground.intersects_ray(table.camera.project_ray_origin(mouse), table.camera.project_ray_normal(mouse))
	check(point is Vector3, "o mouse aponta para a mesa")
	rig.zoom_by(2.0, mouse)
	rig.snap()
	check(rig.zoom < 1.0, "a roda para cima aproxima")
	check(not rig.pan.is_zero_approx(), "e a vista anda para o lado do mouse")
	# (Sem janela, a tela de verdade dos testes é minúscula: a folga é de 0,25% da altura.)
	check(table.camera.unproject_position(point).distance_to(mouse) < size.y * 0.0025, "o ponto sob o mouse fica parado na tela")
	rig.zoom_by(-20.0, mouse)
	rig.snap()
	check_eq(rig.zoom, TableCamera.ZOOM_FAR, "afastar para no limite de longe")
	check(rig.pan.is_zero_approx(), "sem zoom, a vista volta para o meio")
	rig.zoom_by(40.0, Vector2(0, 0))
	check_eq(rig.zoom, TableCamera.ZOOM_NEAR, "aproximar para no limite de perto")
	check(absf(rig.pan.x) <= TableCamera.PAN_X + 0.001 and rig.pan.z >= -TableCamera.PAN_FAR - 0.001, "e a vista não sai da mesa")
	rig.reset()
	rig.snap()
	check(rig.is_default(), "0 volta à vista padrão")
	check(table.camera.global_transform.is_equal_approx(TableCamera.HOME), "com a câmera no lugar de sempre")
	_cleanup(table)


func test_pan_room_grows_with_zoom() -> void:
	check(TableCamera.clamp_pan(Vector3(3, 0, -3), 1.0).is_zero_approx(), "sem zoom, a vista não anda")
	check(TableCamera.clamp_pan(Vector3(3, 0, -3), 1.1).is_zero_approx(), "afastada, também não")
	check_eq(TableCamera.clamp_pan(Vector3(9, 0, -9), TableCamera.ZOOM_NEAR), Vector3(TableCamera.PAN_X, 0, -TableCamera.PAN_FAR), "com o zoom todo, até a borda")
	check_eq(TableCamera.clamp_pan(Vector3(0, 0, 9), TableCamera.ZOOM_NEAR), Vector3(0, 0, TableCamera.PAN_NEAR), "para o seu lado, menos")


func test_free_turn_stops_at_90_degrees_and_keeps_the_zoom() -> void:
	var table := _table()
	var rig: TableCamera = table.view_rig
	rig.zoom_by(1.0)
	var zoom: float = rig.zoom
	rig.orbit_by(-TableCamera.KEY_STEP)
	check(rig.yaw < 0.0, "Q: a câmera vai para a esquerda")
	check_eq(rig.angle_name(), "Girada", "o botão mostra a vista girada")
	check(rig.moving(), "o giro é com transição")
	rig.orbit_by(-10.0)
	check_eq(rig.yaw, -TableCamera.MAX_YAW, "o giro para em 90° para a esquerda")
	rig.orbit_by(20.0)
	check_eq(rig.yaw, TableCamera.MAX_YAW, "e em 90° para a direita")
	rig.drag(Vector2(0, 10000))
	check_eq(rig.pitch, TableCamera.MAX_PITCH, "arrastar para baixo inclina até olhar de cima")
	rig.drag(Vector2(0, -10000))
	check_eq(rig.pitch, TableCamera.DEFAULT_PITCH, "e para cima volta só até a inclinação de sempre")
	rig.drag(Vector2(100, 0))
	check(rig.yaw < TableCamera.MAX_YAW, "arrastar para a direita gira a mesa junto com o mouse")
	check_eq(rig.zoom, zoom, "girar mantém o zoom")
	rig.snap()
	# Girada 90°, a câmera fica do lado da mesa, na mesma distância do meio.
	rig.yaw = TableCamera.MAX_YAW
	rig.pitch = TableCamera.DEFAULT_PITCH
	rig.zoom = 1.0
	rig.pan = Vector3.ZERO
	rig.snap()
	var eye: Vector3 = (rig.goal() as Dictionary)["eye"]
	check(eye.x > 5.0 and absf(eye.z - TableCamera.PIVOT.z) < 0.01, "a 90°, a câmera olha a mesa pelo lado direito")
	check(is_equal_approx(eye.distance_to(TableCamera.PIVOT), TableCamera.DISTANCE), "na distância de sempre")
	rig.reset()
	rig.snap()
	check(rig.is_default(), "0 volta à vista padrão")
	_cleanup(table)


func test_effects_return_to_the_chosen_view() -> void:
	var table := _table()
	var rig: TableCamera = table.view_rig
	rig.orbit_by(0.6, 0.4)
	rig.zoom_by(2.0)
	rig.snap()
	var target := Vector3(1.5, 0.2, -2.0)
	# O foco dos efeitos leva a câmera (dentro da vista) na direção do lance: com o caminho todo, chegaria nele.
	table.camera.position = TableView.CAMERA_POS.lerp(TableCamera.local_point(table.camera, target), 1.0)
	check(table.camera.global_position.is_equal_approx(target), "o lance, nas coordenadas da vista, é o mesmo ponto da mesa")
	# E volta para o lugar de sempre dentro da vista: a vista escolhida, não a padrão.
	table.camera.position = TableView.CAMERA_POS
	var view: Dictionary = rig.goal()
	check(table.camera.global_position.is_equal_approx(view["eye"]), "a volta é para o olho da vista escolhida")
	_cleanup(table)


func test_prefs_restore_turn_and_zoom() -> void:
	var table := _table()
	var rig: TableCamera = table.view_rig
	rig.load_prefs({"camera_yaw": -30.0, "camera_pitch": 75.0, "camera_zoom": 0.8})
	check(is_equal_approx(rig.yaw, deg_to_rad(-30.0)), "o giro guardado")
	check(is_equal_approx(rig.pitch, deg_to_rad(75.0)), "a inclinação guardada")
	check(is_equal_approx(rig.zoom, 0.8), "o zoom guardado")
	check(rig.pan.is_zero_approx(), "a vista começa no meio")
	check(not rig.moving(), "já no lugar, sem transição")
	rig.load_prefs({"camera_yaw": 400.0, "camera_pitch": 10.0, "camera_zoom": 9.0})
	check_eq(rig.yaw, TableCamera.MAX_YAW, "giro fora do limite fica no limite")
	check_eq(rig.pitch, TableCamera.DEFAULT_PITCH, "inclinação abaixo da de sempre fica na de sempre")
	check_eq(rig.zoom, TableCamera.ZOOM_FAR, "zoom fora do limite fica no limite")
	rig.load_prefs({"camera_angle": "cima"})
	check(rig.is_default(), "o ângulo pronto de antes não vale mais: a vista padrão")
	_cleanup(table)


func test_opponent_portrait_stays_on_screen() -> void:
	var view := Vector2(1600, 900)
	check_eq(Hud.clamp_portrait(Vector2(800, -300), 130.0, view), Vector2(800, 65), "acima da tela: encosta na borda de cima")
	check_eq(Hud.clamp_portrait(Vector2(1700, 120), 130.0, view), Vector2(1525, 120), "à direita: fica na borda")
	check_eq(Hud.clamp_portrait(Vector2(500, 700), 100.0, view), Vector2(500, 405), "não desce para a metade de baixo")
	# Na vista padrão, o retrato fica onde sempre ficou (a borda só vale com zoom ou ângulo), numa tela 16:9.
	var root: Window = (Engine.get_main_loop() as SceneTree).root
	var window: Vector2i = root.size
	root.size = Vector2i(1600, 900)
	for opponents: int in [1, 3]:
		var table := _table()
		table.apply_state(_state(opponents))
		var size: Vector2 = table.get_viewport().get_visible_rect().size
		for id: int in range(1, opponents + 1):
			var slot: Vector2 = table.portrait_slot(id)
			var side: float = 100.0 if opponents > 1 else 130.0
			check(Hud.clamp_portrait(slot, side, size).is_equal_approx(slot), "%d oponente(s): o retrato %d no lugar de sempre (%s em %s)" % [opponents, id, slot, size])
		_cleanup(table)
	root.size = window
