# Reproduz o jogador jogando um terreno com o mouse: inicia a partida, espera a sua principal com um terreno jogável na
# mão, passa o mouse sobre ele como uma pessoa (movimento, espera, clique) e confere se ele chegou ao campo.
# npm run godot -- --resolution 1600x900 --script res://tools/click_check.gd   (servidor local ligado)
extends SceneTree

const StarterDecks := preload("res://cards/starter_decks.gd")

var _screen: MatchScreen
var _left: float = 90.0


func _initialize() -> void:
	await process_frame
	_screen = MatchScreen.new()
	var decks: Array = StarterDecks.of_format("standard")
	_screen.start_message = {"type": "start", "you": StarterDecks.forge_deck(decks[0]), "opponent": StarterDecks.forge_deck(decks[1]), "config": {"format": "standard", "matchLength": "bo1"}}
	root.add_child(_screen)
	_run()


func _state() -> Dictionary:
	return _screen.get("_state")


func _land_in_hand() -> int:
	var state: Dictionary = _state()
	var input: Dictionary = state.get("input", {})
	if not bool(input.get("priority", false)):
		return -1
	for p: Variant in state.get("players", []):
		if (p as Dictionary)["id"] == state["you"]:
			for c: Variant in (p as Dictionary)["hand"]:
				if bool((c as Dictionary).get("land", false)) and (input.get("actionable", []) as Array).has((c as Dictionary)["id"]):
					return int((c as Dictionary)["id"])
	return -1


func _run() -> void:
	# Mantém a mão e passa até ter um terreno jogável (o botão principal da caixa de ação).
	while _land_in_hand() < 0:
		await create_timer(0.5).timeout
		var hud: Hud = _screen.get("_hud")
		var msg: Dictionary = hud.primary_message()
		if not msg.is_empty() and _land_in_hand() < 0:
			(_screen.get("_client") as RefCounted).call("send", msg)
	var id: int = _land_in_hand()
	await create_timer(1.0).timeout
	var table: TableView = _screen.get("_table")
	var node: CardNode = null
	for child: Node in table.get_children():
		if child is CardNode and (child as CardNode).card_id == id:
			node = child
	var target: Vector2 = table.camera.unproject_position(node.global_position)
	print("terreno %d na tela em %s; janela %s, viewport %s" % [id, target, DisplayServer.window_get_size(), root.get_visible_rect().size])
	var from_ray: Vector3 = table.camera.project_ray_origin(target)
	var query := PhysicsRayQueryParameters3D.create(from_ray, from_ray + table.camera.project_ray_normal(target) * 100.0)
	query.collide_with_areas = true
	var hit: Dictionary = table.get_world_3d().direct_space_state.intersect_ray(query)
	var hit_card: Node = (hit["collider"] as Node).get_parent() if hit.has("collider") else null
	print("raio atinge: %s" % ((hit_card as CardNode).card_id if hit_card is CardNode else hit_card))
	var gui: Control = root.gui_get_hovered_control() if root.has_method("gui_get_hovered_control") else null
	print("controle sob o mouse: %s" % gui)
	var hovers: Array = []
	table.card_hovered.connect(func(n: CardNode, on: bool) -> void: hovers.append("%d:%s" % [n.card_id, "entra" if on else "sai"]))
	# Mouse chegando de baixo até a carta, como uma pessoa.
	var from := Vector2(target.x, target.y + 250)
	for i: int in 20:
		var pos: Vector2 = from.lerp(target, (i + 1) / 20.0)
		var move := InputEventMouseMotion.new()
		move.position = pos
		move.global_position = pos
		root.push_input(move, true)
		await process_frame
	for i: int in 40:
		await process_frame
	print("entradas e saídas: %s" % [hovers.slice(0, 16)])
	print("hover: %s; controle sob o mouse: %s" % [node.hovered, root.gui_get_hovered_control()])
	for pressed: bool in [true, false]:
		var click := InputEventMouseButton.new()
		click.button_index = MOUSE_BUTTON_LEFT
		click.pressed = pressed
		click.position = target
		click.global_position = target
		root.push_input(click, true)
		await physics_frame
	await create_timer(3.0).timeout
	for p: Variant in _state().get("players", []):
		if (p as Dictionary)["id"] == _state()["you"]:
			var on_field: bool = ((p as Dictionary)["battlefield"] as Array).any(func(c: Dictionary) -> bool: return int(c["id"]) == id)
			print("RESULTADO: terreno %s" % ("no campo" if on_field else "NÃO foi jogado"))
	quit()


func _process(delta: float) -> bool:
	_left -= delta
	if _left <= 0.0:
		print("tempo esgotado")
		quit(1)
	return false
