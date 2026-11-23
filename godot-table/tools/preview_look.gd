# Prévia do visual da cena (luz, materiais, tampo, pós-processamento): a mesa inteira, as cartas de perto (arte, força e
# resistência, selos), os versos, efeitos somando luz (para ver se algo estoura em branco) e a luz da vez do oponente. Com janela:
# npm run godot -- --resolution 1600x900 --position 0,0 --script res://tools/preview_look.gd -- <pasta>
extends SceneTree

var _table: TableView
var _folder: String


func _initialize() -> void:
	await process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	_folder = args[0] if args.size() > 0 else OS.get_user_data_dir()
	var catalog := CardCatalog.new()
	root.add_child(catalog)
	_table = TableView.new()
	_table.catalog = catalog
	root.add_child(_table)
	catalog.info_ready.connect(func(_n: PackedStringArray) -> void: _table.refresh_textures())
	catalog.texture_ready.connect(_table.on_texture_ready)
	var state: Dictionary = _state(0)
	_table.apply_state(state)
	await create_timer(5.0).timeout
	_table.apply_state(state)
	# Pode jogar na mão e num terreno; o dragão do oponente como alvo (os destaques não mudam aqui, só para comparar).
	_table.highlight_roles({"actionable": [50, 51, 1], "selectable": [11]}, false)
	await create_timer(1.5).timeout
	await _shot("mesa")
	var cam: Camera3D = _table.camera
	var home: Transform3D = cam.global_transform
	# As suas criaturas de perto: arte, força/resistência e selos.
	var bears: CardNode = _table.card_node(3)
	cam.look_at_from_position(bears.global_position + Vector3(0.3, 2.3, 1.55), bears.global_position + Vector3(0.3, 0, 0))
	await _shot("perto")
	# Rasante: a luz batendo na carta deitada (verniz, borda, sombra) e o feltro.
	cam.look_at_from_position(bears.global_position + Vector3(-0.6, 0.75, 1.6), bears.global_position + Vector3(0.4, 0, -0.2))
	await _shot("rasante")
	# Os versos: a mão do oponente e o grimório dele.
	var library: Vector3 = _table.library_position(1)
	cam.look_at_from_position(library + Vector3(-0.6, 2.4, 1.6), library + Vector3(-0.6, 0, 0))
	await _shot("verso")
	cam.global_transform = home
	# Efeitos somando luz em cima das cartas: nada deve virar uma mancha branca.
	var dragon: CardNode = _table.card_node(11)
	Fx.burst(_table, bears.global_position + Vector3(0, 0.3, 0), Color(1.0, 0.5, 0.15), 90)
	Fx.light(_table, bears.global_position + Vector3(0, 0.8, 0), Color(1.0, 0.55, 0.2), 4.0, 4.0, 1.0)
	Fx.pillar(_table, dragon.global_position, Color(1.0, 0.85, 0.35))
	Fx.ring(_table, Vector3(2.0, 0.02, 0.9), Color(0.4, 0.7, 1.0), 1.6, 1.0)
	await create_timer(0.18).timeout
	await _shot("efeitos")
	await create_timer(2.0).timeout
	# A vez do oponente: a luz da mesa vai para o lado dele.
	_table.apply_state(_state(1))
	await create_timer(2.5).timeout
	await _shot("vez-oponente")
	print("pronto")
	quit()


func _shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	var path: String = _folder.path_join("%s.png" % name)
	root.get_texture().get_image().save_png(path)
	print(path)


func _state(active: int) -> Dictionary:
	var hand: Array = []
	for entry: Array in [[50, "Lightning Bolt", "{R}"], [51, "Llanowar Elves", "{G}"], [52, "Counterspell", "{U}{U}"], [53, "Serra Angel", "{3}{W}{W}"], [54, "Swords to Plowshares", "{W}"]]:
		hand.append({"id": entry[0], "name": entry[1], "manaCost": entry[2], "controller": 0})
	var field: Array = [
		{"id": 1, "name": "Mountain", "typeLine": "Basic Land — Mountain", "land": true, "controller": 0},
		{"id": 2, "name": "Forest", "typeLine": "Basic Land — Forest", "land": true, "controller": 0},
		{"id": 4, "name": "Plains", "typeLine": "Basic Land — Plains", "land": true, "controller": 0, "tapped": true},
		{"id": 3, "name": "Grizzly Bears", "manaCost": "{1}{G}", "typeLine": "Creature — Bear", "creature": true, "power": 2, "toughness": 2, "controller": 0, "counters": {"P1P1": 1}},
		{"id": 5, "name": "Serra Angel", "manaCost": "{3}{W}{W}", "typeLine": "Creature — Angel", "creature": true, "power": 4, "toughness": 4, "controller": 0, "keywords": ["FLYING", "VIGILANCE"]},
		{"id": 6, "name": "Sol Ring", "manaCost": "{1}", "typeLine": "Artifact", "controller": 0}]
	return {"type": "state", "you": 0, "turn": 5, "phase": "MAIN1", "activePlayer": active, "stack": [], "combat": [],
		"input": {"gen": 1, "selectable": [], "actionable": []}, "events": [], "gameOver": false,
		"players": [
			{"id": 0, "name": "Você", "life": 20, "sleeve": 1, "library": 30, "hand": hand, "handCount": hand.size(), "graveyard": [], "exile": [], "battlefield": field},
			{"id": 1, "name": "Oponente", "life": 20, "sleeve": 2, "library": 30, "handCount": 4, "graveyard": [], "exile": [], "battlefield": [
				{"id": 11, "name": "Shivan Dragon", "manaCost": "{4}{R}{R}", "typeLine": "Creature — Dragon", "creature": true, "power": 5, "toughness": 5, "controller": 1},
				{"id": 12, "name": "Island", "typeLine": "Basic Land — Island", "land": true, "controller": 1},
				{"id": 13, "name": "Island", "typeLine": "Basic Land — Island", "land": true, "controller": 1}]}]}
